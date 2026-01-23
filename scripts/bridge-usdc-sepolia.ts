/**
 * Bridge USDC from Sepolia to Base Sepolia using CCTP
 *
 * This script handles the complete bridge flow:
 * 1. Burns USDC on Sepolia
 * 2. Waits for Circle attestation (~15-30 min on testnet)
 * 3. Mints USDC on Base Sepolia
 *
 * Prerequisites:
 * 1. Set PRIVATE_KEY in .env
 * 2. Set SEPOLIA_RPC_URL in .env (or uses public RPC)
 * 3. Set BASE_SEPOLIA_RPC_URL in .env (or uses public RPC)
 * 4. Have testnet USDC on Sepolia (get from https://faucet.circle.com/)
 * 5. Have testnet ETH on Base Sepolia for gas (get from https://www.alchemy.com/faucets/base-sepolia)
 *
 * Run: npx tsx scripts/bridge-usdc-sepolia.ts
 *
 * Note: CCTP only supports USDC bridging, not ETH.
 */

import 'dotenv/config';
import {
  AgentWallet,
  USDC,
  CCTPBridge,
  RPCClient,
  EOA,
  type BridgeUSDCResult,
} from '../src/index.js';
import type { Hex } from '../src/core/types.js';

// Configuration
const AMOUNT_USDC = '0.5'; // 0.5 USDC (use small amount for testing)
const DESTINATION_CHAIN_ID = 84532; // Base Sepolia
const ATTESTATION_POLL_INTERVAL = 30000; // 30 seconds
const ATTESTATION_TIMEOUT = 45 * 60 * 1000; // 45 minutes max wait

// Sepolia testnet USDC faucet: https://faucet.circle.com/

async function main(): Promise<void> {
  // Load environment variables
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY not found in .env');
    console.error('Create a .env file with: PRIVATE_KEY=0x...');
    process.exit(1);
  }

  const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
  const baseSepoliaRpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';

  console.log('=== CCTP USDC Bridge: Sepolia -> Base Sepolia ===\n');

  // Create wallet for Sepolia
  const wallet = AgentWallet.create({
    privateKey,
    rpcUrl: sepoliaRpcUrl,
    limits: {
      bridge: {
        perTransactionUSD: 1000,
        perDayUSD: 5000,
        allowedDestinations: [84532, 11155420, 421614], // Base Sepolia, OP Sepolia, Arb Sepolia
      },
    },
  });

  const address = wallet.address;
  console.log(`Wallet address: ${address}`);

  // Check USDC balance on Sepolia
  console.log('\nChecking USDC balance on Sepolia...');
  const usdcBalance = await wallet.getStablecoinBalance(USDC);
  console.log(`USDC balance: ${usdcBalance.formatted} USDC`);

  if (parseFloat(usdcBalance.formatted) < parseFloat(AMOUNT_USDC)) {
    console.error(`\nInsufficient USDC balance!`);
    console.error(`Need: ${AMOUNT_USDC} USDC`);
    console.error(`Have: ${usdcBalance.formatted} USDC`);
    console.error('\nGet testnet USDC from: https://faucet.circle.com/');
    process.exit(1);
  }

  // Check ETH balance on Base Sepolia for completion
  console.log('\nChecking ETH balance on Base Sepolia for gas...');
  const baseSepoliaRpc = new RPCClient(baseSepoliaRpcUrl);
  const baseSepoliaBalance = await baseSepoliaRpc.getBalance(address);
  const baseSepoliaEth = Number(baseSepoliaBalance) / 1e18;
  console.log(`ETH balance on Base Sepolia: ${baseSepoliaEth.toFixed(6)} ETH`);

  if (baseSepoliaBalance < 100000000000000n) { // 0.0001 ETH minimum
    console.error('\nInsufficient ETH on Base Sepolia for gas!');
    console.error('Get Base Sepolia ETH from: https://www.alchemy.com/faucets/base-sepolia');
    process.exit(1);
  }

  // Preview the bridge
  console.log('\nPreviewing bridge...');
  const preview = await wallet.previewBridgeUSDC({
    amount: AMOUNT_USDC,
    destinationChainId: DESTINATION_CHAIN_ID,
  });

  console.log(`Source chain: ${preview.sourceChain.name} (${String(preview.sourceChain.id)})`);
  console.log(`Destination chain: ${preview.destinationChain.name} (${String(preview.destinationChain.id)})`);
  console.log(`Amount: ${preview.amount.formatted} USDC`);
  console.log(`Needs approval: ${String(preview.needsApproval)}`);
  console.log(`Estimated time: ${preview.estimatedTime}`);

  if (!preview.canBridge) {
    console.error('\nCannot bridge:');
    preview.blockers.forEach((b) => console.error(`  - ${b}`));
    process.exit(1);
  }

  // Execute the bridge (burn on Sepolia)
  console.log('\n--- Step 1: Initiating Bridge (Burn on Sepolia) ---\n');
  console.log('This will:');
  console.log('  1. Approve USDC (if needed)');
  console.log('  2. Burn USDC on Sepolia');
  console.log('');

  let result: BridgeUSDCResult;
  try {
    result = await wallet.bridgeUSDC({
      amount: AMOUNT_USDC,
      destinationChainId: DESTINATION_CHAIN_ID,
    });
  } catch (error) {
    console.error('Bridge initiation failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log('\n=== Burn Transaction Successful ===\n');
  console.log(`Burn TX: ${result.burnTxHash}`);
  console.log(`Message Hash: ${result.messageHash}`);
  console.log(`Nonce: ${String(result.nonce)}`);
  console.log(`Amount: ${result.amount.formatted} USDC`);
  console.log(`Recipient: ${result.recipient}`);
  console.log(`\nView on Etherscan: https://sepolia.etherscan.io/tx/${result.burnTxHash}`);

  // Wait for attestation
  console.log('\n--- Step 2: Waiting for Circle Attestation ---');
  console.log('This may take 15-30 minutes on testnet...\n');

  const attestation = await waitForAttestation(wallet, result.messageHash);

  if (!attestation) {
    console.error('\nAttestation timeout or failed. You can complete the bridge manually later.');
    console.log('\nSave these for manual completion:');
    console.log(`Message bytes: ${result.messageBytes}`);
    console.log(`Message hash: ${result.messageHash}`);
    process.exit(1);
  }

  // Complete the bridge (mint on Base Sepolia)
  console.log('\n--- Step 3: Completing Bridge (Mint on Base Sepolia) ---\n');

  try {
    const key = privateKey.startsWith('0x') ? privateKey as Hex : `0x${privateKey}` as Hex;
    const account = EOA.fromPrivateKey(key);
    const sepoliaRpc = new RPCClient(sepoliaRpcUrl);

    const bridge = new CCTPBridge({
      sourceRpc: sepoliaRpc,
      account,
      testnet: true,
    });

    const completionResult = await bridge.completeBridge(
      result.messageBytes,
      attestation,
      baseSepoliaRpc
    );

    console.log('=== Bridge Completed Successfully! ===\n');
    console.log(`Mint TX: ${completionResult.mintTxHash}`);
    console.log(`Amount: ${completionResult.amount.formatted} USDC`);
    console.log(`Recipient: ${completionResult.recipient}`);
    console.log(`\nView on BaseScan: https://sepolia.basescan.org/tx/${completionResult.mintTxHash}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if already processed
    if (errorMessage.includes('already been processed')) {
      console.log('=== Bridge Already Completed ===');
      console.log('The message has already been processed on Base Sepolia.');
    } else {
      console.error('Bridge completion failed:', errorMessage);
      console.log('\nYou can try completing manually with:');
      console.log(`Message bytes: ${result.messageBytes}`);
      console.log(`Attestation: ${attestation}`);
      process.exit(1);
    }
  }
}

/**
 * Wait for attestation with polling
 */
async function waitForAttestation(
  wallet: AgentWallet,
  messageHash: Hex
): Promise<Hex | null> {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < ATTESTATION_TIMEOUT) {
    try {
      const status = await wallet.getBridgeStatus(messageHash);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (status.status !== lastStatus) {
        console.log(`[${String(elapsed)}s] Status: ${status.status}`);
        lastStatus = status.status;
      }

      if (status.status === 'attestation_ready' && status.attestation) {
        console.log('\n=== Attestation Ready! ===');
        return status.attestation;
      }

      if (status.status === 'failed') {
        console.error('\nAttestation failed:', status.error);
        return null;
      }

    } catch (error) {
      console.error('Error checking status:', error instanceof Error ? error.message : String(error));
    }

    // Wait before next poll
    await sleep(ATTESTATION_POLL_INTERVAL);
  }

  console.error('\nAttestation timeout reached.');
  return null;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

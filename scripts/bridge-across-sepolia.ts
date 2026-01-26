/**
 * Bridge USDC from Sepolia to Base Sepolia using Across Protocol
 *
 * This script demonstrates the Across bridging flow:
 * 1. Get a quote from Across API
 * 2. Preview the bridge with validation
 * 3. Execute the deposit on source chain
 * 4. Wait for relayer fill on destination chain (2-5 minutes)
 *
 * Prerequisites:
 * 1. Set PRIVATE_KEY in .env
 * 2. Set SEPOLIA_RPC_URL in .env (or uses public RPC)
 * 3. Have testnet USDC on Sepolia (get from https://faucet.circle.com/)
 * 4. Have testnet ETH on Sepolia for gas
 *
 * Run: npx tsx scripts/bridge-across-sepolia.ts
 */

import 'dotenv/config';
import {
  RPCClient,
  EOA,
  USDC,
} from '../src/index.js';
import { AcrossBridge, createAcrossBridge } from '../src/bridge/across/index.js';
import { formatStablecoinAmount, parseStablecoinAmount } from '../src/stablecoins/index.js';
import type { Address, Hex } from '../src/core/types.js';

// Configuration
const AMOUNT_USDC = '1'; // 1 USDC to bridge
const DESTINATION_CHAIN_ID = 84532; // Base Sepolia
const FILL_POLL_INTERVAL = 10000; // 10 seconds
const FILL_TIMEOUT = 10 * 60 * 1000; // 10 minutes max wait

// Sepolia testnet USDC faucet: https://faucet.circle.com/

async function main(): Promise<void> {
  console.log('=== Across Bridge Demo: Sepolia -> Base Sepolia ===\n');

  // Load environment variables
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY not found in .env');
    console.error('Create a .env file with: PRIVATE_KEY=0x...');
    process.exit(1);
  }

  const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';

  // Create RPC client and account
  const rpc = new RPCClient(sepoliaRpcUrl);
  const key = privateKey.startsWith('0x') ? (privateKey as Hex) : (`0x${privateKey}` as Hex);
  const account = EOA.fromPrivateKey(key);

  console.log(`Wallet address: ${account.address}`);

  // Check chain ID
  const chainId = await rpc.getChainId();
  console.log(`Connected to chain: ${chainId}`);

  if (chainId !== 11155111) {
    console.error('Error: Not connected to Sepolia (chain ID 11155111)');
    process.exit(1);
  }

  // Check ETH balance for gas
  const ethBalance = await rpc.getBalance(account.address);
  const ethFormatted = Number(ethBalance) / 1e18;
  console.log(`ETH balance: ${ethFormatted.toFixed(6)} ETH`);

  if (ethBalance < 10000000000000000n) {
    // 0.01 ETH minimum
    console.error('\nInsufficient ETH for gas!');
    console.error('Get Sepolia ETH from: https://sepoliafaucet.com/');
    process.exit(1);
  }

  // Check USDC balance
  console.log('\nChecking USDC balance...');
  const usdcBalance = await getTokenBalance(
    rpc,
    '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address, // Sepolia USDC
    account.address
  );
  const usdcFormatted = formatStablecoinAmount(usdcBalance, USDC);
  console.log(`USDC balance: ${usdcFormatted} USDC`);

  const amountRaw = parseStablecoinAmount(AMOUNT_USDC, USDC);
  if (usdcBalance < amountRaw) {
    console.error(`\nInsufficient USDC balance!`);
    console.error(`Need: ${AMOUNT_USDC} USDC`);
    console.error(`Have: ${usdcFormatted} USDC`);
    console.error('\nGet testnet USDC from: https://faucet.circle.com/');
    process.exit(1);
  }

  // Create Across bridge (testnet auto-detected from chain ID)
  const bridge = createAcrossBridge({
    sourceRpc: rpc,
    account,
  });

  // Step 1: Check if route is supported
  console.log('\n--- Step 1: Checking Route Support ---\n');

  const isSupported = bridge.isRouteSupported(chainId, DESTINATION_CHAIN_ID, 'USDC');
  console.log(`Route supported: ${isSupported}`);

  if (!isSupported) {
    console.error('Route not supported!');
    console.log('Supported chains:', bridge.getSupportedChains());
    process.exit(1);
  }

  // Step 2: Get quote
  console.log('\n--- Step 2: Getting Quote ---\n');

  const quote = await bridge.getQuote({
    token: USDC,
    amount: AMOUNT_USDC,
    destinationChainId: DESTINATION_CHAIN_ID,
  });

  console.log('Quote received:');
  console.log(`  Input amount: ${formatStablecoinAmount(quote.inputAmount, USDC)} USDC`);
  console.log(`  Output amount: ${formatStablecoinAmount(quote.outputAmount, USDC)} USDC`);
  console.log(`  Total fee: ${formatStablecoinAmount(quote.totalFee, USDC)} USDC (${(quote.feeBps / 100).toFixed(2)}%)`);
  console.log(`  Expected fill time: ~${quote.expectedFillTimeSec} seconds`);
  console.log(`  Amount too low: ${quote.isAmountTooLow}`);

  if (quote.isAmountTooLow) {
    console.error(`\nAmount too low! Minimum: ${formatStablecoinAmount(quote.limits.minDeposit, USDC)} USDC`);
    process.exit(1);
  }

  // Step 3: Preview bridge
  console.log('\n--- Step 3: Previewing Bridge ---\n');

  const preview = await bridge.previewBridge({
    token: USDC,
    amount: AMOUNT_USDC,
    destinationChainId: DESTINATION_CHAIN_ID,
  });

  console.log(`Can bridge: ${preview.canBridge}`);
  console.log(`Source: ${preview.sourceChain.name} (${preview.sourceChain.id})`);
  console.log(`Destination: ${preview.destinationChain.name} (${preview.destinationChain.id})`);
  console.log(`Amount: ${preview.amount.formatted} USDC`);
  console.log(`Balance: ${preview.balance.formatted} USDC`);
  console.log(`Needs approval: ${preview.needsApproval}`);

  if (!preview.canBridge) {
    console.error('\nCannot bridge:');
    preview.blockers.forEach((b) => console.error(`  - ${b}`));
    process.exit(1);
  }

  // Step 4: Execute bridge
  console.log('\n--- Step 4: Initiating Bridge ---\n');
  console.log('This will:');
  console.log('  1. Approve USDC spending (if needed)');
  console.log('  2. Call depositV3 on the SpokePool contract');
  console.log('  3. Wait for transaction confirmation');
  console.log('\nExecuting...');

  const result = await bridge.initiateBridge({
    token: USDC,
    amount: AMOUNT_USDC,
    destinationChainId: DESTINATION_CHAIN_ID,
  });

  console.log('\n=== Deposit Successful! ===\n');
  console.log(`Transaction hash: ${result.burnTxHash}`);
  console.log(`Deposit ID: ${Number(result.nonce)}`);
  console.log(`Amount: ${result.amount.formatted} USDC`);
  console.log(`Recipient: ${result.recipient}`);
  console.log(`Source chain: ${result.sourceChainId}`);
  console.log(`Destination chain: ${result.destinationChainId}`);
  console.log(`Estimated time: ${result.estimatedTime}`);
  console.log(`\nView on Etherscan: https://sepolia.etherscan.io/tx/${result.burnTxHash}`);

  // Step 5: Wait for fill
  console.log('\n--- Step 5: Waiting for Relayer Fill ---\n');
  console.log('Across relayers will pick up your deposit and fill it on the destination chain.');
  console.log('This typically takes 2-5 minutes on testnets.\n');

  const fillTxHash = await waitForFill(bridge, result.messageHash);

  if (fillTxHash) {
    console.log('\n=== Bridge Completed! ===\n');
    console.log(`Fill transaction: ${fillTxHash}`);
    console.log(`\nView on BaseScan: https://sepolia.basescan.org/tx/${fillTxHash}`);
  } else {
    console.log('\n=== Fill Timeout ===\n');
    console.log('The deposit was successful but we did not see the fill within the timeout.');
    console.log('This can happen on testnets. Your funds are safe.');
    console.log('\nYou can check the status manually:');
    console.log(`  Deposit ID: ${Number(result.nonce)}`);
    console.log(`  Deposit TX: ${result.burnTxHash}`);
    console.log('  Or check: https://testnet.across.to/');
  }
}

/**
 * Wait for the relayer to fill the deposit on the destination chain
 */
async function waitForFill(bridge: AcrossBridge, depositIdHex: Hex): Promise<Hex | null> {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < FILL_TIMEOUT) {
    try {
      const status = await bridge.getStatus(depositIdHex);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (status.status !== lastStatus) {
        console.log(`[${elapsed}s] Status: ${status.status}`);
        lastStatus = status.status;
      }

      if (status.status === 'completed' && status.attestation) {
        return status.attestation;
      }

      if (status.status === 'failed') {
        console.error('\nBridge failed:', status.error);
        return null;
      }
    } catch (error) {
      // API errors are expected, just log them
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[${elapsed}s] Checking status... (deposit may not be indexed yet)`);
    }

    await sleep(FILL_POLL_INTERVAL);
  }

  return null;
}

/**
 * Get ERC20 token balance
 */
async function getTokenBalance(rpc: RPCClient, tokenAddress: Address, owner: Address): Promise<bigint> {
  const balanceOfData = `0x70a08231000000000000000000000000${owner.slice(2)}` as Hex;

  const result = await rpc.call({
    to: tokenAddress,
    data: balanceOfData,
  });

  return BigInt(result);
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

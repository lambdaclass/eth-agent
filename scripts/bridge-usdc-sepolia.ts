/**
 * Bridge USDC from Sepolia to Base Sepolia using the BridgeRouter
 *
 * This script demonstrates the new unified bridge API:
 * 1. Compare available routes
 * 2. Preview the bridge with validation
 * 3. Execute with auto-selected best route
 * 4. Track status using unified tracking ID
 *
 * Prerequisites:
 * 1. Set PRIVATE_KEY in .env
 * 2. Set SEPOLIA_RPC_URL in .env (or uses public RPC)
 * 3. Set BASE_SEPOLIA_RPC_URL in .env (or uses public RPC)
 * 4. Have testnet USDC on Sepolia (get from https://faucet.circle.com/)
 * 5. Have testnet ETH on Base Sepolia for gas (get from https://www.alchemy.com/faucets/base-sepolia)
 *
 * Run: npx tsx scripts/bridge-usdc-sepolia.ts
 */

import 'dotenv/config';
import {
  AgentWallet,
  USDC,
  CCTPBridge,
  RPCClient,
  EOA,
  type BridgeResult,
} from '../src/index.js';
import type { Hex } from '../src/core/types.js';

// Configuration
const AMOUNT_USDC = '1'; // 1 USDC
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

  console.log('=== BridgeRouter Demo: Sepolia -> Base Sepolia ===\n');

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

  // Check minimum bridge amount
  const minAmount = wallet.getMinBridgeAmount(USDC);
  console.log(`Minimum bridge amount: $${minAmount.usd.toFixed(2)} (${minAmount.formatted} USDC)`);

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

  // Step 1: Compare available routes
  console.log('\n--- Step 1: Comparing Bridge Routes ---\n');
  const routes = await wallet.compareBridgeRoutes({
    token: USDC,
    amount: AMOUNT_USDC,
    destinationChainId: DESTINATION_CHAIN_ID,
  });

  console.log(`Available protocols: ${routes.quotes.length}`);
  for (const quote of routes.quotes) {
    console.log(`  - ${quote.protocol}: $${quote.fee.totalUSD.toFixed(4)} fee, ${quote.estimatedTime.display}`);
  }

  if (routes.recommended) {
    console.log(`\nRecommended: ${routes.recommended.protocol}`);
    console.log(`Reason: ${routes.recommendation.reason ?? 'Best overall option'}`);
  }

  // Step 2: Preview the bridge with full validation
  console.log('\n--- Step 2: Previewing Bridge ---\n');
  const preview = await wallet.previewBridgeWithRouter({
    token: USDC,
    amount: AMOUNT_USDC,
    destinationChainId: DESTINATION_CHAIN_ID,
  });

  console.log(`Can bridge: ${String(preview.canBridge)}`);
  console.log(`Source chain: ${preview.sourceChain.name} (${String(preview.sourceChain.id)})`);
  console.log(`Destination chain: ${preview.destinationChain.name} (${String(preview.destinationChain.id)})`);
  console.log(`Amount: ${preview.amount.formatted} USDC`);
  console.log(`Balance: ${preview.balance.formatted} USDC`);
  console.log(`Needs approval: ${String(preview.needsApproval)}`);

  if (preview.quote) {
    console.log(`Selected protocol: ${preview.quote.protocol}`);
    console.log(`Estimated time: ${preview.quote.estimatedTime.display}`);
    console.log(`Fee: $${preview.quote.fee.totalUSD.toFixed(4)}`);
  }

  if (!preview.canBridge) {
    console.error('\nCannot bridge:');
    preview.blockers.forEach((b) => console.error(`  - ${b}`));
    process.exit(1);
  }

  // Step 3: Execute the bridge using the new unified API
  console.log('\n--- Step 3: Executing Bridge ---\n');
  console.log('Using wallet.bridge() with auto-route selection...');

  let result: BridgeResult;
  try {
    result = await wallet.bridge({
      token: USDC,
      amount: AMOUNT_USDC,
      destinationChainId: DESTINATION_CHAIN_ID,
      preference: { priority: 'cost' }, // Prefer lowest cost
    });
  } catch (error) {
    console.error('Bridge initiation failed:', error instanceof Error ? error.message : String(error));

    // Check for recovery info if it's a bridge error
    const anyError = error as { recovery?: { nextSteps?: string[] } };
    if (anyError.recovery?.nextSteps) {
      console.error('\nRecovery steps:');
      anyError.recovery.nextSteps.forEach((step) => console.error(`  - ${step}`));
    }
    process.exit(1);
  }

  console.log('\n=== Bridge Initiated Successfully ===\n');
  console.log(`Protocol: ${result.protocol}`);
  console.log(`Tracking ID: ${result.trackingId}`);
  console.log(`Source TX: ${result.sourceTxHash}`);
  console.log(`Amount: ${result.amount.formatted} USDC`);
  console.log(`Fee: $${result.fee.usd.toFixed(4)}`);
  console.log(`Recipient: ${result.recipient}`);
  console.log(`Estimated time: ${result.estimatedTime.display}`);
  console.log(`\nView on Etherscan: https://sepolia.etherscan.io/tx/${result.sourceTxHash}`);
  console.log(`\nRemaining daily limit: ${result.limits.remaining.daily}`);

  // Step 4: Wait for attestation using the tracking ID
  console.log('\n--- Step 4: Tracking Bridge Status ---');
  console.log(`Using tracking ID: ${result.trackingId}`);
  console.log('Waiting for attestation (15-30 minutes on testnet)...\n');

  const attestation = await waitForAttestationByTrackingId(wallet, result.trackingId);

  if (!attestation) {
    console.error('\nAttestation timeout or failed. You can complete the bridge manually later.');
    console.log('\nSave these for manual completion:');
    console.log(`Tracking ID: ${result.trackingId}`);
    console.log(`Message bytes: ${result.protocolData.messageBytes}`);
    console.log(`Message hash: ${result.protocolData.messageHash}`);
    process.exit(1);
  }

  // Step 5: Complete the bridge (mint on Base Sepolia)
  console.log('\n--- Step 5: Completing Bridge (Mint on Base Sepolia) ---\n');

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
      result.protocolData.messageBytes as Hex,
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
      console.log(`Message bytes: ${result.protocolData.messageBytes}`);
      console.log(`Attestation: ${attestation}`);
      process.exit(1);
    }
  }
}

/**
 * Wait for attestation using the unified tracking ID
 */
async function waitForAttestationByTrackingId(
  wallet: AgentWallet,
  trackingId: string
): Promise<Hex | null> {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < ATTESTATION_TIMEOUT) {
    try {
      // Use the new tracking ID-based status method
      const status = await wallet.getBridgeStatusByTrackingId(trackingId);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (status.status !== lastStatus) {
        console.log(`[${String(elapsed)}s] Status: ${status.message} (${status.progress}%)`);
        lastStatus = status.status;
      }

      if (status.status === 'attestation_ready') {
        console.log('\n=== Attestation Ready! ===');
        // For CCTP, we need to fetch the attestation separately
        // since the status doesn't include it directly
        try {
          const attestation = await wallet.waitForBridgeByTrackingId(trackingId, {
            timeout: 5000, // Short timeout since it should be ready
          });
          return attestation;
        } catch {
          // If waitForBridge fails, try to get it from the legacy method
          const messageHash = trackingId.split('_').pop() as Hex;
          const legacyStatus = await wallet.getBridgeStatus(messageHash);
          if (legacyStatus.attestation) {
            return legacyStatus.attestation;
          }
        }
      }

      if (status.status === 'completed') {
        console.log('\n=== Bridge Already Completed! ===');
        return null;
      }

      if (status.status === 'failed') {
        console.error('\nBridge failed:', status.error);
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

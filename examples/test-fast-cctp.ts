/**
 * Test Fast CCTP Bridge
 *
 * This script tests the fast CCTP bridge functionality.
 * It bridges USDC from Sepolia to Base Sepolia using fast mode.
 *
 * Prerequisites:
 * - Set ETH_PRIVATE_KEY environment variable (testnet key with USDC on Sepolia)
 * - Have testnet USDC on Sepolia (get from Circle faucet: https://faucet.circle.com/)
 *
 * Run: npx tsx examples/test-fast-cctp.ts
 */

import { AgentWallet, USDC, RPCClient, getStablecoinAddress, formatStablecoinAmount } from '../src/index.js';

// Configuration
const CONFIG = {
  // Source chain: Sepolia
  sourceRpc: process.env.RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',

  // Destination chain: Base Sepolia
  destinationChainId: 84532,
  destinationRpc: process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org',

  // Amount to bridge (small amount for testing)
  amount: process.env.BRIDGE_AMOUNT ?? '1', // 1 USDC

  // Enable fast mode
  fast: true,
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: number, message: string): void {
  console.log(`\n${colors.cyan}[Step ${step}]${colors.reset} ${colors.bold}${message}${colors.reset}`);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message: string): void {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(label: string, value: string): void {
  console.log(`  ${colors.dim}${label}:${colors.reset} ${value}`);
}

async function main(): Promise<void> {
  log('\n========================================', colors.cyan);
  log('  Fast CCTP Bridge Test', colors.cyan);
  log('========================================\n', colors.cyan);

  // Check environment
  if (!process.env.ETH_PRIVATE_KEY) {
    logError('ETH_PRIVATE_KEY environment variable is required');
    log('\nGet testnet USDC from: https://faucet.circle.com/', colors.dim);
    process.exit(1);
  }

  // Create wallet with fast mode enabled
  logStep(1, 'Creating wallet with fast CCTP mode');

  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY,
    rpcUrl: CONFIG.sourceRpc,
    bridge: {
      fast: CONFIG.fast,
    },
    limits: {
      bridge: {
        perTransactionUSD: 1000,
        perDayUSD: 5000,
      },
    },
  });

  logSuccess('Wallet created');
  logInfo('Address', wallet.address);
  logInfo('Fast mode', wallet.isFastBridgeEnabled() ? 'ENABLED' : 'disabled');

  // Register destination RPC for status checking
  await wallet.registerDestinationRpc(CONFIG.destinationChainId, CONFIG.destinationRpc);
  logSuccess('Destination RPC registered');

  // Check source chain
  logStep(2, 'Checking source chain');
  const capabilities = wallet.getCapabilities();
  const chainId = capabilities.network.chainId;
  logInfo('Chain ID', String(chainId));
  logInfo('Expected', '11155111 (Sepolia)');

  // Note: chainId might be cached as 1 initially, so we also check via preview later
  logSuccess('Wallet initialized');

  // Check USDC balance
  logStep(3, 'Checking USDC balance');
  const balance = await wallet.getStablecoinBalance(USDC);
  logInfo('USDC Balance', `${balance.formatted} USDC`);

  const requiredAmount = parseFloat(CONFIG.amount);
  if (parseFloat(balance.formatted) < requiredAmount) {
    logError(`Insufficient USDC balance. Need at least ${CONFIG.amount} USDC`);
    log('\nGet testnet USDC from: https://faucet.circle.com/', colors.dim);
    process.exit(1);
  }
  logSuccess('Sufficient balance');

  // Get fast transfer fee quote
  logStep(4, 'Getting fast transfer fee quote');
  try {
    const feeQuote = await wallet.getFastBridgeFee(
      CONFIG.destinationChainId,
      BigInt(Math.floor(requiredAmount * 1_000_000)) // Convert to raw USDC
    );
    logInfo('Fee percentage', `${(feeQuote.feePercentage * 100).toFixed(4)}%`);
    logInfo('Fee basis points', String(feeQuote.feeBasisPoints));
    if (feeQuote.maxFeeFormatted) {
      logInfo('Max fee', `${feeQuote.maxFeeFormatted} USDC`);
    }
    logSuccess('Fee quote received');
  } catch (err) {
    logError(`Failed to get fee quote: ${(err as Error).message}`);
    log('Continuing anyway...', colors.dim);
  }

  // Preview bridge
  logStep(5, 'Previewing bridge');
  const preview = await wallet.previewBridgeWithRouter({
    token: USDC,
    amount: CONFIG.amount,
    destinationChainId: CONFIG.destinationChainId,
  });

  logInfo('Can bridge', preview.canBridge ? 'Yes' : 'No');
  logInfo('Source chain', `${preview.sourceChain.name} (${preview.sourceChain.id})`);
  logInfo('Destination', `${preview.destinationChain.name} (${preview.destinationChain.id})`);
  logInfo('Amount', `${preview.amount.formatted} USDC`);

  if (preview.quote) {
    logInfo('Protocol', preview.quote.protocol);
    logInfo('Estimated time', preview.quote.estimatedTime.display);
    logInfo('Gas fee', `$${preview.quote.fee.totalUSD?.toFixed(2) ?? 'N/A'}`);
  }

  if (!preview.canBridge) {
    logError('Cannot bridge:');
    for (const blocker of preview.blockers) {
      log(`  - ${blocker}`, colors.red);
    }
    process.exit(1);
  }
  logSuccess('Bridge preview OK');

  // Confirm before proceeding
  log('\n' + '='.repeat(50), colors.yellow);
  log('Ready to bridge:', colors.yellow);
  log(`  ${CONFIG.amount} USDC from Sepolia to Base Sepolia`, colors.yellow);
  log(`  Fast mode: ${CONFIG.fast ? 'ENABLED (10-30 seconds)' : 'disabled (15-30 minutes)'}`, colors.yellow);
  log('='.repeat(50) + '\n', colors.yellow);

  // Check for --yes flag to skip confirmation
  const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');

  if (!skipConfirmation) {
    log('Press Ctrl+C to cancel, or wait 5 seconds to continue...', colors.dim);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Execute bridge
  logStep(6, 'Executing bridge');
  const startTime = Date.now();

  let result;
  try {
    result = await wallet.bridge({
      token: USDC,
      amount: CONFIG.amount,
      destinationChainId: CONFIG.destinationChainId,
    });
  } catch (err) {
    logError(`Bridge failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const burnTime = Date.now() - startTime;
  logSuccess(`Bridge initiated in ${(burnTime / 1000).toFixed(1)}s`);
  logInfo('Protocol', result.protocol);
  logInfo('Tracking ID', result.trackingId);
  logInfo('Source TX', result.sourceTxHash);
  logInfo('Amount', `${result.amount.formatted} USDC`);
  logInfo('Estimated time', result.estimatedTime.display);

  // Extract burn tx hash for fast attestation
  const burnTxHash = result.sourceTxHash;

  // Wait for attestation using fast mode
  logStep(7, 'Waiting for fast attestation');
  log('This should take 10-30 seconds with fast mode...', colors.dim);

  const attestationStartTime = Date.now();
  let attestationResult: { attestation: `0x${string}`; message?: `0x${string}`; messageHash?: `0x${string}` };

  try {
    // Use fast attestation method
    attestationResult = await wallet.waitForFastBridgeAttestation(burnTxHash);
    const attestationTime = Date.now() - attestationStartTime;

    logSuccess(`Attestation received in ${(attestationTime / 1000).toFixed(1)}s!`);
    logInfo('Attestation', attestationResult.attestation.slice(0, 66) + '...');

    if (attestationResult.messageHash) {
      logInfo('Message hash', attestationResult.messageHash);
    }
  } catch (err) {
    logError(`Attestation failed: ${(err as Error).message}`);
    log('\nYou can check the status manually using the tracking ID:', colors.dim);
    log(`  Tracking ID: ${result.trackingId}`, colors.dim);
    process.exit(1);
  }

  // Complete bridge on destination chain
  logStep(8, 'Completing bridge on destination chain');
  log('Calling receiveMessage on destination to mint USDC...', colors.dim);

  try {
    // For fast attestations, prefer the message from the attestation result
    // as it's what Circle actually signed. Fall back to the burn result's message.
    const messageBytes = attestationResult.message ?? result.protocolData?.messageBytes;
    if (!messageBytes) {
      throw new Error('Missing messageBytes from bridge or attestation result');
    }

    logInfo('Using message', messageBytes.slice(0, 66) + '...');

    const completion = await wallet.completeBridge({
      trackingId: result.trackingId,
      attestation: attestationResult.attestation,
      messageBytes: messageBytes as `0x${string}`,
    });

    logSuccess('Bridge completed on destination!');
    logInfo('Mint TX', completion.mintTxHash);
    logInfo('Amount minted', `${completion.amount.formatted} USDC`);
    logInfo('Recipient', completion.recipient);
  } catch (err) {
    logError(`Bridge completion failed: ${(err as Error).message}`);
    log('\nThe attestation was received but USDC was not minted on destination.', colors.dim);
    log('You may need to manually call receiveMessage on the destination chain.', colors.dim);
  }

  // Check final status
  logStep(9, 'Checking bridge status');
  try {
    const status = await wallet.getBridgeStatusByTrackingId(result.trackingId);
    logInfo('Status', status.status);
    logInfo('Progress', `${status.progress}%`);
    logInfo('Message', status.message);
    logSuccess('Bridge status retrieved');
  } catch (err) {
    logError(`Status check failed: ${(err as Error).message}`);
  }

  // Check destination balance
  logStep(10, 'Checking destination balance');
  try {
    // Get USDC address on destination chain
    const destTokenAddress = getStablecoinAddress(USDC, CONFIG.destinationChainId);
    if (destTokenAddress) {
      // Create RPC for destination chain
      const destRpc = new RPCClient(CONFIG.destinationRpc);

      // Call balanceOf directly
      const balanceData = await destRpc.call({
        to: destTokenAddress,
        data: `0x70a08231000000000000000000000000${wallet.address.slice(2).toLowerCase()}` as `0x${string}`,
      }, 'latest');

      const rawBalance = BigInt(balanceData);
      const formattedBalance = formatStablecoinAmount(rawBalance, USDC);
      logInfo('USDC on Base Sepolia', `${formattedBalance} USDC`);
      logSuccess('Destination balance checked');
    } else {
      log('USDC address not found on destination chain', colors.dim);
    }
  } catch (err) {
    log(`Could not check destination balance: ${(err as Error).message}`, colors.dim);
    log('The bridge may still be completing...', colors.dim);
  }

  // Summary
  const totalTime = Date.now() - startTime;
  log('\n========================================', colors.green);
  log('  Bridge Complete!', colors.green);
  log('========================================', colors.green);
  logInfo('Total time', `${(totalTime / 1000).toFixed(1)}s`);
  logInfo('Tracking ID', result.trackingId);
  log('\nTo check status later:', colors.dim);
  log(`  await wallet.getBridgeStatusByTrackingId('${result.trackingId}')`, colors.dim);
  log('');
}

main().catch((err) => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});

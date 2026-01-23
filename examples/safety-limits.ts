/**
 * Safety Limits Example
 *
 * Demonstrates safety features:
 * - Spending limits (per-tx, hourly, daily)
 * - Human approval for large transactions
 * - Address policies (trusted/blocked)
 * - Emergency stop
 *
 * Run: npx tsx examples/safety-limits.ts
 */

import { AgentWallet, LimitsEngine, ETH } from '@lambdaclass/eth-agent';
import * as readline from 'readline';

// Simple approval handler that prompts in terminal
async function terminalApproval(request: {
  summary: string;
  details: Record<string, unknown>;
}): Promise<boolean> {
  console.log('\n========== APPROVAL REQUIRED ==========');
  console.log(request.summary);
  console.log('\nDetails:', JSON.stringify(request.details, null, 2));
  console.log('========================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Approve this transaction? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  // Create wallet with strict safety limits
  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY!,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',

    // Spending limits
    limits: {
      perTransaction: '0.1 ETH',  // Max 0.1 ETH per transaction
      perHour: '0.5 ETH',         // Max 0.5 ETH per hour
      perDay: '2 ETH',            // Max 2 ETH per day
      emergencyStop: {
        minBalanceRequired: '0.05 ETH', // Stop if balance drops below
      },
    },

    // Approval configuration
    onApprovalRequired: terminalApproval,
    approvalConfig: {
      requireApprovalWhen: {
        amountExceeds: '0.05 ETH',  // Require approval for > 0.05 ETH
        recipientIsNew: true,       // Require approval for new addresses
      },
    },

    // Address policies
    trustedAddresses: [
      { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik' },
    ],
    blockedAddresses: [
      { address: '0x0000000000000000000000000000000000000000', reason: 'Burn address' },
    ],
  });

  console.log('Wallet created with safety limits\n');

  // Show current limits
  const limits = wallet.getLimits();
  console.log('Current Limits:');
  console.log(`  Per-TX max: ${limits.perTransaction.limit} ETH`);
  console.log(`  Hourly: ${limits.hourly.used}/${limits.hourly.limit} ETH used`);
  console.log(`  Daily: ${limits.daily.used}/${limits.daily.limit} ETH used`);
  console.log(`  Emergency stopped: ${limits.stopped}`);

  // Test 1: Small transaction (should work without approval)
  console.log('\n--- Test 1: Small transaction (0.01 ETH) ---');
  const preview1 = await wallet.preview({ to: 'vitalik.eth', amount: '0.01 ETH' });
  console.log(`Can execute: ${preview1.canExecute}`);
  console.log(`Blockers: ${preview1.blockers.join(', ') || 'none'}`);

  // Test 2: Large transaction (should require approval)
  console.log('\n--- Test 2: Large transaction (0.08 ETH) ---');
  const preview2 = await wallet.preview({ to: 'vitalik.eth', amount: '0.08 ETH' });
  console.log(`Can execute: ${preview2.canExecute}`);
  console.log(`Note: Would require approval (> 0.05 ETH)`);

  // Test 3: Over limit transaction
  console.log('\n--- Test 3: Over limit transaction (0.2 ETH) ---');
  const preview3 = await wallet.preview({ to: 'vitalik.eth', amount: '0.2 ETH' });
  console.log(`Can execute: ${preview3.canExecute}`);
  console.log(`Blockers: ${preview3.blockers.join(', ') || 'none'}`);

  // Demonstrate LimitsEngine directly
  console.log('\n--- Using LimitsEngine directly ---');
  const engine = new LimitsEngine({
    perTransaction: '1 ETH',
    perHour: '5 ETH',
    perDay: '10 ETH',
  });

  // Check a transaction
  try {
    engine.checkTransaction(ETH(0.5));
    console.log('0.5 ETH transaction: ALLOWED');
  } catch (e) {
    console.log(`0.5 ETH transaction: BLOCKED - ${(e as Error).message}`);
  }

  // Record some spending
  engine.recordSpend(ETH(2), ETH(0.01));
  engine.recordSpend(ETH(2), ETH(0.01));

  console.log(`\nAfter spending 4 ETH:`);
  const status = engine.getStatus();
  console.log(`  Hourly: ${status.hourly.used}/${status.hourly.limit} ETH`);
  console.log(`  Daily: ${status.daily.used}/${status.daily.limit} ETH`);
  console.log(`  Max sendable now: ${engine.getMaxSendable()} wei`);
}

main().catch(console.error);

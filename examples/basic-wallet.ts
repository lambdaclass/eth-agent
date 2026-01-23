/**
 * Basic Wallet Example
 *
 * Demonstrates simple wallet operations:
 * - Creating a wallet
 * - Checking balance
 * - Sending ETH
 * - Previewing transactions
 *
 * Run: npx tsx examples/basic-wallet.ts
 */

import { AgentWallet, SafetyPresets } from '@lambdaclass/eth-agent';

async function main() {
  // Create wallet from private key
  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY!,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',
    ...SafetyPresets.BALANCED,
  });

  console.log(`Wallet address: ${wallet.address}`);

  // Check balance
  const balance = await wallet.getBalance();
  console.log(`Balance: ${balance.formatted}`);

  // Check another address
  const vitalikBalance = await wallet.getBalance('vitalik.eth');
  console.log(`Vitalik's balance: ${vitalikBalance.formatted}`);

  // Preview a transaction before sending
  const preview = await wallet.preview({
    to: 'vitalik.eth',
    amount: '0.001 ETH',
  });

  console.log('\nTransaction Preview:');
  console.log(`  Can execute: ${preview.canExecute}`);
  console.log(`  Value: ${preview.costs.value.eth} ETH`);
  console.log(`  Gas cost: ${preview.costs.gas.eth} ETH`);
  console.log(`  Total: ${preview.costs.total.eth} ETH`);

  if (preview.blockers.length > 0) {
    console.log(`  Blockers: ${preview.blockers.join(', ')}`);
  }

  // Send ETH (uncomment to actually send)
  // const result = await wallet.send({
  //   to: 'vitalik.eth',
  //   amount: '0.001 ETH',
  // });
  // console.log(`\nTransaction sent!`);
  // console.log(`  Hash: ${result.hash}`);
  // console.log(`  Summary: ${result.summary}`);

  // Check spending limits
  const limits = wallet.getLimits();
  console.log('\nSpending Limits:');
  console.log(`  Per transaction: ${limits.perTransaction.limit} ETH`);
  console.log(`  Hourly remaining: ${limits.hourly.remaining} ETH`);
  console.log(`  Daily remaining: ${limits.daily.remaining} ETH`);
}

main().catch(console.error);

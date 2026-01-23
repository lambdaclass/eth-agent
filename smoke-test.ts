/**
 * Smoke test for eth-agent on Sepolia
 * Run with: npx tsx smoke-test.ts
 */

import { AgentWallet } from './src/agent/wallet.js';
import { createTools, executeTool } from './src/integrations/tools.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY environment variable is required');
  console.error('Usage: PRIVATE_KEY=0x... npx tsx smoke-test.ts');
  process.exit(1);
}

async function main() {
  console.log('=== eth-agent Sepolia Smoke Test ===\n');

  // Create wallet on Sepolia
  const wallet = AgentWallet.create({
    privateKey: PRIVATE_KEY,
    network: 'sepolia',
  });

  const tools = createTools(wallet);

  console.log('Wallet address:', wallet.address);
  console.log('Network: Sepolia (testnet)\n');

  // === Read-only tests ===

  console.log('--- 1. ETH Balance ---');
  const ethBalance = await executeTool(tools, 'eth_getBalance', {});
  console.log(ethBalance.summary);
  console.log();

  console.log('--- 2. Network Info ---');
  const networkInfo = await executeTool(tools, 'network_info', {});
  console.log(networkInfo.summary);
  console.log();

  console.log('--- 3. Stablecoin Balances ---');
  const stablecoinBalances = await executeTool(tools, 'stablecoin_balances', {});
  console.log(stablecoinBalances.summary);
  console.log();

  console.log('--- 4. Spending Limits ---');
  const limits = await executeTool(tools, 'eth_getLimits', {});
  console.log(limits.summary);
  console.log();

  console.log('--- 5. Wallet Capabilities ---');
  const caps = await executeTool(tools, 'eth_getCapabilities', {});
  console.log(caps.summary);
  console.log();

  console.log('--- 6. Available Networks ---');
  const networks = await executeTool(tools, 'network_list', {});
  console.log(networks.summary);
  console.log();

  // === Preview a minimal ETH send (no execution) ===
  console.log('--- 7. Preview Minimal ETH Send ---');
  const preview = await executeTool(tools, 'eth_preview', {
    to: wallet.address,  // Send to self (no loss)
    amount: '0.0001 ETH',  // Minimal amount
  });
  console.log(preview.summary);
  if (preview.data) {
    const data = preview.data as any;
    console.log(`  Gas cost estimate: ${data.costs?.gas?.eth ?? 'unknown'} ETH`);
    console.log(`  Total cost: ${data.costs?.total?.eth ?? 'unknown'} ETH`);
  }
  console.log();

  console.log('=== Smoke Test Complete ===');
  console.log('\nAll read-only operations successful.');
  console.log('No transactions were signed or sent.');
}

main().catch(console.error);

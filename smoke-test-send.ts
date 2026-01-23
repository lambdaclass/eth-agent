/**
 * Smoke test - ETH send on Sepolia
 * Sends minimal ETH to self (0.0001 ETH)
 */

// Initialize crypto (required for signing)
import * as secp256k1 from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

secp256k1.etc.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => {
  const h = hmac.create(sha256, key);
  for (const msg of messages) h.update(msg);
  return h.digest();
};

import { AgentWallet } from './src/agent/wallet.js';
import { createTools, executeTool } from './src/integrations/tools.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY environment variable is required');
  console.error('Usage: PRIVATE_KEY=0x... npx tsx smoke-test-send.ts');
  process.exit(1);
}

async function main() {
  console.log('=== ETH Send Test (Sepolia) ===\n');

  const wallet = AgentWallet.create({
    privateKey: PRIVATE_KEY,
    network: 'sepolia',
  });

  const tools = createTools(wallet);

  console.log('Wallet:', wallet.address);
  console.log('Network: Sepolia\n');

  // Get balance before
  const balanceBefore = await executeTool(tools, 'eth_getBalance', {});
  console.log('Balance before:', balanceBefore.summary);

  // Send 0.0001 ETH to self
  console.log('\n--- Sending 0.0001 ETH to self ---\n');

  const result = await executeTool(tools, 'eth_send', {
    to: wallet.address,
    amount: '0.0001 ETH',
  });

  if (result.success) {
    console.log('SUCCESS:', result.summary);
    const data = result.data as any;
    console.log('\nTransaction details:');
    console.log('  Hash:', data.transaction?.hash);
    console.log('  Gas used:', data.transaction?.gasUsed?.toString());
    console.log('  Block:', data.transaction?.blockNumber);
  } else {
    console.log('FAILED:', result.summary);
    console.log('Error:', result.error);
  }

  // Get balance after
  console.log();
  const balanceAfter = await executeTool(tools, 'eth_getBalance', {});
  console.log('Balance after:', balanceAfter.summary);

  // Show gas cost
  const beforeWei = (balanceBefore.data as any)?.wei;
  const afterWei = (balanceAfter.data as any)?.wei;
  if (beforeWei && afterWei) {
    const gasCost = beforeWei - afterWei;
    console.log(`Gas cost: ${Number(gasCost) / 1e18} ETH`);
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);

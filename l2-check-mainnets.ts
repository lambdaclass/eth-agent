/**
 * Check ETH balances on all L2 mainnets
 */

// Initialize crypto
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
  console.error('Usage: PRIVATE_KEY=0x... npx tsx l2-check-mainnets.ts');
  process.exit(1);
}

const L2_MAINNETS = [
  { name: 'Taiko', network: 'taiko' },
  { name: 'Scroll', network: 'scroll' },
  { name: 'Linea', network: 'linea' },
  { name: 'zkSync Era', network: 'zksync' },
];

async function main() {
  console.log('=== L2 Mainnet Balance Check ===\n');

  const results: { name: string; network: string; balance: string; balanceWei: bigint; chainId: number }[] = [];

  for (const l2 of L2_MAINNETS) {
    process.stdout.write(`Checking ${l2.name}... `);
    try {
      const wallet = AgentWallet.create({
        privateKey: PRIVATE_KEY,
        network: l2.network,
      });

      const balance = await wallet.getBalance();
      const chainId = await wallet.getChainId();
      results.push({
        name: l2.name,
        network: l2.network,
        balance: balance.formatted,
        balanceWei: balance.wei,
        chainId,
      });
      console.log(`${balance.formatted} (chain ${chainId})`);
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
      results.push({
        name: l2.name,
        network: l2.network,
        balance: 'ERROR',
        balanceWei: 0n,
        chainId: 0,
      });
    }
  }

  console.log('\n=== Summary ===\n');
  console.log('| Network | Chain ID | Balance | Can Test |');
  console.log('|---------|----------|---------|----------|');
  for (const r of results) {
    const canTest = r.balanceWei > 0n ? 'YES' : 'No';
    console.log(`| ${r.name} | ${r.chainId} | ${r.balance} | ${canTest} |`);
  }

  const testable = results.filter(r => r.balanceWei > 0n);
  if (testable.length > 0) {
    console.log(`\n${testable.length} network(s) have balance for testing:`);
    for (const t of testable) {
      console.log(`  - ${t.name}: ${t.balance}`);
    }
  } else {
    console.log('\nNo L2 mainnets have ETH balance.');
  }
}

main().catch(console.error);

/**
 * Verify L2 integration - read operations only
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
  console.error('Usage: PRIVATE_KEY=0x... npx tsx l2-verify-integration.ts');
  process.exit(1);
}

const L2_NETWORKS = [
  { name: 'Taiko', network: 'taiko', expectedChainId: 167000 },
  { name: 'Scroll', network: 'scroll', expectedChainId: 534352 },
  { name: 'Linea', network: 'linea', expectedChainId: 59144 },
  { name: 'zkSync Era', network: 'zksync', expectedChainId: 324 },
];

async function testNetwork(l2: typeof L2_NETWORKS[0]) {
  console.log(`\n=== Testing ${l2.name} (${l2.network}) ===\n`);

  const wallet = AgentWallet.create({
    privateKey: PRIVATE_KEY,
    network: l2.network,
  });
  const tools = createTools(wallet);

  const results: { test: string; status: string; details: string }[] = [];

  // Test 1: Chain ID detection
  try {
    const chainId = await wallet.getChainId();
    const pass = chainId === l2.expectedChainId;
    results.push({
      test: 'Chain ID',
      status: pass ? 'PASS' : 'FAIL',
      details: `Expected ${l2.expectedChainId}, got ${chainId}`,
    });
  } catch (err) {
    results.push({ test: 'Chain ID', status: 'ERROR', details: (err as Error).message });
  }

  // Test 2: Network info tool
  try {
    const info = await executeTool(tools, 'network_info', {});
    const data = info.data as any;
    const pass = info.success && data?.chainId === l2.expectedChainId;
    results.push({
      test: 'network_info',
      status: pass ? 'PASS' : 'FAIL',
      details: info.summary,
    });
  } catch (err) {
    results.push({ test: 'network_info', status: 'ERROR', details: (err as Error).message });
  }

  // Test 3: ETH balance
  try {
    const balance = await executeTool(tools, 'eth_getBalance', {});
    results.push({
      test: 'eth_getBalance',
      status: balance.success ? 'PASS' : 'FAIL',
      details: balance.summary,
    });
  } catch (err) {
    results.push({ test: 'eth_getBalance', status: 'ERROR', details: (err as Error).message });
  }

  // Test 4: Stablecoin balances
  try {
    const stables = await executeTool(tools, 'stablecoin_balances', {});
    results.push({
      test: 'stablecoin_balances',
      status: stables.success ? 'PASS' : 'FAIL',
      details: stables.summary || 'No stablecoins configured',
    });
  } catch (err) {
    results.push({ test: 'stablecoin_balances', status: 'ERROR', details: (err as Error).message });
  }

  // Test 5: Capabilities
  try {
    const caps = wallet.getCapabilities();
    const pass = caps.network.chainId === l2.expectedChainId;
    results.push({
      test: 'getCapabilities',
      status: pass ? 'PASS' : 'FAIL',
      details: `Chain ${caps.network.chainId}, name: ${caps.network.name}`,
    });
  } catch (err) {
    results.push({ test: 'getCapabilities', status: 'ERROR', details: (err as Error).message });
  }

  // Print results
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '!';
    console.log(`  ${icon} ${r.test}: ${r.status}`);
    console.log(`    ${r.details}`);
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  return { name: l2.name, passed, total };
}

async function main() {
  console.log('=== L2 Integration Verification ===');
  console.log('Testing read operations on all L2 networks\n');

  const summary: { name: string; passed: number; total: number }[] = [];

  for (const l2 of L2_NETWORKS) {
    try {
      const result = await testNetwork(l2);
      summary.push(result);
    } catch (err) {
      console.log(`\nFATAL ERROR testing ${l2.name}: ${(err as Error).message}`);
      summary.push({ name: l2.name, passed: 0, total: 5 });
    }
  }

  console.log('\n=== Summary ===\n');
  console.log('| Network | Tests Passed |');
  console.log('|---------|--------------|');
  for (const s of summary) {
    const status = s.passed === s.total ? '✓ ALL' : `${s.passed}/${s.total}`;
    console.log(`| ${s.name} | ${status} |`);
  }

  const allPassed = summary.every(s => s.passed === s.total);
  console.log(`\n${allPassed ? '✓ All L2 integrations verified!' : '✗ Some tests failed'}`);
}

main().catch(console.error);

/**
 * Token Transfer Example
 *
 * Demonstrates ERC20 token operations:
 * - Checking token balance
 * - Transferring tokens
 * - Using token contracts directly
 *
 * Run: npx tsx examples/token-transfer.ts
 */

import { AgentWallet, Contract, ERC20_ABI, RPCClient } from '@lambdaclass/eth-agent';

// Common token addresses (mainnet)
const TOKENS = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EescdeCB5BE3830',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
} as const;

async function main() {
  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY!,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',
  });

  console.log(`Wallet: ${wallet.address}\n`);

  // Check token balances using AgentWallet
  console.log('Token Balances:');
  for (const [name, address] of Object.entries(TOKENS)) {
    try {
      const balance = await wallet.getTokenBalance(address as `0x${string}`);
      console.log(`  ${name}: ${balance.formatted} ${balance.symbol}`);
    } catch (e) {
      console.log(`  ${name}: Error fetching balance`);
    }
  }

  // Transfer tokens (uncomment to actually transfer)
  // const result = await wallet.transferToken({
  //   token: TOKENS.USDC,
  //   to: '0x...recipient...',
  //   amount: '10', // 10 USDC
  // });
  // console.log(`\nTransfer complete: ${result.summary}`);

  // Using Contract directly for more control
  console.log('\n--- Using Contract directly ---\n');

  const rpc = RPCClient.connect(process.env.RPC_URL ?? 'https://eth.llamarpc.com');

  const usdc = new Contract({
    address: TOKENS.USDC,
    abi: ERC20_ABI,
    rpc,
  });

  // Read token info
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    usdc.read<string>('name'),
    usdc.read<string>('symbol'),
    usdc.read<bigint>('decimals'),
    usdc.read<bigint>('totalSupply'),
  ]);

  console.log(`Token: ${name} (${symbol})`);
  console.log(`Decimals: ${decimals}`);
  console.log(`Total Supply: ${Number(totalSupply) / 10 ** Number(decimals)} ${symbol}`);

  // Check allowance
  const spender = '0x1111111254EEB25477B68fb85Ed929f73A960582'; // 1inch router
  const allowance = await usdc.read<bigint>('allowance', [wallet.address, spender]);
  console.log(`\nAllowance for 1inch: ${Number(allowance) / 10 ** Number(decimals)} ${symbol}`);
}

main().catch(console.error);

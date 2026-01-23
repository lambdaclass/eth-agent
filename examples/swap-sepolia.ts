/**
 * Swap Test Script - Ethereum Sepolia
 *
 * Demonstrates swap operations on Sepolia testnet:
 * - Getting swap quotes
 * - Executing swaps via Uniswap V3
 * - Handling slippage and swap limits
 *
 * Prerequisites:
 * - ETH_PRIVATE_KEY: Private key with Sepolia ETH
 * - SEPOLIA_RPC_URL: Sepolia RPC endpoint (REQUIRED - get free one from Alchemy/Infura)
 *
 * Run: SEPOLIA_RPC_URL=https://... ETH_PRIVATE_KEY=0x... npx tsx examples/swap-sepolia.ts
 *
 * Note: Sepolia testnet has limited liquidity. The script will try
 * common pairs but may fail if pools don't have sufficient liquidity.
 */

import { AgentWallet } from '@lambdaclass/eth-agent';

// Common Sepolia testnet token addresses
// These are well-known test tokens that have Uniswap pools
const SEPOLIA_TOKENS = {
  WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  // Note: USDC on Sepolia varies - this is a common test USDC
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  // UNI token on Sepolia
  UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
};

async function main() {
  // Validate environment
  if (!process.env.ETH_PRIVATE_KEY) {
    console.error('Error: ETH_PRIVATE_KEY environment variable is required');
    console.error('Usage: SEPOLIA_RPC_URL=https://... ETH_PRIVATE_KEY=0x... npx tsx examples/swap-sepolia.ts');
    process.exit(1);
  }

  // Create wallet connected to Sepolia
  // Default to publicnode which is more reliable than rpc.sepolia.org
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';

  if (!process.env.SEPOLIA_RPC_URL) {
    console.log('Note: Using public RPC. For better performance, set SEPOLIA_RPC_URL with an Alchemy/Infura key.\n');
  }

  console.log('Creating wallet for Sepolia testnet...');
  console.log(`RPC URL: ${rpcUrl}\n`);

  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY,
    rpcUrl,
    // Set generous swap limits for testing
    limits: {
      swap: {
        perTransactionUSD: 1000,
        perDayUSD: 10000,
        maxSlippagePercent: 5, // 5% slippage for testnet (low liquidity)
      },
    },
  });

  console.log(`Wallet address: ${wallet.address}`);

  // Check ETH balance
  const balance = await wallet.getBalance();
  console.log(`ETH Balance: ${balance.formatted}`);

  if (BigInt(balance.wei) === 0n) {
    console.error('\nError: Wallet has no Sepolia ETH');
    console.error('Get testnet ETH from a Sepolia faucet:');
    console.error('  - https://sepoliafaucet.com/');
    console.error('  - https://www.alchemy.com/faucets/ethereum-sepolia');
    process.exit(1);
  }

  // Display swap limits
  const swapLimits = wallet.getSwapLimits();
  console.log('\nSwap Limits:');
  console.log(`  Per transaction: $${swapLimits.perTransaction.limit} USD`);
  console.log(`  Daily limit: $${swapLimits.daily.limit} USD`);
  console.log(`  Daily remaining: $${swapLimits.daily.remaining} USD`);
  console.log(`  Max slippage: ${swapLimits.maxSlippagePercent}%`);

  // Try to get swap quotes
  console.log('\n--- Getting Swap Quotes ---\n');

  // Quote 1: ETH to WETH (wrapping - always 1:1, no Uniswap needed)
  try {
    console.log('Quote: 0.001 ETH -> WETH (wrap)');
    const quote1 = await wallet.getSwapQuote({
      fromToken: 'ETH',
      toToken: 'WETH',
      amount: '0.001',
    });
    console.log(`  Expected output: ${quote1.toToken.amount} WETH`);
    console.log(`  Min output: ${quote1.amountOutMinimum} WETH`);
    console.log(`  Price impact: ${quote1.priceImpact.toFixed(4)}%`);
    console.log(`  Fee: ${quote1.fee}% (no fee for wrapping)`);
  } catch (error) {
    console.log(`  Failed: ${(error as Error).message}`);
  }

  // Quote 2: WETH to ETH (unwrapping - always 1:1)
  try {
    console.log('\nQuote: 0.001 WETH -> ETH (unwrap)');
    const quote2 = await wallet.getSwapQuote({
      fromToken: 'WETH',
      toToken: 'ETH',
      amount: '0.001',
    });
    console.log(`  Expected output: ${quote2.toToken.amount} ETH`);
    console.log(`  Min output: ${quote2.amountOutMinimum} ETH`);
    console.log(`  Price impact: ${quote2.priceImpact.toFixed(4)}%`);
    console.log(`  Fee: ${quote2.fee}% (no fee for unwrapping)`);
  } catch (error) {
    console.log(`  Failed: ${(error as Error).message}`);
  }

  // Quote 3: Try ETH to USDC (requires Uniswap pool)
  try {
    console.log('\nQuote: 0.001 ETH -> USDC (via Uniswap)');
    const quote3 = await wallet.getSwapQuote({
      fromToken: 'ETH',
      toToken: SEPOLIA_TOKENS.USDC,
      amount: '0.001',
    });
    console.log(`  Expected output: ${quote3.toToken.amount} USDC`);
    console.log(`  Min output (with slippage): ${quote3.amountOutMinimum} USDC`);
    console.log(`  Price impact: ${quote3.priceImpact.toFixed(4)}%`);
    console.log(`  Fee tier: ${quote3.fee / 10000}%`);
  } catch (error) {
    console.log(`  Failed: ${(error as Error).message}`);
    console.log('  (This is common on testnet - pools may not have liquidity)');
  }

  // Execute swap section (commented out by default for safety)
  console.log('\n--- Execute Swap ---\n');

  // Check if user wants to execute
  if (process.env.EXECUTE_SWAP !== 'true') {
    console.log('Swap execution is disabled by default.');
    console.log('To execute a swap, run with EXECUTE_SWAP=true:');
    console.log('  EXECUTE_SWAP=true ETH_PRIVATE_KEY=0x... npx tsx examples/swap-sepolia.ts\n');
    return;
  }

  // Execute a small ETH -> WETH wrap
  console.log('Executing: 0.0001 ETH -> WETH (wrap)');
  console.log('(This wraps ETH to WETH via the WETH contract)\n');

  try {
    console.log('Starting swap...');
    const startTime = Date.now();
    const swapResult = await wallet.swap({
      fromToken: 'ETH',
      toToken: 'WETH',
      amount: '0.0001',
      slippageTolerance: 1, // 1% slippage for safety on testnet
    });
    console.log(`Swap completed in ${Date.now() - startTime}ms`);

    console.log('Swap successful!');
    console.log(`  Transaction hash: ${swapResult.hash}`);
    console.log(`  Summary: ${swapResult.summary}`);
    console.log(`  Token In: ${swapResult.swap.tokenIn.amount} ${swapResult.swap.tokenIn.symbol}`);
    console.log(`  Token Out: ${swapResult.swap.tokenOut.amount} ${swapResult.swap.tokenOut.symbol}`);
    console.log(`  Effective price: ${swapResult.swap.effectivePrice}`);
    console.log(`  Gas used: ${swapResult.transaction.gasUsed}`);
    console.log(`\n  View on Etherscan: https://sepolia.etherscan.io/tx/${swapResult.hash}`);

    // Updated limits after swap
    console.log('\nUpdated Swap Limits:');
    console.log(`  Daily remaining: $${swapResult.limits.remaining.daily.usd} USD`);
  } catch (error) {
    console.error('Wrap failed:', (error as Error).message);
  }

  // Execute a swap via Uniswap: ETH -> USDC
  console.log('\n--- Execute Uniswap Swap: ETH -> USDC ---\n');
  console.log('Executing: 0.0001 ETH -> USDC (via Uniswap)');
  console.log('(This swaps ETH for USDC through a Uniswap V3 pool)\n');

  try {
    console.log('Starting Uniswap swap...');
    const startTime = Date.now();
    const uniswapResult = await wallet.swap({
      fromToken: 'ETH',
      toToken: SEPOLIA_TOKENS.USDC,
      amount: '0.0001',
      slippageTolerance: 5, // 5% slippage for testnet (low liquidity)
    });
    console.log(`Swap completed in ${Date.now() - startTime}ms`);

    console.log('Uniswap swap successful!');
    console.log(`  Transaction hash: ${uniswapResult.hash}`);
    console.log(`  Summary: ${uniswapResult.summary}`);
    console.log(`  Token In: ${uniswapResult.swap.tokenIn.amount} ${uniswapResult.swap.tokenIn.symbol}`);
    console.log(`  Token Out: ${uniswapResult.swap.tokenOut.amount} ${uniswapResult.swap.tokenOut.symbol}`);
    console.log(`  Effective price: ${uniswapResult.swap.effectivePrice}`);
    console.log(`  Price impact: ${uniswapResult.swap.priceImpact}%`);
    console.log(`  Gas used: ${uniswapResult.transaction.gasUsed}`);
    console.log(`\n  View on Etherscan: https://sepolia.etherscan.io/tx/${uniswapResult.hash}`);
  } catch (error) {
    console.error('Uniswap swap failed:', (error as Error).message);

    // Provide helpful error context
    if ((error as Error).message.includes('liquidity')) {
      console.error('\nThis likely means the pool has insufficient liquidity.');
      console.error('Try a different token pair or a smaller amount.');
    } else if ((error as Error).message.includes('slippage')) {
      console.error('\nThe price moved too much. Try increasing slippage tolerance.');
    } else if ((error as Error).message.includes('insufficient funds')) {
      console.error('\nNot enough ETH to cover the swap + gas.');
    }
  }

  // Check final balances
  console.log('\n--- Final Balances ---\n');
  const finalBalance = await wallet.getBalance();
  console.log(`ETH: ${finalBalance.formatted}`);
}

main().catch(console.error);

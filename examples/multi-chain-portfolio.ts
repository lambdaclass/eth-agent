/**
 * Multi-Chain Portfolio Example
 *
 * Demonstrates tracking stablecoin balances across multiple chains:
 * - Connecting to multiple networks
 * - Aggregating stablecoin balances
 * - Calculating total portfolio value
 *
 * Run: npx tsx examples/multi-chain-portfolio.ts
 */

import {
  AgentWallet,
  RPCClient,
  USDC,
  USDT,
  USDS,
  DAI,
  STABLECOINS,
  getStablecoinAddress,
  formatStablecoinAmount,
  type StablecoinInfo,
} from '@lambdaclass/eth-agent';

// Network configurations (use your own RPC URLs for production)
const NETWORKS = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
  },
} as const;

interface ChainBalance {
  network: string;
  chainId: number;
  stablecoins: {
    symbol: string;
    balance: string;
    rawBalance: bigint;
    usdValue: number;
  }[];
  totalUsd: number;
}

interface PortfolioSummary {
  address: string;
  chains: ChainBalance[];
  totalUsd: number;
  breakdown: { symbol: string; totalUsd: number; percentage: number }[];
}

async function getChainBalances(
  address: string,
  network: { name: string; chainId: number; rpcUrl: string }
): Promise<ChainBalance> {
  const stablecoins: ChainBalance['stablecoins'] = [];

  // Create one wallet per chain for all token queries (read-only operations)
  const wallet = AgentWallet.create({
    rpcUrl: network.rpcUrl,
    // Use any private key for read-only operations
    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
  });

  for (const [symbol, info] of Object.entries(STABLECOINS)) {
    const tokenAddress = getStablecoinAddress(info, network.chainId);
    if (!tokenAddress) continue;

    try {
      const balance = await wallet.getStablecoinBalance(info, address);

      if (balance.raw > 0n) {
        // For stablecoins, 1 token ≈ $1 (simplified)
        const usdValue = parseFloat(balance.formatted);
        stablecoins.push({
          symbol,
          balance: balance.formatted,
          rawBalance: balance.raw,
          usdValue,
        });
      }
    } catch (err) {
      // Skip tokens that fail (network issues, etc.)
      console.log(`  Skipped ${symbol} on ${network.name}: ${(err as Error).message}`);
    }
  }

  const totalUsd = stablecoins.reduce((sum, s) => sum + s.usdValue, 0);

  return {
    network: network.name,
    chainId: network.chainId,
    stablecoins,
    totalUsd,
  };
}

async function getPortfolio(address: string): Promise<PortfolioSummary> {
  console.log(`\nFetching portfolio for: ${address}\n`);

  const chains: ChainBalance[] = [];

  // Fetch balances from all chains in parallel
  const results = await Promise.allSettled(
    Object.values(NETWORKS).map((network) => getChainBalances(address, network))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      chains.push(result.value);
    }
  }

  // Calculate totals
  const totalUsd = chains.reduce((sum, c) => sum + c.totalUsd, 0);

  // Calculate breakdown by stablecoin
  const bySymbol = new Map<string, number>();
  for (const chain of chains) {
    for (const coin of chain.stablecoins) {
      bySymbol.set(coin.symbol, (bySymbol.get(coin.symbol) ?? 0) + coin.usdValue);
    }
  }

  const breakdown = Array.from(bySymbol.entries())
    .map(([symbol, symbolTotal]) => ({
      symbol,
      totalUsd: symbolTotal,
      percentage: totalUsd > 0 ? (symbolTotal / totalUsd) * 100 : 0,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return { address, chains, totalUsd, breakdown };
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

async function main() {
  // Example: Check Vitalik's stablecoin holdings
  const address = process.env.ADDRESS ?? '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  console.log('=== Multi-Chain Stablecoin Portfolio ===');

  const portfolio = await getPortfolio(address);

  // Display by chain
  console.log('\n--- Balances by Chain ---\n');
  for (const chain of portfolio.chains) {
    if (chain.stablecoins.length === 0) {
      console.log(`${chain.network}: No stablecoins found`);
      continue;
    }

    console.log(`${chain.network} (Chain ID: ${chain.chainId}):`);
    for (const coin of chain.stablecoins) {
      console.log(`  ${coin.symbol}: ${coin.balance} (${formatUsd(coin.usdValue)})`);
    }
    console.log(`  Total: ${formatUsd(chain.totalUsd)}`);
    console.log();
  }

  // Display breakdown by stablecoin
  console.log('--- Breakdown by Stablecoin ---\n');
  for (const item of portfolio.breakdown) {
    console.log(
      `${item.symbol}: ${formatUsd(item.totalUsd)} (${item.percentage.toFixed(1)}%)`
    );
  }

  // Total
  console.log('\n--- Total Portfolio Value ---\n');
  console.log(`${formatUsd(portfolio.totalUsd)}`);

  // Export as JSON
  console.log('\n--- JSON Export ---\n');
  console.log(
    JSON.stringify(
      {
        address: portfolio.address,
        totalUsd: portfolio.totalUsd,
        breakdown: portfolio.breakdown,
        chains: portfolio.chains.map((c) => ({
          network: c.network,
          totalUsd: c.totalUsd,
          stablecoins: c.stablecoins,
        })),
      },
      null,
      2
    )
  );
}

main().catch(console.error);

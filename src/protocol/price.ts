/**
 * Price feeds for USD conversions
 * Uses Chainlink price feeds on-chain
 */

import type { Address, Hex } from '../core/types.js';
import type { RPCClient } from './rpc.js';
import { hexToBigInt } from '../core/hex.js';
import { formatUnits } from '../core/units.js';

// Chainlink ETH/USD price feed addresses
const PRICE_FEEDS: Record<number, Address> = {
  1: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' as Address,      // Mainnet
  11155111: '0x694AA1769357215DE4FAC081bf1f309aDC325306' as Address, // Sepolia
  10: '0x13e3Ee699D1909E989722E753853AE30b17e08c5' as Address,      // Optimism
  42161: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612' as Address,   // Arbitrum
  8453: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' as Address,    // Base
  137: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0' as Address,     // Polygon
};

// Chainlink Aggregator V3 Interface - latestRoundData()
const LATEST_ROUND_DATA_SELECTOR = '0xfeaf968c';

export interface PriceData {
  price: number;          // USD price
  decimals: number;       // Price decimals (usually 8)
  timestamp: number;      // Last update timestamp
  roundId: bigint;        // Chainlink round ID
}

export interface PriceOracleConfig {
  rpc: RPCClient;
  chainId?: number;
  customFeed?: Address;   // Override default feed
  fallbackPrice?: number; // Fallback if feed unavailable
}

/**
 * Price oracle for ETH/USD conversions
 */
export class PriceOracle {
  private readonly rpc: RPCClient;
  private readonly feedAddress: Address | undefined;
  private readonly fallbackPrice: number;
  private cache: { data: PriceData; fetchedAt: number } | null = null;
  private readonly cacheTTL = 60_000; // 1 minute cache

  constructor(config: PriceOracleConfig) {
    this.rpc = config.rpc;
    this.fallbackPrice = config.fallbackPrice ?? 0;

    if (config.customFeed) {
      this.feedAddress = config.customFeed;
    } else if (config.chainId && PRICE_FEEDS[config.chainId]) {
      this.feedAddress = PRICE_FEEDS[config.chainId];
    }
  }

  /**
   * Get current ETH price in USD
   */
  async getETHPrice(): Promise<PriceData> {
    // Check cache
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTTL) {
      return this.cache.data;
    }

    if (!this.feedAddress) {
      return {
        price: this.fallbackPrice,
        decimals: 8,
        timestamp: Math.floor(Date.now() / 1000),
        roundId: 0n,
      };
    }

    try {
      const result = await this.rpc.call({
        to: this.feedAddress,
        data: LATEST_ROUND_DATA_SELECTOR as Hex,
      });

      // Decode: (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
      const data = result.slice(2); // Remove 0x
      const roundId = hexToBigInt(`0x${data.slice(0, 64)}`);
      const answer = hexToBigInt(`0x${data.slice(64, 128)}`);
      const updatedAt = hexToBigInt(`0x${data.slice(192, 256)}`);

      const priceData: PriceData = {
        price: Number(answer) / 1e8, // Chainlink uses 8 decimals
        decimals: 8,
        timestamp: Number(updatedAt),
        roundId,
      };

      this.cache = { data: priceData, fetchedAt: Date.now() };
      return priceData;
    } catch {
      return {
        price: this.fallbackPrice,
        decimals: 8,
        timestamp: Math.floor(Date.now() / 1000),
        roundId: 0n,
      };
    }
  }

  /**
   * Convert ETH amount to USD
   */
  async ethToUSD(weiAmount: bigint): Promise<number> {
    const { price } = await this.getETHPrice();
    const ethAmount = Number(formatUnits(weiAmount, 18));
    return ethAmount * price;
  }

  /**
   * Convert USD amount to ETH (wei)
   */
  async usdToETH(usdAmount: number): Promise<bigint> {
    const { price } = await this.getETHPrice();
    if (price === 0) return 0n;
    const ethAmount = usdAmount / price;
    return BigInt(Math.floor(ethAmount * 1e18));
  }

  /**
   * Format amount with USD value
   */
  async formatWithUSD(weiAmount: bigint): Promise<{
    wei: bigint;
    eth: string;
    usd: number;
    formatted: string;
  }> {
    const eth = formatUnits(weiAmount, 18);
    const usd = await this.ethToUSD(weiAmount);

    return {
      wei: weiAmount,
      eth,
      usd,
      formatted: `${eth} ETH ($${usd.toFixed(2)})`,
    };
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.cache = null;
  }
}

/**
 * Create a price oracle for a chain
 */
export function createPriceOracle(rpc: RPCClient, chainId?: number): PriceOracle {
  const config: PriceOracleConfig = { rpc };
  if (chainId !== undefined) {
    config.chainId = chainId;
  }
  return new PriceOracle(config);
}

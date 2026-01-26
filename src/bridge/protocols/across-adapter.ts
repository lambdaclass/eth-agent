/**
 * Across Adapter - Wraps the AcrossBridge for use with BridgeRouter
 * Fast, intent-based cross-chain bridging via Across Protocol
 */

import type { Hex } from '../../core/types.js';
import {
  type BridgeProtocolInfo,
  type BridgeRequest,
  type BridgeQuote,
  type BridgeFeeEstimate,
  type BridgeInitResult,
  type BridgeStatusResult,
} from '../types.js';
import { BridgeUnsupportedRouteError } from '../errors.js';
import { AcrossBridge, type AcrossBridgeConfig, type AcrossQuote } from '../across/across-bridge.js';
import { getSupportedAcrossChains, getAcrossConfig, getAcrossChainName, isAcrossTestnet } from '../across/constants.js';
import { BaseBridgeAdapter, type BaseAdapterConfig } from './base-adapter.js';

/**
 * Configuration for Across adapter
 */
export interface AcrossAdapterConfig extends BaseAdapterConfig {
  /** Use testnet (auto-detected from chain ID if not specified) */
  testnet?: boolean;
  /** Default slippage tolerance in basis points (default: 50 = 0.5%) */
  defaultSlippageBps?: number;
  /** ETH price in USD for gas estimation (required for accurate fee calculations) */
  ethPriceUSD: number;
  /** BTC price in USD for WBTC fee calculation (optional, defaults to skipping WBTC USD calculation) */
  btcPriceUSD?: number;
}

/**
 * Cached quote with metadata
 */
interface CachedQuote {
  quote: AcrossQuote;
  request: BridgeRequest;
  gasFee: bigint;
  fetchedAt: number;
}

/**
 * Across Adapter - Implements BridgeProtocolV2 by wrapping AcrossBridge
 *
 * Key features:
 * - Fast bridging (2-5 minutes) via intent-based relayers
 * - Supports USDC, USDT, WETH, DAI, WBTC
 * - Variable fees based on liquidity and demand
 * - Quote expiry handling (60 second validity)
 */
export class AcrossAdapter extends BaseBridgeAdapter {
  readonly info: BridgeProtocolInfo = {
    name: 'Across',
    displayName: 'Across Protocol',
    supportedTokens: ['USDC', 'USDT', 'WETH', 'DAI', 'WBTC'] as const,
    finalityModel: 'optimistic',
    typicalSpeed: 'fast',
    estimatedTimeSeconds: { min: 60, max: 300 }, // 1-5 minutes
    hasProtocolFees: true,
  };

  private readonly acrossBridge: AcrossBridge;
  private readonly defaultSlippageBps: number;
  private readonly ethPriceUSD: number;
  private readonly btcPriceUSD?: number;

  /** Quote cache to avoid duplicate API calls */
  private cachedQuote: CachedQuote | null = null;
  private readonly quoteCacheTTL = 30_000; // 30 seconds - shorter than expiry for safety

  constructor(config: AcrossAdapterConfig) {
    super(config);

    this.defaultSlippageBps = config.defaultSlippageBps ?? 50; // 0.5% default
    this.ethPriceUSD = config.ethPriceUSD;
    this.btcPriceUSD = config.btcPriceUSD;

    // Create the underlying Across bridge
    // Auto-detect testnet if not specified
    this.acrossBridge = new AcrossBridge({
      sourceRpc: config.sourceRpc,
      account: config.account,
      testnet: config.testnet,
      defaultSlippageBps: this.defaultSlippageBps,
    });
  }

  /**
   * Get list of supported chain IDs
   */
  getSupportedChains(): number[] {
    return getSupportedAcrossChains();
  }

  /**
   * Check if a route is supported
   */
  isRouteSupported(sourceChainId: number, destChainId: number, token: string): boolean {
    return this.acrossBridge.isRouteSupported(sourceChainId, destChainId, token);
  }

  /**
   * Get estimated time for bridging
   */
  getEstimatedTime(): string {
    return this.acrossBridge.getEstimatedTime();
  }

  /**
   * Get a quote for a bridge request
   * Uses caching to avoid redundant API calls
   */
  async getQuote(request: BridgeRequest): Promise<BridgeQuote> {
    const sourceChainId = await this.getSourceChainId();

    // Validate route
    if (!this.isRouteSupported(sourceChainId, request.destinationChainId, request.token.symbol)) {
      throw new BridgeUnsupportedRouteError({
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token: request.token.symbol,
        supportedChains: this.getSupportedChains(),
      });
    }

    // Get quote (from cache if valid, otherwise fetch)
    const { quote: acrossQuote, gasFee } = await this.getOrFetchQuote(request);

    const sourceChainName = getAcrossChainName(sourceChainId);
    const destChainName = getAcrossChainName(request.destinationChainId);

    // Calculate total fee in USD
    const totalFeeUSD = this.calculateTotalFeeUSD(
      acrossQuote.totalFee,
      gasFee,
      request.token
    );

    return {
      protocol: this.info.name,
      inputAmount: acrossQuote.inputAmount,
      outputAmount: acrossQuote.outputAmount,
      fee: {
        protocol: acrossQuote.totalFee,
        gas: gasFee,
        total: acrossQuote.totalFee + gasFee,
        totalUSD: totalFeeUSD,
      },
      // Slippage is separate from fees - Across has minimal slippage due to intent model
      // The fee is deterministic once quote is locked in
      slippage: {
        expectedBps: 0, // No slippage on locked quote
        maxBps: this.defaultSlippageBps, // User-configured max tolerance
      },
      estimatedTime: {
        minSeconds: Math.min(60, acrossQuote.expectedFillTimeSec),
        maxSeconds: Math.max(300, acrossQuote.expectedFillTimeSec * 2),
        display: this.formatTimeEstimate(60, 300),
      },
      route: {
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token: request.token.symbol,
        steps: 1,
        description: this.createRouteDescription(sourceChainName, destChainName, request.token.symbol),
      },
      // Across quotes are valid for ~60 seconds
      // We use a slightly shorter expiry for safety margin
      expiry: new Date(Date.now() + 55 * 1000),
    };
  }

  /**
   * Estimate fees for a request
   * Returns both raw fees and USD estimate
   */
  async estimateFees(request: BridgeRequest): Promise<BridgeFeeEstimate> {
    const { quote: acrossQuote, gasFee } = await this.getOrFetchQuote(request);

    return {
      protocolFee: acrossQuote.totalFee,
      gasFee,
      totalUSD: this.calculateTotalFeeUSD(acrossQuote.totalFee, gasFee, request.token),
    };
  }

  /**
   * Initiate a bridge transaction
   */
  async initiateBridge(request: BridgeRequest): Promise<BridgeInitResult> {
    // Clear cache to ensure fresh quote is used
    this.cachedQuote = null;
    return this.acrossBridge.initiateBridge(request);
  }

  /**
   * Get current status of a bridge
   */
  async getStatus(depositIdHex: Hex): Promise<BridgeStatusResult> {
    return this.acrossBridge.getStatus(depositIdHex);
  }

  /**
   * Wait for fill (attestation equivalent for Across)
   */
  async waitForAttestation(depositIdHex: Hex): Promise<Hex> {
    return this.acrossBridge.waitForAttestation(depositIdHex);
  }

  /**
   * Check if Across is available on the current chain
   */
  async isAvailable(): Promise<boolean> {
    try {
      const chainId = await this.getSourceChainId();
      const config = getAcrossConfig(chainId);
      return config !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Across reliability score
   * Across is highly reliable with good track record and active relayer network
   */
  getReliabilityScore(): number {
    return 90; // High reliability
  }

  /**
   * Get the underlying Across bridge instance
   * Useful for advanced operations like previewBridge
   */
  getUnderlyingBridge(): AcrossBridge {
    return this.acrossBridge;
  }

  // ============ Private Helper Methods ============

  /**
   * Get quote from cache or fetch fresh one
   * Implements smart caching to reduce API calls
   */
  private async getOrFetchQuote(
    request: BridgeRequest
  ): Promise<{ quote: AcrossQuote; gasFee: bigint }> {
    const now = Date.now();

    // Check if cached quote is still valid for this request
    if (this.cachedQuote && this.isCacheValid(request, now)) {
      return {
        quote: this.cachedQuote.quote,
        gasFee: this.cachedQuote.gasFee,
      };
    }

    // Fetch fresh quote and gas estimate
    const [acrossQuote, gasFee] = await Promise.all([
      this.acrossBridge.getQuote(request),
      this.estimateGasFee(),
    ]);

    // Cache the result
    this.cachedQuote = {
      quote: acrossQuote,
      request,
      gasFee,
      fetchedAt: now,
    };

    return { quote: acrossQuote, gasFee };
  }

  /**
   * Check if cached quote is valid for the given request
   */
  private isCacheValid(request: BridgeRequest, now: number): boolean {
    if (!this.cachedQuote) return false;

    const { request: cachedReq, fetchedAt } = this.cachedQuote;

    // Check TTL
    if (now - fetchedAt > this.quoteCacheTTL) return false;

    // Check request parameters match
    return (
      cachedReq.token.symbol === request.token.symbol &&
      cachedReq.amount === request.amount &&
      cachedReq.destinationChainId === request.destinationChainId &&
      cachedReq.recipient === request.recipient
    );
  }

  /**
   * Estimate gas fee for deposit
   */
  private async estimateGasFee(): Promise<bigint> {
    try {
      // depositV3 typically uses ~150k-200k gas
      const estimatedGas = 175000n;

      // Get current gas price
      const gasPrice = await this.sourceRpc.getGasPrice();

      return estimatedGas * gasPrice;
    } catch {
      // Default fallback: assume 175k gas at 30 gwei
      return 175000n * 30000000000n; // ~0.00525 ETH
    }
  }

  /**
   * Calculate total fee in USD
   * Handles both stablecoins (1:1) and other tokens (needs price feed)
   */
  private calculateTotalFeeUSD(
    protocolFee: bigint,
    gasFee: bigint,
    token: { symbol: string; decimals: number }
  ): number {
    // Gas fee in USD (convert wei to ETH, then to USD)
    const gasInEth = Number(gasFee) / 1e18;
    const gasFeeUSD = gasInEth * this.ethPriceUSD;

    // Protocol fee depends on token type
    let protocolFeeUSD: number;

    if (this.isStablecoin(token.symbol)) {
      // Stablecoins: assume 1:1 with USD
      protocolFeeUSD = Number(protocolFee) / Math.pow(10, token.decimals);
    } else if (token.symbol === 'WETH') {
      // WETH: use ETH price
      const feeInEth = Number(protocolFee) / 1e18;
      protocolFeeUSD = feeInEth * this.ethPriceUSD;
    } else if (token.symbol === 'WBTC') {
      // WBTC: use configured price or skip USD calculation
      if (this.btcPriceUSD) {
        const feeInBtc = Number(protocolFee) / 1e8; // WBTC has 8 decimals
        protocolFeeUSD = feeInBtc * this.btcPriceUSD;
      } else {
        // No BTC price configured, return gas fee only
        protocolFeeUSD = 0;
      }
    } else {
      // Unknown token: fall back to treating as stablecoin-like
      protocolFeeUSD = Number(protocolFee) / Math.pow(10, token.decimals);
    }

    return Math.round((protocolFeeUSD + gasFeeUSD) * 100) / 100;
  }

  /**
   * Check if token is a stablecoin
   */
  private isStablecoin(symbol: string): boolean {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'USDS', 'PYUSD', 'FRAX'];
    return stablecoins.includes(symbol.toUpperCase());
  }
}

/**
 * Create an Across adapter instance
 */
export function createAcrossAdapter(config: AcrossAdapterConfig): AcrossAdapter {
  return new AcrossAdapter(config);
}

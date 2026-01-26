/**
 * CCTP Adapter - Wraps the existing CCTPBridge for use with BridgeRouter
 * Circle Cross-Chain Transfer Protocol for USDC
 */

import type { Hex } from '../../core/types.js';
import { USDC, parseStablecoinAmount } from '../../stablecoins/index.js';
import {
  type BridgeProtocolInfo,
  type BridgeRequest,
  type BridgeQuote,
  type BridgeInitResult,
  type BridgeStatusResult,
} from '../types.js';
import { CCTPBridge, type CCTPBridgeConfig } from '../cctp/cctp-bridge.js';
import { getSupportedCCTPChains, getCCTPConfig, getChainName } from '../constants.js';
import { BaseBridgeAdapter, type BaseAdapterConfig } from './base-adapter.js';

/**
 * Configuration for CCTP adapter
 */
export interface CCTPAdapterConfig extends BaseAdapterConfig {
  /** Use testnet (auto-detected from chain ID if not specified) */
  testnet?: boolean;
  /** Custom attestation client config */
  attestationConfig?: CCTPBridgeConfig['attestationConfig'];
  /** ETH price in USD for gas estimation (required for accurate fee calculations) */
  ethPriceUSD: number;
}

/**
 * CCTP Adapter - Implements BridgeProtocolV2 by wrapping CCTPBridge
 */
export class CCTPAdapter extends BaseBridgeAdapter {
  readonly info: BridgeProtocolInfo = {
    name: 'CCTP',
    displayName: 'Circle CCTP',
    supportedTokens: ['USDC'] as const,
    finalityModel: 'attestation',
    typicalSpeed: 'standard',
    estimatedTimeSeconds: { min: 600, max: 1800 }, // 10-30 minutes
    hasProtocolFees: false,
  };

  private readonly cctpBridge: CCTPBridge;
  private readonly ethPriceUSD: number;

  constructor(config: CCTPAdapterConfig) {
    super(config);

    this.ethPriceUSD = config.ethPriceUSD;

    // Create the underlying CCTP bridge
    this.cctpBridge = new CCTPBridge({
      sourceRpc: config.sourceRpc,
      account: config.account,
      testnet: config.testnet,
      attestationConfig: config.attestationConfig,
    });
  }

  /**
   * Get list of supported chain IDs
   */
  getSupportedChains(): number[] {
    return getSupportedCCTPChains();
  }

  /**
   * Check if a route is supported
   */
  isRouteSupported(sourceChainId: number, destChainId: number, token: string): boolean {
    return this.cctpBridge.isRouteSupported(sourceChainId, destChainId, token);
  }

  /**
   * Get estimated time for bridging
   */
  getEstimatedTime(): string {
    return this.cctpBridge.getEstimatedTime();
  }

  /**
   * Get a quote for a bridge request
   */
  async getQuote(request: BridgeRequest): Promise<BridgeQuote> {
    const sourceChainId = await this.getSourceChainId();

    // Validate token is USDC
    if (request.token.symbol !== 'USDC') {
      throw new Error(`CCTP only supports USDC, not ${request.token.symbol}`);
    }

    // Validate route
    if (!this.isRouteSupported(sourceChainId, request.destinationChainId, 'USDC')) {
      throw new Error(
        `Route not supported: ${String(sourceChainId)} -> ${String(request.destinationChainId)}`
      );
    }

    // Parse amount
    const amount = parseStablecoinAmount(request.amount, USDC);

    // CCTP has no protocol fees - 1:1 transfer
    const protocolFee = 0n;

    // Estimate gas fee (rough estimate for depositForBurn)
    const gasFee = await this.estimateGasFee();

    const sourceChainName = getChainName(sourceChainId);
    const destChainName = getChainName(request.destinationChainId);

    return {
      protocol: this.info.name,
      inputAmount: amount,
      outputAmount: amount, // CCTP is 1:1 (no fees)
      fee: {
        protocol: protocolFee,
        gas: gasFee,
        total: gasFee,
        totalUSD: this.estimateGasInUSD(gasFee),
      },
      // CCTP is 1:1 with no slippage - explicit for clarity
      slippage: {
        expectedBps: 0,
        maxBps: 0,
      },
      estimatedTime: {
        minSeconds: typeof this.info.estimatedTimeSeconds === 'object' ? this.info.estimatedTimeSeconds.min : 600,
        maxSeconds: typeof this.info.estimatedTimeSeconds === 'object' ? this.info.estimatedTimeSeconds.max : 1800,
        display: this.formatTimeEstimate(
          typeof this.info.estimatedTimeSeconds === 'object' ? this.info.estimatedTimeSeconds.min : 600,
          typeof this.info.estimatedTimeSeconds === 'object' ? this.info.estimatedTimeSeconds.max : 1800
        ),
      },
      route: {
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token: 'USDC',
        steps: 1,
        description: this.createRouteDescription(sourceChainName, destChainName, 'USDC'),
      },
      // CCTP quotes don't expire
      expiry: undefined,
    };
  }

  /**
   * Estimate fees for a request
   */
  async estimateFees(_request: BridgeRequest): Promise<{ protocolFee: bigint; gasFee: bigint; totalUSD: number }> {
    // CCTP has no protocol fees
    const protocolFee = 0n;
    const gasFee = await this.estimateGasFee();

    return {
      protocolFee,
      gasFee,
      totalUSD: this.estimateGasInUSD(gasFee),
    };
  }

  /**
   * Initiate a bridge transaction
   */
  async initiateBridge(request: BridgeRequest): Promise<BridgeInitResult> {
    return this.cctpBridge.initiateBridge(request);
  }

  /**
   * Get current status of a bridge
   */
  async getStatus(messageHash: Hex): Promise<BridgeStatusResult> {
    return this.cctpBridge.getStatus(messageHash);
  }

  /**
   * Wait for attestation
   */
  async waitForAttestation(messageHash: Hex): Promise<Hex> {
    return this.cctpBridge.waitForAttestation(messageHash);
  }

  /**
   * Check if CCTP is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const chainId = await this.getSourceChainId();
      const config = getCCTPConfig(chainId);
      return config !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * CCTP reliability score
   * CCTP is highly reliable - backed by Circle with attestation guarantees
   */
  getReliabilityScore(): number {
    return 95; // Very high reliability
  }

  /**
   * Get the underlying CCTP bridge instance
   * Useful for advanced operations like completing bridges
   */
  getUnderlyingBridge(): CCTPBridge {
    return this.cctpBridge;
  }

  // ============ Private Helper Methods ============

  /**
   * Estimate gas fee for depositForBurn
   */
  private async estimateGasFee(): Promise<bigint> {
    try {
      // depositForBurn typically uses ~80k-120k gas
      const estimatedGas = 100000n;

      // Get current gas price
      const gasPrice = await this.sourceRpc.getGasPrice();

      return estimatedGas * gasPrice;
    } catch {
      // Default fallback: assume 100k gas at 30 gwei
      return 100000n * 30000000000n; // ~0.003 ETH
    }
  }

  /**
   * Estimate gas cost in USD
   */
  private estimateGasInUSD(gasFee: bigint): number {
    const gasInEth = Number(gasFee) / 1e18;
    return Math.round(gasInEth * this.ethPriceUSD * 100) / 100;
  }
}

/**
 * Create a CCTP adapter instance
 */
export function createCCTPAdapter(config: CCTPAdapterConfig): CCTPAdapter {
  return new CCTPAdapter(config);
}

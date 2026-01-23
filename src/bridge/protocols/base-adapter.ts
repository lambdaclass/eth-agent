/**
 * Base adapter class for bridge protocols
 * Provides common functionality for all bridge protocol adapters
 */

import type { Hex } from '../../core/types.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { Account } from '../../protocol/account.js';
import type {
  BridgeProtocolV2,
  BridgeProtocolInfo,
  BridgeRequest,
  BridgeQuote,
  BridgeInitResult,
  BridgeStatusResult,
} from '../types.js';

/**
 * Configuration for base adapter
 */
export interface BaseAdapterConfig {
  /** RPC client for the source chain */
  sourceRpc: RPCClient;
  /** Account for signing transactions */
  account: Account;
}

/**
 * Abstract base class for bridge protocol adapters
 * Implements BridgeProtocolV2 interface with common functionality
 */
export abstract class BaseBridgeAdapter implements BridgeProtocolV2 {
  /** Protocol information - must be implemented by subclasses */
  abstract readonly info: BridgeProtocolInfo;

  /** Protocol name (derived from info) */
  get name(): string {
    return this.info.name;
  }

  /** Supported tokens (derived from info) */
  get supportedTokens(): readonly string[] {
    return this.info.supportedTokens;
  }

  protected readonly sourceRpc: RPCClient;
  protected readonly account: Account;
  protected cachedChainId?: number;

  constructor(config: BaseAdapterConfig) {
    this.sourceRpc = config.sourceRpc;
    this.account = config.account;
  }

  /**
   * Get the source chain ID (cached)
   */
  protected async getSourceChainId(): Promise<number> {
    if (this.cachedChainId === undefined) {
      this.cachedChainId = await this.sourceRpc.getChainId();
    }
    return this.cachedChainId;
  }

  // ============ Abstract Methods (must be implemented) ============

  /**
   * Get list of supported chain IDs
   */
  abstract getSupportedChains(): number[];

  /**
   * Check if a route is supported
   */
  abstract isRouteSupported(sourceChainId: number, destChainId: number, token: string): boolean;

  /**
   * Get estimated time for bridging
   */
  abstract getEstimatedTime(): string;

  /**
   * Get a quote for a bridge request
   */
  abstract getQuote(request: BridgeRequest): Promise<BridgeQuote>;

  /**
   * Estimate fees for a request
   */
  abstract estimateFees(request: BridgeRequest): Promise<{ protocolFee: bigint; gasFee: bigint }>;

  /**
   * Initiate a bridge transaction
   */
  abstract initiateBridge(request: BridgeRequest): Promise<BridgeInitResult>;

  /**
   * Get current status of a bridge
   */
  abstract getStatus(messageHash: Hex): Promise<BridgeStatusResult>;

  /**
   * Wait for attestation/confirmation
   */
  abstract waitForAttestation(messageHash: Hex): Promise<Hex>;

  // ============ Default Implementations ============

  /**
   * Check if the protocol is currently available
   * Default implementation always returns true
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Basic availability check: verify we can get chain ID
      await this.getSourceChainId();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the protocol's reliability score (0-100)
   * Default implementation returns 80 (reasonably reliable)
   * Subclasses can override with actual metrics
   */
  getReliabilityScore(): number {
    return 80;
  }

  /**
   * Format time estimate for display
   */
  protected formatTimeEstimate(minSeconds: number, maxSeconds: number): string {
    const formatTime = (seconds: number): string => {
      if (seconds < 60) {
        return `${String(seconds)} seconds`;
      } else if (seconds < 3600) {
        const minutes = Math.round(seconds / 60);
        return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
      } else {
        const hours = Math.round(seconds / 3600);
        return `${String(hours)} hour${hours === 1 ? '' : 's'}`;
      }
    };

    if (minSeconds === maxSeconds) {
      return `~${formatTime(minSeconds)}`;
    }

    const minDisplay = formatTime(minSeconds);
    const maxDisplay = formatTime(maxSeconds);

    // Simplify if both are in same unit
    if (minSeconds >= 60 && maxSeconds >= 60 && minSeconds < 3600 && maxSeconds < 3600) {
      const minMinutes = Math.round(minSeconds / 60);
      const maxMinutes = Math.round(maxSeconds / 60);
      return `${String(minMinutes)}-${String(maxMinutes)} minutes`;
    }

    return `${minDisplay} - ${maxDisplay}`;
  }

  /**
   * Create a route description
   */
  protected createRouteDescription(
    sourceChainName: string,
    destChainName: string,
    token: string
  ): string {
    return `${token} via ${this.info.displayName}: ${sourceChainName} -> ${destChainName}`;
  }
}

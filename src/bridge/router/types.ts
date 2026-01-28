/**
 * Router-specific types for BridgeRouter
 * Internal types used by the route selection algorithm
 */

import type { Account } from '../../protocol/account.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { LimitsEngine } from '../../agent/limits.js';
import type { StablecoinInfo } from '../../stablecoins/index.js';
import type {
  BridgeProtocolV2,
  BridgeQuote,
  RoutePreference,
} from '../types.js';

/**
 * Configuration for BridgeRouter
 */
export interface BridgeRouterConfig {
  /** RPC client for the source chain */
  sourceRpc: RPCClient;
  /** Account for signing transactions */
  account: Account;
  /** Optional limits engine for spending limits */
  limitsEngine?: LimitsEngine;
  /** Enable fast CCTP mode (v2 API - seconds instead of minutes) */
  fast?: boolean;
  /** Enable debug logging */
  debug?: boolean;
  /**
   * ETH price in USD for gas fee estimation.
   * In production, consider fetching from a price oracle.
   * @default 2000
   */
  ethPriceUSD?: number;
}

/**
 * Information about a supported route
 */
export interface RouteInfo {
  /** Source chain ID */
  sourceChainId: number;
  /** Source chain name */
  sourceChainName: string;
  /** Destination chain ID */
  destinationChainId: number;
  /** Destination chain name */
  destinationChainName: string;
  /** Token symbol */
  token: string;
  /** Protocols that support this route */
  protocols: string[];
}

/**
 * Internal scoring result for a quote
 */
export interface ScoredQuote {
  /** The original quote */
  quote: BridgeQuote;
  /** Overall score (0-100) */
  score: number;
  /** Individual component scores */
  components: {
    /** Cost score (lower fees = higher score) */
    cost: number;
    /** Speed score (faster = higher score) */
    speed: number;
    /** Reliability score (based on protocol history) */
    reliability: number;
    /** Liquidity score (for amount vs available) */
    liquidity: number;
  };
  /** Weights used for scoring */
  weights: {
    cost: number;
    speed: number;
    reliability: number;
    liquidity: number;
  };
}

/**
 * Simplified bridge options for AgentWallet
 */
export interface SimpleBridgeOptions {
  /** The stablecoin to bridge */
  token: StablecoinInfo;
  /** Amount in human-readable format */
  amount: string | number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Recipient address (defaults to sender) */
  recipient?: string;
  /** Route selection preferences */
  preference?: RoutePreference;
}

/**
 * Options for waiting for bridge completion
 */
export interface WaitOptions {
  /** Maximum time to wait in milliseconds */
  timeout?: number;
  /** Polling interval in milliseconds */
  pollingInterval?: number;
  /** Callback for progress updates */
  onProgress?: (status: { progress: number; message: string }) => void;
}

/**
 * Registry entry for a protocol
 */
export interface ProtocolRegistryEntry {
  /** The protocol adapter */
  protocol: BridgeProtocolV2;
  /** Whether the protocol is enabled */
  enabled: boolean;
  /** Priority for selection (higher = preferred) */
  priority: number;
  /** Last known availability status */
  lastAvailableCheck?: {
    available: boolean;
    checkedAt: Date;
  };
}

/**
 * Filter criteria for finding protocols
 */
export interface ProtocolFilter {
  /** Filter by token support */
  token?: string;
  /** Filter by source chain support */
  sourceChainId?: number;
  /** Filter by destination chain support */
  destinationChainId?: number;
  /** Only include available protocols */
  onlyAvailable?: boolean;
}

/**
 * Weight configuration for route scoring
 */
export interface ScoringWeights {
  /** Weight for cost score (0-1) */
  cost: number;
  /** Weight for speed score (0-1) */
  speed: number;
  /** Weight for reliability score (0-1) */
  reliability: number;
  /** Weight for liquidity score (0-1) */
  liquidity: number;
}

/**
 * Default weights for different priority strategies
 */
export const DEFAULT_WEIGHTS: Record<RoutePreference['priority'], ScoringWeights> = {
  cost: { cost: 0.5, speed: 0.15, reliability: 0.25, liquidity: 0.1 },
  speed: { cost: 0.15, speed: 0.5, reliability: 0.25, liquidity: 0.1 },
  reliability: { cost: 0.2, speed: 0.15, reliability: 0.5, liquidity: 0.15 },
};

/**
 * Tracking ID generator options
 */
export interface TrackingIdOptions {
  /** Protocol name */
  protocol: string;
  /** Source chain ID */
  sourceChainId: number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Timestamp */
  timestamp?: number;
}

/**
 * Generate a unique tracking ID for a bridge operation
 */
export function generateTrackingId(options: TrackingIdOptions): string {
  const timestamp = options.timestamp ?? Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${options.protocol.toLowerCase()}-${String(options.sourceChainId)}-${String(options.destinationChainId)}-${String(timestamp)}-${randomSuffix}`;
}

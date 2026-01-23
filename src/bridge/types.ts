/**
 * Bridge types and interfaces
 * Core abstractions for cross-chain bridging
 */

import type { Address, Hash, Hex } from '../core/types.js';
import type { StablecoinInfo } from '../stablecoins/index.js';

/**
 * CCTP domain identifiers (Circle's internal chain IDs)
 * These are NOT EVM chain IDs but Circle-specific domain numbers
 */
export type CCTPDomain = 0 | 1 | 2 | 3 | 6 | 7;

/**
 * Bridge request parameters
 */
export interface BridgeRequest {
  /** The stablecoin to bridge */
  token: StablecoinInfo;
  /** Amount in human-readable format (e.g., "100" means 100 USDC) */
  amount: string | number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Recipient address on destination chain (defaults to sender) */
  recipient?: Address;
}

/**
 * Result from initiating a bridge transaction
 */
export interface BridgeInitResult {
  /** Whether the burn transaction succeeded */
  success: boolean;
  /** Transaction hash of the burn */
  burnTxHash: Hash;
  /** Hash of the CCTP message (used to query attestation) */
  messageHash: Hex;
  /** Raw message bytes (needed to complete bridge) */
  messageBytes: Hex;
  /** CCTP nonce for this message */
  nonce: bigint;
  /** Source chain ID */
  sourceChainId: number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Amount bridged */
  amount: {
    raw: bigint;
    formatted: string;
  };
  /** Recipient on destination chain */
  recipient: Address;
  /** Estimated time for attestation */
  estimatedTime: string;
}

/**
 * Result from completing a bridge transaction
 */
export interface BridgeCompleteResult {
  /** Whether the mint transaction succeeded */
  success: boolean;
  /** Transaction hash of the mint */
  mintTxHash: Hash;
  /** Amount minted */
  amount: {
    raw: bigint;
    formatted: string;
  };
  /** Recipient who received the funds */
  recipient: Address;
}

/**
 * Bridge status states
 */
export type BridgeStatus =
  | 'pending_burn'
  | 'burn_confirmed'
  | 'attestation_pending'
  | 'attestation_ready'
  | 'pending_mint'
  | 'completed'
  | 'failed';

/**
 * Result from querying bridge status
 */
export interface BridgeStatusResult {
  /** Current status of the bridge */
  status: BridgeStatus;
  /** Message hash being tracked */
  messageHash: Hex;
  /** Attestation signature (if available) */
  attestation?: Hex;
  /** Error message (if failed) */
  error?: string;
  /** Timestamp of last update */
  updatedAt: Date;
}

/**
 * Attestation API response status
 */
export type AttestationStatus = 'pending' | 'complete';

/**
 * Attestation API response
 */
export interface AttestationResponse {
  status: AttestationStatus;
  attestation?: Hex;
}

/**
 * Abstract bridge protocol interface
 * Allows for multiple bridge implementations (CCTP, LayerZero, etc.)
 */
export interface BridgeProtocol {
  /** Protocol name */
  readonly name: string;
  /** Tokens this protocol supports */
  readonly supportedTokens: readonly string[];

  /** Get list of supported chain IDs */
  getSupportedChains(): number[];

  /** Check if a route is supported */
  isRouteSupported(sourceChainId: number, destChainId: number, token: string): boolean;

  /** Get estimated time for bridging */
  getEstimatedTime(): string;

  /** Initiate a bridge transaction (burn on source) */
  initiateBridge(request: BridgeRequest): Promise<BridgeInitResult>;

  /** Get current status of a bridge */
  getStatus(messageHash: Hex): Promise<BridgeStatusResult>;

  /** Wait for attestation to be ready */
  waitForAttestation(messageHash: Hex): Promise<Hex>;
}

/**
 * Bridge limits configuration
 */
export interface BridgeLimits {
  /** Maximum per-transaction amount in USD */
  perTransactionUSD?: string | number;
  /** Maximum daily bridging amount in USD */
  perDayUSD?: string | number;
  /** Allowed destination chain IDs (whitelist) */
  allowedDestinations?: number[];
}

/**
 * Bridge spending record for limit tracking
 */
export interface BridgeSpendingRecord {
  /** Token symbol */
  token: string;
  /** Raw amount bridged */
  amount: bigint;
  /** USD equivalent (normalized to 6 decimals) */
  usdEquivalent: bigint;
  /** Destination chain ID */
  destinationChainId: number;
  /** Timestamp of bridge */
  timestamp: number;
}

// ============ Router Types ============

/**
 * Route selection preference
 */
export interface RoutePreference {
  /** Priority for route selection */
  priority: 'cost' | 'speed' | 'reliability';
  /** Maximum fee in USD */
  maxFeeUSD?: number;
  /** Maximum time in minutes */
  maxTimeMinutes?: number;
  /** Preferred protocols (whitelist) */
  preferredProtocols?: string[];
  /** Excluded protocols (blacklist) */
  excludeProtocols?: string[];
}

/**
 * Bridge quote from a protocol
 */
export interface BridgeQuote {
  /** Protocol name */
  protocol: string;
  /** Input amount (raw) */
  inputAmount: bigint;
  /** Output amount (raw) */
  outputAmount: bigint;
  /** Fee breakdown */
  fee: {
    /** Protocol fee */
    protocol: bigint;
    /** Gas fee */
    gas: bigint;
    /** Total fee (protocol + gas) */
    total?: bigint;
    /** Total fee in USD */
    totalUSD: number;
  };
  /** Slippage information (for protocols with variable output) */
  slippage?: {
    /** Expected slippage in basis points */
    expectedBps: number;
    /** Maximum allowed slippage in basis points */
    maxBps: number;
  };
  /** Estimated time */
  estimatedTime: {
    /** Minimum time in seconds */
    minSeconds?: number;
    /** Maximum time in seconds */
    maxSeconds?: number;
    /** Time in seconds (for backward compatibility) */
    seconds?: number;
    /** Human-readable display string */
    display: string;
  };
  /** Route information */
  route: {
    /** Source chain ID */
    sourceChainId?: number;
    /** Destination chain ID */
    destinationChainId?: number;
    /** Token symbol */
    token?: string;
    /** Number of steps */
    steps?: number;
    /** Route description */
    description: string;
  };
  /** Quote expiry time */
  expiry?: Date;
}

/**
 * Route comparison result
 */
export interface BridgeRouteComparison {
  /** All available quotes */
  quotes: BridgeQuote[];
  /** Recommended quote (null if none available) */
  recommended: BridgeQuote | null;
  /** Recommendation details */
  recommendation: {
    /** Reason for recommendation */
    reason?: string;
    /** Savings compared to alternatives */
    savings?: string;
  };
}

/**
 * Protocol information for display
 */
export interface BridgeProtocolInfo {
  /** Protocol identifier */
  name: string;
  /** Human-readable name */
  displayName: string;
  /** Supported token symbols */
  supportedTokens: readonly string[];
  /** Typical speed category */
  typicalSpeed: 'instant' | 'fast' | 'standard' | 'slow';
  /** Finality model */
  finalityModel: 'attestation' | 'optimistic' | 'lock-and-mint';
  /** Whether protocol charges fees */
  hasProtocolFees: boolean;
  /** Estimated time in seconds (optional) */
  estimatedTimeSeconds?: number | { min: number; max: number };
}

/**
 * Fee estimate from a protocol
 */
export interface BridgeFeeEstimate {
  /** Protocol fee (raw) */
  protocolFee: bigint;
  /** Gas fee estimate (raw) */
  gasFee: bigint;
  /** Total fee in USD (optional) */
  totalUSD?: number;
}

/**
 * Extended bridge protocol interface (V2)
 * Adds methods needed by the router
 */
export interface BridgeProtocolV2 extends BridgeProtocol {
  /** Protocol information */
  readonly info?: BridgeProtocolInfo;

  /** Check if protocol is currently available */
  isAvailable(): Promise<boolean>;

  /** Get a quote for a bridge request */
  getQuote(request: BridgeRequest): Promise<BridgeQuote>;

  /** Estimate fees for a bridge request */
  estimateFees(request: BridgeRequest): Promise<BridgeFeeEstimate>;

  /** Get reliability score (0-100) */
  getReliabilityScore(): number;
}

/**
 * Unified bridge result
 */
export interface UnifiedBridgeResult {
  /** Whether the bridge was initiated successfully */
  success: boolean;
  /** Protocol used */
  protocol: string;
  /** Tracking ID for this bridge */
  trackingId: string;
  /** Source transaction hash */
  sourceTxHash: Hash;
  /** Amount bridged */
  amount: {
    raw: bigint;
    formatted: string;
  };
  /** Fee paid */
  fee: {
    raw: bigint;
    formatted: string;
    usd: number;
  };
  /** Source chain info */
  sourceChain: {
    id: number;
    name: string;
  };
  /** Destination chain info */
  destinationChain: {
    id: number;
    name: string;
  };
  /** Recipient address */
  recipient: Address;
  /** Estimated time to complete */
  estimatedTime: {
    minSeconds: number;
    maxSeconds: number;
    display: string;
  };
  /** Human-readable summary */
  summary: string;
  /** Protocol-specific data (CCTP: messageHash, messageBytes, nonce) */
  protocolData: {
    messageHash?: Hex;
    messageBytes?: Hex;
    nonce?: string;
    [key: string]: unknown;
  };
}

/**
 * Unified bridge status
 */
export interface UnifiedBridgeStatus {
  /** Tracking ID */
  trackingId: string;
  /** Protocol name */
  protocol: string;
  /** Current status */
  status: BridgeStatus;
  /** Source transaction hash */
  sourceTxHash: Hash;
  /** Destination transaction hash (if completed) */
  destinationTxHash?: Hash;
  /** Amount */
  amount: {
    raw: bigint;
    formatted: string;
  };
  /** Progress percentage (0-100) */
  progress: number;
  /** Status message */
  message: string;
  /** Last update time */
  updatedAt: Date;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Bridge preview (before execution)
 */
export interface BridgePreview {
  /** Whether the bridge can proceed */
  canBridge: boolean;
  /** Reasons why bridge cannot proceed */
  blockers: string[];
  /** Recommended quote */
  quote: BridgeQuote | null;
  /** All available quotes */
  allQuotes: BridgeQuote[];
  /** Source chain info */
  sourceChain: {
    id: number;
    name: string;
  };
  /** Destination chain info */
  destinationChain: {
    id: number;
    name: string;
  };
  /** Amount to bridge */
  amount: {
    raw: bigint;
    formatted: string;
  };
  /** Current balance */
  balance: {
    raw: bigint;
    formatted: string;
  };
  /** Whether token approval is needed */
  needsApproval: boolean;
}

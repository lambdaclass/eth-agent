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

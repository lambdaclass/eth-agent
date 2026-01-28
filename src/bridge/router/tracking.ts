/**
 * Tracking ID Registry - Unified tracking ID system for bridge operations
 *
 * Creates and parses tracking IDs that encode protocol information,
 * enabling getStatus(trackingId) without requiring the caller to know
 * which protocol was used.
 *
 * Format: bridge_<protocol>_<sourceChainId>_<destChainId>_<identifier>
 *
 * Examples:
 *   "bridge_cctp_1_8453_0xabc123..."     (CCTP message hash, Ethereum -> Base)
 *   "bridge_across_42161_1_12345"        (Across deposit ID, Arbitrum -> Ethereum)
 *   "bridge_stargate_10_137_0xdef456"    (Stargate tx hash, Optimism -> Polygon)
 *
 * Legacy format (still supported for parsing):
 *   "bridge_cctp_1_0xabc123..."          (old format without destChainId)
 */

import type { Hex } from '../../core/types.js';

/**
 * Protocol-agnostic tracking information
 */
export interface ProtocolTrackingInfo {
  /** Protocol name (e.g., 'CCTP', 'Across', 'Stargate') */
  protocol: string;
  /** Protocol-specific identifier (messageHash, depositId, txHash) */
  identifier: string;
  /** Type of identifier for reference */
  identifierType: 'messageHash' | 'depositId' | 'txHash';
}

/**
 * Parsed tracking ID components
 */
export interface ParsedTrackingId {
  /** Protocol name (lowercase) */
  protocol: string;
  /** Source chain ID */
  sourceChainId: number;
  /** Destination chain ID (may be undefined for legacy tracking IDs) */
  destinationChainId?: number;
  /** Protocol-specific identifier */
  identifier: string;
}

/**
 * Options for creating a tracking ID
 */
export interface CreateTrackingIdOptions {
  /** Protocol tracking info */
  info: ProtocolTrackingInfo;
  /** Source chain ID */
  sourceChainId: number;
  /** Destination chain ID */
  destinationChainId?: number;
}

/**
 * Bridge metadata stored for completion tracking
 */
export interface BridgeMetadata {
  /** Message bytes (needed for CCTP completion check) */
  messageBytes?: Hex;
  /** Nonce from the bridge message */
  nonce?: bigint;
  /** Source domain (CCTP-specific) */
  sourceDomain?: number;
  /** Destination domain (CCTP-specific) */
  destinationDomain?: number;
  /** Destination chain ID */
  destinationChainId?: number;
  /** Bridge amount (raw, in token's smallest unit) */
  amount?: bigint;
  /** Recipient address on destination chain */
  recipient?: string;
  /** Timestamp when bridge was initiated */
  createdAt: number;
}

/**
 * Tracking ID prefix
 */
const TRACKING_ID_PREFIX = 'bridge';

/**
 * Tracking ID Registry
 * Manages creation and parsing of unified tracking IDs
 */
export class TrackingRegistry {
  /** Stored metadata for bridges (keyed by tracking ID) */
  private metadata: Map<string, BridgeMetadata> = new Map();

  /**
   * Create a unified tracking ID from protocol-specific info
   *
   * @param options - Protocol tracking info and chain IDs
   * @returns Unified tracking ID string
   *
   * @example
   * ```typescript
   * const trackingId = registry.createTrackingId({
   *   info: {
   *     protocol: 'CCTP',
   *     identifier: '0xabc123...',
   *     identifierType: 'messageHash',
   *   },
   *   sourceChainId: 1,
   *   destinationChainId: 8453,
   * });
   * // Returns: "bridge_cctp_1_8453_0xabc123..."
   * ```
   */
  createTrackingId(options: CreateTrackingIdOptions): string {
    const { info, sourceChainId, destinationChainId } = options;
    const protocolLower = info.protocol.toLowerCase();
    const identifier = this.normalizeIdentifier(info.identifier);

    // Include destination chain ID if provided (new format)
    if (destinationChainId !== undefined) {
      return `${TRACKING_ID_PREFIX}_${protocolLower}_${String(sourceChainId)}_${String(destinationChainId)}_${identifier}`;
    }

    // Legacy format without destination chain ID
    return `${TRACKING_ID_PREFIX}_${protocolLower}_${String(sourceChainId)}_${identifier}`;
  }

  /**
   * Store metadata for a bridge (for completion tracking)
   */
  storeMetadata(trackingId: string, meta: Omit<BridgeMetadata, 'createdAt'>): void {
    this.metadata.set(trackingId, {
      ...meta,
      createdAt: Date.now(),
    });
  }

  /**
   * Get metadata for a bridge
   */
  getMetadata(trackingId: string): BridgeMetadata | undefined {
    return this.metadata.get(trackingId);
  }

  /**
   * Parse a tracking ID back to its components
   * Supports both new format (with destChainId) and legacy format (without)
   *
   * @param trackingId - Unified tracking ID string
   * @returns Parsed components or null if invalid
   *
   * @example
   * ```typescript
   * // New format
   * const parsed = registry.parseTrackingId('bridge_cctp_1_8453_0xabc123...');
   * // Returns: { protocol: 'cctp', sourceChainId: 1, destinationChainId: 8453, identifier: '0xabc123...' }
   *
   * // Legacy format
   * const parsed = registry.parseTrackingId('bridge_cctp_1_0xabc123...');
   * // Returns: { protocol: 'cctp', sourceChainId: 1, identifier: '0xabc123...' }
   * ```
   */
  parseTrackingId(trackingId: string): ParsedTrackingId | null {
    // Expected formats:
    // New: bridge_<protocol>_<sourceChainId>_<destChainId>_<identifier>
    // Legacy: bridge_<protocol>_<sourceChainId>_<identifier>
    const parts = trackingId.split('_');

    if (parts.length < 4) {
      return null;
    }

    const [prefix, protocol, sourceChainIdStr, ...rest] = parts;

    if (prefix !== TRACKING_ID_PREFIX) {
      return null;
    }

    if (!protocol) {
      return null;
    }

    const sourceChainId = Number(sourceChainIdStr);
    if (Number.isNaN(sourceChainId)) {
      return null;
    }

    // Try to detect if this is new format (with destChainId) or legacy
    // If the third part is a number and there are more parts, it's likely destChainId
    if (rest.length >= 2) {
      const possibleDestChainId = Number(rest[0]);
      // Check if it looks like a chain ID (number) and identifier follows
      // Chain IDs are typically 1-6 digits, identifiers often start with 0x
      if (!Number.isNaN(possibleDestChainId) && rest[1] &&
          (rest[1].startsWith('0x') || rest.length > 2)) {
        // New format with destination chain ID
        const identifier = rest.slice(1).join('_');
        if (!identifier) {
          return null;
        }
        return {
          protocol,
          sourceChainId,
          destinationChainId: possibleDestChainId,
          identifier,
        };
      }
    }

    // Legacy format: identifier starts at rest[0]
    const identifier = rest.join('_');
    if (!identifier) {
      return null;
    }

    // Check stored metadata for destination chain ID (if available)
    const meta = this.metadata.get(trackingId);

    return {
      protocol,
      sourceChainId,
      destinationChainId: meta?.destinationChainId,
      identifier,
    };
  }

  /**
   * Check if a string is a valid tracking ID
   */
  isValidTrackingId(trackingId: string): boolean {
    return this.parseTrackingId(trackingId) !== null;
  }

  /**
   * Get the protocol name from a tracking ID
   */
  getProtocol(trackingId: string): string | null {
    const parsed = this.parseTrackingId(trackingId);
    return parsed?.protocol ?? null;
  }

  /**
   * Get the identifier (message hash, deposit ID, etc.) from a tracking ID
   */
  getIdentifier(trackingId: string): string | null {
    const parsed = this.parseTrackingId(trackingId);
    return parsed?.identifier ?? null;
  }

  /**
   * Get the identifier as a Hex type (for CCTP message hashes)
   */
  getIdentifierAsHex(trackingId: string): Hex | null {
    const identifier = this.getIdentifier(trackingId);
    if (!identifier) {
      return null;
    }

    // Check if it looks like a hex string
    if (identifier.startsWith('0x')) {
      return identifier as Hex;
    }

    return null;
  }

  /**
   * Normalize an identifier for consistent formatting
   */
  private normalizeIdentifier(identifier: string): string {
    // Lowercase hex identifiers for consistency
    if (identifier.startsWith('0x')) {
      return identifier.toLowerCase();
    }
    return identifier;
  }
}

/**
 * Default tracking registry instance
 */
let defaultRegistry: TrackingRegistry | null = null;

/**
 * Get the default tracking registry instance
 */
export function getTrackingRegistry(): TrackingRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new TrackingRegistry();
  }
  return defaultRegistry;
}

/**
 * Create a tracking ID using the default registry
 */
export function createTrackingId(options: CreateTrackingIdOptions): string {
  return getTrackingRegistry().createTrackingId(options);
}

/**
 * Parse a tracking ID using the default registry
 */
export function parseTrackingId(trackingId: string): ParsedTrackingId | null {
  return getTrackingRegistry().parseTrackingId(trackingId);
}

/**
 * Check if a tracking ID is valid using the default registry
 */
export function isValidTrackingId(trackingId: string): boolean {
  return getTrackingRegistry().isValidTrackingId(trackingId);
}

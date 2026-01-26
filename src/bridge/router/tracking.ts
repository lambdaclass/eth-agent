/**
 * Tracking ID Registry - Unified tracking ID system for bridge operations
 *
 * Creates and parses tracking IDs that encode protocol information,
 * enabling getStatus(trackingId) without requiring the caller to know
 * which protocol was used.
 *
 * Format: bridge_<protocol>_<sourceChainId>_<identifier>
 *
 * Examples:
 *   "bridge_cctp_1_0xabc123..."     (CCTP message hash)
 *   "bridge_across_42161_12345"     (Across deposit ID)
 *   "bridge_stargate_10_0xdef456"   (Stargate tx hash)
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
  /**
   * Create a unified tracking ID from protocol-specific info
   *
   * @param options - Protocol tracking info and source chain ID
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
   * });
   * // Returns: "bridge_cctp_1_0xabc123..."
   * ```
   */
  createTrackingId(options: CreateTrackingIdOptions): string {
    const { info, sourceChainId } = options;
    const protocolLower = info.protocol.toLowerCase();
    const identifier = this.normalizeIdentifier(info.identifier);

    return `${TRACKING_ID_PREFIX}_${protocolLower}_${String(sourceChainId)}_${identifier}`;
  }

  /**
   * Parse a tracking ID back to its components
   *
   * @param trackingId - Unified tracking ID string
   * @returns Parsed components or null if invalid
   *
   * @example
   * ```typescript
   * const parsed = registry.parseTrackingId('bridge_cctp_1_0xabc123...');
   * // Returns: { protocol: 'cctp', sourceChainId: 1, identifier: '0xabc123...' }
   * ```
   */
  parseTrackingId(trackingId: string): ParsedTrackingId | null {
    // Expected format: bridge_<protocol>_<chainId>_<identifier>
    // The identifier may contain underscores, so we split with limit
    const parts = trackingId.split('_');

    if (parts.length < 4) {
      return null;
    }

    const [prefix, protocol, chainIdStr, ...identifierParts] = parts;

    if (prefix !== TRACKING_ID_PREFIX) {
      return null;
    }

    if (!protocol) {
      return null;
    }

    const sourceChainId = Number(chainIdStr);
    if (Number.isNaN(sourceChainId)) {
      return null;
    }

    // Rejoin identifier parts in case it contained underscores
    const identifier = identifierParts.join('_');
    if (!identifier) {
      return null;
    }

    return {
      protocol,
      sourceChainId,
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

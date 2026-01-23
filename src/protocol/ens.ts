/**
 * ENS (Ethereum Name Service) resolution
 * Resolve .eth names to addresses and vice versa
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { keccak256 } from '../core/hash.js';
import { encodeFunctionCall, decodeFunctionResult } from '../core/abi.js';
import { bytesToHex, concatHex } from '../core/hex.js';
import { LRUCache } from '../core/cache.js';
import { addressEquals } from '../core/address.js';
import type { RPCClient } from './rpc.js';

// ENS Registry address (same on mainnet, testnets)
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address;

// Zero address constant
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Options for ENS resolution
 */
export interface ENSResolveOptions {
  /** Skip cache lookup and force fresh resolution */
  skipCache?: boolean;
  /** Custom TTL for this resolution in milliseconds */
  ttl?: number;
}

/**
 * ENS client for name resolution
 */
export class ENS {
  private readonly addressCache: LRUCache<string, Address | null>;

  /**
   * Create a new ENS client
   * @param rpc RPC client for Ethereum calls
   * @param cacheSize Maximum number of cached entries (default: 100)
   * @param cacheTTL Default cache TTL in milliseconds (default: 300000 = 5 minutes)
   */
  constructor(
    private readonly rpc: RPCClient,
    cacheSize = 100,
    cacheTTL = 300000
  ) {
    this.addressCache = new LRUCache<string, Address | null>(cacheSize, cacheTTL);
  }

  /**
   * Resolve an ENS name to an address
   * Results are cached to prevent TOCTOU vulnerabilities and reduce RPC calls
   * @param name ENS name to resolve (e.g., "vitalik.eth" or "vitalik")
   * @param options Optional resolution options
   */
  async resolve(name: string, options?: ENSResolveOptions): Promise<Address | null> {
    // Validate name
    if (!name.endsWith('.eth') && !name.includes('.')) {
      name = `${name}.eth`;
    }

    // Normalize for cache key
    const cacheKey = name.toLowerCase();

    // Check cache first (unless skipCache is set)
    if (options?.skipCache !== true) {
      const cached = this.addressCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    const node = namehash(name);

    // Get resolver for this name
    const resolver = await this.getResolver(node);
    if (!resolver) {
      // Cache null results to prevent repeated lookups for non-existent names
      this.addressCache.set(cacheKey, null, options?.ttl);
      return null;
    }

    // Call resolver's addr(bytes32) function
    const data = encodeFunctionCall('addr(bytes32)', [node]);

    try {
      const result = await this.rpc.call({ to: resolver, data });

      if (result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        this.addressCache.set(cacheKey, null, options?.ttl);
        return null;
      }

      // Decode address (last 20 bytes of 32-byte response)
      const decoded = decodeFunctionResult('addr(bytes32) returns (address)', result);
      const address = decoded[0] as Address;

      // Cache the result
      this.addressCache.set(cacheKey, address, options?.ttl);

      return address;
    } catch {
      // Don't cache errors - allow retry
      return null;
    }
  }

  /**
   * Clear the address resolution cache
   */
  clearCache(): void {
    this.addressCache.clear();
  }

  /**
   * Invalidate a specific name from the cache
   */
  invalidateCache(name: string): boolean {
    if (!name.endsWith('.eth') && !name.includes('.')) {
      name = `${name}.eth`;
    }
    return this.addressCache.delete(name.toLowerCase());
  }

  /**
   * Reverse resolve an address to an ENS name
   */
  async reverse(address: Address): Promise<string | null> {
    // Reverse records are stored at <address>.addr.reverse
    const reverseNode = namehash(`${address.slice(2).toLowerCase()}.addr.reverse`);

    // Get resolver
    const resolver = await this.getResolver(reverseNode);
    if (!resolver) return null;

    // Call name(bytes32)
    const data = encodeFunctionCall('name(bytes32)', [reverseNode]);

    try {
      const result = await this.rpc.call({ to: resolver, data });

      if (result === '0x') return null;

      const decoded = decodeFunctionResult('name(bytes32) returns (string)', result);
      const name = decoded[0] as string;

      if (!name) return null;

      // Verify forward resolution matches (security check)
      const forward = await this.resolve(name);
      if (!forward || !addressEquals(forward, address)) {
        return null; // Forward resolution doesn't match
      }

      return name;
    } catch {
      return null;
    }
  }

  /**
   * Get text record for a name
   */
  async getText(name: string, key: string): Promise<string | null> {
    if (!name.endsWith('.eth') && !name.includes('.')) {
      name = `${name}.eth`;
    }

    const node = namehash(name);
    const resolver = await this.getResolver(node);
    if (!resolver) return null;

    const data = encodeFunctionCall('text(bytes32,string)', [node, key]);

    try {
      const result = await this.rpc.call({ to: resolver, data });

      if (result === '0x') return null;

      const decoded = decodeFunctionResult('text(bytes32,string) returns (string)', result);
      return (decoded[0] as string) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get content hash for a name
   */
  async getContentHash(name: string): Promise<Hex | null> {
    if (!name.endsWith('.eth') && !name.includes('.')) {
      name = `${name}.eth`;
    }

    const node = namehash(name);
    const resolver = await this.getResolver(node);
    if (!resolver) return null;

    const data = encodeFunctionCall('contenthash(bytes32)', [node]);

    try {
      const result = await this.rpc.call({ to: resolver, data });

      if (result === '0x') return null;

      const decoded = decodeFunctionResult('contenthash(bytes32) returns (bytes)', result);
      return (decoded[0] as Hex) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get resolver address for a node
   */
  private async getResolver(node: Hash): Promise<Address | null> {
    const data = encodeFunctionCall('resolver(bytes32)', [node]);

    try {
      const result = await this.rpc.call({ to: ENS_REGISTRY, data });

      if (result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return null;
      }

      const decoded = decodeFunctionResult('resolver(bytes32) returns (address)', result);
      const resolver = decoded[0] as Address;

      if (resolver === ZERO_ADDRESS) {
        return null;
      }

      return resolver;
    } catch {
      return null;
    }
  }
}

/**
 * Compute ENS namehash
 * namehash('') = 0x0000...
 * namehash('eth') = keccak256(namehash('') + keccak256('eth'))
 * namehash('foo.eth') = keccak256(namehash('eth') + keccak256('foo'))
 */
export function namehash(name: string): Hash {
  // Start with empty hash
  let node = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hash;

  if (!name) return node;

  // Split and reverse labels
  const labels = name.split('.').reverse();

  for (const label of labels) {
    if (!label) continue;

    // Normalize label (lowercase, NFC normalization)
    const normalized = label.toLowerCase().normalize('NFC');

    // Hash the label
    const labelHash = keccak256(normalized);

    // Combine with previous node hash
    const combined = concatHex(node, labelHash);
    node = keccak256(combined) as Hash;
  }

  return node;
}

/**
 * Encode DNS-style name (used in ENSIP-10)
 */
export function dnsEncode(name: string): Hex {
  const labels = name.split('.');
  const parts: Uint8Array[] = [];

  for (const label of labels) {
    const encoded = new TextEncoder().encode(label);
    if (encoded.length > 255) {
      throw new Error(`Label too long: ${label}`);
    }
    parts.push(new Uint8Array([encoded.length]));
    parts.push(encoded);
  }

  // Add terminating zero
  parts.push(new Uint8Array([0]));

  // Combine all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return bytesToHex(result);
}

/**
 * Check if a string is a valid ENS name
 */
export function isENSName(name: string): boolean {
  if (!name) return false;
  if (name.startsWith('.') || name.endsWith('.')) return false;

  const labels = name.split('.');
  if (labels.length === 0) return false;

  for (const label of labels) {
    // Must have at least one character
    if (!label) return false;
    // Can't start or end with hyphen
    if (label.startsWith('-') || label.endsWith('-')) return false;
    // Basic character check (relaxed for international names)
    if (!/^[a-z0-9\-_\u00a0-\uffff]+$/i.test(label)) return false;
  }

  return true;
}

/**
 * Resolve address or ENS name
 * Returns address if already an address, resolves if ENS name
 */
export async function resolveAddress(
  addressOrName: string,
  rpc: RPCClient
): Promise<Address> {
  // Already an address
  if (addressOrName.startsWith('0x') && addressOrName.length === 42) {
    return addressOrName as Address;
  }

  // ENS name
  const ens = new ENS(rpc);
  const resolved = await ens.resolve(addressOrName);

  if (!resolved) {
    throw new Error(`Failed to resolve ENS name: ${addressOrName}`);
  }

  return resolved;
}

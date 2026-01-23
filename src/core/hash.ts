/**
 * Cryptographic hash functions
 * Wrapper around @noble/hashes for Ethereum-specific hashing
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2';
import { ripemd160 as nobleRipemd160 } from '@noble/hashes/legacy';
import type { Hash, Hex } from './types.js';
import { bytesToHex, hexToBytes, isHex, stringToHex } from './hex.js';

/**
 * Compute keccak256 hash
 * This is the hash function used throughout Ethereum
 */
export function keccak256(data: Hex | Uint8Array | string): Hash {
  let bytes: Uint8Array;

  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (isHex(data)) {
    bytes = hexToBytes(data);
  } else {
    // String input - encode as UTF-8
    bytes = hexToBytes(stringToHex(data));
  }

  const hash = keccak_256(bytes);
  return bytesToHex(hash) as Hash;
}

/**
 * Compute SHA256 hash
 */
export function sha256(data: Hex | Uint8Array | string): Hash {
  let bytes: Uint8Array;

  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (isHex(data)) {
    bytes = hexToBytes(data);
  } else {
    bytes = hexToBytes(stringToHex(data));
  }

  const hash = nobleSha256(bytes);
  return bytesToHex(hash) as Hash;
}

/**
 * Compute RIPEMD160 hash
 */
export function ripemd160(data: Hex | Uint8Array | string): Hex {
  let bytes: Uint8Array;

  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (isHex(data)) {
    bytes = hexToBytes(data);
  } else {
    bytes = hexToBytes(stringToHex(data));
  }

  const hash = nobleRipemd160(bytes);
  return bytesToHex(hash);
}

/**
 * Compute function selector from function signature
 * e.g., "transfer(address,uint256)" -> "0xa9059cbb"
 */
export function functionSelector(signature: string): Hex {
  const hash = keccak256(signature);
  return `0x${hash.slice(2, 10)}` as Hex;
}

/**
 * Compute event topic from event signature
 * e.g., "Transfer(address,address,uint256)" -> full keccak256 hash
 */
export function eventTopic(signature: string): Hash {
  return keccak256(signature);
}

/**
 * Hash a message according to EIP-191 personal sign
 * Prepends "\x19Ethereum Signed Message:\n" + length
 */
export function hashMessage(message: string | Uint8Array): Hash {
  let messageBytes: Uint8Array;

  if (typeof message === 'string') {
    const encoder = new TextEncoder();
    messageBytes = encoder.encode(message);
  } else {
    messageBytes = message;
  }

  const prefix = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
  const prefixBytes = new TextEncoder().encode(prefix);

  const combined = new Uint8Array(prefixBytes.length + messageBytes.length);
  combined.set(prefixBytes);
  combined.set(messageBytes, prefixBytes.length);

  return keccak256(combined);
}

/**
 * Hash typed data according to EIP-712
 * This is a simplified version - full implementation requires domain separator and type hashing
 */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

export interface TypedDataField {
  name: string;
  type: string;
}

export interface TypedData {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Encode a single type for EIP-712 type hash
 */
function encodeType(primaryType: string, types: Record<string, TypedDataField[]>): string {
  const deps = new Set<string>();

  function findDeps(type: string): void {
    if (deps.has(type)) return;
    if (!types[type]) return;
    deps.add(type);
    const fields = types[type];
    if (!fields) return;
    for (const field of fields) {
      const baseType = field.type.replace(/\[\d*\]$/, '');
      findDeps(baseType);
    }
  }

  findDeps(primaryType);
  deps.delete(primaryType);

  const sortedDeps = [...deps].sort();
  let result = `${primaryType}(${(types[primaryType] ?? []).map((f) => `${f.type} ${f.name}`).join(',')})`;

  for (const dep of sortedDeps) {
    const depFields = types[dep];
    if (depFields) {
      result += `${dep}(${depFields.map((f) => `${f.type} ${f.name}`).join(',')})`;
    }
  }

  return result;
}

/**
 * Compute EIP-712 type hash
 */
export function typeHash(primaryType: string, types: Record<string, TypedDataField[]>): Hash {
  return keccak256(encodeType(primaryType, types));
}

/**
 * Compute domain separator for EIP-712
 */
export function domainSeparator(domain: TypedDataDomain): Hash {
  const types: Record<string, TypedDataField[]> = {
    EIP712Domain: [],
  };

  const domainFields = types['EIP712Domain'];
  if (!domainFields) {
    throw new Error('EIP712Domain not found');
  }

  const values: unknown[] = [];

  if (domain.name !== undefined) {
    domainFields.push({ name: 'name', type: 'string' });
    values.push(domain.name);
  }
  if (domain.version !== undefined) {
    domainFields.push({ name: 'version', type: 'string' });
    values.push(domain.version);
  }
  if (domain.chainId !== undefined) {
    domainFields.push({ name: 'chainId', type: 'uint256' });
    values.push(domain.chainId);
  }
  if (domain.verifyingContract !== undefined) {
    domainFields.push({ name: 'verifyingContract', type: 'address' });
    values.push(domain.verifyingContract);
  }
  if (domain.salt !== undefined) {
    domainFields.push({ name: 'salt', type: 'bytes32' });
    values.push(domain.salt);
  }

  // For now, return a placeholder - full implementation requires ABI encoding
  const typeStr = encodeType('EIP712Domain', types);
  return keccak256(typeStr);
}

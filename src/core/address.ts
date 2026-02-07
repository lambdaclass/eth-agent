/**
 * Ethereum address utilities
 * Validation, checksum encoding (EIP-55)
 */

import type { Address, Hex } from './types.js';
import { keccak256 } from './hash.js';
import { isHex } from './hex.js';
import { encode as rlpEncode } from './rlp.js';

/**
 * Check if a string is a valid Ethereum address (with or without checksum)
 */
export function isAddress(value: unknown): value is Address {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('0x') && !value.startsWith('0X')) return false;
  if (value.length !== 42) return false;
  if (!isHex(value)) return false;
  return true;
}

/**
 * Assert that a value is a valid Ethereum address
 */
export function assertAddress(value: unknown, name = 'address'): asserts value is Address {
  if (!isAddress(value)) {
    throw new Error(
      `${name} must be a valid Ethereum address (0x followed by 40 hex characters), got: ${String(value)}`
    );
  }
}

/**
 * Convert an address to checksum format (EIP-55)
 */
export function toChecksumAddress(address: string): Address {
  if (!address.startsWith('0x') || address.length !== 42) {
    throw new Error(`Invalid address: ${address}`);
  }

  // Remove 0x and convert to lowercase
  const addr = address.slice(2).toLowerCase();

  // Compute keccak256 hash of the lowercase address
  const hash = keccak256(addr);

  let checksumAddress = '0x';

  for (let i = 0; i < 40; i++) {
    const char = addr[i];
    const hashChar = hash[i + 2]; // Skip '0x' prefix

    if (char === undefined || hashChar === undefined) {
      throw new Error('Invalid address');
    }

    // If the hash character is >= 8, uppercase the address character
    const hashValue = parseInt(hashChar, 16);
    if (hashValue >= 8) {
      checksumAddress += char.toUpperCase();
    } else {
      checksumAddress += char;
    }
  }

  return checksumAddress as Address;
}

/**
 * Verify that an address has a valid checksum
 */
export function isChecksumValid(address: string): boolean {
  if (!isAddress(address)) return false;

  // If all lowercase or all uppercase (after 0x), checksum is not present but valid
  const addrPart = address.slice(2);
  if (addrPart === addrPart.toLowerCase() || addrPart === addrPart.toUpperCase()) {
    return true;
  }

  // Otherwise verify the checksum
  try {
    const checksummed = toChecksumAddress(address);
    return address === checksummed;
  } catch {
    return false;
  }
}

/**
 * Normalize an address to EIP-55 checksum format
 * This is the canonical form for Ethereum addresses
 */
export function normalizeAddress(address: string): Address {
  assertAddress(address);
  return toChecksumAddress(address);
}

/**
 * Compare two addresses (case-insensitive)
 */
export function addressEquals(a: string, b: string): boolean {
  if (!isAddress(a) || !isAddress(b)) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Check if an address is the zero address
 */
export function isZeroAddress(address: string): boolean {
  if (!isAddress(address)) return false;
  return address.toLowerCase() === '0x0000000000000000000000000000000000000000';
}

/**
 * The zero address constant
 */
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Pad a hex value to 20 bytes (address length)
 */
export function padToAddress(hex: string): Address {
  if (!isHex(hex)) {
    throw new Error(`Invalid hex value: ${hex}`);
  }

  const hexPart = hex.slice(2).padStart(40, '0');

  if (hexPart.length > 40) {
    throw new Error(`Value too large for address: ${hex}`);
  }

  return `0x${hexPart}` as Address;
}

/**
 * Extract address from a 32-byte word (common in event logs and ABI encoding)
 */
export function extractAddress(word: string): Address {
  if (!isHex(word)) {
    throw new Error(`Invalid hex value: ${word}`);
  }

  // Take last 40 characters (20 bytes)
  const hexPart = word.slice(2);
  const addressPart = hexPart.slice(-40);

  // Verify leading bytes are zeros
  const leadingPart = hexPart.slice(0, -40);
  if (leadingPart && !/^0*$/.test(leadingPart)) {
    throw new Error(`Invalid address word (non-zero leading bytes): ${word}`);
  }

  return `0x${addressPart}` as Address;
}

/**
 * Create a contract address from deployer address and nonce
 */
export function computeContractAddress(from: Address, nonce: number): Address {
  const rlp = rlpEncode([from, nonce]);
  const hash = keccak256(rlp);

  return `0x${hash.slice(-40)}` as Address;
}

/**
 * Create a contract address using CREATE2
 */
export function computeCreate2Address(
  from: Address,
  salt: Hex,
  initCodeHash: Hex
): Address {
  // CREATE2 address = keccak256(0xff ++ from ++ salt ++ keccak256(initCode))[12:]
  const prefix = '0xff';
  const fromNormalized = from.slice(2).toLowerCase();
  const saltNormalized = salt.slice(2).padStart(64, '0');
  const hashNormalized = initCodeHash.slice(2);

  const data = `0x${prefix.slice(2)}${fromNormalized}${saltNormalized}${hashNormalized}` as Hex;
  const hash = keccak256(data);

  return `0x${hash.slice(-40)}` as Address;
}

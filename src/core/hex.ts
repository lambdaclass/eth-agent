/**
 * Hex string utilities
 * Zero-dependency hex encoding/decoding
 */

import type { Hex } from './types.js';

// Lookup tables for fast hex encoding/decoding
const hexChars = '0123456789abcdef';
const hexToByteMap = new Map<string, number>();
for (let i = 0; i < 256; i++) {
  const hex = i.toString(16).padStart(2, '0');
  hexToByteMap.set(hex, i);
  hexToByteMap.set(hex.toUpperCase(), i);
}

/**
 * Check if a value is a valid hex string
 */
export function isHex(value: unknown): value is Hex {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('0x')) return false;
  if (value.length < 2) return false;
  // Check if all characters after 0x are valid hex characters
  const hexPart = value.slice(2);
  return /^[0-9a-fA-F]*$/.test(hexPart);
}

/**
 * Assert that a value is a valid hex string
 */
export function assertHex(value: unknown, name = 'value'): asserts value is Hex {
  if (!isHex(value)) {
    throw new Error(`${name} must be a valid hex string starting with 0x, got: ${String(value)}`);
  }
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): Hex {
  let hex = '0x';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    hex += hexChars[byte >> 4];
    hex += hexChars[byte & 0x0f];
  }
  return hex as Hex;
}

/**
 * Convert hex string to bytes
 * Accepts both uppercase and lowercase hex characters
 */
export function hexToBytes(hex: Hex): Uint8Array {
  assertHex(hex);
  const hexStr = hex.slice(2).toLowerCase(); // Normalize to lowercase for consistent lookup
  // Pad with leading zero if odd length
  const paddedHex = hexStr.length % 2 === 0 ? hexStr : '0' + hexStr;
  const bytes = new Uint8Array(paddedHex.length / 2);

  for (let i = 0; i < paddedHex.length; i += 2) {
    const byteHex = paddedHex.slice(i, i + 2);
    const byte = hexToByteMap.get(byteHex);
    if (byte === undefined) {
      throw new Error(`Invalid hex character at position ${i}: ${byteHex}`);
    }
    bytes[i / 2] = byte;
  }

  return bytes;
}

/**
 * Convert a number or bigint to hex string
 */
export function numberToHex(value: number | bigint): Hex {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Cannot convert ${value} to hex: must be a non-negative integer`);
    }
    return `0x${value.toString(16)}` as Hex;
  }
  if (value < 0n) {
    throw new Error(`Cannot convert negative bigint to hex: ${value}`);
  }
  return `0x${value.toString(16)}` as Hex;
}

/**
 * Convert hex string to number
 */
export function hexToNumber(hex: Hex): number {
  assertHex(hex);
  const value = parseInt(hex.slice(2), 16);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Hex value ${hex} is too large for a safe integer, use hexToBigInt instead`);
  }
  return value;
}

/**
 * Convert hex string to bigint
 */
export function hexToBigInt(hex: Hex): bigint {
  assertHex(hex);
  if (hex === '0x' || hex === '0x0') return 0n;
  return BigInt(hex);
}

/**
 * Convert bigint to hex string
 */
export function bigIntToHex(value: bigint): Hex {
  return numberToHex(value);
}

/**
 * Pad hex string to a specific byte length (left-padded with zeros)
 */
export function padHex(hex: Hex, byteLength: number): Hex {
  assertHex(hex);
  const hexStr = hex.slice(2);
  const targetLength = byteLength * 2;
  if (hexStr.length > targetLength) {
    throw new Error(`Hex string ${hex} exceeds ${byteLength} bytes`);
  }
  return `0x${hexStr.padStart(targetLength, '0')}` as Hex;
}

/**
 * Trim leading zeros from hex string
 */
export function trimHex(hex: Hex): Hex {
  assertHex(hex);
  const hexStr = hex.slice(2);
  const trimmed = hexStr.replace(/^0+/, '') || '0';
  return `0x${trimmed}` as Hex;
}

/**
 * Concatenate multiple hex strings
 */
export function concatHex(...hexStrings: Hex[]): Hex {
  let result = '0x';
  for (const hex of hexStrings) {
    assertHex(hex);
    result += hex.slice(2);
  }
  return result as Hex;
}

/**
 * Get byte length of hex string
 */
export function hexLength(hex: Hex): number {
  assertHex(hex);
  const hexStr = hex.slice(2);
  return Math.ceil(hexStr.length / 2);
}

/**
 * Slice hex string (byte positions)
 */
export function sliceHex(hex: Hex, start: number, end?: number): Hex {
  assertHex(hex);
  const bytes = hexToBytes(hex);
  const sliced = bytes.slice(start, end);
  return bytesToHex(sliced);
}

/**
 * Check if two hex strings are equal (case-insensitive)
 */
export function hexEquals(a: Hex, b: Hex): boolean {
  assertHex(a);
  assertHex(b);
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Convert string to hex (UTF-8 encoding)
 */
export function stringToHex(str: string): Hex {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return bytesToHex(bytes);
}

/**
 * Convert hex to string (UTF-8 decoding)
 */
export function hexToString(hex: Hex): string {
  const bytes = hexToBytes(hex);
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

/**
 * Convert boolean to hex
 */
export function boolToHex(value: boolean): Hex {
  return value ? '0x01' as Hex : '0x00' as Hex;
}

/**
 * Convert hex to boolean
 */
export function hexToBool(hex: Hex): boolean {
  assertHex(hex);
  const num = hexToBigInt(hex);
  if (num !== 0n && num !== 1n) {
    throw new Error(`Invalid boolean hex value: ${hex}`);
  }
  return num === 1n;
}

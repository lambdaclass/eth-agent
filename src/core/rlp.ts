/**
 * RLP (Recursive Length Prefix) encoding/decoding
 * Used for serializing Ethereum transactions and data structures
 *
 * Spec: https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/
 */

import type { Hex } from './types.js';
import { bytesToHex, hexToBytes, isHex } from './hex.js';

export type RLPInput = Uint8Array | string | bigint | number | boolean | null | RLPInput[];

/**
 * Encode data as RLP
 */
export function encode(input: RLPInput): Uint8Array {
  if (input === null || input === undefined) {
    return new Uint8Array([0x80]); // Empty string
  }

  if (input instanceof Uint8Array) {
    return encodeBytes(input);
  }

  if (typeof input === 'string') {
    if (isHex(input)) {
      return encodeBytes(hexToBytes(input));
    }
    const encoder = new TextEncoder();
    return encodeBytes(encoder.encode(input));
  }

  if (typeof input === 'number') {
    if (input === 0) return new Uint8Array([0x80]);
    return encodeBytes(numberToBytes(input));
  }

  if (typeof input === 'bigint') {
    if (input === 0n) return new Uint8Array([0x80]);
    return encodeBytes(bigintToBytes(input));
  }

  if (typeof input === 'boolean') {
    return input ? new Uint8Array([0x01]) : new Uint8Array([0x80]);
  }

  if (Array.isArray(input)) {
    return encodeList(input);
  }

  throw new Error(`Cannot RLP encode type: ${typeof input}`);
}

/**
 * Encode bytes
 */
function encodeBytes(bytes: Uint8Array): Uint8Array {
  const len = bytes.length;

  // Single byte < 0x80
  if (len === 1 && bytes[0] !== undefined && bytes[0] < 0x80) {
    return bytes;
  }

  // Short string (0-55 bytes)
  if (len <= 55) {
    const result = new Uint8Array(1 + len);
    result[0] = 0x80 + len;
    result.set(bytes, 1);
    return result;
  }

  // Long string (> 55 bytes)
  const lenBytes = numberToBytes(len);
  const result = new Uint8Array(1 + lenBytes.length + len);
  result[0] = 0xb7 + lenBytes.length;
  result.set(lenBytes, 1);
  result.set(bytes, 1 + lenBytes.length);
  return result;
}

/**
 * Encode list
 */
function encodeList(items: RLPInput[]): Uint8Array {
  const encoded = items.map(encode);
  const totalLen = encoded.reduce((sum, item) => sum + item.length, 0);

  // Short list (0-55 bytes)
  if (totalLen <= 55) {
    const result = new Uint8Array(1 + totalLen);
    result[0] = 0xc0 + totalLen;
    let offset = 1;
    for (const item of encoded) {
      result.set(item, offset);
      offset += item.length;
    }
    return result;
  }

  // Long list (> 55 bytes)
  const lenBytes = numberToBytes(totalLen);
  const result = new Uint8Array(1 + lenBytes.length + totalLen);
  result[0] = 0xf7 + lenBytes.length;
  result.set(lenBytes, 1);
  let offset = 1 + lenBytes.length;
  for (const item of encoded) {
    result.set(item, offset);
    offset += item.length;
  }
  return result;
}

/**
 * Decode RLP data
 */
export function decode(input: Uint8Array | Hex): RLPInput {
  const bytes = input instanceof Uint8Array ? input : hexToBytes(input);
  const [result] = decodeItem(bytes, 0);
  return result;
}

/**
 * Decode single item at offset
 */
function decodeItem(bytes: Uint8Array, offset: number): [RLPInput, number] {
  const firstByte = bytes[offset];
  if (firstByte === undefined) {
    throw new Error('Empty RLP input');
  }

  // Single byte
  if (firstByte < 0x80) {
    return [new Uint8Array([firstByte]), offset + 1];
  }

  // Short string (0-55 bytes)
  if (firstByte <= 0xb7) {
    const len = firstByte - 0x80;
    if (len === 0) {
      return [new Uint8Array(), offset + 1];
    }
    const data = bytes.slice(offset + 1, offset + 1 + len);
    return [data, offset + 1 + len];
  }

  // Long string (> 55 bytes)
  if (firstByte <= 0xbf) {
    const lenLen = firstByte - 0xb7;
    const len = bytesToNumber(bytes.slice(offset + 1, offset + 1 + lenLen));
    const data = bytes.slice(offset + 1 + lenLen, offset + 1 + lenLen + len);
    return [data, offset + 1 + lenLen + len];
  }

  // Short list (0-55 bytes)
  if (firstByte <= 0xf7) {
    const len = firstByte - 0xc0;
    return decodeList(bytes, offset + 1, len);
  }

  // Long list (> 55 bytes)
  const lenLen = firstByte - 0xf7;
  const len = bytesToNumber(bytes.slice(offset + 1, offset + 1 + lenLen));
  return decodeList(bytes, offset + 1 + lenLen, len);
}

/**
 * Decode list items
 */
function decodeList(bytes: Uint8Array, offset: number, len: number): [RLPInput[], number] {
  const items: RLPInput[] = [];
  const end = offset + len;

  while (offset < end) {
    const [item, newOffset] = decodeItem(bytes, offset);
    items.push(item);
    offset = newOffset;
  }

  return [items, end];
}

/**
 * Convert number to minimal bytes
 */
function numberToBytes(n: number): Uint8Array {
  if (n === 0) return new Uint8Array();
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return new Uint8Array(bytes);
}

/**
 * Convert bigint to minimal bytes
 */
function bigintToBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array();
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n = n >> 8n;
  }
  return new Uint8Array(bytes);
}

/**
 * Convert bytes to number
 */
function bytesToNumber(bytes: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    n = n * 256 + byte;
  }
  return n;
}

/**
 * Encode to hex string
 */
export function encodeHex(input: RLPInput): Hex {
  return bytesToHex(encode(input));
}

/**
 * Decode from hex string
 */
export function decodeHex(input: Hex): RLPInput {
  return decode(hexToBytes(input));
}

/**
 * ABI (Application Binary Interface) encoding/decoding
 * Implements Solidity ABI specification
 */

import type { Address, Hash, Hex, ABIParameter, ABIFunction, ABIEvent, ABI } from './types.js';
import { bytesToHex, hexToBytes, padHex, concatHex, isHex, hexLength } from './hex.js';
import { keccak256 } from './hash.js';
import { isAddress, normalizeAddress } from './address.js';

/**
 * ABI input parameter with optional tuple components
 */
export interface ABIInput {
  type: string;
  name?: string;
  components?: ABIInput[];
}

/**
 * Convert ABI parameter type to inline format
 * Handles tuples by converting {type: "tuple", components: [...]} to "(type1,type2,...)"
 */
function abiTypeToInline(param: ABIInput): string {
  if (param.type === 'tuple' && param.components) {
    const componentTypes = param.components.map(abiTypeToInline);
    return `(${componentTypes.join(',')})`;
  }
  if (param.type.startsWith('tuple[') && param.components) {
    // Tuple array like "tuple[]" or "tuple[5]"
    const arraySuffix = param.type.slice(5); // Get "[]" or "[5]"
    const componentTypes = param.components.map(abiTypeToInline);
    return `(${componentTypes.join(',')})${arraySuffix}`;
  }
  return param.type;
}

/**
 * Encode function call data
 * Accepts either a string signature or an ABI fragment object
 */
export function encodeFunctionCall(
  signature: string | { name: string; inputs?: ABIInput[] },
  args: unknown[] = []
): Hex {
  let selector: Hex;
  let paramTypes: string[];

  if (typeof signature === 'string') {
    selector = functionSelector(signature);
    paramTypes = parseSignatureTypes(signature);
  } else {
    // ABI fragment format - convert tuple types to inline format
    const inputs = signature.inputs ?? [];
    paramTypes = inputs.map(abiTypeToInline);
    const sig = `${signature.name}(${paramTypes.join(',')})`;
    selector = functionSelector(sig);
  }

  const encoded = encodeParameters(paramTypes, args);
  return concatHex(selector, encoded);
}

/**
 * Decode function call data
 */
export function decodeFunctionCall(
  signature: string,
  data: Hex
): unknown[] {
  const paramTypes = parseSignatureTypes(signature);
  // Skip first 4 bytes (function selector)
  const encoded = `0x${data.slice(10)}` as Hex;
  return decodeParameters(paramTypes, encoded);
}

/**
 * Encode function return data (same as parameters)
 */
export function encodeFunctionResult(
  signature: string,
  values: unknown[]
): Hex {
  const returnTypes = parseReturnTypes(signature);
  return encodeParameters(returnTypes, values);
}

/**
 * Decode function return data
 */
export function decodeFunctionResult(
  signature: string,
  data: Hex
): unknown[] {
  const returnTypes = parseReturnTypes(signature);
  return decodeParameters(returnTypes, data);
}

/**
 * Compute function selector (first 4 bytes of keccak256)
 */
export function functionSelector(signature: string): Hex {
  // Normalize signature (remove whitespace, parameter names)
  const normalized = normalizeSignature(signature);
  const hash = keccak256(normalized);
  return `0x${hash.slice(2, 10)}` as Hex;
}

/**
 * Compute event topic (full keccak256 hash)
 */
export function eventTopic(signature: string): Hash {
  const normalized = normalizeSignature(signature);
  return keccak256(normalized);
}

/**
 * Encode event parameters
 */
export function encodeEventTopics(
  event: ABIEvent,
  args: Record<string, unknown>
): (Hash | null)[] {
  const topics: (Hash | null)[] = [];

  // First topic is event signature (unless anonymous)
  if (!event.anonymous) {
    const sig = formatEventSignature(event);
    topics.push(keccak256(sig));
  }

  // Add indexed parameters as topics
  for (const param of event.inputs) {
    if (!param.indexed) continue;

    const value = args[param.name];
    if (value === undefined || value === null) {
      topics.push(null);
      continue;
    }

    // Indexed dynamic types are hashed
    if (isDynamicType(param.type)) {
      const encoded = encodeParameter(param.type, value);
      topics.push(keccak256(encoded));
    } else {
      const encoded = encodeParameter(param.type, value);
      topics.push(padHex(encoded, 32) as Hash);
    }
  }

  return topics;
}

/**
 * Decode event log
 */
export function decodeEventLog(
  event: ABIEvent,
  data: Hex,
  topics: Hash[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Separate indexed and non-indexed parameters
  const indexedParams: ABIParameter[] = [];
  const dataParams: ABIParameter[] = [];

  for (const param of event.inputs) {
    if (param.indexed) {
      indexedParams.push(param);
    } else {
      dataParams.push(param);
    }
  }

  // Decode indexed parameters from topics
  let topicIndex = event.anonymous ? 0 : 1; // Skip event signature topic
  for (const param of indexedParams) {
    const topic = topics[topicIndex++];
    if (topic === undefined) continue;

    // Dynamic types are hashed, can't decode
    if (isDynamicType(param.type)) {
      result[param.name] = topic;
    } else {
      const decoded = decodeParameters([param.type], topic);
      result[param.name] = decoded[0];
    }
  }

  // Decode non-indexed parameters from data
  if (dataParams.length > 0 && data !== '0x') {
    const types = dataParams.map((p) => p.type);
    const decoded = decodeParameters(types, data);
    for (let i = 0; i < dataParams.length; i++) {
      const param = dataParams[i];
      if (param) {
        result[param.name] = decoded[i];
      }
    }
  }

  return result;
}

/**
 * Encode multiple parameters
 */
export function encodeParameters(types: string[], values: unknown[]): Hex {
  if (types.length !== values.length) {
    throw new Error(`Parameter count mismatch: ${types.length} types, ${values.length} values`);
  }

  if (types.length === 0) return '0x' as Hex;

  // Calculate head and tail sections
  const heads: Hex[] = [];
  const tails: Hex[] = [];
  let tailOffset = types.length * 32; // Each head is 32 bytes

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const value = values[i];

    if (!type) continue;

    if (isDynamicType(type)) {
      // Dynamic type: head contains offset, tail contains data
      heads.push(padHex(bytesToHex(bigintToBytes(BigInt(tailOffset))), 32));
      const encoded = encodeParameter(type, value);
      tails.push(encoded);
      tailOffset += hexLength(encoded);
    } else {
      // Static type: head contains value
      // Fixed arrays and static tuples are encoded inline (not padded to 32)
      const encoded = encodeParameter(type, value);
      const isFixedArray = /^.+\[\d+\]$/.test(type);
      const isStaticTuple = type.startsWith('(') && type.endsWith(')');
      if (isFixedArray || isStaticTuple) {
        heads.push(encoded);
        // Adjust tail offset for subsequent dynamic types
        tailOffset += hexLength(encoded) - 32;
      } else {
        heads.push(padHex(encoded, 32));
      }
    }
  }

  return concatHex(...heads, ...tails);
}

/**
 * Decode multiple parameters
 */
export function decodeParameters(types: string[], data: Hex): unknown[] {
  if (types.length === 0) return [];
  if (data === '0x') return types.map(() => undefined);

  const bytes = hexToBytes(data);
  const results: unknown[] = [];

  // Track current head offset (varies for static tuples and fixed arrays)
  let currentHeadOffset = 0;

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (!type) continue;

    if (isDynamicType(type)) {
      // Read offset from head
      const offsetBytes = bytes.slice(currentHeadOffset, currentHeadOffset + 32);
      const offset = Number(bytesToBigint(offsetBytes));
      results.push(decodeParameter(type, bytes, offset));
      currentHeadOffset += 32;
    } else {
      // Read value directly from head
      results.push(decodeParameter(type, bytes, currentHeadOffset));
      // Calculate size of this static type
      currentHeadOffset += getStaticTypeSize(type);
    }
  }

  return results;
}

/**
 * Get the byte size of a static type
 */
function getStaticTypeSize(type: string): number {
  // Static tuple: sum of component sizes
  if (type.startsWith('(') && type.endsWith(')')) {
    const componentTypes = parseTupleTypes(type);
    return componentTypes.reduce((sum, t) => sum + getStaticTypeSize(t), 0);
  }

  // Fixed array: element size * count
  const fixedArrayMatch = /^(.+)\[(\d+)\]$/.exec(type);
  if (fixedArrayMatch) {
    const baseType = fixedArrayMatch[1]!;
    const count = parseInt(fixedArrayMatch[2]!);
    return getStaticTypeSize(baseType) * count;
  }

  // All other static types are 32 bytes
  return 32;
}

/**
 * Encode a single parameter
 */
function encodeParameter(type: string, value: unknown): Hex {
  // Handle arrays
  const arrayMatch = /^(.+)\[(\d*)\]$/.exec(type);
  if (arrayMatch) {
    const baseType = arrayMatch[1];
    const size = arrayMatch[2];
    if (!baseType) throw new Error(`Invalid array type: ${type}`);

    if (!Array.isArray(value)) {
      throw new Error(`Expected array for type ${type}`);
    }

    if (size && value.length !== parseInt(size)) {
      throw new Error(`Array size mismatch: expected ${size}, got ${value.length}`);
    }

    // Fixed-size arrays are encoded as tuples
    // Dynamic arrays have length prefix
    if (!size) {
      // Dynamic array
      const length = padHex(bytesToHex(bigintToBytes(BigInt(value.length))), 32);
      const encoded = encodeParameters(
        value.map(() => baseType),
        value
      );
      return concatHex(length, encoded);
    } else {
      // Fixed array
      return encodeParameters(
        value.map(() => baseType),
        value
      );
    }
  }

  // Handle bare "tuple" keyword (requires using ABI fragment with components)
  if (type === 'tuple' || type.startsWith('tuple[')) {
    throw new Error('Tuple encoding requires component types - use inline format like "(address,uint256)" or ABI fragment with components');
  }

  // Handle tuple types like "(address,uint256,bool)"
  if (type.startsWith('(') && type.endsWith(')')) {
    return encodeTuple(type, value);
  }

  // Handle basic types
  if (type === 'address') {
    if (!isAddress(value as string)) {
      throw new Error(`Invalid address: ${String(value)}`);
    }
    return padHex(normalizeAddress(value as string), 32);
  }

  if (type === 'bool') {
    return padHex(value ? '0x01' : '0x00', 32) as Hex;
  }

  if (type === 'string') {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(String(value));
    return encodeBytes(bytes);
  }

  if (type === 'bytes') {
    const bytes = isHex(value) ? hexToBytes(value) : (value as Uint8Array);
    return encodeBytes(bytes);
  }

  // Fixed bytes (bytes1 - bytes32)
  const bytesMatch = /^bytes(\d+)$/.exec(type);
  if (bytesMatch) {
    const size = parseInt(bytesMatch[1] ?? '0');
    if (size < 1 || size > 32) {
      throw new Error(`Invalid bytes size: ${size}`);
    }
    const bytes = isHex(value) ? hexToBytes(value) : (value as Uint8Array);
    if (bytes.length !== size) {
      throw new Error(`Expected ${size} bytes, got ${bytes.length}`);
    }
    // Right-pad to 32 bytes
    const padded = new Uint8Array(32);
    padded.set(bytes);
    return bytesToHex(padded);
  }

  // Unsigned integers (uint8 - uint256)
  const uintMatch = /^uint(\d+)?$/.exec(type);
  if (uintMatch) {
    const bits = parseInt(uintMatch[1] ?? '256');
    if (bits < 8 || bits > 256 || bits % 8 !== 0) {
      throw new Error(`Invalid uint size: ${bits}`);
    }
    const bigValue = BigInt(value as number | string | bigint);
    if (bigValue < 0n) {
      throw new Error(`Negative value for uint: ${String(value)}`);
    }
    const maxValue = (1n << BigInt(bits)) - 1n;
    if (bigValue > maxValue) {
      throw new Error(`Value ${String(value)} exceeds uint${bits} max`);
    }
    return padHex(bytesToHex(bigintToBytes(bigValue)), 32);
  }

  // Signed integers (int8 - int256)
  const intMatch = /^int(\d+)?$/.exec(type);
  if (intMatch) {
    const bits = parseInt(intMatch[1] ?? '256');
    if (bits < 8 || bits > 256 || bits % 8 !== 0) {
      throw new Error(`Invalid int size: ${bits}`);
    }
    const bigValue = BigInt(value as number | string | bigint);
    const minValue = -(1n << BigInt(bits - 1));
    const maxValue = (1n << BigInt(bits - 1)) - 1n;
    if (bigValue < minValue || bigValue > maxValue) {
      throw new Error(`Value ${String(value)} out of range for int${bits}`);
    }
    // Two's complement for negative numbers
    const encoded = bigValue < 0n ? (1n << 256n) + bigValue : bigValue;
    return padHex(bytesToHex(bigintToBytes(encoded)), 32);
  }

  throw new Error(`Unknown type: ${type}`);
}

/**
 * Decode a single parameter
 */
function decodeParameter(type: string, data: Uint8Array, offset: number): unknown {
  // Handle arrays
  const arrayMatch = /^(.+)\[(\d*)\]$/.exec(type);
  if (arrayMatch) {
    const baseType = arrayMatch[1];
    const size = arrayMatch[2];
    if (!baseType) throw new Error(`Invalid array type: ${type}`);

    if (!size) {
      // Dynamic array - read length first
      const length = Number(bytesToBigint(data.slice(offset, offset + 32)));
      offset += 32;

      const elements: unknown[] = [];
      const elementSize = isDynamicType(baseType) ? 32 : getStaticTypeSize(baseType);
      for (let i = 0; i < length; i++) {
        if (isDynamicType(baseType)) {
          const elemOffset = Number(bytesToBigint(data.slice(offset + i * 32, offset + i * 32 + 32)));
          elements.push(decodeParameter(baseType, data, offset + elemOffset));
        } else {
          elements.push(decodeParameter(baseType, data, offset + i * elementSize));
        }
      }
      return elements;
    } else {
      // Fixed array
      const length = parseInt(size);
      const elements: unknown[] = [];
      const elementSize = isDynamicType(baseType) ? 32 : getStaticTypeSize(baseType);
      for (let i = 0; i < length; i++) {
        if (isDynamicType(baseType)) {
          const elemOffset = Number(bytesToBigint(data.slice(offset + i * 32, offset + i * 32 + 32)));
          elements.push(decodeParameter(baseType, data, offset + elemOffset));
        } else {
          elements.push(decodeParameter(baseType, data, offset + i * elementSize));
        }
      }
      return elements;
    }
  }

  // Handle tuple types
  if (type.startsWith('(') && type.endsWith(')')) {
    return decodeTuple(type, data, offset);
  }

  // Handle basic types
  if (type === 'address') {
    const bytes = data.slice(offset + 12, offset + 32);
    return bytesToHex(bytes) as Address;
  }

  if (type === 'bool') {
    const value = data[offset + 31];
    return value === 1;
  }

  if (type === 'string') {
    const length = Number(bytesToBigint(data.slice(offset, offset + 32)));
    const bytes = data.slice(offset + 32, offset + 32 + length);
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  if (type === 'bytes') {
    const length = Number(bytesToBigint(data.slice(offset, offset + 32)));
    const bytes = data.slice(offset + 32, offset + 32 + length);
    return bytesToHex(bytes);
  }

  // Fixed bytes
  const bytesMatch = /^bytes(\d+)$/.exec(type);
  if (bytesMatch) {
    const size = parseInt(bytesMatch[1] ?? '0');
    const bytes = data.slice(offset, offset + size);
    return bytesToHex(bytes);
  }

  // Unsigned integers
  const uintMatch = /^uint(\d+)?$/.exec(type);
  if (uintMatch) {
    const bytes = data.slice(offset, offset + 32);
    return bytesToBigint(bytes);
  }

  // Signed integers
  const intMatch = /^int(\d+)?$/.exec(type);
  if (intMatch) {
    const bits = parseInt(intMatch[1] ?? '256');
    const value = bytesToBigint(data.slice(offset, offset + 32));
    // Check if negative (high bit set)
    const maxPositive = (1n << BigInt(bits - 1)) - 1n;
    if (value > maxPositive) {
      return value - (1n << 256n);
    }
    return value;
  }

  throw new Error(`Unknown type: ${type}`);
}

/**
 * Encode bytes with length prefix
 */
function encodeBytes(bytes: Uint8Array): Hex {
  const length = padHex(bytesToHex(bigintToBytes(BigInt(bytes.length))), 32);
  // Pad bytes to 32-byte boundary
  const paddedLength = Math.ceil(bytes.length / 32) * 32;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  return concatHex(length, bytesToHex(padded));
}

/**
 * Encode a tuple value
 * Tuples are encoded the same as multiple parameters
 */
function encodeTuple(type: string, value: unknown): Hex {
  const componentTypes = parseTupleTypes(type);

  // Value can be an array or an object with numeric/named keys
  let values: unknown[];
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === 'object' && value !== null) {
    // Object form - extract values in order
    values = componentTypes.map((_, i) => {
      const obj = value as Record<string | number, unknown>;
      // Try numeric index first, then check if there are named keys
      if (i in obj) return obj[i];
      // For named keys, we'd need component names from ABI, so just use index
      return obj[i];
    });
  } else {
    throw new Error(`Expected array or object for tuple type, got ${typeof value}`);
  }

  if (values.length !== componentTypes.length) {
    throw new Error(`Tuple size mismatch: expected ${componentTypes.length}, got ${values.length}`);
  }

  // Use encodeParameters for the tuple components
  return encodeParameters(componentTypes, values);
}

/**
 * Decode a tuple value
 */
function decodeTuple(type: string, data: Uint8Array, offset: number): unknown[] {
  const componentTypes = parseTupleTypes(type);
  const results: unknown[] = [];

  // For dynamic tuples, components use head/tail encoding relative to tuple start
  // For static tuples, components are packed sequentially
  const isDynamic = isDynamicType(type);

  if (isDynamic) {
    // Dynamic tuple - each component has a head (offset for dynamic, value for static)
    let headOffset = offset;
    for (let i = 0; i < componentTypes.length; i++) {
      const compType = componentTypes[i];
      if (!compType) continue;

      if (isDynamicType(compType)) {
        // Read offset from head, relative to tuple start
        const relativeOffset = Number(bytesToBigint(data.slice(headOffset, headOffset + 32)));
        results.push(decodeParameter(compType, data, offset + relativeOffset));
      } else {
        results.push(decodeParameter(compType, data, headOffset));
      }
      headOffset += 32;
    }
  } else {
    // Static tuple - components are packed sequentially
    let currentOffset = offset;
    for (const compType of componentTypes) {
      if (!compType) continue;
      results.push(decodeParameter(compType, data, currentOffset));
      currentOffset += getStaticTypeSize(compType);
    }
  }

  return results;
}

/**
 * Check if a type is dynamic (variable length)
 */
function isDynamicType(type: string): boolean {
  if (type === 'string' || type === 'bytes') return true;
  if (type.endsWith('[]')) return true;
  // Fixed-size arrays of dynamic types are dynamic
  const arrayMatch = /^(.+)\[\d+\]$/.exec(type);
  if (arrayMatch?.[1]) {
    return isDynamicType(arrayMatch[1]);
  }
  // Tuple types - check if any component is dynamic
  if (type.startsWith('(') && type.endsWith(')')) {
    const componentTypes = parseTupleTypes(type);
    return componentTypes.some(isDynamicType);
  }
  return false;
}

/**
 * Parse tuple type string into component types
 * e.g., "(address,uint256,bool)" -> ["address", "uint256", "bool"]
 * Handles nested tuples: "((address,uint256),bool)" -> ["(address,uint256)", "bool"]
 */
function parseTupleTypes(tupleType: string): string[] {
  // Remove outer parentheses
  const inner = tupleType.slice(1, -1);
  if (!inner) return [];

  const types: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of inner) {
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) {
        types.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    types.push(current.trim());
  }

  return types;
}

/**
 * Parse parameter types from function signature
 */
function parseSignatureTypes(signature: string): string[] {
  const match = /\(([^)]*)\)/.exec(signature);
  if (!match) {
    throw new Error(`Invalid function signature: ${signature}`);
  }
  const params = match[1];
  if (!params) return [];
  return splitTypes(params);
}

/**
 * Parse return types from function signature (if present)
 */
function parseReturnTypes(signature: string): string[] {
  // Check for return types after 'returns'
  const match = /returns\s*\(([^)]*)\)/i.exec(signature);
  if (match?.[1]) {
    return splitTypes(match[1]);
  }
  // Otherwise assume same as input types (common for view/pure)
  return parseSignatureTypes(signature);
}

/**
 * Split comma-separated types (handling nested parentheses)
 */
function splitTypes(types: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of types) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        // Remove parameter name if present
        const parts = trimmed.split(/\s+/);
        const type = parts[0];
        if (type) result.push(type);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    const type = parts[0];
    if (type) result.push(type);
  }

  return result;
}

/**
 * Normalize function signature (remove names, whitespace)
 */
function normalizeSignature(signature: string): string {
  // Extract function name and params
  const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/.exec(signature.trim());
  if (!match) {
    throw new Error(`Invalid function signature: ${signature}`);
  }

  const name = match[1];
  const params = match[2] ?? '';
  const types = splitTypes(params);

  return `${name}(${types.join(',')})`;
}

/**
 * Format event signature from ABI
 */
function formatEventSignature(event: ABIEvent): string {
  const types = event.inputs.map((p) => p.type);
  return `${event.name}(${types.join(',')})`;
}

/**
 * Convert bigint to bytes (minimal encoding)
 */
function bigintToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array([0]);
  const bytes: number[] = [];
  let v = value;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v = v >> 8n;
  }
  return new Uint8Array(bytes);
}

/**
 * Convert bytes to bigint
 */
function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Get ABI function by name
 */
export function getFunction(abi: ABI, name: string): ABIFunction | undefined {
  return abi.find((item): item is ABIFunction => item.type === 'function' && item.name === name);
}

/**
 * Get ABI event by name
 */
export function getEvent(abi: ABI, name: string): ABIEvent | undefined {
  return abi.find((item): item is ABIEvent => item.type === 'event' && item.name === name);
}

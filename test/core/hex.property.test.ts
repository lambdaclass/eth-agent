import { describe, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  bytesToHex,
  hexToBytes,
  numberToHex,
  hexToNumber,
  hexToBigInt,
  padHex,
  trimHex,
  concatHex,
  stringToHex,
  hexToString,
} from '../../src/core/hex.js';

describe('hex property-based tests', () => {
  test.prop([fc.uint8Array()])('bytesToHex/hexToBytes roundtrip', (bytes) => {
    const hex = bytesToHex(bytes);
    const result = hexToBytes(hex);
    expect(result).toEqual(bytes);
  });

  test.prop([fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })])(
    'numberToHex/hexToNumber roundtrip',
    (num) => {
      const hex = numberToHex(num);
      const result = hexToNumber(hex);
      expect(result).toBe(num);
    }
  );

  test.prop([fc.bigInt({ min: 0n, max: 2n ** 128n })])(
    'numberToHex/hexToBigInt roundtrip for bigints',
    (num) => {
      const hex = numberToHex(num);
      const result = hexToBigInt(hex);
      expect(result).toBe(num);
    }
  );

  test.prop([fc.string()])(
    'stringToHex/hexToString roundtrip',
    (str) => {
      const hex = stringToHex(str);
      const result = hexToString(hex);
      expect(result).toBe(str);
    }
  );

  test.prop([
    fc.uint8Array({ minLength: 1, maxLength: 32 }),
    fc.integer({ min: 1, max: 64 }),
  ])(
    'padHex pads correctly',
    (bytes, targetLen) => {
      fc.pre(bytes.length <= targetLen);
      const hex = bytesToHex(bytes);
      const padded = padHex(hex, targetLen);
      const paddedBytes = hexToBytes(padded);
      expect(paddedBytes.length).toBe(targetLen);
      // Original bytes should be at the end
      expect(paddedBytes.slice(-bytes.length)).toEqual(bytes);
    }
  );

  test.prop([fc.uint8Array(), fc.uint8Array()])(
    'concatHex concatenates correctly',
    (a, b) => {
      const hexA = bytesToHex(a);
      const hexB = bytesToHex(b);
      const concatenated = concatHex(hexA, hexB);
      const result = hexToBytes(concatenated);

      const expected = new Uint8Array(a.length + b.length);
      expected.set(a);
      expected.set(b, a.length);

      expect(result).toEqual(expected);
    }
  );

  test.prop([fc.bigInt({ min: 0n })])(
    'trimHex removes leading zeros correctly',
    (num) => {
      const hex = numberToHex(num);
      const padded = padHex(hex, 32);
      const trimmed = trimHex(padded);
      expect(hexToBigInt(trimmed)).toBe(num);
    }
  );
});

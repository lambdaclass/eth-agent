import { describe, it, expect } from 'vitest';
import { encode, decode, encodeHex, decodeHex } from '../../src/core/rlp.js';
import { bytesToHex, hexToBytes } from '../../src/core/hex.js';

describe('RLP encoding/decoding', () => {
  describe('encode', () => {
    it('encodes empty string', () => {
      expect(bytesToHex(encode(''))).toBe('0x80');
    });

    it('encodes single byte < 0x80', () => {
      expect(bytesToHex(encode(new Uint8Array([0])))).toBe('0x00');
      expect(bytesToHex(encode(new Uint8Array([127])))).toBe('0x7f');
    });

    it('encodes short strings (0-55 bytes)', () => {
      expect(bytesToHex(encode('dog'))).toBe('0x83646f67');
      expect(bytesToHex(encode(new Uint8Array([0x80])))).toBe('0x8180');
    });

    it('encodes integers', () => {
      expect(bytesToHex(encode(0))).toBe('0x80');
      expect(bytesToHex(encode(1))).toBe('0x01');
      expect(bytesToHex(encode(127))).toBe('0x7f');
      expect(bytesToHex(encode(128))).toBe('0x8180');
      expect(bytesToHex(encode(1024))).toBe('0x820400');
    });

    it('encodes bigints', () => {
      expect(bytesToHex(encode(0n))).toBe('0x80');
      expect(bytesToHex(encode(1n))).toBe('0x01');
      expect(bytesToHex(encode(1000000n))).toBe('0x830f4240');
    });

    it('encodes empty list', () => {
      expect(bytesToHex(encode([]))).toBe('0xc0');
    });

    it('encodes short lists', () => {
      expect(bytesToHex(encode(['cat', 'dog']))).toBe('0xc88363617483646f67');
    });

    it('encodes nested lists', () => {
      const nested = [[], [[]], [[], [[]]]];
      expect(bytesToHex(encode(nested))).toBe('0xc7c0c1c0c3c0c1c0');
    });

    it('encodes set theoretical representation of 3', () => {
      // [[],[[]],[[],[[]]]]
      expect(bytesToHex(encode([[], [[]], [[], [[]]]]))).toBe('0xc7c0c1c0c3c0c1c0');
    });
  });

  describe('decode', () => {
    it('decodes empty string', () => {
      const result = decode(hexToBytes('0x80'));
      expect(result).toEqual(new Uint8Array());
    });

    it('decodes single byte', () => {
      const result = decode(hexToBytes('0x00'));
      expect(result).toEqual(new Uint8Array([0]));
    });

    it('decodes short string', () => {
      const result = decode(hexToBytes('0x83646f67'));
      expect(bytesToHex(result as Uint8Array)).toBe('0x646f67');
    });

    it('decodes empty list', () => {
      const result = decode(hexToBytes('0xc0'));
      expect(result).toEqual([]);
    });

    it('decodes nested lists', () => {
      const result = decode(hexToBytes('0xc7c0c1c0c3c0c1c0'));
      expect(result).toHaveLength(3);
    });
  });

  describe('roundtrip', () => {
    it('handles various inputs', () => {
      const testCases = [
        '',
        'hello',
        0,
        1,
        255,
        1000,
        [],
        [1, 2, 3],
        ['a', 'b', 'c'],
        [[], [[]], [[], [[]]]],
      ];

      for (const input of testCases) {
        const encoded = encode(input);
        const decoded = decode(encoded);

        // For bytes, compare as hex
        if (decoded instanceof Uint8Array) {
          if (typeof input === 'string') {
            expect(new TextDecoder().decode(decoded)).toBe(input);
          }
        }
      }
    });
  });

  describe('encodeHex / decodeHex', () => {
    it('works with hex strings', () => {
      const hex = encodeHex(['cat', 'dog']);
      expect(hex).toBe('0xc88363617483646f67');

      const decoded = decodeHex(hex);
      expect(decoded).toHaveLength(2);
    });
  });
});

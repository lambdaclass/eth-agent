import { describe, it, expect } from 'vitest';
import {
  isHex,
  bytesToHex,
  hexToBytes,
  numberToHex,
  hexToNumber,
  hexToBigInt,
  padHex,
  trimHex,
  concatHex,
  hexLength,
  sliceHex,
  hexEquals,
  stringToHex,
  hexToString,
} from '../../src/core/hex.js';

describe('hex utilities', () => {
  describe('isHex', () => {
    it('returns true for valid hex strings', () => {
      expect(isHex('0x')).toBe(true);
      expect(isHex('0x0')).toBe(true);
      expect(isHex('0x00')).toBe(true);
      expect(isHex('0xabcdef')).toBe(true);
      expect(isHex('0xABCDEF')).toBe(true);
      expect(isHex('0x1234567890abcdef')).toBe(true);
    });

    it('returns false for invalid hex strings', () => {
      expect(isHex('')).toBe(false);
      expect(isHex('0')).toBe(false);
      expect(isHex('0x')).toBe(true); // empty hex is valid
      expect(isHex('0xg')).toBe(false);
      expect(isHex('0x123g')).toBe(false);
      expect(isHex(123 as unknown as string)).toBe(false);
      expect(isHex(null as unknown as string)).toBe(false);
    });
  });

  describe('bytesToHex', () => {
    it('converts bytes to hex', () => {
      expect(bytesToHex(new Uint8Array([]))).toBe('0x');
      expect(bytesToHex(new Uint8Array([0]))).toBe('0x00');
      expect(bytesToHex(new Uint8Array([0, 1, 2]))).toBe('0x000102');
      expect(bytesToHex(new Uint8Array([255, 254, 253]))).toBe('0xfffefd');
    });
  });

  describe('hexToBytes', () => {
    it('converts hex to bytes', () => {
      expect(hexToBytes('0x')).toEqual(new Uint8Array([]));
      expect(hexToBytes('0x00')).toEqual(new Uint8Array([0]));
      expect(hexToBytes('0x000102')).toEqual(new Uint8Array([0, 1, 2]));
      expect(hexToBytes('0xfffefd')).toEqual(new Uint8Array([255, 254, 253]));
    });

    it('handles odd-length hex strings', () => {
      expect(hexToBytes('0x1')).toEqual(new Uint8Array([1]));
      expect(hexToBytes('0xabc')).toEqual(new Uint8Array([0x0a, 0xbc]));
    });

    it('handles mixed-case hex strings (checksum addresses)', () => {
      // This is important for EIP-55 checksum addresses like entry points
      const mixedCase = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
      const bytes = hexToBytes(mixedCase as `0x${string}`);
      expect(bytes.length).toBe(20);
      // First few bytes should be zeros
      expect(bytes[0]).toBe(0);
      expect(bytes[1]).toBe(0);
      expect(bytes[2]).toBe(0);
      expect(bytes[3]).toBe(0);
      // Verify it produces same result as lowercase
      const lowercase = mixedCase.toLowerCase() as `0x${string}`;
      expect(hexToBytes(lowercase)).toEqual(bytes);
    });

    it('handles uppercase hex strings', () => {
      expect(hexToBytes('0xABCDEF')).toEqual(new Uint8Array([0xab, 0xcd, 0xef]));
      expect(hexToBytes('0xFFFFFF')).toEqual(new Uint8Array([0xff, 0xff, 0xff]));
    });
  });

  describe('numberToHex', () => {
    it('converts numbers to hex', () => {
      expect(numberToHex(0)).toBe('0x0');
      expect(numberToHex(1)).toBe('0x1');
      expect(numberToHex(255)).toBe('0xff');
      expect(numberToHex(256)).toBe('0x100');
    });

    it('converts bigints to hex', () => {
      expect(numberToHex(0n)).toBe('0x0');
      expect(numberToHex(1n)).toBe('0x1');
      expect(numberToHex(255n)).toBe('0xff');
      expect(numberToHex(10n ** 18n)).toBe('0xde0b6b3a7640000');
    });

    it('throws for negative numbers', () => {
      expect(() => numberToHex(-1)).toThrow();
      expect(() => numberToHex(-1n)).toThrow();
    });
  });

  describe('hexToNumber', () => {
    it('converts hex to number', () => {
      expect(hexToNumber('0x0')).toBe(0);
      expect(hexToNumber('0x1')).toBe(1);
      expect(hexToNumber('0xff')).toBe(255);
      expect(hexToNumber('0x100')).toBe(256);
    });

    it('throws for unsafe integers', () => {
      expect(() => hexToNumber('0xffffffffffffffff')).toThrow();
    });
  });

  describe('hexToBigInt', () => {
    it('converts hex to bigint', () => {
      expect(hexToBigInt('0x0')).toBe(0n);
      expect(hexToBigInt('0x1')).toBe(1n);
      expect(hexToBigInt('0xff')).toBe(255n);
      expect(hexToBigInt('0xde0b6b3a7640000')).toBe(10n ** 18n);
    });
  });

  describe('padHex', () => {
    it('pads hex to specified byte length', () => {
      expect(padHex('0x1', 4)).toBe('0x00000001');
      expect(padHex('0xff', 4)).toBe('0x000000ff');
      expect(padHex('0x1234', 4)).toBe('0x00001234');
    });

    it('throws if hex exceeds byte length', () => {
      expect(() => padHex('0x12345678', 2)).toThrow();
    });
  });

  describe('trimHex', () => {
    it('removes leading zeros', () => {
      expect(trimHex('0x0001')).toBe('0x1');
      expect(trimHex('0x00000000')).toBe('0x0');
      expect(trimHex('0x0100')).toBe('0x100');
    });
  });

  describe('concatHex', () => {
    it('concatenates hex strings', () => {
      expect(concatHex('0x12', '0x34')).toBe('0x1234');
      expect(concatHex('0x', '0xab', '0xcd')).toBe('0xabcd');
    });
  });

  describe('hexLength', () => {
    it('returns byte length', () => {
      expect(hexLength('0x')).toBe(0);
      expect(hexLength('0x00')).toBe(1);
      expect(hexLength('0x1234')).toBe(2);
      expect(hexLength('0x123456')).toBe(3);
    });
  });

  describe('sliceHex', () => {
    it('slices hex by byte position', () => {
      expect(sliceHex('0x12345678', 1, 3)).toBe('0x3456');
      expect(sliceHex('0x12345678', 0, 2)).toBe('0x1234');
      expect(sliceHex('0x12345678', 2)).toBe('0x5678');
    });
  });

  describe('hexEquals', () => {
    it('compares hex strings case-insensitively', () => {
      expect(hexEquals('0xabc', '0xABC')).toBe(true);
      expect(hexEquals('0xabc', '0xdef')).toBe(false);
    });
  });

  describe('stringToHex / hexToString', () => {
    it('converts strings to hex and back', () => {
      const str = 'Hello, World!';
      const hex = stringToHex(str);
      expect(hexToString(hex)).toBe(str);
    });

    it('handles empty strings', () => {
      expect(stringToHex('')).toBe('0x');
      expect(hexToString('0x')).toBe('');
    });

    it('handles unicode', () => {
      const str = 'Hello, 世界!';
      const hex = stringToHex(str);
      expect(hexToString(hex)).toBe(str);
    });
  });
});

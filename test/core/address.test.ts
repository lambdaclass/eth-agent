import { describe, it, expect } from 'vitest';
import {
  isAddress,
  assertAddress,
  toChecksumAddress,
  isChecksumValid,
  normalizeAddress,
  addressEquals,
  isZeroAddress,
  ZERO_ADDRESS,
  padToAddress,
  extractAddress,
  computeContractAddress,
  computeCreate2Address,
} from '../../src/core/address.js';
import type { Address, Hex } from '../../src/core/types.js';

describe('address utilities', () => {
  describe('isAddress', () => {
    it('returns true for valid addresses', () => {
      expect(isAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(true);
      expect(isAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(true);
    });

    it('returns false for invalid addresses', () => {
      expect(isAddress('')).toBe(false);
      expect(isAddress('0x')).toBe(false);
      expect(isAddress('0x123')).toBe(false);
      expect(isAddress('0x000000000000000000000000000000000000000')).toBe(false); // 39 chars
      expect(isAddress('0x00000000000000000000000000000000000000000')).toBe(false); // 41 chars
      expect(isAddress('d8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(false); // no 0x
      expect(isAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa9604g')).toBe(false); // invalid char
    });
  });

  describe('toChecksumAddress', () => {
    it('converts addresses to checksum format', () => {
      // Vitalik's address
      expect(toChecksumAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045'))
        .toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');

      // Zero address
      expect(toChecksumAddress('0x0000000000000000000000000000000000000000'))
        .toBe('0x0000000000000000000000000000000000000000');

      // All uppercase should work too
      expect(toChecksumAddress('0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045'))
        .toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    });

    it('throws for invalid addresses', () => {
      expect(() => toChecksumAddress('0x123')).toThrow();
      expect(() => toChecksumAddress('invalid')).toThrow();
    });
  });

  describe('isChecksumValid', () => {
    it('returns true for valid checksums', () => {
      expect(isChecksumValid('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(true);
    });

    it('returns true for all lowercase', () => {
      expect(isChecksumValid('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(true);
    });

    it('returns true for all uppercase', () => {
      expect(isChecksumValid('0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045')).toBe(true);
    });

    it('returns false for invalid checksum', () => {
      expect(isChecksumValid('0xD8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(false);
    });

    it('returns false for invalid addresses', () => {
      expect(isChecksumValid('0x123')).toBe(false);
      expect(isChecksumValid('')).toBe(false);
    });
  });

  describe('normalizeAddress', () => {
    it('converts to EIP-55 checksum format', () => {
      // Lowercase input -> checksummed output
      expect(normalizeAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045'))
        .toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
      // Uppercase input -> checksummed output
      expect(normalizeAddress('0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045'))
        .toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
      // Already checksummed -> same output
      expect(normalizeAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'))
        .toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    });
  });

  describe('addressEquals', () => {
    it('compares addresses case-insensitively', () => {
      expect(addressEquals(
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045'
      )).toBe(true);

      expect(addressEquals(
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        '0x0000000000000000000000000000000000000000'
      )).toBe(false);
    });

    it('returns false for invalid addresses', () => {
      expect(addressEquals('0x123', '0x456')).toBe(false);
    });
  });

  describe('isZeroAddress', () => {
    it('returns true for zero address', () => {
      expect(isZeroAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isZeroAddress(ZERO_ADDRESS)).toBe(true);
    });

    it('returns false for non-zero addresses', () => {
      expect(isZeroAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(false);
      expect(isZeroAddress('0x0000000000000000000000000000000000000001')).toBe(false);
    });
  });

  describe('padToAddress', () => {
    it('pads short hex to address length', () => {
      expect(padToAddress('0x1')).toBe('0x0000000000000000000000000000000000000001');
      expect(padToAddress('0xabcd')).toBe('0x000000000000000000000000000000000000abcd');
    });

    it('throws if value is too large', () => {
      expect(() => padToAddress('0x' + '1'.repeat(42))).toThrow();
    });
  });

  describe('extractAddress', () => {
    it('extracts address from 32-byte word', () => {
      expect(extractAddress('0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045'))
        .toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
    });

    it('throws if leading bytes are non-zero', () => {
      expect(() => extractAddress('0x000000000000000000000001d8da6bf26964af9d7eed9e03e53415d37aa96045'))
        .toThrow();
    });

    it('throws for invalid hex value', () => {
      expect(() => extractAddress('not-hex' as Hex)).toThrow('Invalid hex');
    });

    it('handles short hex values by taking last 40 chars', () => {
      // extractAddress takes the last 40 chars
      expect(extractAddress('0xabcdef')).toBe('0xabcdef');
    });
  });

  describe('assertAddress', () => {
    it('does not throw for valid address', () => {
      expect(() => assertAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).not.toThrow();
    });

    it('throws for invalid address', () => {
      expect(() => assertAddress('0x123')).toThrow('valid Ethereum address');
      expect(() => assertAddress('invalid')).toThrow();
      expect(() => assertAddress(null)).toThrow();
      expect(() => assertAddress(123)).toThrow();
    });

    it('includes custom name in error message', () => {
      expect(() => assertAddress('invalid', 'recipient')).toThrow('recipient must be');
    });
  });

  describe('computeContractAddress', () => {
    it('computes contract address from deployer and nonce', () => {
      // Known example: deployer 0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0, nonce 0
      const deployer = '0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0' as Address;
      const result = computeContractAddress(deployer, 0);

      expect(result).toMatch(/^0x[a-f0-9]{40}$/);
    });

    it('produces different addresses for different nonces', () => {
      const deployer = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as Address;
      const addr1 = computeContractAddress(deployer, 0);
      const addr2 = computeContractAddress(deployer, 1);
      const addr3 = computeContractAddress(deployer, 100);

      expect(addr1).not.toBe(addr2);
      expect(addr2).not.toBe(addr3);
      expect(addr1).not.toBe(addr3);
    });
  });

  describe('computeCreate2Address', () => {
    it('computes CREATE2 address', () => {
      const from = '0x0000000000000000000000000000000000000000' as Address;
      const salt = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
      const initCodeHash = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' as Hex;

      const result = computeCreate2Address(from, salt, initCodeHash);

      expect(result).toMatch(/^0x[a-f0-9]{40}$/);
    });

    it('produces different addresses for different salts', () => {
      const from = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as Address;
      const salt1 = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
      const salt2 = '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex;
      const initCodeHash = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' as Hex;

      const addr1 = computeCreate2Address(from, salt1, initCodeHash);
      const addr2 = computeCreate2Address(from, salt2, initCodeHash);

      expect(addr1).not.toBe(addr2);
    });

    it('handles short salt by padding', () => {
      const from = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as Address;
      const salt = '0x1' as Hex;
      const initCodeHash = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' as Hex;

      const result = computeCreate2Address(from, salt, initCodeHash);
      expect(result).toMatch(/^0x[a-f0-9]{40}$/);
    });
  });

  describe('padToAddress', () => {
    it('throws for invalid hex', () => {
      expect(() => padToAddress('not-hex' as Hex)).toThrow('Invalid hex');
    });
  });

  describe('isAddress', () => {
    it('returns false for non-string values', () => {
      expect(isAddress(123)).toBe(false);
      expect(isAddress(null)).toBe(false);
      expect(isAddress(undefined)).toBe(false);
      expect(isAddress({})).toBe(false);
    });
  });
});

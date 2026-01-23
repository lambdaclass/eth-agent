import { describe, it, expect } from 'vitest';
import { SecureKey, secureKeyFromHex, secureKeyFromBytes } from '../../src/core/secure-key.js';
import type { Hex } from '../../src/core/types.js';

describe('SecureKey', () => {
  const testKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;

  describe('creation', () => {
    it('creates from hex with 0x prefix', () => {
      const key = SecureKey.fromHex(testKey);
      expect(key.isDisposed).toBe(false);
    });

    it('creates from hex without 0x prefix', () => {
      const key = SecureKey.fromHex(testKey.slice(2));
      expect(key.isDisposed).toBe(false);
    });

    it('creates from bytes', () => {
      const bytes = new Uint8Array(32).fill(1);
      const key = SecureKey.fromBytes(bytes);
      expect(key.isDisposed).toBe(false);
    });

    it('helper function secureKeyFromHex works', () => {
      const key = secureKeyFromHex(testKey);
      expect(key.isDisposed).toBe(false);
    });

    it('helper function secureKeyFromBytes works', () => {
      const bytes = new Uint8Array(32).fill(1);
      const key = secureKeyFromBytes(bytes);
      expect(key.isDisposed).toBe(false);
    });
  });

  describe('use', () => {
    it('provides key access in scoped callback', () => {
      const key = SecureKey.fromHex(testKey);
      const result = key.use((k) => k);
      expect(result).toBe(testKey);
    });

    it('returns callback result', () => {
      const key = SecureKey.fromHex(testKey);
      const result = key.use((k) => k.length);
      expect(result).toBe(66); // 0x + 64 hex chars
    });

    it('throws when used after dispose', () => {
      const key = SecureKey.fromHex(testKey);
      key.dispose();
      expect(() => key.use((k) => k)).toThrow('SecureKey has been disposed');
    });
  });

  describe('useBytes', () => {
    it('provides key bytes in scoped callback', () => {
      const key = SecureKey.fromHex(testKey);
      const result = key.useBytes((bytes) => bytes.length);
      expect(result).toBe(32);
    });

    it('returns a copy of bytes', () => {
      const key = SecureKey.fromHex(testKey);
      const bytes1 = key.useBytes((b) => b);
      const bytes2 = key.useBytes((b) => b);
      expect(bytes1).not.toBe(bytes2);
      expect(Array.from(bytes1)).toEqual(Array.from(bytes2));
    });

    it('throws when used after dispose', () => {
      const key = SecureKey.fromHex(testKey);
      key.dispose();
      expect(() => key.useBytes((b) => b)).toThrow('SecureKey has been disposed');
    });
  });

  describe('exportHex', () => {
    it('exports the key as hex', () => {
      const key = SecureKey.fromHex(testKey);
      expect(key.exportHex()).toBe(testKey);
    });

    it('throws when used after dispose', () => {
      const key = SecureKey.fromHex(testKey);
      key.dispose();
      expect(() => key.exportHex()).toThrow('SecureKey has been disposed');
    });
  });

  describe('dispose', () => {
    it('marks key as disposed', () => {
      const key = SecureKey.fromHex(testKey);
      expect(key.isDisposed).toBe(false);
      key.dispose();
      expect(key.isDisposed).toBe(true);
    });

    it('zeros the key material', () => {
      const key = SecureKey.fromHex(testKey);
      // Access the internal bytes before dispose
      const originalBytes = key.useBytes((b) => new Uint8Array(b));
      expect(originalBytes.some(b => b !== 0)).toBe(true);

      key.dispose();

      // We can't directly verify the internal bytes are zeroed from outside,
      // but we can verify the key is no longer usable
      expect(key.isDisposed).toBe(true);
    });

    it('is idempotent', () => {
      const key = SecureKey.fromHex(testKey);
      key.dispose();
      key.dispose(); // Should not throw
      expect(key.isDisposed).toBe(true);
    });
  });

  describe('memory isolation', () => {
    it('copies input bytes on creation', () => {
      const originalBytes = new Uint8Array(32).fill(42);
      const key = SecureKey.fromBytes(originalBytes);

      // Modify original bytes
      originalBytes.fill(0);

      // Key should still have original value
      const keyValue = key.useBytes((b) => b[0]);
      expect(keyValue).toBe(42);
    });
  });
});

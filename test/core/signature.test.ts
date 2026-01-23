import { describe, it, expect } from 'vitest';
import {
  generatePrivateKey,
  privateKeyToPublicKey,
  publicKeyToAddress,
  privateKeyToAddress,
  sign,
  signMessage,
  recoverPublicKey,
  recoverAddress,
  verify,
  serializeSignature,
  deserializeSignature,
  isValidPrivateKey,
} from '../../src/core/signature.js';
import { keccak256 } from '../../src/core/hash.js';
import type { Hash, Hex } from '../../src/core/types.js';

describe('Signature', () => {
  // Known test vectors
  const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
  const testAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

  describe('generatePrivateKey', () => {
    it('generates 32-byte private key', () => {
      const key = generatePrivateKey();
      expect(key.length).toBe(66); // 0x + 64 hex chars
      expect(key.startsWith('0x')).toBe(true);
    });

    it('generates unique keys', () => {
      const key1 = generatePrivateKey();
      const key2 = generatePrivateKey();
      expect(key1).not.toBe(key2);
    });

    it('generates valid private keys', () => {
      const key = generatePrivateKey();
      expect(isValidPrivateKey(key)).toBe(true);
    });
  });

  describe('privateKeyToPublicKey', () => {
    it('derives uncompressed public key', () => {
      const pubKey = privateKeyToPublicKey(testPrivateKey, false);
      expect(pubKey.length).toBe(132); // 0x + 130 hex chars (65 bytes)
      expect(pubKey.startsWith('0x04')).toBe(true);
    });

    it('derives compressed public key', () => {
      const pubKey = privateKeyToPublicKey(testPrivateKey, true);
      expect(pubKey.length).toBe(68); // 0x + 66 hex chars (33 bytes)
      expect(pubKey.startsWith('0x02') || pubKey.startsWith('0x03')).toBe(true);
    });

    it('defaults to uncompressed', () => {
      const pubKey = privateKeyToPublicKey(testPrivateKey);
      expect(pubKey.length).toBe(132);
    });
  });

  describe('publicKeyToAddress', () => {
    it('derives address from uncompressed public key', () => {
      const pubKey = privateKeyToPublicKey(testPrivateKey, false);
      const address = publicKeyToAddress(pubKey);
      expect(address.toLowerCase()).toBe(testAddress.toLowerCase());
    });

    it('derives address from compressed public key', () => {
      const pubKey = privateKeyToPublicKey(testPrivateKey, true);
      const address = publicKeyToAddress(pubKey);
      expect(address.toLowerCase()).toBe(testAddress.toLowerCase());
    });
  });

  describe('privateKeyToAddress', () => {
    it('derives correct address', () => {
      const address = privateKeyToAddress(testPrivateKey);
      expect(address.toLowerCase()).toBe(testAddress.toLowerCase());
    });

    it('works with different keys', () => {
      const key = generatePrivateKey();
      const address = privateKeyToAddress(key);
      expect(address.length).toBe(42);
      expect(address.startsWith('0x')).toBe(true);
    });
  });

  describe('sign', () => {
    it('signs 32-byte hash', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);

      expect(sig.r.length).toBe(66);
      expect(sig.s.length).toBe(66);
      expect(sig.v).toBeGreaterThanOrEqual(27);
      expect(sig.v).toBeLessThanOrEqual(28);
      expect(sig.yParity === 0 || sig.yParity === 1).toBe(true);
    });

    it('produces deterministic signatures', () => {
      const hash = keccak256('test message') as Hash;
      const sig1 = sign(hash, testPrivateKey);
      const sig2 = sign(hash, testPrivateKey);

      expect(sig1.r).toBe(sig2.r);
      expect(sig1.s).toBe(sig2.s);
    });

    it('throws on invalid hash length', () => {
      expect(() => sign('0xdeadbeef' as Hash, testPrivateKey)).toThrow('must be 32 bytes');
    });
  });

  describe('signMessage (EIP-191)', () => {
    it('signs string message', () => {
      const sig = signMessage('hello', testPrivateKey);

      expect(sig.r.length).toBe(66);
      expect(sig.s.length).toBe(66);
      expect(sig.v).toBeGreaterThanOrEqual(27);
    });

    it('signs Uint8Array message', () => {
      const message = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
      const sig = signMessage(message, testPrivateKey);

      expect(sig.r.length).toBe(66);
      expect(sig.s.length).toBe(66);
    });

    it('produces consistent signatures', () => {
      const sig1 = signMessage('test', testPrivateKey);
      const sig2 = signMessage('test', testPrivateKey);

      expect(sig1.r).toBe(sig2.r);
      expect(sig1.s).toBe(sig2.s);
    });
  });

  describe('recoverPublicKey', () => {
    it('recovers public key from signature', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);
      const recoveredPubKey = recoverPublicKey(hash, sig);

      const expectedPubKey = privateKeyToPublicKey(testPrivateKey, false);
      expect(recoveredPubKey).toBe(expectedPubKey);
    });
  });

  describe('recoverAddress', () => {
    it('recovers address from signature', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);
      const recoveredAddress = recoverAddress(hash, sig);

      expect(recoveredAddress.toLowerCase()).toBe(testAddress.toLowerCase());
    });

    it('works with different messages', () => {
      const hash = keccak256('different message') as Hash;
      const sig = sign(hash, testPrivateKey);
      const recoveredAddress = recoverAddress(hash, sig);

      expect(recoveredAddress.toLowerCase()).toBe(testAddress.toLowerCase());
    });
  });

  describe('verify', () => {
    it('verifies valid signature', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);

      expect(verify(hash, sig, testAddress as Hex)).toBe(true);
    });

    it('rejects signature from different address', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);
      const differentAddress = '0x0000000000000000000000000000000000000001' as Hex;

      expect(verify(hash, sig, differentAddress)).toBe(false);
    });

    it('rejects signature for different hash', () => {
      const hash1 = keccak256('hello') as Hash;
      const hash2 = keccak256('world') as Hash;
      const sig = sign(hash1, testPrivateKey);

      expect(verify(hash2, sig, testAddress as Hex)).toBe(false);
    });

    it('handles case-insensitive address comparison', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);

      expect(verify(hash, sig, testAddress.toUpperCase() as Hex)).toBe(true);
      expect(verify(hash, sig, testAddress.toLowerCase() as Hex)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const hash = keccak256('hello') as Hash;
      const invalidSig = {
        r: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        s: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        v: 27,
        yParity: 0 as const,
      };

      expect(verify(hash, invalidSig, testAddress as Hex)).toBe(false);
    });
  });

  describe('serializeSignature', () => {
    it('serializes to 65 bytes (r + s + v)', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);
      const serialized = serializeSignature(sig);

      expect(serialized.length).toBe(132); // 0x + 130 hex chars
    });

    it('can be deserialized back', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);
      const serialized = serializeSignature(sig);
      const deserialized = deserializeSignature(serialized);

      expect(deserialized.r).toBe(sig.r);
      expect(deserialized.s).toBe(sig.s);
    });
  });

  describe('deserializeSignature', () => {
    it('deserializes valid signature', () => {
      const hash = keccak256('hello') as Hash;
      const sig = sign(hash, testPrivateKey);
      const serialized = serializeSignature(sig);
      const deserialized = deserializeSignature(serialized);

      expect(deserialized.r).toBe(sig.r);
      expect(deserialized.s).toBe(sig.s);
      expect(deserialized.v).toBe(sig.v);
      expect(deserialized.yParity).toBe(sig.yParity);
    });

    it('handles legacy v values (27/28)', () => {
      const legacySig = '0x' + '00'.repeat(32) + '00'.repeat(32) + '1b'; // v = 27
      const deserialized = deserializeSignature(legacySig as Hex);

      expect(deserialized.v).toBe(27);
      expect(deserialized.yParity).toBe(0);
    });

    it('handles v = 0/1 format', () => {
      const sig = '0x' + '00'.repeat(32) + '00'.repeat(32) + '00'; // v = 0
      const deserialized = deserializeSignature(sig as Hex);

      expect(deserialized.v).toBe(27);
      expect(deserialized.yParity).toBe(0);
    });

    it('handles EIP-155 v values', () => {
      // v = chainId * 2 + 35 + yParity = 1 * 2 + 35 + 0 = 37
      const sig = '0x' + '00'.repeat(32) + '00'.repeat(32) + '25'; // v = 37
      const deserialized = deserializeSignature(sig as Hex);

      expect(deserialized.yParity).toBe(0);
    });

    it('throws on invalid length', () => {
      expect(() => deserializeSignature('0xdeadbeef' as Hex)).toThrow('Invalid signature length');
    });
  });

  describe('isValidPrivateKey', () => {
    it('returns true for valid key', () => {
      expect(isValidPrivateKey(testPrivateKey)).toBe(true);
    });

    it('returns true for generated key', () => {
      const key = generatePrivateKey();
      expect(isValidPrivateKey(key)).toBe(true);
    });

    it('returns false for zero key', () => {
      const zeroKey = '0x' + '00'.repeat(32);
      expect(isValidPrivateKey(zeroKey as Hex)).toBe(false);
    });

    it('returns false for key exceeding curve order', () => {
      // secp256k1 order is FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
      const invalidKey = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' as Hex;
      expect(isValidPrivateKey(invalidKey)).toBe(false);
    });

    it('returns false for wrong length', () => {
      expect(isValidPrivateKey('0xdeadbeef' as Hex)).toBe(false);
    });

    it('returns false for invalid hex', () => {
      expect(isValidPrivateKey('not a hex' as Hex)).toBe(false);
    });
  });
});

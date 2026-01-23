import { describe, it, expect } from 'vitest';
import { EOA, Account } from '../../src/protocol/account.js';
import { keccak256 } from '../../src/core/hash.js';
import type { Hash, Hex } from '../../src/core/types.js';

describe('Account', () => {
  // Known test vectors from Hardhat/Anvil
  const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
  const testAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

  describe('EOA.generate', () => {
    it('generates a new account', () => {
      const account = EOA.generate();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(account.publicKey).toMatch(/^0x04[a-fA-F0-9]{128}$/);
    });

    it('generates unique accounts', () => {
      const account1 = EOA.generate();
      const account2 = EOA.generate();
      expect(account1.address).not.toBe(account2.address);
    });
  });

  describe('EOA.fromPrivateKey', () => {
    it('creates account from hex private key', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      expect(account.address.toLowerCase()).toBe(testAddress.toLowerCase());
    });

    it('creates account from private key without 0x prefix', () => {
      const account = EOA.fromPrivateKey(testPrivateKey.slice(2));
      expect(account.address.toLowerCase()).toBe(testAddress.toLowerCase());
    });

    it('throws on invalid private key', () => {
      expect(() => EOA.fromPrivateKey('0x00' as Hex)).toThrow('Invalid private key');
    });
  });

  describe('EOA.fromMnemonic', () => {
    const testMnemonic = 'test test test test test test test test test test test junk';

    // Note: The implementation only supports fully hardened paths (all segments with ')
    it('creates account from mnemonic with hardened path', () => {
      const account = EOA.fromMnemonic(testMnemonic, "m/44'/60'/0'");
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('produces consistent address from same mnemonic', () => {
      const account1 = EOA.fromMnemonic(testMnemonic, "m/44'/60'/0'");
      const account2 = EOA.fromMnemonic(testMnemonic, "m/44'/60'/0'");
      expect(account1.address).toBe(account2.address);
    });

    it('produces different address from different hardened path', () => {
      const account1 = EOA.fromMnemonic(testMnemonic, "m/44'/60'/0'");
      const account2 = EOA.fromMnemonic(testMnemonic, "m/44'/60'/1'");
      expect(account1.address).not.toBe(account2.address);
    });

    it('throws on invalid mnemonic (too few words)', () => {
      expect(() => EOA.fromMnemonic('test test test')).toThrow('Invalid mnemonic');
    });

    it('throws on invalid mnemonic (too many words)', () => {
      const tooManyWords = Array(25).fill('test').join(' ');
      expect(() => EOA.fromMnemonic(tooManyWords)).toThrow('Invalid mnemonic');
    });

    it('throws on invalid derivation path', () => {
      expect(() => EOA.fromMnemonic(testMnemonic, 'invalid/path')).toThrow('Path must start with m/');
    });

    it('throws on non-hardened derivation path', () => {
      expect(() => EOA.fromMnemonic(testMnemonic, "m/44'/60'/0'/0/0")).toThrow('Non-hardened derivation not supported');
    });
  });

  describe('EOA.sign', () => {
    it('signs a hash', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const hash = keccak256('hello') as Hash;
      const signature = account.sign(hash);

      expect(signature.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signature.s).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signature.v).toBeGreaterThanOrEqual(27);
      expect(signature.v).toBeLessThanOrEqual(28);
    });

    it('produces deterministic signatures', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const hash = keccak256('test') as Hash;

      const sig1 = account.sign(hash);
      const sig2 = account.sign(hash);

      expect(sig1.r).toBe(sig2.r);
      expect(sig1.s).toBe(sig2.s);
    });
  });

  describe('EOA.signMessage', () => {
    it('signs a string message', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const signature = account.signMessage('hello world');

      expect(signature.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signature.s).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('signs a Uint8Array message', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const message = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "hello"
      const signature = account.signMessage(message);

      expect(signature.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('produces different signatures for different messages', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const sig1 = account.signMessage('message 1');
      const sig2 = account.signMessage('message 2');

      expect(sig1.r).not.toBe(sig2.r);
    });
  });

  describe('EOA.exportPrivateKey', () => {
    it('exports the private key', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const exported = account.exportPrivateKey();
      expect(exported).toBe(testPrivateKey);
    });

    it('throws when account is disposed', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      account.dispose();
      expect(() => account.exportPrivateKey()).toThrow('Account has been disposed');
    });
  });

  describe('EOA.usePrivateKey', () => {
    it('provides scoped access to private key', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const result = account.usePrivateKey((key) => key);
      expect(result).toBe(testPrivateKey);
    });

    it('returns callback result', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const result = account.usePrivateKey((key) => key.length);
      expect(result).toBe(66);
    });

    it('throws when account is disposed', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      account.dispose();
      expect(() => account.usePrivateKey((key) => key)).toThrow('Account has been disposed');
    });
  });

  describe('EOA.dispose', () => {
    it('marks account as disposed', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      expect(account.isDisposed).toBe(false);
      account.dispose();
      expect(account.isDisposed).toBe(true);
    });

    it('prevents signing after dispose', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const hash = keccak256('test') as Hash;
      account.dispose();
      expect(() => account.sign(hash)).toThrow('Account has been disposed');
    });

    it('prevents message signing after dispose', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      account.dispose();
      expect(() => account.signMessage('test')).toThrow('Account has been disposed');
    });

    it('is idempotent', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      account.dispose();
      account.dispose(); // Should not throw
      expect(account.isDisposed).toBe(true);
    });
  });

  describe('Account alias', () => {
    it('Account is aliased to EOA', () => {
      expect(Account).toBe(EOA);
    });

    it('can use Account.generate', () => {
      const account = Account.generate();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('Account interface', () => {
    it('implements Account interface', () => {
      const eoa = EOA.fromPrivateKey(testPrivateKey);

      // Check interface properties
      expect(typeof eoa.address).toBe('string');
      expect(typeof eoa.publicKey).toBe('string');
      expect(typeof eoa.sign).toBe('function');
      expect(typeof eoa.signMessage).toBe('function');
    });
  });
});

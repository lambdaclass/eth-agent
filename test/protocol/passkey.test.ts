import { describe, it, expect } from 'vitest';
import {
  PasskeyAccount,
  createPasskeyAccount,
  parseCOSEPublicKey,
  createAuthenticatorData,
  createClientDataJSON,
  base64UrlDecode,
  P256_VERIFIER,
} from '../../src/protocol/passkey.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';
import { hexToBytes, bytesToHex } from '../../src/core/hex.js';
import { sha256 } from '../../src/core/hash.js';

describe('PasskeyAccount', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const testPublicKey = {
    x: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
    y: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
  };
  const testCredential = {
    id: 'test-credential-id',
    publicKey: testPublicKey,
    rpId: 'example.com',
  };
  const testHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash;

  describe('constructor', () => {
    it('creates passkey account with credential', () => {
      const account = new PasskeyAccount({
        credential: testCredential,
        address: testAddress,
      });

      expect(account.address).toBe(testAddress);
      expect(account.credential).toBe(testCredential);
    });
  });

  describe('encodePublicKey', () => {
    it('encodes public key for on-chain storage', () => {
      const account = new PasskeyAccount({
        credential: testCredential,
        address: testAddress,
      });

      const encoded = account.encodePublicKey();

      expect(encoded.startsWith('0x')).toBe(true);
      expect(encoded.length).toBeGreaterThan(2);
    });
  });

  describe('createChallenge', () => {
    it('creates base64url encoded challenge from userOpHash', () => {
      const account = new PasskeyAccount({
        credential: testCredential,
        address: testAddress,
      });

      const challenge = account.createChallenge(testHash);

      expect(typeof challenge).toBe('string');
      // Should not contain + or /
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
    });
  });

  describe('formatSignature', () => {
    it('formats WebAuthn signature for on-chain verification', () => {
      const account = new PasskeyAccount({
        credential: testCredential,
        address: testAddress,
      });

      // Create a valid DER signature
      const r = new Uint8Array(32).fill(0x12);
      const s = new Uint8Array(32).fill(0x34);

      // DER encode: 0x30 [len] 0x02 [r-len] [r] 0x02 [s-len] [s]
      const derSignature = new Uint8Array([
        0x30, 68, // sequence, length
        0x02, 32, ...r, // integer, length, r
        0x02, 32, ...s, // integer, length, s
      ]);

      const webAuthnData = {
        credentialId: 'test-id',
        authenticatorData: new Uint8Array(37).fill(0),
        clientDataJSON: '{"type":"webauthn.get","challenge":"test"}',
        signature: derSignature,
      };

      const formatted = account.formatSignature(webAuthnData);

      expect(formatted.authenticatorData).toMatch(/^0x/);
      expect(formatted.clientDataJSON).toBe(webAuthnData.clientDataJSON);
      expect(formatted.signature.r).toMatch(/^0x/);
      expect(formatted.signature.s).toMatch(/^0x/);
    });
  });

  describe('encodeSignature', () => {
    it('encodes signature for smart account verification', () => {
      const account = new PasskeyAccount({
        credential: testCredential,
        address: testAddress,
      });

      const passkeySignature = {
        authenticatorData: '0x' + '00'.repeat(37) as Hex,
        clientDataJSON: '{"type":"webauthn.get","challenge":"test"}',
        signature: {
          r: '0x' + '12'.repeat(32) as Hex,
          s: '0x' + '34'.repeat(32) as Hex,
        },
      };

      const encoded = account.encodeSignature(passkeySignature);

      expect(encoded.startsWith('0x')).toBe(true);
    });
  });

  describe('createVerificationCalldata', () => {
    it('creates calldata for P256 verification', () => {
      const account = new PasskeyAccount({
        credential: testCredential,
        address: testAddress,
      });

      const passkeySignature = {
        authenticatorData: '0x' + '00'.repeat(37) as Hex,
        clientDataJSON: '{"type":"webauthn.get","challenge":"test"}',
        signature: {
          r: '0x' + '12'.repeat(32) as Hex,
          s: '0x' + '34'.repeat(32) as Hex,
        },
      };

      const calldata = account.createVerificationCalldata(testHash, passkeySignature);

      expect(calldata.startsWith('0x')).toBe(true);
    });
  });

  describe('parseCOSEPublicKey', () => {
    it('parses COSE public key with x and y coordinates', () => {
      // Minimal CBOR map with x and y coordinates
      // Map with 5 items: {1: 2, 3: -7, -1: 1, -2: x, -3: y}
      // Using 16-byte coordinates to stay within inline length encoding (0x40 + length)
      const x = new Uint8Array(16).fill(0x11);
      const y = new Uint8Array(16).fill(0x22);

      // CBOR encoding:
      // - 0xa5: map with 5 items
      // - 0x01 0x02: key 1 -> value 2 (kty: EC2)
      // - 0x03 0x26: key 3 -> value -7 (alg: ES256)
      // - 0x20 0x01: key -1 -> value 1 (crv: P-256)
      // - 0x21 0x50 [16 bytes]: key -2 -> x coordinate (0x50 = byte string of 16 bytes)
      // - 0x22 0x50 [16 bytes]: key -3 -> y coordinate
      const coseKey = new Uint8Array([
        0xa5, // map of 5 items
        0x01, 0x02, // 1: 2 (kty: EC2)
        0x03, 0x26, // 3: -7 (alg: ES256)
        0x20, 0x01, // -1: 1 (crv: P-256)
        0x21, 0x50, ...x, // -2: x coordinate (0x50 = 0x40 + 16)
        0x22, 0x50, ...y, // -3: y coordinate
      ]);

      const result = parseCOSEPublicKey(coseKey);

      expect(result.x).toBe(bytesToHex(x));
      expect(result.y).toBe(bytesToHex(y));
    });

    it('throws for non-map CBOR', () => {
      const invalidCbor = new Uint8Array([0x00]); // not a map

      expect(() => parseCOSEPublicKey(invalidCbor)).toThrow('Expected CBOR map');
    });
  });

  describe('createAuthenticatorData', () => {
    it('creates authenticator data with default flags', () => {
      const rpIdHash = sha256(new TextEncoder().encode('example.com'));

      const authData = createAuthenticatorData({ rpIdHash });

      expect(authData.startsWith('0x')).toBe(true);
      expect(authData.length).toBe(2 + 37 * 2); // 0x + 37 bytes
    });

    it('creates authenticator data with custom flags and sign count', () => {
      const rpIdHash = sha256(new TextEncoder().encode('example.com'));

      const authData = createAuthenticatorData({
        rpIdHash,
        flags: 0x05, // user present + user verified
        signCount: 42,
      });

      const bytes = hexToBytes(authData);
      expect(bytes[32]).toBe(0x05);
      // Big-endian sign count at bytes 33-36
      expect(bytes[36]).toBe(42);
    });
  });

  describe('createClientDataJSON', () => {
    it('creates client data JSON for webauthn.get', () => {
      const clientData = createClientDataJSON({
        challenge: 'test-challenge',
        origin: 'https://example.com',
      });

      const parsed = JSON.parse(clientData);
      expect(parsed.type).toBe('webauthn.get');
      expect(parsed.challenge).toBe('test-challenge');
      expect(parsed.origin).toBe('https://example.com');
      expect(parsed.crossOrigin).toBe(false);
    });

    it('creates client data JSON for webauthn.create', () => {
      const clientData = createClientDataJSON({
        challenge: 'test-challenge',
        origin: 'https://example.com',
        type: 'webauthn.create',
      });

      const parsed = JSON.parse(clientData);
      expect(parsed.type).toBe('webauthn.create');
    });
  });

  describe('base64UrlDecode', () => {
    it('decodes base64url string', () => {
      // 'hello' in base64url
      const encoded = 'aGVsbG8';
      const decoded = base64UrlDecode(encoded);

      expect(new TextDecoder().decode(decoded)).toBe('hello');
    });

    it('handles - and _ characters', () => {
      // These replace + and / in standard base64
      const encoded = 'YWJj-_0';
      const decoded = base64UrlDecode(encoded);

      expect(decoded).toBeInstanceOf(Uint8Array);
    });

    it('handles missing padding', () => {
      // base64url doesn't require padding
      const encoded = 'YQ'; // 'a' without padding
      const decoded = base64UrlDecode(encoded);

      expect(new TextDecoder().decode(decoded)).toBe('a');
    });
  });

  describe('P256_VERIFIER', () => {
    it('is the correct precompile address', () => {
      expect(P256_VERIFIER).toBe('0x0000000000000000000000000000000000000100');
    });
  });

  describe('createPasskeyAccount', () => {
    it('creates passkey account instance', () => {
      const account = createPasskeyAccount({
        credential: testCredential,
        address: testAddress,
      });

      expect(account).toBeInstanceOf(PasskeyAccount);
      expect(account.address).toBe(testAddress);
    });
  });
});

describe('parseP256Signature edge cases', () => {
  it('handles signatures with leading zeros in r', () => {
    const account = new PasskeyAccount({
      credential: {
        id: 'test',
        publicKey: {
          x: '0x' + '11'.repeat(32) as Hex,
          y: '0x' + '22'.repeat(32) as Hex,
        },
        rpId: 'test.com',
      },
      address: '0x1234567890123456789012345678901234567890' as Address,
    });

    // DER signature with leading zero in r (for positive representation)
    const rWithZero = new Uint8Array([0x00, ...new Uint8Array(32).fill(0x80)]);
    const s = new Uint8Array(32).fill(0x34);

    const derSignature = new Uint8Array([
      0x30, 69, // sequence
      0x02, 33, ...rWithZero, // integer with leading zero
      0x02, 32, ...s,
    ]);

    const webAuthnData = {
      credentialId: 'test-id',
      authenticatorData: new Uint8Array(37).fill(0),
      clientDataJSON: '{"type":"webauthn.get","challenge":"test"}',
      signature: derSignature,
    };

    const formatted = account.formatSignature(webAuthnData);

    expect(formatted.signature.r.length).toBe(66); // 0x + 32 bytes
  });
});

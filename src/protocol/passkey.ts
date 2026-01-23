/**
 * Passkey Accounts (RIP-7212)
 * WebAuthn-based signing for smart accounts
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { bytesToHex, hexToBytes, concatHex } from '../core/hex.js';
import { sha256 } from '../core/hash.js';
import { encodeParameters } from '../core/abi.js';

// RIP-7212 precompile address (secp256r1 verification)
export const P256_VERIFIER = '0x0000000000000000000000000000000000000100' as Address;

// WebAuthn authenticator data flags
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;

export interface PasskeyCredential {
  id: string;               // Base64url credential ID
  publicKey: {
    x: Hex;                 // P-256 public key x coordinate
    y: Hex;                 // P-256 public key y coordinate
  };
  rpId: string;             // Relying party ID (domain)
}

export interface PasskeySignature {
  authenticatorData: Hex;
  clientDataJSON: string;
  signature: {
    r: Hex;
    s: Hex;
  };
}

export interface WebAuthnData {
  credentialId: string;
  authenticatorData: Uint8Array;
  clientDataJSON: string;
  signature: Uint8Array;
}

/**
 * Passkey Account - uses WebAuthn for signing
 */
export class PasskeyAccount {
  readonly credential: PasskeyCredential;
  readonly address: Address;

  constructor(config: {
    credential: PasskeyCredential;
    address: Address;
  }) {
    this.credential = config.credential;
    this.address = config.address;
  }

  /**
   * Encode public key for on-chain storage
   */
  encodePublicKey(): Hex {
    return encodeParameters(
      ['uint256', 'uint256'],
      [BigInt(this.credential.publicKey.x), BigInt(this.credential.publicKey.y)]
    );
  }

  /**
   * Create the message to be signed by WebAuthn
   */
  createChallenge(userOpHash: Hash): string {
    // The challenge is the userOpHash encoded as base64url
    const bytes = hexToBytes(userOpHash);
    return base64UrlEncode(bytes);
  }

  /**
   * Format WebAuthn signature for on-chain verification
   */
  formatSignature(webAuthnData: WebAuthnData): PasskeySignature {
    // Parse the signature (DER encoded)
    const sig = parseP256Signature(webAuthnData.signature);

    return {
      authenticatorData: bytesToHex(webAuthnData.authenticatorData),
      clientDataJSON: webAuthnData.clientDataJSON,
      signature: sig,
    };
  }

  /**
   * Encode signature for smart account verification
   */
  encodeSignature(passkeySignature: PasskeySignature): Hex {
    // The smart account expects:
    // - authenticatorData
    // - clientDataJSON (string)
    // - r, s (P-256 signature components)
    return encodeParameters(
      ['bytes', 'string', 'uint256', 'uint256'],
      [
        passkeySignature.authenticatorData,
        passkeySignature.clientDataJSON,
        BigInt(passkeySignature.signature.r),
        BigInt(passkeySignature.signature.s),
      ]
    );
  }

  /**
   * Create calldata for P256 signature verification
   * Note: messageHash is included for interface consistency but WebAuthn
   * signatures include the challenge in clientDataJSON
   */
  createVerificationCalldata(
    _messageHash: Hash,
    signature: PasskeySignature
  ): Hex {
    // Reconstruct the signed message
    // WebAuthn signs: authenticatorData || sha256(clientDataJSON)
    const clientDataHash = sha256(new TextEncoder().encode(signature.clientDataJSON));
    const signedData = concatHex(
      signature.authenticatorData,
      bytesToHex(hexToBytes(clientDataHash))
    );
    const messageToVerify = sha256(hexToBytes(signedData));

    // P256 verify precompile expects: hash, r, s, x, y
    return encodeParameters(
      ['bytes32', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        messageToVerify,
        BigInt(signature.signature.r),
        BigInt(signature.signature.s),
        BigInt(this.credential.publicKey.x),
        BigInt(this.credential.publicKey.y),
      ]
    );
  }
}

/**
 * Parse P-256 (secp256r1) DER-encoded signature
 */
function parseP256Signature(derSignature: Uint8Array): { r: Hex; s: Hex } {
  // DER signature format:
  // 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  let offset = 0;

  // Check sequence tag
  if (derSignature[offset++] !== 0x30) {
    throw new Error('Invalid DER signature: expected sequence');
  }

  // Skip total length
  offset++;

  // Parse r
  if (derSignature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature: expected integer for r');
  }
  const rLength = derSignature[offset++]!;
  let rStart = offset;
  // Skip leading zero if present (for positive number representation)
  if (derSignature[rStart] === 0x00) {
    rStart++;
  }
  const r = derSignature.slice(rStart, offset + rLength);
  offset += rLength;

  // Parse s
  if (derSignature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature: expected integer for s');
  }
  const sLength = derSignature[offset++]!;
  let sStart = offset;
  if (derSignature[sStart] === 0x00) {
    sStart++;
  }
  const s = derSignature.slice(sStart, offset + sLength);

  // Pad to 32 bytes each
  const rPadded = new Uint8Array(32);
  const sPadded = new Uint8Array(32);
  rPadded.set(r, 32 - r.length);
  sPadded.set(s, 32 - s.length);

  return {
    r: bytesToHex(rPadded),
    s: bytesToHex(sPadded),
  };
}

/**
 * Parse WebAuthn public key from COSE format
 */
export function parseCOSEPublicKey(coseKey: Uint8Array): { x: Hex; y: Hex } {
  // COSE_Key for P-256:
  // {1: 2, 3: -7, -1: 1, -2: x, -3: y}
  // We need to decode CBOR to extract x and y

  // Simple CBOR map parser for this specific case
  // This is a minimal implementation - a full CBOR parser would be more robust
  let offset = 0;

  // Expect a map (0xa0-0xbf for small maps)
  const mapByte = coseKey[offset++]!;
  if ((mapByte & 0xe0) !== 0xa0) {
    throw new Error('Expected CBOR map');
  }

  const mapSize = mapByte & 0x1f;
  let x: Uint8Array | undefined;
  let y: Uint8Array | undefined;

  for (let i = 0; i < mapSize; i++) {
    // Read key (negative integers for -2 and -3)
    const keyByte = coseKey[offset++]!;
    let key: number;

    if (keyByte >= 0x00 && keyByte <= 0x17) {
      key = keyByte;
    } else if (keyByte === 0x21) {
      key = -2; // -2 in CBOR
    } else if (keyByte === 0x22) {
      key = -3; // -3 in CBOR
    } else if (keyByte === 0x20) {
      key = -1;
    } else {
      // Skip this key-value pair
      continue;
    }

    // Read value
    const valueByte = coseKey[offset++]!;

    if (key === -2 || key === -3) {
      // Expect byte string of 32 bytes
      if ((valueByte & 0xe0) !== 0x40) {
        throw new Error('Expected CBOR byte string for coordinate');
      }
      const length = valueByte & 0x1f;
      const value = coseKey.slice(offset, offset + length);
      offset += length;

      if (key === -2) x = value;
      if (key === -3) y = value;
    } else {
      // Skip other values
      if (valueByte <= 0x17) {
        // Small integer, no additional bytes
      } else if ((valueByte & 0xe0) === 0x40) {
        // Byte string
        const length = valueByte & 0x1f;
        offset += length;
      }
    }
  }

  if (!x || !y) {
    throw new Error('Missing x or y coordinate in COSE key');
  }

  return {
    x: bytesToHex(x),
    y: bytesToHex(y),
  };
}

/**
 * Create authenticator data for testing
 */
export function createAuthenticatorData(config: {
  rpIdHash: Hash;
  flags?: number;
  signCount?: number;
}): Hex {
  const flags = config.flags ?? (FLAG_USER_PRESENT | FLAG_USER_VERIFIED);
  const signCount = config.signCount ?? 0;

  // authenticatorData = rpIdHash (32) + flags (1) + signCount (4)
  const data = new Uint8Array(37);
  data.set(hexToBytes(config.rpIdHash), 0);
  data[32] = flags;
  // Big-endian sign count
  data[33] = (signCount >> 24) & 0xff;
  data[34] = (signCount >> 16) & 0xff;
  data[35] = (signCount >> 8) & 0xff;
  data[36] = signCount & 0xff;

  return bytesToHex(data);
}

/**
 * Create client data JSON for testing
 */
export function createClientDataJSON(config: {
  challenge: string;
  origin: string;
  type?: 'webauthn.get' | 'webauthn.create';
}): string {
  return JSON.stringify({
    type: config.type ?? 'webauthn.get',
    challenge: config.challenge,
    origin: config.origin,
    crossOrigin: false,
  });
}

/**
 * Base64url encode
 */
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode
 */
export function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

/**
 * Create a passkey account
 */
export function createPasskeyAccount(config: {
  credential: PasskeyCredential;
  address: Address;
}): PasskeyAccount {
  return new PasskeyAccount(config);
}

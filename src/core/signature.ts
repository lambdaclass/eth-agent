/**
 * ECDSA signature handling
 * Wrapper around @noble/secp256k1 for Ethereum signatures
 */

import * as secp256k1 from '@noble/secp256k1';
import type { Address, Hash, Hex, Signature } from './types.js';
import { bytesToHex, hexToBytes, padHex, concatHex } from './hex.js';
import { keccak256 } from './hash.js';

/**
 * Generate a random private key
 */
export function generatePrivateKey(): Hex {
  const privateKey = secp256k1.utils.randomPrivateKey();
  return bytesToHex(privateKey);
}

/**
 * Derive public key from private key
 */
export function privateKeyToPublicKey(privateKey: Hex, compressed = false): Hex {
  const privKeyBytes = hexToBytes(privateKey);
  const pubKey = secp256k1.getPublicKey(privKeyBytes, compressed);
  return bytesToHex(pubKey);
}

/**
 * Derive Ethereum address from public key
 */
export function publicKeyToAddress(publicKey: Hex): Address {
  const pubKeyBytes = hexToBytes(publicKey);

  // If compressed, decompress first
  let uncompressedPubKey: Uint8Array;
  if (pubKeyBytes.length === 33) {
    const point = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);
    uncompressedPubKey = point.toRawBytes(false);
  } else {
    uncompressedPubKey = pubKeyBytes;
  }

  // Skip the 0x04 prefix for uncompressed public keys
  const pubKeyWithoutPrefix = uncompressedPubKey.slice(1);

  // Keccak256 hash of the public key
  const hash = keccak256(pubKeyWithoutPrefix);

  // Take last 20 bytes
  return `0x${hash.slice(-40)}` as Address;
}

/**
 * Derive Ethereum address from private key
 */
export function privateKeyToAddress(privateKey: Hex): Address {
  const publicKey = privateKeyToPublicKey(privateKey, false);
  return publicKeyToAddress(publicKey);
}

/**
 * Sign a 32-byte hash with a private key
 * Returns signature in Ethereum format (r, s, v)
 */
export function sign(hash: Hash, privateKey: Hex): Signature {
  const hashBytes = hexToBytes(hash);
  const privKeyBytes = hexToBytes(privateKey);

  if (hashBytes.length !== 32) {
    throw new Error(`Hash must be 32 bytes, got ${hashBytes.length}`);
  }

  const sig = secp256k1.sign(hashBytes, privKeyBytes);

  const r = padHex(bytesToHex(sig.toCompactRawBytes().slice(0, 32)), 32);
  const s = padHex(bytesToHex(sig.toCompactRawBytes().slice(32, 64)), 32);
  const recovery = sig.recovery;

  if (recovery === undefined) {
    throw new Error('Signature recovery value is undefined');
  }

  return {
    r,
    s,
    v: recovery + 27,
    yParity: recovery as 0 | 1,
  };
}

/**
 * Sign a message according to EIP-191 personal sign
 */
export function signMessage(message: string | Uint8Array, privateKey: Hex): Signature {
  let messageBytes: Uint8Array;

  if (typeof message === 'string') {
    const encoder = new TextEncoder();
    messageBytes = encoder.encode(message);
  } else {
    messageBytes = message;
  }

  const prefix = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
  const prefixBytes = new TextEncoder().encode(prefix);

  const combined = new Uint8Array(prefixBytes.length + messageBytes.length);
  combined.set(prefixBytes);
  combined.set(messageBytes, prefixBytes.length);

  const hash = keccak256(combined) as Hash;
  return sign(hash, privateKey);
}

/**
 * Recover public key from signature
 */
export function recoverPublicKey(hash: Hash, signature: Signature): Hex {
  const hashBytes = hexToBytes(hash);
  const r = hexToBytes(signature.r);
  const s = hexToBytes(signature.s);

  const sigBytes = new Uint8Array(64);
  sigBytes.set(r, 0);
  sigBytes.set(s, 32);

  const sig = secp256k1.Signature.fromCompact(sigBytes).addRecoveryBit(signature.yParity);
  const pubKey = sig.recoverPublicKey(hashBytes);

  return bytesToHex(pubKey.toRawBytes(false));
}

/**
 * Recover address from signature
 */
export function recoverAddress(hash: Hash, signature: Signature): Hex {
  const publicKey = recoverPublicKey(hash, signature);
  return publicKeyToAddress(publicKey);
}

/**
 * Verify a signature
 */
export function verify(hash: Hash, signature: Signature, address: Hex): boolean {
  try {
    const recoveredAddress = recoverAddress(hash, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Serialize signature to hex (r + s + v)
 */
export function serializeSignature(signature: Signature): Hex {
  const v = signature.v.toString(16).padStart(2, '0');
  return concatHex(signature.r, signature.s, `0x${v}` as Hex);
}

/**
 * Deserialize signature from hex
 */
export function deserializeSignature(hex: Hex): Signature {
  const bytes = hexToBytes(hex);

  if (bytes.length !== 65) {
    throw new Error(`Invalid signature length: ${bytes.length}, expected 65`);
  }

  const r = bytesToHex(bytes.slice(0, 32)) as Hex;
  const s = bytesToHex(bytes.slice(32, 64)) as Hex;
  const vByte = bytes[64];

  if (vByte === undefined) {
    throw new Error('Invalid signature: missing v byte');
  }

  let v = vByte;
  let yParity: 0 | 1;

  // Handle both legacy (27/28) and EIP-155 v values
  if (v === 0 || v === 1) {
    yParity = v as 0 | 1;
    v = v + 27;
  } else if (v === 27 || v === 28) {
    yParity = (v - 27) as 0 | 1;
  } else {
    // EIP-155: v = chainId * 2 + 35 + yParity
    yParity = ((v - 35) % 2) as 0 | 1;
  }

  return { r, s, v, yParity };
}

/**
 * Check if a private key is valid
 */
export function isValidPrivateKey(privateKey: Hex): boolean {
  try {
    const bytes = hexToBytes(privateKey);
    if (bytes.length !== 32) return false;
    return secp256k1.utils.isValidPrivateKey(bytes);
  } catch {
    return false;
  }
}

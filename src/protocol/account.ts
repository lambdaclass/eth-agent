/**
 * Ethereum Account abstraction
 * Supports EOA (Externally Owned Account) management
 */

import type { Address, Hash, Hex, Signature } from '../core/types.js';
import {
  generatePrivateKey,
  privateKeyToAddress,
  privateKeyToPublicKey,
  sign,
  signMessage,
  isValidPrivateKey,
} from '../core/signature.js';
import { bytesToHex } from '../core/hex.js';
import { sha512 } from '@noble/hashes/sha512';

export interface Account {
  readonly address: Address;
  readonly publicKey: Hex;
  sign(hash: Hash): Signature;
  signMessage(message: string | Uint8Array): Signature;
}

/**
 * EOA (Externally Owned Account)
 * A standard Ethereum account controlled by a private key
 */
export class EOA implements Account {
  readonly address: Address;
  readonly publicKey: Hex;
  private readonly privateKey: Hex;

  private constructor(privateKey: Hex) {
    if (!isValidPrivateKey(privateKey)) {
      throw new Error('Invalid private key');
    }
    this.privateKey = privateKey;
    this.publicKey = privateKeyToPublicKey(privateKey, false);
    this.address = privateKeyToAddress(privateKey);
  }

  /**
   * Generate a new random account
   */
  static generate(): EOA {
    const privateKey = generatePrivateKey();
    return new EOA(privateKey);
  }

  /**
   * Create account from private key
   */
  static fromPrivateKey(privateKey: Hex | string): EOA {
    const key = privateKey.startsWith('0x') ? privateKey as Hex : `0x${privateKey}` as Hex;
    return new EOA(key);
  }

  /**
   * Create account from mnemonic phrase
   * Uses BIP-39 derivation path m/44'/60'/0'/0/0
   */
  static fromMnemonic(mnemonic: string, path = "m/44'/60'/0'/0/0"): EOA {
    const privateKey = derivePrivateKeyFromMnemonic(mnemonic, path);
    return new EOA(privateKey);
  }

  /**
   * Sign a 32-byte hash
   */
  sign(hash: Hash): Signature {
    return sign(hash, this.privateKey);
  }

  /**
   * Sign a message (EIP-191)
   */
  signMessage(message: string | Uint8Array): Signature {
    return signMessage(message, this.privateKey);
  }

  /**
   * Export the private key
   *
   * **SECURITY WARNING:** This method exposes the raw private key.
   * The private key provides complete control over this account's funds.
   *
   * - NEVER log, print, or display the private key
   * - NEVER send the private key over the network
   * - NEVER store the private key in plaintext
   * - Clear the returned value from memory as soon as possible
   *
   * Consider using signMessage() or sign() instead if you only need
   * to create signatures without exposing the key material.
   *
   * @returns The raw private key as a hex string
   */
  exportPrivateKey(): Hex {
    console.warn(
      '[eth-agent] WARNING: exportPrivateKey() called. ' +
      'The private key provides complete control over account funds. ' +
      'Handle with extreme caution and never expose it.'
    );
    return this.privateKey;
  }
}

/**
 * Alias for backwards compatibility
 */
export const Account = EOA;

// ============ BIP-39/BIP-32 Implementation ============

/**
 * Derive private key from mnemonic
 * Simplified implementation - uses PBKDF2 and HMAC-SHA512
 */
function derivePrivateKeyFromMnemonic(mnemonic: string, path: string): Hex {
  // Normalize mnemonic
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (words.length < 12 || words.length > 24) {
    throw new Error('Invalid mnemonic: must be 12-24 words');
  }

  // Generate seed from mnemonic using PBKDF2
  const seed = mnemonicToSeed(words.join(' '));

  // Derive master key using BIP-32
  const masterKey = deriveMasterKey(seed);

  // Derive child key from path
  const privateKey = deriveChildKey(masterKey, path);

  return privateKey;
}

/**
 * Convert mnemonic to seed using PBKDF2-HMAC-SHA512
 */
function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  const encoder = new TextEncoder();
  const mnemonicBytes = encoder.encode(mnemonic.normalize('NFKD'));
  const salt = encoder.encode(('mnemonic' + passphrase).normalize('NFKD'));

  // PBKDF2 with 2048 iterations
  return pbkdf2(mnemonicBytes, salt, 2048, 64);
}

/**
 * Derive master key from seed using HMAC-SHA512
 */
function deriveMasterKey(seed: Uint8Array): { key: Uint8Array; chainCode: Uint8Array } {
  const encoder = new TextEncoder();
  const hmacKey = encoder.encode('Bitcoin seed');
  const hmacResult = hmacSha512(hmacKey, seed);

  return {
    key: hmacResult.slice(0, 32),
    chainCode: hmacResult.slice(32),
  };
}

/**
 * Derive child key from master key following path
 */
function deriveChildKey(
  masterKey: { key: Uint8Array; chainCode: Uint8Array },
  path: string
): Hex {
  // Parse path (e.g., "m/44'/60'/0'/0/0")
  const components = path.split('/');
  if (components[0] !== 'm') {
    throw new Error('Path must start with m/');
  }

  let current = masterKey;

  for (let i = 1; i < components.length; i++) {
    const component = components[i];
    if (!component) continue;

    const hardened = component.endsWith("'");
    const index = parseInt(hardened ? component.slice(0, -1) : component, 10);

    if (isNaN(index)) {
      throw new Error(`Invalid path component: ${component}`);
    }

    current = deriveChild(current, index, hardened);
  }

  return bytesToHex(current.key);
}

/**
 * Derive single child key
 */
function deriveChild(
  parent: { key: Uint8Array; chainCode: Uint8Array },
  index: number,
  hardened: boolean
): { key: Uint8Array; chainCode: Uint8Array } {
  const data = new Uint8Array(37);

  if (hardened) {
    // Hardened child: 0x00 || private key || index
    data[0] = 0;
    data.set(parent.key, 1);
    const indexWithHardened = index + 0x80000000;
    data[33] = (indexWithHardened >>> 24) & 0xff;
    data[34] = (indexWithHardened >>> 16) & 0xff;
    data[35] = (indexWithHardened >>> 8) & 0xff;
    data[36] = indexWithHardened & 0xff;
  } else {
    // Normal child: public key || index
    // For simplicity, we only support hardened derivation in this implementation
    throw new Error('Non-hardened derivation not supported in simplified implementation');
  }

  const hmacResult = hmacSha512(parent.chainCode, data);
  const childKey = hmacResult.slice(0, 32);
  const childChainCode = hmacResult.slice(32);

  // Add parent key to child key (mod curve order)
  const childKeyBigInt = bytesToBigInt(childKey) + bytesToBigInt(parent.key);
  const curveOrder = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const finalKey = childKeyBigInt % curveOrder;

  return {
    key: bigIntToBytes32(finalKey),
    chainCode: childChainCode,
  };
}

// ============ Cryptographic Primitives ============

/**
 * PBKDF2-HMAC-SHA512
 */
function pbkdf2(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number
): Uint8Array {
  const hashLength = 64; // SHA-512 output
  const numBlocks = Math.ceil(keyLength / hashLength);
  const result = new Uint8Array(numBlocks * hashLength);

  for (let i = 1; i <= numBlocks; i++) {
    const block = pbkdf2Block(password, salt, iterations, i);
    result.set(block, (i - 1) * hashLength);
  }

  return result.slice(0, keyLength);
}

function pbkdf2Block(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  blockNum: number
): Uint8Array {
  // First iteration: U1 = HMAC(password, salt || INT(i))
  const saltWithBlock = new Uint8Array(salt.length + 4);
  saltWithBlock.set(salt);
  saltWithBlock[salt.length] = (blockNum >>> 24) & 0xff;
  saltWithBlock[salt.length + 1] = (blockNum >>> 16) & 0xff;
  saltWithBlock[salt.length + 2] = (blockNum >>> 8) & 0xff;
  saltWithBlock[salt.length + 3] = blockNum & 0xff;

  let u = hmacSha512(password, saltWithBlock);
  const result = u.slice();

  // Subsequent iterations
  for (let i = 1; i < iterations; i++) {
    u = hmacSha512(password, u);
    for (let j = 0; j < result.length; j++) {
      const r = result[j];
      const uj = u[j];
      if (r !== undefined && uj !== undefined) {
        result[j] = r ^ uj;
      }
    }
  }

  return result;
}

/**
 * HMAC-SHA512
 * Simplified implementation using SHA-512 from @noble/hashes
 */
function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 128; // SHA-512 block size
  let keyPadded: Uint8Array;

  if (key.length > blockSize) {
    keyPadded = new Uint8Array(blockSize);
    keyPadded.set(sha512(key));
  } else {
    keyPadded = new Uint8Array(blockSize);
    keyPadded.set(key);
  }

  // Inner padding
  const ipad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    const k = keyPadded[i];
    ipad[i] = (k ?? 0) ^ 0x36;
  }

  // Outer padding
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    const k = keyPadded[i];
    opad[i] = (k ?? 0) ^ 0x5c;
  }

  // Inner hash
  const innerData = new Uint8Array(blockSize + data.length);
  innerData.set(ipad);
  innerData.set(data, blockSize);
  const innerHash = sha512(innerData);

  // Outer hash
  const outerData = new Uint8Array(blockSize + innerHash.length);
  outerData.set(opad);
  outerData.set(innerHash, blockSize);

  return sha512(outerData);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== undefined) {
      result = (result << 8n) | BigInt(b);
    }
  }
  return result;
}

function bigIntToBytes32(value: bigint): Uint8Array {
  const result = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    result[i] = Number(value & 0xffn);
    value = value >> 8n;
  }
  return result;
}

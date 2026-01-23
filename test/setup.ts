/**
 * Test setup file
 * Configures @noble/secp256k1 with sync HMAC for testing
 * Ensures crypto globals are available for Node.js
 */

import * as secp256k1 from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { webcrypto } from 'node:crypto';

// Ensure crypto.getRandomValues is available globally for @noble/secp256k1
// This is needed for Node.js 18 where globalThis.crypto may not be set
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error - webcrypto is compatible with globalThis.crypto
  globalThis.crypto = webcrypto;
}

// Configure secp256k1 to use synchronous HMAC
secp256k1.etc.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => {
  const h = hmac.create(sha256, key);
  for (const msg of messages) {
    h.update(msg);
  }
  return h.digest();
};

/**
 * Test setup file
 * Configures @noble/secp256k1 with sync HMAC for testing
 */

import * as secp256k1 from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

// Configure secp256k1 to use synchronous HMAC
secp256k1.etc.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => {
  const h = hmac.create(sha256, key);
  for (const msg of messages) {
    h.update(msg);
  }
  return h.digest();
};

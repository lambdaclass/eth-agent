/**
 * Secure Key Management
 * Provides secure storage and cleanup of private keys
 */

import type { Hex } from './types.js';
import { bytesToHex, hexToBytes } from './hex.js';

/**
 * SecureKey wraps a private key in a Uint8Array with secure cleanup capabilities.
 *
 * Usage:
 * ```typescript
 * const key = SecureKey.fromHex(privateKeyHex);
 *
 * // Use the key in a scoped manner
 * const signature = key.use((keyBytes) => sign(hash, keyBytes));
 *
 * // When done, securely destroy the key
 * key.dispose();
 * ```
 */
export class SecureKey {
  private _bytes: Uint8Array;
  private _disposed = false;

  private constructor(bytes: Uint8Array) {
    // Create a copy to ensure we own the memory
    this._bytes = new Uint8Array(bytes);
  }

  /**
   * Create a SecureKey from a hex string
   */
  static fromHex(hex: Hex | string): SecureKey {
    const normalized = hex.startsWith('0x') ? hex : `0x${hex}`;
    const bytes = hexToBytes(normalized as Hex);
    return new SecureKey(bytes);
  }

  /**
   * Create a SecureKey from a Uint8Array
   */
  static fromBytes(bytes: Uint8Array): SecureKey {
    return new SecureKey(bytes);
  }

  /**
   * Check if the key has been disposed
   */
  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Use the private key in a scoped callback.
   * This is the preferred way to access the key material.
   *
   * @param fn - Callback that receives the key as a Hex string
   * @returns The result of the callback
   * @throws Error if the key has been disposed
   */
  use<T>(fn: (key: Hex) => T): T {
    this.assertNotDisposed();
    return fn(bytesToHex(this._bytes));
  }

  /**
   * Use the private key bytes directly in a scoped callback.
   *
   * @param fn - Callback that receives the key as Uint8Array
   * @returns The result of the callback
   * @throws Error if the key has been disposed
   */
  useBytes<T>(fn: (keyBytes: Uint8Array) => T): T {
    this.assertNotDisposed();
    // Return a copy to prevent external mutation
    return fn(new Uint8Array(this._bytes));
  }

  /**
   * Export the private key as hex.
   *
   * @deprecated Use `use()` method for scoped access instead.
   * This method is provided for backward compatibility but should be avoided
   * as it creates a copy of the key that cannot be securely erased.
   *
   * @returns The private key as a hex string
   * @throws Error if the key has been disposed
   */
  exportHex(): Hex {
    this.assertNotDisposed();
    return bytesToHex(this._bytes);
  }

  /**
   * Securely dispose of the key by zeroing the memory.
   * After calling dispose(), any attempt to use the key will throw an error.
   */
  dispose(): void {
    if (this._disposed) return;

    // Zero out the key material
    this._bytes.fill(0);
    this._disposed = true;
  }

  /**
   * Assert that the key has not been disposed
   */
  private assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error('SecureKey has been disposed and cannot be used');
    }
  }
}

/**
 * Create a SecureKey from a hex string
 */
export function secureKeyFromHex(hex: Hex | string): SecureKey {
  return SecureKey.fromHex(hex);
}

/**
 * Create a SecureKey from bytes
 */
export function secureKeyFromBytes(bytes: Uint8Array): SecureKey {
  return SecureKey.fromBytes(bytes);
}

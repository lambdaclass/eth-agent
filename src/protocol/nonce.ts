/**
 * Nonce Manager - Prevents race conditions in concurrent transactions
 *
 * The problem: When multiple transactions are sent concurrently, fetching
 * the nonce from RPC each time can return the same nonce, causing failures.
 *
 * The solution: Track nonces locally and use a mutex to ensure atomic
 * increment operations.
 */

import type { Address } from '../core/types.js';
import type { RPCClient } from './rpc.js';

/**
 * Simple mutex for async operations
 * Ensures only one operation can hold the lock at a time
 */
class AsyncMutex {
  private locked = false;
  private readonly queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next !== undefined) {
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute a function while holding the lock
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export interface NonceManagerConfig {
  /** RPC client for fetching on-chain nonce */
  rpc: RPCClient;
  /** Address to manage nonces for */
  address: Address;
}

/**
 * Manages transaction nonces to prevent race conditions
 *
 * Usage:
 * ```typescript
 * const nonceManager = new NonceManager({ rpc, address });
 *
 * // Get next nonce (automatically increments)
 * const nonce1 = await nonceManager.getNextNonce();
 * const nonce2 = await nonceManager.getNextNonce(); // nonce1 + 1
 *
 * // After a transaction fails, reset to sync with chain
 * await nonceManager.reset();
 * ```
 */
export class NonceManager {
  private readonly rpc: RPCClient;
  private readonly address: Address;
  private readonly mutex = new AsyncMutex();

  /** Current pending nonce (null = needs sync) */
  private pendingNonce: number | null = null;

  /** Number of nonces that have been handed out but not confirmed */
  private pendingCount = 0;

  constructor(config: NonceManagerConfig) {
    this.rpc = config.rpc;
    this.address = config.address;
  }

  /**
   * Get the next available nonce
   * Thread-safe: uses mutex to prevent race conditions
   */
  async getNextNonce(): Promise<number> {
    return this.mutex.withLock(async () => {
      // Sync with chain if we don't have a local nonce
      if (this.pendingNonce === null) {
        await this.syncInternal();
      }

      const nonce = this.pendingNonce!;
      this.pendingNonce = nonce + 1;
      this.pendingCount++;

      return nonce;
    });
  }

  /**
   * Get current pending nonce without incrementing
   * Useful for checking current state
   */
  async getCurrentNonce(): Promise<number> {
    return this.mutex.withLock(async () => {
      if (this.pendingNonce === null) {
        await this.syncInternal();
      }
      return this.pendingNonce!;
    });
  }

  /**
   * Sync local nonce with chain state
   * Call this after transaction confirmation or failure
   */
  async sync(): Promise<void> {
    return this.mutex.withLock(async () => {
      await this.syncInternal();
    });
  }

  /**
   * Reset the nonce manager
   * Clears local state and syncs with chain
   * Call this after a transaction failure to recover
   */
  async reset(): Promise<void> {
    return this.mutex.withLock(async () => {
      this.pendingNonce = null;
      this.pendingCount = 0;
      await this.syncInternal();
    });
  }

  /**
   * Notify that a transaction was confirmed
   * Decrements pending count
   */
  onTransactionConfirmed(): void {
    if (this.pendingCount > 0) {
      this.pendingCount--;
    }
  }

  /**
   * Notify that a transaction failed
   * Should be followed by reset() if the nonce was wasted
   */
  async onTransactionFailed(): Promise<void> {
    // On failure, we should reset to get the correct nonce from chain
    // The failed transaction may or may not have consumed the nonce
    await this.reset();
  }

  /**
   * Get number of pending (unconfirmed) transactions
   */
  getPendingCount(): number {
    return this.pendingCount;
  }

  /**
   * Internal sync without acquiring mutex
   * Must be called while holding the mutex
   */
  private async syncInternal(): Promise<void> {
    const chainNonce = await this.rpc.getTransactionCount(this.address);
    this.pendingNonce = chainNonce;
    this.pendingCount = 0;
  }
}

/**
 * Create a new NonceManager
 */
export function createNonceManager(config: NonceManagerConfig): NonceManager {
  return new NonceManager(config);
}

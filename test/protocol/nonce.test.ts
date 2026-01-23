import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NonceManager, createNonceManager } from '../../src/protocol/nonce.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { Address } from '../../src/core/types.js';

describe('NonceManager', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  let mockRpc: RPCClient;

  beforeEach(() => {
    mockRpc = {
      getTransactionCount: vi.fn(),
    } as unknown as RPCClient;
  });

  describe('getNextNonce', () => {
    it('fetches initial nonce from chain', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(5);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });
      const nonce = await manager.getNextNonce();

      expect(nonce).toBe(5);
      expect(mockRpc.getTransactionCount).toHaveBeenCalledWith(testAddress);
    });

    it('increments nonce locally on subsequent calls', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(10);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      const nonce1 = await manager.getNextNonce();
      const nonce2 = await manager.getNextNonce();
      const nonce3 = await manager.getNextNonce();

      expect(nonce1).toBe(10);
      expect(nonce2).toBe(11);
      expect(nonce3).toBe(12);

      // Should only fetch from chain once
      expect(mockRpc.getTransactionCount).toHaveBeenCalledTimes(1);
    });

    it('handles concurrent calls safely', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(0);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      // Fire off 10 concurrent nonce requests
      const promises = Array.from({ length: 10 }, () => manager.getNextNonce());
      const nonces = await Promise.all(promises);

      // All nonces should be unique and sequential
      const sorted = [...nonces].sort((a, b) => a - b);
      expect(sorted).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      // Should only fetch from chain once
      expect(mockRpc.getTransactionCount).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentNonce', () => {
    it('returns current nonce without incrementing', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(5);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      const current1 = await manager.getCurrentNonce();
      const current2 = await manager.getCurrentNonce();

      expect(current1).toBe(5);
      expect(current2).toBe(5);
    });

    it('reflects increments from getNextNonce', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(5);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      await manager.getNextNonce(); // 5
      await manager.getNextNonce(); // 6
      const current = await manager.getCurrentNonce();

      expect(current).toBe(7); // Next would be 7
    });
  });

  describe('sync', () => {
    it('resyncs with chain state', async () => {
      vi.mocked(mockRpc.getTransactionCount)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(10);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      const nonce1 = await manager.getNextNonce();
      expect(nonce1).toBe(5);

      await manager.sync();

      const nonce2 = await manager.getNextNonce();
      expect(nonce2).toBe(10);

      expect(mockRpc.getTransactionCount).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('clears local state and resyncs', async () => {
      vi.mocked(mockRpc.getTransactionCount)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      // Use some nonces
      await manager.getNextNonce(); // 0
      await manager.getNextNonce(); // 1
      await manager.getNextNonce(); // 2

      expect(manager.getPendingCount()).toBe(3);

      // Reset
      await manager.reset();

      expect(manager.getPendingCount()).toBe(0);

      // Should fetch fresh from chain
      const nonce = await manager.getNextNonce();
      expect(nonce).toBe(5);
    });
  });

  describe('onTransactionConfirmed', () => {
    it('decrements pending count', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(0);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      await manager.getNextNonce();
      await manager.getNextNonce();
      expect(manager.getPendingCount()).toBe(2);

      manager.onTransactionConfirmed();
      expect(manager.getPendingCount()).toBe(1);

      manager.onTransactionConfirmed();
      expect(manager.getPendingCount()).toBe(0);
    });

    it('does not go below zero', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(0);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      manager.onTransactionConfirmed();
      manager.onTransactionConfirmed();

      expect(manager.getPendingCount()).toBe(0);
    });
  });

  describe('onTransactionFailed', () => {
    it('resets nonce state', async () => {
      vi.mocked(mockRpc.getTransactionCount)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5); // After failure, chain still at 5

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      const nonce1 = await manager.getNextNonce(); // 5
      expect(nonce1).toBe(5);

      // Simulate transaction failure
      await manager.onTransactionFailed();

      // Should resync and get 5 again
      const nonce2 = await manager.getNextNonce();
      expect(nonce2).toBe(5);
    });
  });

  describe('createNonceManager', () => {
    it('creates a NonceManager instance', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(0);

      const manager = createNonceManager({ rpc: mockRpc, address: testAddress });

      expect(manager).toBeInstanceOf(NonceManager);
      const nonce = await manager.getNextNonce();
      expect(nonce).toBe(0);
    });
  });

  describe('race condition prevention', () => {
    it('prevents duplicate nonces under high concurrency', async () => {
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(100);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      // Simulate 100 concurrent transaction attempts
      const promises = Array.from({ length: 100 }, () => manager.getNextNonce());
      const nonces = await Promise.all(promises);

      // Verify all nonces are unique
      const uniqueNonces = new Set(nonces);
      expect(uniqueNonces.size).toBe(100);

      // Verify sequential
      const sorted = [...nonces].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        expect(sorted[i]).toBe(100 + i);
      }
    });

    it('handles interleaved operations correctly', async () => {
      vi.mocked(mockRpc.getTransactionCount)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(50);

      const manager = new NonceManager({ rpc: mockRpc, address: testAddress });

      // Get some nonces
      const nonce1 = await manager.getNextNonce(); // 0
      const nonce2 = await manager.getNextNonce(); // 1

      // Sync in the middle
      await manager.sync();

      // Continue getting nonces
      const nonce3 = await manager.getNextNonce(); // 50

      expect(nonce1).toBe(0);
      expect(nonce2).toBe(1);
      expect(nonce3).toBe(50);
    });
  });
});

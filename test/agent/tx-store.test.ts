import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  MemoryTransactionStore,
  FileTransactionStore,
  createMemoryStore,
  createFileStore,
  type PendingTransaction,
  type TransactionStore,
} from '../../src/agent/tx-store.js';
import type { Hash, Address, TransactionReceipt } from '../../src/core/types.js';

describe('TransactionStore', () => {
  const mockTx: PendingTransaction = {
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hash,
    from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address,
    to: '0x0000000000000000000000000000000000000001' as Address,
    value: 1000000000000000000n, // 1 ETH
    nonce: 5,
    chainId: 1,
    gasLimit: 21000n,
    maxFeePerGas: 50000000000n,
    maxPriorityFeePerGas: 2000000000n,
    status: 'pending',
    sentAt: Date.now(),
    description: 'Test transaction',
  };

  const mockReceipt: TransactionReceipt = {
    transactionHash: mockTx.hash,
    transactionIndex: 0,
    blockHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash,
    blockNumber: 12345678,
    from: mockTx.from,
    to: mockTx.to,
    gasUsed: 21000n,
    effectiveGasPrice: 45000000000n,
    cumulativeGasUsed: 21000n,
    status: 'success',
    logs: [],
    logsBloom: '0x' as `0x${string}`,
  };

  describe('MemoryTransactionStore', () => {
    let store: TransactionStore;

    beforeEach(() => {
      store = new MemoryTransactionStore();
    });

    it('saves and loads a transaction', async () => {
      await store.save(mockTx);
      const loaded = await store.load(mockTx.hash);
      expect(loaded).toEqual(mockTx);
    });

    it('returns null for non-existent transaction', async () => {
      const loaded = await store.load('0x0000000000000000000000000000000000000000000000000000000000000000' as Hash);
      expect(loaded).toBeNull();
    });

    it('lists pending transactions', async () => {
      await store.save(mockTx);
      await store.save({ ...mockTx, hash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hash });

      const pending = await store.listPending();
      expect(pending).toHaveLength(2);
    });

    it('lists all transactions', async () => {
      await store.save(mockTx);
      await store.markConfirmed(mockTx.hash, mockReceipt);

      const pendingTx2: PendingTransaction = {
        ...mockTx,
        hash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hash,
      };
      await store.save(pendingTx2);

      const all = await store.listAll();
      expect(all).toHaveLength(2);

      const pending = await store.listPending();
      expect(pending).toHaveLength(1);
    });

    it('marks transaction as confirmed', async () => {
      await store.save(mockTx);
      await store.markConfirmed(mockTx.hash, mockReceipt);

      const loaded = await store.load(mockTx.hash);
      expect(loaded?.status).toBe('confirmed');
      expect(loaded?.blockNumber).toBe(12345678);
      expect(loaded?.gasUsed).toBe(21000n);
      expect(loaded?.confirmedAt).toBeDefined();
    });

    it('marks transaction as failed on failed receipt', async () => {
      const failedReceipt: TransactionReceipt = { ...mockReceipt, status: 'reverted' };
      await store.save(mockTx);
      await store.markConfirmed(mockTx.hash, failedReceipt);

      const loaded = await store.load(mockTx.hash);
      expect(loaded?.status).toBe('failed');
    });

    it('marks transaction as failed', async () => {
      await store.save(mockTx);
      await store.markFailed(mockTx.hash);

      const loaded = await store.load(mockTx.hash);
      expect(loaded?.status).toBe('failed');
    });

    it('marks transaction as dropped', async () => {
      await store.save(mockTx);
      await store.markDropped(mockTx.hash);

      const loaded = await store.load(mockTx.hash);
      expect(loaded?.status).toBe('dropped');
    });

    it('deletes a transaction', async () => {
      await store.save(mockTx);
      const deleted = await store.delete(mockTx.hash);
      expect(deleted).toBe(true);

      const loaded = await store.load(mockTx.hash);
      expect(loaded).toBeNull();
    });

    it('returns false when deleting non-existent transaction', async () => {
      const deleted = await store.delete('0x0000000000000000000000000000000000000000000000000000000000000000' as Hash);
      expect(deleted).toBe(false);
    });

    it('clears all transactions', async () => {
      await store.save(mockTx);
      await store.save({ ...mockTx, hash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hash });

      await store.clear();

      const all = await store.listAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('FileTransactionStore', () => {
    let store: TransactionStore;
    let testFilePath: string;

    beforeEach(async () => {
      testFilePath = join(tmpdir(), `tx-store-test-${Date.now()}.json`);
      store = new FileTransactionStore(testFilePath);
    });

    afterEach(async () => {
      try {
        await fs.unlink(testFilePath);
      } catch {
        // File might not exist
      }
    });

    it('saves and loads a transaction', async () => {
      await store.save(mockTx);
      const loaded = await store.load(mockTx.hash);
      expect(loaded).toEqual(mockTx);
    });

    it('persists data to file', async () => {
      await store.save(mockTx);

      // Create a new store instance
      const store2 = new FileTransactionStore(testFilePath);
      const loaded = await store2.load(mockTx.hash);
      expect(loaded).toEqual(mockTx);
    });

    it('handles non-existent file gracefully', async () => {
      const nonExistentPath = join(tmpdir(), 'non-existent-file.json');
      const newStore = new FileTransactionStore(nonExistentPath);
      const pending = await newStore.listPending();
      expect(pending).toEqual([]);
    });

    it('serializes and deserializes bigints correctly', async () => {
      await store.save(mockTx);

      // Read raw file content
      const content = await fs.readFile(testFilePath, 'utf-8');
      const data = JSON.parse(content);

      // Check bigints are stored as strings
      expect(typeof data[0].value).toBe('string');
      expect(data[0].value).toBe('1000000000000000000');

      // Load and verify bigints are restored
      const loaded = await store.load(mockTx.hash);
      expect(loaded?.value).toBe(1000000000000000000n);
      expect(loaded?.gasLimit).toBe(21000n);
    });

    it('marks transaction as confirmed and persists', async () => {
      await store.save(mockTx);
      await store.markConfirmed(mockTx.hash, mockReceipt);

      // New instance should see the confirmed status
      const store2 = new FileTransactionStore(testFilePath);
      const loaded = await store2.load(mockTx.hash);
      expect(loaded?.status).toBe('confirmed');
      expect(loaded?.blockNumber).toBe(12345678);
    });

    it('clears file content', async () => {
      await store.save(mockTx);
      await store.clear();

      const content = await fs.readFile(testFilePath, 'utf-8');
      expect(JSON.parse(content)).toEqual([]);
    });
  });

  describe('factory functions', () => {
    it('createMemoryStore creates a MemoryTransactionStore', () => {
      const store = createMemoryStore();
      expect(store).toBeInstanceOf(MemoryTransactionStore);
    });

    it('createFileStore creates a FileTransactionStore', () => {
      const store = createFileStore('/tmp/test.json');
      expect(store).toBeInstanceOf(FileTransactionStore);
    });
  });

  describe('edge cases', () => {
    let store: TransactionStore;

    beforeEach(() => {
      store = new MemoryTransactionStore();
    });

    it('handles transaction with all optional fields', async () => {
      const fullTx: PendingTransaction = {
        ...mockTx,
        gasPrice: 50000000000n,
        data: '0xabcdef' as `0x${string}`,
        description: 'Full transaction with all fields',
      };

      await store.save(fullTx);
      const loaded = await store.load(fullTx.hash);
      expect(loaded?.gasPrice).toBe(50000000000n);
      expect(loaded?.data).toBe('0xabcdef');
    });

    it('handles transaction without optional fields', async () => {
      const minimalTx: PendingTransaction = {
        hash: mockTx.hash,
        from: mockTx.from,
        to: mockTx.to,
        value: mockTx.value,
        nonce: mockTx.nonce,
        chainId: mockTx.chainId,
        gasLimit: mockTx.gasLimit,
        status: 'pending',
        sentAt: Date.now(),
      };

      await store.save(minimalTx);
      const loaded = await store.load(minimalTx.hash);
      expect(loaded?.maxFeePerGas).toBeUndefined();
      expect(loaded?.data).toBeUndefined();
    });

    it('updates existing transaction on save', async () => {
      await store.save(mockTx);
      const updatedTx = { ...mockTx, description: 'Updated description' };
      await store.save(updatedTx);

      const loaded = await store.load(mockTx.hash);
      expect(loaded?.description).toBe('Updated description');

      const all = await store.listAll();
      expect(all).toHaveLength(1);
    });

    it('handles multiple pending transactions with different statuses', async () => {
      const tx1 = { ...mockTx, hash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hash };
      const tx2 = { ...mockTx, hash: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hash };
      const tx3 = { ...mockTx, hash: '0x0000000000000000000000000000000000000000000000000000000000000003' as Hash };

      await store.save(tx1);
      await store.save(tx2);
      await store.save(tx3);

      await store.markConfirmed(tx1.hash, mockReceipt);
      await store.markFailed(tx2.hash);

      const pending = await store.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.hash).toBe(tx3.hash);

      const all = await store.listAll();
      expect(all).toHaveLength(3);
    });

    it('handles marking non-existent transaction', async () => {
      // Should not throw
      await store.markConfirmed('0x0000000000000000000000000000000000000000000000000000000000000000' as Hash, mockReceipt);
      await store.markFailed('0x0000000000000000000000000000000000000000000000000000000000000000' as Hash);
      await store.markDropped('0x0000000000000000000000000000000000000000000000000000000000000000' as Hash);
    });
  });
});

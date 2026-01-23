import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionAccelerator, createAccelerator } from '../../src/protocol/acceleration.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { Account } from '../../src/protocol/account.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';
import { GWEI } from '../../src/core/units.js';

describe('TransactionAccelerator', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const otherAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
  const testHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash;
  const newHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hash;

  let mockRpc: RPCClient;
  let mockAccount: Account;
  let accelerator: TransactionAccelerator;

  beforeEach(() => {
    mockRpc = {
      getTransactionByHash: vi.fn(),
      getChainId: vi.fn().mockResolvedValue(1),
      estimateGas: vi.fn().mockResolvedValue(21000n),
      sendRawTransaction: vi.fn().mockResolvedValue(newHash),
      getGasPrice: vi.fn().mockResolvedValue(GWEI(20)),
    } as unknown as RPCClient;

    mockAccount = {
      address: testAddress,
      publicKey: '0x04' + '1234567890abcdef'.repeat(8) as Hex,
      sign: vi.fn().mockReturnValue({
        r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        s: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
        v: 27,
        yParity: 0,
      }),
    } as unknown as Account;

    accelerator = new TransactionAccelerator(mockRpc);
  });

  describe('getPendingTransaction', () => {
    it('returns pending transaction details', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        input: '0x',
        blockNumber: null, // pending
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.getPendingTransaction(testHash);

      expect(result).not.toBeNull();
      expect(result?.hash).toBe(testHash);
      expect(result?.from).toBe(testAddress);
      expect(result?.nonce).toBe(5);
    });

    it('returns null for already mined transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: 12345, // mined
      } as any);

      const result = await accelerator.getPendingTransaction(testHash);

      expect(result).toBeNull();
    });

    it('returns null for contract creation transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: null, // contract creation
        value: 0n,
        nonce: 5,
        blockNumber: null,
      } as any);

      const result = await accelerator.getPendingTransaction(testHash);

      expect(result).toBeNull();
    });

    it('returns null for non-existent transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue(null);

      const result = await accelerator.getPendingTransaction(testHash);

      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockRejectedValue(new Error('RPC error'));

      const result = await accelerator.getPendingTransaction(testHash);

      expect(result).toBeNull();
    });

    it('includes EIP-1559 gas fields', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        input: '0xabcdef',
        blockNumber: null,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
      } as any);

      const result = await accelerator.getPendingTransaction(testHash);

      expect(result?.maxFeePerGas).toBe(GWEI(30));
      expect(result?.maxPriorityFeePerGas).toBe(GWEI(2));
      expect(result?.data).toBe('0xabcdef');
    });
  });

  describe('speedUp', () => {
    it('speeds up EIP-1559 transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        input: '0x',
        blockNumber: null,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
      } as any);

      const result = await accelerator.speedUp(testHash, mockAccount);

      expect(result.success).toBe(true);
      expect(result.originalHash).toBe(testHash);
      expect(result.newHash).toBe(newHash);
      expect(result.gasIncrease.percentIncrease).toBe(20);
    });

    it('speeds up legacy transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        input: '0x',
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.speedUp(testHash, mockAccount);

      expect(result.success).toBe(true);
      expect(result.gasIncrease.from).toBe(GWEI(20));
    });

    it('throws for non-existent transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue(null);

      await expect(accelerator.speedUp(testHash, mockAccount))
        .rejects.toThrow('not found or already mined');
    });

    it('throws for transaction owned by different account', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: otherAddress, // different owner
        to: testAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      await expect(accelerator.speedUp(testHash, mockAccount))
        .rejects.toThrow('does not own');
    });

    it('throws for transaction without gas price', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        // no gasPrice or maxFeePerGas
      } as any);

      await expect(accelerator.speedUp(testHash, mockAccount))
        .rejects.toThrow('no gas price');
    });

    it('uses custom gas increase percent', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.speedUp(testHash, mockAccount, {
        gasIncreasePercent: 50,
      });

      expect(result.gasIncrease.percentIncrease).toBe(50);
    });

    it('uses custom maxFeePerGas', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
      } as any);

      const result = await accelerator.speedUp(testHash, mockAccount, {
        maxFeePerGas: GWEI(50),
        maxPriorityFeePerGas: GWEI(5),
      });

      expect(result.success).toBe(true);
    });

    it('includes data in speedup transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 0n,
        nonce: 5,
        input: '0xabcdef123456',
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.speedUp(testHash, mockAccount);

      expect(result.success).toBe(true);
      expect(mockRpc.estimateGas).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels EIP-1559 transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
      } as any);

      const result = await accelerator.cancel(testHash, mockAccount);

      expect(result.success).toBe(true);
      expect(result.originalHash).toBe(testHash);
      expect(result.cancellationHash).toBe(newHash);
    });

    it('cancels legacy transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.cancel(testHash, mockAccount);

      expect(result.success).toBe(true);
    });

    it('cancels transaction without gas info using current gas price', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
      } as any);

      const result = await accelerator.cancel(testHash, mockAccount);

      expect(result.success).toBe(true);
      expect(mockRpc.getGasPrice).toHaveBeenCalled();
    });

    it('throws for non-existent transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue(null);

      await expect(accelerator.cancel(testHash, mockAccount))
        .rejects.toThrow('not found or already mined');
    });

    it('throws for transaction owned by different account', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: otherAddress,
        to: testAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      await expect(accelerator.cancel(testHash, mockAccount))
        .rejects.toThrow('does not own');
    });

    it('uses custom gas increase percent', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.cancel(testHash, mockAccount, {
        gasIncreasePercent: 30,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('canModify', () => {
    it('returns true for modifiable transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: testAddress,
        to: otherAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.canModify(testHash, mockAccount);

      expect(result.canModify).toBe(true);
      expect(result.pendingTx).toBeDefined();
    });

    it('returns false for non-existent transaction', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue(null);

      const result = await accelerator.canModify(testHash, mockAccount);

      expect(result.canModify).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('returns false for transaction owned by different account', async () => {
      vi.mocked(mockRpc.getTransactionByHash).mockResolvedValue({
        hash: testHash,
        from: otherAddress,
        to: testAddress,
        value: 1000000000000000000n,
        nonce: 5,
        blockNumber: null,
        gasPrice: GWEI(20),
      } as any);

      const result = await accelerator.canModify(testHash, mockAccount);

      expect(result.canModify).toBe(false);
      expect(result.reason).toContain('does not own');
    });
  });

  describe('createAccelerator', () => {
    it('creates accelerator instance', () => {
      const accel = createAccelerator(mockRpc);

      expect(accel).toBeInstanceOf(TransactionAccelerator);
    });
  });
});

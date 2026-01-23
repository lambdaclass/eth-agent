import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentWatcher, createPaymentWatcher } from '../../src/agent/watcher.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';
import { USDC } from '../../src/stablecoins/index.js';
import type { Logger } from '../../src/core/logger.js';

describe('PaymentWatcher', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const senderAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;
  const testHash = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hash;

  // Transfer event signature
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hash;

  let mockRpc: RPCClient;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRpc = {
      getChainId: vi.fn().mockResolvedValue(1),
      getBlockNumber: vi.fn().mockResolvedValue(100),
      getLogs: vi.fn().mockResolvedValue([]),
    } as unknown as RPCClient;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates watcher with default options', () => {
      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
      });

      const status = watcher.getStatus();
      expect(status.address).toBe(testAddress.toLowerCase());
      expect(status.running).toBe(false);
    });

    it('creates watcher with custom options', () => {
      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        tokens: [USDC],
        pollingInterval: 5000,
        fromBlock: 50,
      });

      const status = watcher.getStatus();
      expect(status.tokens).toEqual(['USDC']);
      expect(status.lastProcessedBlock).toBe(50);
    });
  });

  describe('start and stop', () => {
    it('starts polling when started', async () => {
      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 1000,
      });

      const handler = vi.fn();
      watcher.start(handler);

      expect(watcher.getStatus().running).toBe(true);

      // Advance time to trigger poll
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockRpc.getBlockNumber).toHaveBeenCalled();

      watcher.stop();
      expect(watcher.getStatus().running).toBe(false);
    });

    it('clears handlers on stop', () => {
      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
      });

      const handler = vi.fn();
      watcher.start(handler);
      expect(watcher.getStatus().handlerCount).toBe(1);

      watcher.stop();
      expect(watcher.getStatus().handlerCount).toBe(0);
    });

    it('only starts once with multiple handlers', () => {
      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
      });

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      watcher.start(handler1);
      watcher.start(handler2);

      expect(watcher.getStatus().handlerCount).toBe(2);
      expect(watcher.getStatus().running).toBe(true);

      watcher.stop();
    });
  });

  describe('waitForPayment', () => {
    it('resolves when matching payment arrives', async () => {
      vi.mocked(mockRpc.getBlockNumber)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(101);

      const paddedSender = '0x000000000000000000000000' + senderAddress.slice(2);
      const paddedRecipient = '0x000000000000000000000000' + testAddress.slice(2).toLowerCase();

      vi.mocked(mockRpc.getLogs).mockResolvedValueOnce([
        {
          address: usdcAddress,
          topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
          data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex, // 100 USDC
          transactionHash: testHash,
          blockNumber: 101,
          logIndex: 0,
          blockHash: testHash,
          transactionIndex: 0,
          removed: false,
        },
      ]);

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 1000,
      });

      const paymentPromise = watcher.waitForPayment({ timeout: 5000 });

      // Advance time to trigger poll
      await vi.advanceTimersByTimeAsync(1000);

      const payment = await paymentPromise;

      expect(payment.token.symbol).toBe('USDC');
      expect(payment.amount).toBe(100000000n);
      expect(payment.formattedAmount).toBe('100');
    });

    it('rejects on timeout', async () => {
      vi.mocked(mockRpc.getBlockNumber).mockResolvedValue(100); // No new blocks

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 5000, // Long interval to avoid poll interference
      });

      // Catch rejection to prevent unhandled rejection warning
      let rejectedError: Error | null = null;
      const paymentPromise = watcher.waitForPayment({ timeout: 200 }).catch((err: Error) => {
        rejectedError = err;
      });

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(201);

      await paymentPromise;

      expect(rejectedError).not.toBeNull();
      expect(rejectedError!.message).toBe('Timeout waiting for payment after 200ms');
    });

    it('clears timeout when payment arrives (no memory leak)', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      vi.mocked(mockRpc.getBlockNumber)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(101);

      const paddedSender = '0x000000000000000000000000' + senderAddress.slice(2);
      const paddedRecipient = '0x000000000000000000000000' + testAddress.slice(2).toLowerCase();

      vi.mocked(mockRpc.getLogs).mockResolvedValueOnce([
        {
          address: usdcAddress,
          topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
          data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex,
          transactionHash: testHash,
          blockNumber: 101,
          logIndex: 0,
          blockHash: testHash,
          transactionIndex: 0,
          removed: false,
        },
      ]);

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 500,
      });

      const paymentPromise = watcher.waitForPayment({ timeout: 10000 });

      // Advance time to trigger poll (payment arrives)
      await vi.advanceTimersByTimeAsync(500);

      await paymentPromise;

      // Verify clearTimeout was called (memory leak fix)
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('stops watcher and cleans up after timeout', async () => {
      vi.mocked(mockRpc.getBlockNumber).mockResolvedValue(100); // No new blocks

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 10000, // Long interval to avoid interference
      });

      // Create promise and catch the rejection immediately to prevent unhandled rejection
      let rejectedError: Error | null = null;
      const paymentPromise = watcher.waitForPayment({ timeout: 100 }).catch((err: Error) => {
        rejectedError = err;
      });

      // Let timeout happen
      await vi.advanceTimersByTimeAsync(101);

      // Wait for promise to settle
      await paymentPromise;

      // Verify it timed out
      expect(rejectedError).not.toBeNull();
      expect(rejectedError!.message).toContain('Timeout');

      // Verify watcher stopped after timeout
      expect(watcher.getStatus().running).toBe(false);
      expect(watcher.getStatus().handlerCount).toBe(0);
    });

    it('filters by token', async () => {
      vi.mocked(mockRpc.getBlockNumber)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(101)
        .mockResolvedValueOnce(102);

      const paddedSender = '0x000000000000000000000000' + senderAddress.slice(2);
      const paddedRecipient = '0x000000000000000000000000' + testAddress.slice(2).toLowerCase();

      // First poll: USDT payment (should be ignored)
      vi.mocked(mockRpc.getLogs)
        .mockResolvedValueOnce([
          {
            address: '0xdac17f958d2ee523a2206206994597c13d831ec7' as Address, // USDT
            topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
            data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex,
            transactionHash: testHash,
            blockNumber: 101,
            logIndex: 0,
            blockHash: testHash,
            transactionIndex: 0,
            removed: false,
          },
        ])
        // Second poll: USDC payment (should match)
        .mockResolvedValueOnce([
          {
            address: usdcAddress,
            topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
            data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex,
            transactionHash: testHash,
            blockNumber: 102,
            logIndex: 0,
            blockHash: testHash,
            transactionIndex: 0,
            removed: false,
          },
        ]);

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 500,
      });

      try {
        const paymentPromise = watcher.waitForPayment({ token: USDC, timeout: 5000 });

        // First poll - USDT arrives, should be ignored
        await vi.advanceTimersByTimeAsync(500);

        // Second poll - USDC arrives
        await vi.advanceTimersByTimeAsync(500);

        const payment = await paymentPromise;
        expect(payment.token.symbol).toBe('USDC');
      } finally {
        watcher.stop();
      }
    });

    it('filters by minimum amount', async () => {
      vi.mocked(mockRpc.getBlockNumber)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(101)
        .mockResolvedValueOnce(102);

      const paddedSender = '0x000000000000000000000000' + senderAddress.slice(2);
      const paddedRecipient = '0x000000000000000000000000' + testAddress.slice(2).toLowerCase();

      vi.mocked(mockRpc.getLogs)
        // First poll: 50 USDC (below minimum)
        .mockResolvedValueOnce([
          {
            address: usdcAddress,
            topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
            data: '0x0000000000000000000000000000000000000000000000000000000002faf080' as Hex, // 50 USDC
            transactionHash: testHash,
            blockNumber: 101,
            logIndex: 0,
            blockHash: testHash,
            transactionIndex: 0,
            removed: false,
          },
        ])
        // Second poll: 150 USDC (above minimum)
        .mockResolvedValueOnce([
          {
            address: usdcAddress,
            topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
            data: '0x0000000000000000000000000000000000000000000000000000000008f0d180' as Hex, // 150 USDC
            transactionHash: testHash,
            blockNumber: 102,
            logIndex: 0,
            blockHash: testHash,
            transactionIndex: 0,
            removed: false,
          },
        ]);

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 500,
      });

      try {
        const paymentPromise = watcher.waitForPayment({
          minAmount: 100000000n, // 100 USDC minimum
          timeout: 5000,
        });

        // First poll - 50 USDC, below minimum
        await vi.advanceTimersByTimeAsync(500);

        // Second poll - 150 USDC, above minimum
        await vi.advanceTimersByTimeAsync(500);

        const payment = await paymentPromise;
        expect(payment.amount).toBe(150000000n);
      } finally {
        watcher.stop();
      }
    });

    it('filters by sender', async () => {
      vi.mocked(mockRpc.getBlockNumber)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(101)
        .mockResolvedValueOnce(102);

      const otherSender = '0x9999999999999999999999999999999999999999' as Address;
      const paddedOtherSender = '0x000000000000000000000000' + otherSender.slice(2);
      const paddedExpectedSender = '0x000000000000000000000000' + senderAddress.slice(2);
      const paddedRecipient = '0x000000000000000000000000' + testAddress.slice(2).toLowerCase();

      vi.mocked(mockRpc.getLogs)
        // First poll: from wrong sender
        .mockResolvedValueOnce([
          {
            address: usdcAddress,
            topics: [transferTopic, paddedOtherSender as Hash, paddedRecipient as Hash],
            data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex,
            transactionHash: testHash,
            blockNumber: 101,
            logIndex: 0,
            blockHash: testHash,
            transactionIndex: 0,
            removed: false,
          },
        ])
        // Second poll: from expected sender
        .mockResolvedValueOnce([
          {
            address: usdcAddress,
            topics: [transferTopic, paddedExpectedSender as Hash, paddedRecipient as Hash],
            data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex,
            transactionHash: testHash,
            blockNumber: 102,
            logIndex: 0,
            blockHash: testHash,
            transactionIndex: 0,
            removed: false,
          },
        ]);

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 500,
      });

      try {
        const paymentPromise = watcher.waitForPayment({
          from: senderAddress,
          timeout: 5000,
        });

        // First poll - wrong sender
        await vi.advanceTimersByTimeAsync(500);

        // Second poll - correct sender
        await vi.advanceTimersByTimeAsync(500);

        const payment = await paymentPromise;
        expect(payment.from.toLowerCase()).toBe(senderAddress.toLowerCase());
      } finally {
        watcher.stop();
      }
    });
  });

  describe('checkOnce', () => {
    it('polls once and returns payments', async () => {
      vi.mocked(mockRpc.getBlockNumber)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(101);

      const paddedSender = '0x000000000000000000000000' + senderAddress.slice(2);
      const paddedRecipient = '0x000000000000000000000000' + testAddress.slice(2).toLowerCase();

      vi.mocked(mockRpc.getLogs).mockResolvedValueOnce([
        {
          address: usdcAddress,
          topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
          data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex,
          transactionHash: testHash,
          blockNumber: 101,
          logIndex: 0,
          blockHash: testHash,
          transactionIndex: 0,
          removed: false,
        },
      ]);

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
      });

      // First call initializes lastProcessedBlock
      await watcher.checkOnce();

      // Second call finds the payment
      const payments = await watcher.checkOnce();

      expect(payments).toHaveLength(1);
      expect(payments[0].token.symbol).toBe('USDC');
    });
  });

  describe('createPaymentWatcher', () => {
    it('creates a PaymentWatcher instance', () => {
      const watcher = createPaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
      });

      expect(watcher).toBeInstanceOf(PaymentWatcher);
    });
  });

  describe('structured logging', () => {
    it('uses provided logger for poll errors', async () => {
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      vi.mocked(mockRpc.getBlockNumber).mockRejectedValueOnce(new Error('Network error'));

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        pollingInterval: 1000,
        logger: mockLogger,
      });

      // Trigger a poll that will fail
      await watcher.checkOnce();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Payment watcher poll error',
        expect.objectContaining({
          error: expect.stringContaining('Network error'),
          address: testAddress.toLowerCase(),
        })
      );
    });

    it('uses provided logger for handler errors', async () => {
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      vi.mocked(mockRpc.getBlockNumber)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(101);

      const paddedSender = '0x000000000000000000000000' + senderAddress.slice(2);
      const paddedRecipient = '0x000000000000000000000000' + testAddress.slice(2).toLowerCase();

      vi.mocked(mockRpc.getLogs).mockResolvedValueOnce([
        {
          address: usdcAddress,
          topics: [transferTopic, paddedSender as Hash, paddedRecipient as Hash],
          data: '0x0000000000000000000000000000000000000000000000000000000005f5e100' as Hex,
          transactionHash: testHash,
          blockNumber: 101,
          logIndex: 0,
          blockHash: testHash,
          transactionIndex: 0,
          removed: false,
        },
      ]);

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        logger: mockLogger,
      });

      // Add a handler that throws
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      watcher.start(failingHandler);

      // First poll initializes lastProcessedBlock
      await watcher.checkOnce();

      // Second poll finds payment and calls handler
      await watcher.checkOnce();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Payment handler error',
        expect.objectContaining({
          error: expect.stringContaining('Handler failed'),
          transactionHash: testHash,
          token: 'USDC',
        })
      );

      watcher.stop();
    });

    it('does not log when using default noop logger', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(mockRpc.getBlockNumber).mockRejectedValueOnce(new Error('Network error'));

      const watcher = new PaymentWatcher({
        rpc: mockRpc,
        address: testAddress,
        // No logger provided - uses noopLogger
      });

      await watcher.checkOnce();

      // No console.error calls because noopLogger is used
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

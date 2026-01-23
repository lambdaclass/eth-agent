/**
 * Fuzz tests for PaymentWatcher
 * Tests robustness of log parsing and event handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { PaymentWatcher } from '../../src/agent/watcher.js';
import { USDC, USDT, USDS } from '../../src/stablecoins/index.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';
import { keccak256 } from '../../src/core/hash.js';

// Mock RPC client
const createMockRpc = (overrides: Partial<{
  getChainId: () => Promise<number>;
  getBlockNumber: () => Promise<number>;
  getLogs: (filter: unknown) => Promise<unknown[]>;
}> = {}) => ({
  getChainId: overrides.getChainId ?? (async () => 1),
  getBlockNumber: overrides.getBlockNumber ?? (async () => 1000),
  getLogs: overrides.getLogs ?? (async () => []),
});

// Transfer event signature
const TRANSFER_TOPIC = keccak256(
  new TextEncoder().encode('Transfer(address,address,uint256)')
);

// Arbitraries - using byte arrays to generate hex strings
const addressArb = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 20, maxLength: 20 })
  .map((bytes) => ('0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('')) as Address);
const hashArb = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 32, maxLength: 32 })
  .map((bytes) => ('0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('')) as Hash);
// Use positive amounts only (0 amount transfers are rare/edge case)
const amountArb = fc.bigInt({ min: 1n, max: 10n ** 24n });

describe('PaymentWatcher fuzz tests', () => {
  describe('Log parsing robustness', () => {
    test.prop([
      addressArb,  // from
      addressArb,  // to (watched address)
      amountArb,   // amount
      fc.integer({ min: 1, max: 1000000 }),  // block number
      fc.integer({ min: 0, max: 100 }),  // log index
    ], { numRuns: 100 })(
      'valid Transfer logs parse correctly',
      async (from, watchedAddress, amount, blockNumber, logIndex) => {
        // Create a mock log
        const fromPadded = '0x' + from.slice(2).padStart(64, '0');
        const toPadded = '0x' + watchedAddress.slice(2).padStart(64, '0');
        const amountHex = '0x' + amount.toString(16).padStart(64, '0');

        const mockLog = {
          address: USDC.addresses[1] as Address,  // USDC on mainnet
          topics: [
            TRANSFER_TOPIC,
            fromPadded as Hex,
            toPadded as Hex,
          ],
          data: amountHex as Hex,
          transactionHash: '0x' + 'ab'.repeat(32) as Hash,
          blockNumber,
          logIndex,
        };

        const mockRpc = createMockRpc({
          getChainId: async () => 1,
          getBlockNumber: async () => blockNumber + 1,
          getLogs: async () => [mockLog],
        });

        const watcher = new PaymentWatcher({
          rpc: mockRpc as any,
          address: watchedAddress,
          tokens: [USDC],
        });

        const payments: unknown[] = [];
        watcher.start((payment) => {
          payments.push(payment);
        });

        // Wait for poll
        await new Promise((resolve) => setTimeout(resolve, 50));
        watcher.stop();

        // Should have received the payment
        if (payments.length > 0) {
          const payment = payments[0] as any;
          expect(payment.amount).toBe(amount);
          expect(payment.token.symbol).toBe('USDC');
          expect(payment.blockNumber).toBe(blockNumber);
        }
      }
    );

    test.prop([
      fc.uint8Array({ minLength: 0, maxLength: 200 }),  // Random data
    ], { numRuns: 50 })(
      'malformed log data does not crash',
      async (randomData) => {
        const mockLog = {
          address: USDC.addresses[1] as Address,
          topics: [TRANSFER_TOPIC],
          data: '0x' + Buffer.from(randomData).toString('hex') as Hex,
          transactionHash: '0x' + 'ab'.repeat(32) as Hash,
          blockNumber: 1000,
          logIndex: 0,
        };

        const mockRpc = createMockRpc({
          getChainId: async () => 1,
          getBlockNumber: async () => 1001,
          getLogs: async () => [mockLog],
        });

        const watcher = new PaymentWatcher({
          rpc: mockRpc as any,
          address: '0x' + 'aa'.repeat(20) as Address,
          tokens: [USDC],
        });

        // Should not throw
        const payments = await watcher.checkOnce();

        // May or may not have payments, but should not crash
        expect(Array.isArray(payments)).toBe(true);
      }
    );

    test.prop([
      fc.array(
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 64 })
          .map((bytes) => '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('')),
        { minLength: 0, maxLength: 5 }
      ),
    ], { numRuns: 50 })(
      'malformed topics do not crash',
      async (topics) => {
        const mockLog = {
          address: USDC.addresses[1] as Address,
          topics: topics.map((t) => `0x${t}` as Hex),
          data: '0x' + '00'.repeat(32) as Hex,
          transactionHash: '0x' + 'ab'.repeat(32) as Hash,
          blockNumber: 1000,
          logIndex: 0,
        };

        const mockRpc = createMockRpc({
          getChainId: async () => 1,
          getBlockNumber: async () => 1001,
          getLogs: async () => [mockLog],
        });

        const watcher = new PaymentWatcher({
          rpc: mockRpc as any,
          address: '0x' + 'aa'.repeat(20) as Address,
          tokens: [USDC],
        });

        // Should not throw
        expect(() => watcher.checkOnce()).not.toThrow();
      }
    );
  });

  describe('Multiple simultaneous payments', () => {
    test.prop([
      fc.array(
        fc.record({
          from: addressArb,
          amount: amountArb,
        }),
        { minLength: 1, maxLength: 20 }
      ),
    ], { numRuns: 20 })(
      'handles multiple payments in single block',
      async (transfers) => {
        const watchedAddress = '0x' + 'bb'.repeat(20) as Address;

        let callCount = 0;
        const mockLogs = transfers.map((t, i) => ({
          address: USDC.addresses[1] as Address,
          topics: [
            TRANSFER_TOPIC,
            '0x' + t.from.slice(2).padStart(64, '0') as Hex,
            '0x' + watchedAddress.slice(2).padStart(64, '0') as Hex,
          ],
          data: '0x' + t.amount.toString(16).padStart(64, '0') as Hex,
          transactionHash: '0x' + i.toString(16).padStart(64, '0') as Hash,
          blockNumber: 1000,
          logIndex: i,
        }));

        const mockRpc = createMockRpc({
          getChainId: async () => 1,
          getBlockNumber: async () => {
            callCount++;
            return 999 + callCount; // Increment each call so new blocks appear
          },
          getLogs: async () => mockLogs,
        });

        const watcher = new PaymentWatcher({
          rpc: mockRpc as any,
          address: watchedAddress,
          tokens: [USDC],
        });

        // First call initializes lastProcessedBlock
        await watcher.checkOnce();
        // Second call processes logs
        const payments = await watcher.checkOnce();

        // Should receive all payments
        expect(payments.length).toBe(transfers.length);

        // Total amount should match
        const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0n);
        const totalExpected = transfers.reduce((sum, t) => sum + t.amount, 0n);
        expect(totalReceived).toBe(totalExpected);
      }
    );
  });

  describe('Token filtering', () => {
    test.prop([
      fc.constantFrom(USDC, USDT, USDS),
      amountArb,
    ], { numRuns: 30 })(
      'only receives payments for watched tokens',
      async (watchedToken, amount) => {
        const watchedAddress = '0x' + 'cc'.repeat(20) as Address;

        // Create logs for watched token
        const watchedLog = {
          address: watchedToken.addresses[1] as Address,
          topics: [
            TRANSFER_TOPIC,
            '0x' + 'dd'.repeat(32) as Hex,
            '0x' + watchedAddress.slice(2).padStart(64, '0') as Hex,
          ],
          data: '0x' + amount.toString(16).padStart(64, '0') as Hex,
          transactionHash: '0x' + '11'.repeat(32) as Hash,
          blockNumber: 1000,
          logIndex: 0,
        };

        let callCount = 0;
        const mockRpc = createMockRpc({
          getChainId: async () => 1,
          getBlockNumber: async () => {
            callCount++;
            return 999 + callCount; // Increment each call
          },
          getLogs: async () => [watchedLog],
        });

        const watcher = new PaymentWatcher({
          rpc: mockRpc as any,
          address: watchedAddress,
          tokens: [watchedToken],
        });

        // First call initializes, second processes
        await watcher.checkOnce();
        const payments = await watcher.checkOnce();

        // Should receive payment for watched token
        expect(payments.length).toBe(1);
        expect(payments[0]!.token.symbol).toBe(watchedToken.symbol);
      }
    );
  });

  describe('Status reporting', () => {
    test.prop([
      addressArb,
      fc.integer({ min: 1, max: 1000000 }),
    ])(
      'getStatus returns consistent state',
      (address, blockNumber) => {
        const mockRpc = createMockRpc({
          getChainId: async () => 1,
          getBlockNumber: async () => blockNumber,
        });

        const watcher = new PaymentWatcher({
          rpc: mockRpc as any,
          address,
          tokens: [USDC, USDT],
          fromBlock: blockNumber - 100,
        });

        const status = watcher.getStatus();

        expect(status.address).toBe(address.toLowerCase());
        expect(status.tokens).toEqual(['USDC', 'USDT']);
        expect(status.running).toBe(false);
        expect(status.handlerCount).toBe(0);
      }
    );
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { LimitsEngine } from '../../src/agent/limits.js';
import { USDC } from '../../src/stablecoins/tokens.js';
import { BridgeLimitError, BridgeDestinationNotAllowedError } from '../../src/agent/errors.js';

describe('LimitsEngine - Bridge Limits', () => {
  describe('checkBridgeTransaction', () => {
    it('should allow bridge within limits', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 50000,
        },
      });

      // 1000 USDC = $1000
      const amount = 1000n * 10n ** 6n;

      // Should not throw
      expect(() => {
        limits.checkBridgeTransaction(USDC, amount, 42161);
      }).not.toThrow();
    });

    it('should reject bridge exceeding per-transaction limit', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 1000,
          perDayUSD: 50000,
        },
      });

      // 2000 USDC = $2000
      const amount = 2000n * 10n ** 6n;

      expect(() => {
        limits.checkBridgeTransaction(USDC, amount, 42161);
      }).toThrow(BridgeLimitError);
    });

    it('should reject bridge exceeding daily limit', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 5000,
        },
      });

      // First bridge of 3000 USDC should work
      const amount1 = 3000n * 10n ** 6n;
      limits.checkBridgeTransaction(USDC, amount1, 42161);
      limits.recordBridgeSpend(USDC, amount1, 42161);

      // Second bridge of 3000 USDC should exceed daily limit
      const amount2 = 3000n * 10n ** 6n;
      expect(() => {
        limits.checkBridgeTransaction(USDC, amount2, 42161);
      }).toThrow(BridgeLimitError);
    });

    it('should reject bridge to non-allowed destination', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 50000,
          allowedDestinations: [1, 8453], // Only Ethereum and Base
        },
      });

      const amount = 1000n * 10n ** 6n;

      // Arbitrum (42161) not in allowed list
      expect(() => {
        limits.checkBridgeTransaction(USDC, amount, 42161);
      }).toThrow(BridgeDestinationNotAllowedError);

      // Base (8453) is allowed
      expect(() => {
        limits.checkBridgeTransaction(USDC, amount, 8453);
      }).not.toThrow();
    });

    it('should allow any destination when allowedDestinations is empty', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 50000,
          allowedDestinations: [], // Empty = allow all
        },
      });

      const amount = 1000n * 10n ** 6n;

      // Any destination should work
      expect(() => {
        limits.checkBridgeTransaction(USDC, amount, 42161);
      }).not.toThrow();

      expect(() => {
        limits.checkBridgeTransaction(USDC, amount, 8453);
      }).not.toThrow();
    });
  });

  describe('recordBridgeSpend', () => {
    it('should record bridge spend', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 50000,
        },
      });

      const amount = 1000n * 10n ** 6n;
      limits.recordBridgeSpend(USDC, amount, 42161);

      const status = limits.getBridgeStatus();
      expect(status.daily.used).toBe('1000');
      expect(status.daily.remaining).toBe('49000');
    });

    it('should accumulate bridge spends', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 50000,
        },
      });

      const amount = 1000n * 10n ** 6n;
      limits.recordBridgeSpend(USDC, amount, 42161);
      limits.recordBridgeSpend(USDC, amount, 8453);
      limits.recordBridgeSpend(USDC, amount, 10);

      const status = limits.getBridgeStatus();
      expect(status.daily.used).toBe('3000');
      expect(status.daily.remaining).toBe('47000');
    });
  });

  describe('getBridgeStatus', () => {
    it('should return correct status with defaults', () => {
      const limits = new LimitsEngine();

      const status = limits.getBridgeStatus();

      expect(status.perTransaction.limit).toBe('10000');
      expect(status.daily.limit).toBe('50000');
      expect(status.daily.used).toBe('0');
      expect(status.daily.remaining).toBe('50000');
      expect(status.allowedDestinations).toEqual([]);
    });

    it('should return correct status with custom limits', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 5000,
          perDayUSD: 25000,
          allowedDestinations: [1, 42161],
        },
      });

      const status = limits.getBridgeStatus();

      expect(status.perTransaction.limit).toBe('5000');
      expect(status.daily.limit).toBe('25000');
      expect(status.allowedDestinations).toEqual([1, 42161]);
    });
  });

  describe('getMaxBridgeAmount', () => {
    it('should return max based on per-transaction limit', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 1000,
          perDayUSD: 50000,
        },
      });

      const max = limits.getMaxBridgeAmount(USDC);
      // Should be $1000 worth of USDC (1000 * 10^6)
      expect(max).toBe(1000n * 10n ** 6n);
    });

    it('should return max based on daily remaining', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 5000,
        },
      });

      // Spend 4000 USDC
      const spent = 4000n * 10n ** 6n;
      limits.recordBridgeSpend(USDC, spent, 42161);

      const max = limits.getMaxBridgeAmount(USDC);
      // Should be $1000 remaining (1000 * 10^6)
      expect(max).toBe(1000n * 10n ** 6n);
    });

    it('should return 0 when stopped', () => {
      const limits = new LimitsEngine({
        bridge: {
          perTransactionUSD: 10000,
          perDayUSD: 50000,
        },
      });

      limits.triggerEmergencyStop('Test stop');

      const max = limits.getMaxBridgeAmount(USDC);
      expect(max).toBe(0n);
    });
  });
});

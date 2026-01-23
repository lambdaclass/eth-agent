import { describe, it, expect, beforeEach } from 'vitest';
import { LimitsEngine } from '../../src/agent/limits.js';
import { ETH } from '../../src/core/units.js';

describe('LimitsEngine', () => {
  let limits: LimitsEngine;

  beforeEach(() => {
    limits = new LimitsEngine({
      perTransaction: '1 ETH',
      perHour: '5 ETH',
      perDay: '20 ETH',
    });
  });

  describe('checkTransaction', () => {
    it('allows transactions within limits', () => {
      expect(() => limits.checkTransaction(ETH(0.5))).not.toThrow();
      expect(() => limits.checkTransaction(ETH(1))).not.toThrow();
    });

    it('blocks transactions exceeding per-transaction limit', () => {
      expect(() => limits.checkTransaction(ETH(1.5))).toThrow('per-transaction limit');
    });

    it('tracks spending for hourly limits', () => {
      // Spend 5 transactions of 1 ETH each (per-tx limit)
      for (let i = 0; i < 5; i++) {
        limits.checkTransaction(ETH(1));
        limits.recordSpend(ETH(1), ETH(0.01));
      }

      // Next transaction should exceed hourly limit (5 ETH)
      expect(() => limits.checkTransaction(ETH(1))).toThrow('hourly limit');
    });

    it('tracks spending for daily limits', () => {
      // Create engine with higher hourly limit for this test
      const dailyLimits = new LimitsEngine({
        perTransaction: '1 ETH',
        perHour: '25 ETH', // High enough not to trigger
        perDay: '20 ETH',
      });

      // Spend close to daily limit
      for (let i = 0; i < 20; i++) {
        dailyLimits.checkTransaction(ETH(1));
        dailyLimits.recordSpend(ETH(1), ETH(0.01));
      }

      // This should exceed daily limit
      expect(() => dailyLimits.checkTransaction(ETH(1))).toThrow('daily limit');
    });
  });

  describe('getStatus', () => {
    it('returns current limit status', () => {
      const status = limits.getStatus();

      expect(status.perTransaction.limit).toBe('1');
      expect(status.hourly.limit).toBe('5');
      expect(status.daily.limit).toBe('20');
      expect(status.hourly.used).toBe('0');
      expect(status.daily.used).toBe('0');
      expect(status.stopped).toBe(false);
    });

    it('updates after spending', () => {
      limits.checkTransaction(ETH(1));
      limits.recordSpend(ETH(1), ETH(0.01));

      const status = limits.getStatus();
      expect(status.hourly.used).toBe('1');
      expect(status.daily.used).toBe('1');
      expect(status.hourly.remaining).toBe('4');
      expect(status.daily.remaining).toBe('19');
    });
  });

  describe('getMaxSendable', () => {
    it('returns per-transaction limit when no spending', () => {
      const max = limits.getMaxSendable();
      expect(max).toBe(ETH(1));
    });

    it('decreases as hourly limit is approached', () => {
      limits.checkTransaction(ETH(1));
      limits.recordSpend(ETH(1), ETH(0.01));

      limits.checkTransaction(ETH(1));
      limits.recordSpend(ETH(1), ETH(0.01));

      limits.checkTransaction(ETH(1));
      limits.recordSpend(ETH(1), ETH(0.01));

      limits.checkTransaction(ETH(1));
      limits.recordSpend(ETH(1), ETH(0.01));

      // Now only 1 ETH remaining in hourly limit, same as per-tx
      const max = limits.getMaxSendable();
      expect(max).toBe(ETH(1));
    });
  });

  describe('emergency stop', () => {
    it('blocks all transactions when stopped', () => {
      limits.triggerEmergencyStop('Test stop');
      expect(() => limits.checkTransaction(ETH(0.01))).toThrow('stopped');
    });

    it('can be resumed', () => {
      limits.triggerEmergencyStop('Test stop');
      limits.resume();
      expect(() => limits.checkTransaction(ETH(0.5))).not.toThrow();
    });

    it('triggers on balance threshold', () => {
      const limitsWithStop = new LimitsEngine({
        perTransaction: '10 ETH',
        perDay: '100 ETH',
        emergencyStop: {
          minBalanceRequired: '1 ETH',
        },
      });

      // Transaction that would leave balance below minimum
      expect(() => limitsWithStop.checkTransaction(ETH(5), ETH(5))).toThrow();
    });
  });

  describe('updateLimits', () => {
    it('updates limits dynamically', () => {
      limits.updateLimits({ perTransaction: '2 ETH' });

      const status = limits.getStatus();
      expect(status.perTransaction.limit).toBe('2');
    });

    it('updates multiple limits at once', () => {
      limits.updateLimits({
        perTransaction: '3 ETH',
        perHour: '15 ETH',
        perDay: '50 ETH',
        perWeek: '200 ETH',
      });

      const status = limits.getStatus();
      expect(status.perTransaction.limit).toBe('3');
      expect(status.hourly.limit).toBe('15');
      expect(status.daily.limit).toBe('50');
    });

    it('updates gas limits', () => {
      limits.updateLimits({
        maxGasPerHour: '0.1 ETH',
        maxGasPerDay: '0.5 ETH',
      });

      // Should not throw initially
      expect(() => limits.checkGas(ETH(0.1))).not.toThrow();
    });

    it('updates emergency stop config', () => {
      limits.updateLimits({
        emergencyStop: {
          haltIfSpentPercent: 30,
          minBalanceRequired: '2 ETH',
        },
      });

      // Transaction would leave balance below new minimum
      expect(() => limits.checkTransaction(ETH(0.5), ETH(2))).toThrow();
    });

    it('accepts bigint values', () => {
      limits.updateLimits({
        perTransaction: ETH(2),
        perHour: ETH(10),
      });

      const status = limits.getStatus();
      expect(status.perTransaction.limit).toBe('2');
    });
  });

  describe('checkGas', () => {
    it('allows gas within hourly limit', () => {
      expect(() => limits.checkGas(ETH(0.1))).not.toThrow();
    });

    it('tracks gas spending for hourly limits', () => {
      // Spend up to the gas limit
      for (let i = 0; i < 5; i++) {
        limits.checkGas(ETH(0.1));
        limits.recordSpend(0n, ETH(0.1));
      }

      // Next gas check should exceed default hourly gas limit (0.5 ETH)
      expect(() => limits.checkGas(ETH(0.1))).toThrow('hourly');
    });

    it('throws when stopped', () => {
      limits.triggerEmergencyStop('Test');
      expect(() => limits.checkGas(ETH(0.01))).toThrow('stopped');
    });

    it('tracks gas for daily limits', () => {
      // Create engine with low gas limits
      const gasLimits = new LimitsEngine({
        maxGasPerHour: '5 ETH',
        maxGasPerDay: '2 ETH',
      });

      // Spend close to daily gas limit
      for (let i = 0; i < 20; i++) {
        gasLimits.recordSpend(0n, ETH(0.1));
      }

      // This should exceed daily gas limit (2 ETH)
      expect(() => gasLimits.checkGas(ETH(0.1))).toThrow('daily');
    });
  });

  describe('emergency stop on percentage', () => {
    it('triggers when spending exceeds percentage of balance', () => {
      const limitsWithPercentage = new LimitsEngine({
        perTransaction: '100 ETH',
        perDay: '100 ETH',
        emergencyStop: {
          haltIfSpentPercent: 10,
        },
      });

      // With 10 ETH balance, spending more than 1 ETH (10%) should trigger stop
      expect(() => limitsWithPercentage.checkTransaction(ETH(2), ETH(10))).toThrow('stopped');
    });
  });

  describe('getMaxSendable', () => {
    it('returns 0 when stopped', () => {
      limits.triggerEmergencyStop('Test');
      expect(limits.getMaxSendable()).toBe(0n);
    });

    it('respects hourly limit when lower', () => {
      const lowHourlyLimits = new LimitsEngine({
        perTransaction: '10 ETH',
        perHour: '2 ETH',
        perDay: '20 ETH',
      });

      expect(lowHourlyLimits.getMaxSendable()).toBe(ETH(2));
    });

    it('respects daily limit when lower', () => {
      const lowDailyLimits = new LimitsEngine({
        perTransaction: '10 ETH',
        perHour: '20 ETH',
        perDay: '3 ETH',
      });

      expect(lowDailyLimits.getMaxSendable()).toBe(ETH(3));
    });
  });

  describe('constructor', () => {
    it('uses default limits when none provided', () => {
      const defaultLimits = new LimitsEngine();
      const status = defaultLimits.getStatus();

      expect(status.perTransaction.limit).toBe('1');
      expect(status.hourly.limit).toBe('5');
      expect(status.daily.limit).toBe('20');
    });

    it('accepts bigint limits', () => {
      const bigintLimits = new LimitsEngine({
        perTransaction: ETH(2),
        perHour: ETH(10),
        perDay: ETH(50),
      });

      const status = bigintLimits.getStatus();
      expect(status.perTransaction.limit).toBe('2');
    });
  });

  describe('getStatus', () => {
    it('includes stop reason when stopped', () => {
      limits.triggerEmergencyStop('Custom reason');
      const status = limits.getStatus();

      expect(status.stopped).toBe(true);
      expect(status.stopReason).toBe('Custom reason');
    });

    it('calculates remaining correctly when exceeds limit', () => {
      // Force remaining to go negative by spending beyond limit
      limits.recordSpend(ETH(6), 0n); // Exceeds hourly limit

      const status = limits.getStatus();
      expect(status.hourly.remaining).toBe('0'); // Should clamp to 0
    });
  });

  describe('Swap Limits', () => {
    let swapLimits: LimitsEngine;

    beforeEach(() => {
      swapLimits = new LimitsEngine({
        perTransaction: '1 ETH',
        perDay: '20 ETH',
        swap: {
          perTransactionUSD: 1000,
          perDayUSD: 10000,
          maxSlippagePercent: 1,
          maxPriceImpactPercent: 5,
          allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH'],
          blockedTokens: ['SCAM'],
        },
      });
    });

    describe('checkSwapTransaction', () => {
      it('allows swaps within limits', () => {
        expect(() => swapLimits.checkSwapTransaction(
          'USDC',
          'ETH',
          500000000n // $500 (6 decimals)
        )).not.toThrow();
      });

      it('blocks swaps exceeding per-transaction limit', () => {
        expect(() => swapLimits.checkSwapTransaction(
          'USDC',
          'ETH',
          2000000000n // $2000
        )).toThrow('per-transaction');
      });

      it('tracks spending for daily limits', () => {
        // Spend multiple swaps
        for (let i = 0; i < 10; i++) {
          swapLimits.checkSwapTransaction('USDC', 'ETH', 1000000000n); // $1000
          swapLimits.recordSwapSpend('USDC', 'ETH', 1000000000n);
        }

        // Next swap should exceed daily limit ($10,000)
        expect(() => swapLimits.checkSwapTransaction(
          'USDC',
          'ETH',
          1000000000n
        )).toThrow('daily');
      });

      it('checks token allowlist', () => {
        expect(() => swapLimits.checkSwapTransaction(
          'UNKNOWN',
          'ETH',
          500000000n
        )).toThrow(/not in the allowed/i);
      });

      it('checks token blocklist', () => {
        expect(() => swapLimits.checkSwapTransaction(
          'SCAM',
          'ETH',
          500000000n
        )).toThrow(/blocked for swapping/i);
      });

      it('checks price impact limits', () => {
        expect(() => swapLimits.checkSwapTransaction(
          'USDC',
          'ETH',
          500000000n,
          10 // 10% exceeds max 5%
        )).toThrow(/price impact/i);
      });

      it('allows swap when price impact within limit', () => {
        expect(() => swapLimits.checkSwapTransaction(
          'USDC',
          'ETH',
          500000000n,
          2 // 2% is within 5% limit
        )).not.toThrow();
      });
    });

    describe('recordSwapSpend', () => {
      it('records swap spending', () => {
        swapLimits.recordSwapSpend('USDC', 'ETH', 500000000n); // $500
        const status = swapLimits.getSwapStatus();
        expect(status.daily.used).toBe('500');
      });

      it('accumulates multiple swaps', () => {
        swapLimits.recordSwapSpend('USDC', 'ETH', 300000000n); // $300
        swapLimits.recordSwapSpend('ETH', 'USDC', 200000000n); // $200
        const status = swapLimits.getSwapStatus();
        expect(status.daily.used).toBe('500');
      });
    });

    describe('getSwapStatus', () => {
      it('returns current swap limit status', () => {
        const status = swapLimits.getSwapStatus();

        expect(status.perTransaction.limit).toBe('1000');
        expect(status.daily.limit).toBe('10000');
        expect(status.daily.used).toBe('0');
        expect(status.daily.remaining).toBe('10000');
        expect(status.maxSlippagePercent).toBe(1);
        expect(status.maxPriceImpactPercent).toBe(5);
      });

      it('updates after spending', () => {
        swapLimits.recordSwapSpend('USDC', 'ETH', 1000000000n); // $1000

        const status = swapLimits.getSwapStatus();
        expect(status.daily.used).toBe('1000');
        expect(status.daily.remaining).toBe('9000');
      });
    });

    describe('getMaxSwapUSD', () => {
      it('returns per-transaction limit when no spending', () => {
        const max = swapLimits.getMaxSwapUSD();
        expect(max).toBe(1000000000n); // $1000 in 6 decimals
      });

      it('decreases as daily limit is approached', () => {
        // Spend $9500
        swapLimits.recordSwapSpend('USDC', 'ETH', 9500000000n);

        const max = swapLimits.getMaxSwapUSD();
        expect(max).toBe(500000000n); // Only $500 remaining
      });
    });

    describe('isTokenAllowedForSwap', () => {
      it('returns true for allowed tokens', () => {
        expect(swapLimits.isTokenAllowedForSwap('ETH')).toBe(true);
        expect(swapLimits.isTokenAllowedForSwap('USDC')).toBe(true);
        expect(swapLimits.isTokenAllowedForSwap('WETH')).toBe(true);
      });

      it('returns false for blocked tokens', () => {
        expect(swapLimits.isTokenAllowedForSwap('SCAM')).toBe(false);
      });

      it('returns false for tokens not in allowlist', () => {
        expect(swapLimits.isTokenAllowedForSwap('UNI')).toBe(false);
      });

      it('is case-insensitive', () => {
        expect(swapLimits.isTokenAllowedForSwap('eth')).toBe(true);
        expect(swapLimits.isTokenAllowedForSwap('Usdc')).toBe(true);
      });
    });

    describe('getMaxSlippagePercent', () => {
      it('returns configured max slippage', () => {
        expect(swapLimits.getMaxSlippagePercent()).toBe(1);
      });

      it('returns default when not configured', () => {
        const defaultLimits = new LimitsEngine({});
        expect(defaultLimits.getMaxSlippagePercent()).toBe(1); // Default 1%
      });
    });

    describe('getMaxPriceImpactPercent', () => {
      it('returns configured max price impact', () => {
        expect(swapLimits.getMaxPriceImpactPercent()).toBe(5);
      });

      it('returns default when not configured', () => {
        const defaultLimits = new LimitsEngine({});
        expect(defaultLimits.getMaxPriceImpactPercent()).toBe(5); // Default 5%
      });
    });

    describe('swap limits without allowlist', () => {
      it('allows any token when no allowlist configured', () => {
        const noAllowlist = new LimitsEngine({
          swap: {
            perTransactionUSD: 1000,
            perDayUSD: 10000,
            blockedTokens: ['SCAM'],
          },
        });

        expect(noAllowlist.isTokenAllowedForSwap('UNI')).toBe(true);
        expect(noAllowlist.isTokenAllowedForSwap('LINK')).toBe(true);
        expect(noAllowlist.isTokenAllowedForSwap('SCAM')).toBe(false);
      });
    });

    describe('swap limits with emergency stop', () => {
      it('blocks swaps when stopped', () => {
        swapLimits.triggerEmergencyStop('Test');

        expect(() => swapLimits.checkSwapTransaction({
          usdValue: 100000000n,
          tokenInSymbol: 'USDC',
          tokenOutSymbol: 'ETH',
        })).toThrow('stopped');
      });
    });
  });
});

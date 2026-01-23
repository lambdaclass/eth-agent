/**
 * Property-based tests for the LimitsEngine
 * Tests stablecoin limit parsing, normalization, and enforcement
 */

import { describe, beforeEach, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { LimitsEngine, type SpendingLimits } from '../../src/agent/limits.js';
import {
  USDC,
  USDT,
  USDS,
  DAI,
  FRAX,
  type StablecoinInfo,
  parseStablecoinAmount,
  formatStablecoinAmount,
} from '../../src/stablecoins/index.js';

// Standard tokens for testing
const TOKENS_6_DECIMALS = [USDC, USDT] as const;
const TOKENS_18_DECIMALS = [USDS, DAI, FRAX] as const;
const ALL_TOKENS = [...TOKENS_6_DECIMALS, ...TOKENS_18_DECIMALS];

// Arbitraries
const stablecoinArb = fc.constantFrom(...ALL_TOKENS);
// Use integers and divide to get decimal amounts (avoids 32-bit float issues)
const positiveAmount = fc.integer({ min: 1, max: 100000000 }).map(n => n / 1000);
const limitAmount = fc.integer({ min: 1000, max: 1000000000 }).map(n => n / 1000);

describe('LimitsEngine property-based tests', () => {
  describe('Stablecoin limit parsing', () => {
    test.prop([limitAmount])(
      'USD limits parse to correct internal representation',
      (amount) => {
        const limits: SpendingLimits = {
          stablecoin: {
            perTransactionUSD: amount,
          },
        };

        const engine = new LimitsEngine(limits);
        const status = engine.getStablecoinStatus();

        // The limit should be formatted back correctly
        const parsedLimit = parseFloat(status.global.perTransaction.limit);
        expect(parsedLimit).toBeCloseTo(amount, 2);
      }
    );

    test.prop([limitAmount, limitAmount, limitAmount])(
      'All USD limit types parse correctly',
      (perTx, perHour, perDay) => {
        // Ensure per-hour >= per-tx and per-day >= per-hour
        const sortedLimits = [perTx, perHour, perDay].sort((a, b) => a - b);

        const limits: SpendingLimits = {
          stablecoin: {
            perTransactionUSD: sortedLimits[0],
            perHourUSD: sortedLimits[1],
            perDayUSD: sortedLimits[2],
          },
        };

        const engine = new LimitsEngine(limits);
        const status = engine.getStablecoinStatus();

        expect(parseFloat(status.global.perTransaction.limit)).toBeCloseTo(sortedLimits[0]!, 2);
        expect(parseFloat(status.global.hourly.limit)).toBeCloseTo(sortedLimits[1]!, 2);
        expect(parseFloat(status.global.daily.limit)).toBeCloseTo(sortedLimits[2]!, 2);
      }
    );
  });

  describe('Stablecoin amount normalization', () => {
    test.prop([positiveAmount])(
      'USDC amounts normalize correctly (6 decimals)',
      (amount) => {
        // Parse as USDC
        const raw = parseStablecoinAmount(amount.toString(), USDC);

        // Create engine with generous limits (much higher than amount)
        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: amount * 10,
            perHourUSD: amount * 100,
            perDayUSD: amount * 1000,
          },
        });

        // Should not throw - amount is within limits
        expect(() => engine.checkStablecoinTransaction(USDC, raw)).not.toThrow();
      }
    );

    test.prop([positiveAmount])(
      'USDS amounts normalize correctly (18 decimals)',
      (amount) => {
        // Parse as USDS (18 decimals)
        const raw = parseStablecoinAmount(amount.toString(), USDS);

        // Create engine with generous limits (much higher than amount)
        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: amount * 10,
            perHourUSD: amount * 100,
            perDayUSD: amount * 1000,
          },
        });

        // Should not throw - amount is within limits
        expect(() => engine.checkStablecoinTransaction(USDS, raw)).not.toThrow();
      }
    );

    test.prop([stablecoinArb, positiveAmount])(
      'Normalized amounts are consistent across tokens',
      (token, amount) => {
        // Same dollar amount should be treated equally regardless of token decimals
        const raw = parseStablecoinAmount(amount.toString(), token);

        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: amount * 10,
            perHourUSD: amount * 100,
            perDayUSD: amount * 1000,
          },
        });

        // Should not throw for any token
        expect(() => engine.checkStablecoinTransaction(token, raw)).not.toThrow();
      }
    );
  });

  describe('Spending tracking', () => {
    test.prop([stablecoinArb, fc.array(positiveAmount, { minLength: 1, maxLength: 10 })])(
      'Multiple spends are tracked cumulatively',
      (token, amounts) => {
        const totalAmount = amounts.reduce((sum, a) => sum + a, 0);

        // Set daily limit to total + 1 so all spends pass
        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: Math.max(...amounts) + 1,
            perHourUSD: totalAmount + 1,
            perDayUSD: totalAmount + 1,
          },
        });

        // Record all spends
        for (const amount of amounts) {
          const raw = parseStablecoinAmount(amount.toString(), token);
          engine.recordStablecoinSpend(token, raw);
        }

        // Check that we can no longer spend the full limit
        const status = engine.getStablecoinStatus(token);
        const remaining = parseFloat(status.global.hourly.remaining);
        expect(remaining).toBeLessThan(1.5); // Allow small floating point error
      }
    );

    test.prop([stablecoinArb, positiveAmount])(
      'getMaxStablecoinSendable returns valid amount',
      (token, limitAmount) => {
        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: limitAmount,
            perHourUSD: limitAmount,
            perDayUSD: limitAmount,
          },
        });

        const max = engine.getMaxStablecoinSendable(token);

        // Max should be positive and within token's decimal representation
        expect(max).toBeGreaterThanOrEqual(0n);

        // Converting back should approximately equal the limit
        const formatted = formatStablecoinAmount(max, token);
        expect(parseFloat(formatted)).toBeCloseTo(limitAmount, 0);
      }
    );
  });

  describe('Limit enforcement', () => {
    test.prop([positiveAmount])(
      'Transaction exceeding limit throws error',
      (limitAmount) => {
        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: limitAmount,
            perHourUSD: limitAmount * 10,
            perDayUSD: limitAmount * 100,
          },
        });

        // Amount exceeding limit
        const raw = parseStablecoinAmount((limitAmount * 2).toString(), USDC);

        expect(() => engine.checkStablecoinTransaction(USDC, raw)).toThrow();
      }
    );

    test.prop([positiveAmount])(
      'Transaction within limit passes',
      (limitAmount) => {
        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: limitAmount,
            perHourUSD: limitAmount * 10,
            perDayUSD: limitAmount * 100,
          },
        });

        // Amount within limit
        const raw = parseStablecoinAmount((limitAmount * 0.5).toString(), USDC);

        expect(() => engine.checkStablecoinTransaction(USDC, raw)).not.toThrow();
      }
    );

    test.prop([
      fc.integer({ min: 100, max: 10000 }),  // hourlyLimit
      fc.integer({ min: 10, max: 90 }).map(n => n / 100),  // spendRatio (0.1 - 0.9)
    ])(
      'Hourly limit enforces cumulative spending',
      (hourlyLimit, spendRatio) => {
        const engine = new LimitsEngine({
          stablecoin: {
            perTransactionUSD: hourlyLimit,
            perHourUSD: hourlyLimit,
            perDayUSD: hourlyLimit * 10,
          },
        });

        // First spend: fraction of limit
        const firstAmount = hourlyLimit * spendRatio;
        const firstRaw = parseStablecoinAmount(firstAmount.toString(), USDC);
        engine.checkStablecoinTransaction(USDC, firstRaw);
        engine.recordStablecoinSpend(USDC, firstRaw);

        // Second spend: remainder + some excess should fail
        const excessAmount = hourlyLimit - firstAmount + 1;
        const excessRaw = parseStablecoinAmount(excessAmount.toString(), USDC);

        expect(() => engine.checkStablecoinTransaction(USDC, excessRaw)).toThrow();
      }
    );
  });
});

describe('Stablecoin amount parsing/formatting roundtrip', () => {
  test.prop([stablecoinArb, positiveAmount])(
    'parseStablecoinAmount and formatStablecoinAmount are inverse',
    (token, amount) => {
      // Format to appropriate precision for token
      const precision = Math.min(token.decimals, 6);
      const truncated = Math.floor(amount * 10 ** precision) / 10 ** precision;
      const amountStr = truncated.toFixed(precision);

      const parsed = parseStablecoinAmount(amountStr, token);
      const formatted = formatStablecoinAmount(parsed, token);
      const reparsed = parseStablecoinAmount(formatted, token);

      // Should roundtrip
      expect(reparsed).toBe(parsed);
    }
  );

  test.prop([fc.bigInt({ min: 1n, max: 10n ** 24n }), stablecoinArb])(
    'formatStablecoinAmount and parseStablecoinAmount roundtrip for bigints',
    (rawAmount, token) => {
      const formatted = formatStablecoinAmount(rawAmount, token);
      const reparsed = parseStablecoinAmount(formatted, token);

      // For tokens with fewer decimals, some precision loss is expected
      // but values should be very close
      const diff = rawAmount > reparsed ? rawAmount - reparsed : reparsed - rawAmount;
      const tolerance = 10n ** BigInt(Math.max(0, 18 - token.decimals));

      expect(diff).toBeLessThanOrEqual(tolerance);
    }
  );
});

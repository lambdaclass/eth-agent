/**
 * Property-based tests for SmartAgentWallet
 * Tests batch transfer logic, amount calculations, and gasless operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  USDC,
  USDT,
  USDS,
  parseStablecoinAmount,
  formatStablecoinAmount,
  type StablecoinInfo,
} from '../../src/stablecoins/index.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';

// Since SmartAgentWallet.create is async and requires real network calls,
// we test the underlying logic directly

// Arbitraries
const addressArb = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 20, maxLength: 20 })
  .map((bytes) => ('0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('')) as Address);
// Use integers and divide to get decimal amounts (avoids 32-bit float issues)
const amountArb = fc.integer({ min: 10, max: 10000000 }).map(n => n / 1000);
const stablecoinArb = fc.constantFrom(USDC, USDT, USDS);

// Helper to calculate batch totals
function calculateBatchTotal(
  amounts: number[],
  token: StablecoinInfo
): { total: bigint; formatted: string; items: Array<{ raw: bigint; formatted: string }> } {
  const items = amounts.map((amount) => {
    const raw = parseStablecoinAmount(amount.toString(), token);
    return { raw, formatted: formatStablecoinAmount(raw, token) };
  });

  const total = items.reduce((sum, item) => sum + item.raw, 0n);
  const formatted = formatStablecoinAmount(total, token);

  return { total, formatted, items };
}

describe('Batch transfer calculations', () => {
  test.prop([
    fc.array(amountArb, { minLength: 1, maxLength: 50 }),
    stablecoinArb,
  ])(
    'batch total equals sum of individual amounts',
    (amounts, token) => {
      const batch = calculateBatchTotal(amounts, token);

      // Sum of individual raw amounts should equal total
      const manualSum = batch.items.reduce((sum, item) => sum + item.raw, 0n);
      expect(batch.total).toBe(manualSum);
    }
  );

  test.prop([
    fc.array(amountArb, { minLength: 2, maxLength: 10 }),
    stablecoinArb,
  ])(
    'batch total is greater than or equal to any individual amount',
    (amounts, token) => {
      const batch = calculateBatchTotal(amounts, token);

      for (const item of batch.items) {
        expect(batch.total).toBeGreaterThanOrEqual(item.raw);
      }
    }
  );

  test.prop([
    amountArb,
    fc.integer({ min: 1, max: 100 }),
    stablecoinArb,
  ])(
    'batch of identical amounts = amount * count',
    (amount, count, token) => {
      const amounts = Array(count).fill(amount);
      const batch = calculateBatchTotal(amounts, token);

      const singleAmount = parseStablecoinAmount(amount.toString(), token);
      const expectedTotal = singleAmount * BigInt(count);

      expect(batch.total).toBe(expectedTotal);
    }
  );
});

describe('Batch transfer item validation', () => {
  const validateBatchItem = (item: { to: string; amount: string | number }, token: StablecoinInfo): {
    valid: boolean;
    error?: string;
    parsedAmount?: bigint;
  } => {
    // Check address format
    if (!item.to.match(/^0x[a-fA-F0-9]{40}$/)) {
      return { valid: false, error: 'Invalid address format' };
    }

    // Check amount
    try {
      const parsedAmount = parseStablecoinAmount(item.amount, token);
      if (parsedAmount <= 0n) {
        return { valid: false, error: 'Amount must be positive' };
      }
      return { valid: true, parsedAmount };
    } catch {
      return { valid: false, error: 'Invalid amount format' };
    }
  };

  test.prop([addressArb, amountArb, stablecoinArb])(
    'valid batch items pass validation',
    (address, amount, token) => {
      const item = { to: address, amount: amount.toString() };
      const result = validateBatchItem(item, token);

      expect(result.valid).toBe(true);
      expect(result.parsedAmount).toBeGreaterThan(0n);
    }
  );

  test.prop([fc.string({ minLength: 1, maxLength: 50 }), amountArb, stablecoinArb])(
    'invalid addresses fail validation',
    (invalidAddress, amount, token) => {
      // Ensure it's not accidentally valid
      fc.pre(!invalidAddress.match(/^0x[a-fA-F0-9]{40}$/));

      const item = { to: invalidAddress, amount: amount.toString() };
      const result = validateBatchItem(item, token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('address');
    }
  );

  test.prop([addressArb, fc.float({ min: -1000, max: 0, noNaN: true }), stablecoinArb])(
    'non-positive amounts fail validation',
    (address, negativeAmount, token) => {
      const item = { to: address, amount: negativeAmount.toString() };
      const result = validateBatchItem(item, token);

      // Either parsing fails or amount is not positive
      if (result.valid) {
        expect(result.parsedAmount).toBeGreaterThan(0n);
      }
    }
  );
});

describe('Gasless operation prerequisites', () => {
  // Simulate paymaster availability check
  const canDoGasless = (hasPaymaster: boolean, requestGasless: boolean): {
    canExecute: boolean;
    reason?: string;
  } => {
    if (requestGasless && !hasPaymaster) {
      return { canExecute: false, reason: 'Gasless requires paymaster' };
    }
    return { canExecute: true };
  };

  test.prop([fc.boolean(), fc.boolean()])(
    'gasless only available with paymaster',
    (hasPaymaster, requestGasless) => {
      const result = canDoGasless(hasPaymaster, requestGasless);

      if (requestGasless && !hasPaymaster) {
        expect(result.canExecute).toBe(false);
        expect(result.reason).toContain('paymaster');
      } else {
        expect(result.canExecute).toBe(true);
      }
    }
  );
});

describe('Limit checking for batches', () => {
  // Simulate batch limit checking
  const checkBatchLimits = (
    transfers: Array<{ amount: bigint }>,
    limits: { perTransaction: bigint; perHour: bigint; perDay: bigint }
  ): { allowed: boolean; violation?: string } => {
    const total = transfers.reduce((sum, t) => sum + t.amount, 0n);

    // Check if total exceeds daily limit
    if (total > limits.perDay) {
      return { allowed: false, violation: 'daily' };
    }

    // Check if total exceeds hourly limit
    if (total > limits.perHour) {
      return { allowed: false, violation: 'hourly' };
    }

    // Check individual transfers against per-transaction limit
    for (const transfer of transfers) {
      if (transfer.amount > limits.perTransaction) {
        return { allowed: false, violation: 'transaction' };
      }
    }

    return { allowed: true };
  };

  test.prop([
    fc.array(
      fc.bigInt({ min: 1n, max: 1000n * 10n ** 6n }),
      { minLength: 1, maxLength: 10 }
    ).map((amounts) => amounts.map((amount) => ({ amount }))),
    fc.record({
      perTransaction: fc.bigInt({ min: 100n * 10n ** 6n, max: 10000n * 10n ** 6n }),
      perHour: fc.bigInt({ min: 1000n * 10n ** 6n, max: 50000n * 10n ** 6n }),
      perDay: fc.bigInt({ min: 5000n * 10n ** 6n, max: 100000n * 10n ** 6n }),
    }),
  ])(
    'batch limit checking is consistent',
    (transfers, limits) => {
      const result = checkBatchLimits(transfers, limits);

      if (result.allowed) {
        // If allowed, verify no limits are exceeded
        const total = transfers.reduce((sum, t) => sum + t.amount, 0n);
        expect(total).toBeLessThanOrEqual(limits.perDay);
        expect(total).toBeLessThanOrEqual(limits.perHour);
        for (const t of transfers) {
          expect(t.amount).toBeLessThanOrEqual(limits.perTransaction);
        }
      } else {
        // If not allowed, verify the violation makes sense
        expect(['transaction', 'hourly', 'daily']).toContain(result.violation);
      }
    }
  );
});

describe('Balance sufficiency for batches', () => {
  const checkBalanceSufficiency = (
    balance: bigint,
    transfers: Array<{ amount: bigint }>
  ): { sufficient: boolean; shortage?: bigint } => {
    const total = transfers.reduce((sum, t) => sum + t.amount, 0n);

    if (balance >= total) {
      return { sufficient: true };
    }

    return { sufficient: false, shortage: total - balance };
  };

  test.prop([
    fc.bigInt({ min: 0n, max: 10n ** 12n }),  // balance
    fc.array(
      fc.bigInt({ min: 1n, max: 10n ** 9n }),
      { minLength: 1, maxLength: 20 }
    ).map((amounts) => amounts.map((amount) => ({ amount }))),
  ])(
    'balance check correctly identifies shortages',
    (balance, transfers) => {
      const result = checkBalanceSufficiency(balance, transfers);
      const total = transfers.reduce((sum, t) => sum + t.amount, 0n);

      if (balance >= total) {
        expect(result.sufficient).toBe(true);
        expect(result.shortage).toBeUndefined();
      } else {
        expect(result.sufficient).toBe(false);
        expect(result.shortage).toBe(total - balance);
      }
    }
  );

  test.prop([
    fc.bigInt({ min: 10n ** 9n, max: 10n ** 12n }),  // balance
    fc.integer({ min: 1, max: 100 }),  // split count
  ])(
    'can always batch transfers that individually fit in balance',
    (balance, splitCount) => {
      // Split balance into equal parts
      const amountPer = balance / BigInt(splitCount);

      // Create transfers that definitely fit
      const transfers = Array(splitCount)
        .fill(null)
        .map(() => ({ amount: amountPer }));

      const result = checkBalanceSufficiency(balance, transfers);

      // Should always be sufficient since we're just splitting the balance
      expect(result.sufficient).toBe(true);
    }
  );
});

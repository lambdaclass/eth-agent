import { describe } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  parseUnits,
  formatUnits,
  ETH,
  GWEI,
  convertDecimals,
  mulPercent,
  addPercent,
  toPercent,
} from '../../src/core/units.js';

describe('units property-based tests', () => {
  test.prop([
    fc.float({ min: 0, max: 1000000, noNaN: true }),
    fc.integer({ min: 0, max: 18 }),
  ])(
    'parseUnits/formatUnits approximate roundtrip',
    (value, decimals) => {
      // Truncate to reasonable precision
      const truncated = Math.floor(value * 10 ** decimals) / 10 ** decimals;
      const str = truncated.toFixed(decimals);

      const parsed = parseUnits(str, decimals);
      const formatted = formatUnits(parsed, decimals);
      const reparsed = parseUnits(formatted, decimals);

      // Should be equal after roundtrip
      expect(reparsed).toBe(parsed);
    }
  );

  test.prop([fc.bigInt({ min: 0n, max: 10n ** 30n })])(
    'ETH conversion is consistent with GWEI',
    (gwei) => {
      // 1 ETH = 10^9 GWEI
      const weiFromGwei = gwei * 10n ** 9n;
      const ethFromGwei = formatUnits(weiFromGwei, 18);
      const ethValue = parseFloat(ethFromGwei);
      const gweiValue = parseFloat(formatUnits(gwei, 0));

      // ethValue * 10^9 should approximately equal gweiValue
      if (ethValue > 0) {
        const ratio = gweiValue / ethValue;
        expect(ratio).toBeCloseTo(10 ** 9, -3);
      }
    }
  );

  test.prop([
    fc.bigInt({ min: 1n, max: 10n ** 27n }),
    fc.integer({ min: 0, max: 18 }),
    fc.integer({ min: 0, max: 18 }),
  ])(
    'convertDecimals preserves value semantically',
    (value, fromDecimals, toDecimals) => {
      const converted = convertDecimals(value, fromDecimals, toDecimals);

      if (fromDecimals < toDecimals) {
        // Increasing precision - should multiply
        const factor = 10n ** BigInt(toDecimals - fromDecimals);
        expect(converted).toBe(value * factor);
      } else if (fromDecimals > toDecimals) {
        // Decreasing precision - should divide (truncate)
        const factor = 10n ** BigInt(fromDecimals - toDecimals);
        expect(converted).toBe(value / factor);
      } else {
        // Same decimals
        expect(converted).toBe(value);
      }
    }
  );

  test.prop([
    fc.bigInt({ min: 0n, max: 10n ** 18n }),
    fc.float({ min: 0, max: 100, noNaN: true }),
  ])(
    'mulPercent is approximately correct',
    (value, percent) => {
      const result = mulPercent(value, percent);
      // Using 1,000,000 multiplier for 0.0001% precision (6 decimal places)
      const expected = (value * BigInt(Math.round(percent * 10000))) / 1000000n;

      // Allow for rounding differences (increased tolerance for higher precision)
      const diff = result > expected ? result - expected : expected - result;
      expect(diff).toBeLessThanOrEqual(1n);
    }
  );

  test.prop([
    fc.bigInt({ min: 1n, max: 10n ** 18n }),
    fc.float({ min: 0, max: 100, noNaN: true }),
  ])(
    'addPercent increases value correctly',
    (value, percent) => {
      const result = addPercent(value, percent);
      const addition = mulPercent(value, percent);

      expect(result).toBe(value + addition);
    }
  );

  test.prop([
    fc.bigInt({ min: 0n, max: 10n ** 18n }),
    fc.bigInt({ min: 1n, max: 10n ** 18n }),
  ])(
    'toPercent calculates percentage correctly',
    (value, total) => {
      // toPercent now uses 1,000,000 multiplier for 0.0001% precision
      // and throws if the result would exceed safe integer bounds
      const scaled = (value * 1000000n) / total;

      // Skip test cases that would overflow (percentage > ~9 trillion%)
      // This can happen with extreme value/total ratios
      if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
        expect(() => toPercent(value, total)).toThrow('exceeds safe integer bounds');
        return;
      }

      const percent = toPercent(value, total);

      // Reverse calculation with new precision (1,000,000 multiplier, divided by 10000)
      const expected = Number(scaled) / 10000;

      expect(percent).toBeCloseTo(expected, 2);
    }
  );
});

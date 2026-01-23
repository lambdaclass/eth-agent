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
      const expected = (value * BigInt(Math.round(percent * 100))) / 10000n;

      // Allow for rounding differences
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
      const percent = toPercent(value, total);

      // Reverse calculation
      const calculated = (value * 10000n) / total;
      const expected = Number(calculated) / 100;

      expect(percent).toBeCloseTo(expected, 2);
    }
  );
});

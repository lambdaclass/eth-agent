import { describe, it, expect } from 'vitest';
import {
  ETH,
  GWEI,
  WEI,
  parseAmount,
  parseUnits,
  formatUnits,
  formatETH,
  formatGWEI,
  formatAuto,
  convertDecimals,
  parseTokenAmount,
  mulPercent,
  addPercent,
  toPercent,
} from '../../src/core/units.js';

describe('unit conversions', () => {
  describe('ETH', () => {
    it('converts ETH to Wei', () => {
      expect(ETH(1)).toBe(10n ** 18n);
      expect(ETH(0.5)).toBe(5n * 10n ** 17n);
      expect(ETH(0.001)).toBe(10n ** 15n);
      expect(ETH('1.5')).toBe(15n * 10n ** 17n);
    });
  });

  describe('GWEI', () => {
    it('converts GWEI to Wei', () => {
      expect(GWEI(1)).toBe(10n ** 9n);
      expect(GWEI(20)).toBe(20n * 10n ** 9n);
      expect(GWEI(0.5)).toBe(5n * 10n ** 8n);
    });
  });

  describe('WEI', () => {
    it('creates Wei values', () => {
      expect(WEI(1)).toBe(1n);
      expect(WEI(1000)).toBe(1000n);
      expect(WEI(1000n)).toBe(1000n);
      expect(WEI('1000')).toBe(1000n);
    });
  });

  describe('parseAmount', () => {
    it('parses ETH amounts', () => {
      expect(parseAmount('1 ETH')).toBe(10n ** 18n);
      expect(parseAmount('0.5 ETH')).toBe(5n * 10n ** 17n);
      expect(parseAmount('1ETH')).toBe(10n ** 18n);
    });

    it('parses GWEI amounts', () => {
      expect(parseAmount('1 GWEI')).toBe(10n ** 9n);
      expect(parseAmount('20 GWEI')).toBe(20n * 10n ** 9n);
    });

    it('parses WEI amounts', () => {
      expect(parseAmount('1000 WEI')).toBe(1000n);
    });

    it('parses raw numbers with default decimals', () => {
      expect(parseAmount('1000000000000000000')).toBe(10n ** 18n);
    });
  });

  describe('parseUnits', () => {
    it('parses decimal values', () => {
      expect(parseUnits('1', 18)).toBe(10n ** 18n);
      expect(parseUnits('1.5', 18)).toBe(15n * 10n ** 17n);
      expect(parseUnits('0.000001', 18)).toBe(10n ** 12n);
    });

    it('truncates excess decimals', () => {
      expect(parseUnits('1.123456789012345678901234', 18)).toBe(1123456789012345678n);
    });

    it('handles various decimal places', () => {
      expect(parseUnits('1', 6)).toBe(1000000n);
      expect(parseUnits('1.5', 6)).toBe(1500000n);
      expect(parseUnits('100', 8)).toBe(10000000000n);
    });
  });

  describe('formatUnits', () => {
    it('formats Wei to decimal string', () => {
      expect(formatUnits(10n ** 18n, 18)).toBe('1');
      expect(formatUnits(15n * 10n ** 17n, 18)).toBe('1.5');
      expect(formatUnits(10n ** 12n, 18)).toBe('0.000001');
    });

    it('removes trailing zeros', () => {
      expect(formatUnits(1000000n, 6)).toBe('1');
      expect(formatUnits(1500000n, 6)).toBe('1.5');
    });

    it('handles zero', () => {
      expect(formatUnits(0n, 18)).toBe('0');
    });
  });

  describe('formatETH', () => {
    it('formats Wei to ETH string', () => {
      expect(formatETH(10n ** 18n)).toBe('1');
      expect(formatETH(15n * 10n ** 17n)).toBe('1.5');
      expect(formatETH(0n)).toBe('0');
    });
  });

  describe('formatGWEI', () => {
    it('formats Wei to GWEI string', () => {
      expect(formatGWEI(10n ** 9n)).toBe('1');
      expect(formatGWEI(20n * 10n ** 9n)).toBe('20');
    });
  });

  describe('formatAuto', () => {
    it('automatically selects appropriate unit', () => {
      expect(formatAuto(10n ** 18n)).toContain('ETH');
      expect(formatAuto(10n ** 9n)).toContain('GWEI');
      expect(formatAuto(1000n)).toContain('WEI');
    });
  });

  describe('convertDecimals', () => {
    it('converts between decimal precisions', () => {
      // 1 token with 18 decimals to 6 decimals
      expect(convertDecimals(10n ** 18n, 18, 6)).toBe(1000000n);
      // 1 token with 6 decimals to 18 decimals
      expect(convertDecimals(1000000n, 6, 18)).toBe(10n ** 18n);
    });

    it('handles same decimals', () => {
      expect(convertDecimals(1000n, 6, 6)).toBe(1000n);
    });
  });

  describe('parseTokenAmount', () => {
    it('parses token amounts with symbols', () => {
      const usdc = parseTokenAmount('1000 USDC');
      expect(usdc.value).toBe(1000000000n); // 6 decimals
      expect(usdc.symbol).toBe('USDC');

      const dai = parseTokenAmount('100 DAI');
      expect(dai.value).toBe(100n * 10n ** 18n);
      expect(dai.symbol).toBe('DAI');
    });
  });

  describe('percentage operations', () => {
    it('calculates percentage of value', () => {
      expect(mulPercent(10000n, 50)).toBe(5000n); // 50% of 10000
      expect(mulPercent(10000n, 1)).toBe(100n); // 1% of 10000
    });

    it('adds percentage to value', () => {
      expect(addPercent(10000n, 10)).toBe(11000n); // 10000 + 10%
      expect(addPercent(10000n, 50)).toBe(15000n); // 10000 + 50%
    });

    it('calculates percentage of total', () => {
      expect(toPercent(50n, 100n)).toBe(50);
      expect(toPercent(25n, 100n)).toBe(25);
      expect(toPercent(0n, 100n)).toBe(0);
    });
  });
});

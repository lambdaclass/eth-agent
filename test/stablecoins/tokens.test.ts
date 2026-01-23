/**
 * Tests for stablecoin token utilities
 */

import { describe, it, expect } from 'vitest';
import {
  USDC,
  USDT,
  USDS,
  DAI,
  PYUSD,
  FRAX,
  STABLECOINS,
  getStablecoinAddress,
  getStablecoinsForChain,
  isKnownStablecoin,
  parseStablecoinAmount,
  formatStablecoinAmount,
} from '../../src/stablecoins';

describe('Stablecoin Tokens', () => {
  describe('Token definitions', () => {
    it('USDC has correct properties', () => {
      expect(USDC.symbol).toBe('USDC');
      expect(USDC.decimals).toBe(6);
      expect(USDC.addresses[1]).toBeDefined(); // Mainnet
    });

    it('USDT has correct properties', () => {
      expect(USDT.symbol).toBe('USDT');
      expect(USDT.decimals).toBe(6);
      expect(USDT.addresses[1]).toBeDefined();
    });

    it('USDS (Sky) has correct properties', () => {
      expect(USDS.symbol).toBe('USDS');
      expect(USDS.name).toBe('Sky USD');
      expect(USDS.decimals).toBe(18);
      expect(USDS.addresses[1]).toBeDefined();
    });

    it('DAI has correct properties', () => {
      expect(DAI.symbol).toBe('DAI');
      expect(DAI.decimals).toBe(18);
    });

    it('PYUSD has correct properties', () => {
      expect(PYUSD.symbol).toBe('PYUSD');
      expect(PYUSD.name).toBe('PayPal USD');
      expect(PYUSD.decimals).toBe(6);
    });

    it('FRAX has correct properties', () => {
      expect(FRAX.symbol).toBe('FRAX');
      expect(FRAX.decimals).toBe(18);
    });

    it('STABLECOINS contains all tokens', () => {
      expect(Object.keys(STABLECOINS)).toContain('USDC');
      expect(Object.keys(STABLECOINS)).toContain('USDT');
      expect(Object.keys(STABLECOINS)).toContain('USDS');
      expect(Object.keys(STABLECOINS)).toContain('DAI');
      expect(Object.keys(STABLECOINS)).toContain('PYUSD');
      expect(Object.keys(STABLECOINS)).toContain('FRAX');
    });
  });

  describe('getStablecoinAddress', () => {
    it('returns address for supported chain', () => {
      const address = getStablecoinAddress(USDC, 1);
      expect(address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('returns undefined for unsupported chain', () => {
      const address = getStablecoinAddress(USDC, 999999);
      expect(address).toBeUndefined();
    });

    it('returns correct addresses for different chains', () => {
      // Arbitrum
      expect(getStablecoinAddress(USDC, 42161)).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
      // Base
      expect(getStablecoinAddress(USDC, 8453)).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
      // Optimism
      expect(getStablecoinAddress(USDC, 10)).toBe('0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85');
    });
  });

  describe('getStablecoinsForChain', () => {
    it('returns all stablecoins for mainnet', () => {
      const stablecoins = getStablecoinsForChain(1);
      expect(stablecoins.has('USDC')).toBe(true);
      expect(stablecoins.has('USDT')).toBe(true);
      expect(stablecoins.has('USDS')).toBe(true);
      expect(stablecoins.has('DAI')).toBe(true);
      expect(stablecoins.has('FRAX')).toBe(true);
    });

    it('returns empty map for unsupported chain', () => {
      const stablecoins = getStablecoinsForChain(999999);
      expect(stablecoins.size).toBe(0);
    });

    it('returns subset for chains with limited support', () => {
      // Sepolia only has USDC
      const stablecoins = getStablecoinsForChain(11155111);
      expect(stablecoins.has('USDC')).toBe(true);
      expect(stablecoins.has('USDT')).toBe(false);
    });
  });

  describe('Taiko network support', () => {
    it('returns USDC address for Taiko mainnet', () => {
      const address = getStablecoinAddress(USDC, 167000);
      expect(address).toBe('0x07d83526730c7438048d55a4fc0b850e2aab6f0b');
    });

    it('returns USDT address for Taiko mainnet', () => {
      const address = getStablecoinAddress(USDT, 167000);
      expect(address).toBe('0x2DEF195713CF4a606B49D07E520e22C17899a736');
    });

    it('returns stablecoins available on Taiko', () => {
      const stablecoins = getStablecoinsForChain(167000);
      expect(stablecoins.has('USDC')).toBe(true);
      expect(stablecoins.has('USDT')).toBe(true);
      expect(stablecoins.has('DAI')).toBe(false);
    });
  });

  describe('Scroll network support', () => {
    it('returns USDC address for Scroll mainnet', () => {
      const address = getStablecoinAddress(USDC, 534352);
      expect(address).toBe('0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4');
    });

    it('returns USDT address for Scroll mainnet', () => {
      const address = getStablecoinAddress(USDT, 534352);
      expect(address).toBe('0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df');
    });

    it('returns stablecoins available on Scroll', () => {
      const stablecoins = getStablecoinsForChain(534352);
      expect(stablecoins.has('USDC')).toBe(true);
      expect(stablecoins.has('USDT')).toBe(true);
      expect(stablecoins.has('DAI')).toBe(false);
    });
  });

  describe('Linea network support', () => {
    it('returns USDC address for Linea mainnet', () => {
      const address = getStablecoinAddress(USDC, 59144);
      expect(address).toBe('0x176211869cA2b568f2A7D4EE941E073a821EE1ff');
    });

    it('returns USDT address for Linea mainnet', () => {
      const address = getStablecoinAddress(USDT, 59144);
      expect(address).toBe('0xA219439258ca9da29E9Cc4cE5596924745e12B93');
    });

    it('returns stablecoins available on Linea', () => {
      const stablecoins = getStablecoinsForChain(59144);
      expect(stablecoins.has('USDC')).toBe(true);
      expect(stablecoins.has('USDT')).toBe(true);
      expect(stablecoins.has('DAI')).toBe(false);
    });
  });

  describe('isKnownStablecoin', () => {
    it('identifies USDC on mainnet', () => {
      const info = isKnownStablecoin('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 1);
      expect(info).toBeDefined();
      expect(info?.symbol).toBe('USDC');
    });

    it('identifies USDT on mainnet', () => {
      const info = isKnownStablecoin('0xdAC17F958D2ee523a2206206994597C13D831ec7', 1);
      expect(info).toBeDefined();
      expect(info?.symbol).toBe('USDT');
    });

    it('is case-insensitive', () => {
      const info = isKnownStablecoin('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 1);
      expect(info).toBeDefined();
      expect(info?.symbol).toBe('USDC');
    });

    it('returns undefined for unknown address', () => {
      const info = isKnownStablecoin('0x0000000000000000000000000000000000000000', 1);
      expect(info).toBeUndefined();
    });

    it('returns undefined for wrong chain', () => {
      // USDC mainnet address on a chain where it's not deployed
      const info = isKnownStablecoin('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 999999);
      expect(info).toBeUndefined();
    });
  });

  describe('parseStablecoinAmount', () => {
    describe('USDC (6 decimals)', () => {
      it('parses whole numbers', () => {
        expect(parseStablecoinAmount('100', USDC)).toBe(100_000_000n);
        expect(parseStablecoinAmount('1', USDC)).toBe(1_000_000n);
        expect(parseStablecoinAmount('0', USDC)).toBe(0n);
      });

      it('parses decimal amounts', () => {
        expect(parseStablecoinAmount('100.50', USDC)).toBe(100_500_000n);
        expect(parseStablecoinAmount('0.01', USDC)).toBe(10_000n);
        expect(parseStablecoinAmount('0.000001', USDC)).toBe(1n);
      });

      it('parses numbers', () => {
        expect(parseStablecoinAmount(100, USDC)).toBe(100_000_000n);
        expect(parseStablecoinAmount(0.5, USDC)).toBe(500_000n);
      });

      it('truncates excess decimals', () => {
        expect(parseStablecoinAmount('1.1234567890', USDC)).toBe(1_123_456n);
      });
    });

    describe('USDS (18 decimals)', () => {
      it('parses whole numbers', () => {
        expect(parseStablecoinAmount('100', USDS)).toBe(100_000_000_000_000_000_000n);
        expect(parseStablecoinAmount('1', USDS)).toBe(1_000_000_000_000_000_000n);
      });

      it('parses decimal amounts', () => {
        expect(parseStablecoinAmount('1.5', USDS)).toBe(1_500_000_000_000_000_000n);
        expect(parseStablecoinAmount('0.1', USDS)).toBe(100_000_000_000_000_000n);
      });
    });
  });

  describe('formatStablecoinAmount', () => {
    describe('USDC (6 decimals)', () => {
      it('formats whole amounts', () => {
        expect(formatStablecoinAmount(100_000_000n, USDC)).toBe('100');
        expect(formatStablecoinAmount(1_000_000n, USDC)).toBe('1');
      });

      it('formats decimal amounts', () => {
        expect(formatStablecoinAmount(100_500_000n, USDC)).toBe('100.5');
        expect(formatStablecoinAmount(10_000n, USDC)).toBe('0.01');
        expect(formatStablecoinAmount(1n, USDC)).toBe('0.000001');
      });

      it('formats zero', () => {
        expect(formatStablecoinAmount(0n, USDC)).toBe('0');
      });
    });

    describe('USDS (18 decimals)', () => {
      it('formats whole amounts', () => {
        expect(formatStablecoinAmount(100_000_000_000_000_000_000n, USDS)).toBe('100');
        expect(formatStablecoinAmount(1_000_000_000_000_000_000n, USDS)).toBe('1');
      });

      it('formats decimal amounts', () => {
        expect(formatStablecoinAmount(1_500_000_000_000_000_000n, USDS)).toBe('1.5');
      });
    });
  });

  describe('roundtrip parsing and formatting', () => {
    it('maintains precision for USDC', () => {
      const amounts = ['100', '0.01', '1234.56', '0.000001'];
      for (const amount of amounts) {
        const parsed = parseStablecoinAmount(amount, USDC);
        const formatted = formatStablecoinAmount(parsed, USDC);
        expect(formatted).toBe(amount);
      }
    });

    it('maintains precision for USDS', () => {
      const amounts = ['100', '1.5', '0.1'];
      for (const amount of amounts) {
        const parsed = parseStablecoinAmount(amount, USDS);
        const formatted = formatStablecoinAmount(parsed, USDS);
        expect(formatted).toBe(amount);
      }
    });
  });
});

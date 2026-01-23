import { describe, it, expect } from 'vitest';
import {
  TOKENS,
  ETH_TOKEN,
  WETH,
  UNI,
  LINK,
  WBTC,
  AAVE,
  getTokenBySymbol,
  getTokenAddress,
  getTokensForChain,
  isKnownToken,
  resolveToken,
  parseTokenAmount,
  formatTokenAmount,
  isNativeETH,
  getWETHAddress,
} from '../../src/tokens/tokens.js';

describe('Token Registry', () => {
  describe('Token Constants', () => {
    it('defines ETH_TOKEN as native', () => {
      expect(ETH_TOKEN.symbol).toBe('ETH');
      expect(ETH_TOKEN.decimals).toBe(18);
      expect(ETH_TOKEN.isNative).toBe(true);
    });

    it('defines WETH with correct addresses', () => {
      expect(WETH.symbol).toBe('WETH');
      expect(WETH.decimals).toBe(18);
      expect(WETH.addresses[1]).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(WETH.addresses[8453]).toBe('0x4200000000000000000000000000000000000006');
    });

    it('defines UNI token', () => {
      expect(UNI.symbol).toBe('UNI');
      expect(UNI.decimals).toBe(18);
      expect(UNI.addresses[1]).toBe('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984');
    });

    it('defines LINK token', () => {
      expect(LINK.symbol).toBe('LINK');
      expect(LINK.decimals).toBe(18);
      expect(LINK.addresses[1]).toBe('0x514910771AF9Ca656af840dff83E8264EcF986CA');
    });

    it('defines WBTC with 8 decimals', () => {
      expect(WBTC.symbol).toBe('WBTC');
      expect(WBTC.decimals).toBe(8);
      expect(WBTC.addresses[1]).toBe('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599');
    });

    it('defines AAVE token', () => {
      expect(AAVE.symbol).toBe('AAVE');
      expect(AAVE.addresses[1]).toBe('0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9');
    });

    it('TOKENS contains all expected tokens', () => {
      expect(Object.keys(TOKENS)).toContain('ETH');
      expect(Object.keys(TOKENS)).toContain('WETH');
      expect(Object.keys(TOKENS)).toContain('UNI');
      expect(Object.keys(TOKENS)).toContain('LINK');
      expect(Object.keys(TOKENS)).toContain('WBTC');
      expect(Object.keys(TOKENS)).toContain('AAVE');
      expect(Object.keys(TOKENS)).toContain('CRV');
      expect(Object.keys(TOKENS)).toContain('MKR');
      expect(Object.keys(TOKENS)).toContain('SNX');
      expect(Object.keys(TOKENS)).toContain('LDO');
    });
  });

  describe('getTokenBySymbol', () => {
    it('returns token for valid symbol', () => {
      const token = getTokenBySymbol('WETH');
      expect(token).toBeDefined();
      expect(token?.symbol).toBe('WETH');
    });

    it('is case-insensitive', () => {
      expect(getTokenBySymbol('weth')).toBeDefined();
      expect(getTokenBySymbol('Weth')).toBeDefined();
      expect(getTokenBySymbol('WETH')).toBeDefined();
    });

    it('returns undefined for unknown symbol', () => {
      expect(getTokenBySymbol('INVALID')).toBeUndefined();
      expect(getTokenBySymbol('')).toBeUndefined();
    });

    it('returns ETH token', () => {
      const token = getTokenBySymbol('ETH');
      expect(token).toBeDefined();
      expect(token?.isNative).toBe(true);
    });
  });

  describe('getTokenAddress', () => {
    it('returns address for valid chain', () => {
      expect(getTokenAddress(WETH, 1)).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(getTokenAddress(WETH, 8453)).toBe('0x4200000000000000000000000000000000000006');
    });

    it('returns undefined for unsupported chain', () => {
      expect(getTokenAddress(WETH, 999999)).toBeUndefined();
    });
  });

  describe('getTokensForChain', () => {
    it('returns map of tokens for mainnet', () => {
      const tokens = getTokensForChain(1);
      expect(tokens.get('ETH')).toBeDefined();
      expect(tokens.get('WETH')).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(tokens.get('UNI')).toBe('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984');
    });

    it('returns empty map for unsupported chain', () => {
      const tokens = getTokensForChain(999999);
      expect(tokens.size).toBe(0);
    });

    it('returns subset of tokens for chains with limited support', () => {
      // MKR only exists on mainnet
      const mainnetTokens = getTokensForChain(1);
      const baseTokens = getTokensForChain(8453);

      expect(mainnetTokens.get('MKR')).toBeDefined();
      expect(baseTokens.get('MKR')).toBeUndefined();
    });
  });

  describe('isKnownToken', () => {
    it('returns true for known tokens', () => {
      expect(isKnownToken('WETH')).toBe(true);
      expect(isKnownToken('UNI')).toBe(true);
      expect(isKnownToken('LINK')).toBe(true);
      expect(isKnownToken('ETH')).toBe(true);
    });

    it('returns true case-insensitively', () => {
      expect(isKnownToken('weth')).toBe(true);
      expect(isKnownToken('Uni')).toBe(true);
    });

    it('returns false for unknown tokens', () => {
      expect(isKnownToken('INVALID')).toBe(false);
      expect(isKnownToken('')).toBe(false);
    });

    it('returns false for stablecoins (only checks token registry)', () => {
      // isKnownToken only checks TOKENS, not stablecoins
      expect(isKnownToken('USDC')).toBe(false);
    });
  });

  describe('resolveToken', () => {
    it('resolves known tokens by symbol', () => {
      const result = resolveToken('WETH', 1);
      expect(result).toBeDefined();
      expect(result?.token.symbol).toBe('WETH');
      expect(result?.address).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    });

    it('resolves stablecoins by symbol', () => {
      const result = resolveToken('USDC', 1);
      expect(result).toBeDefined();
      expect(result?.token.symbol).toBe('USDC');
      expect(result?.address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('is case-insensitive', () => {
      const lower = resolveToken('weth', 1);
      const upper = resolveToken('WETH', 1);
      expect(lower?.address).toBe(upper?.address);
    });

    it('returns undefined for token not on chain', () => {
      // MKR only exists on mainnet
      expect(resolveToken('MKR', 8453)).toBeUndefined();
    });

    it('resolves contract addresses directly', () => {
      const address = '0x1234567890123456789012345678901234567890';
      const result = resolveToken(address, 1);
      expect(result).toBeDefined();
      expect(result?.token.symbol).toBe('UNKNOWN');
      expect(result?.address).toBe(address);
      expect(result?.token.decimals).toBe(18);
    });

    it('returns undefined for unknown symbols', () => {
      expect(resolveToken('INVALID_TOKEN', 1)).toBeUndefined();
    });

    it('returns undefined for invalid address format', () => {
      expect(resolveToken('0x123', 1)).toBeUndefined();
      expect(resolveToken('not-an-address', 1)).toBeUndefined();
    });
  });

  describe('parseTokenAmount', () => {
    it('parses whole numbers', () => {
      expect(parseTokenAmount('1', WETH)).toBe(1000000000000000000n);
      expect(parseTokenAmount('10', WETH)).toBe(10000000000000000000n);
    });

    it('parses decimal amounts', () => {
      expect(parseTokenAmount('1.5', WETH)).toBe(1500000000000000000n);
      expect(parseTokenAmount('0.001', WETH)).toBe(1000000000000000n);
    });

    it('handles different decimal places', () => {
      // WBTC has 8 decimals
      expect(parseTokenAmount('1', WBTC)).toBe(100000000n);
      expect(parseTokenAmount('0.5', WBTC)).toBe(50000000n);
    });

    it('accepts numbers', () => {
      expect(parseTokenAmount(1, WETH)).toBe(1000000000000000000n);
      expect(parseTokenAmount(1.5, WETH)).toBe(1500000000000000000n);
    });

    it('truncates excess decimal places', () => {
      // WBTC has 8 decimals, extra precision is truncated
      expect(parseTokenAmount('1.123456789', WBTC)).toBe(112345678n);
    });
  });

  describe('formatTokenAmount', () => {
    it('formats whole amounts', () => {
      expect(formatTokenAmount(1000000000000000000n, WETH)).toBe('1');
      expect(formatTokenAmount(10000000000000000000n, WETH)).toBe('10');
    });

    it('formats decimal amounts', () => {
      expect(formatTokenAmount(1500000000000000000n, WETH)).toBe('1.5');
      expect(formatTokenAmount(1000000000000000n, WETH)).toBe('0.001');
    });

    it('handles different decimal places', () => {
      expect(formatTokenAmount(100000000n, WBTC)).toBe('1');
      expect(formatTokenAmount(50000000n, WBTC)).toBe('0.5');
    });

    it('trims trailing zeros', () => {
      expect(formatTokenAmount(1000000000000000000n, WETH)).toBe('1');
      expect(formatTokenAmount(1100000000000000000n, WETH)).toBe('1.1');
    });

    it('formats zero correctly', () => {
      expect(formatTokenAmount(0n, WETH)).toBe('0');
    });

    it('formats small amounts correctly', () => {
      expect(formatTokenAmount(1n, WETH)).toBe('0.000000000000000001');
    });
  });

  describe('isNativeETH', () => {
    it('returns true for ETH_TOKEN', () => {
      expect(isNativeETH(ETH_TOKEN)).toBe(true);
    });

    it('returns false for WETH', () => {
      expect(isNativeETH(WETH)).toBe(false);
    });

    it('returns false for other tokens', () => {
      expect(isNativeETH(UNI)).toBe(false);
      expect(isNativeETH(LINK)).toBe(false);
    });

    it('returns true for any token with ETH symbol', () => {
      const customETH = { symbol: 'ETH', name: 'Test', decimals: 18, addresses: {} };
      expect(isNativeETH(customETH)).toBe(true);
    });
  });

  describe('getWETHAddress', () => {
    it('returns WETH address for mainnet', () => {
      expect(getWETHAddress(1)).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    });

    it('returns WETH address for Base', () => {
      expect(getWETHAddress(8453)).toBe('0x4200000000000000000000000000000000000006');
    });

    it('returns WETH address for Arbitrum', () => {
      expect(getWETHAddress(42161)).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');
    });

    it('returns undefined for unsupported chain', () => {
      expect(getWETHAddress(999999)).toBeUndefined();
    });
  });
});

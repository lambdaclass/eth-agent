/**
 * Across constants tests
 */

import { describe, it, expect } from 'vitest';
import {
  ACROSS_CONTRACTS,
  ACROSS_API,
  getAcrossConfig,
  getSupportedAcrossChains,
  isAcrossTestnet,
  getAcrossTokenAddress,
  isTokenSupportedOnChain,
  getAcrossChainName,
} from '../../../src/bridge/across/constants.js';

describe('Across Constants', () => {
  describe('ACROSS_CONTRACTS', () => {
    it('should have configs for mainnet chains', () => {
      expect(ACROSS_CONTRACTS[1]).toBeDefined(); // Ethereum
      expect(ACROSS_CONTRACTS[10]).toBeDefined(); // Optimism
      expect(ACROSS_CONTRACTS[42161]).toBeDefined(); // Arbitrum
      expect(ACROSS_CONTRACTS[8453]).toBeDefined(); // Base
      expect(ACROSS_CONTRACTS[137]).toBeDefined(); // Polygon
      expect(ACROSS_CONTRACTS[324]).toBeDefined(); // zkSync Era
      expect(ACROSS_CONTRACTS[59144]).toBeDefined(); // Linea
    });

    it('should have configs for testnet chains', () => {
      expect(ACROSS_CONTRACTS[11155111]).toBeDefined(); // Sepolia
      expect(ACROSS_CONTRACTS[421614]).toBeDefined(); // Arbitrum Sepolia
      expect(ACROSS_CONTRACTS[84532]).toBeDefined(); // Base Sepolia
    });

    it('should have spokePool addresses for each chain', () => {
      for (const chainId of Object.keys(ACROSS_CONTRACTS)) {
        const config = ACROSS_CONTRACTS[Number(chainId)];
        expect(config.spokePool).toBeDefined();
        expect(config.spokePool).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    });

    it('should have supported tokens for each chain', () => {
      for (const chainId of Object.keys(ACROSS_CONTRACTS)) {
        const config = ACROSS_CONTRACTS[Number(chainId)];
        expect(config.supportedTokens).toBeDefined();
        expect(Object.keys(config.supportedTokens).length).toBeGreaterThan(0);
      }
    });
  });

  describe('ACROSS_API', () => {
    it('should have mainnet API URL', () => {
      expect(ACROSS_API.mainnet).toBe('https://app.across.to/api');
    });

    it('should have testnet API URL', () => {
      expect(ACROSS_API.testnet).toBe('https://testnet.across.to/api');
    });
  });

  describe('getAcrossConfig', () => {
    it('should return config for supported chain', () => {
      const config = getAcrossConfig(1);
      expect(config).toBeDefined();
      expect(config?.spokePool).toBeDefined();
    });

    it('should return undefined for unsupported chain', () => {
      const config = getAcrossConfig(999999);
      expect(config).toBeUndefined();
    });
  });

  describe('getSupportedAcrossChains', () => {
    it('should return array of chain IDs', () => {
      const chains = getSupportedAcrossChains();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains.length).toBeGreaterThan(0);
    });

    it('should include mainnet chains', () => {
      const chains = getSupportedAcrossChains();
      expect(chains).toContain(1);
      expect(chains).toContain(10);
      expect(chains).toContain(42161);
    });

    it('should include testnet chains', () => {
      const chains = getSupportedAcrossChains();
      expect(chains).toContain(11155111);
      expect(chains).toContain(421614);
      expect(chains).toContain(84532);
    });
  });

  describe('isAcrossTestnet', () => {
    it('should return true for Sepolia', () => {
      expect(isAcrossTestnet(11155111)).toBe(true);
    });

    it('should return true for Arbitrum Sepolia', () => {
      expect(isAcrossTestnet(421614)).toBe(true);
    });

    it('should return true for Base Sepolia', () => {
      expect(isAcrossTestnet(84532)).toBe(true);
    });

    it('should return false for mainnet chains', () => {
      expect(isAcrossTestnet(1)).toBe(false);
      expect(isAcrossTestnet(10)).toBe(false);
      expect(isAcrossTestnet(42161)).toBe(false);
      expect(isAcrossTestnet(8453)).toBe(false);
      expect(isAcrossTestnet(137)).toBe(false);
    });

    it('should return false for unsupported chains', () => {
      expect(isAcrossTestnet(999999)).toBe(false);
    });
  });

  describe('getAcrossTokenAddress', () => {
    it('should return USDC address on Ethereum', () => {
      const address = getAcrossTokenAddress(1, 'USDC');
      expect(address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('should return WETH address on Ethereum', () => {
      const address = getAcrossTokenAddress(1, 'WETH');
      expect(address).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    });

    it('should return USDC.e address on Optimism', () => {
      const address = getAcrossTokenAddress(10, 'USDC.e');
      expect(address).toBeDefined();
    });

    it('should return undefined for unsupported token', () => {
      const address = getAcrossTokenAddress(1, 'INVALID');
      expect(address).toBeUndefined();
    });

    it('should return undefined for unsupported chain', () => {
      const address = getAcrossTokenAddress(999999, 'USDC');
      expect(address).toBeUndefined();
    });
  });

  describe('isTokenSupportedOnChain', () => {
    it('should return true for supported token', () => {
      expect(isTokenSupportedOnChain(1, 'USDC')).toBe(true);
      expect(isTokenSupportedOnChain(1, 'WETH')).toBe(true);
      expect(isTokenSupportedOnChain(1, 'WBTC')).toBe(true);
    });

    it('should return false for unsupported token', () => {
      expect(isTokenSupportedOnChain(1, 'INVALID')).toBe(false);
    });

    it('should return false for unsupported chain', () => {
      expect(isTokenSupportedOnChain(999999, 'USDC')).toBe(false);
    });

    it('should handle chain-specific tokens', () => {
      // Base has USDbC (bridged USDC)
      expect(isTokenSupportedOnChain(8453, 'USDbC')).toBe(true);
    });
  });

  describe('getAcrossChainName', () => {
    it('should return name for mainnet chains', () => {
      expect(getAcrossChainName(1)).toBe('Ethereum');
      expect(getAcrossChainName(10)).toBe('Optimism');
      expect(getAcrossChainName(42161)).toBe('Arbitrum');
      expect(getAcrossChainName(8453)).toBe('Base');
      expect(getAcrossChainName(137)).toBe('Polygon');
      expect(getAcrossChainName(324)).toBe('zkSync Era');
      expect(getAcrossChainName(59144)).toBe('Linea');
    });

    it('should return name for testnet chains', () => {
      expect(getAcrossChainName(11155111)).toBe('Sepolia');
      expect(getAcrossChainName(421614)).toBe('Arb Sepolia');
      expect(getAcrossChainName(84532)).toBe('Base Sepolia');
    });

    it('should return fallback for unknown chains', () => {
      expect(getAcrossChainName(999999)).toBe('Chain 999999');
    });
  });
});

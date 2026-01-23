import { describe, it, expect } from 'vitest';
import {
  CCTP_CONTRACTS,
  getCCTPConfig,
  getSupportedCCTPChains,
  isTestnet,
  getChainName,
  CIRCLE_ATTESTATION_API,
} from '../../src/bridge/constants.js';

describe('CCTP Constants', () => {
  describe('CCTP_CONTRACTS', () => {
    it('should have config for Ethereum mainnet', () => {
      const config = CCTP_CONTRACTS[1];
      expect(config).toBeDefined();
      expect(config.domain).toBe(0);
      expect(config.tokenMessenger).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.messageTransmitter).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.usdc).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have config for Arbitrum', () => {
      const config = CCTP_CONTRACTS[42161];
      expect(config).toBeDefined();
      expect(config.domain).toBe(3);
    });

    it('should have config for Base', () => {
      const config = CCTP_CONTRACTS[8453];
      expect(config).toBeDefined();
      expect(config.domain).toBe(6);
    });

    it('should have config for Optimism', () => {
      const config = CCTP_CONTRACTS[10];
      expect(config).toBeDefined();
      expect(config.domain).toBe(2);
    });

    it('should have config for Polygon', () => {
      const config = CCTP_CONTRACTS[137];
      expect(config).toBeDefined();
      expect(config.domain).toBe(7);
    });

    it('should have config for Avalanche', () => {
      const config = CCTP_CONTRACTS[43114];
      expect(config).toBeDefined();
      expect(config.domain).toBe(1);
    });

    it('should have config for Sepolia testnet', () => {
      const config = CCTP_CONTRACTS[11155111];
      expect(config).toBeDefined();
      expect(config.domain).toBe(0);
    });
  });

  describe('getCCTPConfig', () => {
    it('should return config for supported chain', () => {
      const config = getCCTPConfig(1);
      expect(config).toBeDefined();
      expect(config!.domain).toBe(0);
    });

    it('should return undefined for unsupported chain', () => {
      const config = getCCTPConfig(999999);
      expect(config).toBeUndefined();
    });
  });

  describe('getSupportedCCTPChains', () => {
    it('should return all supported chain IDs', () => {
      const chains = getSupportedCCTPChains();
      expect(chains).toContain(1); // Ethereum
      expect(chains).toContain(42161); // Arbitrum
      expect(chains).toContain(8453); // Base
      expect(chains).toContain(10); // Optimism
      expect(chains).toContain(137); // Polygon
      expect(chains).toContain(11155111); // Sepolia
    });

    it('should return at least 6 mainnet chains', () => {
      const chains = getSupportedCCTPChains();
      const mainnets = chains.filter((id) => !isTestnet(id));
      expect(mainnets.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('isTestnet', () => {
    it('should return true for testnets', () => {
      expect(isTestnet(11155111)).toBe(true); // Sepolia
      expect(isTestnet(43113)).toBe(true); // Fuji
      expect(isTestnet(84532)).toBe(true); // Base Sepolia
    });

    it('should return false for mainnets', () => {
      expect(isTestnet(1)).toBe(false);
      expect(isTestnet(42161)).toBe(false);
      expect(isTestnet(8453)).toBe(false);
    });
  });

  describe('getChainName', () => {
    it('should return correct names for known chains', () => {
      expect(getChainName(1)).toBe('Ethereum');
      expect(getChainName(42161)).toBe('Arbitrum');
      expect(getChainName(8453)).toBe('Base');
      expect(getChainName(10)).toBe('Optimism');
      expect(getChainName(137)).toBe('Polygon');
    });

    it('should return generic name for unknown chains', () => {
      expect(getChainName(999999)).toBe('Chain 999999');
    });
  });

  describe('CIRCLE_ATTESTATION_API', () => {
    it('should have mainnet endpoint', () => {
      expect(CIRCLE_ATTESTATION_API.mainnet).toContain('iris-api.circle.com');
    });

    it('should have testnet endpoint', () => {
      expect(CIRCLE_ATTESTATION_API.testnet).toContain('sandbox');
    });
  });
});

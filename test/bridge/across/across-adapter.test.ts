/**
 * Across Adapter tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcrossAdapter, createAcrossAdapter } from '../../../src/bridge/protocols/across-adapter.js';
import { USDC, USDT } from '../../../src/stablecoins/index.js';

const mockRpc = {
  getChainId: vi.fn().mockResolvedValue(1),
  getGasPrice: vi.fn().mockResolvedValue(30000000000n),
  call: vi.fn().mockResolvedValue('0x0'),
  getTransactionCount: vi.fn().mockResolvedValue(0),
  waitForTransaction: vi.fn().mockResolvedValue({
    transactionHash: '0x1234' as `0x${string}`,
    blockNumber: 1,
    gasUsed: 21000n,
    status: 'success' as const,
    logs: [],
  }),
  sendRawTransaction: vi.fn().mockResolvedValue('0x1234' as `0x${string}`),
};

const mockAccount = {
  address: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  sign: vi.fn().mockReturnValue({
    r: '0x1234' as `0x${string}`,
    s: '0x5678' as `0x${string}`,
    v: 27n,
  }),
  signTypedData: vi.fn(),
};

// Default config with required ethPriceUSD
const createConfig = (overrides = {}) => ({
  sourceRpc: mockRpc as any,
  account: mockAccount as any,
  ethPriceUSD: 2500,
  ...overrides,
});

describe('AcrossAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with config', () => {
      const adapter = new AcrossAdapter(createConfig());

      expect(adapter).toBeInstanceOf(AcrossAdapter);
      expect(adapter.info.name).toBe('Across');
    });

    it('should accept custom ethPriceUSD', () => {
      const adapter = new AcrossAdapter(createConfig({ ethPriceUSD: 3000 }));
      expect(adapter).toBeInstanceOf(AcrossAdapter);
    });

    it('should accept optional btcPriceUSD', () => {
      const adapter = new AcrossAdapter(createConfig({ btcPriceUSD: 50000 }));
      expect(adapter).toBeInstanceOf(AcrossAdapter);
    });

    it('should accept custom slippage tolerance', () => {
      const adapter = new AcrossAdapter(createConfig({ defaultSlippageBps: 100 }));
      expect(adapter).toBeInstanceOf(AcrossAdapter);
    });
  });

  describe('createAcrossAdapter', () => {
    it('should create adapter using factory function', () => {
      const adapter = createAcrossAdapter(createConfig());

      expect(adapter).toBeInstanceOf(AcrossAdapter);
    });
  });

  describe('info', () => {
    it('should have correct protocol info', () => {
      const adapter = new AcrossAdapter(createConfig());

      expect(adapter.info.name).toBe('Across');
      expect(adapter.info.displayName).toBe('Across Protocol');
      expect(adapter.info.supportedTokens).toContain('USDC');
      expect(adapter.info.supportedTokens).toContain('USDT');
      expect(adapter.info.supportedTokens).toContain('WETH');
      expect(adapter.info.supportedTokens).toContain('DAI');
      expect(adapter.info.supportedTokens).toContain('WBTC');
      expect(adapter.info.finalityModel).toBe('optimistic');
      expect(adapter.info.typicalSpeed).toBe('fast');
      expect(adapter.info.hasProtocolFees).toBe(true);
      expect(adapter.info.estimatedTimeSeconds).toEqual({ min: 60, max: 300 });
    });
  });

  describe('getSupportedChains', () => {
    it('should return list of supported mainnet chains', () => {
      const adapter = new AcrossAdapter(createConfig());

      const chains = adapter.getSupportedChains();

      expect(chains).toContain(1); // Ethereum
      expect(chains).toContain(10); // Optimism
      expect(chains).toContain(42161); // Arbitrum
      expect(chains).toContain(8453); // Base
      expect(chains).toContain(137); // Polygon
      expect(chains).toContain(324); // zkSync Era
      expect(chains).toContain(59144); // Linea
    });

    it('should return list of supported testnet chains', () => {
      const adapter = new AcrossAdapter(createConfig());

      const chains = adapter.getSupportedChains();

      expect(chains).toContain(11155111); // Sepolia
      expect(chains).toContain(421614); // Arbitrum Sepolia
      expect(chains).toContain(84532); // Base Sepolia
    });
  });

  describe('isRouteSupported', () => {
    it('should return true for supported USDC route', () => {
      const adapter = new AcrossAdapter(createConfig());

      // Ethereum to Arbitrum USDC
      expect(adapter.isRouteSupported(1, 42161, 'USDC')).toBe(true);
    });

    it('should return true for supported WETH route', () => {
      const adapter = new AcrossAdapter(createConfig());

      // Ethereum to Optimism WETH
      expect(adapter.isRouteSupported(1, 10, 'WETH')).toBe(true);
    });

    it('should return true for supported WBTC route', () => {
      const adapter = new AcrossAdapter(createConfig());

      // Ethereum to Polygon WBTC
      expect(adapter.isRouteSupported(1, 137, 'WBTC')).toBe(true);
    });

    it('should return true for supported DAI route', () => {
      const adapter = new AcrossAdapter(createConfig());

      // Ethereum to Arbitrum DAI
      expect(adapter.isRouteSupported(1, 42161, 'DAI')).toBe(true);
    });

    it('should return false for same chain', () => {
      const adapter = new AcrossAdapter(createConfig());

      expect(adapter.isRouteSupported(1, 1, 'USDC')).toBe(false);
    });

    it('should return false for unsupported destination chain', () => {
      const adapter = new AcrossAdapter(createConfig());

      expect(adapter.isRouteSupported(1, 999999, 'USDC')).toBe(false);
    });

    it('should return false for unsupported source chain', () => {
      const adapter = new AcrossAdapter(createConfig());

      expect(adapter.isRouteSupported(999999, 42161, 'USDC')).toBe(false);
    });

    it('should handle token variants like USDC.e', () => {
      const adapter = new AcrossAdapter(createConfig());

      // Optimism has USDC.e
      expect(adapter.isRouteSupported(10, 42161, 'USDC')).toBe(true);
    });
  });

  describe('getEstimatedTime', () => {
    it('should return estimated time string', () => {
      const adapter = new AcrossAdapter(createConfig());

      const time = adapter.getEstimatedTime();
      expect(time).toBe('2-5 minutes');
    });
  });

  describe('getReliabilityScore', () => {
    it('should return high reliability score', () => {
      const adapter = new AcrossAdapter(createConfig());

      const score = adapter.getReliabilityScore();
      expect(score).toBe(90);
    });
  });

  describe('isAvailable', () => {
    it('should return true when on supported chain', async () => {
      const adapter = new AcrossAdapter(createConfig());

      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when on unsupported chain', async () => {
      const unsupportedRpc = {
        ...mockRpc,
        getChainId: vi.fn().mockResolvedValue(999999),
      };

      const adapter = new AcrossAdapter(createConfig({ sourceRpc: unsupportedRpc }));

      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false when RPC call fails', async () => {
      const failingRpc = {
        ...mockRpc,
        getChainId: vi.fn().mockRejectedValue(new Error('RPC error')),
      };

      const adapter = new AcrossAdapter(createConfig({ sourceRpc: failingRpc }));

      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('getUnderlyingBridge', () => {
    it('should return the underlying AcrossBridge instance', () => {
      const adapter = new AcrossAdapter(createConfig());

      const bridge = adapter.getUnderlyingBridge();
      expect(bridge).toBeDefined();
      expect(typeof bridge.getQuote).toBe('function');
      expect(typeof bridge.initiateBridge).toBe('function');
      expect(typeof bridge.getStatus).toBe('function');
      expect(typeof bridge.waitForAttestation).toBe('function');
      expect(typeof bridge.previewBridge).toBe('function');
    });
  });

  describe('name and supportedTokens getters', () => {
    it('should return name from info', () => {
      const adapter = new AcrossAdapter(createConfig());
      expect(adapter.name).toBe('Across');
    });

    it('should return supportedTokens from info', () => {
      const adapter = new AcrossAdapter(createConfig());
      expect(adapter.supportedTokens).toEqual(['USDC', 'USDT', 'WETH', 'DAI', 'WBTC']);
    });
  });
});

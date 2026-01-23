import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BridgeRouter, createBridgeRouter } from '../../../src/bridge/router/index.js';
import { USDC } from '../../../src/stablecoins/tokens.js';
import { BridgeNoRouteError, BridgeProtocolUnavailableError } from '../../../src/bridge/errors.js';
import type { Address, Hash, Hex } from '../../../src/core/types.js';

// Mock RPC Client
const createMockRpc = (chainId = 1) => ({
  getChainId: vi.fn().mockResolvedValue(chainId),
  getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
  call: vi.fn().mockResolvedValue('0x'),
  sendRawTransaction: vi.fn().mockResolvedValue('0xhash' as Hash),
  waitForTransaction: vi.fn().mockResolvedValue({
    status: 'success',
    transactionHash: '0xhash' as Hash,
    gasUsed: 100000n,
    logs: [],
    blockNumber: 12345,
  }),
  getTransactionCount: vi.fn().mockResolvedValue(0),
  getLogs: vi.fn().mockResolvedValue([]),
  estimateGas: vi.fn().mockResolvedValue(100000n),
  getGasPrice: vi.fn().mockResolvedValue(1000000000n),
  getMaxPriorityFeePerGas: vi.fn().mockResolvedValue(1000000000n),
  getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1000000000n }),
  getFeeHistory: vi.fn().mockResolvedValue({
    baseFeePerGas: [1000000000n, 1100000000n],
    gasUsedRatio: [0.5],
    reward: [[1000000000n, 1500000000n, 2000000000n]],
  }),
});

// Mock Account
const createMockAccount = () => ({
  address: '0x1234567890123456789012345678901234567890' as Address,
  sign: vi.fn(),
  signMessage: vi.fn(),
  signTypedData: vi.fn(),
});

describe('BridgeRouter', () => {
  let mockRpc: ReturnType<typeof createMockRpc>;
  let mockAccount: ReturnType<typeof createMockAccount>;

  beforeEach(() => {
    mockRpc = createMockRpc();
    mockAccount = createMockAccount();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create router with valid config', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(router).toBeDefined();
    });

    it('should register CCTP protocol by default', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(router.getRegisteredProtocols()).toContain('CCTP');
    });
  });

  describe('getAvailableProtocols', () => {
    it('should return protocols supporting USDC', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const protocols = router.getAvailableProtocols('USDC');
      expect(protocols).toContain('CCTP');
    });

    it('should return empty for unsupported token', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const protocols = router.getAvailableProtocols('DAI');
      expect(protocols).toHaveLength(0);
    });
  });

  describe('getSupportedRoutes', () => {
    it('should return routes for USDC', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const routes = await router.getSupportedRoutes('USDC');

      expect(routes.length).toBeGreaterThan(0);
      expect(routes[0].token).toBe('USDC');
      expect(routes[0].protocols).toContain('CCTP');
    });
  });

  describe('isRouteSupported', () => {
    it('should return true for supported route', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await router.isRouteSupported(42161, 'USDC');

      expect(result.supported).toBe(true);
      expect(result.protocols).toContain('CCTP');
    });

    it('should return false for unsupported destination', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await router.isRouteSupported(999999, 'USDC');

      expect(result.supported).toBe(false);
      expect(result.protocols).toHaveLength(0);
    });

    it('should return false for unsupported token', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await router.isRouteSupported(42161, 'DAI');

      expect(result.supported).toBe(false);
    });
  });

  describe('getQuote', () => {
    it('should get quote for CCTP', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const quote = await router.getQuote('CCTP', {
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(quote.protocol).toBe('CCTP');
      expect(quote.inputAmount).toBe(100000000n); // 100 USDC with 6 decimals
      expect(quote.outputAmount).toBe(100000000n); // CCTP is 1:1
      expect(quote.fee.protocol).toBe(0n); // CCTP has no protocol fees
    });

    it('should throw for unregistered protocol', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        router.getQuote('UnknownProtocol', {
          token: USDC,
          amount: '100',
          destinationChainId: 42161,
        })
      ).rejects.toThrow(BridgeProtocolUnavailableError);
    });
  });

  describe('findRoutes', () => {
    it('should find routes for valid request', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const comparison = await router.findRoutes({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(comparison.quotes.length).toBeGreaterThan(0);
      expect(comparison.recommended).toBeDefined();
      expect(comparison.recommended?.protocol).toBe('CCTP');
    });

    it('should throw for unsupported route', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        router.findRoutes({
          token: USDC,
          amount: '100',
          destinationChainId: 999999,
        })
      ).rejects.toThrow(BridgeNoRouteError);
    });

    it('should respect preference constraints', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const comparison = await router.findRoutes(
        {
          token: USDC,
          amount: '100',
          destinationChainId: 42161,
        },
        {
          priority: 'cost',
          maxFeeUSD: 0.001, // Very low max fee
        }
      );

      // CCTP has $0 protocol fee, so it should still work
      expect(comparison.recommended).toBeDefined();
    });
  });

  describe('previewBridge', () => {
    it('should return preview for valid request', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      // Mock balance check
      mockRpc.call.mockResolvedValue(
        '0x' + (1000000000n).toString(16).padStart(64, '0') // 1000 USDC
      );

      const preview = await router.previewBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(preview.amount.formatted).toBe('100');
      expect(preview.sourceChain.id).toBe(1);
      expect(preview.destinationChain.id).toBe(42161);
      expect(preview.quote).toBeDefined();
    });

    it('should include blockers for unsupported route', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const preview = await router.previewBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 999999,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('explain', () => {
    it('should explain a comparison', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const comparison = await router.findRoutes({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      const explanation = router.explain(comparison);

      expect(explanation).toContain('CCTP');
      expect(explanation).toContain('Fee');
    });
  });

  describe('summarize', () => {
    it('should summarize a comparison', async () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const comparison = await router.findRoutes({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      const summary = router.summarize(comparison);

      expect(summary).toContain('Recommended: CCTP');
    });
  });

  describe('createBridgeRouter', () => {
    it('should create a BridgeRouter instance', () => {
      const router = createBridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(router).toBeInstanceOf(BridgeRouter);
    });
  });

  describe('protocol management', () => {
    it('should unregister protocol', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(router.getRegisteredProtocols()).toContain('CCTP');

      const removed = router.unregisterProtocol('CCTP');

      expect(removed).toBe(true);
      expect(router.getRegisteredProtocols()).not.toContain('CCTP');
    });

    it('should return false when unregistering non-existent protocol', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const removed = router.unregisterProtocol('NonExistent');

      expect(removed).toBe(false);
    });

    it('should get protocol by name', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const protocol = router.getProtocol('CCTP');

      expect(protocol).toBeDefined();
      expect(protocol?.name).toBe('CCTP');
    });

    it('should return undefined for non-existent protocol', () => {
      const router = new BridgeRouter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const protocol = router.getProtocol('NonExistent');

      expect(protocol).toBeUndefined();
    });
  });
});

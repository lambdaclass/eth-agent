import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CCTPAdapter, createCCTPAdapter } from '../../../src/bridge/protocols/cctp-adapter.js';
import { USDC } from '../../../src/stablecoins/tokens.js';
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
  getGasPrice: vi.fn().mockResolvedValue(30000000000n), // 30 gwei
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

describe('CCTPAdapter', () => {
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
    it('should create adapter with valid config', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter).toBeDefined();
      expect(adapter.name).toBe('CCTP');
    });
  });

  describe('info property', () => {
    it('should have correct protocol info', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter.info.name).toBe('CCTP');
      expect(adapter.info.displayName).toBe('Circle CCTP');
      expect(adapter.info.supportedTokens).toContain('USDC');
      expect(adapter.info.finalityModel).toBe('attestation');
      expect(adapter.info.hasProtocolFees).toBe(false);
    });
  });

  describe('getSupportedChains', () => {
    it('should return supported chains', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const chains = adapter.getSupportedChains();

      expect(chains).toContain(1); // Ethereum
      expect(chains).toContain(42161); // Arbitrum
      expect(chains).toContain(8453); // Base
      expect(chains).toContain(10); // Optimism
    });
  });

  describe('isRouteSupported', () => {
    it('should return true for valid USDC route', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter.isRouteSupported(1, 42161, 'USDC')).toBe(true);
    });

    it('should return false for unsupported token', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter.isRouteSupported(1, 42161, 'DAI')).toBe(false);
    });

    it('should return false for same chain', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter.isRouteSupported(1, 1, 'USDC')).toBe(false);
    });
  });

  describe('getQuote', () => {
    it('should return quote for valid request', async () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const quote = await adapter.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(quote.protocol).toBe('CCTP');
      expect(quote.inputAmount).toBe(100000000n);
      expect(quote.outputAmount).toBe(100000000n); // 1:1 ratio
      expect(quote.fee.protocol).toBe(0n); // No protocol fee
    });

    it('should throw for unsupported token', async () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        adapter.getQuote({
          token: { symbol: 'DAI', name: 'DAI', decimals: 18, addresses: {} },
          amount: '100',
          destinationChainId: 42161,
        })
      ).rejects.toThrow('CCTP only supports USDC');
    });

    it('should throw for unsupported route', async () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        adapter.getQuote({
          token: USDC,
          amount: '100',
          destinationChainId: 999999,
        })
      ).rejects.toThrow('Route not supported');
    });

    it('should include estimated time', async () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const quote = await adapter.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(quote.estimatedTime.minSeconds).toBe(600);
      expect(quote.estimatedTime.maxSeconds).toBe(1800);
      expect(quote.estimatedTime.display).toContain('minute');
    });

    it('should include route description', async () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const quote = await adapter.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(quote.route.steps).toBe(1);
      expect(quote.route.description).toContain('USDC');
      expect(quote.route.description).toContain('Circle CCTP');
    });
  });

  describe('estimateFees', () => {
    it('should return zero protocol fee', async () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const fees = await adapter.estimateFees({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(fees.protocolFee).toBe(0n);
      expect(fees.gasFee).toBeGreaterThan(0n);
    });
  });

  describe('isAvailable', () => {
    it('should return true for supported chain', async () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false for unsupported chain', async () => {
      const unsupportedRpc = createMockRpc(999999);
      const adapter = new CCTPAdapter({
        sourceRpc: unsupportedRpc as any,
        account: mockAccount as any,
      });

      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('getReliabilityScore', () => {
    it('should return high reliability score', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const score = adapter.getReliabilityScore();
      expect(score).toBe(95);
    });
  });

  describe('getUnderlyingBridge', () => {
    it('should return CCTPBridge instance', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const bridge = adapter.getUnderlyingBridge();
      expect(bridge).toBeDefined();
      expect(bridge.name).toBe('CCTP');
    });
  });

  describe('createCCTPAdapter', () => {
    it('should create a CCTPAdapter instance', () => {
      const adapter = createCCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter).toBeInstanceOf(CCTPAdapter);
    });
  });
});

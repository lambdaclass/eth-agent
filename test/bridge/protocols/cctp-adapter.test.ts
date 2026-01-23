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
  waitForTransaction: vi.fn().mockResolvedValue({ status: 'success' }),
  getTransactionCount: vi.fn().mockResolvedValue(0),
  getLogs: vi.fn().mockResolvedValue([]),
  estimateGas: vi.fn().mockResolvedValue(100000n),
  getGasPrice: vi.fn().mockResolvedValue(30000000000n), // 30 gwei
  getMaxPriorityFeePerGas: vi.fn().mockResolvedValue(1000000000n),
  getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1000000000n }),
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
      expect(adapter.supportedTokens).toContain('USDC');
    });

    it('should create adapter with testnet config', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
        testnet: true,
      });

      expect(adapter).toBeDefined();
    });

    it('should create adapter with attestation config', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
        attestationConfig: {
          pollingInterval: 5000,
          maxWaitTime: 600000,
        },
      });

      expect(adapter).toBeDefined();
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
    it('should return list of supported chains', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const chains = adapter.getSupportedChains();

      expect(chains).toContain(1); // Ethereum
      expect(chains).toContain(42161); // Arbitrum
      expect(chains).toContain(8453); // Base
    });
  });

  describe('isRouteSupported', () => {
    it('should delegate to underlying bridge', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter.isRouteSupported(1, 42161, 'USDC')).toBe(true);
      expect(adapter.isRouteSupported(1, 1, 'USDC')).toBe(false);
      expect(adapter.isRouteSupported(1, 42161, 'DAI')).toBe(false);
    });
  });

  describe('getEstimatedTime', () => {
    it('should return time estimate', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const time = adapter.getEstimatedTime();
      expect(time).toContain('minute');
    });
  });

  describe('getQuote', () => {
    it('should return valid quote for USDC', async () => {
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
      expect(quote.inputAmount).toBe(100000000n); // 100 USDC with 6 decimals
      expect(quote.outputAmount).toBe(100000000n); // 1:1 transfer
      expect(quote.fee.protocol).toBe(0n); // No protocol fees
      expect(quote.estimatedTime.minSeconds).toBe(600);
      expect(quote.estimatedTime.maxSeconds).toBe(1800);
    });

    it('should throw for non-USDC token', async () => {
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

    it('should handle gas price fetch failure', async () => {
      mockRpc.getGasPrice.mockRejectedValue(new Error('RPC error'));

      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const quote = await adapter.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      // Should use fallback gas estimate
      expect(quote.fee.gas).toBe(100000n * 30000000000n);
    });
  });

  describe('estimateFees', () => {
    it('should return zero protocol fee and estimated gas fee', async () => {
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
      expect(fees.gasFee).toBe(100000n * 30000000000n); // 100k gas * 30 gwei
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

    it('should return false when RPC fails', async () => {
      mockRpc.getChainId.mockRejectedValue(new Error('RPC error'));

      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('getReliabilityScore', () => {
    it('should return 95 for CCTP', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(adapter.getReliabilityScore()).toBe(95);
    });
  });

  describe('getUnderlyingBridge', () => {
    it('should return the underlying CCTPBridge', () => {
      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const bridge = adapter.getUnderlyingBridge();
      expect(bridge).toBeDefined();
      expect(bridge.name).toBe('CCTP');
    });
  });

  describe('getStatus', () => {
    it('should delegate to underlying bridge', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'complete',
            attestation: '0xattestation',
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const status = await adapter.getStatus('0xmessagehash' as Hex);

      expect(status.status).toBe('attestation_ready');
    });
  });

  describe('waitForAttestation', () => {
    it('should delegate to underlying bridge', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'complete',
            attestation: '0xattestation123',
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new CCTPAdapter({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const attestation = await adapter.waitForAttestation('0xmessagehash' as Hex);

      expect(attestation).toBe('0xattestation123');
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

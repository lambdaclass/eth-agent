/**
 * Across Bridge tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AcrossBridge,
  createAcrossBridge,
} from '../../../src/bridge/across/across-bridge.js';
import { USDC, USDT, DAI } from '../../../src/stablecoins/index.js';
import { BridgeUnsupportedRouteError, BridgeLimitError, BridgeCompletionError } from '../../../src/bridge/errors.js';
import type { Address, Hex } from '../../../src/core/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock RPC client
const createMockRpc = (chainId = 1) => ({
  getChainId: vi.fn().mockResolvedValue(chainId),
  call: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000005f5e100'), // 100 USDC
  getTransactionCount: vi.fn().mockResolvedValue(5),
  sendRawTransaction: vi.fn().mockResolvedValue('0xabcd1234' as Hex),
  waitForTransaction: vi.fn().mockResolvedValue({
    transactionHash: '0xabcd1234' as Hex,
    blockNumber: 12345678,
    gasUsed: 150000n,
    status: 'success' as const,
    logs: [],
  }),
  getGasPrice: vi.fn().mockResolvedValue(30000000000n),
  estimateGas: vi.fn().mockResolvedValue(200000n),
  getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 25000000000n }),
  getMaxPriorityFeePerGas: vi.fn().mockResolvedValue(1500000000n),
  getFeeHistory: vi.fn().mockResolvedValue({
    baseFeePerGas: [25000000000n],
    gasUsedRatio: [0.5],
    reward: [[1000000000n]],
  }),
});

// Mock account
const createMockAccount = () => ({
  address: '0x1234567890123456789012345678901234567890' as Address,
  sign: vi.fn().mockReturnValue({
    r: '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
    s: '0x5678901234567890123456789012345678901234567890123456789012345678' as Hex,
    yParity: 0,
  }),
  signTypedData: vi.fn(),
});

// Mock quote response
const createMockQuoteResponse = (overrides = {}) => ({
  totalRelayFee: { total: '500000', pct: '0.005' },
  relayerCapitalFee: { total: '300000', pct: '0.003' },
  relayerGasFee: { total: '150000', pct: '0.0015' },
  lpFee: { total: '50000', pct: '0.0005' },
  timestamp: 1704067200,
  isAmountTooLow: false,
  quoteBlock: 12345678,
  spokePoolAddress: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
  expectedFillTimeSec: 120,
  limits: {
    minDeposit: '1000000',
    maxDeposit: '1000000000000',
    maxDepositInstant: '100000000000',
    maxDepositShortDelay: '500000000000',
  },
  ...overrides,
});

describe('AcrossBridge', () => {
  let mockRpc: ReturnType<typeof createMockRpc>;
  let mockAccount: ReturnType<typeof createMockAccount>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = createMockRpc();
    mockAccount = createMockAccount();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create bridge with minimal config', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge).toBeInstanceOf(AcrossBridge);
    });

    it('should accept custom fill deadline offset', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
        fillDeadlineOffset: 7200, // 2 hours
      });

      expect(bridge).toBeInstanceOf(AcrossBridge);
    });

    it('should accept testnet config', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
        testnet: true,
      });

      expect(bridge).toBeInstanceOf(AcrossBridge);
    });
  });

  describe('getSupportedChains', () => {
    it('should return list of supported chains', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const chains = bridge.getSupportedChains();

      expect(chains).toContain(1); // Ethereum
      expect(chains).toContain(10); // Optimism
      expect(chains).toContain(42161); // Arbitrum
      expect(chains).toContain(8453); // Base
      expect(chains.length).toBeGreaterThan(5);
    });
  });

  describe('isRouteSupported', () => {
    it('should return true for valid USDC route', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 42161, 'USDC')).toBe(true);
    });

    it('should return true for valid WETH route', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 10, 'WETH')).toBe(true);
    });

    it('should return false for same chain', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 1, 'USDC')).toBe(false);
    });

    it('should return false for unsupported source chain', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(999999, 42161, 'USDC')).toBe(false);
    });

    it('should return false for unsupported destination chain', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 999999, 'USDC')).toBe(false);
    });

    it('should handle token variants like USDC.e', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      // Should normalize and match
      expect(bridge.isRouteSupported(10, 42161, 'USDC')).toBe(true);
    });
  });

  describe('getEstimatedTime', () => {
    it('should return estimated time string', () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.getEstimatedTime()).toBe('2-5 minutes');
    });
  });

  describe('getQuote', () => {
    it('should return quote for valid request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const quote = await bridge.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(quote.inputAmount).toBe(100000000n);
      expect(quote.outputAmount).toBe(99500000n); // 100 - 0.5 fee
      expect(quote.totalFee).toBe(500000n);
      expect(quote.isAmountTooLow).toBe(false);
    });

    it('should include recipient in API call when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await bridge.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
        recipient: '0x9876543210987654321098765432109876543210',
      });

      expect(mockFetch.mock.calls[0][0]).toContain('recipient=');
    });

    it('should throw for unsupported route', async () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.getQuote({
          token: USDC,
          amount: '100',
          destinationChainId: 999999,
        })
      ).rejects.toThrow(BridgeUnsupportedRouteError);
    });
  });

  describe('previewBridge', () => {
    it('should return preview for valid request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(preview.canBridge).toBe(true);
      expect(preview.blockers).toHaveLength(0);
      expect(preview.quote).not.toBeNull();
      expect(preview.sourceChain.id).toBe(1);
      expect(preview.destinationChain.id).toBe(42161);
    });

    it('should include blocker for unsupported route', async () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 999999,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.length).toBeGreaterThan(0);
      expect(preview.blockers[0]).toContain('Route not supported');
    });

    it('should include blocker for amount too low', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockQuoteResponse({
              isAmountTooLow: true,
              limits: { minDeposit: '10000000', maxDeposit: '1000000000000' },
            })
          ),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '1', // Too low
        destinationChainId: 42161,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.some((b) => b.includes('too low'))).toBe(true);
    });

    it('should include blocker for amount too high', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockQuoteResponse({
              limits: { minDeposit: '1000000', maxDeposit: '100000000' }, // 100 USDC max
            })
          ),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '1000', // 1000 USDC > 100 max
        destinationChainId: 42161,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.some((b) => b.includes('exceeds maximum'))).toBe(true);
    });

    it('should include blocker for insufficient balance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      // Return low balance (10 USDC)
      mockRpc.call.mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000989680');

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '100', // Need 100, only have 10
        destinationChainId: 42161,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.some((b) => b.includes('Insufficient'))).toBe(true);
    });

    it('should detect when approval is needed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      // First call: balance (high), second call: allowance (0)
      mockRpc.call
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000005f5e100') // 100 USDC balance
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000'); // 0 allowance

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(preview.needsApproval).toBe(true);
    });
  });

  describe('initiateBridge', () => {
    it('should initiate bridge for valid request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      // Allowance check - already approved
      mockRpc.call.mockResolvedValueOnce(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      );

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.initiateBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(true);
      expect(result.burnTxHash).toBe('0xabcd1234');
      expect(result.sourceChainId).toBe(1);
      expect(result.destinationChainId).toBe(42161);
    });

    it('should throw for unsupported route', async () => {
      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.initiateBridge({
          token: USDC,
          amount: '100',
          destinationChainId: 999999,
        })
      ).rejects.toThrow(BridgeUnsupportedRouteError);
    });

    it('should throw for amount too low', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockQuoteResponse({
              isAmountTooLow: true,
            })
          ),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.initiateBridge({
          token: USDC,
          amount: '0.1',
          destinationChainId: 42161,
        })
      ).rejects.toThrow(BridgeLimitError);
    });

    it('should request approval when needed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      // First call: allowance (0), triggers approval flow
      // Second call after approval: allowance still checked
      mockRpc.call
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000') // 0 allowance
        .mockResolvedValueOnce('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'); // max allowance after approval

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.initiateBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(true);
      // Should have sent approval tx + deposit tx
      expect(mockRpc.sendRawTransaction).toHaveBeenCalledTimes(2);
    });

    it('should use custom recipient when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      mockRpc.call.mockResolvedValueOnce(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      );

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const customRecipient = '0x9876543210987654321098765432109876543210' as Address;

      const result = await bridge.initiateBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
        recipient: customRecipient,
      });

      expect(result.recipient).toBe(customRecipient);
    });
  });

  describe('getStatus', () => {
    it('should return pending status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'pending',
            deposit: { depositId: 123 },
          }),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const status = await bridge.getStatus('0x7b' as Hex); // 123 in hex

      expect(status.status).toBe('attestation_pending');
      expect(status.attestation).toBeUndefined();
    });

    it('should return completed status with fill tx', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'filled',
            fillTxHash: '0xfillhash123',
            deposit: { depositId: 123 },
          }),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const status = await bridge.getStatus('0x7b' as Hex);

      expect(status.status).toBe('completed');
      expect(status.attestation).toBe('0xfillhash123');
    });

    it('should return failed status for expired', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'expired',
            deposit: { depositId: 123 },
          }),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const status = await bridge.getStatus('0x7b' as Hex);

      expect(status.status).toBe('failed');
      expect(status.error).toContain('expired');
    });

    it('should handle API error gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const status = await bridge.getStatus('0x7b' as Hex);

      expect(status.status).toBe('attestation_pending');
      expect(status.error).toBeDefined();
    });
  });

  describe('waitForAttestation', () => {
    it('should return fill tx hash when completed immediately', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'filled',
            fillTxHash: '0xfillhash123',
          }),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.waitForAttestation('0x7b' as Hex);

      expect(result).toBe('0xfillhash123');
    });

    it('should poll until filled', async () => {
      // First call: pending, second call: filled
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'pending' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'filled',
              fillTxHash: '0xfillhash123',
            }),
        });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.waitForAttestation('0x7b' as Hex, {
        pollingInterval: 10, // Very short for testing
      });

      expect(result).toBe('0xfillhash123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw for expired deposit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'expired' }),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(bridge.waitForAttestation('0x7b' as Hex)).rejects.toThrow(BridgeCompletionError);
    });

    it('should throw on timeout', async () => {
      // Always return pending
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'pending' }),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.waitForAttestation('0x7b' as Hex, {
          pollingInterval: 10,
          maxWaitTime: 50, // Very short for testing
        })
      ).rejects.toThrow(BridgeCompletionError);
    });

    it('should continue polling on API error', async () => {
      // First call: error, second call: filled
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'filled',
              fillTxHash: '0xfillhash123',
            }),
        });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.waitForAttestation('0x7b' as Hex, {
        pollingInterval: 10,
      });

      expect(result).toBe('0xfillhash123');
    });
  });

  describe('createAcrossBridge', () => {
    it('should create AcrossBridge instance', () => {
      const bridge = createAcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge).toBeInstanceOf(AcrossBridge);
    });
  });

  describe('testnet auto-detection', () => {
    it('should auto-detect testnet from Sepolia chain ID', async () => {
      const sepoliaRpc = createMockRpc(11155111);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      const bridge = new AcrossBridge({
        sourceRpc: sepoliaRpc as any,
        account: mockAccount as any,
      });

      await bridge.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 421614, // Arbitrum Sepolia
      });

      // Should have called testnet API
      expect(mockFetch.mock.calls[0][0]).toContain('testnet.across.to');
    });

    it('should use mainnet API for mainnet chain', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await bridge.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(mockFetch.mock.calls[0][0]).toContain('app.across.to');
    });

    it('should respect explicit testnet config over auto-detection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockQuoteResponse()),
      });

      const bridge = new AcrossBridge({
        sourceRpc: mockRpc as any, // Mainnet
        account: mockAccount as any,
        testnet: true, // Force testnet
      });

      await bridge.getQuote({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(mockFetch.mock.calls[0][0]).toContain('testnet.across.to');
    });
  });
});

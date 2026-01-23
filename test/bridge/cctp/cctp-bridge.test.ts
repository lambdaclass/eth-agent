import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CCTPBridge, createCCTPBridge } from '../../../src/bridge/cctp/cctp-bridge.js';
import { BridgeUnsupportedRouteError, BridgeSameChainError } from '../../../src/bridge/errors.js';
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

describe('CCTPBridge', () => {
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
    it('should create bridge with valid config', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge).toBeDefined();
      expect(bridge.name).toBe('CCTP');
      expect(bridge.supportedTokens).toContain('USDC');
    });
  });

  describe('getSupportedChains', () => {
    it('should return list of supported chains', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const chains = bridge.getSupportedChains();

      expect(chains).toContain(1); // Ethereum
      expect(chains).toContain(42161); // Arbitrum
      expect(chains).toContain(8453); // Base
      expect(chains).toContain(10); // Optimism
    });
  });

  describe('isRouteSupported', () => {
    it('should return true for valid USDC route', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 42161, 'USDC')).toBe(true);
      expect(bridge.isRouteSupported(1, 8453, 'USDC')).toBe(true);
    });

    it('should return false for same chain', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 1, 'USDC')).toBe(false);
    });

    it('should return false for unsupported token', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 42161, 'DAI')).toBe(false);
      expect(bridge.isRouteSupported(1, 42161, 'USDT')).toBe(false);
    });

    it('should return false for unsupported chain', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 999999, 'USDC')).toBe(false);
      expect(bridge.isRouteSupported(999999, 42161, 'USDC')).toBe(false);
    });
  });

  describe('getEstimatedTime', () => {
    it('should return time estimate', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const time = bridge.getEstimatedTime();
      expect(time).toContain('minute');
    });
  });

  describe('initiateBridge', () => {
    it('should throw for unsupported token', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.initiateBridge({
          token: { symbol: 'DAI', name: 'DAI', decimals: 18, addresses: {} },
          amount: '100',
          destinationChainId: 42161,
        })
      ).rejects.toThrow(BridgeUnsupportedRouteError);
    });

    it('should throw for same chain bridge', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.initiateBridge({
          token: USDC,
          amount: '100',
          destinationChainId: 1, // Same as source
        })
      ).rejects.toThrow(BridgeSameChainError);
    });

    it('should throw for unsupported destination chain', async () => {
      const bridge = new CCTPBridge({
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

    it('should throw for unsupported source chain', async () => {
      const unsupportedRpc = createMockRpc(999999);
      const bridge = new CCTPBridge({
        sourceRpc: unsupportedRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.initiateBridge({
          token: USDC,
          amount: '100',
          destinationChainId: 42161,
        })
      ).rejects.toThrow(BridgeUnsupportedRouteError);
    });
  });

  describe('getStatus', () => {
    it('should return attestation pending status', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0x1234' as Hex;
      const status = await bridge.getStatus(messageHash);

      expect(status.status).toBe('attestation_pending');
      expect(status.messageHash).toBe(messageHash);
    });

    it('should return attestation ready status', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'complete',
            attestation: '0xaabbccdd',
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0x1234' as Hex;
      const status = await bridge.getStatus(messageHash);

      expect(status.status).toBe('attestation_ready');
      expect(status.attestation).toBe('0xaabbccdd');
    });
  });

  describe('createCCTPBridge', () => {
    it('should create a CCTPBridge instance', () => {
      const bridge = createCCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge).toBeInstanceOf(CCTPBridge);
    });
  });

  describe('constructor with testnet option', () => {
    it('should accept explicit testnet option', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
        testnet: true,
      });

      expect(bridge).toBeDefined();
    });

    it('should accept attestation config options', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
        attestationConfig: {
          pollingInterval: 5000,
          maxWaitTime: 600000,
        },
      });

      expect(bridge).toBeDefined();
    });
  });

  describe('getSourceChainId', () => {
    it('should return the source chain ID', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const chainId = await bridge.getSourceChainId();
      expect(chainId).toBe(1);
    });

    it('should cache chain ID after first call', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await bridge.getSourceChainId();
      await bridge.getSourceChainId();

      // Should only call getChainId once due to caching
      expect(mockRpc.getChainId).toHaveBeenCalledTimes(1);
    });
  });

  describe('previewBridge', () => {
    it('should return preview with blockers for same chain', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      // Mock balance check
      mockRpc.call.mockResolvedValue(
        '0x' + (100000000n).toString(16).padStart(64, '0') // 100 USDC
      );

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '10',
        destinationChainId: 1, // Same chain
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.length).toBeGreaterThan(0);
      expect(preview.blockers[0]).toContain('same chain');
    });

    it('should return preview with blockers for unsupported token', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      mockRpc.call.mockResolvedValue(
        '0x' + (100000000n).toString(16).padStart(64, '0')
      );

      const preview = await bridge.previewBridge({
        token: { symbol: 'DAI', name: 'DAI', decimals: 18, addresses: {} },
        amount: '10',
        destinationChainId: 42161,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.some(b => b.includes('not supported'))).toBe(true);
    });

    it('should return preview with blockers for unsupported destination', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      mockRpc.call.mockResolvedValue(
        '0x' + (100000000n).toString(16).padStart(64, '0')
      );

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '10',
        destinationChainId: 999999,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.some(b => b.includes('not supported'))).toBe(true);
    });

    it('should return preview with blockers for insufficient balance', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      // Mock insufficient balance
      mockRpc.call.mockResolvedValue(
        '0x' + (1000000n).toString(16).padStart(64, '0') // Only 1 USDC
      );

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '100', // Need 100 USDC
        destinationChainId: 42161,
      });

      expect(preview.canBridge).toBe(false);
      expect(preview.blockers.some(b => b.includes('Insufficient'))).toBe(true);
    });

    it('should return successful preview when all conditions met', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      // Mock sufficient balance and allowance
      mockRpc.call
        .mockResolvedValueOnce('0x' + (100000000n).toString(16).padStart(64, '0')) // Balance: 100 USDC
        .mockResolvedValueOnce('0x' + (100000000n).toString(16).padStart(64, '0')); // Allowance: 100 USDC

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '10',
        destinationChainId: 42161,
      });

      expect(preview.canBridge).toBe(true);
      expect(preview.blockers.length).toBe(0);
      expect(preview.sourceChain.id).toBe(1);
      expect(preview.destinationChain.id).toBe(42161);
      expect(preview.amount.formatted).toBe('10');
      expect(preview.estimatedTime).toBeDefined();
    });

    it('should indicate when approval is needed', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      // Mock sufficient balance but zero allowance
      mockRpc.call
        .mockResolvedValueOnce('0x' + (100000000n).toString(16).padStart(64, '0')) // Balance: 100 USDC
        .mockResolvedValueOnce('0x' + (0n).toString(16).padStart(64, '0')); // Allowance: 0

      const preview = await bridge.previewBridge({
        token: USDC,
        amount: '10',
        destinationChainId: 42161,
      });

      expect(preview.needsApproval).toBe(true);
    });
  });

  describe('waitForAttestation', () => {
    it('should wait for attestation and return it', async () => {
      const attestation = '0xattestationsignature' as Hex;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'complete',
            attestation,
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0x1234' as Hex;
      const result = await bridge.waitForAttestation(messageHash);

      expect(result).toBe(attestation);
    });
  });

  describe('isAttestationReady', () => {
    it('should return true when attestation is ready', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'complete',
            attestation: '0xaabbccdd',
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.isAttestationReady('0x1234' as Hex);
      expect(result).toBe(true);
    });

    it('should return false when attestation is pending', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'pending',
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.isAttestationReady('0x1234' as Hex);
      expect(result).toBe(false);
    });
  });

  describe('getStatus error handling', () => {
    it('should return failed status on error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const status = await bridge.getStatus('0x1234' as Hex);

      expect(status.status).toBe('failed');
      expect(status.error).toContain('Network error');
    });
  });

  describe('testnet auto-detection', () => {
    it('should auto-detect testnet from chain ID', async () => {
      const sepoliaRpc = createMockRpc(11155111); // Sepolia
      const bridge = new CCTPBridge({
        sourceRpc: sepoliaRpc as any,
        account: mockAccount as any,
      });

      // Initialize to trigger auto-detection
      const chainId = await bridge.getSourceChainId();
      expect(chainId).toBe(11155111);
    });
  });
});

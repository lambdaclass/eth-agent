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
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CCTPBridge, createCCTPBridge } from '../../../src/bridge/cctp/cctp-bridge.js';
import {
  BridgeUnsupportedRouteError,
  BridgeSameChainError,
  BridgeApprovalError,
  BridgeCompletionError,
} from '../../../src/bridge/errors.js';
import { InsufficientFundsError } from '../../../src/agent/errors.js';
import { USDC } from '../../../src/stablecoins/tokens.js';
import type { Address, Hash, Hex } from '../../../src/core/types.js';

// Mock TokenMessengerContract
vi.mock('../../../src/bridge/cctp/token-messenger.js', async () => {
  const actual = await vi.importActual('../../../src/bridge/cctp/token-messenger.js');
  return {
    ...actual,
    TokenMessengerContract: vi.fn().mockImplementation(() => ({
      getBalance: vi.fn().mockResolvedValue(1000000000n), // 1000 USDC
      getAllowance: vi.fn().mockResolvedValue(0n),
      approve: vi.fn().mockResolvedValue('0xapprovehash' as Hash),
      depositForBurn: vi.fn().mockResolvedValue({
        hash: '0xburntxhash' as Hash,
        nonce: 123n,
        messageBytes: '0xmessagebytes' as Hex,
        messageHash: '0xmessagehash' as Hex,
      }),
    })),
  };
});

// Mock MessageTransmitterContract
vi.mock('../../../src/bridge/cctp/message-transmitter.js', async () => {
  const actual = await vi.importActual('../../../src/bridge/cctp/message-transmitter.js');
  return {
    ...actual,
    MessageTransmitterContract: vi.fn().mockImplementation(() => ({
      isNonceUsed: vi.fn().mockResolvedValue(false),
      receiveMessage: vi.fn().mockResolvedValue({
        hash: '0xminttxhash' as Hash,
        success: true,
      }),
    })),
  };
});

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

  describe('getStatus error handling', () => {
    it('should return failed status on error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0x1234' as Hex;
      const status = await bridge.getStatus(messageHash);

      expect(status.status).toBe('failed');
      expect(status.error).toContain('Network error');
      expect(status.messageHash).toBe(messageHash);
    });

    it('should handle non-Error exceptions', async () => {
      const fetchMock = vi.fn().mockRejectedValue('String error');
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0x5678' as Hex;
      const status = await bridge.getStatus(messageHash);

      expect(status.status).toBe('failed');
      expect(status.error).toContain('String error');
    });
  });

  describe('waitForAttestation', () => {
    it('should wait and return attestation', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'complete',
            attestation: '0xattestation123',
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0xabc' as Hex;
      const attestation = await bridge.waitForAttestation(messageHash);

      expect(attestation).toBe('0xattestation123');
    });
  });

  describe('isAttestationReady', () => {
    it('should return true when attestation is ready', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'complete',
            attestation: '0xattestation',
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0xdef' as Hex;
      const ready = await bridge.isAttestationReady(messageHash);

      expect(ready).toBe(true);
    });

    it('should return false when attestation is pending', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageHash = '0xghi' as Hex;
      const ready = await bridge.isAttestationReady(messageHash);

      expect(ready).toBe(false);
    });
  });

  describe('getSourceChainId', () => {
    it('should return cached chain ID', async () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const chainId = await bridge.getSourceChainId();
      expect(chainId).toBe(1);
      expect(mockRpc.getChainId).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const chainId2 = await bridge.getSourceChainId();
      expect(chainId2).toBe(1);
      expect(mockRpc.getChainId).toHaveBeenCalledTimes(1);
    });
  });

  describe('constructor with testnet', () => {
    it('should create bridge with explicit testnet config', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
        testnet: true,
      });

      expect(bridge).toBeDefined();
    });

    it('should create bridge with attestation config', () => {
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

  describe('isRouteSupported edge cases', () => {
    it('should handle lowercase usdc token', () => {
      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      expect(bridge.isRouteSupported(1, 42161, 'usdc')).toBe(true);
    });
  });

  describe('initiateBridge - full flow', () => {
    it('should successfully initiate bridge with sufficient balance and allowance', async () => {
      const { TokenMessengerContract } = await import(
        '../../../src/bridge/cctp/token-messenger.js'
      );
      vi.mocked(TokenMessengerContract).mockImplementation(
        () =>
          ({
            getBalance: vi.fn().mockResolvedValue(1000000000n), // 1000 USDC
            getAllowance: vi.fn().mockResolvedValue(500000000n), // 500 USDC allowance
            approve: vi.fn().mockResolvedValue('0xapprovehash' as Hash),
            depositForBurn: vi.fn().mockResolvedValue({
              hash: '0xburntxhash' as Hash,
              nonce: 123n,
              messageBytes: '0xmessagebytes' as Hex,
              messageHash: '0xmessagehash' as Hex,
            }),
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const result = await bridge.initiateBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(true);
      expect(result.burnTxHash).toBe('0xburntxhash');
      expect(result.nonce).toBe(123n);
    });

    it('should approve when allowance is insufficient', async () => {
      const approveMock = vi.fn().mockResolvedValue('0xapprovehash' as Hash);
      const { TokenMessengerContract } = await import(
        '../../../src/bridge/cctp/token-messenger.js'
      );
      vi.mocked(TokenMessengerContract).mockImplementation(
        () =>
          ({
            getBalance: vi.fn().mockResolvedValue(1000000000n),
            getAllowance: vi.fn().mockResolvedValue(0n), // No allowance
            approve: approveMock,
            depositForBurn: vi.fn().mockResolvedValue({
              hash: '0xburntxhash' as Hash,
              nonce: 123n,
              messageBytes: '0xmessagebytes' as Hex,
              messageHash: '0xmessagehash' as Hex,
            }),
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await bridge.initiateBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
      });

      expect(approveMock).toHaveBeenCalled();
    });

    it('should throw InsufficientFundsError when balance is too low', async () => {
      const { TokenMessengerContract } = await import(
        '../../../src/bridge/cctp/token-messenger.js'
      );
      vi.mocked(TokenMessengerContract).mockImplementation(
        () =>
          ({
            getBalance: vi.fn().mockResolvedValue(50000000n), // Only 50 USDC
            getAllowance: vi.fn().mockResolvedValue(0n),
            approve: vi.fn(),
            depositForBurn: vi.fn(),
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.initiateBridge({
          token: USDC,
          amount: '100', // Need 100 USDC
          destinationChainId: 42161,
        })
      ).rejects.toThrow(InsufficientFundsError);
    });

    it('should throw BridgeApprovalError when approve fails', async () => {
      const { TokenMessengerContract } = await import(
        '../../../src/bridge/cctp/token-messenger.js'
      );
      vi.mocked(TokenMessengerContract).mockImplementation(
        () =>
          ({
            getBalance: vi.fn().mockResolvedValue(1000000000n),
            getAllowance: vi.fn().mockResolvedValue(0n),
            approve: vi.fn().mockRejectedValue(new Error('Approval failed')),
            depositForBurn: vi.fn(),
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.initiateBridge({
          token: USDC,
          amount: '100',
          destinationChainId: 42161,
        })
      ).rejects.toThrow(BridgeApprovalError);
    });

    it('should use custom recipient when provided', async () => {
      const depositForBurnMock = vi.fn().mockResolvedValue({
        hash: '0xburntxhash' as Hash,
        nonce: 123n,
        messageBytes: '0xmessagebytes' as Hex,
        messageHash: '0xmessagehash' as Hex,
      });

      const { TokenMessengerContract } = await import(
        '../../../src/bridge/cctp/token-messenger.js'
      );
      vi.mocked(TokenMessengerContract).mockImplementation(
        () =>
          ({
            getBalance: vi.fn().mockResolvedValue(1000000000n),
            getAllowance: vi.fn().mockResolvedValue(1000000000n),
            approve: vi.fn(),
            depositForBurn: depositForBurnMock,
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const customRecipient = '0xabcdef1234567890abcdef1234567890abcdef12' as Address;
      const result = await bridge.initiateBridge({
        token: USDC,
        amount: '100',
        destinationChainId: 42161,
        recipient: customRecipient,
      });

      expect(result.recipient).toBe(customRecipient);
      expect(depositForBurnMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mintRecipient: customRecipient,
        })
      );
    });
  });

  describe('completeBridge', () => {
    // Create a valid message bytes structure for testing
    const createValidMessageBytes = (): Hex => {
      // Header: version(4) + sourceDomain(4) + destDomain(4) + nonce(8) + sender(32) + recipient(32) + destCaller(32) = 116 bytes
      const version = '00000000';
      const sourceDomain = '00000000'; // Ethereum
      const destDomain = '00000003'; // Arbitrum
      const nonce = '000000000000007b'; // nonce = 123
      const sender = '0000000000000000000000001234567890123456789012345678901234567890';
      const recipient = '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12';
      const destCaller = '0000000000000000000000000000000000000000000000000000000000000000';
      // Body for burn message
      const bodyVersion = '00000000';
      const burnToken = '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const mintRecipient = '000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const amount = '0000000000000000000000000000000000000000000000000000000005f5e100'; // 100 USDC
      const messageSender = '0000000000000000000000001234567890123456789012345678901234567890';

      return `0x${version}${sourceDomain}${destDomain}${nonce}${sender}${recipient}${destCaller}${bodyVersion}${burnToken}${mintRecipient}${amount}${messageSender}` as Hex;
    };

    it('should successfully complete bridge', async () => {
      const destRpc = createMockRpc(42161); // Arbitrum

      const { MessageTransmitterContract } = await import(
        '../../../src/bridge/cctp/message-transmitter.js'
      );
      vi.mocked(MessageTransmitterContract).mockImplementation(
        () =>
          ({
            isNonceUsed: vi.fn().mockResolvedValue(false),
            receiveMessage: vi.fn().mockResolvedValue({
              hash: '0xminttxhash' as Hash,
              success: true,
            }),
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageBytes = createValidMessageBytes();
      const result = await bridge.completeBridge(
        messageBytes,
        '0xattestation' as Hex,
        destRpc as any
      );

      expect(result.success).toBe(true);
      expect(result.mintTxHash).toBe('0xminttxhash');
      expect(result.amount.raw).toBe(100000000n);
    });

    it('should throw when destination chain is not supported', async () => {
      const unsupportedRpc = createMockRpc(999999);

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageBytes = createValidMessageBytes();
      await expect(
        bridge.completeBridge(messageBytes, '0xattestation' as Hex, unsupportedRpc as any)
      ).rejects.toThrow(BridgeUnsupportedRouteError);
    });

    it('should throw when message domain does not match chain', async () => {
      // Create message with wrong destination domain (expecting domain 6 for Base, but chain is Arbitrum)
      const wrongDomainMessage = (): Hex => {
        const version = '00000000';
        const sourceDomain = '00000000';
        const destDomain = '00000006'; // Base domain, but we'll call with Arbitrum RPC
        const nonce = '000000000000007b';
        const sender = '0000000000000000000000001234567890123456789012345678901234567890';
        const recipient = '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12';
        const destCaller = '0000000000000000000000000000000000000000000000000000000000000000';
        const bodyVersion = '00000000';
        const burnToken = '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
        const mintRecipient = '000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
        const amount = '0000000000000000000000000000000000000000000000000000000005f5e100';
        const messageSender = '0000000000000000000000001234567890123456789012345678901234567890';

        return `0x${version}${sourceDomain}${destDomain}${nonce}${sender}${recipient}${destCaller}${bodyVersion}${burnToken}${mintRecipient}${amount}${messageSender}` as Hex;
      };

      const destRpc = createMockRpc(42161); // Arbitrum (domain 3)

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      await expect(
        bridge.completeBridge(wrongDomainMessage(), '0xattestation' as Hex, destRpc as any)
      ).rejects.toThrow(BridgeCompletionError);
    });

    it('should throw when nonce is already used', async () => {
      const destRpc = createMockRpc(42161);

      const { MessageTransmitterContract } = await import(
        '../../../src/bridge/cctp/message-transmitter.js'
      );
      vi.mocked(MessageTransmitterContract).mockImplementation(
        () =>
          ({
            isNonceUsed: vi.fn().mockResolvedValue(true), // Nonce already used
            receiveMessage: vi.fn(),
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageBytes = createValidMessageBytes();
      await expect(
        bridge.completeBridge(messageBytes, '0xattestation' as Hex, destRpc as any)
      ).rejects.toThrow(BridgeCompletionError);
    });

    it('should throw BridgeCompletionError when receiveMessage fails', async () => {
      const destRpc = createMockRpc(42161);

      const { MessageTransmitterContract } = await import(
        '../../../src/bridge/cctp/message-transmitter.js'
      );
      vi.mocked(MessageTransmitterContract).mockImplementation(
        () =>
          ({
            isNonceUsed: vi.fn().mockResolvedValue(false),
            receiveMessage: vi.fn().mockRejectedValue(new Error('Transaction failed')),
          }) as any
      );

      const bridge = new CCTPBridge({
        sourceRpc: mockRpc as any,
        account: mockAccount as any,
      });

      const messageBytes = createValidMessageBytes();
      await expect(
        bridge.completeBridge(messageBytes, '0xattestation' as Hex, destRpc as any)
      ).rejects.toThrow(BridgeCompletionError);
    });
  });
});

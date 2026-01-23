import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TokenMessengerContract,
  TOKEN_MESSENGER_ABI,
  MESSAGE_SENT_ABI,
} from '../../../src/bridge/cctp/token-messenger.js';
import { CCTP_CONTRACTS } from '../../../src/bridge/constants.js';
import type { Address, Hash, Hex, Log } from '../../../src/core/types.js';
import { keccak256 } from '../../../src/core/hash.js';
import { bytesToHex } from '../../../src/core/hex.js';

// Mock RPC Client
const createMockRpc = () => ({
  getChainId: vi.fn().mockResolvedValue(1),
  getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
  call: vi.fn(),
  sendRawTransaction: vi.fn().mockResolvedValue('0xhash' as Hash),
  waitForTransaction: vi.fn(),
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
  sign: vi.fn().mockReturnValue({
    r: '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
    s: '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
    yParity: 0,
  }),
  signMessage: vi.fn(),
  signTypedData: vi.fn(),
});

describe('TokenMessengerContract', () => {
  let mockRpc: ReturnType<typeof createMockRpc>;
  let mockAccount: ReturnType<typeof createMockAccount>;
  const cctpConfig = CCTP_CONTRACTS[1]; // Ethereum mainnet

  beforeEach(() => {
    mockRpc = createMockRpc();
    mockAccount = createMockAccount();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create TokenMessengerContract with valid config', () => {
      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      expect(contract).toBeDefined();
    });
  });

  describe('getBalance', () => {
    it('should return USDC balance', async () => {
      const balance = 1000000n; // 1 USDC
      mockRpc.call.mockResolvedValue(
        '0x' + balance.toString(16).padStart(64, '0')
      );

      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      const result = await contract.getBalance(mockAccount.address);
      expect(result).toBe(balance);
    });
  });

  describe('getAllowance', () => {
    it('should return allowance for TokenMessenger', async () => {
      const allowance = 500000n; // 0.5 USDC
      mockRpc.call.mockResolvedValue(
        '0x' + allowance.toString(16).padStart(64, '0')
      );

      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      const result = await contract.getAllowance(mockAccount.address);
      expect(result).toBe(allowance);
    });
  });

  describe('approve', () => {
    it('should approve USDC spending', async () => {
      const txHash = '0xapprovehash' as Hash;
      mockRpc.waitForTransaction.mockResolvedValue({
        status: 'success',
        transactionHash: txHash,
        gasUsed: 50000n,
        logs: [],
        blockNumber: 12345,
        transactionIndex: 0,
        blockHash: '0xblockhash' as Hex,
        from: mockAccount.address,
        cumulativeGasUsed: 50000n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x' as Hex,
        type: 'eip1559',
      });

      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      const result = await contract.approve(1000000n);
      expect(result).toBe(txHash);
    });

    it('should throw if approve transaction reverts', async () => {
      mockRpc.waitForTransaction.mockResolvedValue({
        status: 'reverted',
        transactionHash: '0xfailed' as Hash,
        gasUsed: 50000n,
        logs: [],
        blockNumber: 12345,
        transactionIndex: 0,
        blockHash: '0xblockhash' as Hex,
        from: mockAccount.address,
        cumulativeGasUsed: 50000n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x' as Hex,
        type: 'eip1559',
      });

      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      await expect(contract.approve(1000000n)).rejects.toThrow(
        'USDC approve transaction reverted'
      );
    });
  });

  describe('depositForBurn', () => {
    it('should execute depositForBurn and return result', async () => {
      // Create a realistic MessageSent event log
      const messageSentTopic = keccak256(
        new TextEncoder().encode('MessageSent(bytes)')
      );

      // Build a realistic CCTP message
      // Header: version(4) + sourceDomain(4) + destDomain(4) + nonce(8) + sender(32) + recipient(32) + destCaller(32)
      const version = new Uint8Array([0, 0, 0, 0]);
      const sourceDomain = new Uint8Array([0, 0, 0, 0]); // Ethereum = 0
      const destDomain = new Uint8Array([0, 0, 0, 3]); // Arbitrum = 3
      const nonce = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 42]); // nonce = 42
      const sender = new Uint8Array(32).fill(0);
      const recipient = new Uint8Array(32).fill(0);
      recipient.set(
        [0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56, 0x78, 0x90],
        22
      );
      const destCaller = new Uint8Array(32).fill(0);

      // Message body (BurnMessage)
      const bodyVersion = new Uint8Array([0, 0, 0, 0]);
      const burnToken = new Uint8Array(32).fill(0);
      const mintRecipient = new Uint8Array(32).fill(0);
      const amount = new Uint8Array(32).fill(0);
      amount.set([0x0f, 0x42, 0x40], 29); // 1000000 = 0x0F4240
      const messageSender = new Uint8Array(32).fill(0);

      const messageBytes = new Uint8Array([
        ...version,
        ...sourceDomain,
        ...destDomain,
        ...nonce,
        ...sender,
        ...recipient,
        ...destCaller,
        ...bodyVersion,
        ...burnToken,
        ...mintRecipient,
        ...amount,
        ...messageSender,
      ]);

      // ABI encode the message for the event data
      const offset = new Uint8Array(32).fill(0);
      offset[31] = 32; // offset = 32
      const length = new Uint8Array(32).fill(0);
      length[31] = messageBytes.length;

      // Pad message to 32-byte boundary
      const paddedLength = Math.ceil(messageBytes.length / 32) * 32;
      const paddedMessage = new Uint8Array(paddedLength);
      paddedMessage.set(messageBytes);

      const eventData = new Uint8Array([...offset, ...length, ...paddedMessage]);

      const logs: Log[] = [
        {
          address: cctpConfig.messageTransmitter,
          topics: [messageSentTopic],
          data: bytesToHex(eventData),
          blockNumber: 12345,
          transactionHash: '0xhash' as Hash,
          transactionIndex: 0,
          blockHash: '0xblockhash' as Hex,
          logIndex: 0,
          removed: false,
        },
      ];

      mockRpc.waitForTransaction.mockResolvedValue({
        status: 'success',
        transactionHash: '0xdepositHash' as Hash,
        gasUsed: 100000n,
        logs,
        blockNumber: 12345,
        transactionIndex: 0,
        blockHash: '0xblockhash' as Hex,
        from: mockAccount.address,
        cumulativeGasUsed: 100000n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x' as Hex,
        type: 'eip1559',
      });

      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      const result = await contract.depositForBurn({
        amount: 1000000n,
        destinationDomain: 3,
        mintRecipient: '0x1234567890123456789012345678901234567890' as Address,
        burnToken: cctpConfig.usdc,
      });

      expect(result.hash).toBe('0xdepositHash');
      expect(result.nonce).toBe(42n);
      expect(result.messageBytes).toBeDefined();
      expect(result.messageHash).toBeDefined();
    });

    it('should throw if transaction reverts', async () => {
      mockRpc.waitForTransaction.mockResolvedValue({
        status: 'reverted',
        transactionHash: '0xfailed' as Hash,
        gasUsed: 100000n,
        logs: [],
        blockNumber: 12345,
        transactionIndex: 0,
        blockHash: '0xblockhash' as Hex,
        from: mockAccount.address,
        cumulativeGasUsed: 100000n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x' as Hex,
        type: 'eip1559',
      });

      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      await expect(
        contract.depositForBurn({
          amount: 1000000n,
          destinationDomain: 3,
          mintRecipient: '0x1234567890123456789012345678901234567890' as Address,
          burnToken: cctpConfig.usdc,
        })
      ).rejects.toThrow('depositForBurn transaction reverted');
    });

    it('should throw if MessageSent event not found', async () => {
      mockRpc.waitForTransaction.mockResolvedValue({
        status: 'success',
        transactionHash: '0xhash' as Hash,
        gasUsed: 100000n,
        logs: [], // No logs
        blockNumber: 12345,
        transactionIndex: 0,
        blockHash: '0xblockhash' as Hex,
        from: mockAccount.address,
        cumulativeGasUsed: 100000n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x' as Hex,
        type: 'eip1559',
      });

      const contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      await expect(
        contract.depositForBurn({
          amount: 1000000n,
          destinationDomain: 3,
          mintRecipient: '0x1234567890123456789012345678901234567890' as Address,
          burnToken: cctpConfig.usdc,
        })
      ).rejects.toThrow('Failed to parse DepositForBurn events');
    });
  });

  describe('ABI exports', () => {
    it('should export TOKEN_MESSENGER_ABI', () => {
      expect(TOKEN_MESSENGER_ABI).toBeDefined();
      expect(Array.isArray(TOKEN_MESSENGER_ABI)).toBe(true);

      const depositForBurn = TOKEN_MESSENGER_ABI.find(
        (item) => item.type === 'function' && item.name === 'depositForBurn'
      );
      expect(depositForBurn).toBeDefined();
    });

    it('should export MESSAGE_SENT_ABI', () => {
      expect(MESSAGE_SENT_ABI).toBeDefined();
      expect(Array.isArray(MESSAGE_SENT_ABI)).toBe(true);

      const messageSent = MESSAGE_SENT_ABI.find(
        (item) => item.type === 'event' && item.name === 'MessageSent'
      );
      expect(messageSent).toBeDefined();
    });
  });
});

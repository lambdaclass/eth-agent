import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenMessengerContract } from '../../../src/bridge/cctp/token-messenger.js';
import type { Address, Hash, Hex, Log } from '../../../src/core/types.js';
import { keccak256 } from '../../../src/core/hash.js';

// Mock Contract module
vi.mock('../../../src/protocol/contract.js', () => ({
  Contract: vi.fn().mockImplementation((config: { address: string }) => ({
    address: config.address,
    read: vi.fn().mockResolvedValue(0n),
    write: vi.fn().mockResolvedValue({
      wait: vi.fn().mockResolvedValue({
        status: 'success',
        hash: '0xhash' as Hash,
        logs: [],
      }),
    }),
  })),
  ERC20_ABI: [],
}));

// Mock the Contract class for different scenarios
const createMockContract = (overrides: Record<string, unknown> = {}) => ({
  read: vi.fn().mockResolvedValue(1000000000n),
  write: vi.fn().mockResolvedValue({
    wait: vi.fn().mockResolvedValue({
      status: 'success',
      hash: '0xmockhash' as Hash,
      logs: [],
    }),
  }),
  ...overrides,
});

// Create a minimal mock RPC that satisfies the Contract requirements
const createMockRpc = () => ({
  getChainId: vi.fn().mockResolvedValue(1),
  call: vi.fn().mockResolvedValue('0x'),
  sendRawTransaction: vi.fn().mockResolvedValue('0xhash' as Hash),
  waitForTransaction: vi.fn().mockResolvedValue({ status: 'success' }),
  getTransactionCount: vi.fn().mockResolvedValue(0),
  estimateGas: vi.fn().mockResolvedValue(100000n),
  getGasPrice: vi.fn().mockResolvedValue(1000000000n),
  getMaxPriorityFeePerGas: vi.fn().mockResolvedValue(1000000000n),
  getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1000000000n }),
});

// Create a minimal mock account
const createMockAccount = () => ({
  address: '0x1234567890123456789012345678901234567890' as Address,
  sign: vi.fn(),
  signMessage: vi.fn(),
  signTypedData: vi.fn(),
});

// Create a mock CCTP config
const createMockCCTPConfig = () => ({
  chainId: 1,
  domain: 0,
  tokenMessenger: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155' as Address,
  messageTransmitter: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81' as Address,
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
});

describe('TokenMessengerContract', () => {
  let contract: TokenMessengerContract;
  let mockRpc: ReturnType<typeof createMockRpc>;
  let mockAccount: ReturnType<typeof createMockAccount>;
  let mockConfig: ReturnType<typeof createMockCCTPConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = createMockRpc();
    mockAccount = createMockAccount();
    mockConfig = createMockCCTPConfig();
  });

  describe('constructor', () => {
    it('should create contract instance', () => {
      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      expect(contract).toBeDefined();
    });
  });

  describe('depositForBurn', () => {
    it('should throw when transaction reverts', async () => {
      // Create mock that returns reverted status
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 'reverted',
            hash: '0xfailed' as Hash,
            logs: [],
          }),
        }),
      }) as any);

      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      await expect(
        contract.depositForBurn({
          amount: 100000000n,
          destinationDomain: 3,
          mintRecipient: '0xrecipient' as Address,
          burnToken: mockConfig.usdc,
        })
      ).rejects.toThrow('depositForBurn transaction reverted');
    });

    it('should throw when MessageSent event not found', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 'success',
            hash: '0xhash' as Hash,
            logs: [], // Empty logs = no MessageSent event
          }),
        }),
      }) as any);

      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      await expect(
        contract.depositForBurn({
          amount: 100000000n,
          destinationDomain: 3,
          mintRecipient: '0xabcdef1234567890abcdef1234567890abcdef12' as Address,
          burnToken: mockConfig.usdc,
        })
      ).rejects.toThrow('Failed to parse DepositForBurn events');
    });

    it('should parse MessageSent event and return result', async () => {
      // Create a valid message bytes structure
      // Header: version(4) + sourceDomain(4) + destDomain(4) + nonce(8) + sender(32) + recipient(32) + destCaller(32) = 116 bytes
      const version = '00000000';
      const sourceDomain = '00000000';
      const destDomain = '00000003';
      const nonce = '0000000000000005'; // nonce = 5
      const sender = '0000000000000000000000001234567890123456789012345678901234567890';
      const recipient = '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12';
      const destCaller = '0000000000000000000000000000000000000000000000000000000000000000';
      // Body for burn message
      const bodyVersion = '00000000';
      const burnToken = '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const mintRecipient = '000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const amount = '0000000000000000000000000000000000000000000000000000000005f5e100';
      const messageSender = '0000000000000000000000001234567890123456789012345678901234567890';

      const messageHex = `${version}${sourceDomain}${destDomain}${nonce}${sender}${recipient}${destCaller}${bodyVersion}${burnToken}${mintRecipient}${amount}${messageSender}`;
      const messageBytes = Buffer.from(messageHex, 'hex');

      // ABI encode the bytes: offset (32 bytes) + length (32 bytes) + data
      const offset = '0000000000000000000000000000000000000000000000000000000000000020'; // 32
      const length = messageBytes.length.toString(16).padStart(64, '0');
      // Pad message to 32-byte boundary
      const paddedMessage = messageHex + '0'.repeat((32 - (messageBytes.length % 32)) % 32 * 2);
      const eventData = `0x${offset}${length}${paddedMessage}`;

      // Calculate MessageSent topic
      const messageSentTopic = keccak256(new TextEncoder().encode('MessageSent(bytes)'));

      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 'success',
            hash: '0xsuccesshash' as Hash,
            logs: [
              {
                address: mockConfig.messageTransmitter,
                topics: [messageSentTopic],
                data: eventData as Hex,
              } as Log,
            ],
          }),
        }),
      }) as any);

      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      const result = await contract.depositForBurn({
        amount: 100000000n,
        destinationDomain: 3,
        mintRecipient: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address,
        burnToken: mockConfig.usdc,
      });

      expect(result.hash).toBe('0xsuccesshash');
      expect(result.nonce).toBe(5n);
      expect(result.messageBytes).toBeDefined();
      expect(result.messageHash).toBeDefined();
    });
  });

  describe('getAllowance', () => {
    it('should return allowance from USDC contract', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn().mockResolvedValue(500000000n),
      }) as any);

      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      const allowance = await contract.getAllowance(mockAccount.address);
      expect(allowance).toBe(500000000n);
    });
  });

  describe('approve', () => {
    it('should approve USDC spending and return hash', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 'success',
            hash: '0xapprovehash' as Hash,
          }),
        }),
      }) as any);

      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      const hash = await contract.approve(1000000000n);
      expect(hash).toBe('0xapprovehash');
    });

    it('should throw when approve transaction reverts', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 'reverted',
            hash: '0xfailed' as Hash,
          }),
        }),
      }) as any);

      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      await expect(contract.approve(1000000000n)).rejects.toThrow(
        'USDC approve transaction reverted'
      );
    });
  });

  describe('getBalance', () => {
    it('should return balance from USDC contract', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn().mockResolvedValue(250000000n),
      }) as any);

      contract = new TokenMessengerContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      const balance = await contract.getBalance(mockAccount.address);
      expect(balance).toBe(250000000n);
    });
  });
});

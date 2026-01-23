import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageTransmitterContract } from '../../../src/bridge/cctp/message-transmitter.js';
import type { Address, Hash, Hex } from '../../../src/core/types.js';

// Mock Contract module
vi.mock('../../../src/protocol/contract.js', () => ({
  Contract: vi.fn().mockImplementation(() => ({
    read: vi.fn().mockResolvedValue(0n),
    write: vi.fn().mockResolvedValue({
      wait: vi.fn().mockResolvedValue({
        status: 'success',
        hash: '0xhash' as Hash,
      }),
    }),
  })),
}));

// Create minimal mock RPC
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

// Create minimal mock account
const createMockAccount = () => ({
  address: '0x1234567890123456789012345678901234567890' as Address,
  sign: vi.fn(),
  signMessage: vi.fn(),
  signTypedData: vi.fn(),
});

// Create mock CCTP config
const createMockCCTPConfig = () => ({
  chainId: 1,
  domain: 0,
  tokenMessenger: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155' as Address,
  messageTransmitter: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81' as Address,
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
});

describe('MessageTransmitterContract', () => {
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
    it('should create contract without account', () => {
      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig: mockConfig,
      });

      expect(contract).toBeDefined();
    });

    it('should create contract with account', () => {
      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      expect(contract).toBeDefined();
    });
  });

  describe('receiveMessage', () => {
    it('should throw when no account is provided', async () => {
      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig: mockConfig,
      });

      await expect(
        contract.receiveMessage('0xmessage' as Hex, '0xattestation' as Hex)
      ).rejects.toThrow('Account required for receiveMessage');
    });

    it('should call receiveMessage and return result', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn(),
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 'success',
            hash: '0xreceivehash' as Hash,
          }),
        }),
      }) as any);

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      const result = await contract.receiveMessage('0xmessage' as Hex, '0xattestation' as Hex);

      expect(result.hash).toBe('0xreceivehash');
      expect(result.success).toBe(true);
    });

    it('should return success=false when transaction reverts', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn(),
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({
            status: 'reverted',
            hash: '0xfailedhash' as Hash,
          }),
        }),
      }) as any);

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      const result = await contract.receiveMessage('0xmessage' as Hex, '0xattestation' as Hex);

      expect(result.hash).toBe('0xfailedhash');
      expect(result.success).toBe(false);
    });
  });

  describe('isNonceUsed', () => {
    it('should return false when nonce is not used', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn().mockResolvedValue(0n),
        write: vi.fn(),
      }) as any);

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig: mockConfig,
      });

      const isUsed = await contract.isNonceUsed(0, 1n);
      expect(isUsed).toBe(false);
    });

    it('should return true when nonce is used', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn().mockResolvedValue(1n),
        write: vi.fn(),
      }) as any);

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig: mockConfig,
      });

      const isUsed = await contract.isNonceUsed(0, 1n);
      expect(isUsed).toBe(true);
    });

    it('should handle large nonce values', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn().mockResolvedValue(0n),
        write: vi.fn(),
      }) as any);

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig: mockConfig,
      });

      // Test with a large nonce that uses both high and low 32-bit parts
      const largeNonce = 0x1ffffffffn;
      const isUsed = await contract.isNonceUsed(3, largeNonce);
      expect(isUsed).toBe(false);
    });
  });

  describe('getLocalDomain', () => {
    it('should return local domain', async () => {
      const { Contract } = await import('../../../src/protocol/contract.js');
      vi.mocked(Contract).mockImplementation(() => ({
        read: vi.fn().mockResolvedValue(0),
        write: vi.fn(),
      }) as any);

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig: mockConfig,
      });

      const domain = await contract.getLocalDomain();
      expect(domain).toBe(0);
    });
  });

  describe('forChain static method', () => {
    it('should create a MessageTransmitter instance', () => {
      const contract = MessageTransmitterContract.forChain({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig: mockConfig,
      });

      expect(contract).toBeInstanceOf(MessageTransmitterContract);
    });

    it('should create a MessageTransmitter instance without account', () => {
      const contract = MessageTransmitterContract.forChain({
        rpc: mockRpc as any,
        cctpConfig: mockConfig,
      });

      expect(contract).toBeInstanceOf(MessageTransmitterContract);
    });
  });
});

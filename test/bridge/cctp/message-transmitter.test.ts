import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MessageTransmitterContract,
  MESSAGE_TRANSMITTER_ABI,
  decodeMessageHeader,
  decodeBurnMessageBody,
} from '../../../src/bridge/cctp/message-transmitter.js';
import { CCTP_CONTRACTS } from '../../../src/bridge/constants.js';
import type { Address, Hash, Hex } from '../../../src/core/types.js';
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

/**
 * Build a realistic CCTP message for testing
 */
function buildTestMessage(options: {
  version?: number;
  sourceDomain?: number;
  destDomain?: number;
  nonce?: bigint;
  sender?: Address;
  recipient?: Address;
  burnToken?: Address;
  mintRecipient?: Address;
  amount?: bigint;
  messageSender?: Address;
}): Hex {
  const {
    version = 0,
    sourceDomain = 0,
    destDomain = 3,
    nonce = 42n,
    sender = '0x0000000000000000000000000000000000000001' as Address,
    recipient = '0x0000000000000000000000000000000000000002' as Address,
    burnToken = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
    mintRecipient = '0x1234567890123456789012345678901234567890' as Address,
    amount = 1000000n,
    messageSender = '0x0000000000000000000000000000000000000003' as Address,
  } = options;

  // Header: version(4) + sourceDomain(4) + destDomain(4) + nonce(8) + sender(32) + recipient(32) + destCaller(32)
  const header = new Uint8Array(116);
  const headerView = new DataView(header.buffer);

  // version (4 bytes)
  headerView.setUint32(0, version, false);
  // sourceDomain (4 bytes)
  headerView.setUint32(4, sourceDomain, false);
  // destDomain (4 bytes)
  headerView.setUint32(8, destDomain, false);
  // nonce (8 bytes)
  headerView.setUint32(12, Number(nonce >> 32n), false);
  headerView.setUint32(16, Number(nonce & 0xffffffffn), false);

  // sender (32 bytes) - address left-padded
  const senderBytes = hexToBytes(sender);
  header.set(senderBytes, 20 + (32 - senderBytes.length));

  // recipient (32 bytes)
  const recipientBytes = hexToBytes(recipient);
  header.set(recipientBytes, 52 + (32 - recipientBytes.length));

  // destCaller (32 bytes) - zeros
  // Already zeros

  // BurnMessage body: version(4) + burnToken(32) + mintRecipient(32) + amount(32) + messageSender(32) = 132 bytes
  const body = new Uint8Array(132);
  const bodyView = new DataView(body.buffer);

  // body version (4 bytes)
  bodyView.setUint32(0, 0, false);

  // burnToken (32 bytes)
  const burnTokenBytes = hexToBytes(burnToken);
  body.set(burnTokenBytes, 4 + (32 - burnTokenBytes.length));

  // mintRecipient (32 bytes)
  const mintRecipientBytes = hexToBytes(mintRecipient);
  body.set(mintRecipientBytes, 36 + (32 - mintRecipientBytes.length));

  // amount (32 bytes)
  const amountHex = amount.toString(16).padStart(64, '0');
  for (let i = 0; i < 32; i++) {
    body[68 + i] = parseInt(amountHex.slice(i * 2, i * 2 + 2), 16);
  }

  // messageSender (32 bytes)
  const msgSenderBytes = hexToBytes(messageSender);
  body.set(msgSenderBytes, 100 + (32 - msgSenderBytes.length));

  const message = new Uint8Array(header.length + body.length);
  message.set(header);
  message.set(body, header.length);

  return bytesToHex(message);
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

describe('MessageTransmitterContract', () => {
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
    it('should create contract with account', () => {
      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      expect(contract).toBeDefined();
    });

    it('should create contract without account for read-only operations', () => {
      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig,
      });

      expect(contract).toBeDefined();
    });
  });

  describe('receiveMessage', () => {
    it('should execute receiveMessage and return result', async () => {
      mockRpc.waitForTransaction.mockResolvedValue({
        status: 'success',
        transactionHash: '0xminthash' as Hash,
        gasUsed: 150000n,
        logs: [],
        blockNumber: 12345,
        transactionIndex: 0,
        blockHash: '0xblockhash' as Hex,
        from: mockAccount.address,
        cumulativeGasUsed: 150000n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x' as Hex,
        type: 'eip1559',
      });

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      const messageBytes = buildTestMessage({});
      const attestation = '0xattestationsignature' as Hex;

      const result = await contract.receiveMessage(messageBytes, attestation);

      expect(result.hash).toBe('0xminthash');
      expect(result.success).toBe(true);
    });

    it('should return success false for reverted transaction', async () => {
      mockRpc.waitForTransaction.mockResolvedValue({
        status: 'reverted',
        transactionHash: '0xfailed' as Hash,
        gasUsed: 150000n,
        logs: [],
        blockNumber: 12345,
        transactionIndex: 0,
        blockHash: '0xblockhash' as Hex,
        from: mockAccount.address,
        cumulativeGasUsed: 150000n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x' as Hex,
        type: 'eip1559',
      });

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      const messageBytes = buildTestMessage({});
      const attestation = '0xattestationsignature' as Hex;

      const result = await contract.receiveMessage(messageBytes, attestation);

      expect(result.success).toBe(false);
    });

    it('should throw if no account provided', async () => {
      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig,
      });

      const messageBytes = buildTestMessage({});
      const attestation = '0xattestationsignature' as Hex;

      await expect(
        contract.receiveMessage(messageBytes, attestation)
      ).rejects.toThrow('Account required for receiveMessage');
    });
  });

  describe('isNonceUsed', () => {
    it('should return true if nonce is used', async () => {
      mockRpc.call.mockResolvedValue(
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      );

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig,
      });

      const result = await contract.isNonceUsed(0, 42n);
      expect(result).toBe(true);
    });

    it('should return false if nonce is not used', async () => {
      mockRpc.call.mockResolvedValue(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig,
      });

      const result = await contract.isNonceUsed(0, 42n);
      expect(result).toBe(false);
    });
  });

  describe('getLocalDomain', () => {
    it('should return the local domain', async () => {
      mockRpc.call.mockResolvedValue(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );

      const contract = new MessageTransmitterContract({
        rpc: mockRpc as any,
        cctpConfig,
      });

      const result = await contract.getLocalDomain();
      // Contract.read returns bigint for uint32 types, so we accept either
      expect(typeof result === 'number' || typeof result === 'bigint').toBe(true);
    });
  });

  describe('forChain static method', () => {
    it('should create a MessageTransmitterContract', () => {
      const contract = MessageTransmitterContract.forChain({
        rpc: mockRpc as any,
        account: mockAccount as any,
        cctpConfig,
      });

      expect(contract).toBeInstanceOf(MessageTransmitterContract);
    });
  });

  describe('ABI export', () => {
    it('should export MESSAGE_TRANSMITTER_ABI', () => {
      expect(MESSAGE_TRANSMITTER_ABI).toBeDefined();
      expect(Array.isArray(MESSAGE_TRANSMITTER_ABI)).toBe(true);

      const receiveMessage = MESSAGE_TRANSMITTER_ABI.find(
        (item) => item.type === 'function' && item.name === 'receiveMessage'
      );
      expect(receiveMessage).toBeDefined();

      const usedNonces = MESSAGE_TRANSMITTER_ABI.find(
        (item) => item.type === 'function' && item.name === 'usedNonces'
      );
      expect(usedNonces).toBeDefined();
    });
  });
});

describe('decodeMessageHeader', () => {
  it('should decode message header correctly', () => {
    const messageBytes = buildTestMessage({
      version: 0,
      sourceDomain: 0,
      destDomain: 3,
      nonce: 12345n,
    });

    const header = decodeMessageHeader(messageBytes);

    expect(header.version).toBe(0);
    expect(header.sourceDomain).toBe(0);
    expect(header.destinationDomain).toBe(3);
    expect(header.nonce).toBe(12345n);
    expect(header.sender).toBeDefined();
    expect(header.recipient).toBeDefined();
  });

  it('should handle large nonce values', () => {
    const largeNonce = 0x123456789abcn;
    const messageBytes = buildTestMessage({ nonce: largeNonce });

    const header = decodeMessageHeader(messageBytes);

    expect(header.nonce).toBe(largeNonce);
  });

  it('should extract sender and recipient', () => {
    const sender = '0x1111111111111111111111111111111111111111' as Address;
    const recipient = '0x2222222222222222222222222222222222222222' as Address;

    const messageBytes = buildTestMessage({ sender, recipient });

    const header = decodeMessageHeader(messageBytes);

    // The addresses are stored as bytes32, left-padded
    expect(header.sender).toContain('1111111111111111111111111111111111111111');
    expect(header.recipient).toContain('2222222222222222222222222222222222222222');
  });
});

describe('decodeBurnMessageBody', () => {
  it('should decode burn message body correctly', () => {
    const burnToken = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
    const mintRecipient = '0x1234567890123456789012345678901234567890' as Address;
    const amount = 1000000n;
    const messageSender = '0xabcdef1234567890abcdef1234567890abcdef12' as Address;

    const messageBytes = buildTestMessage({
      burnToken,
      mintRecipient,
      amount,
      messageSender,
    });

    const body = decodeBurnMessageBody(messageBytes);

    expect(body.amount).toBe(amount);
    // Check that addresses are extracted (case-insensitive comparison)
    expect(body.burnToken.toLowerCase()).toContain(
      burnToken.slice(2).toLowerCase()
    );
    expect(body.mintRecipient.toLowerCase()).toContain(
      mintRecipient.slice(2).toLowerCase()
    );
    expect(body.messageSender.toLowerCase()).toContain(
      messageSender.slice(2).toLowerCase()
    );
  });

  it('should handle different amounts', () => {
    const smallAmount = 1n;
    const largeAmount = 1000000000000n; // 1M USDC

    const smallMessage = buildTestMessage({ amount: smallAmount });
    const largeMessage = buildTestMessage({ amount: largeAmount });

    expect(decodeBurnMessageBody(smallMessage).amount).toBe(smallAmount);
    expect(decodeBurnMessageBody(largeMessage).amount).toBe(largeAmount);
  });

  it('should extract mint recipient for address conversion', () => {
    const mintRecipient = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address;
    const messageBytes = buildTestMessage({ mintRecipient });

    const body = decodeBurnMessageBody(messageBytes);

    // The last 40 chars should be the address
    expect(body.mintRecipient.toLowerCase()).toContain('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  });
});

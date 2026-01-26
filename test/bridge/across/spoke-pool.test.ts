/**
 * SpokePool contract tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SpokePoolContract,
  createSpokePoolContract,
  SPOKE_POOL_ABI,
  V3_FUNDS_DEPOSITED_EVENT,
} from '../../../src/bridge/across/spoke-pool.js';
import type { Address, Hex } from '../../../src/core/types.js';

// Mock RPC client
const createMockRpc = () => ({
  call: vi.fn(),
  getTransactionCount: vi.fn().mockResolvedValue(5),
  getChainId: vi.fn().mockResolvedValue(1),
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

const SPOKE_POOL_ADDRESS = '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5' as Address;

// Helper to generate valid timestamps for tests
const getValidTimestamps = () => {
  const now = Math.floor(Date.now() / 1000);
  return {
    quoteTimestamp: now - 10, // 10 seconds ago (valid, recent)
    fillDeadline: now + 18000, // 5 hours in the future
    exclusivityDeadline: now + 300, // 5 minutes in the future
  };
};

describe('SpokePool', () => {
  let mockRpc: ReturnType<typeof createMockRpc>;
  let mockAccount: ReturnType<typeof createMockAccount>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = createMockRpc();
    mockAccount = createMockAccount();
  });

  describe('SPOKE_POOL_ABI', () => {
    it('should have depositV3 function definition', () => {
      const depositV3 = SPOKE_POOL_ABI.find((item) => item.name === 'depositV3');
      expect(depositV3).toBeDefined();
      expect(depositV3?.type).toBe('function');
      expect(depositV3?.inputs).toHaveLength(12);
    });

    it('should have getCurrentTime function definition', () => {
      const getCurrentTime = SPOKE_POOL_ABI.find((item) => item.name === 'getCurrentTime');
      expect(getCurrentTime).toBeDefined();
      expect(getCurrentTime?.stateMutability).toBe('view');
    });

    it('should have numberOfDeposits function definition', () => {
      const numberOfDeposits = SPOKE_POOL_ABI.find((item) => item.name === 'numberOfDeposits');
      expect(numberOfDeposits).toBeDefined();
      expect(numberOfDeposits?.outputs?.[0]?.type).toBe('uint32');
    });
  });

  describe('V3_FUNDS_DEPOSITED_EVENT', () => {
    it('should have correct event structure', () => {
      expect(V3_FUNDS_DEPOSITED_EVENT.name).toBe('V3FundsDeposited');
      expect(V3_FUNDS_DEPOSITED_EVENT.type).toBe('event');
      expect(V3_FUNDS_DEPOSITED_EVENT.inputs).toHaveLength(13);
    });

    it('should have indexed parameters', () => {
      const indexed = V3_FUNDS_DEPOSITED_EVENT.inputs.filter((i) => i.indexed);
      expect(indexed).toHaveLength(3); // destinationChainId, depositId, depositor
    });
  });

  describe('SpokePoolContract', () => {
    describe('constructor', () => {
      it('should create instance with config', () => {
        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        expect(contract).toBeInstanceOf(SpokePoolContract);
        expect(contract.spokePoolAddress).toBe(SPOKE_POOL_ADDRESS);
      });
    });

    describe('getCurrentTime', () => {
      it('should return current time from contract', async () => {
        // Return timestamp in hex (1704067200 = 2024-01-01 00:00:00 UTC = 0x65920080)
        mockRpc.call.mockResolvedValueOnce('0x65920080');

        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const time = await contract.getCurrentTime();

        expect(mockRpc.call).toHaveBeenCalledWith({
          to: SPOKE_POOL_ADDRESS,
          data: '0x29cb924d', // getCurrentTime() selector
        });
        expect(time).toBe(1704067200);
      });
    });

    describe('getNumberOfDeposits', () => {
      it('should return number of deposits from contract', async () => {
        // Return 42 in hex
        mockRpc.call.mockResolvedValueOnce('0x2a');

        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const count = await contract.getNumberOfDeposits();

        expect(mockRpc.call).toHaveBeenCalledWith({
          to: SPOKE_POOL_ADDRESS,
          data: '0xda7c8ff3', // numberOfDeposits() selector
        });
        expect(count).toBe(42);
      });
    });

    describe('depositV3', () => {
      it('should execute deposit with EIP-1559 gas', async () => {
        // Mock receipt with deposit event
        const depositEventTopic = '0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3';
        mockRpc.waitForTransaction.mockResolvedValueOnce({
          transactionHash: '0xabcd1234' as Hex,
          blockNumber: 12345678,
          gasUsed: 180000n,
          status: 'success' as const,
          logs: [
            {
              address: SPOKE_POOL_ADDRESS,
              topics: [
                depositEventTopic,
                '0x000000000000000000000000000000000000000000000000000000000000a4b1', // destChainId 42161
                '0x000000000000000000000000000000000000000000000000000000000000007b', // depositId 123
                '0x0000000000000000000000001234567890123456789012345678901234567890', // depositor
              ] as Hex[],
              data: createMockEventData(),
            },
          ],
        });

        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const timestamps = getValidTimestamps();
        const result = await contract.depositV3({
          depositor: '0x1234567890123456789012345678901234567890' as Address,
          recipient: '0x2345678901234567890123456789012345678901' as Address,
          inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          inputAmount: 100000000n, // 100 USDC
          outputAmount: 99500000n, // 99.5 USDC after fees
          destinationChainId: 42161,
          quoteTimestamp: timestamps.quoteTimestamp,
          fillDeadline: timestamps.fillDeadline,
        });

        expect(result.txHash).toBe('0xabcd1234');
        expect(result.depositId).toBe(123);
        expect(result.blockNumber).toBe(12345678);
        expect(result.sourceChainId).toBe(1);
        expect(result.destinationChainId).toBe(42161);
        expect(mockRpc.sendRawTransaction).toHaveBeenCalled();
      });

      it('should handle legacy gas pricing', async () => {
        // Mock to return only gasPrice (no EIP-1559)
        mockRpc.getBlock.mockResolvedValueOnce({ baseFeePerGas: undefined });
        mockRpc.getFeeHistory.mockRejectedValueOnce(new Error('Not supported'));

        mockRpc.waitForTransaction.mockResolvedValueOnce({
          transactionHash: '0xabcd1234' as Hex,
          blockNumber: 12345678,
          gasUsed: 180000n,
          status: 'success' as const,
          logs: [],
        });

        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const timestamps = getValidTimestamps();
        const result = await contract.depositV3({
          depositor: '0x1234567890123456789012345678901234567890' as Address,
          recipient: '0x2345678901234567890123456789012345678901' as Address,
          inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          inputAmount: 100000000n,
          outputAmount: 99500000n,
          destinationChainId: 42161,
          quoteTimestamp: timestamps.quoteTimestamp,
          fillDeadline: timestamps.fillDeadline,
        });

        expect(result.txHash).toBe('0xabcd1234');
        expect(result.depositId).toBe(0); // No event found
      });

      it('should use optional parameters when provided', async () => {
        mockRpc.waitForTransaction.mockResolvedValueOnce({
          transactionHash: '0xabcd1234' as Hex,
          blockNumber: 12345678,
          gasUsed: 180000n,
          status: 'success' as const,
          logs: [],
        });

        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const timestamps = getValidTimestamps();
        await contract.depositV3({
          depositor: '0x1234567890123456789012345678901234567890' as Address,
          recipient: '0x2345678901234567890123456789012345678901' as Address,
          inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          inputAmount: 100000000n,
          outputAmount: 99500000n,
          destinationChainId: 42161,
          quoteTimestamp: timestamps.quoteTimestamp,
          fillDeadline: timestamps.fillDeadline,
          exclusiveRelayer: '0x9999999999999999999999999999999999999999' as Address,
          exclusivityDeadline: timestamps.exclusivityDeadline,
          message: '0xdeadbeef' as Hex,
        });

        expect(mockRpc.sendRawTransaction).toHaveBeenCalled();
      });

      it('should reject fillDeadline in the past', async () => {
        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const now = Math.floor(Date.now() / 1000);
        await expect(
          contract.depositV3({
            depositor: '0x1234567890123456789012345678901234567890' as Address,
            recipient: '0x2345678901234567890123456789012345678901' as Address,
            inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
            outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
            inputAmount: 100000000n,
            outputAmount: 99500000n,
            destinationChainId: 42161,
            quoteTimestamp: now - 10,
            fillDeadline: now - 100, // In the past
          })
        ).rejects.toThrow('fillDeadline');
      });

      it('should reject stale quoteTimestamp', async () => {
        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const now = Math.floor(Date.now() / 1000);
        await expect(
          contract.depositV3({
            depositor: '0x1234567890123456789012345678901234567890' as Address,
            recipient: '0x2345678901234567890123456789012345678901' as Address,
            inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
            outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
            inputAmount: 100000000n,
            outputAmount: 99500000n,
            destinationChainId: 42161,
            quoteTimestamp: now - 600, // 10 minutes ago (stale)
            fillDeadline: now + 18000,
          })
        ).rejects.toThrow('stale');
      });
    });

    describe('parseDepositEvent', () => {
      it('should return null for empty logs', () => {
        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const result = contract.parseDepositEvent([]);
        expect(result).toBeNull();
      });

      it('should return null for logs without matching event', () => {
        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const result = contract.parseDepositEvent([
          {
            address: SPOKE_POOL_ADDRESS,
            topics: ['0xwrongTopic'] as Hex[],
            data: '0x' as Hex,
          },
        ]);
        expect(result).toBeNull();
      });

      it('should return null for logs from different contract', () => {
        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const depositEventTopic = '0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3';

        const result = contract.parseDepositEvent([
          {
            address: '0x0000000000000000000000000000000000000001' as Address,
            topics: [depositEventTopic] as Hex[],
            data: '0x' as Hex,
          },
        ]);
        expect(result).toBeNull();
      });

      it('should decode valid deposit event', () => {
        const contract = new SpokePoolContract({
          rpc: mockRpc as any,
          account: mockAccount as any,
          spokePoolAddress: SPOKE_POOL_ADDRESS,
        });

        const depositEventTopic = '0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3';

        const result = contract.parseDepositEvent([
          {
            address: SPOKE_POOL_ADDRESS,
            topics: [
              depositEventTopic,
              '0x000000000000000000000000000000000000000000000000000000000000a4b1', // destChainId 42161
              '0x000000000000000000000000000000000000000000000000000000000000007b', // depositId 123
              '0x0000000000000000000000001234567890123456789012345678901234567890', // depositor
            ] as Hex[],
            data: createMockEventData(),
          },
        ]);

        expect(result).not.toBeNull();
        expect(result?.depositId).toBe(123);
        expect(result?.destinationChainId).toBe(42161);
        expect(result?.depositor.toLowerCase()).toContain('1234567890123456789012345678901234567890');
      });
    });
  });

  describe('createSpokePoolContract', () => {
    it('should create SpokePoolContract instance', () => {
      const contract = createSpokePoolContract({
        rpc: mockRpc as any,
        account: mockAccount as any,
        spokePoolAddress: SPOKE_POOL_ADDRESS,
      });

      expect(contract).toBeInstanceOf(SpokePoolContract);
      expect(contract.spokePoolAddress).toBe(SPOKE_POOL_ADDRESS);
    });
  });
});

/**
 * Create mock V3FundsDeposited event data
 * Format: inputToken, outputToken, inputAmount, outputAmount, destChainId, depositId,
 *         quoteTimestamp, fillDeadline, exclusivityDeadline, depositor, recipient,
 *         exclusiveRelayer, messageOffset, messageLength, message
 */
function createMockEventData(): Hex {
  const inputToken = '000000000000000000000000A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const outputToken = '000000000000000000000000af88d065e77c8cC2239327C5EDb3A432268e5831';
  const inputAmount = '0000000000000000000000000000000000000000000000000000000005f5e100'; // 100000000
  const outputAmount = '0000000000000000000000000000000000000000000000000000000005ee5620'; // 99500000
  const destChainId = '000000000000000000000000000000000000000000000000000000000000a4b1'; // 42161
  const depositId = '000000000000000000000000000000000000000000000000000000000000007b'; // 123
  const quoteTimestamp = '0000000000000000000000000000000000000000000000000000000065918400';
  const fillDeadline = '000000000000000000000000000000000000000000000000000000006591ceb0';
  const exclusivityDeadline = '0000000000000000000000000000000000000000000000000000000000000000';
  const depositor = '0000000000000000000000001234567890123456789012345678901234567890';
  const recipient = '0000000000000000000000002345678901234567890123456789012345678901';
  const exclusiveRelayer = '0000000000000000000000000000000000000000000000000000000000000000';
  const messageOffset = '0000000000000000000000000000000000000000000000000000000000000180'; // 384
  const messageLength = '0000000000000000000000000000000000000000000000000000000000000000';

  return ('0x' +
    inputToken +
    outputToken +
    inputAmount +
    outputAmount +
    destChainId +
    depositId +
    quoteTimestamp +
    fillDeadline +
    exclusivityDeadline +
    depositor +
    recipient +
    exclusiveRelayer +
    messageOffset +
    messageLength) as Hex;
}

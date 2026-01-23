import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BundlerClient, BundlerError, createBundler, BUNDLER_URLS } from '../../src/protocol/bundler.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';
import type { UserOperation } from '../../src/protocol/userop.js';
import { createUserOp } from '../../src/protocol/userop.js';

describe('BundlerClient', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const testHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash;
  const bundlerUrl = 'https://bundler.example.com';

  let bundler: BundlerClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  const testUserOp: UserOperation = createUserOp({
    sender: testAddress,
    nonce: 0n,
    callData: '0x' as Hex,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 100000000n,
  });

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    bundler = new BundlerClient({
      url: bundlerUrl,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('uses default entry point', () => {
      const client = new BundlerClient({ url: bundlerUrl });
      expect(client).toBeInstanceOf(BundlerClient);
    });

    it('uses custom entry point', () => {
      const customEntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address;
      const client = new BundlerClient({
        url: bundlerUrl,
        entryPoint: customEntryPoint,
      });
      expect(client).toBeInstanceOf(BundlerClient);
    });

    it('uses custom timeout', () => {
      const client = new BundlerClient({
        url: bundlerUrl,
        timeout: 60000,
      });
      expect(client).toBeInstanceOf(BundlerClient);
    });
  });

  describe('sendUserOperation', () => {
    it('sends UserOperation and returns hash', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ result: testHash }),
      });

      const result = await bundler.sendUserOperation(testUserOp);

      expect(result).toBe(testHash);
      expect(mockFetch).toHaveBeenCalledWith(
        bundlerUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('throws BundlerError on error response', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          error: { code: -32000, message: 'AA21 didn\'t pay prefund' },
        }),
      });

      await expect(bundler.sendUserOperation(testUserOp))
        .rejects.toThrow(BundlerError);
    });
  });

  describe('estimateUserOperationGas', () => {
    it('returns gas estimate', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            preVerificationGas: '0x5208',
            verificationGasLimit: '0x10000',
            callGasLimit: '0x20000',
          },
        }),
      });

      const result = await bundler.estimateUserOperationGas(testUserOp);

      expect(result.preVerificationGas).toBe(21000n);
      expect(result.verificationGasLimit).toBe(65536n);
      expect(result.callGasLimit).toBe(131072n);
    });

    it('handles paymaster gas limits', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            preVerificationGas: '0x5208',
            verificationGasLimit: '0x10000',
            callGasLimit: '0x20000',
            paymasterVerificationGasLimit: '0x8000',
            paymasterPostOpGasLimit: '0x4000',
          },
        }),
      });

      const result = await bundler.estimateUserOperationGas(testUserOp);

      expect(result.paymasterVerificationGasLimit).toBe(32768n);
      expect(result.paymasterPostOpGasLimit).toBe(16384n);
    });

    it('handles missing gas values with defaults', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {},
        }),
      });

      const result = await bundler.estimateUserOperationGas(testUserOp);

      expect(result.preVerificationGas).toBe(0n);
      expect(result.verificationGasLimit).toBe(0n);
      expect(result.callGasLimit).toBe(0n);
    });
  });

  describe('getUserOperationByHash', () => {
    it('returns UserOperation details', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            userOperation: {
              sender: testAddress,
              nonce: '0x0',
              initCode: '0x',
              callData: '0x',
              callGasLimit: '0x10000',
              verificationGasLimit: '0x10000',
              preVerificationGas: '0x5208',
              maxFeePerGas: '0x3b9aca00',
              maxPriorityFeePerGas: '0x5f5e100',
              paymasterAndData: '0x',
              signature: '0x',
            },
            entryPoint: testAddress,
            blockNumber: 12345,
            blockHash: testHash,
            transactionHash: testHash,
          },
        }),
      });

      const result = await bundler.getUserOperationByHash(testHash);

      expect(result).not.toBeNull();
      expect(result?.entryPoint).toBe(testAddress);
      expect(result?.blockNumber).toBe(12345);
    });

    it('returns null for not found', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ result: null }),
      });

      const result = await bundler.getUserOperationByHash(testHash);

      expect(result).toBeNull();
    });
  });

  describe('getUserOperationReceipt', () => {
    it('returns receipt details', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            userOpHash: testHash,
            entryPoint: testAddress,
            sender: testAddress,
            nonce: '0x0',
            actualGasCost: '0x1000',
            actualGasUsed: '0x500',
            success: true,
            logs: [
              {
                address: testAddress,
                topics: ['0xabc'],
                data: '0x123',
              },
            ],
            receipt: {
              transactionHash: testHash,
              blockNumber: 12345,
              blockHash: testHash,
              gasUsed: '0x5000',
            },
          },
        }),
      });

      const result = await bundler.getUserOperationReceipt(testHash);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.logs).toHaveLength(1);
    });

    it('includes optional paymaster and reason', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            userOpHash: testHash,
            entryPoint: testAddress,
            sender: testAddress,
            nonce: '0x0',
            paymaster: testAddress,
            actualGasCost: '0x1000',
            actualGasUsed: '0x500',
            success: false,
            reason: 'AA23 reverted',
            logs: [],
            receipt: {
              transactionHash: testHash,
              blockNumber: 12345,
              blockHash: testHash,
              gasUsed: '0x5000',
            },
          },
        }),
      });

      const result = await bundler.getUserOperationReceipt(testHash);

      expect(result?.paymaster).toBe(testAddress);
      expect(result?.reason).toBe('AA23 reverted');
    });

    it('returns null for not found', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ result: null }),
      });

      const result = await bundler.getUserOperationReceipt(testHash);

      expect(result).toBeNull();
    });
  });

  describe('waitForUserOperation', () => {
    it('polls until receipt is found', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            json: () => Promise.resolve({ result: null }),
          });
        }
        return Promise.resolve({
          json: () => Promise.resolve({
            result: {
              userOpHash: testHash,
              entryPoint: testAddress,
              sender: testAddress,
              nonce: '0x0',
              actualGasCost: '0x1000',
              actualGasUsed: '0x500',
              success: true,
              logs: [],
              receipt: {
                transactionHash: testHash,
                blockNumber: 12345,
                blockHash: testHash,
                gasUsed: '0x5000',
              },
            },
          }),
        });
      });

      const result = await bundler.waitForUserOperation(testHash, {
        pollInterval: 10,
      });

      expect(result.success).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('throws on timeout', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ result: null }),
      });

      await expect(
        bundler.waitForUserOperation(testHash, {
          timeout: 50,
          pollInterval: 10,
        })
      ).rejects.toThrow('not found after');
    });
  });

  describe('getSupportedEntryPoints', () => {
    it('returns list of entry points', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: [testAddress],
        }),
      });

      const result = await bundler.getSupportedEntryPoints();

      expect(result).toEqual([testAddress]);
    });
  });

  describe('getChainId', () => {
    it('returns chain ID', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: '0x1',
        }),
      });

      const result = await bundler.getChainId();

      expect(result).toBe(1);
    });
  });

  describe('BundlerError', () => {
    it('has code and message', () => {
      const error = new BundlerError(-32000, 'AA21 error');

      expect(error.code).toBe(-32000);
      expect(error.message).toBe('AA21 error');
      expect(error.name).toBe('BundlerError');
    });
  });

  describe('BUNDLER_URLS', () => {
    it('has alchemy URLs', () => {
      expect(BUNDLER_URLS.alchemy[1]).toContain('alchemy.com');
    });

    it('has pimlico URLs', () => {
      expect(BUNDLER_URLS.pimlico[1]).toContain('pimlico.io');
    });
  });

  describe('createBundler', () => {
    it('creates bundler instance', () => {
      const client = createBundler({ url: bundlerUrl });
      expect(client).toBeInstanceOf(BundlerClient);
    });
  });
});

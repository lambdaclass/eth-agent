import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VerifyingPaymaster,
  RemotePaymaster,
  ERC20Paymaster,
  createVerifyingPaymaster,
  createRemotePaymaster,
} from '../../src/protocol/paymaster.js';
import type { Address, Hex } from '../../src/core/types.js';
import type { UserOperation } from '../../src/protocol/userop.js';
import { createUserOp } from '../../src/protocol/userop.js';

describe('VerifyingPaymaster', () => {
  const paymasterAddress = '0x1234567890123456789012345678901234567890' as Address;
  const signerKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex;
  const testAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;

  const testUserOp: UserOperation = createUserOp({
    sender: testAddress,
    nonce: 0n,
    callData: '0x' as Hex,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 100000000n,
  });

  describe('constructor', () => {
    it('creates paymaster with default validity', () => {
      const paymaster = new VerifyingPaymaster({
        address: paymasterAddress,
        signerKey,
      });

      expect(paymaster).toBeInstanceOf(VerifyingPaymaster);
    });

    it('creates paymaster with custom validity', () => {
      const paymaster = new VerifyingPaymaster({
        address: paymasterAddress,
        signerKey,
        validUntil: Math.floor(Date.now() / 1000) + 7200,
        validAfter: Math.floor(Date.now() / 1000),
      });

      expect(paymaster).toBeInstanceOf(VerifyingPaymaster);
    });
  });

  describe('getPaymasterData', () => {
    it('returns paymasterAndData with signature', async () => {
      const paymaster = new VerifyingPaymaster({
        address: paymasterAddress,
        signerKey,
      });

      const result = await paymaster.getPaymasterData(testUserOp);

      expect(result.paymasterAndData).toMatch(/^0x/);
      // Should start with paymaster address
      expect(result.paymasterAndData.toLowerCase()).toContain(
        paymasterAddress.slice(2).toLowerCase()
      );
    });
  });

  describe('getPaymasterStub', () => {
    it('returns stub with dummy signature', async () => {
      const paymaster = new VerifyingPaymaster({
        address: paymasterAddress,
        signerKey,
      });

      const result = await paymaster.getPaymasterStub(testUserOp);

      expect(result.paymasterAndData).toMatch(/^0x/);
      // Should contain ff bytes (dummy signature)
      expect(result.paymasterAndData.toLowerCase()).toContain('ff');
    });
  });

  describe('createVerifyingPaymaster', () => {
    it('creates paymaster instance', () => {
      const paymaster = createVerifyingPaymaster({
        address: paymasterAddress,
        signerKey,
      });

      expect(paymaster).toBeInstanceOf(VerifyingPaymaster);
    });
  });
});

describe('RemotePaymaster', () => {
  const paymasterUrl = 'https://paymaster.example.com';
  const entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address;
  const testAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;

  const testUserOp: UserOperation = createUserOp({
    sender: testAddress,
    nonce: 0n,
    callData: '0x' as Hex,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 100000000n,
  });

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates remote paymaster without API key', () => {
      const paymaster = new RemotePaymaster({
        url: paymasterUrl,
        entryPoint,
      });

      expect(paymaster).toBeInstanceOf(RemotePaymaster);
    });

    it('creates remote paymaster with API key', () => {
      const paymaster = new RemotePaymaster({
        url: paymasterUrl,
        entryPoint,
        apiKey: 'test-api-key',
      });

      expect(paymaster).toBeInstanceOf(RemotePaymaster);
    });
  });

  describe('getPaymasterData', () => {
    it('calls remote service and returns result', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            paymasterAndData: '0x1234',
          },
        }),
      });

      const paymaster = new RemotePaymaster({
        url: paymasterUrl,
        entryPoint,
      });

      const result = await paymaster.getPaymasterData(testUserOp);

      expect(result.paymasterAndData).toBe('0x1234');
      expect(mockFetch).toHaveBeenCalledWith(
        paymasterUrl,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('includes optional gas limits in result', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            paymasterAndData: '0x1234',
            preVerificationGas: '0x5208',
            verificationGasLimit: '0x10000',
            callGasLimit: '0x20000',
          },
        }),
      });

      const paymaster = new RemotePaymaster({
        url: paymasterUrl,
        entryPoint,
      });

      const result = await paymaster.getPaymasterData(testUserOp);

      expect(result.preVerificationGas).toBe(21000n);
      expect(result.verificationGasLimit).toBe(65536n);
      expect(result.callGasLimit).toBe(131072n);
    });

    it('includes Authorization header when API key provided', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: { paymasterAndData: '0x1234' },
        }),
      });

      const paymaster = new RemotePaymaster({
        url: paymasterUrl,
        entryPoint,
        apiKey: 'test-api-key',
      });

      await paymaster.getPaymasterData(testUserOp);

      expect(mockFetch).toHaveBeenCalledWith(
        paymasterUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          error: { message: 'Sponsorship denied' },
        }),
      });

      const paymaster = new RemotePaymaster({
        url: paymasterUrl,
        entryPoint,
      });

      await expect(paymaster.getPaymasterData(testUserOp))
        .rejects.toThrow('Paymaster error: Sponsorship denied');
    });
  });

  describe('getPaymasterStub', () => {
    it('calls remote service for stub', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          result: {
            paymasterAndData: '0xstub',
          },
        }),
      });

      const paymaster = new RemotePaymaster({
        url: paymasterUrl,
        entryPoint,
      });

      const result = await paymaster.getPaymasterStub(testUserOp);

      expect(result.paymasterAndData).toBe('0xstub');
    });
  });

  describe('createRemotePaymaster', () => {
    it('creates remote paymaster instance', () => {
      const paymaster = createRemotePaymaster({
        url: paymasterUrl,
        entryPoint,
      });

      expect(paymaster).toBeInstanceOf(RemotePaymaster);
    });
  });
});

describe('ERC20Paymaster', () => {
  const paymasterAddress = '0x1234567890123456789012345678901234567890' as Address;
  const tokenAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
  const testAddress = '0x9999999999999999999999999999999999999999' as Address;

  const testUserOp: UserOperation = createUserOp({
    sender: testAddress,
    nonce: 0n,
    callData: '0x' as Hex,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 100000000n,
  });

  describe('constructor', () => {
    it('creates ERC20 paymaster', () => {
      const paymaster = new ERC20Paymaster({
        address: paymasterAddress,
        token: tokenAddress,
      });

      expect(paymaster).toBeInstanceOf(ERC20Paymaster);
    });
  });

  describe('getPaymasterData', () => {
    it('returns paymaster address as paymasterAndData', async () => {
      const paymaster = new ERC20Paymaster({
        address: paymasterAddress,
        token: tokenAddress,
      });

      const result = await paymaster.getPaymasterData(testUserOp);

      expect(result.paymasterAndData).toBe(paymasterAddress);
    });
  });

  describe('getPaymasterStub', () => {
    it('returns paymaster address as stub', async () => {
      const paymaster = new ERC20Paymaster({
        address: paymasterAddress,
        token: tokenAddress,
      });

      const result = await paymaster.getPaymasterStub(testUserOp);

      expect(result.paymasterAndData).toBe(paymasterAddress);
    });
  });
});

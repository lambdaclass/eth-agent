/**
 * Integration tests for ERC-4337 smart account flows
 * Tests smart accounts, bundlers, and paymasters working together
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartAccount } from '../../src/protocol/smart-account.js';
import { EOA } from '../../src/protocol/account.js';
import { VerifyingPaymaster, createVerifyingPaymaster } from '../../src/protocol/paymaster.js';
import { BundlerClient } from '../../src/protocol/bundler.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import { ETH, GWEI } from '../../src/core/units.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';

describe('Smart Account Integration', () => {
  const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex;
  const testAddress = '0xabcd567890123456789012345678901234567890' as Address;
  const smartAccountAddress = '0x7890789078907890789078907890789078907890' as Address;
  const testHash = '0x' + '11'.repeat(32) as Hash;

  let mockRpc: any;
  let mockBundler: any;
  let mockOwner: any;

  beforeEach(() => {
    mockRpc = {
      call: vi.fn().mockResolvedValue('0x' + smartAccountAddress.slice(2).padStart(64, '0')),
      getCode: vi.fn().mockResolvedValue('0x'),
      getChainId: vi.fn().mockResolvedValue(1),
      getBlock: vi.fn().mockResolvedValue({
        baseFeePerGas: GWEI(10),
        number: 12345,
        timestamp: Math.floor(Date.now() / 1000),
      }),
      estimateGas: vi.fn().mockResolvedValue(100000n),
      getBalance: vi.fn().mockResolvedValue(ETH(1)),
    };

    mockBundler = {
      sendUserOperation: vi.fn().mockResolvedValue(testHash),
      estimateUserOperationGas: vi.fn().mockResolvedValue({
        preVerificationGas: 21000n,
        verificationGasLimit: 100000n,
        callGasLimit: 50000n,
      }),
      waitForUserOperation: vi.fn().mockResolvedValue({
        success: true,
        receipt: {
          transactionHash: testHash,
        },
      }),
      getUserOperationReceipt: vi.fn().mockResolvedValue({
        success: true,
        receipt: { transactionHash: testHash },
      }),
    };

    mockOwner = EOA.fromPrivateKey(testPrivateKey);
  });

  describe('smart account creation and execution', () => {
    it('creates smart account and executes transaction', async () => {
      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      expect(smartAccount.address).toBe(smartAccountAddress);

      // Execute a transaction
      const result = await smartAccount.execute({
        to: testAddress,
        value: ETH(0.1),
        data: '0x' as Hex,
      });

      expect(result.success).toBe(true);
      expect(result.userOpHash).toBe(testHash);
      expect(mockBundler.sendUserOperation).toHaveBeenCalled();
      expect(mockBundler.waitForUserOperation).toHaveBeenCalled();
    });

    it('deploys account on first transaction', async () => {
      mockRpc.getCode.mockResolvedValue('0x'); // Not deployed

      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      const userOp = await smartAccount.buildUserOp({
        to: testAddress,
        value: ETH(0.1),
        data: '0x' as Hex,
      });

      // Should include initCode for undeployed account
      expect(userOp.initCode).not.toBe('0x');
    });

    it('skips initCode for deployed account', async () => {
      mockRpc.getCode.mockResolvedValue('0x608060...'); // Deployed

      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      const userOp = await smartAccount.buildUserOp({
        to: testAddress,
        value: ETH(0.1),
        data: '0x' as Hex,
      });

      expect(userOp.initCode).toBe('0x');
    });
  });

  describe('batch transactions', () => {
    it('executes multiple calls in single UserOperation', async () => {
      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      const userOp = await smartAccount.buildUserOp([
        { to: testAddress, value: ETH(0.1), data: '0x' as Hex },
        { to: testAddress, value: ETH(0.2), data: '0xabcdef' as Hex },
        { to: testAddress, value: 0n, data: '0x123456' as Hex },
      ]);

      expect(userOp.callData).toMatch(/^0x/);
      // executeBatch should be called
    });
  });

  describe('paymaster integration', () => {
    it('uses paymaster for gas sponsorship', async () => {
      const paymasterAddress = '0x1234567890123456789012345678901234567890' as Address;
      const signerKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex;

      // Create verifying paymaster
      const paymaster = createVerifyingPaymaster({
        address: paymasterAddress,
        signerKey,
      });

      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      // Build basic UserOp first
      const userOp = await smartAccount.buildUserOp({
        to: testAddress,
        value: ETH(0.1),
        data: '0x' as Hex,
      });

      // Get paymaster data for sponsorship
      const paymasterResult = await paymaster.getPaymasterData(userOp);

      // Build UserOp with paymaster data
      const sponsoredOp = await smartAccount.buildUserOp(
        { to: testAddress, value: ETH(0.1), data: '0x' as Hex },
        { paymasterAndData: paymasterResult.paymasterAndData }
      );

      expect(sponsoredOp.paymasterAndData).toBe(paymasterResult.paymasterAndData);
      expect(sponsoredOp.paymasterAndData).toMatch(/^0x/);
      expect(sponsoredOp.paymasterAndData.length).toBeGreaterThan(42); // At least address + some data
    });
  });

  describe('gas estimation flow', () => {
    it('estimates gas through bundler', async () => {
      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      const userOp = await smartAccount.buildUserOp({
        to: testAddress,
        value: ETH(0.1),
        data: '0x' as Hex,
      });

      expect(mockBundler.estimateUserOperationGas).toHaveBeenCalled();
      expect(userOp.preVerificationGas).toBe(21000n);
      expect(userOp.verificationGasLimit).toBe(100000n);
      expect(userOp.callGasLimit).toBe(50000n);
    });
  });

  describe('signature verification', () => {
    it('signs UserOperation correctly', async () => {
      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      const userOp = await smartAccount.buildUserOp({
        to: testAddress,
        value: ETH(0.1),
        data: '0x' as Hex,
      });

      const signedUserOp = smartAccount.signUserOp(userOp, 1); // chainId = 1

      expect(signedUserOp.signature).toMatch(/^0x/);
      expect(signedUserOp.signature.length).toBeGreaterThan(2);
    });
  });

  describe('error handling', () => {
    it('handles bundler errors gracefully', async () => {
      mockBundler.sendUserOperation.mockRejectedValue(
        new Error('UserOperation reverted: AA21 insufficient funds')
      );

      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      await expect(
        smartAccount.execute({
          to: testAddress,
          value: ETH(0.1),
          data: '0x' as Hex,
        })
      ).rejects.toThrow('AA21');
    });

    it('handles failed UserOperation', async () => {
      mockBundler.waitForUserOperation.mockResolvedValue({
        success: false,
        receipt: {
          transactionHash: testHash,
        },
      });

      const smartAccount = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
      });

      const result = await smartAccount.execute({
        to: testAddress,
        value: ETH(0.1),
        data: '0x' as Hex,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('multiple owners', () => {
    it('supports multiple smart accounts from same owner', async () => {
      const account1 = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
        index: 0n,
      });

      // Different address calculation for index 1
      mockRpc.call.mockResolvedValue('0x' + '8888888888888888888888888888888888888888'.padStart(64, '0'));

      const account2 = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc as RPCClient,
        bundler: mockBundler as BundlerClient,
        index: 1n,
      });

      expect(account1.address).not.toBe(account2.address);
    });
  });
});

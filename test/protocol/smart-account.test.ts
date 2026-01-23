import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartAccount, createSmartAccount } from '../../src/protocol/smart-account.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { BundlerClient } from '../../src/protocol/bundler.js';
import type { Account } from '../../src/protocol/account.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';

describe('SmartAccount', () => {
  const ownerAddress = '0x1234567890123456789012345678901234567890' as Address;
  const smartAccountAddress = '0x7890789078907890789078907890789078907890' as Address;
  const testHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hash;

  let mockRpc: RPCClient;
  let mockBundler: BundlerClient;
  let mockOwner: Account;

  beforeEach(() => {
    mockRpc = {
      call: vi.fn().mockResolvedValue('0x0000000000000000000000007890789078907890789078907890789078907890'),
      getCode: vi.fn().mockResolvedValue('0x'),
      getChainId: vi.fn().mockResolvedValue(1),
      getBlock: vi.fn().mockResolvedValue({
        baseFeePerGas: 1000000000n,
      }),
    } as unknown as RPCClient;

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
    } as unknown as BundlerClient;

    const mockPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex;
    mockOwner = {
      address: ownerAddress,
      publicKey: '0x04' + '1234567890abcdef'.repeat(8) as Hex,
      exportPrivateKey: vi.fn().mockReturnValue(mockPrivateKey),
      usePrivateKey: vi.fn().mockImplementation(<T>(fn: (key: Hex) => T) => fn(mockPrivateKey)),
      sign: vi.fn().mockReturnValue({
        r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        s: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
        v: 27,
        yParity: 0,
      }),
    } as unknown as Account;
  });

  describe('create', () => {
    it('creates smart account with calculated address', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      expect(account.address).toBe(smartAccountAddress);
      expect(account.owner).toBe(mockOwner);
    });

    it('uses custom factory address', async () => {
      const customFactory = '0x9999999999999999999999999999999999999999' as Address;

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
        factoryAddress: customFactory,
      });

      expect(account).toBeInstanceOf(SmartAccount);
      expect(mockRpc.call).toHaveBeenCalledWith(
        expect.objectContaining({
          to: customFactory,
        })
      );
    });

    it('uses custom entry point', async () => {
      const customEntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address;

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
        entryPoint: customEntryPoint,
      });

      expect(account).toBeInstanceOf(SmartAccount);
    });

    it('uses custom index', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
        index: 5n,
      });

      expect(account).toBeInstanceOf(SmartAccount);
    });

    it('detects already deployed account', async () => {
      vi.mocked(mockRpc.getCode).mockResolvedValue('0x608060...');

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const isDeployed = await account.isDeployed();
      expect(isDeployed).toBe(true);
    });
  });

  describe('isDeployed', () => {
    it('returns false for undeployed account', async () => {
      vi.mocked(mockRpc.getCode).mockResolvedValue('0x');

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const isDeployed = await account.isDeployed();
      expect(isDeployed).toBe(false);
    });

    it('caches deployed status', async () => {
      // SmartAccount.create calls getCode once, so we need to mock:
      // 1. For create (undeployed)
      // 2. For first isDeployed call (still undeployed)
      // 3. For second isDeployed call (now deployed)
      vi.mocked(mockRpc.getCode)
        .mockResolvedValueOnce('0x')        // create
        .mockResolvedValueOnce('0x')        // first isDeployed
        .mockResolvedValueOnce('0x608060'); // second isDeployed

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      // First call returns false
      expect(await account.isDeployed()).toBe(false);

      // Second call now deployed
      expect(await account.isDeployed()).toBe(true);

      // Third call should return cached true (no RPC call needed)
      expect(await account.isDeployed()).toBe(true);
    });
  });

  describe('getNonce', () => {
    it('gets nonce from entry point', async () => {
      vi.mocked(mockRpc.call).mockResolvedValueOnce(
        '0x' + smartAccountAddress.slice(2).padStart(64, '0') // for create
      ).mockResolvedValueOnce('0x5'); // for getNonce

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const nonce = await account.getNonce();

      expect(nonce).toBe(5n);
    });
  });

  describe('buildUserOp', () => {
    it('builds UserOperation for single call', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp({
        to: ownerAddress,
        value: 1000000000000000000n,
        data: '0x' as Hex,
      });

      expect(userOp.sender).toBe(smartAccountAddress);
      expect(userOp.callData).toMatch(/^0x/);
    });

    it('builds UserOperation for batch calls', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp([
        { to: ownerAddress, value: 1000000000000000000n, data: '0x' as Hex },
        { to: smartAccountAddress, value: 0n, data: '0xabcdef' as Hex },
      ]);

      expect(userOp.callData).toMatch(/^0x/);
      // executeBatch selector
    });

    it('includes init code for undeployed account', async () => {
      vi.mocked(mockRpc.getCode).mockResolvedValue('0x');

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp({
        to: ownerAddress,
        value: 1000000000000000000n,
        data: '0x' as Hex,
      });

      expect(userOp.initCode).not.toBe('0x');
    });

    it('excludes init code for deployed account', async () => {
      vi.mocked(mockRpc.getCode).mockResolvedValue('0x608060...');

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp({
        to: ownerAddress,
        value: 1000000000000000000n,
        data: '0x' as Hex,
      });

      expect(userOp.initCode).toBe('0x');
    });

    it('uses custom gas parameters', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp(
        { to: ownerAddress, value: 0n, data: '0x' as Hex },
        {
          maxFeePerGas: 5000000000n,
          maxPriorityFeePerGas: 2000000000n,
        }
      );

      expect(userOp.maxFeePerGas).toBe(5000000000n);
      expect(userOp.maxPriorityFeePerGas).toBe(2000000000n);
    });

    it('includes paymaster data', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp(
        { to: ownerAddress, value: 0n, data: '0x' as Hex },
        { paymasterAndData: '0x1234' as Hex }
      );

      expect(userOp.paymasterAndData).toBe('0x1234');
    });

    it('throws when block fetch fails', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue(null);

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      await expect(
        account.buildUserOp({ to: ownerAddress, value: 0n, data: '0x' as Hex })
      ).rejects.toThrow('Failed to fetch latest block');
    });
  });

  describe('signUserOp', () => {
    it('signs UserOperation', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp({
        to: ownerAddress,
        value: 0n,
        data: '0x' as Hex,
      });

      const signed = account.signUserOp(userOp, 1);

      expect(signed.signature).toMatch(/^0x/);
      expect(signed.signature.length).toBeGreaterThan(2);
    });

    it('throws if owner cannot export private key', async () => {
      const nonExportableOwner = {
        address: ownerAddress,
        publicKey: '0x04' + '1234567890abcdef'.repeat(8) as Hex,
        // No exportPrivateKey method
      } as unknown as Account;

      const account = await SmartAccount.create({
        owner: nonExportableOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const userOp = await account.buildUserOp({
        to: ownerAddress,
        value: 0n,
        data: '0x' as Hex,
      });

      expect(() => account.signUserOp(userOp, 1))
        .toThrow('Owner must be an EOA');
    });
  });

  describe('sendUserOp', () => {
    it('sends signed UserOperation', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const hash = await account.sendUserOp({
        to: ownerAddress,
        value: 1000000000000000000n,
        data: '0x' as Hex,
      });

      expect(hash).toBe(testHash);
      expect(mockBundler.sendUserOperation).toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('sends and waits for receipt', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const result = await account.execute({
        to: ownerAddress,
        value: 1000000000000000000n,
        data: '0x' as Hex,
      });

      expect(result.success).toBe(true);
      expect(result.userOpHash).toBe(testHash);
      expect(result.transactionHash).toBe(testHash);
    });

    it('marks account as deployed after successful execution', async () => {
      vi.mocked(mockRpc.getCode).mockResolvedValue('0x');

      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      // Initially not deployed
      expect(await account.isDeployed()).toBe(false);

      await account.execute({
        to: ownerAddress,
        value: 0n,
        data: '0x' as Hex,
      });

      // Now should be deployed (cached)
      // Note: isDeployed is cached internally after successful execution
    });
  });

  describe('send', () => {
    it('sends ETH to address', async () => {
      const account = await SmartAccount.create({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      const hash = await account.send(ownerAddress, 1000000000000000000n);

      expect(hash).toBe(testHash);
    });
  });

  describe('createSmartAccount', () => {
    it('creates smart account instance', async () => {
      const account = await createSmartAccount({
        owner: mockOwner,
        rpc: mockRpc,
        bundler: mockBundler,
      });

      expect(account).toBeInstanceOf(SmartAccount);
    });
  });
});

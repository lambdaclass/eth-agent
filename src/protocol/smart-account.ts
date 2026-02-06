/**
 * ERC-4337 Smart Account
 * Abstract account with customizable validation logic
 */

import type { Address, Hash, Hex } from '../core/types.js';
import type { Account } from './account.js';
import type { EOA } from './account.js';
import type { RPCClient } from './rpc.js';
import type { BundlerClient } from './bundler.js';
import type { UserOperation } from './userop.js';
import { createUserOp, getUserOpHash, ENTRY_POINT_V07 } from './userop.js';
import { encodeFunctionCall } from '../core/abi.js';
import { concatHex } from '../core/hex.js';
import { sign } from '../core/signature.js';

// Simple Account Factory (reference implementation)
const SIMPLE_ACCOUNT_FACTORY = '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985' as Address;

export interface SmartAccountConfig {
  owner: Account;           // EOA that owns this account
  rpc: RPCClient;
  bundler: BundlerClient;
  factoryAddress?: Address; // Custom factory
  entryPoint?: Address;
  index?: bigint;           // Salt for deterministic address
}

export interface CallData {
  to: Address;
  value: bigint;
  data: Hex;
}

/**
 * Smart Account (ERC-4337)
 */
export class SmartAccount {
  readonly address: Address;
  readonly owner: Account;
  private readonly rpc: RPCClient;
  private readonly bundler: BundlerClient;
  private readonly factoryAddress: Address;
  private readonly entryPoint: Address;
  private readonly index: bigint;
  private deployed = false;

  private constructor(config: {
    address: Address;
    owner: Account;
    rpc: RPCClient;
    bundler: BundlerClient;
    factoryAddress: Address;
    entryPoint: Address;
    index: bigint;
  }) {
    this.address = config.address;
    this.owner = config.owner;
    this.rpc = config.rpc;
    this.bundler = config.bundler;
    this.factoryAddress = config.factoryAddress;
    this.entryPoint = config.entryPoint;
    this.index = config.index;
  }

  /**
   * Create a new Smart Account
   */
  static async create(config: SmartAccountConfig): Promise<SmartAccount> {
    const factoryAddress = config.factoryAddress ?? SIMPLE_ACCOUNT_FACTORY;
    const entryPoint = config.entryPoint ?? ENTRY_POINT_V07;
    const index = config.index ?? 0n;

    // Calculate counterfactual address
    const address = await computeSmartAccountAddress(
      config.rpc,
      factoryAddress,
      config.owner.address,
      index
    );

    const account = new SmartAccount({
      address,
      owner: config.owner,
      rpc: config.rpc,
      bundler: config.bundler,
      factoryAddress,
      entryPoint,
      index,
    });

    // Check if already deployed
    const code = await config.rpc.getCode(address);
    account.deployed = code !== '0x';

    return account;
  }

  /**
   * Check if account is deployed
   */
  async isDeployed(): Promise<boolean> {
    if (this.deployed) return true;
    const code = await this.rpc.getCode(this.address);
    this.deployed = code !== '0x';
    return this.deployed;
  }

  /**
   * Get account nonce
   */
  async getNonce(): Promise<bigint> {
    // Call entryPoint.getNonce(address, key)
    const data = encodeFunctionCall(
      { name: 'getNonce', inputs: [{ type: 'address' }, { type: 'uint192' }] },
      [this.address, 0n]
    );

    const result = await this.rpc.call({
      to: this.entryPoint,
      data,
    });

    return BigInt(result);
  }

  /**
   * Create init code for account deployment
   */
  private getInitCode(): Hex {
    if (this.deployed) return '0x';

    // createAccount(address owner, uint256 salt)
    const initCallData = encodeFunctionCall(
      { name: 'createAccount', inputs: [{ type: 'address' }, { type: 'uint256' }] },
      [this.owner.address, this.index]
    );

    return concatHex(this.factoryAddress, initCallData);
  }

  /**
   * Encode a single call
   */
  private encodeExecute(call: CallData): Hex {
    return encodeFunctionCall(
      { name: 'execute', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }] },
      [call.to, call.value, call.data]
    );
  }

  /**
   * Encode batch calls
   */
  private encodeExecuteBatch(calls: CallData[]): Hex {
    return encodeFunctionCall(
      {
        name: 'executeBatch',
        inputs: [
          { type: 'address[]' },
          { type: 'uint256[]' },
          { type: 'bytes[]' },
        ],
      },
      [
        calls.map((c) => c.to),
        calls.map((c) => c.value),
        calls.map((c) => c.data),
      ]
    );
  }

  /**
   * Build a UserOperation
   */
  async buildUserOp(
    calls: CallData | CallData[],
    options?: {
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
      paymasterAndData?: Hex;
    }
  ): Promise<UserOperation> {
    const callArray = Array.isArray(calls) ? calls : [calls];
    const callData = callArray.length === 1
      ? this.encodeExecute(callArray[0]!)
      : this.encodeExecuteBatch(callArray);

    const nonce = await this.getNonce();
    const initCode = this.getInitCode();

    // Get gas prices from RPC
    const block = await this.rpc.getBlock('latest');
    if (!block) {
      throw new Error('Failed to fetch latest block');
    }
    const baseFee = block.baseFeePerGas ?? 0n;
    const maxPriorityFeePerGas = options?.maxPriorityFeePerGas ?? 1_500_000_000n; // 1.5 gwei
    const maxFeePerGas = options?.maxFeePerGas ?? baseFee * 2n + maxPriorityFeePerGas;

    // Create initial UserOp for gas estimation
    let userOp = createUserOp({
      sender: this.address,
      nonce,
      initCode,
      callData,
      maxFeePerGas,
      maxPriorityFeePerGas,
      paymasterAndData: options?.paymasterAndData ?? '0x',
    });

    // Estimate gas
    const gasEstimate = await this.bundler.estimateUserOperationGas(userOp);
    userOp = {
      ...userOp,
      preVerificationGas: gasEstimate.preVerificationGas,
      verificationGasLimit: gasEstimate.verificationGasLimit,
      callGasLimit: gasEstimate.callGasLimit,
    };

    return userOp;
  }

  /**
   * Sign a UserOperation
   * Requires owner to be an EOA with usePrivateKey method
   */
  signUserOp(userOp: UserOperation, chainId: number): UserOperation {
    const hash = getUserOpHash(userOp, this.entryPoint, chainId);

    // Owner must be an EOA to sign
    const eoa = this.owner as EOA;
    if (!('usePrivateKey' in eoa)) {
      throw new Error('Owner must be an EOA with usePrivateKey method');
    }

    // Use scoped access to the private key
    const sig = eoa.usePrivateKey((privateKey) => sign(hash, privateKey));

    // Concatenate r, s, v for the signature
    const sigHex = `${sig.r}${sig.s.slice(2)}${sig.v.toString(16).padStart(2, '0')}` as Hex;

    return {
      ...userOp,
      signature: sigHex,
    };
  }

  /**
   * Send a UserOperation
   */
  async sendUserOp(
    calls: CallData | CallData[],
    options?: {
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
      paymasterAndData?: Hex;
    }
  ): Promise<Hash> {
    const chainId = await this.rpc.getChainId();
    const userOp = await this.buildUserOp(calls, options);
    const signedOp = this.signUserOp(userOp, chainId);

    return await this.bundler.sendUserOperation(signedOp);
  }

  /**
   * Execute a transaction and wait for receipt
   */
  async execute(
    calls: CallData | CallData[],
    options?: {
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
      paymasterAndData?: Hex;
    }
  ): Promise<{
    userOpHash: Hash;
    transactionHash: Hash;
    success: boolean;
  }> {
    const userOpHash = await this.sendUserOp(calls, options);
    const receipt = await this.bundler.waitForUserOperation(userOpHash);

    // Mark as deployed after first successful operation
    if (receipt.success) {
      this.deployed = true;
    }

    return {
      userOpHash,
      transactionHash: receipt.receipt.transactionHash,
      success: receipt.success,
    };
  }

  /**
   * Send ETH
   */
  async send(to: Address, value: bigint): Promise<Hash> {
    return this.sendUserOp({ to, value, data: '0x' });
  }
}

/**
 * Compute counterfactual address for a smart account
 */
async function computeSmartAccountAddress(
  rpc: RPCClient,
  factoryAddress: Address,
  owner: Address,
  index: bigint
): Promise<Address> {
  // Call factory.getAddress(owner, salt)
  const data = encodeFunctionCall(
    { name: 'getAddress', inputs: [{ type: 'address' }, { type: 'uint256' }] },
    [owner, index]
  );

  const result = await rpc.call({
    to: factoryAddress,
    data,
  });

  // Extract address from result (last 20 bytes)
  return `0x${result.slice(-40)}` as Address;
}

/**
 * Create a smart account
 */
export async function createSmartAccount(config: SmartAccountConfig): Promise<SmartAccount> {
  return SmartAccount.create(config);
}

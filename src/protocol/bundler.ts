/**
 * ERC-4337 Bundler Client
 * Communicates with bundler nodes to submit UserOperations
 */

import type { Address, Hash, Hex } from '../core/types.js';
import type { UserOperation } from './userop.js';
import { encodeUserOp, decodeUserOp, ENTRY_POINT_V07 } from './userop.js';
import { hexToBigInt } from '../core/hex.js';

export interface BundlerConfig {
  url: string;
  entryPoint?: Address;
  timeout?: number;
}

export interface UserOpReceipt {
  userOpHash: Hash;
  entryPoint: Address;
  sender: Address;
  nonce: bigint;
  paymaster?: Address;
  actualGasCost: bigint;
  actualGasUsed: bigint;
  success: boolean;
  reason?: string;
  logs: Array<{
    address: Address;
    topics: Hex[];
    data: Hex;
  }>;
  receipt: {
    transactionHash: Hash;
    blockNumber: number;
    blockHash: Hash;
    gasUsed: bigint;
  };
}

export interface GasEstimate {
  preVerificationGas: bigint;
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
}

/**
 * Bundler client for ERC-4337
 */
export class BundlerClient {
  private readonly url: string;
  private readonly entryPoint: Address;
  private readonly timeout: number;
  private nextId = 1;

  constructor(config: BundlerConfig) {
    this.url = config.url;
    this.entryPoint = config.entryPoint ?? ENTRY_POINT_V07;
    this.timeout = config.timeout ?? 30_000;
  }

  /**
   * Send a UserOperation to the bundler
   */
  async sendUserOperation(op: UserOperation): Promise<Hash> {
    const result = await this.call<string>('eth_sendUserOperation', [
      encodeUserOp(op),
      this.entryPoint,
    ]);
    return result as Hash;
  }

  /**
   * Estimate gas for a UserOperation
   */
  async estimateUserOperationGas(op: UserOperation): Promise<GasEstimate> {
    const result = await this.call<Record<string, string>>('eth_estimateUserOperationGas', [
      encodeUserOp(op),
      this.entryPoint,
    ]);

    const estimate: GasEstimate = {
      preVerificationGas: hexToBigInt((result['preVerificationGas'] ?? '0x0') as Hex),
      verificationGasLimit: hexToBigInt((result['verificationGasLimit'] ?? '0x0') as Hex),
      callGasLimit: hexToBigInt((result['callGasLimit'] ?? '0x0') as Hex),
    };
    if (result['paymasterVerificationGasLimit']) {
      estimate.paymasterVerificationGasLimit = hexToBigInt(result['paymasterVerificationGasLimit'] as Hex);
    }
    if (result['paymasterPostOpGasLimit']) {
      estimate.paymasterPostOpGasLimit = hexToBigInt(result['paymasterPostOpGasLimit'] as Hex);
    }
    return estimate;
  }

  /**
   * Get UserOperation by hash
   */
  async getUserOperationByHash(hash: Hash): Promise<{
    userOperation: UserOperation;
    entryPoint: Address;
    blockNumber: number;
    blockHash: Hash;
    transactionHash: Hash;
  } | null> {
    const result = await this.call<Record<string, unknown> | null>('eth_getUserOperationByHash', [hash]);
    if (!result) return null;

    return {
      userOperation: decodeUserOp(result['userOperation'] as Record<string, string>),
      entryPoint: result['entryPoint'] as Address,
      blockNumber: Number(result['blockNumber']),
      blockHash: result['blockHash'] as Hash,
      transactionHash: result['transactionHash'] as Hash,
    };
  }

  /**
   * Get UserOperation receipt
   */
  async getUserOperationReceipt(hash: Hash): Promise<UserOpReceipt | null> {
    const result = await this.call<Record<string, unknown> | null>('eth_getUserOperationReceipt', [hash]);
    if (!result) return null;

    const receipt = result['receipt'] as Record<string, unknown>;

    const opReceipt: UserOpReceipt = {
      userOpHash: result['userOpHash'] as Hash,
      entryPoint: result['entryPoint'] as Address,
      sender: result['sender'] as Address,
      nonce: BigInt(result['nonce'] as string),
      actualGasCost: BigInt(result['actualGasCost'] as string),
      actualGasUsed: BigInt(result['actualGasUsed'] as string),
      success: result['success'] as boolean,
      logs: (result['logs'] as Array<Record<string, unknown>>).map((log) => ({
        address: log['address'] as Address,
        topics: log['topics'] as Hex[],
        data: log['data'] as Hex,
      })),
      receipt: {
        transactionHash: receipt['transactionHash'] as Hash,
        blockNumber: Number(receipt['blockNumber']),
        blockHash: receipt['blockHash'] as Hash,
        gasUsed: BigInt(receipt['gasUsed'] as string),
      },
    };
    if (result['paymaster']) {
      opReceipt.paymaster = result['paymaster'] as Address;
    }
    if (result['reason']) {
      opReceipt.reason = result['reason'] as string;
    }
    return opReceipt;
  }

  /**
   * Wait for UserOperation to be included
   */
  async waitForUserOperation(
    hash: Hash,
    options?: { timeout?: number; pollInterval?: number }
  ): Promise<UserOpReceipt> {
    const timeout = options?.timeout ?? 60_000;
    const pollInterval = options?.pollInterval ?? 2_000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const receipt = await this.getUserOperationReceipt(hash);
      if (receipt) {
        return receipt;
      }
      await sleep(pollInterval);
    }

    throw new Error(`UserOperation ${hash} not found after ${timeout}ms`);
  }

  /**
   * Get supported entry points
   */
  async getSupportedEntryPoints(): Promise<Address[]> {
    return await this.call<Address[]>('eth_supportedEntryPoints', []);
  }

  /**
   * Get chain ID
   */
  async getChainId(): Promise<number> {
    const result = await this.call<string>('eth_chainId', []);
    return Number(result);
  }

  /**
   * Make JSON-RPC call
   */
  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId++,
          method,
          params,
        }),
        signal: controller.signal,
      });

      const json = await response.json() as { result?: T; error?: { code: number; message: string } };

      if (json.error) {
        throw new BundlerError(json.error.code, json.error.message);
      }

      return json.result as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Bundler-specific error
 */
export class BundlerError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
    this.name = 'BundlerError';
  }
}

/**
 * Known bundler providers
 */
export const BUNDLER_URLS: Record<string, Record<number, string>> = {
  alchemy: {
    1: 'https://eth-mainnet.g.alchemy.com/v2/',
    10: 'https://opt-mainnet.g.alchemy.com/v2/',
    137: 'https://polygon-mainnet.g.alchemy.com/v2/',
    42161: 'https://arb-mainnet.g.alchemy.com/v2/',
    8453: 'https://base-mainnet.g.alchemy.com/v2/',
  },
  pimlico: {
    1: 'https://api.pimlico.io/v2/1/rpc',
    10: 'https://api.pimlico.io/v2/10/rpc',
    137: 'https://api.pimlico.io/v2/137/rpc',
    42161: 'https://api.pimlico.io/v2/42161/rpc',
    8453: 'https://api.pimlico.io/v2/8453/rpc',
  },
};

/**
 * Create a bundler client
 */
export function createBundler(config: BundlerConfig): BundlerClient {
  return new BundlerClient(config);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

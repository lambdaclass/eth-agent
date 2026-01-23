/**
 * Smart contract interactions
 */

import type { Address, Hex, ABI, ABIFunction, ABIEvent, Log, Hash } from '../core/types.js';
import {
  encodeFunctionCall,
  decodeFunctionResult,
  decodeEventLog,
  eventTopic,
} from '../core/abi.js';
import type { RPCClient } from './rpc.js';
import type { Account } from './account.js';
import { TransactionBuilder } from './transaction.js';
import { GasOracle } from './gas.js';

export interface ContractConfig {
  address: Address;
  abi: ABI;
  rpc: RPCClient;
  account?: Account;
}

export interface CallOptions {
  from?: Address;
  value?: bigint;
  blockTag?: 'latest' | 'pending' | number;
}

export interface WriteOptions {
  value?: bigint;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export interface WriteResult {
  hash: Hash;
  wait: (confirmations?: number) => Promise<{
    hash: Hash;
    blockNumber: number;
    gasUsed: bigint;
    status: 'success' | 'reverted';
    logs: Log[];
  }>;
}

/**
 * Contract instance for interacting with smart contracts
 */
export class Contract {
  readonly address: Address;
  readonly abi: ABI;
  private readonly rpc: RPCClient;
  private readonly account?: Account;
  private readonly gasOracle: GasOracle;

  // Function lookup cache
  private readonly functions: Map<string, ABIFunction> = new Map();
  private readonly events: Map<string, ABIEvent> = new Map();

  constructor(config: ContractConfig) {
    this.address = config.address;
    this.abi = config.abi;
    this.rpc = config.rpc;
    if (config.account !== undefined) {
      this.account = config.account;
    }
    this.gasOracle = new GasOracle(config.rpc);

    // Index functions and events
    for (const item of this.abi) {
      if (item.type === 'function') {
        this.functions.set(item.name, item);
      } else if (item.type === 'event') {
        this.events.set(item.name, item);
      }
    }
  }

  /**
   * Call a read-only function
   */
  async read<T = unknown>(
    functionName: string,
    args: unknown[] = [],
    options: CallOptions = {}
  ): Promise<T> {
    const fn = this.functions.get(functionName);
    if (!fn) {
      throw new Error(`Function not found: ${functionName}`);
    }

    // Encode function call
    const signature = this.formatSignature(fn);
    const data = encodeFunctionCall(signature, args);

    // Make call
    const callParams: { to: Address; data: Hex; from?: Address; value?: bigint } = {
      to: this.address,
      data,
    };
    if (options.from !== undefined) {
      callParams.from = options.from;
    }
    if (options.value !== undefined) {
      callParams.value = options.value;
    }
    const result = await this.rpc.call(callParams, options.blockTag ?? 'latest');

    // Decode result
    if (fn.outputs.length === 0) {
      return undefined as T;
    }

    const outputTypes = fn.outputs.map((o) => o.type);
    const decoded = decodeFunctionResult(
      `${functionName}(${fn.inputs.map((i) => i.type).join(',')}) returns (${outputTypes.join(',')})`,
      result
    );

    // Return single value directly, multiple as array
    if (decoded.length === 1) {
      return decoded[0] as T;
    }

    return decoded as T;
  }

  /**
   * Write to a contract (send transaction)
   */
  async write(
    functionName: string,
    args: unknown[] = [],
    options: WriteOptions = {}
  ): Promise<WriteResult> {
    if (!this.account) {
      throw new Error('Account required for write operations');
    }

    const fn = this.functions.get(functionName);
    if (!fn) {
      throw new Error(`Function not found: ${functionName}`);
    }

    // Encode function call
    const signature = this.formatSignature(fn);
    const data = encodeFunctionCall(signature, args);

    // Estimate gas if not provided
    let gasLimit = options.gasLimit;
    let gasPrice = options.gasPrice;
    let maxFeePerGas = options.maxFeePerGas;
    let maxPriorityFeePerGas = options.maxPriorityFeePerGas;

    if (!gasLimit || (!gasPrice && !maxFeePerGas)) {
      const estimateParams: { to: Address; from: Address; data: Hex; value?: bigint } = {
        to: this.address,
        from: this.account.address,
        data,
      };
      if (options.value !== undefined) {
        estimateParams.value = options.value;
      }
      const estimate = await this.gasOracle.estimateGas(estimateParams);

      gasLimit = gasLimit ?? estimate.gasLimit;

      if (!gasPrice && !maxFeePerGas) {
        if (estimate.maxFeePerGas) {
          maxFeePerGas = estimate.maxFeePerGas;
          maxPriorityFeePerGas = estimate.maxPriorityFeePerGas;
        } else {
          gasPrice = estimate.gasPrice;
        }
      }
    }

    // Get nonce
    const nonce =
      options.nonce ?? (await this.rpc.getTransactionCount(this.account.address));

    // Get chain ID
    const chainId = await this.rpc.getChainId();

    // Build transaction
    let builder = TransactionBuilder.create()
      .to(this.address)
      .data(data)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(gasLimit);

    if (options.value) {
      builder = builder.value(options.value);
    }

    if (maxFeePerGas) {
      builder = builder.maxFeePerGas(maxFeePerGas);
      if (maxPriorityFeePerGas) {
        builder = builder.maxPriorityFeePerGas(maxPriorityFeePerGas);
      }
    } else if (gasPrice) {
      builder = builder.gasPrice(gasPrice);
    }

    // Sign and send
    const signed = builder.sign(this.account);
    const hash = await this.rpc.sendRawTransaction(signed.raw);

    return {
      hash,
      wait: async (confirmations = 1) => {
        const receipt = await this.rpc.waitForTransaction(hash, confirmations);
        return {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          status: receipt.status,
          logs: [...receipt.logs],
        };
      },
    };
  }

  /**
   * Encode function call data
   */
  encodeFunction(functionName: string, args: unknown[] = []): Hex {
    const fn = this.functions.get(functionName);
    if (!fn) {
      throw new Error(`Function not found: ${functionName}`);
    }

    const signature = this.formatSignature(fn);
    return encodeFunctionCall(signature, args);
  }

  /**
   * Decode function result
   */
  decodeResult<T = unknown>(functionName: string, data: Hex): T {
    const fn = this.functions.get(functionName);
    if (!fn) {
      throw new Error(`Function not found: ${functionName}`);
    }

    const outputTypes = fn.outputs.map((o) => o.type);
    const decoded = decodeFunctionResult(
      `${functionName}(${fn.inputs.map((i) => i.type).join(',')}) returns (${outputTypes.join(',')})`,
      data
    );

    if (decoded.length === 1) {
      return decoded[0] as T;
    }

    return decoded as T;
  }

  /**
   * Decode event log
   */
  decodeEvent(eventName: string, log: Log): Record<string, unknown> {
    const event = this.events.get(eventName);
    if (!event) {
      throw new Error(`Event not found: ${eventName}`);
    }

    return decodeEventLog(event, log.data, [...log.topics]);
  }

  /**
   * Get event topic for filtering
   */
  getEventTopic(eventName: string): Hash {
    const event = this.events.get(eventName);
    if (!event) {
      throw new Error(`Event not found: ${eventName}`);
    }

    const signature = `${eventName}(${event.inputs.map((i) => i.type).join(',')})`;
    return eventTopic(signature);
  }

  /**
   * Query past events
   */
  async queryEvents(
    eventName: string,
    filter: {
      fromBlock?: 'latest' | number;
      toBlock?: 'latest' | number;
      args?: Record<string, unknown>;
    } = {}
  ): Promise<Array<{ args: Record<string, unknown>; log: Log }>> {
    const event = this.events.get(eventName);
    if (!event) {
      throw new Error(`Event not found: ${eventName}`);
    }

    const topic0 = this.getEventTopic(eventName);

    // Build topics array from indexed parameters
    const topics: (Hash | null)[] = [topic0];

    if (filter.args) {
      for (const param of event.inputs) {
        if (!param.indexed) continue;

        const value = filter.args[param.name];
        if (value === undefined) {
          topics.push(null);
        } else {
          // TODO: Encode indexed value properly
          topics.push(value as Hash);
        }
      }
    }

    const logParams: { address: Address; topics: Hash[]; fromBlock?: number | 'latest'; toBlock?: number | 'latest' } = {
      address: this.address,
      topics: topics as Hash[],
    };
    if (filter.fromBlock !== undefined) {
      logParams.fromBlock = filter.fromBlock;
    }
    if (filter.toBlock !== undefined) {
      logParams.toBlock = filter.toBlock;
    }
    const logs = await this.rpc.getLogs(logParams);

    return logs.map((log) => ({
      args: this.decodeEvent(eventName, log),
      log,
    }));
  }

  /**
   * Format function signature
   */
  private formatSignature(fn: ABIFunction): string {
    const inputs = fn.inputs.map((i) => i.type).join(',');
    return `${fn.name}(${inputs})`;
  }
}

/**
 * Create a contract instance
 */
export function createContract(config: ContractConfig): Contract {
  return new Contract(config);
}

// Common ABIs for standard contracts

export const ERC20_ABI: ABI = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
];

export const ERC721_ABI: ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'safeTransferFrom',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getApproved',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'approved', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
];

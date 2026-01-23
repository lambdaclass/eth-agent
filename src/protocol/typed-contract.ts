/**
 * Typed Contract with ABI Inference
 * Inspired by viem - provides compile-time type safety for contract interactions
 *
 * Usage:
 * ```typescript
 * const abi = [
 *   { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }],
 *     outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
 * ] as const;
 *
 * const contract = createTypedContract({ address, abi, rpc });
 *
 * // Type-safe: balance is inferred as bigint
 * const balance = await contract.read.balanceOf(['0x...']);
 * ```
 */

import type { Address, Hex, Hash, ABI } from '../core/types.js';
import type {
  TypedAbi,
  AbiReadFunctionNames,
  AbiWriteFunctionNames,
  AbiFunctionInputs,
  AbiFunctionOutputs,
  AbiEventNames,
  AbiEventArgs,
} from '../core/abi-types.js';
import { Contract, type WriteResult } from './contract.js';
import type { RPCClient } from './rpc.js';
import type { Account } from './account.js';

// ============ Typed Contract Interface ============

/**
 * Read methods generated from ABI
 */
export type TypedReadMethods<TAbi extends TypedAbi> = {
  [K in AbiReadFunctionNames<TAbi>]: (
    args: AbiFunctionInputs<TAbi, K>
  ) => Promise<AbiFunctionOutputs<TAbi, K>>;
};

/**
 * Write methods generated from ABI
 */
export type TypedWriteMethods<TAbi extends TypedAbi> = {
  [K in AbiWriteFunctionNames<TAbi>]: (
    args: AbiFunctionInputs<TAbi, K>,
    options?: {
      value?: bigint;
      gasLimit?: bigint;
    }
  ) => Promise<WriteResult>;
};

/**
 * Event query methods generated from ABI
 */
export type TypedEventMethods<TAbi extends TypedAbi> = {
  [K in AbiEventNames<TAbi>]: (filter?: {
    fromBlock?: number | 'latest';
    toBlock?: number | 'latest';
    args?: Partial<AbiEventArgs<TAbi, K>>;
  }) => Promise<Array<{
    args: AbiEventArgs<TAbi, K>;
    blockNumber: number;
    transactionHash: Hash;
  }>>;
};

/**
 * Typed contract interface
 */
export interface TypedContract<TAbi extends TypedAbi> {
  readonly address: Address;
  readonly abi: TAbi;
  readonly read: TypedReadMethods<TAbi>;
  readonly write: TypedWriteMethods<TAbi>;
  readonly events: TypedEventMethods<TAbi>;
  readonly encode: {
    [K in AbiReadFunctionNames<TAbi> | AbiWriteFunctionNames<TAbi>]: (
      args: AbiFunctionInputs<TAbi, K>
    ) => Hex;
  };
}

/**
 * Configuration for typed contract
 */
export interface TypedContractConfig<TAbi extends TypedAbi> {
  address: Address;
  abi: TAbi;
  rpc: RPCClient;
  account?: Account;
}

// ============ Implementation ============

/**
 * Create a typed contract instance
 * Uses Proxy to generate type-safe method accessors
 */
export function createTypedContract<const TAbi extends TypedAbi>(
  config: TypedContractConfig<TAbi>
): TypedContract<TAbi> {
  const contract = new Contract({
    address: config.address,
    abi: config.abi as unknown as ABI,
    rpc: config.rpc,
    account: config.account,
  });

  // Create read proxy
  const read = new Proxy({} as TypedReadMethods<TAbi>, {
    get(_target, prop: string) {
      return async (args: unknown[]) => {
        return contract.read(prop, args);
      };
    },
  });

  // Create write proxy
  const write = new Proxy({} as TypedWriteMethods<TAbi>, {
    get(_target, prop: string) {
      return async (args: unknown[], options?: { value?: bigint; gasLimit?: bigint }) => {
        return contract.write(prop, args, options);
      };
    },
  });

  // Create events proxy
  const events = new Proxy({} as TypedEventMethods<TAbi>, {
    get(_target, prop: string) {
      return async (filter?: { fromBlock?: number | 'latest'; toBlock?: number | 'latest'; args?: Record<string, unknown> }) => {
        const results = await contract.queryEvents(prop, filter);
        return results.map((r) => ({
          args: r.args,
          blockNumber: r.log.blockNumber,
          transactionHash: r.log.transactionHash,
        }));
      };
    },
  });

  // Create encode proxy
  const encode = new Proxy({} as TypedContract<TAbi>['encode'], {
    get(_target, prop: string) {
      return (args: unknown[]) => {
        return contract.encodeFunction(prop, args);
      };
    },
  });

  return {
    address: config.address,
    abi: config.abi,
    read,
    write,
    events,
    encode,
  };
}

// ============ Pre-typed Standard Contracts ============

/**
 * ERC-20 ABI with const assertion for type inference
 */
export const ERC20_TYPED_ABI = [
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
] as const;

/**
 * Type for ERC-20 contract
 */
export type ERC20Contract = TypedContract<typeof ERC20_TYPED_ABI>;

/**
 * Create a typed ERC-20 contract
 */
export function createERC20Contract(config: {
  address: Address;
  rpc: RPCClient;
  account?: Account;
}): ERC20Contract {
  return createTypedContract({
    ...config,
    abi: ERC20_TYPED_ABI,
  });
}

/**
 * ERC-721 ABI with const assertion
 */
export const ERC721_TYPED_ABI = [
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
    name: 'getApproved',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
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
] as const;

/**
 * Type for ERC-721 contract
 */
export type ERC721Contract = TypedContract<typeof ERC721_TYPED_ABI>;

/**
 * Create a typed ERC-721 contract
 */
export function createERC721Contract(config: {
  address: Address;
  rpc: RPCClient;
  account?: Account;
}): ERC721Contract {
  return createTypedContract({
    ...config,
    abi: ERC721_TYPED_ABI,
  });
}

/**
 * Core type definitions for eth-agent
 */

// Hex string type (0x prefixed)
export type Hex = `0x${string}`;

// Address is a 20-byte hex string
export type Address = Hex & { readonly __brand: 'Address' };

// Hash is a 32-byte hex string
export type Hash = Hex & { readonly __brand: 'Hash' };

// Signature components
export interface Signature {
  readonly r: Hex;
  readonly s: Hex;
  readonly v: number;
  readonly yParity: 0 | 1;
}

// Transaction types
export type TransactionType = 'legacy' | 'eip2930' | 'eip1559' | 'eip4844';

// Base transaction fields common to all types
export interface TransactionBase {
  readonly to?: Address;
  readonly value?: bigint;
  readonly data?: Hex;
  readonly nonce?: number;
  readonly chainId?: number;
}

// Legacy transaction (type 0)
export interface LegacyTransaction extends TransactionBase {
  readonly type?: 'legacy';
  readonly gasPrice?: bigint;
  readonly gasLimit?: bigint;
}

// EIP-2930 transaction (type 1) with access list
export interface EIP2930Transaction extends TransactionBase {
  readonly type: 'eip2930';
  readonly gasPrice?: bigint;
  readonly gasLimit?: bigint;
  readonly accessList?: AccessList;
}

// EIP-1559 transaction (type 2) with priority fees
export interface EIP1559Transaction extends TransactionBase {
  readonly type: 'eip1559';
  readonly maxFeePerGas?: bigint;
  readonly maxPriorityFeePerGas?: bigint;
  readonly gasLimit?: bigint;
  readonly accessList?: AccessList;
}

// Union of all transaction types
export type Transaction = LegacyTransaction | EIP2930Transaction | EIP1559Transaction;

// Access list for EIP-2930/1559
export type AccessList = ReadonlyArray<AccessListItem>;

export interface AccessListItem {
  readonly address: Address;
  readonly storageKeys: ReadonlyArray<Hash>;
}

// Signed transaction
export interface SignedTransaction {
  readonly raw: Hex;
  readonly hash: Hash;
  readonly transaction: Transaction;
  readonly signature: Signature;
}

// Transaction receipt
export interface TransactionReceipt {
  transactionHash: Hash;
  transactionIndex: number;
  blockHash: Hash;
  blockNumber: number;
  from: Address;
  to?: Address;
  cumulativeGasUsed: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  contractAddress?: Address;
  logs: Log[];
  logsBloom: Hex;
  status: 'success' | 'reverted';
  type: TransactionType;
}

// Event log
export interface Log {
  address: Address;
  topics: Hash[];
  data: Hex;
  blockNumber: number;
  transactionHash: Hash;
  transactionIndex: number;
  blockHash: Hash;
  logIndex: number;
  removed: boolean;
}

// Block
export interface Block {
  number: number;
  hash: Hash;
  parentHash: Hash;
  nonce: Hex;
  sha3Uncles: Hash;
  logsBloom: Hex;
  transactionsRoot: Hash;
  stateRoot: Hash;
  receiptsRoot: Hash;
  miner: Address;
  difficulty: bigint;
  totalDifficulty: bigint;
  extraData: Hex;
  size: number;
  gasLimit: bigint;
  gasUsed: bigint;
  timestamp: number;
  transactions: Array<Hash | TransactionResponse>;
  uncles: Hash[];
  baseFeePerGas?: bigint;
}

// Transaction response from RPC
export interface TransactionResponse {
  hash: Hash;
  nonce: number;
  blockHash?: Hash;
  blockNumber?: number;
  transactionIndex?: number;
  from: Address;
  to?: Address;
  value: bigint;
  gasPrice?: bigint;
  gas: bigint;
  input: Hex;
  v: number;
  r: Hex;
  s: Hex;
  type: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  accessList?: AccessList;
  chainId?: number;
}

// ABI types
// Note: Arrays are represented as string types to avoid circular reference
export type ABIType =
  | 'address'
  | 'bool'
  | 'string'
  | 'bytes'
  | `bytes${number}`
  | `uint${number}`
  | `int${number}`
  | `address[]`
  | `bool[]`
  | `string[]`
  | `bytes[]`
  | `uint256[]`
  | `int256[]`
  | 'tuple'
  | `tuple[]`;

export interface ABIParameter {
  readonly name: string;
  readonly type: ABIType | string;
  readonly indexed?: boolean;
  readonly components?: ReadonlyArray<ABIParameter>;
}

export interface ABIFunction {
  readonly type: 'function';
  readonly name: string;
  readonly inputs: ReadonlyArray<ABIParameter>;
  readonly outputs: ReadonlyArray<ABIParameter>;
  readonly stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
}

export interface ABIEvent {
  readonly type: 'event';
  readonly name: string;
  readonly inputs: ReadonlyArray<ABIParameter>;
  readonly anonymous?: boolean;
}

export interface ABIError {
  readonly type: 'error';
  readonly name: string;
  readonly inputs: ReadonlyArray<ABIParameter>;
}

export interface ABIConstructor {
  readonly type: 'constructor';
  readonly inputs: ReadonlyArray<ABIParameter>;
  readonly stateMutability: 'nonpayable' | 'payable';
}

export interface ABIFallback {
  readonly type: 'fallback';
  readonly stateMutability: 'nonpayable' | 'payable';
}

export interface ABIReceive {
  readonly type: 'receive';
  readonly stateMutability: 'payable';
}

export type ABIItem = ABIFunction | ABIEvent | ABIError | ABIConstructor | ABIFallback | ABIReceive;
export type ABI = ReadonlyArray<ABIItem>;

// Amount with multiple representations
export interface Amount {
  readonly wei: bigint;
  readonly eth: string;
  readonly usd?: number;
  readonly formatted: string;
}

// Gas prices
export interface GasPrices {
  readonly slow: bigint;
  readonly standard: bigint;
  readonly fast: bigint;
}

// Network/Chain configuration
export interface Chain {
  readonly id: number;
  readonly name: string;
  readonly network: string;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly rpcUrls: ReadonlyArray<string>;
  readonly blockExplorers?: ReadonlyArray<{
    readonly name: string;
    readonly url: string;
  }>;
  readonly testnet?: boolean;
}

// RPC error
export interface RPCError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

// JSON-RPC request
export interface JSONRPCRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: ReadonlyArray<unknown>;
}

// JSON-RPC response
export interface JSONRPCResponse<T = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly result?: T;
  readonly error?: RPCError;
}

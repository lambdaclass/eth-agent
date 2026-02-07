/**
 * JSON-RPC client for Ethereum
 * Type-safe, minimal RPC implementation
 */

import type {
  Hex,
  Address,
  Hash,
  Block,
  TransactionResponse,
  TransactionReceipt,
  Log,
  JSONRPCRequest,
  JSONRPCResponse,
  RPCError,
} from '../core/types.js';
import { hexToBigInt, hexToNumber, numberToHex } from '../core/hex.js';

export interface RPCOptions {
  url: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export class RPCClient {
  private readonly url: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly headers: Record<string, string>;
  // Start with random offset to prevent ID collisions between multiple instances
  // or when connections persist across app restarts
  private requestId = Math.floor(Math.random() * 1_000_000_000);

  constructor(options: RPCOptions | string) {
    if (typeof options === 'string') {
      this.url = options;
      this.timeout = 30000;
      this.retries = 3;
      this.retryDelay = 1000;
      this.headers = {};
    } else {
      this.url = options.url;
      this.timeout = options.timeout ?? 30000;
      this.retries = options.retries ?? 3;
      this.retryDelay = options.retryDelay ?? 1000;
      this.headers = options.headers ?? {};
    }
  }

  /**
   * Create RPC client from URL
   */
  static connect(url: string): RPCClient {
    return new RPCClient(url);
  }

  /**
   * Send a raw JSON-RPC request
   */
  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.headers,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = (await response.json()) as JSONRPCResponse<T>;

        if (json.error) {
          const error = json.error as RPCError;
          throw new RPCRequestError(error.code, error.message, error.data);
        }

        return json.result as T;
      } catch (err) {
        lastError = err as Error;

        // Check if this is an RPC error
        if (err instanceof RPCRequestError) {
          // Only retry transient RPC errors
          if (!err.isTransient()) {
            throw err;
          }
          // Fall through to retry logic for transient errors
        }

        // Retry on network errors and transient RPC errors
        if (attempt < this.retries) {
          await sleep(this.retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  /**
   * Send multiple requests in a batch
   */
  async batch<T extends unknown[]>(
    requests: Array<{ method: string; params?: unknown[] }>
  ): Promise<T> {
    const batchRequest = requests.map((req) => ({
      jsonrpc: '2.0' as const,
      id: ++this.requestId,
      method: req.method,
      params: req.params ?? [],
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(batchRequest),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const results = (await response.json()) as JSONRPCResponse[];

    // Sort by ID to maintain order
    results.sort((a, b) => (Number(a.id) > Number(b.id) ? 1 : -1));

    return results.map((r) => {
      if (r.error) {
        const error = r.error as RPCError;
        throw new RPCRequestError(error.code, error.message, error.data);
      }
      return r.result;
    }) as T;
  }

  // ============ Standard Ethereum RPC Methods ============

  /**
   * Get current chain ID
   */
  async getChainId(): Promise<number> {
    const result = await this.request<Hex>('eth_chainId');
    return hexToNumber(result);
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    const result = await this.request<Hex>('eth_blockNumber');
    return hexToNumber(result);
  }

  /**
   * Get gas price
   */
  async getGasPrice(): Promise<bigint> {
    const result = await this.request<Hex>('eth_gasPrice');
    return hexToBigInt(result);
  }

  /**
   * Get max priority fee per gas (EIP-1559)
   */
  async getMaxPriorityFeePerGas(): Promise<bigint> {
    const result = await this.request<Hex>('eth_maxPriorityFeePerGas');
    return hexToBigInt(result);
  }

  /**
   * Get balance of an address
   */
  async getBalance(address: Address, block: 'latest' | 'pending' | number = 'latest'): Promise<bigint> {
    const blockParam = typeof block === 'number' ? numberToHex(block) : block;
    const result = await this.request<Hex>('eth_getBalance', [address, blockParam]);
    return hexToBigInt(result);
  }

  /**
   * Get transaction count (nonce)
   */
  async getTransactionCount(
    address: Address,
    block: 'latest' | 'pending' | number = 'pending'
  ): Promise<number> {
    const blockParam = typeof block === 'number' ? numberToHex(block) : block;
    const result = await this.request<Hex>('eth_getTransactionCount', [address, blockParam]);
    return hexToNumber(result);
  }

  /**
   * Get code at an address
   */
  async getCode(address: Address, block: 'latest' | number = 'latest'): Promise<Hex> {
    const blockParam = typeof block === 'number' ? numberToHex(block) : block;
    return this.request<Hex>('eth_getCode', [address, blockParam]);
  }

  /**
   * Get storage at a position
   */
  async getStorageAt(
    address: Address,
    position: Hex | number,
    block: 'latest' | number = 'latest'
  ): Promise<Hex> {
    const posParam = typeof position === 'number' ? numberToHex(position) : position;
    const blockParam = typeof block === 'number' ? numberToHex(block) : block;
    return this.request<Hex>('eth_getStorageAt', [address, posParam, blockParam]);
  }

  /**
   * Get block by number
   */
  async getBlock(
    block: 'latest' | 'pending' | number,
    includeTransactions = false
  ): Promise<Block | null> {
    const blockParam = typeof block === 'number' ? numberToHex(block) : block;
    const result = await this.request<RawBlock | null>('eth_getBlockByNumber', [
      blockParam,
      includeTransactions,
    ]);
    return result ? parseBlock(result) : null;
  }

  /**
   * Get block by hash
   */
  async getBlockByHash(hash: Hash, includeTransactions = false): Promise<Block | null> {
    const result = await this.request<RawBlock | null>('eth_getBlockByHash', [
      hash,
      includeTransactions,
    ]);
    return result ? parseBlock(result) : null;
  }

  /**
   * Get transaction by hash
   */
  async getTransaction(hash: Hash): Promise<TransactionResponse | null> {
    const result = await this.request<RawTransaction | null>('eth_getTransactionByHash', [hash]);
    return result ? parseTransaction(result) : null;
  }

  /**
   * Get transaction by hash (alias)
   */
  async getTransactionByHash(hash: Hash): Promise<TransactionResponse | null> {
    return this.getTransaction(hash);
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(hash: Hash): Promise<TransactionReceipt | null> {
    const result = await this.request<RawReceipt | null>('eth_getTransactionReceipt', [hash]);
    return result ? parseReceipt(result) : null;
  }

  /**
   * Call a contract (read-only)
   */
  async call(
    tx: { to: Address; data?: Hex; from?: Address; value?: bigint },
    block: 'latest' | 'pending' | number = 'latest'
  ): Promise<Hex> {
    const blockParam = typeof block === 'number' ? numberToHex(block) : block;
    const callObject: Record<string, unknown> = {
      to: tx.to,
    };
    if (tx.data) callObject['data'] = tx.data;
    if (tx.from) callObject['from'] = tx.from;
    if (tx.value) callObject['value'] = numberToHex(tx.value);

    return this.request<Hex>('eth_call', [callObject, blockParam]);
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(tx: {
    to?: Address;
    from?: Address;
    data?: Hex;
    value?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  }): Promise<bigint> {
    const callObject: Record<string, unknown> = {};
    if (tx.to) callObject['to'] = tx.to;
    if (tx.from) callObject['from'] = tx.from;
    if (tx.data) callObject['data'] = tx.data;
    if (tx.value) callObject['value'] = numberToHex(tx.value);
    if (tx.gasPrice) callObject['gasPrice'] = numberToHex(tx.gasPrice);
    if (tx.maxFeePerGas) callObject['maxFeePerGas'] = numberToHex(tx.maxFeePerGas);
    if (tx.maxPriorityFeePerGas) callObject['maxPriorityFeePerGas'] = numberToHex(tx.maxPriorityFeePerGas);

    const result = await this.request<Hex>('eth_estimateGas', [callObject]);
    return hexToBigInt(result);
  }

  /**
   * Send a signed transaction
   */
  async sendRawTransaction(signedTx: Hex): Promise<Hash> {
    return this.request<Hash>('eth_sendRawTransaction', [signedTx]);
  }

  /**
   * Get logs matching filter
   */
  async getLogs(filter: {
    address?: Address | Address[];
    topics?: (Hash | Hash[] | null)[];
    fromBlock?: 'latest' | number;
    toBlock?: 'latest' | number;
    blockHash?: Hash;
  }): Promise<Log[]> {
    const filterObject: Record<string, unknown> = {};

    if (filter.address) filterObject['address'] = filter.address;
    if (filter.topics) filterObject['topics'] = filter.topics;
    if (filter.blockHash) {
      filterObject['blockHash'] = filter.blockHash;
    } else {
      if (filter.fromBlock !== undefined) {
        filterObject['fromBlock'] =
          typeof filter.fromBlock === 'number' ? numberToHex(filter.fromBlock) : filter.fromBlock;
      }
      if (filter.toBlock !== undefined) {
        filterObject['toBlock'] =
          typeof filter.toBlock === 'number' ? numberToHex(filter.toBlock) : filter.toBlock;
      }
    }

    const result = await this.request<RawLog[]>('eth_getLogs', [filterObject]);
    return result.map(parseLog);
  }

  /**
   * Get fee history (EIP-1559)
   */
  async getFeeHistory(
    blockCount: number,
    newestBlock: 'latest' | number,
    rewardPercentiles: number[] = []
  ): Promise<FeeHistory> {
    const blockParam = typeof newestBlock === 'number' ? numberToHex(newestBlock) : newestBlock;
    const result = await this.request<RawFeeHistory>('eth_feeHistory', [
      numberToHex(blockCount),
      blockParam,
      rewardPercentiles,
    ]);

    const feeHistory: FeeHistory = {
      oldestBlock: hexToNumber(result.oldestBlock),
      baseFeePerGas: result.baseFeePerGas.map(hexToBigInt),
      gasUsedRatio: result.gasUsedRatio,
    };
    if (result.reward) {
      feeHistory.reward = result.reward.map((r) => r.map(hexToBigInt));
    }
    return feeHistory;
  }

  /**
   * Wait for transaction to be mined
   */
  async waitForTransaction(
    hash: Hash,
    confirmations = 1,
    timeout = 60000
  ): Promise<TransactionReceipt> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const receipt = await this.getTransactionReceipt(hash);

      if (receipt) {
        if (confirmations <= 1) {
          return receipt;
        }

        const currentBlock = await this.getBlockNumber();
        const confirms = currentBlock - receipt.blockNumber + 1;

        if (confirms >= confirmations) {
          return receipt;
        }
      }

      await sleep(1000);
    }

    throw new Error(`Transaction ${hash} not mined within ${timeout}ms`);
  }
}

// ============ Error Types ============

export class RPCRequestError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'RPCRequestError';
  }

  /**
   * Check if this error is transient (may succeed on retry)
   */
  isTransient(): boolean {
    return isTransientRPCError(this);
  }
}

// ============ Error Classification ============

/**
 * Standard JSON-RPC error codes that indicate permanent failures
 * These errors will always fail regardless of retries
 */
const PERMANENT_ERROR_CODES = new Set([
  -32700, // Parse error - invalid JSON
  -32600, // Invalid request - not a valid request object
  -32601, // Method not found - method does not exist
  -32602, // Invalid params - invalid method parameters
  -32603, // Internal error - internal JSON-RPC error (sometimes transient, but often indicates a bug)
]);

/**
 * Patterns in error messages that indicate transient failures
 * These errors may succeed on retry
 */
const TRANSIENT_ERROR_PATTERNS = [
  'rate limit',
  'too many requests',
  'timeout',
  'timed out',
  'overloaded',
  'capacity',
  'try again',
  'temporarily unavailable',
  'service unavailable',
  'connection reset',
  'econnreset',
  'socket hang up',
  'network error',
];

/**
 * Ethereum-specific error codes that are permanent
 * See: https://eips.ethereum.org/EIPS/eip-1474
 */
const PERMANENT_ETH_ERROR_CODES = new Set([
  -32000, // Generic server error (context-dependent, but often permanent like "nonce too low")
]);

/**
 * Patterns that indicate permanent Ethereum errors even with -32000 code
 */
const PERMANENT_ETH_ERROR_PATTERNS = [
  'nonce too low',
  'nonce too high',
  'insufficient funds',
  'gas too low',
  'intrinsic gas too low',
  'exceeds block gas limit',
  'already known',
  'replacement transaction underpriced',
  'transaction underpriced',
  'invalid sender',
  'invalid signature',
];

/**
 * Determine if an RPC error is transient (may succeed on retry)
 */
export function isTransientRPCError(error: RPCRequestError): boolean {
  const code = error.code;
  const message = error.message.toLowerCase();

  // Standard JSON-RPC permanent errors - never retry
  if (PERMANENT_ERROR_CODES.has(code)) {
    return false;
  }

  // Check for permanent Ethereum-specific errors
  if (PERMANENT_ETH_ERROR_CODES.has(code)) {
    // These are usually permanent, but check message to be sure
    if (PERMANENT_ETH_ERROR_PATTERNS.some(pattern => message.includes(pattern))) {
      return false;
    }
  }

  // Check for transient patterns in message
  if (TRANSIENT_ERROR_PATTERNS.some(pattern => message.includes(pattern))) {
    return true;
  }

  // For -32005 (rate limit) always retry
  if (code === -32005) {
    return true;
  }

  // Default: treat unknown RPC errors as permanent to avoid infinite retries
  // This is safer than assuming all errors are transient
  return false;
}

// ============ Raw Types (from RPC) ============

interface RawBlock {
  number: Hex;
  hash: Hash;
  parentHash: Hash;
  nonce: Hex;
  sha3Uncles: Hash;
  logsBloom: Hex;
  transactionsRoot: Hash;
  stateRoot: Hash;
  receiptsRoot: Hash;
  miner: Address;
  difficulty: Hex;
  totalDifficulty: Hex;
  extraData: Hex;
  size: Hex;
  gasLimit: Hex;
  gasUsed: Hex;
  timestamp: Hex;
  transactions: Hash[] | RawTransaction[];
  uncles: Hash[];
  baseFeePerGas?: Hex;
}

interface RawTransaction {
  hash: Hash;
  nonce: Hex;
  blockHash?: Hash;
  blockNumber?: Hex;
  transactionIndex?: Hex;
  from: Address;
  to?: Address;
  value: Hex;
  gasPrice?: Hex;
  gas: Hex;
  input: Hex;
  v: Hex;
  r: Hex;
  s: Hex;
  type: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  accessList?: Array<{ address: Address; storageKeys: Hash[] }>;
  chainId?: Hex;
}

interface RawReceipt {
  transactionHash: Hash;
  transactionIndex: Hex;
  blockHash: Hash;
  blockNumber: Hex;
  from: Address;
  to?: Address;
  cumulativeGasUsed: Hex;
  gasUsed: Hex;
  effectiveGasPrice: Hex;
  contractAddress?: Address;
  logs: RawLog[];
  logsBloom: Hex;
  status: Hex;
  type: Hex;
}

interface RawLog {
  address: Address;
  topics: Hash[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hash;
  transactionIndex: Hex;
  blockHash: Hash;
  logIndex: Hex;
  removed: boolean;
}

interface RawFeeHistory {
  oldestBlock: Hex;
  baseFeePerGas: Hex[];
  gasUsedRatio: number[];
  reward?: Hex[][];
}

export interface FeeHistory {
  oldestBlock: number;
  baseFeePerGas: bigint[];
  gasUsedRatio: number[];
  reward?: bigint[][];
}

// ============ Parsing Functions ============

function parseBlock(raw: RawBlock): Block {
  const isFullTxs = raw.transactions.length > 0 && typeof raw.transactions[0] === 'object';

  const block: Block = {
    number: hexToNumber(raw.number),
    hash: raw.hash,
    parentHash: raw.parentHash,
    nonce: raw.nonce,
    sha3Uncles: raw.sha3Uncles,
    logsBloom: raw.logsBloom,
    transactionsRoot: raw.transactionsRoot,
    stateRoot: raw.stateRoot,
    receiptsRoot: raw.receiptsRoot,
    miner: raw.miner,
    difficulty: hexToBigInt(raw.difficulty),
    totalDifficulty: hexToBigInt(raw.totalDifficulty),
    extraData: raw.extraData,
    size: hexToNumber(raw.size),
    gasLimit: hexToBigInt(raw.gasLimit),
    gasUsed: hexToBigInt(raw.gasUsed),
    timestamp: hexToNumber(raw.timestamp),
    transactions: isFullTxs
      ? (raw.transactions as RawTransaction[]).map(parseTransaction)
      : (raw.transactions as Hash[]),
    uncles: raw.uncles,
  };
  if (raw.baseFeePerGas) {
    block.baseFeePerGas = hexToBigInt(raw.baseFeePerGas);
  }
  return block;
}

function parseTransaction(raw: RawTransaction): TransactionResponse {
  const tx: TransactionResponse = {
    hash: raw.hash,
    nonce: hexToNumber(raw.nonce),
    from: raw.from,
    value: hexToBigInt(raw.value),
    gas: hexToBigInt(raw.gas),
    input: raw.input,
    v: hexToNumber(raw.v),
    r: raw.r,
    s: raw.s,
    type: hexToNumber(raw.type),
  };
  if (raw.blockHash) tx.blockHash = raw.blockHash;
  if (raw.blockNumber) tx.blockNumber = hexToNumber(raw.blockNumber);
  if (raw.transactionIndex) tx.transactionIndex = hexToNumber(raw.transactionIndex);
  if (raw.to) tx.to = raw.to;
  if (raw.gasPrice) tx.gasPrice = hexToBigInt(raw.gasPrice);
  if (raw.maxFeePerGas) tx.maxFeePerGas = hexToBigInt(raw.maxFeePerGas);
  if (raw.maxPriorityFeePerGas) tx.maxPriorityFeePerGas = hexToBigInt(raw.maxPriorityFeePerGas);
  if (raw.accessList) {
    tx.accessList = raw.accessList.map((a) => ({
      address: a.address,
      storageKeys: a.storageKeys,
    }));
  }
  if (raw.chainId) tx.chainId = hexToNumber(raw.chainId);
  return tx;
}

function parseReceipt(raw: RawReceipt): TransactionReceipt {
  const receipt: TransactionReceipt = {
    transactionHash: raw.transactionHash,
    transactionIndex: hexToNumber(raw.transactionIndex),
    blockHash: raw.blockHash,
    blockNumber: hexToNumber(raw.blockNumber),
    from: raw.from,
    cumulativeGasUsed: hexToBigInt(raw.cumulativeGasUsed),
    gasUsed: hexToBigInt(raw.gasUsed),
    effectiveGasPrice: hexToBigInt(raw.effectiveGasPrice),
    logs: raw.logs.map(parseLog),
    logsBloom: raw.logsBloom,
    status: raw.status === '0x1' ? 'success' : 'reverted',
    type: raw.type === '0x0' ? 'legacy' : raw.type === '0x1' ? 'eip2930' : 'eip1559',
  };
  if (raw.to) receipt.to = raw.to;
  if (raw.contractAddress) receipt.contractAddress = raw.contractAddress;
  return receipt;
}

function parseLog(raw: RawLog): Log {
  return {
    address: raw.address,
    topics: raw.topics,
    data: raw.data,
    blockNumber: hexToNumber(raw.blockNumber),
    transactionHash: raw.transactionHash,
    transactionIndex: hexToNumber(raw.transactionIndex),
    blockHash: raw.blockHash,
    logIndex: hexToNumber(raw.logIndex),
    removed: raw.removed,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

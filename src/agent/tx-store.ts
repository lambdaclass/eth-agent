/**
 * Transaction Store
 * Persistence layer for tracking pending transactions across restarts
 */

import type { Address, Hash, Hex, TransactionReceipt } from '../core/types.js';

/**
 * Status of a tracked transaction
 */
export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'dropped';

/**
 * A pending transaction being tracked
 */
export interface PendingTransaction {
  /** Transaction hash */
  hash: Hash;
  /** Sender address */
  from: Address;
  /** Recipient address */
  to: Address;
  /** Value in wei */
  value: bigint;
  /** Transaction nonce */
  nonce: number;
  /** Chain ID */
  chainId: number;
  /** Gas limit */
  gasLimit: bigint;
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: bigint;
  /** Gas price (legacy) */
  gasPrice?: bigint;
  /** Call data */
  data?: Hex;
  /** Current status */
  status: TransactionStatus;
  /** Timestamp when transaction was sent (ms since epoch) */
  sentAt: number;
  /** Timestamp when transaction was confirmed (ms since epoch) */
  confirmedAt?: number;
  /** Block number when confirmed */
  blockNumber?: number;
  /** Gas used (after confirmation) */
  gasUsed?: bigint;
  /** Description/label for the transaction */
  description?: string;
}

/**
 * Serialized form of PendingTransaction (bigints as strings)
 */
interface SerializedTransaction {
  hash: Hash;
  from: Address;
  to: Address;
  value: string;
  nonce: number;
  chainId: number;
  gasLimit: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  data?: Hex;
  status: TransactionStatus;
  sentAt: number;
  confirmedAt?: number;
  blockNumber?: number;
  gasUsed?: string;
  description?: string;
}

/**
 * Interface for transaction storage backends
 */
export interface TransactionStore {
  /**
   * Save a new pending transaction
   */
  save(tx: PendingTransaction): Promise<void>;

  /**
   * Load a transaction by hash
   */
  load(txHash: Hash): Promise<PendingTransaction | null>;

  /**
   * List all pending transactions
   */
  listPending(): Promise<PendingTransaction[]>;

  /**
   * List all transactions (including confirmed/failed)
   */
  listAll(): Promise<PendingTransaction[]>;

  /**
   * Mark a transaction as confirmed with receipt data
   */
  markConfirmed(txHash: Hash, receipt: TransactionReceipt): Promise<void>;

  /**
   * Mark a transaction as failed
   */
  markFailed(txHash: Hash, reason?: string): Promise<void>;

  /**
   * Mark a transaction as dropped (replaced or timed out)
   */
  markDropped(txHash: Hash, reason?: string): Promise<void>;

  /**
   * Delete a transaction from the store
   */
  delete(txHash: Hash): Promise<boolean>;

  /**
   * Clear all transactions
   */
  clear(): Promise<void>;
}

/**
 * In-memory transaction store (for testing or ephemeral use)
 */
export class MemoryTransactionStore implements TransactionStore {
  private readonly transactions: Map<Hash, PendingTransaction> = new Map();

  async save(tx: PendingTransaction): Promise<void> {
    this.transactions.set(tx.hash, { ...tx });
  }

  async load(txHash: Hash): Promise<PendingTransaction | null> {
    return this.transactions.get(txHash) ?? null;
  }

  async listPending(): Promise<PendingTransaction[]> {
    return Array.from(this.transactions.values()).filter(
      (tx) => tx.status === 'pending'
    );
  }

  async listAll(): Promise<PendingTransaction[]> {
    return Array.from(this.transactions.values());
  }

  async markConfirmed(txHash: Hash, receipt: TransactionReceipt): Promise<void> {
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = receipt.status === 'success' ? 'confirmed' : 'failed';
      tx.confirmedAt = Date.now();
      tx.blockNumber = receipt.blockNumber;
      tx.gasUsed = receipt.gasUsed;
    }
  }

  async markFailed(txHash: Hash): Promise<void> {
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = 'failed';
      tx.confirmedAt = Date.now();
    }
  }

  async markDropped(txHash: Hash): Promise<void> {
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = 'dropped';
      tx.confirmedAt = Date.now();
    }
  }

  async delete(txHash: Hash): Promise<boolean> {
    return this.transactions.delete(txHash);
  }

  async clear(): Promise<void> {
    this.transactions.clear();
  }
}

/**
 * File-based transaction store (JSON file)
 * Suitable for simple applications and development
 */
export class FileTransactionStore implements TransactionStore {
  private transactions: Map<Hash, PendingTransaction> = new Map();
  private readonly filePath: string;
  private loaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private serialize(tx: PendingTransaction): SerializedTransaction {
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      nonce: tx.nonce,
      chainId: tx.chainId,
      gasLimit: tx.gasLimit.toString(),
      maxFeePerGas: tx.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
      gasPrice: tx.gasPrice?.toString(),
      data: tx.data,
      status: tx.status,
      sentAt: tx.sentAt,
      confirmedAt: tx.confirmedAt,
      blockNumber: tx.blockNumber,
      gasUsed: tx.gasUsed?.toString(),
      description: tx.description,
    };
  }

  private deserialize(data: SerializedTransaction): PendingTransaction {
    return {
      hash: data.hash,
      from: data.from,
      to: data.to,
      value: BigInt(data.value),
      nonce: data.nonce,
      chainId: data.chainId,
      gasLimit: BigInt(data.gasLimit),
      maxFeePerGas: data.maxFeePerGas ? BigInt(data.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: data.maxPriorityFeePerGas ? BigInt(data.maxPriorityFeePerGas) : undefined,
      gasPrice: data.gasPrice ? BigInt(data.gasPrice) : undefined,
      data: data.data,
      status: data.status,
      sentAt: data.sentAt,
      confirmedAt: data.confirmedAt,
      blockNumber: data.blockNumber,
      gasUsed: data.gasUsed ? BigInt(data.gasUsed) : undefined,
      description: data.description,
    };
  }

  private async loadFromFile(): Promise<void> {
    if (this.loaded) return;

    try {
      // Dynamic import for Node.js fs module
      const fs = await import('fs/promises');
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content) as SerializedTransaction[];

      this.transactions.clear();
      for (const item of data) {
        const tx = this.deserialize(item);
        this.transactions.set(tx.hash, tx);
      }
    } catch (error) {
      // File doesn't exist or is invalid - start fresh
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to load transaction store: ${String(error)}`);
      }
      this.transactions.clear();
    }

    this.loaded = true;
  }

  private async saveToFile(): Promise<void> {
    const fs = await import('fs/promises');
    const data = Array.from(this.transactions.values()).map((tx) => this.serialize(tx));
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async save(tx: PendingTransaction): Promise<void> {
    await this.loadFromFile();
    this.transactions.set(tx.hash, { ...tx });
    await this.saveToFile();
  }

  async load(txHash: Hash): Promise<PendingTransaction | null> {
    await this.loadFromFile();
    return this.transactions.get(txHash) ?? null;
  }

  async listPending(): Promise<PendingTransaction[]> {
    await this.loadFromFile();
    return Array.from(this.transactions.values()).filter(
      (tx) => tx.status === 'pending'
    );
  }

  async listAll(): Promise<PendingTransaction[]> {
    await this.loadFromFile();
    return Array.from(this.transactions.values());
  }

  async markConfirmed(txHash: Hash, receipt: TransactionReceipt): Promise<void> {
    await this.loadFromFile();
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = receipt.status === 'success' ? 'confirmed' : 'failed';
      tx.confirmedAt = Date.now();
      tx.blockNumber = receipt.blockNumber;
      tx.gasUsed = receipt.gasUsed;
      await this.saveToFile();
    }
  }

  async markFailed(txHash: Hash): Promise<void> {
    await this.loadFromFile();
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = 'failed';
      tx.confirmedAt = Date.now();
      await this.saveToFile();
    }
  }

  async markDropped(txHash: Hash): Promise<void> {
    await this.loadFromFile();
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = 'dropped';
      tx.confirmedAt = Date.now();
      await this.saveToFile();
    }
  }

  async delete(txHash: Hash): Promise<boolean> {
    await this.loadFromFile();
    const deleted = this.transactions.delete(txHash);
    if (deleted) {
      await this.saveToFile();
    }
    return deleted;
  }

  async clear(): Promise<void> {
    this.transactions.clear();
    await this.saveToFile();
  }
}

/**
 * Create a memory-based transaction store
 */
export function createMemoryStore(): TransactionStore {
  return new MemoryTransactionStore();
}

/**
 * Create a file-based transaction store
 */
export function createFileStore(filePath: string): TransactionStore {
  return new FileTransactionStore(filePath);
}

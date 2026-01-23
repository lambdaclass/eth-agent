/**
 * Transaction acceleration - speed up or cancel pending transactions
 */

import type { Address, Hash, Hex } from '../core/types.js';
import type { RPCClient } from './rpc.js';
import type { Account } from './account.js';
import { TransactionBuilder } from './transaction.js';
import { addPercent } from '../core/units.js';

export interface PendingTransaction {
  hash: Hash;
  from: Address;
  to: Address;
  value: bigint;
  nonce: number;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  data?: Hex;
}

export interface AccelerationResult {
  success: boolean;
  originalHash: Hash;
  newHash: Hash;
  summary: string;
  gasIncrease: {
    from: bigint;
    to: bigint;
    percentIncrease: number;
  };
}

export interface CancellationResult {
  success: boolean;
  originalHash: Hash;
  cancellationHash: Hash;
  summary: string;
}

/**
 * Transaction accelerator for speeding up or canceling pending TXs
 */
export class TransactionAccelerator {
  private readonly rpc: RPCClient;
  private readonly defaultGasIncreasePercent = 20; // 20% increase by default

  constructor(rpc: RPCClient) {
    this.rpc = rpc;
  }

  /**
   * Get pending transaction details
   */
  async getPendingTransaction(hash: Hash): Promise<PendingTransaction | null> {
    try {
      const tx = await this.rpc.getTransactionByHash(hash);
      if (!tx) return null;

      // Check if still pending
      if (tx.blockNumber !== null) {
        return null; // Already mined
      }

      // tx.to should always exist for pending transactions we care about
      if (!tx.to) {
        return null; // Contract creation, can't accelerate
      }
      const pending: PendingTransaction = {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        nonce: tx.nonce,
        data: tx.input,
      };
      if (tx.gasPrice !== undefined) {
        pending.gasPrice = tx.gasPrice;
      }
      if (tx.maxFeePerGas !== undefined) {
        pending.maxFeePerGas = tx.maxFeePerGas;
      }
      if (tx.maxPriorityFeePerGas !== undefined) {
        pending.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
      }
      return pending;
    } catch {
      return null;
    }
  }

  /**
   * Speed up a pending transaction by resubmitting with higher gas
   */
  async speedUp(
    hash: Hash,
    account: Account,
    options?: {
      gasIncreasePercent?: number;
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
    }
  ): Promise<AccelerationResult> {
    const pending = await this.getPendingTransaction(hash);
    if (!pending) {
      throw new Error(`Transaction ${hash} not found or already mined`);
    }

    if (pending.from.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error('Account does not own this transaction');
    }

    const increasePercent = options?.gasIncreasePercent ?? this.defaultGasIncreasePercent;
    const chainId = await this.rpc.getChainId();

    let builder = TransactionBuilder.create()
      .to(pending.to)
      .value(pending.value)
      .nonce(pending.nonce)
      .chainId(chainId);

    if (pending.data) {
      builder = builder.data(pending.data);
    }

    // Calculate new gas prices
    let originalGas: bigint;
    let newGas: bigint;

    if (pending.maxFeePerGas) {
      // EIP-1559 transaction
      originalGas = pending.maxFeePerGas;
      newGas = options?.maxFeePerGas ?? addPercent(pending.maxFeePerGas, increasePercent);
      const newPriorityFee = options?.maxPriorityFeePerGas ??
        addPercent(pending.maxPriorityFeePerGas ?? 1_000_000_000n, increasePercent);

      builder = builder
        .maxFeePerGas(newGas)
        .maxPriorityFeePerGas(newPriorityFee);
    } else if (pending.gasPrice) {
      // Legacy transaction
      originalGas = pending.gasPrice;
      newGas = addPercent(pending.gasPrice, increasePercent);
      builder = builder.gasPrice(newGas);
    } else {
      throw new Error('Transaction has no gas price information');
    }

    // Estimate gas limit
    const estimateParams: { from: Address; to: Address; value: bigint; data?: Hex } = {
      from: pending.from,
      to: pending.to,
      value: pending.value,
    };
    if (pending.data !== undefined) {
      estimateParams.data = pending.data;
    }
    const gasLimit = await this.rpc.estimateGas(estimateParams);
    builder = builder.gasLimit(gasLimit);

    // Sign and send
    const signed = builder.sign(account);
    const newHash = await this.rpc.sendRawTransaction(signed.raw);

    return {
      success: true,
      originalHash: hash,
      newHash,
      summary: `Sped up transaction ${hash.slice(0, 10)}... with ${increasePercent}% higher gas. New TX: ${newHash}`,
      gasIncrease: {
        from: originalGas,
        to: newGas,
        percentIncrease: increasePercent,
      },
    };
  }

  /**
   * Cancel a pending transaction by sending 0 ETH to self with same nonce
   */
  async cancel(
    hash: Hash,
    account: Account,
    options?: {
      gasIncreasePercent?: number;
    }
  ): Promise<CancellationResult> {
    const pending = await this.getPendingTransaction(hash);
    if (!pending) {
      throw new Error(`Transaction ${hash} not found or already mined`);
    }

    if (pending.from.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error('Account does not own this transaction');
    }

    const increasePercent = options?.gasIncreasePercent ?? this.defaultGasIncreasePercent;
    const chainId = await this.rpc.getChainId();

    // Send 0 ETH to self with same nonce
    let builder = TransactionBuilder.create()
      .to(account.address)
      .value(0n)
      .nonce(pending.nonce)
      .chainId(chainId)
      .gasLimit(21000n); // Simple transfer

    if (pending.maxFeePerGas) {
      // EIP-1559 - use higher gas than original
      const newMaxFee = addPercent(pending.maxFeePerGas, increasePercent);
      const newPriorityFee = addPercent(pending.maxPriorityFeePerGas ?? 1_000_000_000n, increasePercent);
      builder = builder
        .maxFeePerGas(newMaxFee)
        .maxPriorityFeePerGas(newPriorityFee);
    } else if (pending.gasPrice) {
      const newGasPrice = addPercent(pending.gasPrice, increasePercent);
      builder = builder.gasPrice(newGasPrice);
    } else {
      // Get current gas price
      const gasPrice = await this.rpc.getGasPrice();
      builder = builder.gasPrice(addPercent(gasPrice, 50)); // 50% above current
    }

    const signed = builder.sign(account);
    const cancellationHash = await this.rpc.sendRawTransaction(signed.raw);

    return {
      success: true,
      originalHash: hash,
      cancellationHash,
      summary: `Cancellation submitted for ${hash.slice(0, 10)}... TX: ${cancellationHash}`,
    };
  }

  /**
   * Check if a transaction can be accelerated/canceled
   */
  async canModify(hash: Hash, account: Account): Promise<{
    canModify: boolean;
    reason?: string;
    pendingTx?: PendingTransaction;
  }> {
    const pending = await this.getPendingTransaction(hash);

    if (!pending) {
      return { canModify: false, reason: 'Transaction not found or already mined' };
    }

    if (pending.from.toLowerCase() !== account.address.toLowerCase()) {
      return { canModify: false, reason: 'Account does not own this transaction' };
    }

    return { canModify: true, pendingTx: pending };
  }
}

/**
 * Create a transaction accelerator
 */
export function createAccelerator(rpc: RPCClient): TransactionAccelerator {
  return new TransactionAccelerator(rpc);
}

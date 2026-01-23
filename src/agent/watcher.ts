/**
 * Payment Watcher
 * Watch for incoming stablecoin payments via Transfer events
 */

import type { Address, Hash, Hex } from '../core/types.js';
import type { RPCClient } from '../protocol/rpc.js';
import { keccak256 } from '../core/hash.js';
import { type Logger, noopLogger } from '../core/logger.js';
import {
  type StablecoinInfo,
  STABLECOINS,
  getStablecoinAddress,
  formatStablecoinAmount,
  isKnownStablecoin,
} from '../stablecoins/index.js';

// ERC20 Transfer event signature: Transfer(address,address,uint256)
const TRANSFER_EVENT_SIGNATURE = keccak256(
  new TextEncoder().encode('Transfer(address,address,uint256)')
);

export interface IncomingPayment {
  token: StablecoinInfo;
  from: Address;
  to: Address;
  amount: bigint;
  formattedAmount: string;
  transactionHash: Hash;
  blockNumber: number;
  logIndex: number;
  timestamp?: number;
}

export interface PaymentWatcherConfig {
  rpc: RPCClient;
  address: Address;
  tokens?: StablecoinInfo[];  // Specific tokens to watch, defaults to all stablecoins
  pollingInterval?: number;   // Milliseconds between polls, default 12000 (12s, ~1 block)
  fromBlock?: number | 'latest';
  logger?: Logger;            // Optional logger for structured logging
}

export type PaymentHandler = (payment: IncomingPayment) => void | Promise<void>;

export interface WaitForPaymentOptions {
  timeout?: number;           // Milliseconds to wait, default 60000 (1 minute)
  minAmount?: bigint;         // Minimum amount to consider (in token decimals)
  token?: StablecoinInfo;     // Specific token to wait for
  from?: Address;             // Specific sender to wait for
}

/**
 * PaymentWatcher - Watch for incoming stablecoin payments
 */
export class PaymentWatcher {
  private readonly rpc: RPCClient;
  private readonly address: Address;
  private readonly tokens: StablecoinInfo[];
  private readonly pollingInterval: number;
  private readonly logger: Logger;
  private lastProcessedBlock: number;
  private chainId: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private handlers: Set<PaymentHandler> = new Set();
  private running = false;

  constructor(config: PaymentWatcherConfig) {
    this.rpc = config.rpc;
    this.address = config.address.toLowerCase() as Address;
    this.tokens = config.tokens ?? Object.values(STABLECOINS);
    this.pollingInterval = config.pollingInterval ?? 12000;
    this.lastProcessedBlock = typeof config.fromBlock === 'number' ? config.fromBlock : 0;
    this.logger = config.logger ?? noopLogger;
  }

  /**
   * Start watching for payments
   */
  start(handler: PaymentHandler): void {
    this.handlers.add(handler);

    if (this.running) return;
    this.running = true;

    // Start polling
    this.poll().catch((err) => this.logger.error('Poll failed', { error: String(err) }));
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => this.logger.error('Poll failed', { error: String(err) }));
    }, this.pollingInterval);
  }

  /**
   * Stop watching for payments
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.handlers.clear();
  }

  /**
   * Wait for a specific payment
   */
  async waitForPayment(options: WaitForPaymentOptions = {}): Promise<IncomingPayment> {
    const timeout = options.timeout ?? 60000;

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let resolved = false;

      const cleanup = (): void => {
        resolved = true;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        this.handlers.delete(handler);
        if (this.handlers.size === 0) {
          this.stop();
        }
      };

      const handler: PaymentHandler = (payment) => {
        // Already resolved (e.g., by timeout)
        if (resolved) return;

        // Check filters
        if (options.token && payment.token.symbol !== options.token.symbol) {
          return;
        }
        if (options.from && payment.from.toLowerCase() !== options.from.toLowerCase()) {
          return;
        }
        if (options.minAmount !== undefined && payment.amount < options.minAmount) {
          return;
        }

        // Payment matches criteria
        cleanup();
        resolve(payment);
      };

      // Start watching
      this.start(handler);

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new Error(`Timeout waiting for payment after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Check for new payments once (useful for manual checking)
   */
  async checkOnce(): Promise<IncomingPayment[]> {
    return this.poll();
  }

  /**
   * Poll for new Transfer events
   */
  private async poll(): Promise<IncomingPayment[]> {
    try {
      // Get chain ID if not cached
      if (this.chainId === null) {
        this.chainId = await this.rpc.getChainId();
      }

      // Get current block
      const currentBlock = await this.rpc.getBlockNumber();

      // On first poll, start from current block
      if (this.lastProcessedBlock === 0) {
        this.lastProcessedBlock = currentBlock;
        return [];
      }

      // No new blocks
      if (currentBlock <= this.lastProcessedBlock) {
        return [];
      }

      // Get token addresses for this chain
      const tokenAddresses = this.tokens
        .map((t) => getStablecoinAddress(t, this.chainId!))
        .filter((addr): addr is string => addr !== undefined)
        .map((addr) => addr.toLowerCase());

      if (tokenAddresses.length === 0) {
        return [];
      }

      // Build filter for Transfer events to our address
      const paddedAddress = ('0x' + this.address.slice(2).padStart(64, '0')) as Hash;

      // Query logs
      const logs = await this.rpc.getLogs({
        fromBlock: this.lastProcessedBlock + 1,
        toBlock: currentBlock,
        address: tokenAddresses as Address[],
        topics: [
          TRANSFER_EVENT_SIGNATURE,
          null,  // from (any)
          paddedAddress,  // to (our address)
        ],
      });

      // Process logs into payments
      const payments: IncomingPayment[] = [];

      for (const log of logs) {
        const payment = this.parseTransferLog(log);
        if (payment) {
          payments.push(payment);
        }
      }

      // Update last processed block
      this.lastProcessedBlock = currentBlock;

      // Notify handlers
      for (const payment of payments) {
        for (const handler of this.handlers) {
          try {
            await handler(payment);
          } catch (err) {
            this.logger.error('Payment handler error', {
              error: String(err),
              transactionHash: payment.transactionHash,
              token: payment.token.symbol,
              amount: payment.formattedAmount,
            });
          }
        }
      }

      return payments;
    } catch (err) {
      this.logger.error('Payment watcher poll error', {
        error: String(err),
        address: this.address,
        lastProcessedBlock: this.lastProcessedBlock,
      });
      return [];
    }
  }

  /**
   * Parse a Transfer log into an IncomingPayment
   */
  private parseTransferLog(log: {
    address: Address;
    topics: Hex[];
    data: Hex;
    transactionHash: Hash;
    blockNumber: number;
    logIndex: number;
  }): IncomingPayment | null {
    // Identify the token
    const token = isKnownStablecoin(log.address, this.chainId!);
    if (!token) return null;

    // Parse indexed parameters from topics
    // topics[0] = event signature
    // topics[1] = from address (indexed)
    // topics[2] = to address (indexed)
    const from = ('0x' + (log.topics[1]?.slice(26) ?? '')) as Address;
    const to = ('0x' + (log.topics[2]?.slice(26) ?? '')) as Address;

    // Parse amount from data
    const amount = BigInt(log.data);
    const formattedAmount = formatStablecoinAmount(amount, token);

    return {
      token,
      from,
      to,
      amount,
      formattedAmount,
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
    };
  }

  /**
   * Get the current watch status
   */
  getStatus(): {
    running: boolean;
    address: Address;
    tokens: string[];
    lastProcessedBlock: number;
    chainId: number | null;
    handlerCount: number;
  } {
    return {
      running: this.running,
      address: this.address,
      tokens: this.tokens.map((t) => t.symbol),
      lastProcessedBlock: this.lastProcessedBlock,
      chainId: this.chainId,
      handlerCount: this.handlers.size,
    };
  }
}

/**
 * Create a payment watcher
 */
export function createPaymentWatcher(config: PaymentWatcherConfig): PaymentWatcher {
  return new PaymentWatcher(config);
}

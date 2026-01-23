/**
 * AgentWallet - The main interface for AI agents
 * Safe, simple, and LLM-friendly
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { parseAmount, formatETH, formatUnits, ETH } from '../core/units.js';
import { isAddress, toChecksumAddress, normalizeAddress } from '../core/address.js';
import type { Account } from '../protocol/account.js';
import { EOA } from '../protocol/account.js';
import { RPCClient } from '../protocol/rpc.js';
import { ENS } from '../protocol/ens.js';
import { GasOracle } from '../protocol/gas.js';
import { TransactionBuilder } from '../protocol/transaction.js';
import { Contract, ERC20_ABI } from '../protocol/contract.js';
import { LimitsEngine, type SpendingLimits } from './limits.js';
import { SimulationEngine } from './simulation.js';
import { ApprovalEngine, type ApprovalConfig, type ApprovalHandler } from './approval.js';
import {
  EthAgentError,
  InsufficientFundsError,
  InvalidAddressError,
  InvalidAmountError,
  ApprovalDeniedError,
  BlockedAddressError,
} from './errors.js';
import { type Result, ok, err } from '../core/result.js';
import {
  type StablecoinInfo,
  STABLECOINS,
  USDC,
  USDT,
  getStablecoinAddress,
  parseStablecoinAmount,
  formatStablecoinAmount,
} from '../stablecoins/index.js';
import {
  PaymentWatcher,
  type IncomingPayment,
  type PaymentHandler,
  type WaitForPaymentOptions,
} from './watcher.js';
import {
  CCTPBridge,
  type BridgeInitResult,
  type BridgeStatusResult,
  type BridgePreviewResult,
} from '../bridge/index.js';

export interface AgentWalletConfig {
  // Account (private key or Account object)
  account?: Account;
  privateKey?: Hex | string;

  // Network
  network?: 'mainnet' | 'sepolia' | 'goerli' | string;
  rpcUrl?: string;

  // Safety
  limits?: SpendingLimits;
  requireSimulation?: boolean;

  // Approval
  onApprovalRequired?: ApprovalHandler;
  approvalConfig?: ApprovalConfig;

  // Address policies
  trustedAddresses?: Array<{ address: string; label?: string }>;
  blockedAddresses?: Array<{ address: string; reason?: string }>;

  // Agent identification
  agentId?: string;
}

export interface SendOptions {
  to: string; // Address or ENS name
  amount: string | bigint; // e.g., "0.1 ETH" or wei as bigint
  data?: Hex;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

export interface SendResult {
  success: boolean;
  hash: Hash;
  summary: string;
  transaction: {
    hash: Hash;
    from: Address;
    to: Address;
    value: { wei: bigint; eth: string };
    gasUsed?: bigint;
    effectiveGasPrice?: bigint;
    blockNumber?: number;
  };
  wallet: {
    balance: { wei: bigint; eth: string };
  };
  limits: {
    remaining: {
      hourly: { eth: string };
      daily: { eth: string };
    };
  };
}

export interface BalanceResult {
  wei: bigint;
  eth: string;
  formatted: string;
}

export interface TokenBalanceResult {
  raw: bigint;
  formatted: string;
  symbol: string;
  decimals: number;
}

export interface StablecoinBalanceResult {
  raw: bigint;
  formatted: string;
  symbol: string;
  decimals: number;
}

export interface StablecoinBalances {
  [symbol: string]: StablecoinBalanceResult;
}

export interface SendStablecoinOptions {
  token: StablecoinInfo;
  to: string;
  amount: string | number;  // Human-readable: "100" means 100 USDC
}

export interface SendStablecoinResult {
  success: boolean;
  hash: Hash;
  summary: string;
  token: {
    symbol: string;
    amount: string;
    rawAmount: bigint;
  };
  transaction: {
    hash: Hash;
    from: Address;
    to: Address;
    gasUsed?: bigint;
    blockNumber?: number;
  };
}

export interface BridgeUSDCOptions {
  /** Amount in human-readable format (e.g., "100" means 100 USDC) */
  amount: string | number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Recipient address or ENS on destination chain (defaults to sender) */
  recipient?: string;
}

export interface BridgeUSDCResult extends BridgeInitResult {
  summary: string;
  limits: {
    remaining: {
      daily: string;
    };
  };
}

/**
 * AgentWallet - Safe Ethereum operations for AI agents
 */
export class AgentWallet {
  readonly address: Address;
  private readonly account: Account;
  private readonly rpc: RPCClient;
  private readonly ens: ENS;
  private readonly gasOracle: GasOracle;
  private readonly limits: LimitsEngine;
  private readonly simulation: SimulationEngine;
  private readonly approval: ApprovalEngine;
  private readonly requireSimulation: boolean;
  private readonly trustedAddresses: Map<string, string>;
  private readonly blockedAddresses: Map<string, string>;
  private readonly agentId: string;
  private cachedBridge?: CCTPBridge;
  private cachedChainId?: number;

  private constructor(config: Required<{
    account: Account;
    rpc: RPCClient;
    limits: SpendingLimits;
    requireSimulation: boolean;
    approvalConfig: ApprovalConfig;
    trustedAddresses: Map<string, string>;
    blockedAddresses: Map<string, string>;
    agentId: string;
  }>) {
    this.account = config.account;
    this.address = config.account.address;
    this.rpc = config.rpc;
    this.ens = new ENS(config.rpc);
    this.gasOracle = new GasOracle(config.rpc);
    this.limits = new LimitsEngine(config.limits);
    this.simulation = new SimulationEngine(config.rpc);
    this.approval = new ApprovalEngine(config.approvalConfig);
    this.requireSimulation = config.requireSimulation;
    this.trustedAddresses = config.trustedAddresses;
    this.blockedAddresses = config.blockedAddresses;
    this.agentId = config.agentId;
  }

  /**
   * Create a new AgentWallet
   */
  static create(config: AgentWalletConfig): AgentWallet {
    // Resolve account
    let account: Account;
    if (config.account) {
      account = config.account;
    } else if (config.privateKey) {
      const key = config.privateKey.startsWith('0x')
        ? config.privateKey as Hex
        : `0x${config.privateKey}` as Hex;
      account = EOA.fromPrivateKey(key);
    } else {
      account = EOA.generate();
    }

    // Resolve RPC URL
    let rpcUrl = config.rpcUrl;
    if (!rpcUrl) {
      switch (config.network) {
        case 'mainnet':
          rpcUrl = 'https://eth.llamarpc.com';
          break;
        case 'sepolia':
          rpcUrl = 'https://sepolia.drpc.org';
          break;
        case 'goerli':
          rpcUrl = 'https://goerli.drpc.org';
          break;
        default:
          rpcUrl = config.network ?? 'https://eth.llamarpc.com';
      }
    }

    const rpc = new RPCClient(rpcUrl);

    // Build trusted/blocked address maps
    const trustedAddresses = new Map<string, string>();
    for (const addr of config.trustedAddresses ?? []) {
      trustedAddresses.set(normalizeAddress(addr.address), addr.label ?? 'Trusted');
    }

    const blockedAddresses = new Map<string, string>();
    for (const addr of config.blockedAddresses ?? []) {
      blockedAddresses.set(normalizeAddress(addr.address), addr.reason ?? 'Blocked');
    }

    // Build approval config
    const handler = config.onApprovalRequired ?? config.approvalConfig?.handler;
    const approvalConfig: ApprovalConfig = {
      ...config.approvalConfig,
    };
    if (handler !== undefined) {
      approvalConfig.handler = handler;
    }

    return new AgentWallet({
      account,
      rpc,
      limits: config.limits ?? {},
      requireSimulation: config.requireSimulation ?? true,
      approvalConfig,
      trustedAddresses,
      blockedAddresses,
      agentId: config.agentId ?? 'agent',
    });
  }

  /**
   * Send ETH to an address
   */
  async send(options: SendOptions): Promise<SendResult> {
    // 1. Resolve recipient address
    const to = await this.resolveAddress(options.to);

    // 2. Check if address is blocked
    const blocked = this.blockedAddresses.get(normalizeAddress(to));
    if (blocked) {
      throw new BlockedAddressError(to, blocked);
    }

    // 3. Parse amount
    const value = typeof options.amount === 'bigint'
      ? options.amount
      : parseAmount(options.amount);

    if (value <= 0n) {
      throw new InvalidAmountError(String(options.amount), 'Amount must be positive');
    }

    // 4. Check spending limits
    const balance = await this.rpc.getBalance(this.address);
    this.limits.checkTransaction(value, balance);

    // 5. Estimate gas
    const gasParams: { to: Address; from: Address; value: bigint; data?: Hex } = {
      to,
      from: this.address,
      value,
    };
    if (options.data !== undefined) {
      gasParams.data = options.data;
    }
    const gasEstimate = await this.gasOracle.estimateGas(gasParams);

    // 6. Check balance including gas
    const totalRequired = value + gasEstimate.estimatedCost;
    if (balance < totalRequired) {
      throw new InsufficientFundsError({
        required: { wei: totalRequired, eth: formatETH(totalRequired) },
        available: { wei: balance, eth: formatETH(balance) },
        shortage: { wei: totalRequired - balance, eth: formatETH(totalRequired - balance) },
      });
    }

    // 7. Simulate transaction
    if (this.requireSimulation) {
      const simParams: { to: Address; from: Address; value: bigint; data?: Hex } = {
        to,
        from: this.address,
        value,
      };
      if (options.data !== undefined) {
        simParams.data = options.data;
      }
      await this.simulation.validate(simParams);
    }

    // 8. Check if approval is required
    const isTrusted = this.trustedAddresses.has(normalizeAddress(to));
    if (this.approval.requiresApproval({ amount: value, recipientIsNew: !isTrusted })) {
      const approved = await this.approval.requestApproval({
        type: 'send',
        summary: `Send ${formatETH(value)} ETH to ${options.to}`,
        details: {
          from: this.address,
          to,
          value: { wei: value, eth: formatETH(value) },
          gasCost: { wei: gasEstimate.estimatedCost, eth: formatETH(gasEstimate.estimatedCost) },
          totalCost: { wei: totalRequired, eth: formatETH(totalRequired) },
          risk: value > ETH(1) ? 'high' : value > ETH(0.1) ? 'medium' : 'low',
          warnings: isTrusted ? [] : ['Recipient is not in trusted addresses'],
        },
      });

      if (!approved) {
        throw new ApprovalDeniedError();
      }
    }

    // 9. Build and sign transaction
    const nonce = await this.rpc.getTransactionCount(this.address);
    const chainId = await this.rpc.getChainId();

    let builder = TransactionBuilder.create()
      .to(to)
      .value(value)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(options.gasLimit ?? gasEstimate.gasLimit);

    if (options.data) {
      builder = builder.data(options.data);
    }

    if (gasEstimate.maxFeePerGas) {
      builder = builder
        .maxFeePerGas(options.maxFeePerGas ?? gasEstimate.maxFeePerGas)
        .maxPriorityFeePerGas(options.maxPriorityFeePerGas ?? gasEstimate.maxPriorityFeePerGas ?? 0n);
    } else if (gasEstimate.gasPrice) {
      builder = builder.gasPrice(gasEstimate.gasPrice);
    }

    const signed = builder.sign(this.account);

    // 10. Send transaction
    const hash = await this.rpc.sendRawTransaction(signed.raw);

    // 11. Wait for receipt
    const receipt = await this.rpc.waitForTransaction(hash);

    // 12. Record spend
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
    this.limits.recordSpend(value, gasUsed);

    // 13. Get updated balance
    const newBalance = await this.rpc.getBalance(this.address);
    const limitStatus = this.limits.getStatus();

    return {
      success: receipt.status === 'success',
      hash,
      summary: `Sent ${formatETH(value)} ETH to ${options.to}. TX: ${hash}`,
      transaction: {
        hash,
        from: this.address,
        to,
        value: { wei: value, eth: formatETH(value) },
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        blockNumber: receipt.blockNumber,
      },
      wallet: {
        balance: { wei: newBalance, eth: formatETH(newBalance) },
      },
      limits: {
        remaining: {
          hourly: { eth: limitStatus.hourly.remaining },
          daily: { eth: limitStatus.daily.remaining },
        },
      },
    };
  }

  /**
   * Get ETH balance
   */
  async getBalance(address?: string): Promise<BalanceResult> {
    const target = address ? await this.resolveAddress(address) : this.address;
    const balance = await this.rpc.getBalance(target);

    return {
      wei: balance,
      eth: formatETH(balance),
      formatted: `${formatETH(balance)} ETH`,
    };
  }

  /**
   * Get ERC20 token balance
   */
  async getTokenBalance(token: Address, address?: string): Promise<TokenBalanceResult> {
    const target = address ? await this.resolveAddress(address) : this.address;

    const contract = new Contract({
      address: token,
      abi: ERC20_ABI,
      rpc: this.rpc,
    });

    const [balance, symbol, decimals] = await Promise.all([
      contract.read<bigint>('balanceOf', [target]),
      contract.read<string>('symbol'),
      contract.read<bigint>('decimals'),
    ]);

    const dec = Number(decimals);

    return {
      raw: balance,
      formatted: formatUnits(balance, dec),
      symbol,
      decimals: dec,
    };
  }

  /**
   * Transfer ERC20 tokens
   */
  async transferToken(options: {
    token: Address;
    to: string;
    amount: string | bigint;
  }): Promise<SendResult> {
    const to = await this.resolveAddress(options.to);

    // Check if blocked
    const blocked = this.blockedAddresses.get(normalizeAddress(to));
    if (blocked) {
      throw new BlockedAddressError(to, blocked);
    }

    const contract = new Contract({
      address: options.token,
      abi: ERC20_ABI,
      rpc: this.rpc,
      account: this.account,
    });

    // Get token info
    const [symbol, decimals] = await Promise.all([
      contract.read<string>('symbol'),
      contract.read<bigint>('decimals'),
    ]);

    const dec = Number(decimals);

    // Parse amount
    const amount = typeof options.amount === 'bigint'
      ? options.amount
      : parseAmount(options.amount, dec);

    // Write transfer
    const result = await contract.write('transfer', [to, amount]);
    const receipt = await result.wait();

    const newBalance = await this.rpc.getBalance(this.address);
    const limitStatus = this.limits.getStatus();

    return {
      success: receipt.status === 'success',
      hash: receipt.hash,
      summary: `Transferred ${formatUnits(amount, dec)} ${symbol} to ${options.to}. TX: ${receipt.hash}`,
      transaction: {
        hash: receipt.hash,
        from: this.address,
        to: options.token,
        value: { wei: 0n, eth: '0' },
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
      },
      wallet: {
        balance: { wei: newBalance, eth: formatETH(newBalance) },
      },
      limits: {
        remaining: {
          hourly: { eth: limitStatus.hourly.remaining },
          daily: { eth: limitStatus.daily.remaining },
        },
      },
    };
  }

  // ============ Stablecoin Methods ============

  /**
   * Send stablecoins (USDC, USDT, etc.) with human-readable amounts
   * Amount is in human units - "100" means 100 USDC, not 100 * 10^6
   */
  async sendStablecoin(options: SendStablecoinOptions): Promise<SendStablecoinResult> {
    const chainId = await this.rpc.getChainId();
    const tokenAddress = getStablecoinAddress(options.token, chainId);

    if (!tokenAddress) {
      throw new EthAgentError({
        code: 'UNSUPPORTED_STABLECOIN',
        message: `${options.token.symbol} is not available on chain ${chainId}`,
        suggestion: `Use a different stablecoin or switch to a supported network`,
      });
    }

    const to = await this.resolveAddress(options.to);

    // Check if blocked
    const blocked = this.blockedAddresses.get(normalizeAddress(to));
    if (blocked) {
      throw new BlockedAddressError(to, blocked);
    }

    // Parse amount using stablecoin decimals
    const rawAmount = parseStablecoinAmount(options.amount, options.token);
    const formattedAmount = formatStablecoinAmount(rawAmount, options.token);

    // Check stablecoin spending limits
    this.limits.checkStablecoinTransaction(options.token, rawAmount);

    const contract = new Contract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      rpc: this.rpc,
      account: this.account,
    });

    // Check balance
    const balance = await contract.read<bigint>('balanceOf', [this.address]);
    if (balance < rawAmount) {
      throw new InsufficientFundsError({
        required: { wei: rawAmount, eth: formattedAmount },
        available: { wei: balance, eth: formatStablecoinAmount(balance, options.token) },
        shortage: { wei: rawAmount - balance, eth: formatStablecoinAmount(rawAmount - balance, options.token) },
      });
    }

    // Transfer
    const result = await contract.write('transfer', [to, rawAmount]);
    const receipt = await result.wait();

    // Record stablecoin spend
    this.limits.recordStablecoinSpend(options.token, rawAmount);

    return {
      success: receipt.status === 'success',
      hash: receipt.hash,
      summary: `Sent ${formattedAmount} ${options.token.symbol} to ${options.to}. TX: ${receipt.hash}`,
      token: {
        symbol: options.token.symbol,
        amount: formattedAmount,
        rawAmount,
      },
      transaction: {
        hash: receipt.hash,
        from: this.address,
        to: tokenAddress as Address,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
      },
    };
  }

  /**
   * Send USDC - Convenience method
   */
  async sendUSDC(options: { to: string; amount: string | number }): Promise<SendStablecoinResult> {
    return this.sendStablecoin({ token: USDC, ...options });
  }

  /**
   * Send USDT - Convenience method
   */
  async sendUSDT(options: { to: string; amount: string | number }): Promise<SendStablecoinResult> {
    return this.sendStablecoin({ token: USDT, ...options });
  }

  /**
   * Get stablecoin balance with human-readable formatting
   */
  async getStablecoinBalance(
    stablecoin: StablecoinInfo,
    address?: string
  ): Promise<StablecoinBalanceResult> {
    const chainId = await this.rpc.getChainId();
    const tokenAddress = getStablecoinAddress(stablecoin, chainId);

    if (!tokenAddress) {
      return {
        raw: 0n,
        formatted: '0',
        symbol: stablecoin.symbol,
        decimals: stablecoin.decimals,
      };
    }

    const target = address ? await this.resolveAddress(address) : this.address;

    const contract = new Contract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      rpc: this.rpc,
    });

    const balance = await contract.read<bigint>('balanceOf', [target]);

    return {
      raw: balance,
      formatted: formatStablecoinAmount(balance, stablecoin),
      symbol: stablecoin.symbol,
      decimals: stablecoin.decimals,
    };
  }

  /**
   * Get all stablecoin balances for the wallet
   */
  async getStablecoinBalances(address?: string): Promise<StablecoinBalances> {
    const chainId = await this.rpc.getChainId();
    const results: StablecoinBalances = {};

    const stablecoinsToCheck = Object.values(STABLECOINS).filter(
      (s) => getStablecoinAddress(s, chainId) !== undefined
    );

    const balances = await Promise.all(
      stablecoinsToCheck.map((s) => this.getStablecoinBalance(s, address))
    );

    for (const balance of balances) {
      results[balance.symbol] = balance;
    }

    return results;
  }

  /**
   * Safe version of sendStablecoin that returns a Result
   */
  async safeSendStablecoin(
    options: SendStablecoinOptions
  ): Promise<Result<SendStablecoinResult, EthAgentError>> {
    try {
      const result = await this.sendStablecoin(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to send stablecoin',
      }));
    }
  }

  /**
   * Safe version of sendUSDC that returns a Result
   */
  async safeSendUSDC(
    options: { to: string; amount: string | number }
  ): Promise<Result<SendStablecoinResult, EthAgentError>> {
    return this.safeSendStablecoin({ token: USDC, ...options });
  }

  // ============ Address Resolution ============

  /**
   * Resolve ENS name or validate address
   */
  async resolveAddress(addressOrName: string): Promise<Address> {
    if (isAddress(addressOrName)) {
      return toChecksumAddress(addressOrName);
    }

    const resolved = await this.ens.resolve(addressOrName);
    if (!resolved) {
      throw new InvalidAddressError(addressOrName);
    }

    return resolved;
  }

  /**
   * Get current spending limit status
   */
  getLimits(): ReturnType<LimitsEngine['getStatus']> {
    return this.limits.getStatus();
  }

  /**
   * Get current stablecoin spending limit status
   */
  getStablecoinLimits(token?: StablecoinInfo): ReturnType<LimitsEngine['getStablecoinStatus']> {
    return this.limits.getStablecoinStatus(token);
  }

  /**
   * Get maximum sendable amount for a stablecoin considering limits
   */
  getMaxStablecoinSendable(token: StablecoinInfo): bigint {
    return this.limits.getMaxStablecoinSendable(token);
  }

  /**
   * Get wallet capabilities
   */
  getCapabilities(): {
    address: Address;
    agentId: string;
    network: { chainId: number };
    limits: ReturnType<LimitsEngine['getStatus']>;
    operations: string[];
  } {
    return {
      address: this.address,
      agentId: this.agentId,
      network: { chainId: 1 }, // TODO: Get from RPC
      limits: this.limits.getStatus(),
      operations: ['send', 'getBalance', 'transferToken', 'getTokenBalance'],
    };
  }

  // ============ Payment Watching Methods ============

  /**
   * Watch for incoming stablecoin payments
   * Returns a PaymentWatcher that can be stopped when no longer needed
   */
  onStablecoinReceived(
    handler: PaymentHandler,
    options?: { tokens?: StablecoinInfo[]; pollingInterval?: number }
  ): PaymentWatcher {
    const watcher = new PaymentWatcher({
      rpc: this.rpc,
      address: this.address,
      tokens: options?.tokens,
      pollingInterval: options?.pollingInterval,
    });
    watcher.start(handler);
    return watcher;
  }

  /**
   * Wait for a specific incoming payment
   * Returns a promise that resolves when a matching payment is received
   */
  async waitForPayment(options?: WaitForPaymentOptions): Promise<IncomingPayment> {
    const watcher = new PaymentWatcher({
      rpc: this.rpc,
      address: this.address,
      tokens: options?.token ? [options.token] : undefined,
    });
    return watcher.waitForPayment(options);
  }

  // ============ Bridge Methods ============

  /**
   * Get or create a cached CCTPBridge instance
   */
  private async getBridge(): Promise<CCTPBridge> {
    if (!this.cachedBridge) {
      this.cachedChainId = await this.rpc.getChainId();
      this.cachedBridge = new CCTPBridge({
        sourceRpc: this.rpc,
        account: this.account,
        // Let it auto-detect testnet from chain ID
      });
    }
    return this.cachedBridge;
  }

  /**
   * Get cached chain ID
   */
  private async getChainId(): Promise<number> {
    if (!this.cachedChainId) {
      this.cachedChainId = await this.rpc.getChainId();
    }
    return this.cachedChainId;
  }

  /**
   * Preview a USDC bridge without executing
   * Useful for checking feasibility and showing info to users
   *
   * @example
   * const preview = await wallet.previewBridgeUSDC({
   *   amount: '100',
   *   destinationChainId: 42161,
   * });
   * if (preview.canBridge) {
   *   console.log(`Ready to bridge ${preview.amount.formatted} USDC`);
   * }
   */
  async previewBridgeUSDC(options: BridgeUSDCOptions): Promise<BridgePreviewResult> {
    const bridge = await this.getBridge();

    // Resolve recipient if provided
    let recipient: Address | undefined;
    if (options.recipient) {
      recipient = await this.resolveAddress(options.recipient);
    }

    return bridge.previewBridge({
      token: USDC,
      amount: options.amount,
      destinationChainId: options.destinationChainId,
      recipient,
    });
  }

  /**
   * Bridge USDC to another chain via CCTP
   * Amount is in human units - "100" means 100 USDC
   *
   * @example
   * const result = await wallet.bridgeUSDC({
   *   amount: '100',
   *   destinationChainId: 42161, // Arbitrum
   * });
   * console.log(result.messageHash); // Use this to track status
   */
  async bridgeUSDC(options: BridgeUSDCOptions): Promise<BridgeUSDCResult> {
    const chainId = await this.getChainId();

    // Resolve recipient address if provided
    let recipient: Address | undefined;
    if (options.recipient) {
      recipient = await this.resolveAddress(options.recipient);

      // Check if blocked
      const blocked = this.blockedAddresses.get(normalizeAddress(recipient));
      if (blocked) {
        throw new BlockedAddressError(recipient, blocked);
      }
    }

    // Parse amount for limit checking
    const rawAmount = parseStablecoinAmount(options.amount, USDC);
    const formattedAmount = formatStablecoinAmount(rawAmount, USDC);

    // Check bridge spending limits
    this.limits.checkBridgeTransaction(USDC, rawAmount, options.destinationChainId);

    // Get cached bridge
    const bridge = await this.getBridge();

    // Initiate bridge
    const result = await bridge.initiateBridge({
      token: USDC,
      amount: options.amount,
      destinationChainId: options.destinationChainId,
      recipient,
    });

    // Record bridge spend in limits
    this.limits.recordBridgeSpend(USDC, rawAmount, options.destinationChainId);

    // Get updated limit status
    const bridgeStatus = this.limits.getBridgeStatus();

    return {
      ...result,
      summary: `Bridging ${formattedAmount} USDC from chain ${String(chainId)} to chain ${String(options.destinationChainId)}. Message hash: ${result.messageHash}`,
      limits: {
        remaining: {
          daily: bridgeStatus.daily.remaining,
        },
      },
    };
  }

  /**
   * Get the status of a bridge transaction
   */
  async getBridgeStatus(messageHash: Hex): Promise<BridgeStatusResult> {
    const bridge = await this.getBridge();
    return bridge.getStatus(messageHash);
  }

  /**
   * Wait for bridge attestation to be ready
   * This can take 15-30 minutes on mainnet
   *
   * @returns The attestation signature needed to complete the bridge
   */
  async waitForBridgeAttestation(messageHash: Hex): Promise<Hex> {
    const bridge = await this.getBridge();
    return bridge.waitForAttestation(messageHash);
  }

  /**
   * Safe version of bridgeUSDC that returns a Result
   */
  async safeBridgeUSDC(
    options: BridgeUSDCOptions
  ): Promise<Result<BridgeUSDCResult, EthAgentError>> {
    try {
      const result = await this.bridgeUSDC(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to bridge USDC',
      }));
    }
  }

  /**
   * Get current bridge spending limit status
   */
  getBridgeLimits(): ReturnType<LimitsEngine['getBridgeStatus']> {
    return this.limits.getBridgeStatus();
  }

  /**
   * Get recent bridge history
   */
  getBridgeHistory(options?: { hours?: number; limit?: number }): ReturnType<LimitsEngine['getBridgeHistory']> {
    return this.limits.getBridgeHistory(options);
  }

  /**
   * Preview a transaction without executing
   */
  async preview(options: SendOptions): Promise<{
    canExecute: boolean;
    blockers: string[];
    costs: {
      value: { wei: bigint; eth: string };
      gas: { wei: bigint; eth: string };
      total: { wei: bigint; eth: string };
    };
    simulation: { success: boolean; error?: string };
  }> {
    const blockers: string[] = [];

    // Resolve address
    let to: Address;
    try {
      to = await this.resolveAddress(options.to);
    } catch {
      blockers.push(`Invalid recipient: ${options.to}`);
      return {
        canExecute: false,
        blockers,
        costs: {
          value: { wei: 0n, eth: '0' },
          gas: { wei: 0n, eth: '0' },
          total: { wei: 0n, eth: '0' },
        },
        simulation: { success: false, error: 'Invalid recipient' },
      };
    }

    // Check blocked
    const blocked = this.blockedAddresses.get(normalizeAddress(to));
    if (blocked) {
      blockers.push(`Address is blocked: ${blocked}`);
    }

    // Parse amount
    const value = typeof options.amount === 'bigint'
      ? options.amount
      : parseAmount(options.amount);

    // Check limits
    try {
      const balance = await this.rpc.getBalance(this.address);
      this.limits.checkTransaction(value, balance);
    } catch (err) {
      blockers.push((err as Error).message);
    }

    // Estimate gas
    let gasEstimate = { gasLimit: 21000n, estimatedCost: 0n };
    try {
      const previewGasParams: { to: Address; from: Address; value: bigint; data?: Hex } = {
        to,
        from: this.address,
        value,
      };
      if (options.data !== undefined) {
        previewGasParams.data = options.data;
      }
      gasEstimate = await this.gasOracle.estimateGas(previewGasParams);
    } catch {
      // Use defaults
    }

    // Simulate
    let simulation: { success: boolean; error?: string } = { success: true };
    try {
      const simParams: { to: Address; from: Address; value: bigint; data?: Hex } = {
        to,
        from: this.address,
        value,
      };
      if (options.data !== undefined) {
        simParams.data = options.data;
      }
      const result = await this.simulation.simulate(simParams);
      simulation = { success: result.success, error: result.error };
      if (!result.success) {
        blockers.push(`Simulation failed: ${result.error}`);
      }
    } catch (err) {
      simulation = { success: false, error: (err as Error).message };
      blockers.push(`Simulation error: ${(err as Error).message}`);
    }

    const total = value + gasEstimate.estimatedCost;

    return {
      canExecute: blockers.length === 0,
      blockers,
      costs: {
        value: { wei: value, eth: formatETH(value) },
        gas: { wei: gasEstimate.estimatedCost, eth: formatETH(gasEstimate.estimatedCost) },
        total: { wei: total, eth: formatETH(total) },
      },
      simulation,
    };
  }

  /**
   * Safe version of send that returns a Result instead of throwing
   * Useful for AI agents that need explicit error handling in types
   */
  async safeSend(options: SendOptions): Promise<Result<SendResult, EthAgentError>> {
    try {
      const result = await this.send(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'An unexpected error occurred',
      }));
    }
  }

  /**
   * Safe version of getBalance that returns a Result
   */
  async safeGetBalance(address?: string): Promise<Result<BalanceResult, EthAgentError>> {
    try {
      const result = await this.getBalance(address);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to get balance',
      }));
    }
  }

  /**
   * Safe version of transferToken that returns a Result
   */
  async safeTransferToken(options: {
    token: Address;
    to: string;
    amount: string | bigint;
  }): Promise<Result<SendResult, EthAgentError>> {
    try {
      const result = await this.transferToken(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to transfer token',
      }));
    }
  }
}

// Convenience function for creating wallets
export function createWallet(config: AgentWalletConfig): AgentWallet {
  return AgentWallet.create(config);
}

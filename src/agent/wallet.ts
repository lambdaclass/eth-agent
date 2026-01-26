/**
 * AgentWallet - The main interface for AI agents
 * Safe, simple, and LLM-friendly
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { parseAmount, formatETH, formatUnits, ETH } from '../core/units.js';
import { isAddress, toChecksumAddress } from '../core/address.js';
import type { Account } from '../protocol/account.js';
import { EOA } from '../protocol/account.js';
import { RPCClient } from '../protocol/rpc.js';
import { ENS } from '../protocol/ens.js';
import { GasOracle } from '../protocol/gas.js';
import { TransactionBuilder } from '../protocol/transaction.js';
import { Contract, ERC20_ABI } from '../protocol/contract.js';
import { NonceManager } from '../protocol/nonce.js';
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
  TokenNotSupportedError,
  InsufficientLiquidityError,
  PriceImpactTooHighError,
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
  type TokenInfo,
  resolveToken,
  parseTokenAmount,
  formatTokenAmount,
  isNativeETH,
  getTokenBySymbol,
  getTokenAddress,
} from '../tokens/index.js';
import {
  UniswapClient,
  type SwapQuote,
  isUniswapSupported,
  getDefaultDeadline,
  WETH_ADDRESSES,
} from '../protocol/uniswap.js';
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
  BridgeRouter,
  type BridgeRouteComparison,
  type BridgePreview,
  type UnifiedBridgeResult,
  type UnifiedBridgeStatus,
  type RoutePreference,
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

export interface SwapOptions {
  /** Token to swap from - symbol (e.g., "USDC", "ETH", "WETH") or contract address */
  fromToken: string;
  /** Token to swap to - symbol (e.g., "ETH", "USDC") or contract address */
  toToken: string;
  /** Human-readable amount to swap (e.g., "100" for 100 USDC, "0.5" for 0.5 ETH) */
  amount: string | number;
  /**
   * Maximum slippage tolerance as a percentage value.
   * - 0.5 means 0.5% slippage tolerance
   * - 1 means 1% slippage tolerance
   * - Default: 0.5 (0.5%)
   *
   * The swap will fail if the actual output is less than (1 - slippage%) of the quoted amount.
   */
  slippageTolerance?: number;
  /** Transaction deadline in seconds from now (default: 1200 = 20 minutes) */
  deadline?: number;
}

export interface SwapQuoteResult {
  fromToken: {
    symbol: string;
    address: Address;
    amount: string;
    rawAmount: bigint;
    decimals: number;
  };
  toToken: {
    symbol: string;
    address: Address;
    amount: string;
    rawAmount: bigint;
    decimals: number;
  };
  amountOutMinimum: string;
  priceImpact: number;
  fee: number;
  gasEstimate: bigint;
  effectivePrice: string;  // Price of fromToken in terms of toToken
  slippageTolerance: number;
}

export interface SwapResult {
  success: boolean;
  hash: Hash;
  summary: string;
  swap: {
    tokenIn: { symbol: string; amount: string; rawAmount: bigint };
    tokenOut: { symbol: string; amount: string; rawAmount: bigint };
    effectivePrice: string;
    priceImpact: number;
  };
  transaction: {
    hash: Hash;
    from: Address;
    gasUsed?: bigint;
    effectiveGasPrice?: bigint;
    blockNumber?: number;
  };
  limits: {
    remaining: {
      daily: { usd: string };
    };
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
 * Options for the unified bridge method
 */
export interface BridgeOptions {
  /** The stablecoin to bridge */
  token: StablecoinInfo;
  /** Amount in human-readable format (e.g., "100" means 100 USDC) */
  amount: string | number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Recipient address on destination chain (defaults to sender) */
  recipient?: string;
  /** Route selection preferences */
  preference?: RoutePreference;
  /** Specific protocol to use (bypasses auto-selection) */
  protocol?: string;
}

/**
 * Extended bridge result with wallet-specific info
 */
export interface BridgeResult extends UnifiedBridgeResult {
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
  private readonly nonceManager: NonceManager;
  private readonly limits: LimitsEngine;
  private readonly simulation: SimulationEngine;
  private readonly approval: ApprovalEngine;
  private readonly requireSimulation: boolean;
  private readonly trustedAddresses: Map<string, string>;
  private readonly blockedAddresses: Map<string, string>;
  private readonly agentId: string;
  private uniswapClient: UniswapClient | null = null;
  private cachedBridge?: CCTPBridge;
  private cachedBridgeRouter?: BridgeRouter;
  private cachedChainId?: number;

  // ETH price cache for USD value estimation
  private cachedETHPrice: { value: bigint; timestamp: number } | null = null;
  private readonly ETH_PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    this.nonceManager = new NonceManager({ rpc: config.rpc, address: config.account.address });
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
      trustedAddresses.set(addr.address.toLowerCase(), addr.label ?? 'Trusted');
    }

    const blockedAddresses = new Map<string, string>();
    for (const addr of config.blockedAddresses ?? []) {
      blockedAddresses.set(addr.address.toLowerCase(), addr.reason ?? 'Blocked');
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
    const blocked = this.blockedAddresses.get(to.toLowerCase());
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
    const isTrusted = this.trustedAddresses.has(to.toLowerCase());
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
    const nonce = await this.nonceManager.getNextNonce();
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
    let hash: Hash;
    try {
      hash = await this.rpc.sendRawTransaction(signed.raw);
    } catch (error) {
      // Reset nonce on send failure
      await this.nonceManager.onTransactionFailed();
      throw error;
    }

    // 11. Wait for receipt
    let receipt;
    try {
      receipt = await this.rpc.waitForTransaction(hash);
      this.nonceManager.onTransactionConfirmed();
    } catch (error) {
      // Reset nonce if we can't confirm
      await this.nonceManager.onTransactionFailed();
      throw error;
    }

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
    const blocked = this.blockedAddresses.get(to.toLowerCase());
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
    const blocked = this.blockedAddresses.get(to.toLowerCase());
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
      const blocked = this.blockedAddresses.get(recipient.toLowerCase());
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

  // ============ Unified Bridge Methods (Router-based) ============

  /**
   * Get or create a cached BridgeRouter instance
   */
  private async getBridgeRouter(): Promise<BridgeRouter> {
    if (!this.cachedBridgeRouter) {
      // Fetch current ETH price for accurate fee calculations
      const chainId = await this.rpc.getChainId();
      const ethPriceRaw = await this.getETHPriceInUSD(chainId);
      // Convert from 6 decimals (USDC) to regular number
      const ethPriceUSD = Number(ethPriceRaw) / 1e6;

      this.cachedBridgeRouter = new BridgeRouter({
        sourceRpc: this.rpc,
        account: this.account,
        limitsEngine: this.limits,
        ethPriceUSD,
      });
    }
    return this.cachedBridgeRouter;
  }

  /**
   * Bridge tokens using auto-selected best route
   *
   * This is the primary bridge method that automatically selects the best
   * bridge protocol based on your preferences (cost, speed, or reliability).
   *
   * @example
   * ```typescript
   * // Simple one-liner - auto-selects best bridge
   * const result = await wallet.bridge({
   *   token: USDC,
   *   amount: '100',
   *   destinationChainId: 42161,  // Arbitrum
   * });
   *
   * // Prefer speed over cost
   * const fast = await wallet.bridge({
   *   token: USDC,
   *   amount: '100',
   *   destinationChainId: 42161,
   *   preference: { priority: 'speed' },
   * });
   *
   * // Use specific protocol
   * const via = await wallet.bridge({
   *   token: USDC,
   *   amount: '500',
   *   destinationChainId: 10,
   *   protocol: 'CCTP',
   * });
   * ```
   */
  async bridge(options: BridgeOptions): Promise<BridgeResult> {
    const router = await this.getBridgeRouter();

    // Resolve recipient if provided
    let recipient: Address | undefined;
    if (options.recipient) {
      recipient = await this.resolveAddress(options.recipient);

      // Check if blocked
      const blocked = this.blockedAddresses.get(recipient.toLowerCase());
      if (blocked) {
        throw new BlockedAddressError(recipient, blocked);
      }
    }

    // Build bridge request
    const request = {
      token: options.token,
      amount: options.amount,
      destinationChainId: options.destinationChainId,
      recipient,
    };

    // Execute bridge via router
    let result: UnifiedBridgeResult;
    if (options.protocol) {
      // Use specific protocol if specified
      result = await router.bridgeVia(options.protocol, request);
    } else {
      // Auto-select best route based on preference
      result = await router.bridge(request, options.preference ?? { priority: 'cost' });
    }

    // Get updated limit status
    const bridgeStatus = this.limits.getBridgeStatus();

    return {
      ...result,
      limits: {
        remaining: {
          daily: bridgeStatus.daily.remaining,
        },
      },
    };
  }

  /**
   * Safe version of bridge that returns a Result instead of throwing
   *
   * @example
   * ```typescript
   * const result = await wallet.safeBridge({
   *   token: USDC,
   *   amount: '100',
   *   destinationChainId: 42161,
   * });
   *
   * if (!result.success) {
   *   console.log('Bridge failed:', result.error.message);
   *   console.log('Recovery steps:', result.error.recovery?.nextSteps);
   * }
   * ```
   */
  async safeBridge(
    options: BridgeOptions
  ): Promise<Result<BridgeResult, EthAgentError>> {
    try {
      const result = await this.bridge(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to execute bridge',
      }));
    }
  }

  /**
   * Compare available bridge routes before committing
   *
   * Returns quotes from all available protocols with a recommended choice.
   * Use this to preview options and show users the trade-offs.
   *
   * @example
   * ```typescript
   * const routes = await wallet.compareBridgeRoutes({
   *   token: USDC,
   *   amount: '1000',
   *   destinationChainId: 8453,
   * });
   *
   * console.log(routes.recommendation.reason); // "CCTP: lowest fees ($0)"
   *
   * for (const quote of routes.quotes) {
   *   console.log(`${quote.protocol}: $${quote.fee.totalUSD} fee, ${quote.estimatedTime.display}`);
   * }
   * ```
   */
  async compareBridgeRoutes(options: {
    token: StablecoinInfo;
    amount: string | number;
    destinationChainId: number;
    preference?: RoutePreference;
  }): Promise<BridgeRouteComparison> {
    const router = await this.getBridgeRouter();

    return router.findRoutes(
      {
        token: options.token,
        amount: options.amount,
        destinationChainId: options.destinationChainId,
      },
      options.preference ?? { priority: 'cost' }
    );
  }

  /**
   * Preview a bridge operation with full validation
   *
   * Checks balance, limits, route availability, and returns gas estimates.
   * Use this before executing to ensure the bridge will succeed.
   *
   * @example
   * ```typescript
   * const preview = await wallet.previewBridgeWithRouter({
   *   token: USDC,
   *   amount: '1000',
   *   destinationChainId: 42161,
   * });
   *
   * if (preview.canBridge) {
   *   console.log(`Ready to bridge. Gas cost: $${preview.quote?.fee.totalUSD}`);
   * } else {
   *   console.log('Cannot bridge:', preview.blockers.join(', '));
   * }
   * ```
   */
  async previewBridgeWithRouter(options: {
    token: StablecoinInfo;
    amount: string | number;
    destinationChainId: number;
    preference?: RoutePreference;
  }): Promise<BridgePreview> {
    const router = await this.getBridgeRouter();

    return router.previewBridge(
      {
        token: options.token,
        amount: options.amount,
        destinationChainId: options.destinationChainId,
      },
      options.preference ?? { priority: 'cost' }
    );
  }

  /**
   * Get bridge status using tracking ID
   *
   * The tracking ID is returned from bridge() and encodes all the information
   * needed to check status without knowing which protocol was used.
   *
   * @example
   * ```typescript
   * const result = await wallet.bridge({ ... });
   * // ... later ...
   * const status = await wallet.getBridgeStatusByTrackingId(result.trackingId);
   * console.log(`Progress: ${status.progress}%`);
   * console.log(`Status: ${status.message}`);
   * ```
   */
  async getBridgeStatusByTrackingId(trackingId: string): Promise<UnifiedBridgeStatus> {
    const router = await this.getBridgeRouter();
    return router.getStatusByTrackingId(trackingId);
  }

  /**
   * Wait for bridge completion using tracking ID
   *
   * @example
   * ```typescript
   * const result = await wallet.bridge({ ... });
   * const attestation = await wallet.waitForBridgeByTrackingId(result.trackingId);
   * console.log('Bridge completed! Attestation:', attestation);
   * ```
   */
  async waitForBridgeByTrackingId(
    trackingId: string,
    options?: { timeout?: number; onProgress?: (status: { progress: number; message: string }) => void }
  ): Promise<Hex> {
    const router = await this.getBridgeRouter();
    return router.waitForCompletionByTrackingId(trackingId, options);
  }

  /**
   * Get minimum bridge amount for a token
   */
  async getMinBridgeAmount(token: StablecoinInfo): Promise<{
    raw: bigint;
    formatted: string;
    usd: number;
  }> {
    const router = await this.getBridgeRouter();
    return router.getMinBridgeAmount(token);
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
    const blocked = this.blockedAddresses.get(to.toLowerCase());
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

  // ============ Swap Methods ============

  /**
   * Get or create Uniswap client (lazy initialization)
   */
  private async getUniswapClient(): Promise<UniswapClient> {
    if (this.uniswapClient === null) {
      const chainId = await this.rpc.getChainId();
      if (!isUniswapSupported(chainId)) {
        throw new EthAgentError({
          code: 'UNISWAP_NOT_SUPPORTED',
          message: `Uniswap is not supported on chain ${chainId}`,
          suggestion: 'Switch to a supported network (Ethereum, Arbitrum, Optimism, Base, Polygon)',
        });
      }
      this.uniswapClient = new UniswapClient({
        rpc: this.rpc,
        account: this.account,
        chainId,
      });
    }
    return this.uniswapClient;
  }

  /**
   * Get a swap quote without executing the swap
   *
   * Returns expected output amount, price impact, fees, and minimum output after slippage.
   * Use this to preview a swap before executing it.
   *
   * @param options - Swap configuration (same as swap())
   * @param options.slippageTolerance - Max slippage as percentage (0.5 = 0.5%, default: 0.5)
   *
   * @example
   * ```typescript
   * const quote = await wallet.getSwapQuote({
   *   fromToken: 'USDC',
   *   toToken: 'ETH',
   *   amount: '100',
   *   slippageTolerance: 1,  // 1% slippage tolerance
   * });
   * console.log(`Will receive: ${quote.toToken.amount} ETH`);
   * console.log(`Minimum (after slippage): ${quote.amountOutMinimum} ETH`);
   * console.log(`Price impact: ${quote.priceImpact}%`);
   * ```
   */
  async getSwapQuote(options: SwapOptions): Promise<SwapQuoteResult> {
    const chainId = await this.rpc.getChainId();

    // Resolve tokens
    const fromResolved = resolveToken(options.fromToken, chainId);
    const toResolved = resolveToken(options.toToken, chainId);

    if (!fromResolved) {
      throw new TokenNotSupportedError({ token: options.fromToken, chainId });
    }
    if (!toResolved) {
      throw new TokenNotSupportedError({ token: options.toToken, chainId });
    }

    // Parse input amount
    const amountIn = parseTokenAmount(options.amount, fromResolved.token);
    const slippage = options.slippageTolerance ?? 0.5;

    // Check for ETH <-> WETH wrap/unwrap (1:1, no Uniswap needed)
    const isFromETH = isNativeETH(fromResolved.token);
    const isToETH = isNativeETH(toResolved.token);
    const isFromWETH = fromResolved.token.symbol.toUpperCase() === 'WETH';
    const isToWETH = toResolved.token.symbol.toUpperCase() === 'WETH';

    if ((isFromETH && isToWETH) || (isFromWETH && isToETH)) {
      // ETH <-> WETH is always 1:1, no slippage, no price impact
      const wethAddr = WETH_ADDRESSES[chainId];
      return {
        fromToken: {
          symbol: fromResolved.token.symbol,
          address: (isFromETH ? wethAddr : fromResolved.address) as Address,
          amount: formatTokenAmount(amountIn, fromResolved.token),
          rawAmount: amountIn,
          decimals: fromResolved.token.decimals,
        },
        toToken: {
          symbol: toResolved.token.symbol,
          address: (isToETH ? wethAddr : toResolved.address) as Address,
          amount: formatTokenAmount(amountIn, toResolved.token), // 1:1
          rawAmount: amountIn, // 1:1
          decimals: toResolved.token.decimals,
        },
        amountOutMinimum: formatTokenAmount(amountIn, toResolved.token), // No slippage on wrap
        fee: 0, // No fee for wrap/unwrap
        priceImpact: 0, // No price impact
        gasEstimate: 50000n, // Estimate for wrap/unwrap
        effectivePrice: '1.000000',
        slippageTolerance: slippage,
      };
    }

    // Handle native ETH - use WETH for quotes
    let tokenInAddress = fromResolved.address;
    if (isFromETH) {
      const wethAddr = WETH_ADDRESSES[chainId];
      if (!wethAddr) {
        throw new EthAgentError({
          code: 'WETH_NOT_CONFIGURED',
          message: `WETH not configured for chain ${chainId}`,
          suggestion: 'Use WETH instead of ETH on this network',
        });
      }
      tokenInAddress = wethAddr;
    }

    let tokenOutAddress = toResolved.address;
    if (isToETH) {
      const wethAddr = WETH_ADDRESSES[chainId];
      if (!wethAddr) {
        throw new EthAgentError({
          code: 'WETH_NOT_CONFIGURED',
          message: `WETH not configured for chain ${chainId}`,
          suggestion: 'Use WETH instead of ETH on this network',
        });
      }
      tokenOutAddress = wethAddr;
    }

    // Get the Uniswap client and fetch quote
    const uniswap = await this.getUniswapClient();

    let quote: SwapQuote;
    try {
      quote = await uniswap.getQuote({
        tokenIn: tokenInAddress as Address,
        tokenOut: tokenOutAddress as Address,
        amountIn,
        slippageTolerance: slippage,
      });
    } catch {
      throw new InsufficientLiquidityError({
        tokenIn: options.fromToken,
        tokenOut: options.toToken,
        chainId,
      });
    }

    // Calculate effective price
    const priceNum =
      Number(formatTokenAmount(quote.amountOut, toResolved.token)) /
      Number(formatTokenAmount(amountIn, fromResolved.token));
    const effectivePrice = priceNum.toFixed(6);

    return {
      fromToken: {
        symbol: fromResolved.token.symbol,
        address: tokenInAddress as Address,
        amount: formatTokenAmount(amountIn, fromResolved.token),
        rawAmount: amountIn,
        decimals: fromResolved.token.decimals,
      },
      toToken: {
        symbol: toResolved.token.symbol,
        address: tokenOutAddress as Address,
        amount: formatTokenAmount(quote.amountOut, toResolved.token),
        rawAmount: quote.amountOut,
        decimals: toResolved.token.decimals,
      },
      amountOutMinimum: formatTokenAmount(quote.amountOutMinimum, toResolved.token),
      priceImpact: quote.priceImpact,
      fee: quote.fee,
      gasEstimate: quote.gasEstimate,
      effectivePrice,
      slippageTolerance: slippage,
    };
  }

  /**
   * Swap tokens using Uniswap V3
   *
   * Supports ETH, WETH, and any ERC20 token by symbol or address.
   * The swap is executed through the Uniswap SwapRouter02 contract.
   *
   * @param options - Swap configuration
   * @param options.fromToken - Token to swap from (symbol like "USDC" or contract address)
   * @param options.toToken - Token to swap to (symbol like "ETH" or contract address)
   * @param options.amount - Human-readable amount (e.g., "100" for 100 tokens)
   * @param options.slippageTolerance - Max slippage as percentage (0.5 = 0.5%, default: 0.5)
   * @param options.deadline - Transaction deadline in seconds (default: 1200)
   *
   * @example
   * ```typescript
   * // Swap 100 USDC for ETH with 0.5% slippage
   * const result = await wallet.swap({
   *   fromToken: 'USDC',
   *   toToken: 'ETH',
   *   amount: '100',
   *   slippageTolerance: 0.5,  // 0.5% slippage tolerance
   * });
   * ```
   */
  async swap(options: SwapOptions): Promise<SwapResult> {
    const chainId = await this.rpc.getChainId();

    // 1. Resolve tokens
    const fromResolved = resolveToken(options.fromToken, chainId);
    const toResolved = resolveToken(options.toToken, chainId);

    if (!fromResolved) {
      throw new TokenNotSupportedError({ token: options.fromToken, chainId });
    }
    if (!toResolved) {
      throw new TokenNotSupportedError({ token: options.toToken, chainId });
    }

    // 2. Check token allowlists/blocklists via limits
    this.limits.checkSwapTransaction(
      fromResolved.token.symbol,
      toResolved.token.symbol,
      0n // We'll check the USD value below
    );

    // 3. Parse amount
    const amountIn = parseTokenAmount(options.amount, fromResolved.token);
    const slippage = options.slippageTolerance ?? this.limits.getMaxSlippagePercent() ?? 0.5;

    // 4. Handle native ETH - use WETH address for swap routing
    const isFromETH = isNativeETH(fromResolved.token);
    const isToETH = isNativeETH(toResolved.token);
    const isFromWETH = fromResolved.token.symbol.toUpperCase() === 'WETH';
    const isToWETH = toResolved.token.symbol.toUpperCase() === 'WETH';

    // Special case: ETH <-> WETH is wrapping/unwrapping, not a swap
    if ((isFromETH && isToWETH) || (isFromWETH && isToETH)) {
      return this.handleETHWETHWrap(options, fromResolved, toResolved, amountIn, chainId);
    }

    let tokenInAddress = fromResolved.address;
    if (isFromETH) {
      const wethAddr = WETH_ADDRESSES[chainId];
      if (!wethAddr) {
        throw new EthAgentError({
          code: 'WETH_NOT_CONFIGURED',
          message: `WETH not configured for chain ${chainId}`,
          suggestion: 'Use WETH instead of ETH on this network',
        });
      }
      tokenInAddress = wethAddr;
    }

    let tokenOutAddress = toResolved.address;
    if (isToETH) {
      const wethAddr = WETH_ADDRESSES[chainId];
      if (!wethAddr) {
        throw new EthAgentError({
          code: 'WETH_NOT_CONFIGURED',
          message: `WETH not configured for chain ${chainId}`,
          suggestion: 'Use WETH instead of ETH on this network',
        });
      }
      tokenOutAddress = wethAddr;
    }

    // 5. Get the Uniswap client and fetch quote
    const uniswap = await this.getUniswapClient();

    let quote: SwapQuote;
    try {
      quote = await uniswap.getQuote({
        tokenIn: tokenInAddress as Address,
        tokenOut: tokenOutAddress as Address,
        amountIn,
        slippageTolerance: slippage,
      });
    } catch {
      throw new InsufficientLiquidityError({
        tokenIn: options.fromToken,
        tokenOut: options.toToken,
        chainId,
      });
    }

    // 6. Check price impact
    const maxPriceImpact = this.limits.getMaxPriceImpactPercent();
    if (quote.priceImpact > maxPriceImpact) {
      throw new PriceImpactTooHighError({
        priceImpact: quote.priceImpact,
        maxAllowed: maxPriceImpact,
      });
    }

    // 7. Estimate USD value for swap limits (uses Uniswap quote for ETH price)
    const usdValue = await this.estimateSwapUSDValue(amountIn, fromResolved.token, chainId);

    // 8. Check swap spending limits with proper USD value
    this.limits.checkSwapTransaction(
      fromResolved.token.symbol,
      toResolved.token.symbol,
      usdValue,
      quote.priceImpact
    );

    // 9. Check balance and approve if needed
    if (isFromETH) {
      // Check ETH balance
      const balance = await this.rpc.getBalance(this.address);
      if (balance < amountIn) {
        throw new InsufficientFundsError({
          required: { wei: amountIn, eth: formatETH(amountIn) },
          available: { wei: balance, eth: formatETH(balance) },
          shortage: { wei: amountIn - balance, eth: formatETH(amountIn - balance) },
        });
      }
    } else {
      // Check token balance and approval
      const tokenContract = new Contract({
        address: tokenInAddress as Address,
        abi: ERC20_ABI,
        rpc: this.rpc,
      });

      const balance = await tokenContract.read<bigint>('balanceOf', [this.address]);
      if (balance < amountIn) {
        throw new InsufficientFundsError({
          required: { wei: amountIn, eth: formatTokenAmount(amountIn, fromResolved.token) },
          available: { wei: balance, eth: formatTokenAmount(balance, fromResolved.token) },
          shortage: {
            wei: amountIn - balance,
            eth: formatTokenAmount(amountIn - balance, fromResolved.token),
          },
        });
      }

      // Ensure approval
      await uniswap.ensureApproval(tokenInAddress as Address, amountIn, this.address);
    }

    // 10. Execute the swap
    const deadline = getDefaultDeadline(options.deadline ?? 1200);

    let result;
    if (isFromETH) {
      // Swap with ETH as input (send value with transaction)
      result = await uniswap.executeSwapWithETH({
        tokenIn: tokenInAddress as Address,
        tokenOut: tokenOutAddress as Address,
        amountIn,
        amountOutMinimum: quote.amountOutMinimum,
        recipient: this.address,
        deadline,
        fee: quote.fee,
        value: amountIn,
      });
    } else {
      // Standard ERC20 to ERC20 (or ERC20 to ETH) swap
      result = await uniswap.executeSwap({
        tokenIn: tokenInAddress as Address,
        tokenOut: tokenOutAddress as Address,
        amountIn,
        amountOutMinimum: quote.amountOutMinimum,
        recipient: this.address,
        deadline,
        fee: quote.fee,
      });
    }

    // 11. Record swap spend
    this.limits.recordSwapSpend(
      fromResolved.token.symbol,
      toResolved.token.symbol,
      usdValue
    );

    // 12. Calculate effective price
    const priceNum =
      Number(formatTokenAmount(result.amountOut, toResolved.token)) /
      Number(formatTokenAmount(amountIn, fromResolved.token));
    const effectivePrice = priceNum.toFixed(6);

    // 13. Get updated limits
    const swapStatus = this.limits.getSwapStatus();

    return {
      success: true,
      hash: result.hash as Hash,
      summary: `Swapped ${formatTokenAmount(amountIn, fromResolved.token)} ${fromResolved.token.symbol} for ${formatTokenAmount(result.amountOut, toResolved.token)} ${toResolved.token.symbol}. TX: ${result.hash}`,
      swap: {
        tokenIn: {
          symbol: fromResolved.token.symbol,
          amount: formatTokenAmount(amountIn, fromResolved.token),
          rawAmount: amountIn,
        },
        tokenOut: {
          symbol: toResolved.token.symbol,
          amount: formatTokenAmount(result.amountOut, toResolved.token),
          rawAmount: result.amountOut,
        },
        effectivePrice,
        priceImpact: quote.priceImpact,
      },
      transaction: {
        hash: result.hash as Hash,
        from: this.address,
        gasUsed: result.gasUsed,
        effectiveGasPrice: result.effectiveGasPrice,
        blockNumber: result.blockNumber,
      },
      limits: {
        remaining: {
          daily: { usd: swapStatus.daily.remaining },
        },
      },
    };
  }

  /**
   * Safe version of swap that returns a Result
   */
  async safeSwap(options: SwapOptions): Promise<Result<SwapResult, EthAgentError>> {
    try {
      const result = await this.swap(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to execute swap',
      }));
    }
  }

  /**
   * Get current swap limit status
   */
  getSwapLimits(): ReturnType<LimitsEngine['getSwapStatus']> {
    return this.limits.getSwapStatus();
  }

  /**
   * Handle ETH <-> WETH wrapping/unwrapping
   * This is a direct operation with the WETH contract, not a Uniswap swap
   */
  private async handleETHWETHWrap(
    _options: SwapOptions,
    fromResolved: { token: TokenInfo; address: string },
    toResolved: { token: TokenInfo; address: string },
    amountIn: bigint,
    chainId: number
  ): Promise<SwapResult> {
    const uniswap = await this.getUniswapClient();
    const isWrapping = isNativeETH(fromResolved.token); // ETH -> WETH

    // Check balance
    if (isWrapping) {
      const balance = await this.rpc.getBalance(this.address);
      if (balance < amountIn) {
        throw new InsufficientFundsError({
          required: { wei: amountIn, eth: formatETH(amountIn) },
          available: { wei: balance, eth: formatETH(balance) },
          shortage: { wei: amountIn - balance, eth: formatETH(amountIn - balance) },
        });
      }
    } else {
      // Unwrapping - check WETH balance
      const wethAddress = WETH_ADDRESSES[chainId];
      const tokenContract = new Contract({
        address: wethAddress as Address,
        abi: ERC20_ABI,
        rpc: this.rpc,
      });
      const balance = await tokenContract.read<bigint>('balanceOf', [this.address]);
      if (balance < amountIn) {
        throw new InsufficientFundsError({
          required: { wei: amountIn, eth: formatTokenAmount(amountIn, fromResolved.token) },
          available: { wei: balance, eth: formatTokenAmount(balance, fromResolved.token) },
          shortage: {
            wei: amountIn - balance,
            eth: formatTokenAmount(amountIn - balance, fromResolved.token),
          },
        });
      }
    }

    // Execute wrap or unwrap
    const result = isWrapping
      ? await uniswap.wrapETH(amountIn)
      : await uniswap.unwrapWETH(amountIn);

    // Get updated limits
    const swapStatus = this.limits.getSwapStatus();

    return {
      success: true,
      hash: result.hash as Hash,
      summary: isWrapping
        ? `Wrapped ${formatTokenAmount(amountIn, fromResolved.token)} ETH to WETH. TX: ${result.hash}`
        : `Unwrapped ${formatTokenAmount(amountIn, fromResolved.token)} WETH to ETH. TX: ${result.hash}`,
      swap: {
        tokenIn: {
          symbol: fromResolved.token.symbol,
          amount: formatTokenAmount(amountIn, fromResolved.token),
          rawAmount: amountIn,
        },
        tokenOut: {
          symbol: toResolved.token.symbol,
          amount: formatTokenAmount(result.amountOut, toResolved.token),
          rawAmount: result.amountOut,
        },
        effectivePrice: '1.000000', // 1:1 for wrap/unwrap
        priceImpact: 0,
      },
      transaction: {
        hash: result.hash as Hash,
        from: this.address,
        gasUsed: result.gasUsed,
      },
      limits: {
        remaining: {
          daily: { usd: swapStatus.daily.remaining },
        },
      },
    };
  }

  /**
   * Get current ETH price in USD using Uniswap quote (cached for 5 minutes)
   *
   * @throws {EthAgentError} If ETH price cannot be fetched (no USDC/WETH on chain, or quote fails)
   */
  private async getETHPriceInUSD(chainId: number): Promise<bigint> {
    // Return cached price if fresh
    if (
      this.cachedETHPrice &&
      Date.now() - this.cachedETHPrice.timestamp < this.ETH_PRICE_CACHE_TTL
    ) {
      return this.cachedETHPrice.value;
    }

    // Get USDC address for this chain
    const usdcToken = getTokenBySymbol('USDC');
    const usdcAddress = usdcToken ? getTokenAddress(usdcToken, chainId) : undefined;
    const wethAddress = WETH_ADDRESSES[chainId];

    // Fail explicitly if USDC or WETH not available on this chain
    if (!usdcAddress || !wethAddress) {
      throw new EthAgentError({
        code: 'ETH_PRICE_UNAVAILABLE',
        message: `Cannot fetch ETH price on chain ${chainId}: USDC or WETH not available`,
        details: { chainId, hasUSDC: !!usdcAddress, hasWETH: !!wethAddress },
        suggestion: 'Use a chain with USDC liquidity (Mainnet, Arbitrum, Optimism, Base, Polygon) or swap stablecoins directly',
      });
    }

    // Fetch current price using existing Uniswap infrastructure
    const uniswap = await this.getUniswapClient();

    try {
      const quote = await uniswap.getQuote({
        tokenIn: wethAddress as Address,
        tokenOut: usdcAddress as Address,
        amountIn: 10n ** 18n, // 1 ETH
        slippageTolerance: 1,
      });

      // Cache the result (amountOut is in USDC which has 6 decimals)
      this.cachedETHPrice = { value: quote.amountOut, timestamp: Date.now() };
      return quote.amountOut;
    } catch (error) {
      // Fail explicitly if quote fails - don't use arbitrary fallback
      throw new EthAgentError({
        code: 'ETH_PRICE_QUOTE_FAILED',
        message: `Failed to fetch ETH price from Uniswap on chain ${chainId}`,
        details: { chainId, error: (error as Error).message },
        suggestion: 'The ETH/USDC pool may have insufficient liquidity. Try again later or use a different chain',
        retryable: true,
        retryAfter: 30000, // 30 seconds
      });
    }
  }

  /**
   * Estimate USD value of a swap amount
   * Uses Uniswap quotes for ETH/WETH pricing, cached for efficiency
   */
  private async estimateSwapUSDValue(
    amount: bigint,
    token: TokenInfo,
    chainId: number
  ): Promise<bigint> {
    // For stablecoins, the value is approximately 1:1 with USD
    const stablecoins = ['USDC', 'USDT', 'USDS', 'DAI', 'PYUSD', 'FRAX'];
    if (stablecoins.includes(token.symbol.toUpperCase())) {
      // Normalize to 6 decimals (USD standard)
      if (token.decimals === 6) {
        return amount;
      } else if (token.decimals > 6) {
        return amount / 10n ** BigInt(token.decimals - 6);
      } else {
        return amount * 10n ** BigInt(6 - token.decimals);
      }
    }

    // For ETH/WETH, get real-time price from Uniswap
    if (token.symbol === 'ETH' || token.symbol === 'WETH') {
      const ethPriceUSD = await this.getETHPriceInUSD(chainId);
      // ethPriceUSD is in 6 decimals, amount is in 18 decimals
      return (amount * ethPriceUSD) / 10n ** 18n;
    }

    // For other tokens, use a conservative estimate based on amount
    // Normalize to 6 decimals and assume $1 = 1 token unit
    if (token.decimals === 6) {
      return amount;
    } else if (token.decimals > 6) {
      return amount / 10n ** BigInt(token.decimals - 6);
    } else {
      return amount * 10n ** BigInt(6 - token.decimals);
    }
  }
}

// Convenience function for creating wallets
export function createWallet(config: AgentWalletConfig): AgentWallet {
  return AgentWallet.create(config);
}

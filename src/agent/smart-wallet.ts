/**
 * SmartAgentWallet - Smart Account based wallet for gasless and batch operations
 * Extends AgentWallet functionality with ERC-4337 account abstraction
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { formatETH } from '../core/units.js';
import { isAddress, toChecksumAddress } from '../core/address.js';
import type { Account } from '../protocol/account.js';
import { EOA } from '../protocol/account.js';
import { RPCClient } from '../protocol/rpc.js';
import { ENS } from '../protocol/ens.js';
import { Contract, ERC20_ABI } from '../protocol/contract.js';
import { SmartAccount, type CallData } from '../protocol/smart-account.js';
import { BundlerClient } from '../protocol/bundler.js';
import { type Paymaster, RemotePaymaster } from '../protocol/paymaster.js';
import { ENTRY_POINT_V07 } from '../protocol/userop.js';
import { LimitsEngine, type SpendingLimits } from './limits.js';
import { encodeFunctionCall } from '../core/abi.js';
import {
  EthAgentError,
  InsufficientFundsError,
  InvalidAddressError,
  BlockedAddressError,
} from './errors.js';
import { type Result, ok, err } from '../core/result.js';
import {
  type StablecoinInfo,
  USDC,
  USDT,
  getStablecoinAddress,
  parseStablecoinAmount,
  formatStablecoinAmount,
} from '../stablecoins/index.js';

export interface SmartWalletConfig {
  // Account (private key or Account object - becomes the smart account owner)
  account?: Account;
  privateKey?: Hex | string;

  // Network
  network?: 'mainnet' | 'sepolia' | 'goerli' | string;
  rpcUrl?: string;

  // Bundler (required for smart accounts)
  bundlerUrl: string;

  // Paymaster (optional - enables gasless transactions)
  paymaster?: Paymaster | { url: string; apiKey?: string };

  // Safety
  limits?: SpendingLimits;

  // Address policies
  trustedAddresses?: Array<{ address: string; label?: string }>;
  blockedAddresses?: Array<{ address: string; reason?: string }>;

  // Smart account options
  factoryAddress?: Address;
  entryPoint?: Address;
  index?: bigint;

  // Agent identification
  agentId?: string;
}

export interface BatchTransferItem {
  to: string;       // Address or ENS name
  amount: string | number;  // Human-readable amount
}

export interface BatchTransferResult {
  success: boolean;
  userOpHash: Hash;
  transactionHash: Hash;
  summary: string;
  transfers: Array<{
    to: Address;
    amount: string;
    rawAmount: bigint;
  }>;
  token: {
    symbol: string;
    totalAmount: string;
    totalRawAmount: bigint;
  };
  gasless: boolean;
}

export interface SendStablecoinGaslessResult {
  success: boolean;
  userOpHash: Hash;
  transactionHash: Hash;
  summary: string;
  token: {
    symbol: string;
    amount: string;
    rawAmount: bigint;
  };
  to: Address;
  gasless: boolean;
}

/**
 * SmartAgentWallet - Smart account based wallet for AI agents
 * Supports gasless transactions via paymasters and batch operations
 */
export class SmartAgentWallet {
  readonly address: Address;           // Smart account address
  readonly ownerAddress: Address;      // EOA owner address
  private readonly rpc: RPCClient;
  private readonly ens: ENS;
  private readonly smartAccount: SmartAccount;
  private readonly paymaster: Paymaster | null;
  private readonly limits: LimitsEngine;
  private readonly blockedAddresses: Map<string, string>;
  private readonly agentId: string;
  private chainId: number | null = null;

  private constructor(config: {
    owner: Account;
    rpc: RPCClient;
    smartAccount: SmartAccount;
    paymaster: Paymaster | null;
    limits: SpendingLimits;
    blockedAddresses: Map<string, string>;
    agentId: string;
  }) {
    this.ownerAddress = config.owner.address;
    this.rpc = config.rpc;
    this.ens = new ENS(config.rpc);
    this.smartAccount = config.smartAccount;
    this.address = config.smartAccount.address;
    this.paymaster = config.paymaster;
    this.limits = new LimitsEngine(config.limits);
    this.blockedAddresses = config.blockedAddresses;
    this.agentId = config.agentId;
  }

  /**
   * Create a new SmartAgentWallet
   */
  static async create(config: SmartWalletConfig): Promise<SmartAgentWallet> {
    // Resolve owner account
    let owner: Account;
    if (config.account) {
      owner = config.account;
    } else if (config.privateKey) {
      const key = config.privateKey.startsWith('0x')
        ? config.privateKey as Hex
        : `0x${config.privateKey}` as Hex;
      owner = EOA.fromPrivateKey(key);
    } else {
      owner = EOA.generate();
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
    const bundler = new BundlerClient({
      url: config.bundlerUrl,
      entryPoint: config.entryPoint ?? ENTRY_POINT_V07,
    });

    // Create smart account
    const smartAccount = await SmartAccount.create({
      owner,
      rpc,
      bundler,
      factoryAddress: config.factoryAddress,
      entryPoint: config.entryPoint ?? ENTRY_POINT_V07,
      index: config.index,
    });

    // Setup paymaster
    let paymaster: Paymaster | null = null;
    if (config.paymaster) {
      if ('getPaymasterData' in config.paymaster) {
        paymaster = config.paymaster;
      } else {
        // Create RemotePaymaster from URL config
        paymaster = new RemotePaymaster({
          url: config.paymaster.url,
          apiKey: config.paymaster.apiKey,
          entryPoint: config.entryPoint ?? ENTRY_POINT_V07,
        });
      }
    }

    // Build blocked address map
    const blockedAddresses = new Map<string, string>();
    for (const addr of config.blockedAddresses ?? []) {
      blockedAddresses.set(addr.address.toLowerCase(), addr.reason ?? 'Blocked');
    }

    return new SmartAgentWallet({
      owner,
      rpc,
      smartAccount,
      paymaster,
      limits: config.limits ?? {},
      blockedAddresses,
      agentId: config.agentId ?? 'smart-agent',
    });
  }

  /**
   * Get chain ID (cached)
   */
  private async getChainId(): Promise<number> {
    if (this.chainId === null) {
      this.chainId = await this.rpc.getChainId();
    }
    return this.chainId;
  }

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

  // ============ Gasless Stablecoin Transfers ============

  /**
   * Send stablecoins without paying gas (requires paymaster)
   */
  async sendStablecoinGasless(options: {
    token: StablecoinInfo;
    to: string;
    amount: string | number;
  }): Promise<SendStablecoinGaslessResult> {
    if (!this.paymaster) {
      throw new EthAgentError({
        code: 'NO_PAYMASTER',
        message: 'Gasless transactions require a paymaster',
        suggestion: 'Configure a paymaster when creating the wallet',
      });
    }

    const chainId = await this.getChainId();
    const tokenAddress = getStablecoinAddress(options.token, chainId);

    if (!tokenAddress) {
      throw new EthAgentError({
        code: 'UNSUPPORTED_STABLECOIN',
        message: `${options.token.symbol} is not available on chain ${chainId}`,
        suggestion: 'Use a different stablecoin or switch to a supported network',
      });
    }

    const to = await this.resolveAddress(options.to);

    // Check if blocked
    const blocked = this.blockedAddresses.get(to.toLowerCase());
    if (blocked) {
      throw new BlockedAddressError(to, blocked);
    }

    // Parse amount
    const rawAmount = parseStablecoinAmount(options.amount, options.token);
    const formattedAmount = formatStablecoinAmount(rawAmount, options.token);

    // Check stablecoin limits
    this.limits.checkStablecoinTransaction(options.token, rawAmount);

    // Check balance
    const contract = new Contract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      rpc: this.rpc,
    });

    const balance = await contract.read<bigint>('balanceOf', [this.address]);
    if (balance < rawAmount) {
      throw new InsufficientFundsError({
        required: { wei: rawAmount, eth: formattedAmount },
        available: { wei: balance, eth: formatStablecoinAmount(balance, options.token) },
        shortage: { wei: rawAmount - balance, eth: formatStablecoinAmount(rawAmount - balance, options.token) },
      });
    }

    // Build transfer call data
    const callData = this.encodeERC20Transfer(to, rawAmount);

    // Get paymaster data
    const userOp = await this.smartAccount.buildUserOp({ to: tokenAddress as Address, value: 0n, data: callData });
    const paymasterResult = await this.paymaster.getPaymasterData(userOp);

    // Execute with paymaster
    const result = await this.smartAccount.execute(
      { to: tokenAddress as Address, value: 0n, data: callData },
      { paymasterAndData: paymasterResult.paymasterAndData }
    );

    // Record stablecoin spend
    this.limits.recordStablecoinSpend(options.token, rawAmount);

    return {
      success: result.success,
      userOpHash: result.userOpHash,
      transactionHash: result.transactionHash,
      summary: `Sent ${formattedAmount} ${options.token.symbol} to ${options.to} (gasless). TX: ${result.transactionHash}`,
      token: {
        symbol: options.token.symbol,
        amount: formattedAmount,
        rawAmount,
      },
      to,
      gasless: true,
    };
  }

  /**
   * Send USDC gaslessly
   */
  async sendUSDCGasless(options: { to: string; amount: string | number }): Promise<SendStablecoinGaslessResult> {
    return this.sendStablecoinGasless({ token: USDC, ...options });
  }

  /**
   * Send USDT gaslessly
   */
  async sendUSDTGasless(options: { to: string; amount: string | number }): Promise<SendStablecoinGaslessResult> {
    return this.sendStablecoinGasless({ token: USDT, ...options });
  }

  // ============ Batch Transfers ============

  /**
   * Send stablecoins to multiple recipients in a single transaction
   */
  async sendStablecoinBatch(options: {
    token: StablecoinInfo;
    transfers: BatchTransferItem[];
    gasless?: boolean;
  }): Promise<BatchTransferResult> {
    const gasless = options.gasless ?? (this.paymaster !== null);

    if (gasless && !this.paymaster) {
      throw new EthAgentError({
        code: 'NO_PAYMASTER',
        message: 'Gasless batch transfers require a paymaster',
        suggestion: 'Configure a paymaster or set gasless: false',
      });
    }

    if (options.transfers.length === 0) {
      throw new EthAgentError({
        code: 'EMPTY_BATCH',
        message: 'Batch transfer requires at least one transfer',
        suggestion: 'Provide one or more transfers',
      });
    }

    const chainId = await this.getChainId();
    const tokenAddress = getStablecoinAddress(options.token, chainId);

    if (!tokenAddress) {
      throw new EthAgentError({
        code: 'UNSUPPORTED_STABLECOIN',
        message: `${options.token.symbol} is not available on chain ${chainId}`,
        suggestion: 'Use a different stablecoin or switch to a supported network',
      });
    }

    // Resolve all addresses and parse amounts
    const resolvedTransfers: Array<{
      to: Address;
      amount: string;
      rawAmount: bigint;
    }> = [];

    let totalRawAmount = 0n;

    for (const transfer of options.transfers) {
      const to = await this.resolveAddress(transfer.to);

      // Check if blocked
      const blocked = this.blockedAddresses.get(to.toLowerCase());
      if (blocked) {
        throw new BlockedAddressError(to, blocked);
      }

      const rawAmount = parseStablecoinAmount(transfer.amount, options.token);
      const formattedAmount = formatStablecoinAmount(rawAmount, options.token);

      resolvedTransfers.push({
        to,
        amount: formattedAmount,
        rawAmount,
      });

      totalRawAmount += rawAmount;
    }

    const totalFormattedAmount = formatStablecoinAmount(totalRawAmount, options.token);

    // Check stablecoin limits for total amount
    this.limits.checkStablecoinTransaction(options.token, totalRawAmount);

    // Check total balance
    const contract = new Contract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      rpc: this.rpc,
    });

    const balance = await contract.read<bigint>('balanceOf', [this.address]);
    if (balance < totalRawAmount) {
      throw new InsufficientFundsError({
        required: { wei: totalRawAmount, eth: totalFormattedAmount },
        available: { wei: balance, eth: formatStablecoinAmount(balance, options.token) },
        shortage: { wei: totalRawAmount - balance, eth: formatStablecoinAmount(totalRawAmount - balance, options.token) },
      });
    }

    // Build batch calls
    const calls: CallData[] = resolvedTransfers.map((transfer) => ({
      to: tokenAddress as Address,
      value: 0n,
      data: this.encodeERC20Transfer(transfer.to, transfer.rawAmount),
    }));

    // Execute batch
    let result: { userOpHash: Hash; transactionHash: Hash; success: boolean };

    if (gasless && this.paymaster) {
      const userOp = await this.smartAccount.buildUserOp(calls);
      const paymasterResult = await this.paymaster.getPaymasterData(userOp);
      result = await this.smartAccount.execute(calls, { paymasterAndData: paymasterResult.paymasterAndData });
    } else {
      result = await this.smartAccount.execute(calls);
    }

    // Record stablecoin spend
    this.limits.recordStablecoinSpend(options.token, totalRawAmount);

    return {
      success: result.success,
      userOpHash: result.userOpHash,
      transactionHash: result.transactionHash,
      summary: `Sent ${totalFormattedAmount} ${options.token.symbol} to ${resolvedTransfers.length} recipients${gasless ? ' (gasless)' : ''}. TX: ${result.transactionHash}`,
      transfers: resolvedTransfers,
      token: {
        symbol: options.token.symbol,
        totalAmount: totalFormattedAmount,
        totalRawAmount,
      },
      gasless,
    };
  }

  /**
   * Send USDC to multiple recipients
   */
  async sendUSDCBatch(transfers: BatchTransferItem[], options?: { gasless?: boolean }): Promise<BatchTransferResult> {
    return this.sendStablecoinBatch({ token: USDC, transfers, gasless: options?.gasless });
  }

  /**
   * Send USDT to multiple recipients
   */
  async sendUSDTBatch(transfers: BatchTransferItem[], options?: { gasless?: boolean }): Promise<BatchTransferResult> {
    return this.sendStablecoinBatch({ token: USDT, transfers, gasless: options?.gasless });
  }

  // ============ Safe Variants ============

  /**
   * Safe version of sendStablecoinGasless
   */
  async safeSendStablecoinGasless(options: {
    token: StablecoinInfo;
    to: string;
    amount: string | number;
  }): Promise<Result<SendStablecoinGaslessResult, EthAgentError>> {
    try {
      const result = await this.sendStablecoinGasless(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to send stablecoin gaslessly',
      }));
    }
  }

  /**
   * Safe version of sendStablecoinBatch
   */
  async safeSendStablecoinBatch(options: {
    token: StablecoinInfo;
    transfers: BatchTransferItem[];
    gasless?: boolean;
  }): Promise<Result<BatchTransferResult, EthAgentError>> {
    try {
      const result = await this.sendStablecoinBatch(options);
      return ok(result);
    } catch (error) {
      if (error instanceof EthAgentError) {
        return err(error);
      }
      return err(new EthAgentError({
        code: 'UNKNOWN_ERROR',
        message: (error as Error).message,
        suggestion: 'Failed to send stablecoin batch',
      }));
    }
  }

  // ============ Utility Methods ============

  /**
   * Encode ERC20 transfer call data
   */
  private encodeERC20Transfer(to: Address, amount: bigint): Hex {
    return encodeFunctionCall(
      { name: 'transfer', inputs: [{ type: 'address' }, { type: 'uint256' }] },
      [to, amount]
    );
  }

  /**
   * Check if the smart account is deployed
   */
  async isDeployed(): Promise<boolean> {
    return this.smartAccount.isDeployed();
  }

  /**
   * Get ETH balance of the smart account
   */
  async getBalance(): Promise<{ wei: bigint; eth: string; formatted: string }> {
    const balance = await this.rpc.getBalance(this.address);
    return {
      wei: balance,
      eth: formatETH(balance),
      formatted: `${formatETH(balance)} ETH`,
    };
  }

  /**
   * Get stablecoin balance
   */
  async getStablecoinBalance(stablecoin: StablecoinInfo, address?: string): Promise<{
    raw: bigint;
    formatted: string;
    symbol: string;
    decimals: number;
  }> {
    const chainId = await this.getChainId();
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
   * Get wallet capabilities
   */
  getCapabilities(): {
    address: Address;
    ownerAddress: Address;
    agentId: string;
    isSmartAccount: true;
    hasPaymaster: boolean;
    operations: string[];
  } {
    return {
      address: this.address,
      ownerAddress: this.ownerAddress,
      agentId: this.agentId,
      isSmartAccount: true,
      hasPaymaster: this.paymaster !== null,
      operations: [
        'sendStablecoinGasless',
        'sendStablecoinBatch',
        'sendUSDCGasless',
        'sendUSDTGasless',
        'sendUSDCBatch',
        'sendUSDTBatch',
        'getBalance',
        'getStablecoinBalance',
      ],
    };
  }
}

/**
 * Create a smart agent wallet
 */
export async function createSmartWallet(config: SmartWalletConfig): Promise<SmartAgentWallet> {
  return SmartAgentWallet.create(config);
}

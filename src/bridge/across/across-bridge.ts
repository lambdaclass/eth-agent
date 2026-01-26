/**
 * Across Bridge - Main bridge orchestrator
 * Handles the complete bridge flow using Across Protocol
 */

import type { Address, Hex, Hash } from '../../core/types.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { Account } from '../../protocol/account.js';
import type { StablecoinInfo } from '../../stablecoins/index.js';
import {
  parseStablecoinAmount,
  formatStablecoinAmount,
  getStablecoinAddress,
} from '../../stablecoins/index.js';
import { TransactionBuilder } from '../../protocol/transaction.js';
import { GasOracle } from '../../protocol/gas.js';
import { NonceManager } from '../../protocol/nonce.js';
import type { BridgeRequest, BridgeInitResult, BridgeStatusResult, BridgeStatus } from '../types.js';
import { BridgeUnsupportedRouteError, BridgeCompletionError, BridgeLimitError } from '../errors.js';
import {
  getAcrossConfig,
  getSupportedAcrossChains,
  getAcrossTokenAddress,
  getAcrossChainName,
  isAcrossTestnet,
} from './constants.js';
import { SpokePoolContract } from './spoke-pool.js';
import { AcrossApiClient, type AcrossQuoteResponse } from './api-client.js';

/**
 * Configuration for AcrossBridge
 */
export interface AcrossBridgeConfig {
  /** RPC client for the source chain */
  sourceRpc: RPCClient;
  /** Account for signing transactions */
  account: Account;
  /** Use testnet (auto-detected from chain ID if not specified) */
  testnet?: boolean;
  /** Default slippage tolerance in basis points (default: 100 = 1%) */
  defaultSlippageBps?: number;
}

/**
 * Quote result with calculated amounts
 */
export interface AcrossQuote {
  /** Input amount (raw) */
  inputAmount: bigint;
  /** Output amount after fees */
  outputAmount: bigint;
  /** Total fee (raw) */
  totalFee: bigint;
  /** Fee percentage (basis points) */
  feeBps: number;
  /** Quote timestamp (use in deposit) */
  quoteTimestamp: number;
  /** Fill deadline (from API) */
  fillDeadline: number;
  /** Exclusive relayer address */
  exclusiveRelayer: string;
  /** Exclusivity deadline */
  exclusivityDeadline: number;
  /** Expected fill time in seconds */
  expectedFillTimeSec: number;
  /** Route limits */
  limits: {
    minDeposit: bigint;
    maxDeposit: bigint;
  };
  /** Is amount too low */
  isAmountTooLow: boolean;
  /** Raw API response */
  raw: AcrossQuoteResponse;
}

/**
 * Preview result for bridge operation
 */
export interface AcrossBridgePreview {
  /** Whether the bridge can proceed */
  canBridge: boolean;
  /** Reasons why bridge cannot proceed */
  blockers: string[];
  /** Quote details */
  quote: AcrossQuote | null;
  /** Source chain info */
  sourceChain: { id: number; name: string };
  /** Destination chain info */
  destinationChain: { id: number; name: string };
  /** Amount to bridge */
  amount: { raw: bigint; formatted: string };
  /** Current balance */
  balance: { raw: bigint; formatted: string };
  /** Whether token approval is needed */
  needsApproval: boolean;
}

/**
 * Across Bridge implementation
 */
export class AcrossBridge {
  private readonly sourceRpc: RPCClient;
  private readonly account: Account;
  private readonly testnet?: boolean;
  private readonly gasOracle: GasOracle;
  private readonly nonceManager: NonceManager;

  private cachedChainId?: number;
  private spokePool?: SpokePoolContract;
  private apiClient?: AcrossApiClient;

  constructor(config: AcrossBridgeConfig) {
    this.sourceRpc = config.sourceRpc;
    this.account = config.account;
    this.testnet = config.testnet; // Will be auto-detected in getApiClient if undefined
    this.gasOracle = new GasOracle(config.sourceRpc);
    this.nonceManager = new NonceManager({ rpc: config.sourceRpc, address: config.account.address });
  }

  /**
   * Get supported chain IDs
   */
  getSupportedChains(): number[] {
    return getSupportedAcrossChains();
  }

  /**
   * Check if a route is supported
   */
  isRouteSupported(sourceChainId: number, destChainId: number, token: string): boolean {
    if (sourceChainId === destChainId) return false;

    const sourceConfig = getAcrossConfig(sourceChainId);
    const destConfig = getAcrossConfig(destChainId);

    if (!sourceConfig || !destConfig) return false;

    // Check if token is supported on both chains
    // Token symbols may vary (e.g., USDC vs USDC.e), so check for common base
    const normalizedToken = this.normalizeTokenSymbol(token);
    const hasSourceToken = Object.keys(sourceConfig.supportedTokens).some(
      (t) => this.normalizeTokenSymbol(t) === normalizedToken
    );
    const hasDestToken = Object.keys(destConfig.supportedTokens).some(
      (t) => this.normalizeTokenSymbol(t) === normalizedToken
    );

    return hasSourceToken && hasDestToken;
  }

  /**
   * Get estimated time for bridging
   */
  getEstimatedTime(): string {
    return '2-5 minutes';
  }

  /**
   * Get a quote for the bridge
   */
  async getQuote(request: BridgeRequest): Promise<AcrossQuote> {
    const sourceChainId = await this.getSourceChainId();
    const apiClient = await this.getApiClient();

    // Get token addresses
    const inputToken = this.getTokenAddress(sourceChainId, request.token);
    const outputToken = this.getTokenAddress(request.destinationChainId, request.token);

    if (!inputToken || !outputToken) {
      throw new BridgeUnsupportedRouteError({
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token: request.token.symbol,
        supportedChains: this.getSupportedChains(),
      });
    }

    // Parse amount
    const amount = parseStablecoinAmount(request.amount, request.token);

    // Get quote from API
    const quoteResponse = await apiClient.getQuote({
      originChainId: sourceChainId,
      destinationChainId: request.destinationChainId,
      inputToken,
      outputToken,
      amount: amount.toString(),
      recipient: request.recipient,
    });

    // Calculate amounts
    const totalFee = BigInt(quoteResponse.totalRelayFee.total);
    // Use API-provided outputAmount when available (more accurate)
    const outputAmount = quoteResponse.outputAmount
      ? BigInt(quoteResponse.outputAmount)
      : amount - totalFee;
    // Issue #8: Use bigint arithmetic for fee calculation to avoid precision loss
    // pct can be in two formats:
    // - 1e18 precision (API): "12312744091431953" = 1.23%
    // - Decimal string (tests): "0.005" = 0.5%
    const pctString = quoteResponse.totalRelayFee.pct;
    let feeBps: number;
    if (pctString.includes('.')) {
      // Decimal format (tests): "0.005" = 0.5% = 50 bps
      feeBps = Math.round(Number(pctString) * 10000);
    } else {
      // 1e18 precision (API): divide by 1e14 to get basis points
      const pctBigInt = BigInt(pctString);
      feeBps = Number(pctBigInt / 10n ** 14n);
    }

    return {
      inputAmount: amount,
      outputAmount,
      totalFee,
      feeBps,
      quoteTimestamp: quoteResponse.timestamp,
      fillDeadline: quoteResponse.fillDeadline,
      exclusiveRelayer: quoteResponse.exclusiveRelayer,
      exclusivityDeadline: quoteResponse.exclusivityDeadline,
      expectedFillTimeSec: quoteResponse.expectedFillTimeSec,
      limits: {
        minDeposit: BigInt(quoteResponse.limits.minDeposit),
        maxDeposit: BigInt(quoteResponse.limits.maxDeposit),
      },
      isAmountTooLow: quoteResponse.isAmountTooLow,
      raw: quoteResponse,
    };
  }

  /**
   * Preview a bridge operation
   */
  async previewBridge(request: BridgeRequest): Promise<AcrossBridgePreview> {
    const sourceChainId = await this.getSourceChainId();
    const blockers: string[] = [];
    let quote: AcrossQuote | null = null;

    // Parse amount
    const amount = parseStablecoinAmount(request.amount, request.token);
    const formattedAmount = formatStablecoinAmount(amount, request.token);

    // Check route support
    if (!this.isRouteSupported(sourceChainId, request.destinationChainId, request.token.symbol)) {
      blockers.push(
        `Route not supported: ${request.token.symbol} from chain ${String(sourceChainId)} to ${String(request.destinationChainId)}`
      );
    }

    // Try to get quote
    try {
      quote = await this.getQuote(request);

      if (quote.isAmountTooLow) {
        blockers.push(
          `Amount too low. Minimum: ${formatStablecoinAmount(quote.limits.minDeposit, request.token)} ${request.token.symbol}`
        );
      }

      if (amount > quote.limits.maxDeposit) {
        blockers.push(
          `Amount exceeds maximum. Max: ${formatStablecoinAmount(quote.limits.maxDeposit, request.token)} ${request.token.symbol}`
        );
      }
    } catch (error) {
      blockers.push(`Failed to get quote: ${(error as Error).message}`);
    }

    // Check balance
    const inputToken = this.getTokenAddress(sourceChainId, request.token);
    let balance = 0n;
    let needsApproval = false;

    if (inputToken) {
      try {
        balance = await this.getTokenBalance(inputToken);
        if (balance < amount) {
          const shortage = formatStablecoinAmount(amount - balance, request.token);
          blockers.push(`Insufficient ${request.token.symbol} balance. Need ${shortage} more.`);
        }

        // Check allowance
        const spokePool = await this.getSpokePool();
        const allowance = await this.getAllowance(inputToken, spokePool.spokePoolAddress);
        needsApproval = allowance < amount;
      } catch {
        // Ignore balance check errors in preview
      }
    }

    return {
      canBridge: blockers.length === 0 && quote !== null,
      blockers,
      quote,
      sourceChain: {
        id: sourceChainId,
        name: getAcrossChainName(sourceChainId),
      },
      destinationChain: {
        id: request.destinationChainId,
        name: getAcrossChainName(request.destinationChainId),
      },
      amount: { raw: amount, formatted: formattedAmount },
      balance: { raw: balance, formatted: formatStablecoinAmount(balance, request.token) },
      needsApproval,
    };
  }

  /**
   * Initiate a bridge transfer
   */
  async initiateBridge(request: BridgeRequest): Promise<BridgeInitResult> {
    const sourceChainId = await this.getSourceChainId();

    // Validate route
    if (!this.isRouteSupported(sourceChainId, request.destinationChainId, request.token.symbol)) {
      throw new BridgeUnsupportedRouteError({
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token: request.token.symbol,
        supportedChains: this.getSupportedChains(),
      });
    }

    // Get quote
    const quote = await this.getQuote(request);

    if (quote.isAmountTooLow) {
      throw new BridgeLimitError({
        type: 'transaction',
        requested: formatStablecoinAmount(quote.inputAmount, request.token),
        limit: formatStablecoinAmount(quote.limits.minDeposit, request.token),
      });
    }

    // Get token addresses
    const inputToken = this.getTokenAddress(sourceChainId, request.token)!;
    const outputToken = this.getTokenAddress(request.destinationChainId, request.token)!;

    // Ensure approval
    const spokePool = await this.getSpokePool();
    await this.ensureApproval(inputToken, spokePool.spokePoolAddress, quote.inputAmount);

    // Determine recipient
    const depositor = this.account.address;
    const recipient = (request.recipient ?? depositor) as Address;

    // Execute deposit
    const depositResult = await spokePool.depositV3({
      depositor,
      recipient,
      inputToken,
      outputToken,
      inputAmount: quote.inputAmount,
      outputAmount: quote.outputAmount,
      destinationChainId: request.destinationChainId,
      quoteTimestamp: quote.quoteTimestamp,
      fillDeadline: quote.fillDeadline,
      exclusiveRelayer: quote.exclusiveRelayer as Address,
      exclusivityDeadline: quote.exclusivityDeadline,
    });

    const formattedAmount = formatStablecoinAmount(quote.inputAmount, request.token);

    return {
      success: true,
      burnTxHash: depositResult.txHash,
      // For Across, we use depositId as the tracking identifier
      messageHash: `0x${depositResult.depositId.toString(16).padStart(64, '0')}` as Hex,
      messageBytes: '0x' as Hex, // Not applicable for Across
      nonce: BigInt(depositResult.depositId),
      sourceChainId,
      destinationChainId: request.destinationChainId,
      amount: {
        raw: quote.inputAmount,
        formatted: formattedAmount,
      },
      recipient,
      estimatedTime: this.getEstimatedTime(),
    };
  }

  /**
   * Get status of a bridge transfer
   */
  async getStatus(depositIdHex: Hex): Promise<BridgeStatusResult> {
    const sourceChainId = await this.getSourceChainId();
    const depositId = Number(BigInt(depositIdHex));

    try {
      const apiClient = await this.getApiClient();
      const status = await apiClient.getDepositStatus(sourceChainId, depositId);

      let bridgeStatus: BridgeStatus;
      switch (status.status) {
        case 'pending':
          bridgeStatus = 'attestation_pending'; // Reuse this status for "waiting for fill"
          break;
        case 'filled':
          bridgeStatus = 'completed';
          break;
        case 'expired':
          bridgeStatus = 'failed';
          break;
        default:
          bridgeStatus = 'attestation_pending';
      }

      return {
        status: bridgeStatus,
        messageHash: depositIdHex,
        attestation: status.fillTxHash ? (status.fillTxHash as Hex) : undefined,
        updatedAt: new Date(),
        error: status.status === 'expired' ? 'Deposit expired without being filled' : undefined,
      };
    } catch (error) {
      return {
        status: 'attestation_pending',
        messageHash: depositIdHex,
        updatedAt: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Wait for the bridge to complete (fill)
   * Returns the fill transaction hash
   */
  async waitForAttestation(
    depositIdHex: Hex,
    options?: { pollingInterval?: number; maxWaitTime?: number }
  ): Promise<Hex> {
    const sourceChainId = await this.getSourceChainId();
    const depositId = Number(BigInt(depositIdHex));
    const pollingInterval = options?.pollingInterval ?? 5000; // 5 seconds
    const maxWaitTime = options?.maxWaitTime ?? 600000; // 10 minutes

    const apiClient = await this.getApiClient();
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await apiClient.getDepositStatus(sourceChainId, depositId);

        if (status.status === 'filled' && status.fillTxHash) {
          return status.fillTxHash as Hex;
        }

        if (status.status === 'expired') {
          throw new BridgeCompletionError({
            messageHash: depositIdHex,
            error: 'Deposit expired without being filled',
          });
        }
      } catch (error) {
        if (error instanceof BridgeCompletionError) {
          throw error;
        }
        // Ignore API errors and retry
      }

      await this.sleep(pollingInterval);
    }

    throw new BridgeCompletionError({
      messageHash: depositIdHex,
      error: 'Timeout waiting for fill',
    });
  }

  // ============ Private Helpers ============

  private async getSourceChainId(): Promise<number> {
    if (this.cachedChainId === undefined) {
      this.cachedChainId = await this.sourceRpc.getChainId();
    }
    return this.cachedChainId;
  }

  private async getSpokePool(): Promise<SpokePoolContract> {
    if (!this.spokePool) {
      const chainId = await this.getSourceChainId();
      const config = getAcrossConfig(chainId);

      if (!config) {
        throw new Error(`Across not supported on chain ${String(chainId)}`);
      }

      // Issue #4: Share NonceManager with SpokePoolContract to prevent race conditions
      this.spokePool = new SpokePoolContract({
        rpc: this.sourceRpc,
        account: this.account,
        spokePoolAddress: config.spokePool,
        nonceManager: this.nonceManager,
      });
    }

    return this.spokePool;
  }

  private async getApiClient(): Promise<AcrossApiClient> {
    if (!this.apiClient) {
      // Auto-detect testnet from chain ID if not explicitly configured
      let testnet = this.testnet;
      if (testnet === undefined) {
        const chainId = await this.getSourceChainId();
        testnet = isAcrossTestnet(chainId);
      }
      this.apiClient = new AcrossApiClient({ testnet });
    }
    return this.apiClient;
  }

  private getTokenAddress(chainId: number, token: StablecoinInfo): Address | undefined {
    // First try to get from stablecoin registry
    const stablecoinAddress = getStablecoinAddress(token, chainId);
    if (stablecoinAddress) {
      return stablecoinAddress as Address;
    }

    // Fallback to Across config
    return getAcrossTokenAddress(chainId, token.symbol);
  }

  private normalizeTokenSymbol(symbol: string): string {
    // Handle variants like USDC.e, USDbC, etc.
    return symbol.replace(/\.(e|bridged)/i, '').replace(/^USDb/, 'USDC').toUpperCase();
  }

  private async getTokenBalance(tokenAddress: Address): Promise<bigint> {
    const balanceOfData = `0x70a08231000000000000000000000000${this.account.address.slice(2)}` as Hex;

    const result = await this.sourceRpc.call({
      to: tokenAddress,
      data: balanceOfData,
    });

    return BigInt(result);
  }

  private async getAllowance(tokenAddress: Address, spender: Address): Promise<bigint> {
    const allowanceData =
      `0xdd62ed3e000000000000000000000000${this.account.address.slice(2)}000000000000000000000000${spender.slice(2)}` as Hex;

    const result = await this.sourceRpc.call({
      to: tokenAddress,
      data: allowanceData,
    });

    return BigInt(result);
  }

  private async ensureApproval(
    tokenAddress: Address,
    spender: Address,
    amount: bigint
  ): Promise<void> {
    const allowance = await this.getAllowance(tokenAddress, spender);

    if (allowance >= amount) {
      return; // Already approved
    }

    // Issue #9: Some tokens (like USDT) require resetting allowance to 0 first
    // if there's an existing non-zero allowance
    if (allowance > 0n) {
      await this.sendApprovalTx(tokenAddress, spender, 0n);
    }

    // Approve the requested amount
    await this.sendApprovalTx(tokenAddress, spender, amount);
  }

  /**
   * Send an approval transaction
   * Issue #2: Uses NonceManager to prevent race conditions
   */
  private async sendApprovalTx(
    tokenAddress: Address,
    spender: Address,
    amount: bigint
  ): Promise<void> {
    const approveData =
      `0x095ea7b3000000000000000000000000${spender.slice(2)}${amount.toString(16).padStart(64, '0')}` as Hex;

    // Estimate gas
    const gasEstimate = await this.gasOracle.estimateGas({
      to: tokenAddress,
      from: this.account.address,
      data: approveData,
      value: 0n,
    });

    // Get nonce using NonceManager (Issue #2: Fix nonce race condition)
    const nonce = await this.nonceManager.getNextNonce();
    const chainId = await this.sourceRpc.getChainId();

    // Build transaction
    let builder = TransactionBuilder.create()
      .to(tokenAddress)
      .data(approveData)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(gasEstimate.gasLimit)
      .value(0n);

    if (gasEstimate.maxFeePerGas) {
      builder = builder.maxFeePerGas(gasEstimate.maxFeePerGas);
      if (gasEstimate.maxPriorityFeePerGas) {
        builder = builder.maxPriorityFeePerGas(gasEstimate.maxPriorityFeePerGas);
      }
    } else if (gasEstimate.gasPrice) {
      builder = builder.gasPrice(gasEstimate.gasPrice);
    }

    // Sign and send
    const signed = builder.sign(this.account);
    let txHash: Hash;
    try {
      txHash = await this.sourceRpc.sendRawTransaction(signed.raw);
    } catch (error) {
      await this.nonceManager.onTransactionFailed();
      throw error;
    }

    // Wait for approval tx
    let receipt;
    try {
      receipt = await this.sourceRpc.waitForTransaction(txHash);
      this.nonceManager.onTransactionConfirmed();
    } catch (error) {
      await this.nonceManager.onTransactionFailed();
      throw error;
    }

    // Issue #2: Check transaction status - reverted approvals should fail
    if (receipt.status !== 'success') {
      throw new Error(`Approval transaction reverted: ${txHash}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create an AcrossBridge instance
 */
export function createAcrossBridge(config: AcrossBridgeConfig): AcrossBridge {
  return new AcrossBridge(config);
}

/**
 * CCTPBridge - Main CCTP bridging service
 * Orchestrates USDC bridging via Circle's Cross-Chain Transfer Protocol
 */

import type { Address, Hash, Hex } from '../../core/types.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { Account } from '../../protocol/account.js';
import {
  USDC,
  formatStablecoinAmount,
  parseStablecoinAmount,
} from '../../stablecoins/index.js';
import {
  type BridgeProtocol,
  type BridgeRequest,
  type BridgeInitResult,
  type BridgeCompleteResult,
  type BridgeStatusResult,
  type BridgeStatus,
  type CCTPDomain,
} from '../types.js';
import {
  getCCTPConfig,
  getSupportedCCTPChains,
  type CCTPChainConfig,
  CCTP_FINALITY_THRESHOLDS,
} from '../constants.js';
import {
  BridgeUnsupportedRouteError,
  BridgeSameChainError,
  BridgeApprovalError,
  BridgeCompletionError,
} from '../errors.js';
import { TokenMessengerContract } from './token-messenger.js';
import { MessageTransmitterContract, decodeMessageHeader, decodeBurnMessageBody } from './message-transmitter.js';
import { AttestationClient } from './attestation.js';
import { CCTPFeeClient } from './fees.js';
import { InsufficientFundsError } from '../../agent/errors.js';
import { isTestnet as checkIsTestnet, getChainName } from '../constants.js';

/**
 * Configuration for CCTPBridge
 */
export interface CCTPBridgeConfig {
  /** RPC client for the source chain */
  sourceRpc: RPCClient;
  /** Account for signing transactions */
  account: Account;
  /** Use testnet (auto-detected from chain ID if not specified) */
  testnet?: boolean;
  /** Enable fast CCTP mode (v2 API - seconds instead of minutes) */
  fast?: boolean;
  /** Custom attestation client config */
  attestationConfig?: {
    pollingInterval?: number;
    maxWaitTime?: number;
  };
}

/**
 * Result from bridge preview
 */
export interface BridgePreviewResult {
  /** Whether the bridge can be executed */
  canBridge: boolean;
  /** List of issues preventing bridge */
  blockers: string[];
  /** Source chain info */
  sourceChain: {
    id: number;
    name: string;
  };
  /** Destination chain info */
  destinationChain: {
    id: number;
    name: string;
  };
  /** Amount details */
  amount: {
    raw: bigint;
    formatted: string;
  };
  /** Current USDC balance */
  balance: {
    raw: bigint;
    formatted: string;
  };
  /** Current allowance for TokenMessenger */
  allowance: bigint;
  /** Whether approval transaction is needed */
  needsApproval: boolean;
  /** Estimated time for attestation */
  estimatedTime: string;
}

/**
 * CCTPBridge - CCTP implementation of BridgeProtocol
 * Handles USDC bridging between supported chains
 */
export class CCTPBridge implements BridgeProtocol {
  readonly name = 'CCTP';
  readonly supportedTokens = ['USDC'] as const;

  private readonly sourceRpc: RPCClient;
  private readonly account: Account;
  private attestation: AttestationClient;
  private feeClient: CCTPFeeClient;
  private readonly attestationConfig?: CCTPBridgeConfig['attestationConfig'];
  private readonly explicitTestnet?: boolean;
  private readonly fast: boolean;
  private sourceChainId?: number;
  private sourceConfig?: CCTPChainConfig;
  private isTestnet?: boolean;

  constructor(config: CCTPBridgeConfig) {
    this.sourceRpc = config.sourceRpc;
    this.account = config.account;
    this.explicitTestnet = config.testnet;
    this.attestationConfig = config.attestationConfig;
    this.fast = config.fast ?? false;

    // Create attestation client (may be recreated after auto-detection)
    this.attestation = new AttestationClient({
      testnet: config.testnet,
      pollingInterval: config.attestationConfig?.pollingInterval,
      maxWaitTime: config.attestationConfig?.maxWaitTime,
    });

    // Create fee client for fast transfers
    this.feeClient = new CCTPFeeClient({
      testnet: config.testnet,
    });
  }

  /**
   * Check if fast CCTP mode is enabled
   */
  isFastMode(): boolean {
    return this.fast;
  }

  /**
   * Initialize the bridge (fetch chain ID and config)
   * Also auto-detects testnet if not explicitly specified
   * Returns the initialized chain ID and config
   */
  private async initialize(): Promise<{ chainId: number; config: CCTPChainConfig }> {
    if (this.sourceChainId !== undefined && this.sourceConfig !== undefined) {
      return { chainId: this.sourceChainId, config: this.sourceConfig };
    }

    this.sourceChainId = await this.sourceRpc.getChainId();
    this.sourceConfig = getCCTPConfig(this.sourceChainId);

    if (this.sourceConfig === undefined) {
      throw new BridgeUnsupportedRouteError({
        sourceChainId: this.sourceChainId,
        destinationChainId: 0,
        token: 'USDC',
        supportedChains: getSupportedCCTPChains(),
      });
    }

    // Auto-detect testnet if not explicitly specified
    if (this.explicitTestnet === undefined) {
      this.isTestnet = checkIsTestnet(this.sourceChainId);
      // Recreate attestation client with correct endpoint
      this.attestation = new AttestationClient({
        testnet: this.isTestnet,
        pollingInterval: this.attestationConfig?.pollingInterval,
        maxWaitTime: this.attestationConfig?.maxWaitTime,
      });
      // Recreate fee client with correct endpoint
      this.feeClient = new CCTPFeeClient({
        testnet: this.isTestnet,
      });
    } else {
      this.isTestnet = this.explicitTestnet;
    }

    return { chainId: this.sourceChainId, config: this.sourceConfig };
  }

  /**
   * Get cached chain ID (initializes if needed)
   */
  async getSourceChainId(): Promise<number> {
    const { chainId } = await this.initialize();
    return chainId;
  }

  /**
   * Get list of supported chain IDs
   */
  getSupportedChains(): number[] {
    return getSupportedCCTPChains();
  }

  /**
   * Check if a route is supported
   */
  isRouteSupported(sourceChainId: number, destChainId: number, token: string): boolean {
    if (token.toUpperCase() !== 'USDC') return false;
    if (sourceChainId === destChainId) return false;

    const sourceConfig = getCCTPConfig(sourceChainId);
    const destConfig = getCCTPConfig(destChainId);

    return sourceConfig !== undefined && destConfig !== undefined;
  }

  /**
   * Get estimated time for bridging
   */
  getEstimatedTime(): string {
    return this.attestation.getEstimatedTime(this.fast);
  }

  /**
   * Preview a bridge transaction without executing
   * Useful for checking feasibility and showing costs to users
   */
  async previewBridge(request: BridgeRequest): Promise<BridgePreviewResult> {
    const { chainId: sourceChainId, config: sourceConfig } = await this.initialize();
    const blockers: string[] = [];

    // Parse amount
    const amount = parseStablecoinAmount(request.amount, USDC);
    const formattedAmount = formatStablecoinAmount(amount, USDC);

    // Check token is USDC
    if (request.token.symbol !== 'USDC') {
      blockers.push(`Token ${request.token.symbol} is not supported. Only USDC is supported.`);
    }

    // Check same chain
    if (sourceChainId === request.destinationChainId) {
      blockers.push(`Cannot bridge to the same chain (${String(sourceChainId)})`);
    }

    // Check destination chain is supported
    const destConfig = getCCTPConfig(request.destinationChainId);
    if (!destConfig) {
      blockers.push(`Destination chain ${String(request.destinationChainId)} is not supported by CCTP`);
    }

    // Create TokenMessenger contract to check balance/allowance
    const tokenMessenger = new TokenMessengerContract({
      rpc: this.sourceRpc,
      account: this.account,
      cctpConfig: sourceConfig,
    });

    // Check USDC balance
    const balance = await tokenMessenger.getBalance(this.account.address);
    if (balance < amount) {
      const shortage = formatStablecoinAmount(amount - balance, USDC);
      blockers.push(`Insufficient USDC balance. Need ${shortage} more USDC.`);
    }

    // Check allowance
    const allowance = await tokenMessenger.getAllowance(this.account.address);
    const needsApproval = allowance < amount;

    return {
      canBridge: blockers.length === 0,
      blockers,
      sourceChain: {
        id: sourceChainId,
        name: getChainName(sourceChainId),
      },
      destinationChain: {
        id: request.destinationChainId,
        name: getChainName(request.destinationChainId),
      },
      amount: {
        raw: amount,
        formatted: formattedAmount,
      },
      balance: {
        raw: balance,
        formatted: formatStablecoinAmount(balance, USDC),
      },
      allowance,
      needsApproval,
      estimatedTime: this.getEstimatedTime(),
    };
  }

  /**
   * Initiate a bridge transaction (burn USDC on source chain)
   */
  async initiateBridge(request: BridgeRequest): Promise<BridgeInitResult> {
    const { chainId: sourceChainId, config: sourceConfig } = await this.initialize();

    // Validate token is USDC
    if (request.token.symbol !== 'USDC') {
      throw new BridgeUnsupportedRouteError({
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token: request.token.symbol,
        supportedChains: this.getSupportedChains(),
      });
    }

    // Check same chain
    if (sourceChainId === request.destinationChainId) {
      throw new BridgeSameChainError(sourceChainId);
    }

    // Get destination config
    const destConfig = getCCTPConfig(request.destinationChainId);
    if (!destConfig) {
      throw new BridgeUnsupportedRouteError({
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token: 'USDC',
        supportedChains: this.getSupportedChains(),
      });
    }

    // Parse amount
    const amount = parseStablecoinAmount(request.amount, USDC);
    const formattedAmount = formatStablecoinAmount(amount, USDC);

    // Recipient defaults to sender
    const recipient = request.recipient ?? this.account.address;

    // Create TokenMessenger contract
    const tokenMessenger = new TokenMessengerContract({
      rpc: this.sourceRpc,
      account: this.account,
      cctpConfig: sourceConfig,
    });

    // Check USDC balance
    const balance = await tokenMessenger.getBalance(this.account.address);
    if (balance < amount) {
      throw new InsufficientFundsError({
        required: { wei: amount, eth: formattedAmount },
        available: { wei: balance, eth: formatStablecoinAmount(balance, USDC) },
        shortage: { wei: amount - balance, eth: formatStablecoinAmount(amount - balance, USDC) },
      });
    }

    // Check and set approval if needed
    const allowance = await tokenMessenger.getAllowance(this.account.address);
    if (allowance < amount) {
      try {
        // Approve exact amount (or use max approval for better UX)
        await tokenMessenger.approve(amount);
      } catch (error) {
        throw new BridgeApprovalError({
          token: 'USDC',
          spender: sourceConfig.tokenMessenger,
          amount: formattedAmount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Execute depositForBurn (v1 standard or v2 fast)
    let result;
    let maxFee = 0n;

    if (this.fast) {
      // Fast transfer: fetch fee and use v2 with confirmed finality
      const feeResult = await this.feeClient.getFastTransferFee(
        sourceConfig.domain as CCTPDomain,
        destConfig.domain,
        amount
      );
      maxFee = feeResult.maxFee;

      result = await tokenMessenger.depositForBurnV2({
        amount,
        destinationDomain: destConfig.domain,
        mintRecipient: recipient,
        burnToken: sourceConfig.usdc,
        // Set destination caller to recipient (required for fast transfers on some networks)
        destinationCaller: recipient,
        maxFee,
        minFinalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed,
      });
    } else {
      // Standard transfer: use v1 with finalized finality
      result = await tokenMessenger.depositForBurn({
        amount,
        destinationDomain: destConfig.domain,
        mintRecipient: recipient,
        burnToken: sourceConfig.usdc,
      });
    }

    return {
      success: true,
      burnTxHash: result.hash,
      messageHash: result.messageHash,
      messageBytes: result.messageBytes,
      nonce: result.nonce,
      sourceChainId,
      destinationChainId: request.destinationChainId,
      amount: {
        raw: amount,
        formatted: formattedAmount,
      },
      recipient,
      estimatedTime: this.getEstimatedTime(),
    };
  }

  /**
   * Complete a bridge transaction (mint USDC on destination chain)
   */
  async completeBridge(
    messageBytes: Hex,
    attestation: Hex,
    destRpc: RPCClient
  ): Promise<BridgeCompleteResult> {
    // Decode message to get destination info
    const header = decodeMessageHeader(messageBytes);

    // Decode the burn message body to get amount
    const burnMessage = decodeBurnMessageBody(messageBytes);

    // Get destination config
    const destChainId = await destRpc.getChainId();
    const destConfig = getCCTPConfig(destChainId);

    if (!destConfig) {
      throw new BridgeUnsupportedRouteError({
        sourceChainId: header.sourceDomain,
        destinationChainId: destChainId,
        token: 'USDC',
        supportedChains: this.getSupportedChains(),
      });
    }

    // Verify destination domain matches
    if (destConfig.domain !== header.destinationDomain) {
      throw new BridgeCompletionError({
        messageHash: '0x',
        error: `Message destination domain ${String(header.destinationDomain)} does not match chain domain ${String(destConfig.domain)}`,
      });
    }

    // Create MessageTransmitter contract
    const messageTransmitter = new MessageTransmitterContract({
      rpc: destRpc,
      account: this.account,
      cctpConfig: destConfig,
    });

    // Check if nonce already used
    const nonceUsed = await messageTransmitter.isNonceUsed(header.sourceDomain, header.nonce);
    if (nonceUsed) {
      throw new BridgeCompletionError({
        messageHash: '0x',
        error: 'Message has already been processed',
      });
    }

    // Execute receiveMessage
    try {
      const result = await messageTransmitter.receiveMessage(messageBytes, attestation);

      // Extract recipient from burn message
      const recipientHex = burnMessage.mintRecipient.slice(-40);
      const recipient = `0x${recipientHex}` as Address;

      return {
        success: result.success,
        mintTxHash: result.hash,
        amount: {
          raw: burnMessage.amount,
          formatted: formatStablecoinAmount(burnMessage.amount, USDC),
        },
        recipient,
      };
    } catch (error) {
      throw new BridgeCompletionError({
        messageHash: '0x',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current status of a bridge
   */
  async getStatus(messageHash: Hex): Promise<BridgeStatusResult> {
    // Ensure attestation client is configured for the correct network
    await this.initialize();

    try {
      const response = await this.attestation.getAttestation(messageHash);

      let status: BridgeStatus;
      if (response.status === 'complete') {
        status = 'attestation_ready';
      } else {
        status = 'attestation_pending';
      }

      return {
        status,
        messageHash,
        attestation: response.attestation,
        updatedAt: new Date(),
      };
    } catch (error) {
      return {
        status: 'failed',
        messageHash,
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      };
    }
  }

  /**
   * Wait for attestation to be ready
   */
  async waitForAttestation(messageHash: Hex): Promise<Hex> {
    // Ensure attestation client is configured for the correct network
    await this.initialize();
    return this.attestation.waitForAttestation(messageHash);
  }

  /**
   * Check if attestation is ready (non-blocking)
   */
  async isAttestationReady(messageHash: Hex): Promise<boolean> {
    // Ensure attestation client is configured for the correct network
    await this.initialize();
    return this.attestation.isReady(messageHash);
  }

  /**
   * Wait for fast attestation using v2 API (source domain + tx hash)
   * Much faster than standard attestation (seconds vs minutes)
   *
   * @param burnTxHash - Transaction hash of the burn transaction
   * @param sourceDomain - Optional source domain (auto-detected from chain if not provided)
   * @returns Attestation data including signature and message
   */
  async waitForFastAttestation(
    burnTxHash: Hash,
    sourceDomain?: CCTPDomain
  ): Promise<{ attestation: Hex; message?: Hex; messageHash?: Hex }> {
    const { config } = await this.initialize();

    // Use provided domain or get from config
    const domain = sourceDomain ?? (config.domain as CCTPDomain);

    return this.attestation.waitForFastAttestation(domain, burnTxHash);
  }

  /**
   * Check if fast attestation is ready (non-blocking)
   *
   * @param burnTxHash - Transaction hash of the burn transaction
   * @param sourceDomain - Optional source domain (auto-detected from chain if not provided)
   * @returns true if attestation is ready
   */
  async isFastAttestationReady(
    burnTxHash: Hash,
    sourceDomain?: CCTPDomain
  ): Promise<boolean> {
    const { config } = await this.initialize();

    // Use provided domain or get from config
    const domain = sourceDomain ?? (config.domain as CCTPDomain);

    return this.attestation.isFastReady(domain, burnTxHash);
  }

  /**
   * Get fast transfer fee quote for a route
   *
   * @param destinationChainId - Destination chain ID
   * @param amount - Amount to transfer (optional, for calculating max fee)
   * @returns Fee information including percentage and calculated max fee
   */
  async getFastTransferFee(
    destinationChainId: number,
    amount?: bigint
  ): Promise<{
    feePercentage: number;
    feeBasisPoints: number;
    maxFee?: bigint;
    maxFeeFormatted?: string;
  }> {
    const { config: sourceConfig } = await this.initialize();
    const destConfig = getCCTPConfig(destinationChainId);

    if (!destConfig) {
      throw new BridgeUnsupportedRouteError({
        sourceChainId: this.sourceChainId ?? 0,
        destinationChainId,
        token: 'USDC',
        supportedChains: this.getSupportedChains(),
      });
    }

    const quote = await this.feeClient.getFeeQuote(
      sourceConfig.domain as CCTPDomain,
      destConfig.domain
    );

    const result: {
      feePercentage: number;
      feeBasisPoints: number;
      maxFee?: bigint;
      maxFeeFormatted?: string;
    } = {
      feePercentage: quote.fast.feePercentage,
      feeBasisPoints: quote.fast.feeBasisPoints,
    };

    // Calculate max fee if amount provided
    // Use feeBasisPoints directly to avoid floating point precision issues
    if (amount !== undefined) {
      result.maxFee = this.feeClient.calculateMaxFee(amount, quote.fast.feeBasisPoints);
      result.maxFeeFormatted = formatStablecoinAmount(result.maxFee, USDC);
    }

    return result;
  }
}

/**
 * Create a CCTPBridge instance
 */
export function createCCTPBridge(config: CCTPBridgeConfig): CCTPBridge {
  return new CCTPBridge(config);
}

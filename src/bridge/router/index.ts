/**
 * BridgeRouter - Unified bridge routing and execution
 * Aggregates multiple bridge protocols and selects optimal routes
 */

import type { Hash, Hex } from '../../core/types.js';
import type { StablecoinInfo } from '../../stablecoins/index.js';
import { formatStablecoinAmount, parseStablecoinAmount } from '../../stablecoins/index.js';
import {
  type BridgeProtocolV2,
  type BridgeRequest,
  type BridgeQuote,
  type RoutePreference,
  type BridgeRouteComparison,
  type UnifiedBridgeResult,
  type UnifiedBridgeStatus,
  type BridgePreview,
  type BridgeStatus,
} from '../types.js';
import {
  BridgeNoRouteError,
  BridgeProtocolUnavailableError,
  BridgeQuoteExpiredError,
  BridgeValidationError,
} from '../errors.js';
import { getChainName, getCCTPConfig } from '../constants.js';
import { CCTPAdapter } from '../protocols/cctp-adapter.js';
import { decodeMessageHeader } from '../cctp/message-transmitter.js';
import type { RPCClient } from '../../protocol/rpc.js';
import { RouteSelector } from './selector.js';
import { ExplainBridge } from './explain.js';
import {
  type BridgeRouterConfig,
  type RouteInfo,
  type ProtocolRegistryEntry,
  type WaitOptions,
} from './types.js';
import {
  TrackingRegistry,
  type ProtocolTrackingInfo,
  type BridgeMetadata,
} from './tracking.js';
import {
  BridgeValidator,
  type ValidationResult,
} from './validation.js';

/**
 * BridgeRouter - Main class for bridge routing and execution
 */
export class BridgeRouter {
  private readonly sourceRpc: BridgeRouterConfig['sourceRpc'];
  private readonly account: BridgeRouterConfig['account'];
  private readonly limitsEngine?: BridgeRouterConfig['limitsEngine'];
  private readonly fast: boolean;
  private readonly debug: boolean;
  private readonly ethPriceUSD: number;

  private readonly protocols: Map<string, ProtocolRegistryEntry> = new Map();
  private readonly selector: RouteSelector;
  private readonly explainer: ExplainBridge;
  private readonly trackingRegistry: TrackingRegistry;
  private readonly validator: BridgeValidator;

  /** Registry of RPC clients for destination chains (keyed by chain ID) */
  private readonly destinationRpcs: Map<number, RPCClient> = new Map();

  private cachedChainId?: number;

  constructor(config: BridgeRouterConfig) {
    this.sourceRpc = config.sourceRpc;
    this.account = config.account;
    this.limitsEngine = config.limitsEngine;
    this.fast = config.fast ?? false;
    this.debug = config.debug ?? false;
    this.ethPriceUSD = config.ethPriceUSD ?? 2000;

    this.selector = new RouteSelector();
    this.explainer = new ExplainBridge();
    this.trackingRegistry = new TrackingRegistry();
    this.validator = new BridgeValidator();

    // Register default protocol (CCTP)
    this.registerDefaultProtocols();
  }

  /**
   * Check if fast CCTP mode is enabled
   */
  isFastMode(): boolean {
    return this.fast;
  }

  /**
   * Register an RPC client for a destination chain
   * This enables on-chain completion checking for bridges to that chain
   */
  registerDestinationRpc(chainId: number, rpc: RPCClient): void {
    this.destinationRpcs.set(chainId, rpc);
    if (this.debug) {
      console.log(`[BridgeRouter] Registered destination RPC for chain ${chainId}`);
    }
  }

  /**
   * Get registered destination RPC for a chain
   */
  getDestinationRpc(chainId: number): RPCClient | undefined {
    return this.destinationRpcs.get(chainId);
  }

  // ============ Protocol Management ============

  /**
   * Register a bridge protocol
   */
  registerProtocol(protocol: BridgeProtocolV2, options?: { priority?: number }): void {
    this.protocols.set(protocol.name, {
      protocol,
      enabled: true,
      priority: options?.priority ?? 50,
    });

    if (this.debug) {
      console.log(`[BridgeRouter] Registered protocol: ${protocol.name}`);
    }
  }

  /**
   * Unregister a bridge protocol
   */
  unregisterProtocol(name: string): boolean {
    return this.protocols.delete(name);
  }

  /**
   * Get registered protocol by name
   */
  getProtocol(name: string): BridgeProtocolV2 | undefined {
    return this.protocols.get(name)?.protocol;
  }

  /**
   * Get all registered protocol names
   */
  getRegisteredProtocols(): string[] {
    return Array.from(this.protocols.keys());
  }

  // ============ Discovery ============

  /**
   * Get minimum bridge amount for a token
   */
  getMinBridgeAmount(token: StablecoinInfo): {
    raw: bigint;
    formatted: string;
    usd: number;
  } {
    return this.validator.getMinBridgeAmount(token);
  }

  /**
   * Validate a bridge request
   */
  validateRequest(request: BridgeRequest, quote?: BridgeQuote): ValidationResult {
    return this.validator.validateRequest(request, quote);
  }

  /**
   * Get protocols that support a token
   */
  getAvailableProtocols(token: string): string[] {
    const available: string[] = [];

    for (const [name, entry] of this.protocols) {
      if (entry.enabled && entry.protocol.supportedTokens.includes(token)) {
        available.push(name);
      }
    }

    return available;
  }

  /**
   * Get all supported routes for a token
   */
  async getSupportedRoutes(token: string): Promise<RouteInfo[]> {
    const sourceChainId = await this.getSourceChainId();
    const sourceChainName = getChainName(sourceChainId);
    const routes: RouteInfo[] = [];

    for (const [name, entry] of this.protocols) {
      if (!entry.enabled) continue;

      const protocol = entry.protocol;
      if (!protocol.supportedTokens.includes(token)) continue;

      const supportedChains = protocol.getSupportedChains();

      for (const destChainId of supportedChains) {
        if (destChainId === sourceChainId) continue;

        if (protocol.isRouteSupported(sourceChainId, destChainId, token)) {
          // Check if route already exists (for aggregation)
          const existing = routes.find(
            (r) => r.destinationChainId === destChainId && r.token === token
          );

          if (existing) {
            if (!existing.protocols.includes(name)) {
              existing.protocols.push(name);
            }
          } else {
            routes.push({
              sourceChainId,
              sourceChainName,
              destinationChainId: destChainId,
              destinationChainName: getChainName(destChainId),
              token,
              protocols: [name],
            });
          }
        }
      }
    }

    return routes;
  }

  /**
   * Check if a specific route is supported
   */
  async isRouteSupported(
    destinationChainId: number,
    token: string
  ): Promise<{ supported: boolean; protocols: string[] }> {
    const sourceChainId = await this.getSourceChainId();
    const protocols: string[] = [];

    for (const [name, entry] of this.protocols) {
      if (!entry.enabled) continue;

      if (entry.protocol.isRouteSupported(sourceChainId, destinationChainId, token)) {
        protocols.push(name);
      }
    }

    return {
      supported: protocols.length > 0,
      protocols,
    };
  }

  // ============ Quoting ============

  /**
   * Find all available routes and quotes for a request
   */
  async findRoutes(
    request: BridgeRequest,
    preference: RoutePreference = { priority: 'cost' }
  ): Promise<BridgeRouteComparison> {
    const sourceChainId = await this.getSourceChainId();
    const token = request.token.symbol;

    // Get available protocols for this route
    const availableProtocols = await this.getProtocolsForRoute(
      sourceChainId,
      request.destinationChainId,
      token
    );

    if (availableProtocols.length === 0) {
      throw new BridgeNoRouteError({
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token,
        checkedProtocols: this.getRegisteredProtocols(),
      });
    }

    // Get quotes from all available protocols
    const quotes = await this.getQuotesFromProtocols(availableProtocols, request);

    if (quotes.length === 0) {
      throw new BridgeNoRouteError({
        sourceChainId,
        destinationChainId: request.destinationChainId,
        token,
        checkedProtocols: availableProtocols.map((p) => p.name),
      });
    }

    // Apply preference filters
    const filteredQuotes = this.selector.filterByConstraints(quotes, preference);

    // Build protocol reliability scores
    const protocolScores = new Map<string, number>();
    for (const [name, entry] of this.protocols) {
      protocolScores.set(name, entry.protocol.getReliabilityScore());
    }

    // Select best route
    return this.selector.selectBestRoute(filteredQuotes, preference, protocolScores);
  }

  /**
   * Get a quote from a specific protocol
   */
  async getQuote(protocolName: string, request: BridgeRequest): Promise<BridgeQuote> {
    const entry = this.protocols.get(protocolName);

    if (!entry?.enabled) {
      throw new BridgeProtocolUnavailableError({
        protocol: protocolName,
        reason: entry ? 'Protocol is disabled' : 'Protocol not registered',
        alternativeProtocols: this.getAvailableProtocols(request.token.symbol),
      });
    }

    return entry.protocol.getQuote(request);
  }

  /**
   * Preview a bridge operation without executing
   */
  async previewBridge(
    request: BridgeRequest,
    preference: RoutePreference = { priority: 'cost' }
  ): Promise<BridgePreview> {
    const sourceChainId = await this.getSourceChainId();
    const blockers: string[] = [];

    // Parse amount
    const amount = parseStablecoinAmount(request.amount, request.token);
    const formattedAmount = formatStablecoinAmount(amount, request.token);

    // Check limits if configured
    if (this.limitsEngine) {
      try {
        this.limitsEngine.checkBridgeTransaction(
          request.token,
          amount,
          request.destinationChainId
        );
      } catch (error) {
        blockers.push((error as Error).message);
      }
    }

    // Get quotes
    let quotes: BridgeQuote[] = [];
    let recommended: BridgeQuote | null = null;

    try {
      const comparison = await this.findRoutes(request, preference);
      quotes = comparison.quotes;
      recommended = comparison.recommended;
    } catch (error) {
      if (error instanceof BridgeNoRouteError) {
        blockers.push(error.message);
      } else {
        blockers.push((error as Error).message);
      }
    }

    // Check balance (using first available protocol for balance check)
    let balance = 0n;
    let needsApproval = false;

    const cctpAdapter = this.protocols.get('CCTP');
    if (cctpAdapter) {
      try {
        const preview = await (cctpAdapter.protocol as unknown as CCTPAdapter)
          .getUnderlyingBridge()
          .previewBridge(request);
        balance = preview.balance.raw;
        needsApproval = preview.needsApproval;

        if (balance < amount) {
          const shortage = formatStablecoinAmount(amount - balance, request.token);
          blockers.push(`Insufficient ${request.token.symbol} balance. Need ${shortage} more.`);
        }
      } catch {
        // Ignore preview errors for balance check
      }
    }

    return {
      canBridge: blockers.length === 0 && recommended !== null,
      blockers,
      quote: recommended,
      allQuotes: quotes,
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
        formatted: formatStablecoinAmount(balance, request.token),
      },
      needsApproval,
    };
  }

  // ============ Execution ============

  /**
   * Bridge tokens using auto-selected best route
   */
  async bridge(
    request: BridgeRequest,
    preference: RoutePreference = { priority: 'cost' }
  ): Promise<UnifiedBridgeResult> {
    // Find best route
    const comparison = await this.findRoutes(request, preference);

    if (!comparison.recommended) {
      throw new BridgeNoRouteError({
        sourceChainId: await this.getSourceChainId(),
        destinationChainId: request.destinationChainId,
        token: request.token.symbol,
        checkedProtocols: this.getRegisteredProtocols(),
      });
    }

    // Validate the request
    const validationResult = this.validator.validateRequest(request, comparison.recommended);
    if (!validationResult.valid) {
      throw new BridgeValidationError({
        errors: validationResult.errors.map((e) => ({
          code: e.code,
          message: e.message,
          field: e.field,
        })),
      });
    }

    // Check quote expiry - refresh if needed
    let quote = comparison.recommended;
    if (quote.expiry && new Date() > quote.expiry) {
      if (this.debug) {
        console.log(`[BridgeRouter] Quote expired, fetching fresh quote from ${quote.protocol}`);
      }
      // Re-fetch fresh quote from the same protocol
      quote = await this.getQuote(quote.protocol, request);

      // Validate the new quote hasn't already expired
      if (quote.expiry && new Date() > quote.expiry) {
        throw new BridgeQuoteExpiredError({
          protocol: quote.protocol,
          expiredAt: quote.expiry,
        });
      }
    }

    // Execute via recommended protocol
    return this.bridgeVia(quote.protocol, request);
  }

  /**
   * Bridge tokens via a specific protocol
   */
  async bridgeVia(protocolName: string, request: BridgeRequest): Promise<UnifiedBridgeResult> {
    const entry = this.protocols.get(protocolName);

    if (!entry?.enabled) {
      throw new BridgeProtocolUnavailableError({
        protocol: protocolName,
        reason: entry ? 'Protocol is disabled' : 'Protocol not registered',
        alternativeProtocols: this.getAvailableProtocols(request.token.symbol),
      });
    }

    const protocol = entry.protocol;
    const sourceChainId = await this.getSourceChainId();

    // Check limits if configured
    const amount = parseStablecoinAmount(request.amount, request.token);
    if (this.limitsEngine) {
      this.limitsEngine.checkBridgeTransaction(
        request.token,
        amount,
        request.destinationChainId
      );
    }

    // Get fee estimate
    const fees = await protocol.estimateFees(request);
    const totalFee = fees.protocolFee + fees.gasFee;

    // Calculate fee in USD (gas is in wei, need to convert to ETH then to USD)
    const feeInUSD = fees.totalUSD ?? this.estimateGasFeeInUSD(fees.gasFee);

    // Execute bridge
    const result = await protocol.initiateBridge(request);

    // Record spend if limits configured
    if (this.limitsEngine) {
      this.limitsEngine.recordBridgeSpend(
        request.token,
        amount,
        request.destinationChainId
      );
    }

    // Generate unified tracking ID using the registry (now includes destination chain)
    const trackingInfo: ProtocolTrackingInfo = this.extractTrackingInfo(protocolName, result);
    const trackingId = this.trackingRegistry.createTrackingId({
      info: trackingInfo,
      sourceChainId,
      destinationChainId: request.destinationChainId,
    });

    // Store metadata for on-chain completion checking
    const bridgeMetadata: Omit<BridgeMetadata, 'createdAt'> = {
      messageBytes: result.messageBytes,
      nonce: result.nonce,
      destinationChainId: request.destinationChainId,
    };

    // Decode message to get source/destination domains (CCTP-specific)
    if (result.messageBytes) {
      try {
        const header = decodeMessageHeader(result.messageBytes);
        bridgeMetadata.sourceDomain = header.sourceDomain;
        bridgeMetadata.destinationDomain = header.destinationDomain;
      } catch {
        // Ignore decode errors for non-CCTP protocols
      }
    }

    this.trackingRegistry.storeMetadata(trackingId, bridgeMetadata);

    const formattedAmount = formatStablecoinAmount(amount, request.token);
    const sourceChainName = getChainName(sourceChainId);
    const destChainName = getChainName(request.destinationChainId);

    return {
      success: result.success,
      protocol: protocolName,
      trackingId,
      sourceTxHash: result.burnTxHash,
      amount: {
        raw: amount,
        formatted: formattedAmount,
      },
      fee: {
        raw: totalFee,
        formatted: this.formatGasFee(totalFee),
        usd: feeInUSD,
      },
      sourceChain: {
        id: sourceChainId,
        name: sourceChainName,
      },
      destinationChain: {
        id: request.destinationChainId,
        name: destChainName,
      },
      recipient: result.recipient,
      estimatedTime: this.buildEstimatedTime(protocol),
      summary: `Bridging ${formattedAmount} ${request.token.symbol} from ${sourceChainName} to ${destChainName} via ${protocolName}. Tracking ID: ${trackingId}`,
      protocolData: {
        messageHash: result.messageHash,
        messageBytes: result.messageBytes,
        nonce: result.nonce.toString(),
      },
    };
  }

  /**
   * Extract protocol-specific tracking info from bridge result
   */
  private extractTrackingInfo(
    protocolName: string,
    result: { messageHash: Hex; burnTxHash: Hash }
  ): ProtocolTrackingInfo {
    // Different protocols use different identifier types
    const protocolLower = protocolName.toLowerCase();

    if (protocolLower === 'cctp') {
      return {
        protocol: 'CCTP',
        identifier: result.messageHash,
        identifierType: 'messageHash',
      };
    }

    if (protocolLower === 'across') {
      // Across uses deposit IDs (would be extracted from logs in real implementation)
      return {
        protocol: 'Across',
        identifier: result.burnTxHash, // Fallback to tx hash
        identifierType: 'depositId',
      };
    }

    if (protocolLower === 'stargate') {
      return {
        protocol: 'Stargate',
        identifier: result.burnTxHash,
        identifierType: 'txHash',
      };
    }

    // Default fallback - use message hash if available
    return {
      protocol: protocolName,
      identifier: result.messageHash ?? result.burnTxHash,
      identifierType: 'messageHash',
    };
  }

  // ============ Tracking ============

  /**
   * Get status of a bridge operation using unified tracking ID
   *
   * @param trackingId - Unified tracking ID (e.g., "bridge_cctp_1_8453_0xabc...")
   * @returns Bridge status
   *
   * @example
   * ```typescript
   * const status = await router.getStatus('bridge_cctp_1_8453_0xabc123...');
   * console.log(status.progress); // 50
   * console.log(status.message);  // "Attestation in progress"
   * ```
   */
  async getStatusByTrackingId(trackingId: string): Promise<UnifiedBridgeStatus> {
    const parsed = this.trackingRegistry.parseTrackingId(trackingId);

    if (!parsed) {
      throw new BridgeProtocolUnavailableError({
        protocol: 'unknown',
        reason: `Invalid tracking ID format: ${trackingId}`,
      });
    }

    const { protocol, identifier, destinationChainId } = parsed;

    // Find the protocol (case-insensitive)
    const entry = this.findProtocolEntry(protocol);

    if (!entry) {
      throw new BridgeProtocolUnavailableError({
        protocol,
        reason: 'Protocol not registered',
      });
    }

    // Get attestation status from protocol
    const status = await entry.protocol.getStatus(identifier as Hex);

    // If attestation is ready, check if bridge is actually complete on-chain
    if (status.status === 'attestation_ready') {
      const isComplete = await this.checkOnChainCompletion(trackingId, destinationChainId);
      if (isComplete) {
        // Override status to completed
        return this.buildUnifiedStatus(trackingId, entry.protocol.name, {
          ...status,
          status: 'completed',
        });
      }
    }

    return this.buildUnifiedStatus(trackingId, entry.protocol.name, status);
  }

  /**
   * Check if a bridge has been completed on the destination chain
   * Returns true if the nonce has been used (message received)
   */
  private async checkOnChainCompletion(
    trackingId: string,
    destinationChainId?: number
  ): Promise<boolean> {
    // Get stored metadata for this bridge
    const metadata = this.trackingRegistry.getMetadata(trackingId);

    // Determine destination chain ID from parsed tracking ID or metadata
    const destChainId = destinationChainId ?? metadata?.destinationChainId;

    if (!destChainId) {
      if (this.debug) {
        console.log(`[BridgeRouter] No destination chain ID for ${trackingId}, cannot check completion`);
      }
      return false;
    }

    // Check if we have an RPC for the destination chain
    const destRpc = this.destinationRpcs.get(destChainId);
    if (!destRpc) {
      if (this.debug) {
        console.log(`[BridgeRouter] No destination RPC for chain ${destChainId}, cannot check completion`);
      }
      return false;
    }

    // Get CCTP config for destination chain
    const destConfig = getCCTPConfig(destChainId);
    if (!destConfig) {
      if (this.debug) {
        console.log(`[BridgeRouter] No CCTP config for chain ${destChainId}`);
      }
      return false;
    }

    // Try to get nonce info from metadata or decode from message
    let sourceDomain = metadata?.sourceDomain;
    let nonce = metadata?.nonce;

    // If we have message bytes but no nonce/domain, decode them
    if (metadata?.messageBytes && (sourceDomain === undefined || nonce === undefined)) {
      try {
        const header = decodeMessageHeader(metadata.messageBytes);
        sourceDomain = header.sourceDomain;
        nonce = header.nonce;
      } catch (err) {
        if (this.debug) {
          console.log(`[BridgeRouter] Failed to decode message: ${String(err)}`);
        }
        return false;
      }
    }

    if (sourceDomain === undefined || nonce === undefined) {
      if (this.debug) {
        console.log(`[BridgeRouter] Missing sourceDomain or nonce for completion check`);
      }
      return false;
    }

    // Check if nonce has been used on destination chain
    try {
      const { MessageTransmitterContract } = await import('../cctp/message-transmitter.js');
      const messageTransmitter = new MessageTransmitterContract({
        rpc: destRpc,
        cctpConfig: destConfig,
      });

      const nonceUsed = await messageTransmitter.isNonceUsed(sourceDomain, nonce);

      if (this.debug) {
        console.log(`[BridgeRouter] Nonce ${nonce} used on chain ${destChainId}: ${nonceUsed}`);
      }

      return nonceUsed;
    } catch (err) {
      if (this.debug) {
        console.log(`[BridgeRouter] Failed to check nonce: ${String(err)}`);
      }
      return false;
    }
  }

  /**
   * Get status of a bridge operation (legacy method)
   * @deprecated Use getStatusByTrackingId instead
   */
  async getStatus(
    protocolName: string,
    messageHash: Hex
  ): Promise<UnifiedBridgeStatus> {
    const entry = this.protocols.get(protocolName);

    if (!entry) {
      throw new BridgeProtocolUnavailableError({
        protocol: protocolName,
        reason: 'Protocol not registered',
      });
    }

    const status = await entry.protocol.getStatus(messageHash);

    return this.buildUnifiedStatus(messageHash, protocolName, status);
  }

  /**
   * Build unified status from protocol status
   */
  private buildUnifiedStatus(
    trackingId: string,
    protocolName: string,
    status: { status: BridgeStatus; updatedAt: Date; error?: string; attestation?: Hex }
  ): UnifiedBridgeStatus {
    // Map internal status to progress percentage
    const progressMap: Record<BridgeStatus, number> = {
      pending_burn: 10,
      burn_confirmed: 25,
      attestation_pending: 50,
      attestation_ready: 75,
      pending_mint: 90,
      completed: 100,
      failed: 0,
    };

    const statusMessages: Record<BridgeStatus, string> = {
      pending_burn: 'Waiting for burn transaction to confirm',
      burn_confirmed: 'Burn confirmed, waiting for attestation',
      attestation_pending: 'Attestation in progress',
      attestation_ready: 'Attestation received, ready to complete',
      pending_mint: 'Completing bridge on destination',
      completed: 'Bridge complete',
      failed: 'Bridge failed',
    };

    // Extract identifier from tracking ID for source tx hash
    const parsed = this.trackingRegistry.parseTrackingId(trackingId);
    const identifier = parsed?.identifier ?? trackingId;

    return {
      trackingId,
      protocol: protocolName,
      status: status.status,
      sourceTxHash: identifier as Hash,
      amount: { raw: 0n, formatted: '0' }, // Not available from status
      progress: progressMap[status.status] ?? 0,
      message: statusMessages[status.status] ?? status.status,
      updatedAt: status.updatedAt,
      error: status.error,
    };
  }

  /**
   * Wait for a bridge to complete using tracking ID
   *
   * @param trackingId - Unified tracking ID
   * @param options - Wait options
   * @returns Attestation signature (for CCTP) or completion indicator
   */
  async waitForCompletionByTrackingId(
    trackingId: string,
    options?: WaitOptions
  ): Promise<Hex> {
    const parsed = this.trackingRegistry.parseTrackingId(trackingId);

    if (!parsed) {
      throw new BridgeProtocolUnavailableError({
        protocol: 'unknown',
        reason: `Invalid tracking ID format: ${trackingId}`,
      });
    }

    const entry = this.findProtocolEntry(parsed.protocol);

    if (!entry) {
      throw new BridgeProtocolUnavailableError({
        protocol: parsed.protocol,
        reason: 'Protocol not registered',
      });
    }

    // Wait for attestation
    const attestation = await entry.protocol.waitForAttestation(parsed.identifier as Hex);

    if (options?.onProgress) {
      options.onProgress({ progress: 100, message: 'Attestation received' });
    }

    return attestation;
  }

  /**
   * Wait for a bridge to complete (legacy method)
   * @deprecated Use waitForCompletionByTrackingId instead
   */
  async waitForCompletion(
    protocolName: string,
    messageHash: Hex,
    options?: WaitOptions
  ): Promise<Hex> {
    const entry = this.protocols.get(protocolName);

    if (!entry) {
      throw new BridgeProtocolUnavailableError({
        protocol: protocolName,
        reason: 'Protocol not registered',
      });
    }

    // Wait for attestation
    const attestation = await entry.protocol.waitForAttestation(messageHash);

    if (options?.onProgress) {
      options.onProgress({ progress: 100, message: 'Attestation received' });
    }

    return attestation;
  }

  /**
   * Find a protocol entry by name (case-insensitive)
   */
  private findProtocolEntry(protocolName: string): ProtocolRegistryEntry | undefined {
    // Try exact match first
    const exact = this.protocols.get(protocolName);
    if (exact) return exact;

    // Try case-insensitive match
    const lowerName = protocolName.toLowerCase();
    for (const [name, entry] of this.protocols) {
      if (name.toLowerCase() === lowerName) {
        return entry;
      }
    }

    return undefined;
  }

  /**
   * Estimate gas fee in USD
   * Gas fee is in wei, convert to ETH then to USD
   */
  private estimateGasFeeInUSD(gasFeeWei: bigint): number {
    const gasInEth = Number(gasFeeWei) / 1e18;
    return Math.round(gasInEth * this.ethPriceUSD * 100) / 100;
  }

  /**
   * Format gas fee for display (in ETH)
   */
  private formatGasFee(gasFeeWei: bigint): string {
    const gasInEth = Number(gasFeeWei) / 1e18;
    if (gasInEth < 0.0001) {
      return `${(gasInEth * 1e6).toFixed(2)} µETH`;
    } else if (gasInEth < 0.01) {
      return `${(gasInEth * 1000).toFixed(4)} mETH`;
    } else {
      return `${gasInEth.toFixed(6)} ETH`;
    }
  }

  /**
   * Build structured estimated time from protocol info
   */
  private buildEstimatedTime(protocol: BridgeProtocolV2): {
    minSeconds: number;
    maxSeconds: number;
    display: string;
  } {
    const estimatedTime = protocol.info?.estimatedTimeSeconds;

    // Handle different formats
    let min: number;
    let max: number;

    if (estimatedTime === undefined) {
      // Default to 15-30 minutes if not specified
      min = 900;
      max = 1800;
    } else if (typeof estimatedTime === 'number') {
      // Single number - use as both min and max
      min = estimatedTime;
      max = estimatedTime;
    } else {
      // Object with min/max
      min = estimatedTime.min;
      max = estimatedTime.max;
    }

    const minMinutes = Math.round(min / 60);
    const maxMinutes = Math.round(max / 60);
    const display = min === max
      ? `~${minMinutes} minutes`
      : `${minMinutes}-${maxMinutes} minutes`;

    return {
      minSeconds: min,
      maxSeconds: max,
      display,
    };
  }

  // ============ Explanation ============

  /**
   * Get an explanation for a comparison
   */
  explain(comparison: BridgeRouteComparison): string {
    return this.explainer.explainComparison(comparison);
  }

  /**
   * Get quick summary of a comparison
   */
  summarize(comparison: BridgeRouteComparison): string {
    return this.selector.getQuickSummary(comparison);
  }

  // ============ Private Helpers ============

  private async getSourceChainId(): Promise<number> {
    if (this.cachedChainId === undefined) {
      this.cachedChainId = await this.sourceRpc.getChainId();
    }
    return this.cachedChainId;
  }

  private registerDefaultProtocols(): void {
    // Register CCTP adapter
    const cctpAdapter = new CCTPAdapter({
      sourceRpc: this.sourceRpc,
      account: this.account,
      fast: this.fast,
    });

    this.registerProtocol(cctpAdapter, { priority: 100 }); // High priority for CCTP
  }

  private async getProtocolsForRoute(
    sourceChainId: number,
    destChainId: number,
    token: string
  ): Promise<BridgeProtocolV2[]> {
    const available: BridgeProtocolV2[] = [];

    for (const [_name, entry] of this.protocols) {
      if (!entry.enabled) continue;

      const protocol = entry.protocol;

      if (protocol.isRouteSupported(sourceChainId, destChainId, token)) {
        // Check availability
        const isAvailable = await protocol.isAvailable();
        if (isAvailable) {
          available.push(protocol);
        }
      }
    }

    return available;
  }

  private async getQuotesFromProtocols(
    protocols: BridgeProtocolV2[],
    request: BridgeRequest
  ): Promise<BridgeQuote[]> {
    const quotes: BridgeQuote[] = [];
    const failures: Array<{ protocol: string; error: string }> = [];

    // Get quotes in parallel
    const results = await Promise.allSettled(
      protocols.map((p) => p.getQuote(request))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const protocol = protocols[i]!;

      if (result.status === 'fulfilled') {
        quotes.push(result.value);
      } else {
        failures.push({
          protocol: protocol.name,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });

        if (this.debug) {
          console.log(`[BridgeRouter] Quote failed for ${protocol.name}:`, result.reason);
        }
      }
    }

    return quotes;
  }
}

/**
 * Create a BridgeRouter instance
 */
export function createBridgeRouter(config: BridgeRouterConfig): BridgeRouter {
  return new BridgeRouter(config);
}

// Re-export types and utilities
export { RouteSelector, createRouteSelector } from './selector.js';
export { ExplainBridge, createExplainer, type ExplanationLevel } from './explain.js';
export * from './types.js';
export * from './tracking.js';
export * from './validation.js';

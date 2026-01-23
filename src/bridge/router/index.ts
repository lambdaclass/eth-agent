/**
 * BridgeRouter - Unified bridge routing and execution
 * Aggregates multiple bridge protocols and selects optimal routes
 */

import type { Address, Hash, Hex } from '../../core/types.js';
import type { Account } from '../../protocol/account.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { LimitsEngine } from '../../agent/limits.js';
import { USDC, formatStablecoinAmount, parseStablecoinAmount } from '../../stablecoins/index.js';
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
  BridgeAllRoutesFailed,
  BridgeProtocolUnavailableError,
} from '../errors.js';
import { getChainName } from '../constants.js';
import { CCTPAdapter, type CCTPAdapterConfig } from '../protocols/cctp-adapter.js';
import { RouteSelector } from './selector.js';
import { ExplainBridge } from './explain.js';
import {
  type BridgeRouterConfig,
  type RouteInfo,
  type ProtocolRegistryEntry,
  type ProtocolFilter,
  type WaitOptions,
  generateTrackingId,
} from './types.js';

/**
 * BridgeRouter - Main class for bridge routing and execution
 */
export class BridgeRouter {
  private readonly sourceRpc: RPCClient;
  private readonly account: Account;
  private readonly limitsEngine?: LimitsEngine;
  private readonly debug: boolean;

  private readonly protocols: Map<string, ProtocolRegistryEntry> = new Map();
  private readonly selector: RouteSelector;
  private readonly explainer: ExplainBridge;

  private cachedChainId?: number;

  constructor(config: BridgeRouterConfig) {
    this.sourceRpc = config.sourceRpc;
    this.account = config.account;
    this.limitsEngine = config.limitsEngine;
    this.debug = config.debug ?? false;

    this.selector = new RouteSelector();
    this.explainer = new ExplainBridge();

    // Register default protocol (CCTP)
    this.registerDefaultProtocols();
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

    if (!entry || !entry.enabled) {
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
        const preview = await (cctpAdapter.protocol as CCTPAdapter)
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

    // Execute via recommended protocol
    return this.bridgeVia(comparison.recommended.protocol, request);
  }

  /**
   * Bridge tokens via a specific protocol
   */
  async bridgeVia(protocolName: string, request: BridgeRequest): Promise<UnifiedBridgeResult> {
    const entry = this.protocols.get(protocolName);

    if (!entry || !entry.enabled) {
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

    // Generate tracking ID
    const trackingId = generateTrackingId({
      protocol: protocolName,
      sourceChainId,
      destinationChainId: request.destinationChainId,
    });

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
        formatted: formatStablecoinAmount(totalFee, USDC), // Assume fee in same units
        usd: Number(totalFee) / 1e6, // Rough USD conversion
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
      estimatedTime: result.estimatedTime,
      summary: `Bridging ${formattedAmount} ${request.token.symbol} from ${sourceChainName} to ${destChainName} via ${protocolName}. Tracking ID: ${trackingId}`,
      protocolData: {
        messageHash: result.messageHash,
        messageBytes: result.messageBytes,
        nonce: result.nonce.toString(),
      },
    };
  }

  // ============ Tracking ============

  /**
   * Get status of a bridge operation
   * Note: Currently requires protocol name and message hash
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

    return {
      trackingId: messageHash, // Use message hash as tracking ID for now
      protocol: protocolName,
      status: status.status,
      sourceTxHash: messageHash as Hash, // Approximate
      amount: { raw: 0n, formatted: '0' }, // Not available from status
      progress: progressMap[status.status] ?? 0,
      message: statusMessages[status.status] ?? status.status,
      updatedAt: status.updatedAt,
      error: status.error,
    };
  }

  /**
   * Wait for a bridge to complete
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
      const result = results[i];
      const protocol = protocols[i];

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

/**
 * AI-friendly explanation generator for bridge operations
 * Provides clear, actionable explanations for AI agents
 */

import type {
  BridgeQuote,
  BridgeRouteComparison,
  UnifiedBridgeResult,
  UnifiedBridgeStatus,
  BridgePreview,
  RoutePreference,
  BridgeProtocolInfo,
} from '../types.js';

/**
 * Explanation detail level
 */
export type ExplanationLevel = 'brief' | 'standard' | 'detailed';

/**
 * ExplainBridge - Generates AI-friendly explanations
 */
export class ExplainBridge {
  /**
   * Explain a route comparison result
   */
  explainComparison(
    comparison: BridgeRouteComparison,
    level: ExplanationLevel = 'standard'
  ): string {
    if (!comparison.recommended) {
      return 'No bridge routes are available for this transfer. Try a different token, source chain, or destination chain.';
    }

    const rec = comparison.recommended;

    switch (level) {
      case 'brief':
        return `Use ${rec.protocol}: $${rec.fee.totalUSD.toFixed(2)} fee, ${rec.estimatedTime.display}`;

      case 'standard':
        return this.buildStandardComparison(comparison);

      case 'detailed':
        return this.buildDetailedComparison(comparison);
    }
  }

  /**
   * Explain a bridge preview
   */
  explainPreview(preview: BridgePreview): string {
    const lines: string[] = [];

    // Header
    lines.push(`Bridge Preview: ${preview.amount.formatted} ${preview.sourceChain.name} -> ${preview.destinationChain.name}`);
    lines.push('');

    // Status
    if (preview.canBridge) {
      lines.push('Status: Ready to bridge');
    } else {
      lines.push('Status: Cannot bridge');
      lines.push('Issues:');
      for (const blocker of preview.blockers) {
        lines.push(`  - ${blocker}`);
      }
    }
    lines.push('');

    // Quote info
    if (preview.quote) {
      lines.push(`Recommended: ${preview.quote.protocol}`);
      lines.push(`  Fee: $${preview.quote.fee.totalUSD.toFixed(2)}`);
      lines.push(`  Time: ${preview.quote.estimatedTime.display}`);
    }

    // Balance info
    lines.push('');
    lines.push(`Your balance: ${preview.balance.formatted}`);
    if (preview.needsApproval) {
      lines.push('Note: Token approval will be required before bridging');
    }

    return lines.join('\n');
  }

  /**
   * Explain a bridge result
   */
  explainResult(result: UnifiedBridgeResult): string {
    const lines: string[] = [];

    lines.push(`Bridge Initiated Successfully`);
    lines.push('');
    lines.push(`Protocol: ${result.protocol}`);
    lines.push(`Amount: ${result.amount.formatted}`);
    lines.push(`Route: ${result.sourceChain.name} -> ${result.destinationChain.name}`);
    lines.push(`Recipient: ${result.recipient}`);
    lines.push('');
    lines.push(`Fee: ${result.fee.formatted} (~$${result.fee.usd.toFixed(2)})`);
    lines.push(`Estimated time: ${result.estimatedTime}`);
    lines.push('');
    lines.push(`Tracking ID: ${result.trackingId}`);
    lines.push(`Source TX: ${result.sourceTxHash}`);

    return lines.join('\n');
  }

  /**
   * Explain a bridge status
   */
  explainStatus(status: UnifiedBridgeStatus): string {
    const statusMessages: Record<string, string> = {
      pending_burn: 'Waiting for burn transaction to confirm',
      burn_confirmed: 'Burn confirmed, waiting for attestation',
      attestation_pending: 'Attestation in progress (this may take 10-30 minutes)',
      attestation_ready: 'Attestation received, ready to complete on destination',
      pending_mint: 'Mint transaction in progress on destination chain',
      completed: 'Bridge complete! Funds have arrived on destination chain',
      failed: 'Bridge failed',
    };

    const lines: string[] = [];

    lines.push(`Bridge Status: ${status.trackingId}`);
    lines.push('');
    lines.push(`Status: ${statusMessages[status.status] ?? status.status}`);
    lines.push(`Progress: ${String(status.progress)}%`);
    lines.push(`Protocol: ${status.protocol}`);

    if (status.destinationTxHash) {
      lines.push(`Destination TX: ${status.destinationTxHash}`);
    }

    if (status.error) {
      lines.push('');
      lines.push(`Error: ${status.error}`);
    }

    return lines.join('\n');
  }

  /**
   * Explain protocol characteristics
   */
  explainProtocol(info: BridgeProtocolInfo): string {
    const finalityExplanations: Record<string, string> = {
      attestation: 'Uses external attestation for security (e.g., Circle for CCTP)',
      optimistic: 'Assumes valid unless challenged within a time window',
      'lock-and-mint': 'Locks assets on source chain and mints wrapped version on destination',
    };

    const speedExplanations: Record<string, string> = {
      instant: 'Near-instant transfers (seconds)',
      fast: 'Fast transfers (1-5 minutes)',
      standard: 'Standard transfers (10-30 minutes)',
      slow: 'Slower transfers (1+ hours)',
    };

    const lines: string[] = [];

    lines.push(`${info.displayName} (${info.name})`);
    lines.push('');
    lines.push(`Supported tokens: ${info.supportedTokens.join(', ')}`);
    lines.push(`Speed: ${speedExplanations[info.typicalSpeed]}`);
    lines.push(`Security model: ${finalityExplanations[info.finalityModel]}`);
    lines.push(`Protocol fees: ${info.hasProtocolFees ? 'Yes' : 'No (gas only)'}`);

    return lines.join('\n');
  }

  /**
   * Explain route preference options
   */
  explainPreferences(): string {
    return `Route Preferences:

priority (required):
  - 'cost': Minimize fees (weights: cost 50%, speed 15%, reliability 25%)
  - 'speed': Minimize transfer time (weights: speed 50%, cost 15%, reliability 25%)
  - 'reliability': Maximize success rate (weights: reliability 50%, cost 20%, speed 15%)

Optional constraints:
  - maxFeeUSD: Maximum acceptable fee (e.g., 5 for $5 max)
  - maxTimeMinutes: Maximum acceptable time (e.g., 30 for 30 min max)
  - preferredProtocols: Only use these protocols (e.g., ['CCTP'])
  - excludeProtocols: Never use these protocols (e.g., ['Stargate'])`;
  }

  /**
   * Generate actionable suggestions based on a failed bridge
   */
  suggestFix(error: { code: string; message: string; details?: Record<string, unknown> }): string {
    const suggestions: Record<string, string> = {
      BRIDGE_NO_ROUTE: 'Try a different token (e.g., USDC is widely supported) or check if both chains support the bridge protocol.',
      BRIDGE_QUOTE_EXPIRED: 'Request a fresh quote and execute immediately. Bridge quotes are time-sensitive.',
      BRIDGE_PROTOCOL_UNAVAILABLE: 'Try a different bridge protocol or wait a few minutes and retry.',
      BRIDGE_ALL_ROUTES_FAILED: 'Check your token balance, ensure you have enough for gas, and verify network conditions.',
      BRIDGE_UNSUPPORTED_ROUTE: 'This token/chain combination is not supported. Try USDC which has the widest support.',
      BRIDGE_SAME_CHAIN: 'Source and destination are the same. Use a regular transfer instead of bridging.',
      BRIDGE_ATTESTATION_TIMEOUT: 'The attestation service is slow. Your funds are safe - wait longer or check status periodically.',
      INSUFFICIENT_FUNDS: 'You need more tokens or ETH for gas. Check your balance on the source chain.',
    };

    return suggestions[error.code] ?? `Error: ${error.message}. Check parameters and try again.`;
  }

  // ============ Private Helper Methods ============

  private buildStandardComparison(comparison: BridgeRouteComparison): string {
    const rec = comparison.recommended!;
    const lines: string[] = [];

    lines.push(`Recommended: ${rec.protocol}`);
    lines.push(`  - Fee: $${rec.fee.totalUSD.toFixed(2)}`);
    lines.push(`  - Time: ${rec.estimatedTime.display}`);
    lines.push(`  - Route: ${rec.route.description}`);

    if (comparison.recommendation.reason) {
      lines.push(`  - Why: ${comparison.recommendation.reason}`);
    }

    if (comparison.recommendation.savings) {
      lines.push(`  - Savings: ${comparison.recommendation.savings}`);
    }

    return lines.join('\n');
  }

  private buildDetailedComparison(comparison: BridgeRouteComparison): string {
    const lines: string[] = [];

    // Recommended route
    lines.push('=== Recommended Route ===');
    lines.push(this.buildStandardComparison(comparison));

    // All routes
    if (comparison.quotes.length > 1) {
      lines.push('');
      lines.push('=== All Available Routes ===');

      for (const quote of comparison.quotes) {
        lines.push('');
        lines.push(`${quote.protocol}:`);
        lines.push(`  Fee: $${quote.fee.totalUSD.toFixed(2)} (protocol: ${this.formatBigInt(quote.fee.protocol)}, gas: ${this.formatBigInt(quote.fee.gas)})`);
        lines.push(`  Time: ${quote.estimatedTime.display}`);
        lines.push(`  Route: ${quote.route.description}`);
        if (quote.expiry) {
          lines.push(`  Quote expires: ${quote.expiry.toISOString()}`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatBigInt(value: bigint): string {
    if (value === 0n) return '$0';
    // Assume 6 decimals for USD stablecoins
    const formatted = Number(value) / 1e6;
    return `$${formatted.toFixed(2)}`;
  }
}

/**
 * Create an ExplainBridge instance
 */
export function createExplainer(): ExplainBridge {
  return new ExplainBridge();
}

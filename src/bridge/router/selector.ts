/**
 * Route selection algorithm for BridgeRouter
 * Scores and ranks bridge quotes based on user preferences
 */

import type {
  BridgeQuote,
  RoutePreference,
  BridgeRouteComparison,
} from '../types.js';
import {
  type ScoredQuote,
  type ScoringWeights,
  DEFAULT_WEIGHTS,
} from './types.js';

/**
 * Maximum expected values for normalization
 */
const NORMALIZATION = {
  /** Maximum fee in USD for normalization */
  maxFeeUSD: 100,
  /** Maximum time in seconds for normalization */
  maxTimeSeconds: 3600, // 1 hour
  /** Maximum reliability score */
  maxReliability: 100,
};

/**
 * RouteSelector - Scores and ranks bridge quotes
 */
export class RouteSelector {
  /**
   * Select the best route from available quotes
   */
  selectBestRoute(
    quotes: BridgeQuote[],
    preference: RoutePreference = { priority: 'cost' },
    protocolScores: Map<string, number> = new Map()
  ): BridgeRouteComparison {
    if (quotes.length === 0) {
      return {
        quotes: [],
        recommended: null,
        recommendation: {
          reason: 'No routes available for this transfer',
        },
      };
    }

    // Score all quotes
    const scoredQuotes = this.scoreQuotes(quotes, preference, protocolScores);

    // Sort by score (highest first)
    scoredQuotes.sort((a, b) => b.score - a.score);

    // Extract sorted quotes
    const sortedQuotes = scoredQuotes.map((sq) => sq.quote);

    // Get recommendation explanation
    const recommendation = this.explainRecommendation(scoredQuotes, preference);

    return {
      quotes: sortedQuotes,
      recommended: sortedQuotes[0],
      recommendation,
    };
  }

  /**
   * Score all quotes based on preferences
   */
  private scoreQuotes(
    quotes: BridgeQuote[],
    preference: RoutePreference,
    protocolScores: Map<string, number>
  ): ScoredQuote[] {
    const weights = this.getWeights(preference);

    return quotes.map((quote) => {
      const components = {
        cost: this.scoreCost(quote, preference),
        speed: this.scoreSpeed(quote, preference),
        reliability: this.scoreReliability(quote, protocolScores),
        liquidity: this.scoreLiquidity(quote),
      };

      const score =
        components.cost * weights.cost +
        components.speed * weights.speed +
        components.reliability * weights.reliability +
        components.liquidity * weights.liquidity;

      return {
        quote,
        score,
        components,
        weights,
      };
    });
  }

  /**
   * Get scoring weights based on preference
   */
  private getWeights(preference: RoutePreference): ScoringWeights {
    return DEFAULT_WEIGHTS[preference.priority];
  }

  /**
   * Score a quote based on cost (lower fees = higher score)
   */
  private scoreCost(quote: BridgeQuote, preference: RoutePreference): number {
    // Check if quote exceeds max fee constraint
    if (preference.maxFeeUSD !== undefined && quote.fee.totalUSD > preference.maxFeeUSD) {
      return 0; // Fails constraint
    }

    // Normalize: 0 fee = 100 score, maxFee = 0 score
    const normalizedFee = Math.min(quote.fee.totalUSD / NORMALIZATION.maxFeeUSD, 1);
    return (1 - normalizedFee) * 100;
  }

  /**
   * Score a quote based on speed (faster = higher score)
   */
  private scoreSpeed(quote: BridgeQuote, preference: RoutePreference): number {
    const avgTimeSeconds =
      (quote.estimatedTime.minSeconds + quote.estimatedTime.maxSeconds) / 2;

    // Check if quote exceeds max time constraint
    if (preference.maxTimeMinutes !== undefined) {
      const maxTimeSeconds = preference.maxTimeMinutes * 60;
      if (avgTimeSeconds > maxTimeSeconds) {
        return 0; // Fails constraint
      }
    }

    // Normalize: instant = 100 score, maxTime = 0 score
    const normalizedTime = Math.min(avgTimeSeconds / NORMALIZATION.maxTimeSeconds, 1);
    return (1 - normalizedTime) * 100;
  }

  /**
   * Score a quote based on protocol reliability
   */
  private scoreReliability(
    quote: BridgeQuote,
    protocolScores: Map<string, number>
  ): number {
    // Use provided protocol score or default to 80
    const reliability = protocolScores.get(quote.protocol) ?? 80;
    return Math.min(reliability, NORMALIZATION.maxReliability);
  }

  /**
   * Score a quote based on liquidity
   * For now, returns 100 (assume sufficient liquidity)
   * Can be extended to check against actual liquidity pools
   */
  private scoreLiquidity(_quote: BridgeQuote): number {
    // TODO: Implement actual liquidity checking
    return 100;
  }

  /**
   * Generate an explanation for the recommendation
   */
  private explainRecommendation(
    scoredQuotes: ScoredQuote[],
    preference: RoutePreference
  ): { reason: string; savings?: string } {
    if (scoredQuotes.length === 0) {
      return { reason: 'No routes available' };
    }

    const best = scoredQuotes[0];
    const quote = best.quote;

    // Build reason based on priority
    const priorityReasons: Record<RoutePreference['priority'], string> = {
      cost: `${quote.protocol}: lowest fees ($${String(quote.fee.totalUSD.toFixed(2))})`,
      speed: `${quote.protocol}: fastest (${quote.estimatedTime.display})`,
      reliability: `${quote.protocol}: most reliable (${String(Math.round(best.components.reliability))}% score)`,
    };

    let reason = priorityReasons[preference.priority];

    // Add savings comparison if multiple quotes
    let savings: string | undefined;
    if (scoredQuotes.length > 1) {
      const secondBest = scoredQuotes[1];

      // Calculate savings based on priority
      switch (preference.priority) {
        case 'cost': {
          const feeSavings = secondBest.quote.fee.totalUSD - quote.fee.totalUSD;
          if (feeSavings > 0.01) {
            savings = `$${feeSavings.toFixed(2)} less than ${secondBest.quote.protocol}`;
          }
          break;
        }
        case 'speed': {
          const timeSavings =
            secondBest.quote.estimatedTime.minSeconds - quote.estimatedTime.minSeconds;
          if (timeSavings > 60) {
            savings = `${String(Math.round(timeSavings / 60))} min faster than ${secondBest.quote.protocol}`;
          }
          break;
        }
        case 'reliability': {
          const reliabilityDiff = best.components.reliability - secondBest.components.reliability;
          if (reliabilityDiff > 5) {
            savings = `${String(Math.round(reliabilityDiff))}% more reliable than ${secondBest.quote.protocol}`;
          }
          break;
        }
      }
    }

    return { reason, savings };
  }

  /**
   * Filter quotes based on preference constraints
   */
  filterByConstraints(quotes: BridgeQuote[], preference: RoutePreference): BridgeQuote[] {
    return quotes.filter((quote) => {
      // Check max fee constraint
      if (preference.maxFeeUSD !== undefined && quote.fee.totalUSD > preference.maxFeeUSD) {
        return false;
      }

      // Check max time constraint
      if (preference.maxTimeMinutes !== undefined) {
        const maxTimeSeconds = preference.maxTimeMinutes * 60;
        if (quote.estimatedTime.maxSeconds > maxTimeSeconds) {
          return false;
        }
      }

      // Check preferred protocols
      if (preference.preferredProtocols?.length) {
        if (!preference.preferredProtocols.includes(quote.protocol)) {
          return false;
        }
      }

      // Check excluded protocols
      if (preference.excludeProtocols?.length) {
        if (preference.excludeProtocols.includes(quote.protocol)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get a quick comparison summary
   */
  getQuickSummary(comparison: BridgeRouteComparison): string {
    if (!comparison.recommended) {
      return 'No routes available for this transfer';
    }

    const rec = comparison.recommended;
    const parts = [
      `Recommended: ${rec.protocol}`,
      `Fee: $${rec.fee.totalUSD.toFixed(2)}`,
      `Time: ${rec.estimatedTime.display}`,
    ];

    if (comparison.quotes.length > 1) {
      parts.push(`(${String(comparison.quotes.length)} routes compared)`);
    }

    return parts.join(' | ');
  }
}

/**
 * Create a RouteSelector instance
 */
export function createRouteSelector(): RouteSelector {
  return new RouteSelector();
}

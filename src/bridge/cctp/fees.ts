/**
 * CCTP Fee Service
 * Fetches fast transfer fees from Circle's API
 */

import type { CCTPDomain } from '../types.js';
import { CIRCLE_FEE_API, CCTP_FINALITY_THRESHOLDS } from '../constants.js';

/**
 * Minimum fee in basis points for fast transfers.
 * This ensures we always offer a reasonable fee even if the API returns 0.
 * 1 basis point = 0.01%
 */
const MIN_FAST_FEE_BASIS_POINTS = 1;

/**
 * Fee information from Circle's API
 */
export interface CCTPFeeInfo {
  /** Fee in basis points (e.g., 10 = 0.1%) */
  feeBasisPoints: number;
  /** Fee as a decimal (e.g., 0.001 = 0.1%) */
  feePercentage: number;
  /** Finality threshold this fee applies to */
  finalityThreshold: number;
}

/**
 * Fast transfer fee quote
 */
export interface FastTransferFeeQuote {
  /** Fee for fast (confirmed) finality */
  fast: CCTPFeeInfo;
  /** Fee for standard (finalized) finality */
  standard: CCTPFeeInfo;
}

/**
 * Configuration for the fee client
 */
export interface FeeClientConfig {
  /** Use testnet API (default: false) */
  testnet?: boolean;
  /** Request timeout in ms (default: 10000) */
  requestTimeout?: number;
}

/**
 * Client for fetching CCTP transfer fees from Circle's API
 */
export class CCTPFeeClient {
  private readonly baseUrl: string;
  private readonly requestTimeout: number;

  constructor(config: FeeClientConfig = {}) {
    this.baseUrl = config.testnet === true
      ? CIRCLE_FEE_API.testnet
      : CIRCLE_FEE_API.mainnet;
    this.requestTimeout = config.requestTimeout ?? 10000;
  }

  /**
   * Get fee quote for a transfer between two domains
   *
   * @param sourceDomain - Source chain CCTP domain
   * @param destinationDomain - Destination chain CCTP domain
   * @returns Fee quote with fast and standard options
   */
  async getFeeQuote(
    sourceDomain: CCTPDomain,
    destinationDomain: CCTPDomain
  ): Promise<FastTransferFeeQuote> {
    // API format: /v2/burn/USDC/fees/{sourceDomain}/{destinationDomain}
    const url = `${this.baseUrl}/${String(sourceDomain)}/${String(destinationDomain)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); }, this.requestTimeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Fee API HTTP ${String(response.status)}: ${response.statusText}`);
      }

      const data = await response.json() as Array<{
        finalityThreshold: number;
        minimumFee: number; // Fee in basis points
      }>;

      // Parse the response - Circle returns an array with fees for different finality levels
      let fastFee: CCTPFeeInfo | undefined;
      let standardFee: CCTPFeeInfo | undefined;

      for (const entry of data) {
        const feeInfo: CCTPFeeInfo = {
          feeBasisPoints: entry.minimumFee,
          feePercentage: entry.minimumFee / 10000,
          finalityThreshold: entry.finalityThreshold,
        };

        if (entry.finalityThreshold === CCTP_FINALITY_THRESHOLDS.confirmed) {
          fastFee = feeInfo;
        } else if (entry.finalityThreshold === CCTP_FINALITY_THRESHOLDS.finalized) {
          standardFee = feeInfo;
        }
      }

      // Default to zero fee if not found
      if (!fastFee) {
        fastFee = {
          feeBasisPoints: 0,
          feePercentage: 0,
          finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed,
        };
      }

      if (!standardFee) {
        standardFee = {
          feeBasisPoints: 0,
          feePercentage: 0,
          finalityThreshold: CCTP_FINALITY_THRESHOLDS.finalized,
        };
      }

      return {
        fast: fastFee,
        standard: standardFee,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle abort/timeout
      if (errorMessage.includes('abort')) {
        throw new Error(`Fee API request timed out after ${String(this.requestTimeout)}ms`);
      }

      throw new Error(`Failed to fetch CCTP fees: ${errorMessage}`);
    }
  }

  /**
   * Calculate the max fee for a fast transfer
   *
   * Uses integer math only to avoid floating point precision issues.
   *
   * @param amount - Transfer amount in raw USDC units (6 decimals)
   * @param feeBasisPoints - Fee in basis points (e.g., 10 = 0.1%)
   * @returns Max fee in raw USDC units
   */
  calculateMaxFee(amount: bigint, feeBasisPoints: number): bigint {
    // Use integer math: fee = amount * basisPoints / 10000
    // Ensure fee is at least 1 unit if there's any fee rate
    const fee = (amount * BigInt(feeBasisPoints)) / 10000n;

    // If fee rate is non-zero but calculated fee rounds to 0, use minimum of 1 unit
    if (feeBasisPoints > 0 && fee === 0n) {
      return 1n;
    }

    return fee;
  }

  /**
   * Get the fast transfer fee and calculate max fee for an amount
   *
   * @param sourceDomain - Source chain CCTP domain
   * @param destinationDomain - Destination chain CCTP domain
   * @param amount - Transfer amount in raw USDC units
   * @returns Object with fee info and calculated max fee
   */
  async getFastTransferFee(
    sourceDomain: CCTPDomain,
    destinationDomain: CCTPDomain,
    amount: bigint
  ): Promise<{
    feeInfo: CCTPFeeInfo;
    maxFee: bigint;
    maxFeeFormatted: string;
  }> {
    const quote = await this.getFeeQuote(sourceDomain, destinationDomain);

    // Use feeBasisPoints directly to avoid floating point precision issues
    // Apply minimum fee floor for fast transfers
    const effectiveFeeBps = Math.max(quote.fast.feeBasisPoints, MIN_FAST_FEE_BASIS_POINTS);
    const maxFee = this.calculateMaxFee(amount, effectiveFeeBps);

    // Format max fee (USDC has 6 decimals)
    const maxFeeFormatted = formatUSDC(maxFee);

    return {
      feeInfo: quote.fast,
      maxFee,
      maxFeeFormatted,
    };
  }
}

/**
 * Format USDC amount from raw to human-readable
 */
function formatUSDC(amount: bigint): string {
  const amountStr = amount.toString().padStart(7, '0');
  const whole = amountStr.slice(0, -6) || '0';
  const fraction = amountStr.slice(-6);
  const trimmedFraction = fraction.replace(/0+$/, '');

  if (trimmedFraction) {
    return `${whole}.${trimmedFraction}`;
  }
  return whole;
}

/**
 * Create a fee client
 */
export function createFeeClient(config?: FeeClientConfig): CCTPFeeClient {
  return new CCTPFeeClient(config);
}

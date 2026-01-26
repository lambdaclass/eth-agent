/**
 * Across API client
 * Handles communication with the Across API for quotes and status
 */

import { ACROSS_API, isAcrossTestnet } from './constants.js';

/**
 * Quote request parameters
 */
export interface AcrossQuoteRequest {
  /** Origin chain ID */
  originChainId: number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Token address on origin chain */
  inputToken: string;
  /** Token address on destination chain */
  outputToken: string;
  /** Amount in token's smallest unit (e.g., wei for ETH, 6 decimals for USDC) */
  amount: string;
  /** Recipient address (optional, defaults to depositor) */
  recipient?: string;
  /** Skip amount limit check */
  skipAmountLimit?: boolean;
}

/**
 * Quote response from Across API (normalized)
 */
export interface AcrossQuoteResponse {
  /** Expected output amount after fees */
  totalRelayFee: {
    /** Fee in token's smallest unit */
    total: string;
    /** Fee as percentage in 1e18 precision */
    pct: string;
  };
  /** Relayer capital fee */
  relayerCapitalFee: {
    total: string;
    pct: string;
  };
  /** Relayer gas fee */
  relayerGasFee: {
    total: string;
    pct: string;
  };
  /** LP fee */
  lpFee: {
    total: string;
    pct: string;
  };
  /** Timestamp for the quote (use in deposit) */
  timestamp: number;
  /** Whether the route is paused */
  isAmountTooLow: boolean;
  /** Quote block number */
  quoteBlock: number;
  /** Spoke pool address on origin */
  spokePoolAddress: string;
  /** Expected fill time in seconds */
  expectedFillTimeSec: number;
  /** Fill deadline (use in deposit) */
  fillDeadline: number;
  /** Exclusive relayer address */
  exclusiveRelayer: string;
  /** Exclusivity deadline */
  exclusivityDeadline: number;
  /** Output amount (from API, if provided) */
  outputAmount?: string;
  /** Limits for this route */
  limits: {
    minDeposit: string;
    maxDeposit: string;
    maxDepositInstant: string;
    maxDepositShortDelay: string;
  };
}

/**
 * Raw API response (before normalization)
 */
interface RawAcrossQuoteResponse {
  totalRelayFee: { total: string; pct: string };
  relayerCapitalFee: { total: string; pct: string };
  relayerGasFee: { total: string; pct: string };
  lpFee: { total: string; pct: string };
  timestamp: string | number;
  isAmountTooLow: boolean;
  quoteBlock: string | number;
  spokePoolAddress: string;
  estimatedFillTimeSec?: number;
  expectedFillTimeSec?: number;
  fillDeadline?: string | number;
  exclusiveRelayer?: string;
  exclusivityDeadline?: number;
  outputAmount?: string;
  limits: {
    minDeposit: string;
    maxDeposit: string;
    maxDepositInstant: string;
    maxDepositShortDelay: string;
  };
}

/**
 * Suggested fees response
 */
export interface AcrossSuggestedFeesResponse {
  /** Total relay fee */
  totalRelayFee: {
    total: string;
    pct: string;
  };
  /** Relayer capital fee */
  relayerCapitalFee: {
    total: string;
    pct: string;
  };
  /** Relayer gas fee */
  relayerGasFee: {
    total: string;
    pct: string;
  };
  /** LP fee */
  lpFee: {
    total: string;
    pct: string;
  };
  /** Quote timestamp */
  timestamp: number;
  /** Quote is still valid */
  isAmountTooLow: boolean;
  /** Quote block */
  quoteBlock: number;
  /** Spoke pool address */
  spokePoolAddress: string;
  /** Exclusivity info */
  exclusiveRelayer: string;
  exclusivityDeadline: number;
  /** Expected fill time */
  expectedFillTimeSec: number;
  /** Route limits */
  limits: {
    minDeposit: string;
    maxDeposit: string;
    maxDepositInstant: string;
    maxDepositShortDelay: string;
  };
}

/**
 * Deposit status response
 */
export interface AcrossDepositStatusResponse {
  /** Current status */
  status: 'pending' | 'filled' | 'expired';
  /** Fill transaction hash (if filled) */
  fillTxHash?: string;
  /** Fill timestamp (if filled) */
  fillTimestamp?: number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Deposit details */
  deposit: {
    depositId: number;
    originChainId: number;
    destinationChainId: number;
    depositor: string;
    recipient: string;
    inputToken: string;
    outputToken: string;
    inputAmount: string;
    outputAmount: string;
    quoteTimestamp: number;
    fillDeadline: number;
  };
}

/**
 * Available routes response
 */
export interface AcrossRoutesResponse {
  routes: Array<{
    originChainId: number;
    destinationChainId: number;
    originToken: string;
    destinationToken: string;
    originTokenSymbol: string;
    destinationTokenSymbol: string;
    isEnabled: boolean;
  }>;
}

/**
 * Across API client
 */
export class AcrossApiClient {
  private readonly baseUrl: string;

  constructor(config?: { testnet?: boolean }) {
    this.baseUrl = config?.testnet ? ACROSS_API.testnet : ACROSS_API.mainnet;
  }

  /**
   * Get a quote for a bridge transfer
   */
  async getQuote(request: AcrossQuoteRequest): Promise<AcrossQuoteResponse> {
    const params = new URLSearchParams({
      originChainId: request.originChainId.toString(),
      destinationChainId: request.destinationChainId.toString(),
      inputToken: request.inputToken,
      outputToken: request.outputToken,
      amount: request.amount,
    });

    if (request.recipient) {
      params.append('recipient', request.recipient);
    }
    if (request.skipAmountLimit) {
      params.append('skipAmountLimit', 'true');
    }

    const response = await fetch(`${this.baseUrl}/suggested-fees?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Across API error: ${response.status} - ${errorText}`);
    }

    const raw = (await response.json()) as RawAcrossQuoteResponse;

    // Normalize the response (API returns some fields as strings)
    const timestamp = typeof raw.timestamp === 'string' ? parseInt(raw.timestamp, 10) : raw.timestamp;
    const fillDeadline = raw.fillDeadline
      ? (typeof raw.fillDeadline === 'string' ? parseInt(raw.fillDeadline, 10) : raw.fillDeadline)
      : timestamp + 18000; // Default: 5 hours from quote

    return {
      totalRelayFee: raw.totalRelayFee,
      relayerCapitalFee: raw.relayerCapitalFee,
      relayerGasFee: raw.relayerGasFee,
      lpFee: raw.lpFee,
      timestamp,
      isAmountTooLow: raw.isAmountTooLow,
      quoteBlock: typeof raw.quoteBlock === 'string' ? parseInt(raw.quoteBlock, 10) : raw.quoteBlock,
      spokePoolAddress: raw.spokePoolAddress,
      // API uses 'estimatedFillTimeSec', normalize to 'expectedFillTimeSec'
      expectedFillTimeSec: raw.estimatedFillTimeSec ?? raw.expectedFillTimeSec ?? 120,
      fillDeadline,
      exclusiveRelayer: raw.exclusiveRelayer ?? '0x0000000000000000000000000000000000000000',
      exclusivityDeadline: raw.exclusivityDeadline ?? 0,
      outputAmount: raw.outputAmount,
      limits: raw.limits,
    };
  }

  /**
   * Get suggested fees (alias for getQuote)
   */
  async getSuggestedFees(request: AcrossQuoteRequest): Promise<AcrossSuggestedFeesResponse> {
    const params = new URLSearchParams({
      originChainId: request.originChainId.toString(),
      destinationChainId: request.destinationChainId.toString(),
      inputToken: request.inputToken,
      outputToken: request.outputToken,
      amount: request.amount,
    });

    if (request.recipient) {
      params.append('recipient', request.recipient);
    }

    const response = await fetch(`${this.baseUrl}/suggested-fees?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Across API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<AcrossSuggestedFeesResponse>;
  }

  /**
   * Get deposit status
   */
  async getDepositStatus(
    originChainId: number,
    depositId: number
  ): Promise<AcrossDepositStatusResponse> {
    const params = new URLSearchParams({
      originChainId: originChainId.toString(),
      depositId: depositId.toString(),
    });

    const response = await fetch(`${this.baseUrl}/deposit/status?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Across API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<AcrossDepositStatusResponse>;
  }

  /**
   * Get available routes
   */
  async getAvailableRoutes(
    originChainId?: number,
    destinationChainId?: number
  ): Promise<AcrossRoutesResponse> {
    const params = new URLSearchParams();

    if (originChainId) {
      params.append('originChainId', originChainId.toString());
    }
    if (destinationChainId) {
      params.append('destinationChainId', destinationChainId.toString());
    }

    const response = await fetch(`${this.baseUrl}/available-routes?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Across API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<AcrossRoutesResponse>;
  }

  /**
   * Get route limits
   */
  async getLimits(
    originChainId: number,
    destinationChainId: number,
    inputToken: string,
    outputToken: string
  ): Promise<{
    minDeposit: string;
    maxDeposit: string;
    maxDepositInstant: string;
    maxDepositShortDelay: string;
  }> {
    const params = new URLSearchParams({
      originChainId: originChainId.toString(),
      destinationChainId: destinationChainId.toString(),
      inputToken,
      outputToken,
    });

    const response = await fetch(`${this.baseUrl}/limits?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Across API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<{
      minDeposit: string;
      maxDeposit: string;
      maxDepositInstant: string;
      maxDepositShortDelay: string;
    }>;
  }

  /**
   * Create API client based on chain ID
   */
  static forChain(chainId: number): AcrossApiClient {
    return new AcrossApiClient({ testnet: isAcrossTestnet(chainId) });
  }
}

/**
 * Create an Across API client
 */
export function createAcrossApiClient(config?: { testnet?: boolean }): AcrossApiClient {
  return new AcrossApiClient(config);
}

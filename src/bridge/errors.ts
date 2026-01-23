/**
 * Bridge-specific errors
 * Structured errors for cross-chain bridging operations
 */

import { EthAgentError } from '../agent/errors.js';

/**
 * Recovery information for bridge errors
 * Provides structured guidance for AI agents on how to recover from failures
 */
export interface BridgeRecoveryInfo {
  /** Current status of the funds */
  fundsStatus: 'safe' | 'in_flight' | 'requires_support';
  /** Whether the operation can be retried */
  canRetry: boolean;
  /** Ordered steps to recover from the error */
  nextSteps: string[];
  /** Support contact information if manual intervention needed */
  supportInfo?: {
    protocol: string;
    reference: string;
    url?: string;
  };
}

/**
 * Base error class for all bridge-related errors
 */
export class BridgeError extends EthAgentError {
  /** Recovery guidance for AI agents */
  recovery: BridgeRecoveryInfo;

  constructor(config: {
    code?: string;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
    retryable?: boolean;
    retryAfter?: number;
    recovery?: Partial<BridgeRecoveryInfo>;
  }) {
    super({
      code: config.code ?? 'BRIDGE_ERROR',
      message: config.message,
      details: config.details,
      suggestion: config.suggestion ?? 'Check bridge parameters and try again',
      retryable: config.retryable ?? false,
      retryAfter: config.retryAfter,
    });
    this.name = 'BridgeError';

    // Build recovery info with defaults
    this.recovery = {
      fundsStatus: config.recovery?.fundsStatus ?? 'safe',
      canRetry: config.recovery?.canRetry ?? config.retryable ?? false,
      nextSteps: config.recovery?.nextSteps ?? ['Check error details and try again'],
      supportInfo: config.recovery?.supportInfo,
    };
  }
}

/**
 * Error thrown when a bridge route is not supported
 */
export class BridgeUnsupportedRouteError extends BridgeError {
  constructor(config: {
    sourceChainId: number;
    destinationChainId: number;
    token: string;
    supportedChains?: number[];
  }) {
    const supportedInfo = config.supportedChains
      ? `. Supported chains: ${config.supportedChains.join(', ')}`
      : '';

    super({
      code: 'BRIDGE_UNSUPPORTED_ROUTE',
      message: `Bridge route not supported: ${config.token} from chain ${String(config.sourceChainId)} to chain ${String(config.destinationChainId)}${supportedInfo}`,
      details: config,
      suggestion: 'Use a supported bridge route or select a different destination chain',
      retryable: false,
    });
    this.name = 'BridgeUnsupportedRouteError';
  }
}

/**
 * Error thrown when bridging to a destination is not allowed by policy
 */
export class BridgeDestinationNotAllowedError extends BridgeError {
  constructor(config: {
    destinationChainId: number;
    allowedDestinations?: number[];
  }) {
    const allowedInfo = config.allowedDestinations
      ? `. Allowed destinations: ${config.allowedDestinations.join(', ')}`
      : '';

    super({
      code: 'BRIDGE_DESTINATION_NOT_ALLOWED',
      message: `Destination chain ${String(config.destinationChainId)} is not in allowed list${allowedInfo}`,
      details: config,
      suggestion: 'Choose an allowed destination chain or update bridge limits configuration',
      retryable: false,
    });
    this.name = 'BridgeDestinationNotAllowedError';
  }
}

/**
 * Error thrown when attestation times out
 */
export class BridgeAttestationTimeoutError extends BridgeError {
  constructor(config: {
    messageHash: string;
    timeout: number;
    elapsedTime: number;
  }) {
    super({
      code: 'BRIDGE_ATTESTATION_TIMEOUT',
      message: `Attestation timed out after ${String(Math.round(config.elapsedTime / 1000))}s (max: ${String(Math.round(config.timeout / 1000))}s)`,
      details: config,
      suggestion: 'The attestation service may be slow. Try waiting longer or check status manually',
      retryable: true,
      retryAfter: 60000, // Suggest retry after 1 minute
      recovery: {
        fundsStatus: 'in_flight',
        canRetry: true,
        nextSteps: [
          'Wait for attestation to complete (may take up to 30 minutes)',
          `Check status at https://iris-api.circle.com/attestations/${config.messageHash}`,
          'If still pending after 1 hour, contact Circle support',
        ],
        supportInfo: {
          protocol: 'CCTP',
          reference: config.messageHash,
          url: `https://iris-api.circle.com/attestations/${config.messageHash}`,
        },
      },
    });
    this.name = 'BridgeAttestationTimeoutError';
  }
}

/**
 * Error thrown when attestation fetch fails
 */
export class BridgeAttestationError extends BridgeError {
  constructor(config: {
    messageHash: string;
    error: string;
    statusCode?: number;
  }) {
    super({
      code: 'BRIDGE_ATTESTATION_ERROR',
      message: `Failed to fetch attestation: ${config.error}`,
      details: config,
      suggestion: 'Check the message hash and try again. The attestation service may be temporarily unavailable',
      retryable: true,
      retryAfter: 5000,
      recovery: {
        fundsStatus: 'in_flight',
        canRetry: true,
        nextSteps: [
          'Wait 5 seconds and retry fetching attestation',
          'Check if the attestation service is operational',
          'Verify the message hash is correct',
        ],
        supportInfo: {
          protocol: 'CCTP',
          reference: config.messageHash,
        },
      },
    });
    this.name = 'BridgeAttestationError';
  }
}

/**
 * Error thrown when bridge amount exceeds limits
 */
export class BridgeLimitError extends BridgeError {
  constructor(config: {
    type: 'transaction' | 'daily';
    requested: string;
    limit: string;
    remaining?: string;
    resetsAt?: Date;
  }) {
    const typeMessages = {
      transaction: `Bridge amount $${config.requested} exceeds per-transaction limit of $${config.limit}`,
      daily: `Bridge amount would exceed daily limit. Remaining: $${config.remaining ?? '0'}`,
    };

    const typeSuggestions = {
      transaction: `Reduce bridge amount to $${config.limit} or less`,
      daily: config.resetsAt
        ? `Reduce amount to $${config.remaining ?? '0'} or wait until ${config.resetsAt.toISOString()}`
        : `Reduce amount to $${config.remaining ?? '0'} or wait for limit to reset`,
    };

    super({
      code: `BRIDGE_${config.type.toUpperCase()}_LIMIT_EXCEEDED`,
      message: typeMessages[config.type],
      details: config,
      suggestion: typeSuggestions[config.type],
      retryable: config.type === 'daily',
      retryAfter: config.resetsAt ? config.resetsAt.getTime() - Date.now() : undefined,
    });
    this.name = 'BridgeLimitError';
  }
}

/**
 * Error thrown when source and destination chains are the same
 */
export class BridgeSameChainError extends BridgeError {
  constructor(chainId: number) {
    super({
      code: 'BRIDGE_SAME_CHAIN',
      message: `Cannot bridge to the same chain (${String(chainId)})`,
      details: { chainId },
      suggestion: 'Choose a different destination chain',
      retryable: false,
    });
    this.name = 'BridgeSameChainError';
  }
}

/**
 * Error thrown when message completion fails
 */
export class BridgeCompletionError extends BridgeError {
  constructor(config: {
    messageHash: string;
    error: string;
    transactionHash?: string;
  }) {
    super({
      code: 'BRIDGE_COMPLETION_ERROR',
      message: `Failed to complete bridge: ${config.error}`,
      details: config,
      suggestion: 'The message may have already been processed, or the attestation may be invalid',
      retryable: true,
      retryAfter: 10000,
      recovery: {
        fundsStatus: 'in_flight',
        canRetry: true,
        nextSteps: [
          'Check if the bridge was already completed on the destination chain',
          'Verify the attestation is valid and matches the message',
          'If already completed, funds should be in the destination wallet',
          'Retry completion if not yet processed',
        ],
        supportInfo: {
          protocol: 'CCTP',
          reference: config.messageHash,
        },
      },
    });
    this.name = 'BridgeCompletionError';
  }
}

/**
 * Error thrown when USDC approval fails
 */
export class BridgeApprovalError extends BridgeError {
  constructor(config: {
    token: string;
    spender: string;
    amount: string;
    error: string;
  }) {
    super({
      code: 'BRIDGE_APPROVAL_ERROR',
      message: `Failed to approve ${config.token} for bridging: ${config.error}`,
      details: config,
      suggestion: 'Check your USDC balance and try again',
      retryable: true,
      retryAfter: 5000,
      recovery: {
        fundsStatus: 'safe',
        canRetry: true,
        nextSteps: [
          `Check ${config.token} balance is sufficient`,
          'Verify you have enough ETH for gas',
          'Retry the approval transaction',
        ],
      },
    });
    this.name = 'BridgeApprovalError';
  }
}

/**
 * Error thrown when no route is available for a bridge request
 */
export class BridgeNoRouteError extends BridgeError {
  constructor(config: {
    sourceChainId: number;
    destinationChainId: number;
    token: string;
    checkedProtocols?: string[];
  }) {
    const protocolsInfo = config.checkedProtocols?.length
      ? ` Checked protocols: ${config.checkedProtocols.join(', ')}.`
      : '';

    super({
      code: 'BRIDGE_NO_ROUTE',
      message: `No bridge route available for ${config.token} from chain ${String(config.sourceChainId)} to chain ${String(config.destinationChainId)}.${protocolsInfo}`,
      details: config,
      suggestion: 'Try a different destination chain or check if the token is supported',
      retryable: false,
      recovery: {
        fundsStatus: 'safe',
        canRetry: false,
        nextSteps: [
          'Choose a different destination chain',
          'Use a different token that is supported on this route',
          'Check if CCTP supports this chain pair at https://www.circle.com/en/cross-chain-transfer-protocol',
        ],
      },
    });
    this.name = 'BridgeNoRouteError';
  }
}

/**
 * Error thrown when all bridge routes fail during execution
 */
export class BridgeAllRoutesFailed extends BridgeError {
  constructor(config: {
    sourceChainId: number;
    destinationChainId: number;
    token: string;
    failures: Array<{ protocol: string; error: string }>;
  }) {
    const failureDetails = config.failures
      .map((f) => `${f.protocol}: ${f.error}`)
      .join('; ');

    super({
      code: 'BRIDGE_ALL_ROUTES_FAILED',
      message: `All bridge routes failed for ${config.token} from chain ${String(config.sourceChainId)} to chain ${String(config.destinationChainId)}. Failures: ${failureDetails}`,
      details: config,
      suggestion: 'Check individual protocol errors and try again later',
      retryable: true,
      retryAfter: 30000,
      recovery: {
        fundsStatus: 'safe',
        canRetry: true,
        nextSteps: [
          'Wait 30 seconds and retry the bridge',
          'Check each protocol error for specific issues',
          'Verify token balance and gas availability',
          'Try reducing the bridge amount',
        ],
      },
    });
    this.name = 'BridgeAllRoutesFailed';
  }
}

/**
 * Error thrown when a specific bridge protocol is unavailable
 */
export class BridgeProtocolUnavailableError extends BridgeError {
  constructor(config: {
    protocol: string;
    reason: string;
    alternativeProtocols?: string[];
  }) {
    const alternativesInfo = config.alternativeProtocols?.length
      ? ` Available alternatives: ${config.alternativeProtocols.join(', ')}.`
      : '';

    super({
      code: 'BRIDGE_PROTOCOL_UNAVAILABLE',
      message: `Bridge protocol "${config.protocol}" is unavailable: ${config.reason}.${alternativesInfo}`,
      details: config,
      suggestion: config.alternativeProtocols?.length
        ? `Try using one of the alternative protocols: ${config.alternativeProtocols.join(', ')}`
        : 'Try again later or use a different bridge protocol',
      retryable: true,
      retryAfter: 10000,
      recovery: {
        fundsStatus: 'safe',
        canRetry: true,
        nextSteps: config.alternativeProtocols?.length
          ? [
              `Try an alternative protocol: ${config.alternativeProtocols.join(', ')}`,
              'Wait and retry with the original protocol',
            ]
          : [
              'Wait 10 seconds and retry',
              'Check protocol status page for outages',
            ],
      },
    });
    this.name = 'BridgeProtocolUnavailableError';
  }
}

/**
 * Error thrown when a bridge quote has expired
 */
export class BridgeQuoteExpiredError extends BridgeError {
  constructor(config: {
    protocol: string;
    expiredAt: Date;
    quotedAt?: Date;
  }) {
    super({
      code: 'BRIDGE_QUOTE_EXPIRED',
      message: `Bridge quote from ${config.protocol} expired at ${config.expiredAt.toISOString()}`,
      details: config,
      suggestion: 'Request a new quote and execute immediately',
      retryable: true,
      retryAfter: 0, // Can retry immediately
      recovery: {
        fundsStatus: 'safe',
        canRetry: true,
        nextSteps: [
          'Request a fresh quote',
          'Execute bridge promptly before new quote expires',
        ],
      },
    });
    this.name = 'BridgeQuoteExpiredError';
  }
}

/**
 * Error thrown when bridge request validation fails
 */
export class BridgeValidationError extends BridgeError {
  /** Validation errors that caused this error */
  readonly validationErrors: Array<{ code: string; message: string; field?: string }>;

  constructor(config: {
    errors: Array<{ code: string; message: string; field?: string }>;
  }) {
    const errorMessages = config.errors.map((e) => e.message).join('; ');

    super({
      code: 'BRIDGE_VALIDATION_ERROR',
      message: `Bridge request validation failed: ${errorMessages}`,
      details: { errors: config.errors },
      suggestion: 'Fix the validation errors and try again',
      retryable: false,
      recovery: {
        fundsStatus: 'safe',
        canRetry: false,
        nextSteps: config.errors.map((e) => `Fix: ${e.message}`),
      },
    });
    this.name = 'BridgeValidationError';
    this.validationErrors = config.errors;
  }
}

/**
 * Error thrown when bridge has insufficient liquidity (for protocols with liquidity pools)
 */
export class BridgeInsufficientLiquidityError extends BridgeError {
  constructor(config: {
    protocol: string;
    requestedAmount: string;
    availableLiquidity?: string;
    token: string;
  }) {
    const liquidityInfo = config.availableLiquidity
      ? ` Available liquidity: ${config.availableLiquidity}`
      : '';

    super({
      code: 'BRIDGE_INSUFFICIENT_LIQUIDITY',
      message: `Insufficient liquidity on ${config.protocol} for ${config.requestedAmount} ${config.token}.${liquidityInfo}`,
      details: config,
      suggestion: 'Try a smaller amount or use a different bridge protocol',
      retryable: true,
      retryAfter: 60000,
      recovery: {
        fundsStatus: 'safe',
        canRetry: true,
        nextSteps: [
          `Reduce bridge amount to less than ${config.availableLiquidity ?? 'available liquidity'}`,
          'Try a different bridge protocol with more liquidity',
          'Wait for liquidity to be replenished',
        ],
      },
    });
    this.name = 'BridgeInsufficientLiquidityError';
  }
}

/**
 * Error thrown when slippage exceeds the maximum allowed
 */
export class BridgeSlippageExceededError extends BridgeError {
  constructor(config: {
    protocol: string;
    expectedSlippageBps: number;
    maxSlippageBps: number;
    expectedOutput?: string;
    minimumOutput?: string;
  }) {
    super({
      code: 'BRIDGE_SLIPPAGE_EXCEEDED',
      message: `Expected slippage (${(config.expectedSlippageBps / 100).toFixed(2)}%) exceeds maximum allowed (${(config.maxSlippageBps / 100).toFixed(2)}%)`,
      details: config,
      suggestion: 'Increase max slippage tolerance or try a smaller amount',
      retryable: true,
      retryAfter: 30000,
      recovery: {
        fundsStatus: 'safe',
        canRetry: true,
        nextSteps: [
          `Increase maxSlippageBps to at least ${config.expectedSlippageBps}`,
          'Try a smaller bridge amount to reduce price impact',
          'Wait for better liquidity conditions',
          'Use a protocol without slippage (e.g., CCTP)',
        ],
      },
    });
    this.name = 'BridgeSlippageExceededError';
  }
}

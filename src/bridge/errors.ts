/**
 * Bridge-specific errors
 * Structured errors for cross-chain bridging operations
 */

import { EthAgentError } from '../agent/errors.js';

/**
 * Base error class for all bridge-related errors
 */
export class BridgeError extends EthAgentError {
  constructor(config: {
    code?: string;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
    retryable?: boolean;
    retryAfter?: number;
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
    });
    this.name = 'BridgeProtocolUnavailableError';
  }
}

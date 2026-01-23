/**
 * Agent-friendly error types
 * Structured errors with recovery suggestions
 */

export interface ErrorDetails {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
  retryable?: boolean;
  retryAfter?: number;
}

/**
 * Base error class for all eth-agent errors
 */
export class EthAgentError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly suggestion: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;

  constructor(config: ErrorDetails) {
    super(config.message);
    this.name = 'EthAgentError';
    this.code = config.code;
    this.details = config.details ?? {};
    this.suggestion = config.suggestion ?? 'Check the error details and try again';
    this.retryable = config.retryable ?? false;
    if (config.retryAfter !== undefined) {
      this.retryAfter = config.retryAfter;
    }
  }

  toJSON(): ErrorDetails {
    const result: ErrorDetails = {
      code: this.code,
      message: this.message,
      details: this.details,
      suggestion: this.suggestion,
      retryable: this.retryable,
    };
    if (this.retryAfter !== undefined) {
      result.retryAfter = this.retryAfter;
    }
    return result;
  }

  toString(): string {
    return `${this.code}: ${this.message}. ${this.suggestion}`;
  }
}

// ============ Network Errors ============

export class NetworkError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'NETWORK_ERROR' });
    this.name = 'NetworkError';
  }
}

export class ConnectionError extends NetworkError {
  constructor(url: string, cause?: Error) {
    super({
      code: 'CONNECTION_ERROR',
      message: `Failed to connect to ${url}`,
      details: { url, cause: cause?.message },
      suggestion: 'Check your network connection and RPC URL',
      retryable: true,
      retryAfter: 5000,
    });
    this.name = 'ConnectionError';
  }
}

export class RateLimitError extends NetworkError {
  constructor(retryAfter?: number) {
    super({
      code: 'RATE_LIMIT_ERROR',
      message: 'Too many requests to RPC endpoint',
      details: { retryAfter },
      suggestion: 'Wait before making more requests or use a different RPC provider',
      retryable: true,
      retryAfter: retryAfter ?? 60000,
    });
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends NetworkError {
  constructor(operation: string, timeout: number) {
    super({
      code: 'TIMEOUT_ERROR',
      message: `Operation ${operation} timed out after ${timeout}ms`,
      details: { operation, timeout },
      suggestion: 'Try again or increase timeout',
      retryable: true,
      retryAfter: 1000,
    });
    this.name = 'TimeoutError';
  }
}

// ============ Transaction Errors ============

export class TransactionError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'TRANSACTION_ERROR' });
    this.name = 'TransactionError';
  }
}

export class InsufficientFundsError extends TransactionError {
  constructor(config: {
    required: { wei: bigint; eth: string; usd?: number };
    available: { wei: bigint; eth: string; usd?: number };
    shortage: { wei: bigint; eth: string; usd?: number };
  }) {
    super({
      code: 'INSUFFICIENT_FUNDS',
      message: `Insufficient funds: need ${config.required.eth} ETH, have ${config.available.eth} ETH`,
      details: config,
      suggestion: `Add at least ${config.shortage.eth} ETH to your wallet or reduce transaction amount`,
      retryable: false,
    });
    this.name = 'InsufficientFundsError';
  }
}

export class GasEstimationError extends TransactionError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super({
      code: 'GAS_ESTIMATION_ERROR',
      message: `Failed to estimate gas: ${reason}`,
      details: { reason, ...details },
      suggestion: 'The transaction may revert. Check the contract state and parameters',
      retryable: false,
    });
    this.name = 'GasEstimationError';
  }
}

export class NonceError extends TransactionError {
  constructor(expected: number, got: number) {
    super({
      code: 'NONCE_ERROR',
      message: `Nonce mismatch: expected ${expected}, got ${got}`,
      details: { expected, got },
      suggestion: 'Wait for pending transactions to confirm or use the correct nonce',
      retryable: true,
      retryAfter: 5000,
    });
    this.name = 'NonceError';
  }
}

export class RevertError extends TransactionError {
  constructor(reason: string, data?: string) {
    super({
      code: 'REVERT_ERROR',
      message: `Transaction reverted: ${reason}`,
      details: { reason, data },
      suggestion: 'Check contract requirements and input parameters',
      retryable: false,
    });
    this.name = 'RevertError';
  }
}

export class UnderpricedError extends TransactionError {
  constructor(currentPrice: bigint, requiredPrice: bigint) {
    super({
      code: 'UNDERPRICED_ERROR',
      message: 'Transaction gas price too low',
      details: { currentPrice: currentPrice.toString(), requiredPrice: requiredPrice.toString() },
      suggestion: 'Increase gas price and try again',
      retryable: true,
    });
    this.name = 'UnderpricedError';
  }
}

// ============ Validation Errors ============

export class ValidationError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'VALIDATION_ERROR', retryable: false });
    this.name = 'ValidationError';
  }
}

export class InvalidAddressError extends ValidationError {
  constructor(address: string) {
    super({
      code: 'INVALID_ADDRESS',
      message: `Invalid Ethereum address: ${address}`,
      details: { address },
      suggestion: 'Provide a valid 0x-prefixed address or ENS name',
      retryable: false,
    });
    this.name = 'InvalidAddressError';
  }
}

export class InvalidAmountError extends ValidationError {
  constructor(amount: string, reason: string) {
    super({
      code: 'INVALID_AMOUNT',
      message: `Invalid amount "${amount}": ${reason}`,
      details: { amount, reason },
      suggestion: 'Provide a valid positive amount (e.g., "0.1 ETH" or "100 GWEI")',
      retryable: false,
    });
    this.name = 'InvalidAmountError';
  }
}

export class InvalidABIError extends ValidationError {
  constructor(reason: string) {
    super({
      code: 'INVALID_ABI',
      message: `Invalid ABI: ${reason}`,
      details: { reason },
      suggestion: 'Check the ABI format and ensure it matches the contract',
      retryable: false,
    });
    this.name = 'InvalidABIError';
  }
}

// ============ Limit Errors ============

export class LimitError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'LIMIT_ERROR' });
    this.name = 'LimitError';
  }
}

export class TransactionLimitError extends LimitError {
  constructor(config: {
    requested: { eth: string; usd?: number };
    limit: { eth: string; usd?: number };
  }) {
    super({
      code: 'TRANSACTION_LIMIT_EXCEEDED',
      message: `Transaction amount ${config.requested.eth} ETH exceeds per-transaction limit of ${config.limit.eth} ETH`,
      details: config,
      suggestion: `Reduce amount to ${config.limit.eth} ETH or less`,
      retryable: false,
    });
    this.name = 'TransactionLimitError';
  }
}

export class HourlyLimitError extends LimitError {
  constructor(config: {
    requested: { eth: string; usd?: number };
    remaining: { eth: string; usd?: number };
    resetsAt: Date;
  }) {
    super({
      code: 'HOURLY_LIMIT_EXCEEDED',
      message: `Transaction would exceed hourly limit. Remaining: ${config.remaining.eth} ETH`,
      details: config,
      suggestion: `Reduce amount to ${config.remaining.eth} ETH or wait until ${config.resetsAt.toISOString()}`,
      retryable: true,
      retryAfter: config.resetsAt.getTime() - Date.now(),
    });
    this.name = 'HourlyLimitError';
  }
}

export class DailyLimitError extends LimitError {
  constructor(config: {
    requested: { eth: string; usd?: number };
    remaining: { eth: string; usd?: number };
    resetsAt: Date;
  }) {
    super({
      code: 'DAILY_LIMIT_EXCEEDED',
      message: `Transaction would exceed daily limit. Remaining: ${config.remaining.eth} ETH`,
      details: config,
      suggestion: `Reduce amount to ${config.remaining.eth} ETH or wait until ${config.resetsAt.toISOString()}`,
      retryable: true,
      retryAfter: config.resetsAt.getTime() - Date.now(),
    });
    this.name = 'DailyLimitError';
  }
}

export class StablecoinLimitError extends LimitError {
  constructor(config: {
    type: 'transaction' | 'hourly' | 'daily';
    token: string;
    requested: string;
    limit?: string;
    remaining?: string;
    resetsAt?: Date;
  }) {
    const typeMessages = {
      transaction: `${config.token} transaction amount ${config.requested} exceeds per-transaction limit of $${config.limit ?? 'unknown'}`,
      hourly: `${config.token} transaction would exceed hourly limit. Remaining: $${config.remaining ?? '0'}`,
      daily: `${config.token} transaction would exceed daily limit. Remaining: $${config.remaining ?? '0'}`,
    };

    const typeSuggestions = {
      transaction: `Reduce amount to $${config.limit ?? 'unknown'} or less`,
      hourly: `Reduce amount to $${config.remaining ?? '0'} or wait until ${config.resetsAt?.toISOString() ?? 'limit resets'}`,
      daily: `Reduce amount to $${config.remaining ?? '0'} or wait until ${config.resetsAt?.toISOString() ?? 'limit resets'}`,
    };

    super({
      code: `STABLECOIN_${config.type.toUpperCase()}_LIMIT_EXCEEDED`,
      message: typeMessages[config.type],
      details: config,
      suggestion: typeSuggestions[config.type],
      retryable: config.type !== 'transaction',
      retryAfter: config.resetsAt ? config.resetsAt.getTime() - Date.now() : undefined,
    });
    this.name = 'StablecoinLimitError';
  }
}

// ============ Approval Errors ============

export class ApprovalError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'APPROVAL_ERROR' });
    this.name = 'ApprovalError';
  }
}

export class ApprovalDeniedError extends ApprovalError {
  constructor(reason?: string) {
    super({
      code: 'APPROVAL_DENIED',
      message: reason ?? 'Transaction was not approved',
      details: { reason },
      suggestion: 'The transaction requires approval. Retry with approval or reduce the amount',
      retryable: false,
    });
    this.name = 'ApprovalDeniedError';
  }
}

export class ApprovalTimeoutError extends ApprovalError {
  constructor(timeout: number) {
    super({
      code: 'APPROVAL_TIMEOUT',
      message: `Approval request timed out after ${String(timeout)}ms`,
      details: { timeout },
      suggestion: 'Retry the transaction to request approval again',
      retryable: true,
    });
    this.name = 'ApprovalTimeoutError';
  }
}

// ============ Address Policy Errors ============

export class AddressPolicyError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'ADDRESS_POLICY_ERROR', retryable: false });
    this.name = 'AddressPolicyError';
  }
}

export class BlockedAddressError extends AddressPolicyError {
  constructor(address: string, reason?: string) {
    super({
      code: 'BLOCKED_ADDRESS',
      message: `Address ${address} is blocked${reason ? `: ${reason}` : ''}`,
      details: { address, reason: reason ?? 'Blocked' },
      suggestion: 'This address cannot receive funds. Use a different recipient',
      retryable: false,
    });
    this.name = 'BlockedAddressError';
  }
}

export class UnknownAddressError extends AddressPolicyError {
  constructor(address: string) {
    super({
      code: 'UNKNOWN_ADDRESS',
      message: `Address ${address} is unknown and requires approval`,
      details: { address },
      suggestion: 'Add this address to trusted addresses or request approval for unknown recipients',
      retryable: false,
    });
    this.name = 'UnknownAddressError';
  }
}

// ============ Operation Policy Errors ============

export class OperationPolicyError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'OPERATION_POLICY_ERROR', retryable: false });
    this.name = 'OperationPolicyError';
  }
}

export class OperationNotAllowedError extends OperationPolicyError {
  constructor(operation: string) {
    super({
      code: 'OPERATION_NOT_ALLOWED',
      message: `Operation "${operation}" is not allowed by policy`,
      details: { operation },
      suggestion: 'This operation is disabled. Contact the administrator to enable it',
      retryable: false,
    });
    this.name = 'OperationNotAllowedError';
  }
}

// ============ Emergency Stop Error ============

export class EmergencyStopError extends EthAgentError {
  constructor(reason: string) {
    super({
      code: 'EMERGENCY_STOP',
      message: `Wallet is stopped: ${reason}`,
      details: { reason },
      suggestion: 'Contact administrator to review and resume operations',
      retryable: false,
    });
    this.name = 'EmergencyStopError';
  }
}

// ============ Swap Errors ============

export class SwapError extends EthAgentError {
  constructor(config: Omit<ErrorDetails, 'code'> & { code?: string }) {
    super({ ...config, code: config.code ?? 'SWAP_ERROR' });
    this.name = 'SwapError';
  }
}

export class InsufficientLiquidityError extends SwapError {
  constructor(config: {
    tokenIn: string;
    tokenOut: string;
    chainId: number;
  }) {
    super({
      code: 'INSUFFICIENT_LIQUIDITY',
      message: `No liquidity found for ${config.tokenIn} -> ${config.tokenOut} on chain ${config.chainId}`,
      details: config,
      suggestion: 'Try a different token pair, smaller amount, or use a different DEX',
      retryable: false,
    });
    this.name = 'InsufficientLiquidityError';
  }
}

export class SlippageExceededError extends SwapError {
  constructor(config: {
    expected: string;
    actual: string;
    slippageTolerance: number;
  }) {
    super({
      code: 'SLIPPAGE_EXCEEDED',
      message: `Slippage exceeded: expected ${config.expected}, got ${config.actual} (tolerance: ${config.slippageTolerance}%)`,
      details: config,
      suggestion: 'Increase slippage tolerance or try again with a smaller amount',
      retryable: true,
      retryAfter: 5000,
    });
    this.name = 'SlippageExceededError';
  }
}

export class TokenNotSupportedError extends SwapError {
  constructor(config: {
    token: string;
    chainId: number;
  }) {
    super({
      code: 'TOKEN_NOT_SUPPORTED',
      message: `Token "${config.token}" is not supported on chain ${config.chainId}`,
      details: config,
      suggestion: 'Use a supported token or switch to a different network',
      retryable: false,
    });
    this.name = 'TokenNotSupportedError';
  }
}

export class PriceImpactTooHighError extends SwapError {
  constructor(config: {
    priceImpact: number;
    maxAllowed: number;
  }) {
    super({
      code: 'PRICE_IMPACT_TOO_HIGH',
      message: `Price impact ${config.priceImpact.toFixed(2)}% exceeds maximum allowed ${config.maxAllowed}%`,
      details: config,
      suggestion: 'Reduce swap amount or split into multiple smaller swaps',
      retryable: false,
    });
    this.name = 'PriceImpactTooHighError';
  }
}

export class SwapLimitError extends LimitError {
  constructor(config: {
    type: 'transaction' | 'daily';
    requested: string;
    limit?: string;
    remaining?: string;
    resetsAt?: Date;
  }) {
    const typeMessages = {
      transaction: `Swap amount $${config.requested} exceeds per-transaction limit of $${config.limit}`,
      daily: `Swap would exceed daily limit. Remaining: $${config.remaining}`,
    };

    const typeSuggestions = {
      transaction: `Reduce swap amount to $${config.limit} or less`,
      daily: `Reduce amount to $${config.remaining} or wait until ${config.resetsAt?.toISOString() ?? 'limit resets'}`,
    };

    super({
      code: `SWAP_${config.type.toUpperCase()}_LIMIT_EXCEEDED`,
      message: typeMessages[config.type],
      details: config,
      suggestion: typeSuggestions[config.type],
      retryable: config.type === 'daily',
      retryAfter: config.resetsAt ? config.resetsAt.getTime() - Date.now() : undefined,
    });
    this.name = 'SwapLimitError';
  }
}

export class TokenNotAllowedError extends SwapError {
  constructor(config: {
    token: string;
    reason: 'blocked' | 'not_allowed';
  }) {
    const message =
      config.reason === 'blocked'
        ? `Token "${config.token}" is blocked for swapping`
        : `Token "${config.token}" is not in the allowed tokens list`;

    super({
      code: 'TOKEN_NOT_ALLOWED',
      message,
      details: config,
      suggestion: 'Use a different token that is allowed by the wallet configuration',
      retryable: false,
    });
    this.name = 'TokenNotAllowedError';
  }
}

// ============ Bridge Errors ============
// NOTE: Bridge-specific errors are now in src/bridge/errors.ts
// Import from there instead: import { BridgeLimitError, ... } from '../bridge/errors.js'

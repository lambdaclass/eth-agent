/**
 * Bridge Validation Module
 *
 * Provides validation for bridge requests including:
 * - Minimum amount validation (prevent dust/uneconomical bridges)
 * - Recipient address validation
 * - Full request validation
 */

import type { Address } from '../../core/types.js';
import { isAddress, isZeroAddress, isChecksumValid } from '../../core/address.js';
import type { StablecoinInfo } from '../../stablecoins/index.js';
import { parseStablecoinAmount, formatStablecoinAmount } from '../../stablecoins/index.js';
import type { BridgeRequest, BridgeQuote } from '../types.js';

/**
 * Validation error
 */
export interface ValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Field that failed validation */
  field?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Validation warning (non-blocking)
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Field that triggered the warning */
  field?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Errors (if any) */
  errors: ValidationError[];
  /** Warnings (non-blocking) */
  warnings: ValidationWarning[];
}

/**
 * Validator configuration
 */
export interface BridgeValidatorConfig {
  /** Default minimum bridge amount in USD */
  minBridgeAmountUSD?: number;
  /** Known burn addresses to reject */
  burnAddresses?: Address[];
}

/**
 * Known burn addresses (addresses where tokens are permanently lost)
 */
const KNOWN_BURN_ADDRESSES: Address[] = [
  '0x0000000000000000000000000000000000000000' as Address,  // Zero address
  '0x0000000000000000000000000000000000000001' as Address,  // Precompile
  '0x000000000000000000000000000000000000dEaD' as Address,  // Dead address
  '0xdead000000000000000000000000000000000000' as Address,  // Dead variant
];

/**
 * Default minimum bridge amount in USD
 * Bridge fees (gas) typically make amounts below $1 uneconomical
 */
const DEFAULT_MIN_BRIDGE_USD = 1.0;

/**
 * Bridge Validator
 * Validates bridge requests before execution
 */
export class BridgeValidator {
  private readonly minBridgeAmountUSD: number;
  private readonly burnAddresses: Set<string>;

  constructor(config: BridgeValidatorConfig = {}) {
    this.minBridgeAmountUSD = config.minBridgeAmountUSD ?? DEFAULT_MIN_BRIDGE_USD;

    // Build burn address set (lowercase for comparison)
    const allBurnAddresses = [...KNOWN_BURN_ADDRESSES, ...(config.burnAddresses ?? [])];
    this.burnAddresses = new Set(allBurnAddresses.map((a) => a.toLowerCase()));
  }

  /**
   * Validate minimum amount
   * Prevents dust/uneconomical bridges
   *
   * @param amount - Raw token amount
   * @param token - Stablecoin info
   * @param estimatedGasUSD - Estimated gas cost in USD
   * @returns Validation result
   */
  validateMinimumAmount(
    amount: bigint,
    token: StablecoinInfo,
    estimatedGasUSD: number = 0
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Convert amount to USD (stablecoins are ~$1)
    const amountFormatted = formatStablecoinAmount(amount, token);
    const amountUSD = Number(amountFormatted);

    // Check minimum amount
    if (amountUSD < this.minBridgeAmountUSD) {
      errors.push({
        code: 'AMOUNT_TOO_SMALL',
        message: `Bridge amount $${amountFormatted} is below minimum $${this.minBridgeAmountUSD.toFixed(2)}`,
        field: 'amount',
        context: {
          amount: amountFormatted,
          minimumUSD: this.minBridgeAmountUSD,
        },
      });
    }

    // Check if gas costs make this uneconomical
    if (estimatedGasUSD > 0) {
      const gasFeePercentage = (estimatedGasUSD / amountUSD) * 100;

      // Warn if gas is more than 10% of amount
      if (gasFeePercentage > 10) {
        warnings.push({
          code: 'HIGH_GAS_PERCENTAGE',
          message: `Gas cost ($${estimatedGasUSD.toFixed(2)}) is ${gasFeePercentage.toFixed(1)}% of bridge amount`,
          field: 'amount',
        });
      }

      // Error if gas is more than 50% of amount
      if (gasFeePercentage > 50) {
        errors.push({
          code: 'GAS_EXCEEDS_AMOUNT',
          message: `Gas cost ($${estimatedGasUSD.toFixed(2)}) exceeds 50% of bridge amount ($${amountFormatted})`,
          field: 'amount',
          context: {
            gasUSD: estimatedGasUSD,
            amountUSD,
            percentage: gasFeePercentage,
          },
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate recipient address
   *
   * Checks:
   * - Valid Ethereum address format
   * - Not zero address
   * - Not known burn addresses
   * - Valid checksum (warning if invalid)
   *
   * @param address - Recipient address to validate
   * @returns Validation result
   */
  validateRecipient(address: Address | string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if it's a valid address format
    if (!isAddress(address)) {
      errors.push({
        code: 'INVALID_ADDRESS_FORMAT',
        message: `Invalid Ethereum address format: ${address}`,
        field: 'recipient',
      });
      return { valid: false, errors, warnings };
    }

    // Check for zero address
    if (isZeroAddress(address)) {
      errors.push({
        code: 'ZERO_ADDRESS',
        message: 'Cannot bridge to zero address - tokens would be permanently lost',
        field: 'recipient',
      });
    }

    // Check for known burn addresses
    if (this.burnAddresses.has(address.toLowerCase())) {
      errors.push({
        code: 'BURN_ADDRESS',
        message: 'Cannot bridge to known burn address - tokens would be permanently lost',
        field: 'recipient',
        context: { address },
      });
    }

    // Check checksum validity (warning only - invalid checksum doesn't mean invalid address)
    if (!isChecksumValid(address)) {
      warnings.push({
        code: 'INVALID_CHECKSUM',
        message: 'Address has invalid checksum - double-check the address is correct',
        field: 'recipient',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a complete bridge request
   *
   * @param request - Bridge request to validate
   * @param quote - Optional quote for additional validation
   * @returns Validation result
   */
  validateRequest(
    request: BridgeRequest,
    quote?: BridgeQuote
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Parse and validate amount
    let amount: bigint;
    try {
      amount = parseStablecoinAmount(request.amount, request.token);
    } catch {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: `Invalid amount: ${String(request.amount)}`,
        field: 'amount',
      });
      return { valid: false, errors, warnings };
    }

    // Validate minimum amount
    const estimatedGasUSD = quote?.fee.totalUSD ?? 0;
    const amountResult = this.validateMinimumAmount(amount, request.token, estimatedGasUSD);
    errors.push(...amountResult.errors);
    warnings.push(...amountResult.warnings);

    // Validate recipient if provided
    if (request.recipient) {
      const recipientResult = this.validateRecipient(request.recipient);
      errors.push(...recipientResult.errors);
      warnings.push(...recipientResult.warnings);
    }

    // Validate destination chain
    if (request.destinationChainId <= 0) {
      errors.push({
        code: 'INVALID_CHAIN_ID',
        message: 'Destination chain ID must be positive',
        field: 'destinationChainId',
      });
    }

    // Quote-specific validations
    if (quote) {
      // Check quote expiry
      if (quote.expiry && new Date() > quote.expiry) {
        errors.push({
          code: 'QUOTE_EXPIRED',
          message: `Quote expired at ${quote.expiry.toISOString()}`,
          field: 'quote',
          context: {
            expiry: quote.expiry.toISOString(),
            now: new Date().toISOString(),
          },
        });
      }

      // Check slippage if present
      if (quote.slippage) {
        if (quote.slippage.expectedBps > quote.slippage.maxBps) {
          errors.push({
            code: 'SLIPPAGE_EXCEEDED',
            message: `Expected slippage (${quote.slippage.expectedBps} bps) exceeds maximum allowed (${quote.slippage.maxBps} bps)`,
            field: 'slippage',
            context: {
              expected: quote.slippage.expectedBps,
              max: quote.slippage.maxBps,
            },
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if an address is a known burn address
   */
  isBurnAddress(address: string): boolean {
    if (!isAddress(address)) {
      return false;
    }
    return this.burnAddresses.has(address.toLowerCase());
  }

  /**
   * Get the minimum bridge amount in USD
   */
  getMinBridgeAmountUSD(): number {
    return this.minBridgeAmountUSD;
  }

  /**
   * Get minimum bridge amount for a specific token
   */
  getMinBridgeAmount(token: StablecoinInfo): {
    raw: bigint;
    formatted: string;
    usd: number;
  } {
    // For stablecoins, amount in USD ≈ amount in tokens
    const raw = parseStablecoinAmount(this.minBridgeAmountUSD, token);
    return {
      raw,
      formatted: formatStablecoinAmount(raw, token),
      usd: this.minBridgeAmountUSD,
    };
  }
}

/**
 * Create a BridgeValidator instance
 */
export function createBridgeValidator(config?: BridgeValidatorConfig): BridgeValidator {
  return new BridgeValidator(config);
}

/**
 * Default validator instance
 */
let defaultValidator: BridgeValidator | null = null;

/**
 * Get the default validator instance
 */
export function getDefaultValidator(): BridgeValidator {
  if (!defaultValidator) {
    defaultValidator = new BridgeValidator();
  }
  return defaultValidator;
}

/**
 * Validate a recipient address using the default validator
 */
export function validateRecipient(address: Address | string): ValidationResult {
  return getDefaultValidator().validateRecipient(address);
}

/**
 * Validate a bridge request using the default validator
 */
export function validateBridgeRequest(
  request: BridgeRequest,
  quote?: BridgeQuote
): ValidationResult {
  return getDefaultValidator().validateRequest(request, quote);
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BridgeValidator,
  createBridgeValidator,
  getDefaultValidator,
  validateRecipient,
  validateBridgeRequest,
  type ValidationResult,
} from '../../../src/bridge/router/validation.js';
import { USDC, USDT, USDS } from '../../../src/stablecoins/tokens.js';
import type { Address } from '../../../src/core/types.js';
import type { BridgeRequest, BridgeQuote } from '../../../src/bridge/types.js';

describe('BridgeValidator', () => {
  describe('constructor', () => {
    it('should create validator with default config', () => {
      const validator = new BridgeValidator();
      expect(validator.getMinBridgeAmountUSD()).toBe(1.0);
    });

    it('should create validator with custom minimum amount', () => {
      const validator = new BridgeValidator({ minBridgeAmountUSD: 5.0 });
      expect(validator.getMinBridgeAmountUSD()).toBe(5.0);
    });

    it('should create validator with custom burn addresses', () => {
      const customBurn = '0x1234567890123456789012345678901234567890' as Address;
      const validator = new BridgeValidator({ burnAddresses: [customBurn] });
      expect(validator.isBurnAddress(customBurn)).toBe(true);
    });
  });

  describe('validateMinimumAmount', () => {
    it('should pass for amounts above minimum', () => {
      const validator = new BridgeValidator({ minBridgeAmountUSD: 1.0 });
      const result = validator.validateMinimumAmount(10_000_000n, USDC); // 10 USDC

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for amounts below minimum', () => {
      const validator = new BridgeValidator({ minBridgeAmountUSD: 1.0 });
      const result = validator.validateMinimumAmount(500_000n, USDC); // 0.5 USDC

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('AMOUNT_TOO_SMALL');
      expect(result.errors[0].field).toBe('amount');
    });

    it('should warn when gas is more than 10% of amount', () => {
      const validator = new BridgeValidator();
      const result = validator.validateMinimumAmount(10_000_000n, USDC, 2.0); // 10 USDC, $2 gas (20%)

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('HIGH_GAS_PERCENTAGE');
    });

    it('should error when gas exceeds 50% of amount', () => {
      const validator = new BridgeValidator();
      const result = validator.validateMinimumAmount(10_000_000n, USDC, 6.0); // 10 USDC, $6 gas (60%)

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'GAS_EXCEEDS_AMOUNT')).toBe(true);
    });

    it('should handle different stablecoin decimals', () => {
      const validator = new BridgeValidator();

      // USDS has 18 decimals
      const result = validator.validateMinimumAmount(10n * 10n ** 18n, USDS); // 10 USDS

      expect(result.valid).toBe(true);
    });

    it('should not warn about gas when gas cost is zero', () => {
      const validator = new BridgeValidator();
      const result = validator.validateMinimumAmount(10_000_000n, USDC, 0);

      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validateRecipient', () => {
    it('should pass for valid Ethereum address', () => {
      const validator = new BridgeValidator();
      const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f8f621' as Address;

      const result = validator.validateRecipient(validAddress);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for invalid address format', () => {
      const validator = new BridgeValidator();

      const result = validator.validateRecipient('not-an-address');

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_ADDRESS_FORMAT');
    });

    it('should fail for zero address', () => {
      const validator = new BridgeValidator();
      const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;

      const result = validator.validateRecipient(zeroAddress);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'ZERO_ADDRESS')).toBe(true);
    });

    it('should fail for known burn addresses', () => {
      const validator = new BridgeValidator();
      const deadAddress = '0x000000000000000000000000000000000000dEaD' as Address;

      const result = validator.validateRecipient(deadAddress);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'BURN_ADDRESS')).toBe(true);
    });

    it('should fail for dead address variant', () => {
      const validator = new BridgeValidator();
      const deadVariant = '0xdead000000000000000000000000000000000000' as Address;

      const result = validator.validateRecipient(deadVariant);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'BURN_ADDRESS')).toBe(true);
    });

    it('should fail for precompile address', () => {
      const validator = new BridgeValidator();
      const precompile = '0x0000000000000000000000000000000000000001' as Address;

      const result = validator.validateRecipient(precompile);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'BURN_ADDRESS')).toBe(true);
    });

    it('should warn for invalid checksum (mixed case but wrong)', () => {
      const validator = new BridgeValidator();
      // Valid address but with incorrect mixed-case checksum
      // The correct checksum is 0x742d35Cc6634C0532925a3b844Bc9e7595f8f621
      // This has wrong casing (mixed case but not correct checksum)
      const wrongChecksum = '0x742d35cC6634c0532925a3b844bc9e7595f8f621' as Address;

      const result = validator.validateRecipient(wrongChecksum);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.code === 'INVALID_CHECKSUM')).toBe(true);
    });

    it('should not warn for all-lowercase address (valid checksum)', () => {
      const validator = new BridgeValidator();
      // All lowercase is considered valid checksum
      const lowercase = '0x742d35cc6634c0532925a3b844bc9e7595f8f621' as Address;

      const result = validator.validateRecipient(lowercase);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.code === 'INVALID_CHECKSUM')).toBe(false);
    });

    it('should reject custom burn addresses', () => {
      const customBurn = '0x1234567890123456789012345678901234567890' as Address;
      const validator = new BridgeValidator({ burnAddresses: [customBurn] });

      const result = validator.validateRecipient(customBurn);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'BURN_ADDRESS')).toBe(true);
    });
  });

  describe('validateRequest', () => {
    const createValidRequest = (): BridgeRequest => ({
      amount: '100',
      token: USDC,
      destinationChainId: 10,
      recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8f621' as Address,
    });

    it('should pass for valid request', () => {
      const validator = new BridgeValidator();
      const request = createValidRequest();

      const result = validator.validateRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for invalid amount', () => {
      const validator = new BridgeValidator();
      const request = { ...createValidRequest(), amount: 'invalid' };

      const result = validator.validateRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_AMOUNT');
    });

    it('should fail for invalid destination chain ID', () => {
      const validator = new BridgeValidator();
      const request = { ...createValidRequest(), destinationChainId: 0 };

      const result = validator.validateRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_CHAIN_ID')).toBe(true);
    });

    it('should fail for negative destination chain ID', () => {
      const validator = new BridgeValidator();
      const request = { ...createValidRequest(), destinationChainId: -1 };

      const result = validator.validateRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_CHAIN_ID')).toBe(true);
    });

    it('should validate recipient when provided', () => {
      const validator = new BridgeValidator();
      const request = {
        ...createValidRequest(),
        recipient: '0x0000000000000000000000000000000000000000' as Address,
      };

      const result = validator.validateRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'ZERO_ADDRESS')).toBe(true);
    });

    it('should pass when recipient is not provided', () => {
      const validator = new BridgeValidator();
      const request = createValidRequest();
      delete (request as any).recipient;

      const result = validator.validateRequest(request);

      expect(result.valid).toBe(true);
    });

    it('should fail for expired quote', () => {
      const validator = new BridgeValidator();
      const request = createValidRequest();
      const quote: BridgeQuote = {
        protocol: 'CCTP',
        sourceChainId: 1,
        destinationChainId: 10,
        token: USDC,
        amount: { raw: 100_000_000n, formatted: '100' },
        estimatedOutput: { raw: 100_000_000n, formatted: '100' },
        fee: {
          bridgeFee: { raw: 0n, formatted: '0' },
          gasFee: { raw: 1000000000000000n, formatted: '0.001' },
          totalUSD: 0.5,
        },
        estimatedTime: { minSeconds: 60, maxSeconds: 300 },
        expiry: new Date(Date.now() - 10000), // Expired 10 seconds ago
      };

      const result = validator.validateRequest(request, quote);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'QUOTE_EXPIRED')).toBe(true);
    });

    it('should pass for valid quote', () => {
      const validator = new BridgeValidator();
      const request = createValidRequest();
      const quote: BridgeQuote = {
        protocol: 'CCTP',
        sourceChainId: 1,
        destinationChainId: 10,
        token: USDC,
        amount: { raw: 100_000_000n, formatted: '100' },
        estimatedOutput: { raw: 100_000_000n, formatted: '100' },
        fee: {
          bridgeFee: { raw: 0n, formatted: '0' },
          gasFee: { raw: 1000000000000000n, formatted: '0.001' },
          totalUSD: 0.5,
        },
        estimatedTime: { minSeconds: 60, maxSeconds: 300 },
        expiry: new Date(Date.now() + 60000), // Valid for 60 seconds
      };

      const result = validator.validateRequest(request, quote);

      expect(result.valid).toBe(true);
    });

    it('should fail when slippage exceeds maximum', () => {
      const validator = new BridgeValidator();
      const request = createValidRequest();
      const quote: BridgeQuote = {
        protocol: 'CCTP',
        sourceChainId: 1,
        destinationChainId: 10,
        token: USDC,
        amount: { raw: 100_000_000n, formatted: '100' },
        estimatedOutput: { raw: 100_000_000n, formatted: '100' },
        fee: {
          bridgeFee: { raw: 0n, formatted: '0' },
          gasFee: { raw: 1000000000000000n, formatted: '0.001' },
          totalUSD: 0.5,
        },
        estimatedTime: { minSeconds: 60, maxSeconds: 300 },
        slippage: { expectedBps: 100, maxBps: 50 }, // Expected exceeds max
      };

      const result = validator.validateRequest(request, quote);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'SLIPPAGE_EXCEEDED')).toBe(true);
    });

    it('should use gas cost from quote for validation', () => {
      const validator = new BridgeValidator();
      const request = { ...createValidRequest(), amount: '10' }; // 10 USDC
      const quote: BridgeQuote = {
        protocol: 'CCTP',
        sourceChainId: 1,
        destinationChainId: 10,
        token: USDC,
        amount: { raw: 10_000_000n, formatted: '10' },
        estimatedOutput: { raw: 10_000_000n, formatted: '10' },
        fee: {
          bridgeFee: { raw: 0n, formatted: '0' },
          gasFee: { raw: 1000000000000000n, formatted: '0.001' },
          totalUSD: 6, // 60% of 10 USDC
        },
        estimatedTime: { minSeconds: 60, maxSeconds: 300 },
      };

      const result = validator.validateRequest(request, quote);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'GAS_EXCEEDS_AMOUNT')).toBe(true);
    });
  });

  describe('isBurnAddress', () => {
    it('should return true for zero address', () => {
      const validator = new BridgeValidator();
      expect(validator.isBurnAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });

    it('should return true for dead address', () => {
      const validator = new BridgeValidator();
      expect(validator.isBurnAddress('0x000000000000000000000000000000000000dEaD')).toBe(true);
    });

    it('should return false for valid address', () => {
      const validator = new BridgeValidator();
      expect(validator.isBurnAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f8f621')).toBe(false);
    });

    it('should return false for invalid address format', () => {
      const validator = new BridgeValidator();
      expect(validator.isBurnAddress('not-an-address')).toBe(false);
    });

    it('should be case insensitive', () => {
      const validator = new BridgeValidator();
      expect(validator.isBurnAddress('0x000000000000000000000000000000000000DEAD')).toBe(true);
    });
  });

  describe('getMinBridgeAmount', () => {
    it('should return minimum amount for USDC', () => {
      const validator = new BridgeValidator({ minBridgeAmountUSD: 5.0 });
      const result = validator.getMinBridgeAmount(USDC);

      expect(result.usd).toBe(5.0);
      expect(result.raw).toBe(5_000_000n); // 5 USDC with 6 decimals
      expect(result.formatted).toBe('5');
    });

    it('should return minimum amount for USDS (18 decimals)', () => {
      const validator = new BridgeValidator({ minBridgeAmountUSD: 1.0 });
      const result = validator.getMinBridgeAmount(USDS);

      expect(result.usd).toBe(1.0);
      expect(result.raw).toBe(10n ** 18n);
      expect(result.formatted).toBe('1');
    });
  });
});

describe('Factory functions', () => {
  describe('createBridgeValidator', () => {
    it('should create validator with default config', () => {
      const validator = createBridgeValidator();
      expect(validator).toBeInstanceOf(BridgeValidator);
      expect(validator.getMinBridgeAmountUSD()).toBe(1.0);
    });

    it('should create validator with custom config', () => {
      const validator = createBridgeValidator({ minBridgeAmountUSD: 10.0 });
      expect(validator.getMinBridgeAmountUSD()).toBe(10.0);
    });
  });

  describe('getDefaultValidator', () => {
    it('should return singleton instance', () => {
      const v1 = getDefaultValidator();
      const v2 = getDefaultValidator();
      expect(v1).toBe(v2);
    });
  });
});

describe('Standalone validation functions', () => {
  describe('validateRecipient', () => {
    it('should validate recipient using default validator', () => {
      const result = validateRecipient('0x742d35Cc6634C0532925a3b844Bc9e7595f8f621');
      expect(result.valid).toBe(true);
    });

    it('should reject burn addresses', () => {
      const result = validateRecipient('0x0000000000000000000000000000000000000000');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateBridgeRequest', () => {
    it('should validate request using default validator', () => {
      const request: BridgeRequest = {
        amount: '100',
        token: USDC,
        destinationChainId: 10,
      };

      const result = validateBridgeRequest(request);
      expect(result.valid).toBe(true);
    });
  });
});

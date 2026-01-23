import { describe, it, expect } from 'vitest';
import {
  BridgeError,
  BridgeUnsupportedRouteError,
  BridgeDestinationNotAllowedError,
  BridgeAttestationTimeoutError,
  BridgeAttestationError,
  BridgeLimitError,
  BridgeSameChainError,
  BridgeCompletionError,
  BridgeApprovalError,
} from '../../src/bridge/errors.js';

describe('Bridge Errors', () => {
  describe('BridgeError', () => {
    it('should create a base bridge error', () => {
      const error = new BridgeError({
        message: 'Test error',
      });

      expect(error.code).toBe('BRIDGE_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('BridgeError');
    });
  });

  describe('BridgeUnsupportedRouteError', () => {
    it('should create error with route details', () => {
      const error = new BridgeUnsupportedRouteError({
        sourceChainId: 1,
        destinationChainId: 999,
        token: 'USDC',
      });

      expect(error.code).toBe('BRIDGE_UNSUPPORTED_ROUTE');
      expect(error.message).toContain('999');
      expect(error.message).toContain('USDC');
      expect(error.retryable).toBe(false);
    });

    it('should include supported chains in message', () => {
      const error = new BridgeUnsupportedRouteError({
        sourceChainId: 1,
        destinationChainId: 999,
        token: 'USDC',
        supportedChains: [1, 42161, 8453],
      });

      expect(error.message).toContain('1');
      expect(error.message).toContain('42161');
      expect(error.message).toContain('8453');
    });
  });

  describe('BridgeDestinationNotAllowedError', () => {
    it('should create error with destination details', () => {
      const error = new BridgeDestinationNotAllowedError({
        destinationChainId: 42161,
        allowedDestinations: [1, 8453],
      });

      expect(error.code).toBe('BRIDGE_DESTINATION_NOT_ALLOWED');
      expect(error.message).toContain('42161');
      expect(error.message).toContain('1');
      expect(error.message).toContain('8453');
      expect(error.retryable).toBe(false);
    });
  });

  describe('BridgeAttestationTimeoutError', () => {
    it('should create error with timing details', () => {
      const error = new BridgeAttestationTimeoutError({
        messageHash: '0x123',
        timeout: 1800000,
        elapsedTime: 1800000,
      });

      expect(error.code).toBe('BRIDGE_ATTESTATION_TIMEOUT');
      expect(error.message).toContain('1800');
      expect(error.retryable).toBe(true);
      expect(error.retryAfter).toBe(60000);
    });
  });

  describe('BridgeAttestationError', () => {
    it('should create error with attestation details', () => {
      const error = new BridgeAttestationError({
        messageHash: '0x123',
        error: 'API unavailable',
        statusCode: 503,
      });

      expect(error.code).toBe('BRIDGE_ATTESTATION_ERROR');
      expect(error.message).toContain('API unavailable');
      expect(error.retryable).toBe(true);
    });
  });

  describe('BridgeLimitError', () => {
    it('should create transaction limit error', () => {
      const error = new BridgeLimitError({
        type: 'transaction',
        requested: '20000',
        limit: '10000',
      });

      expect(error.code).toBe('BRIDGE_TRANSACTION_LIMIT_EXCEEDED');
      expect(error.message).toContain('20000');
      expect(error.message).toContain('10000');
      expect(error.retryable).toBe(false);
    });

    it('should create daily limit error', () => {
      const resetsAt = new Date();
      const error = new BridgeLimitError({
        type: 'daily',
        requested: '20000',
        limit: '50000',
        remaining: '5000',
        resetsAt,
      });

      expect(error.code).toBe('BRIDGE_DAILY_LIMIT_EXCEEDED');
      expect(error.message).toContain('5000');
      expect(error.retryable).toBe(true);
    });
  });

  describe('BridgeSameChainError', () => {
    it('should create error for same chain bridge attempt', () => {
      const error = new BridgeSameChainError(42161);

      expect(error.code).toBe('BRIDGE_SAME_CHAIN');
      expect(error.message).toContain('42161');
      expect(error.message).toContain('same chain');
      expect(error.retryable).toBe(false);
    });
  });

  describe('BridgeCompletionError', () => {
    it('should create completion error', () => {
      const error = new BridgeCompletionError({
        messageHash: '0x123',
        error: 'Message already processed',
      });

      expect(error.code).toBe('BRIDGE_COMPLETION_ERROR');
      expect(error.message).toContain('already processed');
      expect(error.retryable).toBe(true);
    });
  });

  describe('BridgeApprovalError', () => {
    it('should create approval error', () => {
      const error = new BridgeApprovalError({
        token: 'USDC',
        spender: '0x123',
        amount: '1000',
        error: 'Insufficient balance',
      });

      expect(error.code).toBe('BRIDGE_APPROVAL_ERROR');
      expect(error.message).toContain('USDC');
      expect(error.message).toContain('Insufficient balance');
      expect(error.retryable).toBe(true);
    });
  });
});

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
  BridgeNoRouteError,
  BridgeAllRoutesFailed,
  BridgeProtocolUnavailableError,
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

  describe('BridgeNoRouteError', () => {
    it('should create error with route details', () => {
      const error = new BridgeNoRouteError({
        sourceChainId: 1,
        destinationChainId: 42161,
        token: 'USDC',
      });

      expect(error.code).toBe('BRIDGE_NO_ROUTE');
      expect(error.message).toContain('USDC');
      expect(error.message).toContain('1');
      expect(error.message).toContain('42161');
      expect(error.retryable).toBe(false);
      expect(error.name).toBe('BridgeNoRouteError');
    });

    it('should include checked protocols in message', () => {
      const error = new BridgeNoRouteError({
        sourceChainId: 1,
        destinationChainId: 42161,
        token: 'USDC',
        checkedProtocols: ['CCTP', 'Stargate'],
      });

      expect(error.message).toContain('CCTP');
      expect(error.message).toContain('Stargate');
    });
  });

  describe('BridgeAllRoutesFailed', () => {
    it('should create error with failure details', () => {
      const error = new BridgeAllRoutesFailed({
        sourceChainId: 1,
        destinationChainId: 42161,
        token: 'USDC',
        failures: [
          { protocol: 'CCTP', error: 'Attestation unavailable' },
          { protocol: 'Stargate', error: 'Insufficient liquidity' },
        ],
      });

      expect(error.code).toBe('BRIDGE_ALL_ROUTES_FAILED');
      expect(error.message).toContain('USDC');
      expect(error.message).toContain('CCTP');
      expect(error.message).toContain('Attestation unavailable');
      expect(error.message).toContain('Stargate');
      expect(error.message).toContain('Insufficient liquidity');
      expect(error.retryable).toBe(true);
      expect(error.retryAfter).toBe(30000);
      expect(error.name).toBe('BridgeAllRoutesFailed');
    });
  });

  describe('BridgeProtocolUnavailableError', () => {
    it('should create error with protocol details', () => {
      const error = new BridgeProtocolUnavailableError({
        protocol: 'CCTP',
        reason: 'Service maintenance',
      });

      expect(error.code).toBe('BRIDGE_PROTOCOL_UNAVAILABLE');
      expect(error.message).toContain('CCTP');
      expect(error.message).toContain('Service maintenance');
      expect(error.retryable).toBe(true);
      expect(error.retryAfter).toBe(10000);
      expect(error.name).toBe('BridgeProtocolUnavailableError');
    });

    it('should include alternative protocols in message and suggestion', () => {
      const error = new BridgeProtocolUnavailableError({
        protocol: 'CCTP',
        reason: 'Service maintenance',
        alternativeProtocols: ['Stargate', 'Across'],
      });

      expect(error.message).toContain('Stargate');
      expect(error.message).toContain('Across');
      expect(error.suggestion).toContain('Stargate');
    });

    it('should have generic suggestion when no alternatives', () => {
      const error = new BridgeProtocolUnavailableError({
        protocol: 'CCTP',
        reason: 'Service maintenance',
      });

      expect(error.suggestion).toContain('Try again later');
    });
  });
});

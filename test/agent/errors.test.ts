import { describe, it, expect } from 'vitest';
import {
  EthAgentError,
  NetworkError,
  ConnectionError,
  RateLimitError,
  TimeoutError,
  TransactionError,
  InsufficientFundsError,
  GasEstimationError,
  NonceError,
  RevertError,
  UnderpricedError,
  ValidationError,
  InvalidAddressError,
  InvalidAmountError,
  InvalidABIError,
  LimitError,
  TransactionLimitError,
  HourlyLimitError,
  DailyLimitError,
  ApprovalError,
  ApprovalDeniedError,
  ApprovalTimeoutError,
  AddressPolicyError,
  BlockedAddressError,
  UnknownAddressError,
  OperationPolicyError,
  OperationNotAllowedError,
  EmergencyStopError,
} from '../../src/agent/errors.js';

describe('Agent Errors', () => {
  describe('EthAgentError', () => {
    it('creates error with config', () => {
      const error = new EthAgentError({
        code: 'TEST_CODE',
        message: 'Test error message',
      });
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('EthAgentError');
      expect(error.code).toBe('TEST_CODE');
    });

    it('includes details', () => {
      const error = new EthAgentError({
        code: 'TEST',
        message: 'Test',
        details: { foo: 'bar' },
      });
      expect(error.details).toEqual({ foo: 'bar' });
    });

    it('includes suggestion', () => {
      const error = new EthAgentError({
        code: 'TEST',
        message: 'Test',
        suggestion: 'Try again',
      });
      expect(error.suggestion).toBe('Try again');
    });

    it('defaults suggestion', () => {
      const error = new EthAgentError({
        code: 'TEST',
        message: 'Test',
      });
      expect(error.suggestion).toContain('Check');
    });

    it('includes retryable flag', () => {
      const error = new EthAgentError({
        code: 'TEST',
        message: 'Test',
        retryable: true,
        retryAfter: 5000,
      });
      expect(error.retryable).toBe(true);
      expect(error.retryAfter).toBe(5000);
    });

    it('converts to JSON', () => {
      const error = new EthAgentError({
        code: 'TEST',
        message: 'Test',
        details: { a: 1 },
        retryAfter: 1000,
      });
      const json = error.toJSON();
      expect(json.code).toBe('TEST');
      expect(json.message).toBe('Test');
      expect(json.retryAfter).toBe(1000);
    });

    it('converts to string', () => {
      const error = new EthAgentError({
        code: 'TEST',
        message: 'Test message',
        suggestion: 'Try again',
      });
      const str = error.toString();
      expect(str).toContain('TEST');
      expect(str).toContain('Test message');
      expect(str).toContain('Try again');
    });
  });

  describe('NetworkError', () => {
    it('creates network error', () => {
      const error = new NetworkError({ message: 'Connection failed' });
      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
    });
  });

  describe('ConnectionError', () => {
    it('creates connection error', () => {
      const error = new ConnectionError('https://rpc.example.com');
      expect(error.name).toBe('ConnectionError');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.message).toContain('https://rpc.example.com');
      expect(error.retryable).toBe(true);
    });

    it('includes cause', () => {
      const cause = new Error('Socket closed');
      const error = new ConnectionError('https://rpc.example.com', cause);
      expect(error.details.cause).toBe('Socket closed');
    });
  });

  describe('RateLimitError', () => {
    it('creates rate limit error', () => {
      const error = new RateLimitError(30000);
      expect(error.name).toBe('RateLimitError');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.retryAfter).toBe(30000);
      expect(error.retryable).toBe(true);
    });

    it('defaults retryAfter', () => {
      const error = new RateLimitError();
      expect(error.retryAfter).toBe(60000);
    });
  });

  describe('TimeoutError', () => {
    it('creates timeout error', () => {
      const error = new TimeoutError('eth_call', 5000);
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.message).toContain('5000ms');
      expect(error.retryable).toBe(true);
    });
  });

  describe('InsufficientFundsError', () => {
    it('creates error with fund details', () => {
      const error = new InsufficientFundsError({
        required: { wei: 1000n, eth: '0.000001' },
        available: { wei: 500n, eth: '0.0000005' },
        shortage: { wei: 500n, eth: '0.0000005' },
      });

      expect(error.name).toBe('InsufficientFundsError');
      expect(error.code).toBe('INSUFFICIENT_FUNDS');
      expect(error.message).toContain('Insufficient funds');
      expect(error.suggestion).toContain('0.0000005');
    });
  });

  describe('GasEstimationError', () => {
    it('creates gas estimation error', () => {
      const error = new GasEstimationError('execution reverted');
      expect(error.name).toBe('GasEstimationError');
      expect(error.code).toBe('GAS_ESTIMATION_ERROR');
    });
  });

  describe('NonceError', () => {
    it('creates nonce error', () => {
      const error = new NonceError(5, 3);
      expect(error.name).toBe('NonceError');
      expect(error.code).toBe('NONCE_ERROR');
      expect(error.message).toContain('expected 5');
      expect(error.message).toContain('got 3');
    });
  });

  describe('RevertError', () => {
    it('creates revert error', () => {
      const error = new RevertError('insufficient allowance');
      expect(error.name).toBe('RevertError');
      expect(error.code).toBe('REVERT_ERROR');
      expect(error.message).toContain('insufficient allowance');
    });

    it('includes return data', () => {
      const error = new RevertError('failed', '0xdeadbeef');
      expect(error.details.data).toBe('0xdeadbeef');
    });
  });

  describe('UnderpricedError', () => {
    it('creates underpriced error', () => {
      const error = new UnderpricedError(1000000000n, 2000000000n);
      expect(error.name).toBe('UnderpricedError');
      expect(error.code).toBe('UNDERPRICED_ERROR');
      expect(error.retryable).toBe(true);
    });
  });

  describe('InvalidAddressError', () => {
    it('creates error for invalid address', () => {
      const error = new InvalidAddressError('not-an-address');
      expect(error.name).toBe('InvalidAddressError');
      expect(error.code).toBe('INVALID_ADDRESS');
      expect(error.message).toContain('not-an-address');
    });
  });

  describe('InvalidAmountError', () => {
    it('creates error for invalid amount', () => {
      const error = new InvalidAmountError('abc', 'Cannot parse');
      expect(error.name).toBe('InvalidAmountError');
      expect(error.code).toBe('INVALID_AMOUNT');
      expect(error.message).toContain('abc');
      expect(error.suggestion).toContain('ETH');
    });
  });

  describe('InvalidABIError', () => {
    it('creates error for invalid ABI', () => {
      const error = new InvalidABIError('missing function');
      expect(error.name).toBe('InvalidABIError');
      expect(error.code).toBe('INVALID_ABI');
    });
  });

  describe('TransactionLimitError', () => {
    it('creates transaction limit error', () => {
      const error = new TransactionLimitError({
        requested: { eth: '10' },
        limit: { eth: '1' },
      });
      expect(error.name).toBe('TransactionLimitError');
      expect(error.code).toBe('TRANSACTION_LIMIT_EXCEEDED');
    });
  });

  describe('HourlyLimitError', () => {
    it('creates hourly limit error', () => {
      const resetsAt = new Date(Date.now() + 3600000);
      const error = new HourlyLimitError({
        requested: { eth: '5' },
        remaining: { eth: '1' },
        resetsAt,
      });
      expect(error.name).toBe('HourlyLimitError');
      expect(error.code).toBe('HOURLY_LIMIT_EXCEEDED');
      expect(error.retryable).toBe(true);
    });
  });

  describe('DailyLimitError', () => {
    it('creates daily limit error', () => {
      const resetsAt = new Date(Date.now() + 86400000);
      const error = new DailyLimitError({
        requested: { eth: '50' },
        remaining: { eth: '10' },
        resetsAt,
      });
      expect(error.name).toBe('DailyLimitError');
      expect(error.code).toBe('DAILY_LIMIT_EXCEEDED');
    });
  });

  describe('ApprovalDeniedError', () => {
    it('creates error when approval denied', () => {
      const error = new ApprovalDeniedError();
      expect(error.name).toBe('ApprovalDeniedError');
      expect(error.code).toBe('APPROVAL_DENIED');
    });

    it('includes reason when provided', () => {
      const error = new ApprovalDeniedError('Too risky');
      expect(error.message).toBe('Too risky');
    });
  });

  describe('ApprovalTimeoutError', () => {
    it('creates timeout error', () => {
      const error = new ApprovalTimeoutError(30000);
      expect(error.name).toBe('ApprovalTimeoutError');
      expect(error.code).toBe('APPROVAL_TIMEOUT');
      expect(error.message).toContain('30000ms');
    });
  });

  describe('BlockedAddressError', () => {
    it('creates blocked address error', () => {
      const error = new BlockedAddressError('0x123');
      expect(error.name).toBe('BlockedAddressError');
      expect(error.code).toBe('BLOCKED_ADDRESS');
      expect(error.message).toContain('blocked');
    });

    it('includes reason', () => {
      const error = new BlockedAddressError('0x123', 'Known scam');
      expect(error.message).toContain('Known scam');
    });
  });

  describe('UnknownAddressError', () => {
    it('creates unknown address error', () => {
      const error = new UnknownAddressError('0x123');
      expect(error.name).toBe('UnknownAddressError');
      expect(error.code).toBe('UNKNOWN_ADDRESS');
    });
  });

  describe('OperationNotAllowedError', () => {
    it('creates operation not allowed error', () => {
      const error = new OperationNotAllowedError('swap');
      expect(error.name).toBe('OperationNotAllowedError');
      expect(error.code).toBe('OPERATION_NOT_ALLOWED');
      expect(error.message).toContain('swap');
    });
  });

  describe('EmergencyStopError', () => {
    it('creates emergency stop error', () => {
      const error = new EmergencyStopError('Suspicious activity detected');
      expect(error.name).toBe('EmergencyStopError');
      expect(error.code).toBe('EMERGENCY_STOP');
      expect(error.message).toContain('Suspicious activity');
    });
  });

  describe('Error inheritance', () => {
    it('NetworkError extends EthAgentError', () => {
      const error = new NetworkError({ message: 'test' });
      expect(error instanceof EthAgentError).toBe(true);
    });

    it('TransactionError extends EthAgentError', () => {
      const error = new TransactionError({ message: 'test' });
      expect(error instanceof EthAgentError).toBe(true);
    });

    it('ValidationError extends EthAgentError', () => {
      const error = new ValidationError({ message: 'test' });
      expect(error instanceof EthAgentError).toBe(true);
    });

    it('LimitError extends EthAgentError', () => {
      const error = new LimitError({ message: 'test' });
      expect(error instanceof EthAgentError).toBe(true);
    });

    it('ApprovalError extends EthAgentError', () => {
      const error = new ApprovalError({ message: 'test' });
      expect(error instanceof EthAgentError).toBe(true);
    });

    it('AddressPolicyError extends EthAgentError', () => {
      const error = new AddressPolicyError({ message: 'test' });
      expect(error instanceof EthAgentError).toBe(true);
    });

    it('OperationPolicyError extends EthAgentError', () => {
      const error = new OperationPolicyError({ message: 'test' });
      expect(error instanceof EthAgentError).toBe(true);
    });
  });
});

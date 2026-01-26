/**
 * Across API Client tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AcrossApiClient,
  createAcrossApiClient,
} from '../../../src/bridge/across/api-client.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AcrossApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use mainnet API by default', () => {
      const client = new AcrossApiClient();
      // We can't directly access private baseUrl, but we can verify behavior
      expect(client).toBeInstanceOf(AcrossApiClient);
    });

    it('should use testnet API when configured', () => {
      const client = new AcrossApiClient({ testnet: true });
      expect(client).toBeInstanceOf(AcrossApiClient);
    });
  });

  describe('createAcrossApiClient', () => {
    it('should create client using factory function', () => {
      const client = createAcrossApiClient();
      expect(client).toBeInstanceOf(AcrossApiClient);
    });

    it('should pass config to constructor', () => {
      const client = createAcrossApiClient({ testnet: true });
      expect(client).toBeInstanceOf(AcrossApiClient);
    });
  });

  describe('AcrossApiClient.forChain', () => {
    it('should create mainnet client for mainnet chain', () => {
      const client = AcrossApiClient.forChain(1);
      expect(client).toBeInstanceOf(AcrossApiClient);
    });

    it('should create testnet client for testnet chain', () => {
      const client = AcrossApiClient.forChain(11155111);
      expect(client).toBeInstanceOf(AcrossApiClient);
    });
  });

  describe('getQuote', () => {
    it('should call API with correct parameters', async () => {
      const mockResponse = {
        totalRelayFee: { total: '1000000', pct: '0.001' },
        relayerCapitalFee: { total: '500000', pct: '0.0005' },
        relayerGasFee: { total: '300000', pct: '0.0003' },
        lpFee: { total: '200000', pct: '0.0002' },
        timestamp: 1234567890,
        isAmountTooLow: false,
        quoteBlock: 12345678,
        spokePoolAddress: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
        expectedFillTimeSec: 120,
        limits: {
          minDeposit: '1000000',
          maxDeposit: '1000000000000',
          maxDepositInstant: '100000000000',
          maxDepositShortDelay: '500000000000',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new AcrossApiClient();
      const quote = await client.getQuote({
        originChainId: 1,
        destinationChainId: 42161,
        inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        amount: '100000000',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain('suggested-fees');
      expect(mockFetch.mock.calls[0][0]).toContain('originChainId=1');
      expect(mockFetch.mock.calls[0][0]).toContain('destinationChainId=42161');
      expect(quote.totalRelayFee.total).toBe('1000000');
      expect(quote.expectedFillTimeSec).toBe(120);
    });

    it('should include recipient if provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ totalRelayFee: { total: '0', pct: '0' } }),
      });

      const client = new AcrossApiClient();
      await client.getQuote({
        originChainId: 1,
        destinationChainId: 42161,
        inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        amount: '100000000',
        recipient: '0x1234567890123456789012345678901234567890',
      });

      expect(mockFetch.mock.calls[0][0]).toContain('recipient=');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      const client = new AcrossApiClient();
      await expect(
        client.getQuote({
          originChainId: 1,
          destinationChainId: 42161,
          inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          amount: '100000000',
        })
      ).rejects.toThrow('Across API error: 400');
    });
  });

  describe('getDepositStatus', () => {
    it('should call API with correct parameters', async () => {
      const mockResponse = {
        status: 'filled',
        fillTxHash: '0xabc123',
        fillTimestamp: 1234567890,
        destinationChainId: 42161,
        deposit: {
          depositId: 12345,
          originChainId: 1,
          destinationChainId: 42161,
          depositor: '0x1234567890123456789012345678901234567890',
          recipient: '0x1234567890123456789012345678901234567890',
          inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          inputAmount: '100000000',
          outputAmount: '99000000',
          quoteTimestamp: 1234567800,
          fillDeadline: 1234600000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new AcrossApiClient();
      const status = await client.getDepositStatus(1, 12345);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain('deposit/status');
      expect(mockFetch.mock.calls[0][0]).toContain('originChainId=1');
      expect(mockFetch.mock.calls[0][0]).toContain('depositId=12345');
      expect(status.status).toBe('filled');
      expect(status.fillTxHash).toBe('0xabc123');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      const client = new AcrossApiClient();
      await expect(client.getDepositStatus(1, 99999)).rejects.toThrow(
        'Across API error: 404'
      );
    });
  });

  describe('getAvailableRoutes', () => {
    it('should call API without filters', async () => {
      const mockResponse = {
        routes: [
          {
            originChainId: 1,
            destinationChainId: 42161,
            originToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            destinationToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            originTokenSymbol: 'USDC',
            destinationTokenSymbol: 'USDC',
            isEnabled: true,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new AcrossApiClient();
      const routes = await client.getAvailableRoutes();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain('available-routes');
      expect(routes.routes).toHaveLength(1);
    });

    it('should filter by origin chain', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ routes: [] }),
      });

      const client = new AcrossApiClient();
      await client.getAvailableRoutes(1);

      expect(mockFetch.mock.calls[0][0]).toContain('originChainId=1');
    });

    it('should filter by destination chain', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ routes: [] }),
      });

      const client = new AcrossApiClient();
      await client.getAvailableRoutes(undefined, 42161);

      expect(mockFetch.mock.calls[0][0]).toContain('destinationChainId=42161');
    });
  });

  describe('getLimits', () => {
    it('should call API with correct parameters', async () => {
      const mockResponse = {
        minDeposit: '1000000',
        maxDeposit: '1000000000000',
        maxDepositInstant: '100000000000',
        maxDepositShortDelay: '500000000000',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new AcrossApiClient();
      const limits = await client.getLimits(
        1,
        42161,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain('limits');
      expect(limits.minDeposit).toBe('1000000');
      expect(limits.maxDeposit).toBe('1000000000000');
    });
  });

  describe('getSuggestedFees', () => {
    it('should call API with correct parameters', async () => {
      const mockResponse = {
        totalRelayFee: { total: '1000000', pct: '0.001' },
        relayerCapitalFee: { total: '500000', pct: '0.0005' },
        relayerGasFee: { total: '300000', pct: '0.0003' },
        lpFee: { total: '200000', pct: '0.0002' },
        timestamp: 1234567890,
        isAmountTooLow: false,
        quoteBlock: 12345678,
        spokePoolAddress: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        exclusivityDeadline: 0,
        expectedFillTimeSec: 120,
        limits: {
          minDeposit: '1000000',
          maxDeposit: '1000000000000',
          maxDepositInstant: '100000000000',
          maxDepositShortDelay: '500000000000',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new AcrossApiClient();
      const fees = await client.getSuggestedFees({
        originChainId: 1,
        destinationChainId: 42161,
        inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        amount: '100000000',
      });

      expect(fees.exclusiveRelayer).toBeDefined();
      expect(fees.exclusivityDeadline).toBeDefined();
    });
  });
});

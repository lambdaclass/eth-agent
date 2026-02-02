import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CCTPFeeClient,
  createFeeClient,
  type CCTPFeeInfo,
  type FastTransferFeeQuote,
} from '../../../src/bridge/cctp/fees.js';
import { CCTP_FINALITY_THRESHOLDS } from '../../../src/bridge/constants.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CCTPFeeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use mainnet URL by default', () => {
      const client = new CCTPFeeClient();
      expect(client).toBeDefined();
    });

    it('should use testnet URL when configured', () => {
      const client = new CCTPFeeClient({ testnet: true });
      expect(client).toBeDefined();
    });

    it('should use custom timeout when configured', () => {
      const client = new CCTPFeeClient({ requestTimeout: 5000 });
      expect(client).toBeDefined();
    });
  });

  describe('getFeeQuote', () => {
    it('should fetch and parse fee quote from API', async () => {
      const mockResponse = [
        { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 10 },
        { finalityThreshold: CCTP_FINALITY_THRESHOLDS.finalized, minimumFee: 0 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new CCTPFeeClient();
      const quote = await client.getFeeQuote(0, 6); // ETH to Base

      expect(quote.fast).toEqual({
        feeBasisPoints: 10,
        feePercentage: 0.001,
        finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed,
      });
      expect(quote.standard).toEqual({
        feeBasisPoints: 0,
        feePercentage: 0,
        finalityThreshold: CCTP_FINALITY_THRESHOLDS.finalized,
      });
    });

    it('should default to zero fees if not found in response', async () => {
      // Empty response - no fee data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const client = new CCTPFeeClient();
      const quote = await client.getFeeQuote(0, 6);

      expect(quote.fast.feeBasisPoints).toBe(0);
      expect(quote.standard.feeBasisPoints).toBe(0);
    });

    it('should handle API HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new CCTPFeeClient();

      await expect(client.getFeeQuote(0, 6)).rejects.toThrow('Fee API HTTP 500');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new CCTPFeeClient();

      await expect(client.getFeeQuote(0, 6)).rejects.toThrow('Failed to fetch CCTP fees: Network error');
    });

    it('should handle timeout errors', async () => {
      // Mock fetch to simulate a timeout by rejecting with abort error
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'));

      const client = new CCTPFeeClient({ requestTimeout: 50 });

      await expect(client.getFeeQuote(0, 6)).rejects.toThrow('Fee API request timed out');
    });

    it('should handle response with only fast fee', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 15 },
        ]),
      });

      const client = new CCTPFeeClient();
      const quote = await client.getFeeQuote(0, 6);

      expect(quote.fast.feeBasisPoints).toBe(15);
      expect(quote.standard.feeBasisPoints).toBe(0);
    });

    it('should handle response with only standard fee', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.finalized, minimumFee: 5 },
        ]),
      });

      const client = new CCTPFeeClient();
      const quote = await client.getFeeQuote(0, 6);

      expect(quote.fast.feeBasisPoints).toBe(0);
      expect(quote.standard.feeBasisPoints).toBe(5);
    });
  });

  describe('calculateMaxFee', () => {
    it('should calculate fee correctly for normal amounts', () => {
      const client = new CCTPFeeClient();

      // 1000 USDC with 10 basis points (0.1%)
      const fee = client.calculateMaxFee(1000_000_000n, 10);
      expect(fee).toBe(1_000_000n); // 1 USDC
    });

    it('should calculate fee for 100 basis points (1%)', () => {
      const client = new CCTPFeeClient();

      // 1000 USDC with 100 basis points (1%)
      const fee = client.calculateMaxFee(1000_000_000n, 100);
      expect(fee).toBe(10_000_000n); // 10 USDC
    });

    it('should return minimum 1 unit if fee rate is non-zero but rounds to 0', () => {
      const client = new CCTPFeeClient();

      // Very small amount (99 units) with 1 basis point
      // Fee would be 99 * 1 / 10000 = 0.0099, rounds to 0
      const fee = client.calculateMaxFee(99n, 1);
      expect(fee).toBe(1n); // Minimum 1 unit since fee > 0 but rounds to 0
    });

    it('should return 0 fee when fee rate is 0', () => {
      const client = new CCTPFeeClient();

      const fee = client.calculateMaxFee(1000_000_000n, 0);
      expect(fee).toBe(0n);
    });

    it('should handle large amounts correctly', () => {
      const client = new CCTPFeeClient();

      // 1 million USDC with 50 basis points (0.5%)
      const fee = client.calculateMaxFee(1_000_000_000_000n, 50);
      expect(fee).toBe(5_000_000_000n); // 5000 USDC
    });

    it('should handle small amounts that would round to zero', () => {
      const client = new CCTPFeeClient();

      // 100 units (0.0001 USDC) with 1 basis point
      const fee = client.calculateMaxFee(100n, 1);
      expect(fee).toBe(1n); // Minimum 1 unit
    });
  });

  describe('getFastTransferFee', () => {
    it('should return fee info with calculated max fee', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 10 },
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.finalized, minimumFee: 0 },
        ]),
      });

      const client = new CCTPFeeClient();
      // 1000 USDC
      const result = await client.getFastTransferFee(0, 6, 1000_000_000n);

      expect(result.feeInfo.feeBasisPoints).toBe(10);
      expect(result.maxFee).toBe(1_000_000n); // 1 USDC
      expect(result.maxFeeFormatted).toBe('1');
    });

    it('should apply minimum fee floor for fast transfers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 0 }, // Zero fee from API
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.finalized, minimumFee: 0 },
        ]),
      });

      const client = new CCTPFeeClient();
      // 10000 USDC with zero fee from API should apply min fee of 1 basis point
      const result = await client.getFastTransferFee(0, 6, 10_000_000_000n);

      // Minimum fee floor is 1 basis point = 0.01%
      // 10000 USDC * 0.0001 = 1 USDC
      expect(result.maxFee).toBe(1_000_000n);
    });

    it('should format fee correctly for fractional amounts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 50 },
          { finalityThreshold: CCTP_FINALITY_THRESHOLDS.finalized, minimumFee: 0 },
        ]),
      });

      const client = new CCTPFeeClient();
      // 100 USDC with 50 basis points = 0.5 USDC
      const result = await client.getFastTransferFee(0, 6, 100_000_000n);

      expect(result.maxFee).toBe(500_000n); // 0.5 USDC
      expect(result.maxFeeFormatted).toBe('0.5');
    });
  });

  describe('createFeeClient factory', () => {
    it('should create a fee client with default config', () => {
      const client = createFeeClient();
      expect(client).toBeInstanceOf(CCTPFeeClient);
    });

    it('should create a fee client with custom config', () => {
      const client = createFeeClient({ testnet: true, requestTimeout: 5000 });
      expect(client).toBeInstanceOf(CCTPFeeClient);
    });
  });
});

describe('formatUSDC helper (via getFastTransferFee)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should format whole numbers without decimals', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 100 },
      ]),
    });

    const client = new CCTPFeeClient();
    // 100 USDC * 1% = 1 USDC exactly
    const result = await client.getFastTransferFee(0, 6, 100_000_000n);
    expect(result.maxFeeFormatted).toBe('1');
  });

  it('should format with trimmed trailing zeros', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 10 },
      ]),
    });

    const client = new CCTPFeeClient();
    // 50 USDC * 0.1% = 0.05 USDC
    const result = await client.getFastTransferFee(0, 6, 50_000_000n);
    expect(result.maxFeeFormatted).toBe('0.05');
  });

  it('should handle zero amount with minimum fee floor', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { finalityThreshold: CCTP_FINALITY_THRESHOLDS.confirmed, minimumFee: 0 },
      ]),
    });

    const client = new CCTPFeeClient();
    // With min fee floor of 1 bps, zero amount still results in min fee of 1 unit
    // because fee rate is non-zero (1 bps) but calculated fee rounds to 0
    const result = await client.getFastTransferFee(0, 6, 0n);
    expect(result.maxFee).toBe(1n); // Minimum 1 unit
    expect(result.maxFeeFormatted).toBe('0.000001'); // 1 raw unit = 0.000001 USDC
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AttestationClient, createAttestationClient } from '../../../src/bridge/cctp/attestation.js';
import { BridgeAttestationError, BridgeAttestationTimeoutError } from '../../../src/bridge/errors.js';
import type { Hex } from '../../../src/core/types.js';

describe('AttestationClient', () => {
  const mockMessageHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
  const mockAttestation = '0xaabbccdd' as Hex;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const client = new AttestationClient();
      expect(client).toBeDefined();
    });

    it('should create client with testnet config', () => {
      const client = new AttestationClient({ testnet: true });
      expect(client).toBeDefined();
    });

    it('should create client with custom timeouts', () => {
      const client = new AttestationClient({
        requestTimeout: 5000,
        pollingInterval: 5000,
        maxWaitTime: 600000,
      });
      expect(client).toBeDefined();
    });
  });

  describe('getAttestation', () => {
    it('should return pending status when attestation not ready', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getAttestation(mockMessageHash);

      expect(result.status).toBe('pending');
      expect(result.attestation).toBeUndefined();
    });

    it('should return complete status with attestation', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'complete',
          attestation: mockAttestation,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getAttestation(mockMessageHash);

      expect(result.status).toBe('complete');
      expect(result.attestation).toBe(mockAttestation);
    });

    it('should add 0x prefix to attestation if missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'complete',
          attestation: 'aabbccdd', // No 0x prefix
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getAttestation(mockMessageHash);

      expect(result.attestation).toBe('0xaabbccdd');
    });

    it('should throw error on non-404 HTTP error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      await expect(client.getAttestation(mockMessageHash)).rejects.toThrow(BridgeAttestationError);
    });

    it('should keep 0x prefix in message hash for Circle API', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      await client.getAttestation(mockMessageHash);

      const calledUrl = fetchMock.mock.calls[0][0];
      // Circle API requires the 0x prefix
      expect(calledUrl).toContain('0x1234567890abcdef');
    });
  });

  describe('isReady', () => {
    it('should return true when attestation is complete', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'complete',
          attestation: mockAttestation,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const ready = await client.isReady(mockMessageHash);

      expect(ready).toBe(true);
    });

    it('should return false when attestation is pending', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const ready = await client.isReady(mockMessageHash);

      expect(ready).toBe(false);
    });
  });

  describe('getEstimatedTime', () => {
    it('should return estimated time string', () => {
      const client = new AttestationClient();
      const time = client.getEstimatedTime();

      expect(time).toContain('15');
      expect(time).toContain('30');
      expect(time).toContain('minute');
    });
  });

  describe('waitForAttestation', () => {
    it('should return attestation when immediately ready', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'complete',
          attestation: mockAttestation,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient({
        pollingInterval: 1000,
        maxWaitTime: 60000,
      });

      const attestation = await client.waitForAttestation(mockMessageHash);

      expect(attestation).toBe(mockAttestation);
    });

    it('should poll and return when attestation becomes ready', async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 404,
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'complete',
            attestation: mockAttestation,
          }),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient({
        pollingInterval: 100,
        maxWaitTime: 60000,
      });

      // Run timers alongside the promise
      const resultPromise = client.waitForAttestation(mockMessageHash);

      // Advance timers to simulate polling
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      const attestation = await resultPromise;
      expect(attestation).toBe(mockAttestation);
      expect(callCount).toBe(3);
    });

    it('should throw timeout error after max wait time', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient({
        pollingInterval: 100,
        maxWaitTime: 500,
      });

      // Start the promise and catch its rejection to avoid unhandled rejection
      let caughtError: Error | undefined;
      const resultPromise = client.waitForAttestation(mockMessageHash).catch((e) => {
        caughtError = e;
      });

      // Advance time past the max wait time
      await vi.advanceTimersByTimeAsync(600);
      await resultPromise;

      expect(caughtError).toBeInstanceOf(BridgeAttestationTimeoutError);
    });
  });

  describe('createAttestationClient', () => {
    it('should create a new AttestationClient', () => {
      const client = createAttestationClient({ testnet: true });
      expect(client).toBeInstanceOf(AttestationClient);
    });
  });
});

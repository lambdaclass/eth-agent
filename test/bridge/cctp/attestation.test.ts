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

  describe('getAttestation extended', () => {
    it('should return pending on 400 status (message not indexed yet)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getAttestation(mockMessageHash);

      expect(result.status).toBe('pending');
    });

    it('should add 0x prefix to message hash if missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      // Message hash without 0x prefix
      await client.getAttestation('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex);

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('0x1234567890abcdef');
    });

    it('should handle network errors', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      await expect(client.getAttestation(mockMessageHash)).rejects.toThrow(BridgeAttestationError);
    });

    it('should handle timeout errors', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('The operation was aborted'));
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      await expect(client.getAttestation(mockMessageHash)).rejects.toThrow('timed out');
    });

    it('should return pending status when attestation field is empty string', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'pending',
          attestation: '',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getAttestation(mockMessageHash);

      expect(result.status).toBe('pending');
      expect(result.attestation).toBeUndefined();
    });
  });

  describe('getFastAttestation', () => {
    const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;

    it('should return pending when attestation not ready', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getFastAttestation(0, mockTxHash);

      expect(result.status).toBe('pending');
    });

    it('should return complete status with attestation', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{
            status: 'complete',
            attestation: mockAttestation,
            message: '0xmessagedata',
            messageHash: '0xmessagehash',
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getFastAttestation(0, mockTxHash);

      expect(result.status).toBe('complete');
      expect(result.attestation).toBe(mockAttestation);
      expect(result.message).toBe('0xmessagedata');
      expect(result.messageHash).toBe('0xmessagehash');
    });

    it('should add 0x prefix to attestation, message, and messageHash if missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{
            status: 'complete',
            attestation: 'aabbccdd',
            message: 'messagedata',
            messageHash: 'messagehash',
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getFastAttestation(0, mockTxHash);

      expect(result.attestation).toBe('0xaabbccdd');
      expect(result.message).toBe('0xmessagedata');
      expect(result.messageHash).toBe('0xmessagehash');
    });

    it('should return pending when messages array is empty', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getFastAttestation(0, mockTxHash);

      expect(result.status).toBe('pending');
    });

    it('should return pending when messages is undefined', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getFastAttestation(0, mockTxHash);

      expect(result.status).toBe('pending');
    });

    it('should throw error on non-404 HTTP error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      await expect(client.getFastAttestation(0, mockTxHash)).rejects.toThrow(BridgeAttestationError);
    });

    it('should handle network errors', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      await expect(client.getFastAttestation(0, mockTxHash)).rejects.toThrow('Fast API error');
    });

    it('should handle timeout errors', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('The operation was aborted'));
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      await expect(client.getFastAttestation(0, mockTxHash)).rejects.toThrow('timed out');
    });

    it('should add 0x prefix to tx hash if missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      // Tx hash without 0x prefix
      await client.getFastAttestation(0, 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex);

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('0xabcdef1234567890');
    });

    it('should handle pending status in message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{
            status: 'pending',
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getFastAttestation(0, mockTxHash);

      expect(result.status).toBe('pending');
      expect(result.attestation).toBeUndefined();
    });

    it('should handle empty attestation string', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{
            status: 'complete',
            attestation: '',
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.getFastAttestation(0, mockTxHash);

      expect(result.status).toBe('complete');
      expect(result.attestation).toBeUndefined();
    });
  });

  describe('isFastReady', () => {
    const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;

    it('should return true when fast attestation is complete', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{
            status: 'complete',
            attestation: mockAttestation,
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const ready = await client.isFastReady(0, mockTxHash);

      expect(ready).toBe(true);
    });

    it('should return false when fast attestation is pending', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const ready = await client.isFastReady(0, mockTxHash);

      expect(ready).toBe(false);
    });
  });

  describe('waitForFastAttestation', () => {
    const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;

    it('should return attestation when immediately ready', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{
            status: 'complete',
            attestation: mockAttestation,
            message: '0xmessage',
            messageHash: '0xhash',
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.waitForFastAttestation(0, mockTxHash);

      expect(result.attestation).toBe(mockAttestation);
      expect(result.message).toBe('0xmessage');
      expect(result.messageHash).toBe('0xhash');
    });

    it('should poll and return when fast attestation becomes ready', async () => {
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
            messages: [{
              status: 'complete',
              attestation: mockAttestation,
            }],
          }),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      const resultPromise = client.waitForFastAttestation(0, mockTxHash, {
        pollingInterval: 100,
        maxWaitTime: 10000,
      });

      // Advance timers to simulate polling
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result.attestation).toBe(mockAttestation);
      expect(callCount).toBe(3);
    });

    it('should throw timeout error after max wait time', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();

      let caughtError: Error | undefined;
      const resultPromise = client.waitForFastAttestation(0, mockTxHash, {
        pollingInterval: 100,
        maxWaitTime: 500,
      }).catch((e) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(600);
      await resultPromise;

      expect(caughtError).toBeInstanceOf(BridgeAttestationTimeoutError);
    });

    it('should use default polling interval and max wait time', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [{
            status: 'complete',
            attestation: mockAttestation,
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new AttestationClient();
      const result = await client.waitForFastAttestation(0, mockTxHash);

      expect(result.attestation).toBe(mockAttestation);
    });
  });

  describe('getEstimatedTime extended', () => {
    it('should return fast estimated time string', () => {
      const client = new AttestationClient();
      const time = client.getEstimatedTime(true);

      expect(time).toContain('second');
      expect(time).toContain('10');
      expect(time).toContain('30');
    });
  });
});

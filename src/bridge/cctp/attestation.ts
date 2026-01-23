/**
 * Circle Attestation API client
 * Fetches attestation signatures for CCTP messages
 */

import type { Hex } from '../../core/types.js';
import type { AttestationResponse, AttestationStatus } from '../types.js';
import { CIRCLE_ATTESTATION_API } from '../constants.js';
import { BridgeAttestationError, BridgeAttestationTimeoutError } from '../errors.js';

/**
 * Configuration for the attestation client
 */
export interface AttestationClientConfig {
  /** Use testnet API (default: false) */
  testnet?: boolean;
  /** Timeout for each API request in ms (default: 10000) */
  requestTimeout?: number;
  /** Polling interval when waiting for attestation in ms (default: 10000) */
  pollingInterval?: number;
  /** Maximum time to wait for attestation in ms (default: 1800000 = 30 minutes) */
  maxWaitTime?: number;
}

/**
 * Client for Circle's attestation service
 * The attestation service signs CCTP messages, enabling mint on destination
 */
export class AttestationClient {
  private readonly baseUrl: string;
  private readonly requestTimeout: number;
  private readonly pollingInterval: number;
  private readonly maxWaitTime: number;

  constructor(config: AttestationClientConfig = {}) {
    this.baseUrl = config.testnet === true
      ? CIRCLE_ATTESTATION_API.testnet
      : CIRCLE_ATTESTATION_API.mainnet;
    this.requestTimeout = config.requestTimeout ?? 10000;
    this.pollingInterval = config.pollingInterval ?? 10000;
    this.maxWaitTime = config.maxWaitTime ?? 1800000; // 30 minutes default
  }

  /**
   * Get the current attestation status for a message
   */
  async getAttestation(messageHash: Hex): Promise<AttestationResponse> {
    // Ensure 0x prefix is present (Circle API requires it)
    const hash = messageHash.startsWith('0x') ? messageHash : `0x${messageHash}`;

    const url = `${this.baseUrl}/${hash}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); }, this.requestTimeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // 404 means attestation is not yet available (pending)
        // 400 can also mean the message hasn't been indexed yet (very recent transactions)
        if (response.status === 404 || response.status === 400) {
          return { status: 'pending' };
        }

        throw new BridgeAttestationError({
          messageHash,
          error: `HTTP ${String(response.status)}: ${response.statusText}`,
          statusCode: response.status,
        });
      }

      const data = await response.json() as {
        status: string;
        attestation?: string;
      };

      // Map Circle's status to our status
      const status: AttestationStatus = data.status === 'complete' ? 'complete' : 'pending';

      const result: AttestationResponse = { status };

      if (data.attestation !== undefined && data.attestation !== '') {
        // Ensure attestation has 0x prefix
        const attestationHex = data.attestation.startsWith('0x')
          ? (data.attestation as Hex)
          : (`0x${data.attestation}` as Hex);
        result.attestation = attestationHex;
      }

      return result;
    } catch (error) {
      if (error instanceof BridgeAttestationError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle abort/timeout
      if (errorMessage.includes('abort')) {
        throw new BridgeAttestationError({
          messageHash,
          error: `Request timed out after ${String(this.requestTimeout)}ms`,
        });
      }

      throw new BridgeAttestationError({
        messageHash,
        error: errorMessage,
      });
    }
  }

  /**
   * Wait for attestation to be ready
   * Polls the API until attestation is complete or timeout
   */
  async waitForAttestation(messageHash: Hex): Promise<Hex> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.maxWaitTime) {
      const response = await this.getAttestation(messageHash);

      if (response.status === 'complete' && response.attestation !== undefined) {
        return response.attestation;
      }

      // Wait before next poll
      await sleep(this.pollingInterval);
    }

    throw new BridgeAttestationTimeoutError({
      messageHash,
      timeout: this.maxWaitTime,
      elapsedTime: Date.now() - startTime,
    });
  }

  /**
   * Check if attestation is ready (non-blocking)
   */
  async isReady(messageHash: Hex): Promise<boolean> {
    const response = await this.getAttestation(messageHash);
    return response.status === 'complete' && response.attestation !== undefined;
  }

  /**
   * Get estimated time for attestation
   * Typically 15-30 minutes on mainnet, faster on testnet
   */
  getEstimatedTime(): string {
    return '15-30 minutes';
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an attestation client
 */
export function createAttestationClient(config?: AttestationClientConfig): AttestationClient {
  return new AttestationClient(config);
}

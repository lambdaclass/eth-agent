/**
 * Circle Attestation API client
 * Fetches attestation signatures for CCTP messages
 * Supports both standard (v1) and fast (v2) attestation modes
 */

import type { Hash, Hex } from '../../core/types.js';
import type { AttestationResponse, AttestationStatus, CCTPDomain } from '../types.js';
import { CIRCLE_ATTESTATION_API, CIRCLE_FAST_ATTESTATION_API } from '../constants.js';
import { BridgeAttestationError, BridgeAttestationTimeoutError } from '../errors.js';

/**
 * Configuration for the attestation client
 */
export interface AttestationClientConfig {
  /** Use testnet API (default: false) */
  testnet?: boolean;
  /** Timeout for each API request in ms (default: 10000) */
  requestTimeout?: number;
  /** Polling interval when waiting for attestation in ms (default: 10000 for v1, 2000 for fast) */
  pollingInterval?: number;
  /** Maximum time to wait for attestation in ms (default: 1800000 = 30 minutes for v1, 120000 = 2 minutes for fast) */
  maxWaitTime?: number;
}

/**
 * Fast attestation response from v2 API
 */
export interface FastAttestationResponse {
  status: AttestationStatus;
  attestation?: Hex;
  message?: Hex;
  messageHash?: Hex;
}

/**
 * Client for Circle's attestation service
 * The attestation service signs CCTP messages, enabling mint on destination
 */
export class AttestationClient {
  private readonly baseUrl: string;
  private readonly fastBaseUrl: string;
  private readonly requestTimeout: number;
  private readonly pollingInterval: number;
  private readonly maxWaitTime: number;
  private readonly isTestnet: boolean;

  constructor(config: AttestationClientConfig = {}) {
    this.isTestnet = config.testnet === true;
    this.baseUrl = this.isTestnet
      ? CIRCLE_ATTESTATION_API.testnet
      : CIRCLE_ATTESTATION_API.mainnet;
    this.fastBaseUrl = this.isTestnet
      ? CIRCLE_FAST_ATTESTATION_API.testnet
      : CIRCLE_FAST_ATTESTATION_API.mainnet;
    this.requestTimeout = config.requestTimeout ?? 10000;
    this.pollingInterval = config.pollingInterval ?? 10000;
    this.maxWaitTime = config.maxWaitTime ?? 1800000; // 30 minutes default
  }

  /**
   * Get the current attestation status for a message (v1 standard API)
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
   * Get fast attestation using v2 API (source domain + transaction hash)
   * This is much faster than v1 (seconds vs minutes)
   */
  async getFastAttestation(sourceDomain: CCTPDomain, txHash: Hash): Promise<FastAttestationResponse> {
    // Ensure 0x prefix is present
    const hash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;

    // v2 API format: /v2/messages/{sourceDomain}/{txHash}
    const url = `${this.fastBaseUrl}/${String(sourceDomain)}/${hash}`;

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
        if (response.status === 404) {
          return { status: 'pending' };
        }

        throw new BridgeAttestationError({
          messageHash: hash as Hex,
          error: `Fast API HTTP ${String(response.status)}: ${response.statusText}`,
          statusCode: response.status,
        });
      }

      const data = await response.json() as {
        messages?: Array<{
          status: string;
          attestation?: string;
          message?: string;
          messageHash?: string;
        }>;
      };

      // v2 API returns an array of messages
      const messages = data.messages;
      if (!messages || messages.length === 0) {
        return { status: 'pending' };
      }

      const msg = messages[0];
      if (!msg) {
        return { status: 'pending' };
      }

      const status: AttestationStatus = msg.status === 'complete' ? 'complete' : 'pending';

      const result: FastAttestationResponse = { status };

      if (msg.attestation !== undefined && msg.attestation !== '') {
        result.attestation = (msg.attestation.startsWith('0x')
          ? msg.attestation
          : `0x${msg.attestation}`) as Hex;
      }

      if (msg.message !== undefined && msg.message !== '') {
        result.message = (msg.message.startsWith('0x')
          ? msg.message
          : `0x${msg.message}`) as Hex;
      }

      if (msg.messageHash !== undefined && msg.messageHash !== '') {
        result.messageHash = (msg.messageHash.startsWith('0x')
          ? msg.messageHash
          : `0x${msg.messageHash}`) as Hex;
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
          messageHash: hash as Hex,
          error: `Fast API request timed out after ${String(this.requestTimeout)}ms`,
        });
      }

      throw new BridgeAttestationError({
        messageHash: hash as Hex,
        error: `Fast API error: ${errorMessage}`,
      });
    }
  }

  /**
   * Wait for attestation to be ready (v1 standard API)
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
   * Wait for fast attestation (v2 API - much faster)
   * Polls more frequently since fast attestations typically arrive in seconds
   */
  async waitForFastAttestation(
    sourceDomain: CCTPDomain,
    txHash: Hash,
    options?: {
      pollingInterval?: number;
      maxWaitTime?: number;
    }
  ): Promise<{ attestation: Hex; message?: Hex; messageHash?: Hex }> {
    const startTime = Date.now();
    // Fast mode uses shorter intervals and timeout
    const pollInterval = options?.pollingInterval ?? 2000; // 2 seconds default for fast
    const maxWait = options?.maxWaitTime ?? 120000; // 2 minutes max for fast

    while (Date.now() - startTime < maxWait) {
      const response = await this.getFastAttestation(sourceDomain, txHash);

      if (response.status === 'complete' && response.attestation !== undefined) {
        return {
          attestation: response.attestation,
          message: response.message,
          messageHash: response.messageHash,
        };
      }

      // Wait before next poll (shorter interval for fast mode)
      await sleep(pollInterval);
    }

    throw new BridgeAttestationTimeoutError({
      messageHash: txHash as Hex,
      timeout: maxWait,
      elapsedTime: Date.now() - startTime,
    });
  }

  /**
   * Check if attestation is ready (non-blocking, v1 API)
   */
  async isReady(messageHash: Hex): Promise<boolean> {
    const response = await this.getAttestation(messageHash);
    return response.status === 'complete' && response.attestation !== undefined;
  }

  /**
   * Check if fast attestation is ready (non-blocking, v2 API)
   */
  async isFastReady(sourceDomain: CCTPDomain, txHash: Hash): Promise<boolean> {
    const response = await this.getFastAttestation(sourceDomain, txHash);
    return response.status === 'complete' && response.attestation !== undefined;
  }

  /**
   * Get estimated time for attestation
   * @param fast - If true, returns fast attestation estimate
   */
  getEstimatedTime(fast = false): string {
    if (fast) {
      return '10-30 seconds';
    }
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

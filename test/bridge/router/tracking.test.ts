/**
 * Tests for TrackingRegistry
 */

import { describe, it, expect } from 'vitest';
import { TrackingRegistry } from '../../../src/bridge/router/tracking.js';

describe('TrackingRegistry', () => {
  describe('createTrackingId', () => {
    it('should create tracking ID with destination chain ID (new format)', () => {
      const registry = new TrackingRegistry();
      const trackingId = registry.createTrackingId({
        info: {
          protocol: 'CCTP',
          identifier: '0xabc123',
          identifierType: 'messageHash',
        },
        sourceChainId: 1,
        destinationChainId: 8453,
      });

      expect(trackingId).toBe('bridge_cctp_1_8453_0xabc123');
    });

    it('should create tracking ID without destination chain ID (legacy format)', () => {
      const registry = new TrackingRegistry();
      const trackingId = registry.createTrackingId({
        info: {
          protocol: 'CCTP',
          identifier: '0xabc123',
          identifierType: 'messageHash',
        },
        sourceChainId: 1,
      });

      expect(trackingId).toBe('bridge_cctp_1_0xabc123');
    });

    it('should normalize identifiers to lowercase', () => {
      const registry = new TrackingRegistry();
      const trackingId = registry.createTrackingId({
        info: {
          protocol: 'CCTP',
          identifier: '0xABC123DEF',
          identifierType: 'messageHash',
        },
        sourceChainId: 1,
        destinationChainId: 8453,
      });

      expect(trackingId).toBe('bridge_cctp_1_8453_0xabc123def');
    });
  });

  describe('parseTrackingId', () => {
    it('should parse new format tracking ID with destination chain', () => {
      const registry = new TrackingRegistry();
      const parsed = registry.parseTrackingId('bridge_cctp_1_8453_0xabc123');

      expect(parsed).not.toBeNull();
      expect(parsed!.protocol).toBe('cctp');
      expect(parsed!.sourceChainId).toBe(1);
      expect(parsed!.destinationChainId).toBe(8453);
      expect(parsed!.identifier).toBe('0xabc123');
    });

    it('should parse legacy format tracking ID without destination chain', () => {
      const registry = new TrackingRegistry();
      const parsed = registry.parseTrackingId('bridge_cctp_1_0xabc123');

      expect(parsed).not.toBeNull();
      expect(parsed!.protocol).toBe('cctp');
      expect(parsed!.sourceChainId).toBe(1);
      expect(parsed!.destinationChainId).toBeUndefined();
      expect(parsed!.identifier).toBe('0xabc123');
    });

    it('should parse tracking ID with testnet chain IDs', () => {
      const registry = new TrackingRegistry();
      const parsed = registry.parseTrackingId('bridge_cctp_11155111_84532_0xdef456');

      expect(parsed).not.toBeNull();
      expect(parsed!.protocol).toBe('cctp');
      expect(parsed!.sourceChainId).toBe(11155111); // Sepolia
      expect(parsed!.destinationChainId).toBe(84532); // Base Sepolia
      expect(parsed!.identifier).toBe('0xdef456');
    });

    it('should return null for invalid format', () => {
      const registry = new TrackingRegistry();

      expect(registry.parseTrackingId('invalid')).toBeNull();
      expect(registry.parseTrackingId('bridge')).toBeNull();
      expect(registry.parseTrackingId('bridge_cctp')).toBeNull();
      expect(registry.parseTrackingId('bridge_cctp_abc')).toBeNull();
    });

    it('should handle identifiers with underscores', () => {
      const registry = new TrackingRegistry();
      const parsed = registry.parseTrackingId('bridge_cctp_1_8453_some_complex_id');

      expect(parsed).not.toBeNull();
      expect(parsed!.identifier).toBe('some_complex_id');
    });
  });

  describe('metadata storage', () => {
    it('should store and retrieve metadata', () => {
      const registry = new TrackingRegistry();
      const trackingId = 'bridge_cctp_1_8453_0xabc123';

      registry.storeMetadata(trackingId, {
        messageBytes: '0x1234567890' as `0x${string}`,
        nonce: 12345n,
        sourceDomain: 0,
        destinationDomain: 6,
        destinationChainId: 8453,
      });

      const meta = registry.getMetadata(trackingId);

      expect(meta).not.toBeUndefined();
      expect(meta!.messageBytes).toBe('0x1234567890');
      expect(meta!.nonce).toBe(12345n);
      expect(meta!.sourceDomain).toBe(0);
      expect(meta!.destinationDomain).toBe(6);
      expect(meta!.destinationChainId).toBe(8453);
      expect(meta!.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should return undefined for unknown tracking ID', () => {
      const registry = new TrackingRegistry();
      const meta = registry.getMetadata('bridge_cctp_1_8453_unknown');

      expect(meta).toBeUndefined();
    });

    it('should provide destination chain ID from metadata for legacy tracking IDs', () => {
      const registry = new TrackingRegistry();
      const legacyTrackingId = 'bridge_cctp_1_0xabc123';

      // Store metadata with destination chain ID
      registry.storeMetadata(legacyTrackingId, {
        destinationChainId: 8453,
      });

      // Parse should include destination from metadata
      const parsed = registry.parseTrackingId(legacyTrackingId);

      expect(parsed).not.toBeNull();
      expect(parsed!.destinationChainId).toBe(8453);
    });
  });

  describe('roundtrip', () => {
    it('should create and parse tracking ID correctly (new format)', () => {
      const registry = new TrackingRegistry();
      const original = {
        info: {
          protocol: 'CCTP',
          identifier: '0xabcdef1234567890',
          identifierType: 'messageHash' as const,
        },
        sourceChainId: 42161,
        destinationChainId: 10,
      };

      const trackingId = registry.createTrackingId(original);
      const parsed = registry.parseTrackingId(trackingId);

      expect(parsed).not.toBeNull();
      expect(parsed!.protocol).toBe('cctp');
      expect(parsed!.sourceChainId).toBe(42161);
      expect(parsed!.destinationChainId).toBe(10);
      expect(parsed!.identifier).toBe('0xabcdef1234567890');
    });
  });
});

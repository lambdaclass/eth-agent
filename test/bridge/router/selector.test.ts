import { describe, it, expect } from 'vitest';
import { RouteSelector, createRouteSelector } from '../../../src/bridge/router/selector.js';
import { generateTrackingId } from '../../../src/bridge/router/types.js';
import type { BridgeQuote, RoutePreference } from '../../../src/bridge/types.js';

// Helper to create mock quotes
const createMockQuote = (overrides: Partial<BridgeQuote> = {}): BridgeQuote => ({
  protocol: 'TestProtocol',
  inputAmount: 100000000n, // 100 USDC
  outputAmount: 100000000n,
  fee: {
    protocol: 0n,
    gas: 1000000n,
    total: 1000000n,
    totalUSD: 1.0,
  },
  estimatedTime: {
    minSeconds: 600,
    maxSeconds: 1800,
    display: '10-30 minutes',
  },
  route: {
    steps: 1,
    description: 'Test route',
  },
  ...overrides,
});

describe('RouteSelector', () => {
  let selector: RouteSelector;

  beforeEach(() => {
    selector = new RouteSelector();
  });

  describe('selectBestRoute', () => {
    it('should return empty result for no quotes', () => {
      const result = selector.selectBestRoute([]);

      expect(result.quotes).toHaveLength(0);
      expect(result.recommended).toBeNull();
      expect(result.recommendation.reason).toContain('No routes available');
    });

    it('should recommend single quote', () => {
      const quote = createMockQuote({ protocol: 'CCTP' });
      const result = selector.selectBestRoute([quote]);

      expect(result.quotes).toHaveLength(1);
      expect(result.recommended).toBe(quote);
    });

    it('should prefer lower cost when priority is cost', () => {
      const cheapQuote = createMockQuote({
        protocol: 'CheapBridge',
        fee: { protocol: 0n, gas: 100000n, total: 100000n, totalUSD: 0.1 },
      });
      const expensiveQuote = createMockQuote({
        protocol: 'ExpensiveBridge',
        fee: { protocol: 5000000n, gas: 100000n, total: 5100000n, totalUSD: 5.1 },
      });

      const result = selector.selectBestRoute(
        [expensiveQuote, cheapQuote],
        { priority: 'cost' }
      );

      expect(result.recommended?.protocol).toBe('CheapBridge');
    });

    it('should prefer faster when priority is speed', () => {
      const fastQuote = createMockQuote({
        protocol: 'FastBridge',
        estimatedTime: { minSeconds: 60, maxSeconds: 120, display: '1-2 minutes' },
      });
      const slowQuote = createMockQuote({
        protocol: 'SlowBridge',
        estimatedTime: { minSeconds: 3600, maxSeconds: 7200, display: '1-2 hours' },
      });

      const result = selector.selectBestRoute(
        [slowQuote, fastQuote],
        { priority: 'speed' }
      );

      expect(result.recommended?.protocol).toBe('FastBridge');
    });

    it('should prefer reliable when priority is reliability', () => {
      const reliableQuote = createMockQuote({ protocol: 'ReliableBridge' });
      const unreliableQuote = createMockQuote({ protocol: 'UnreliableBridge' });

      // Set reliability scores
      const protocolScores = new Map<string, number>();
      protocolScores.set('ReliableBridge', 95);
      protocolScores.set('UnreliableBridge', 50);

      const result = selector.selectBestRoute(
        [unreliableQuote, reliableQuote],
        { priority: 'reliability' },
        protocolScores
      );

      expect(result.recommended?.protocol).toBe('ReliableBridge');
    });

    it('should include recommendation reason', () => {
      const quote = createMockQuote({ protocol: 'CCTP' });
      const result = selector.selectBestRoute([quote], { priority: 'cost' });

      expect(result.recommendation.reason).toContain('CCTP');
      expect(result.recommendation.reason).toContain('fee');
    });

    it('should calculate savings vs second best', () => {
      const cheapQuote = createMockQuote({
        protocol: 'CheapBridge',
        fee: { protocol: 0n, gas: 0n, total: 0n, totalUSD: 0 },
      });
      const expensiveQuote = createMockQuote({
        protocol: 'ExpensiveBridge',
        fee: { protocol: 5000000n, gas: 100000n, total: 5100000n, totalUSD: 5.1 },
      });

      const result = selector.selectBestRoute(
        [expensiveQuote, cheapQuote],
        { priority: 'cost' }
      );

      expect(result.recommendation.savings).toBeDefined();
      expect(result.recommendation.savings).toContain('$');
    });
  });

  describe('filterByConstraints', () => {
    it('should filter by maxFeeUSD', () => {
      const cheapQuote = createMockQuote({
        protocol: 'Cheap',
        fee: { protocol: 0n, gas: 0n, total: 0n, totalUSD: 0.5 },
      });
      const expensiveQuote = createMockQuote({
        protocol: 'Expensive',
        fee: { protocol: 0n, gas: 0n, total: 0n, totalUSD: 10 },
      });

      const filtered = selector.filterByConstraints(
        [cheapQuote, expensiveQuote],
        { priority: 'cost', maxFeeUSD: 5 }
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].protocol).toBe('Cheap');
    });

    it('should filter by maxTimeMinutes', () => {
      const fastQuote = createMockQuote({
        protocol: 'Fast',
        estimatedTime: { minSeconds: 60, maxSeconds: 300, display: '1-5 min' },
      });
      const slowQuote = createMockQuote({
        protocol: 'Slow',
        estimatedTime: { minSeconds: 3600, maxSeconds: 7200, display: '1-2 hours' },
      });

      const filtered = selector.filterByConstraints(
        [fastQuote, slowQuote],
        { priority: 'speed', maxTimeMinutes: 30 }
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].protocol).toBe('Fast');
    });

    it('should filter by preferredProtocols', () => {
      const cctpQuote = createMockQuote({ protocol: 'CCTP' });
      const stargateQuote = createMockQuote({ protocol: 'Stargate' });

      const filtered = selector.filterByConstraints(
        [cctpQuote, stargateQuote],
        { priority: 'cost', preferredProtocols: ['CCTP'] }
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].protocol).toBe('CCTP');
    });

    it('should filter by excludeProtocols', () => {
      const cctpQuote = createMockQuote({ protocol: 'CCTP' });
      const stargateQuote = createMockQuote({ protocol: 'Stargate' });

      const filtered = selector.filterByConstraints(
        [cctpQuote, stargateQuote],
        { priority: 'cost', excludeProtocols: ['Stargate'] }
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].protocol).toBe('CCTP');
    });

    it('should apply multiple constraints', () => {
      const quotes = [
        createMockQuote({
          protocol: 'A',
          fee: { protocol: 0n, gas: 0n, total: 0n, totalUSD: 1 },
          estimatedTime: { minSeconds: 600, maxSeconds: 600, display: '10 min' },
        }),
        createMockQuote({
          protocol: 'B',
          fee: { protocol: 0n, gas: 0n, total: 0n, totalUSD: 10 }, // Too expensive
          estimatedTime: { minSeconds: 60, maxSeconds: 60, display: '1 min' },
        }),
        createMockQuote({
          protocol: 'C',
          fee: { protocol: 0n, gas: 0n, total: 0n, totalUSD: 2 },
          estimatedTime: { minSeconds: 7200, maxSeconds: 7200, display: '2 hours' }, // Too slow
        }),
      ];

      const filtered = selector.filterByConstraints(quotes, {
        priority: 'cost',
        maxFeeUSD: 5,
        maxTimeMinutes: 60,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].protocol).toBe('A');
    });
  });

  describe('getQuickSummary', () => {
    it('should return summary for valid comparison', () => {
      const quote = createMockQuote({ protocol: 'CCTP' });
      const comparison = selector.selectBestRoute([quote]);

      const summary = selector.getQuickSummary(comparison);

      expect(summary).toContain('Recommended: CCTP');
      expect(summary).toContain('Fee:');
      expect(summary).toContain('Time:');
    });

    it('should return message for no routes', () => {
      const comparison = selector.selectBestRoute([]);

      const summary = selector.getQuickSummary(comparison);

      expect(summary).toContain('No routes available');
    });

    it('should include route count when multiple', () => {
      const quotes = [
        createMockQuote({ protocol: 'A' }),
        createMockQuote({ protocol: 'B' }),
      ];
      const comparison = selector.selectBestRoute(quotes);

      const summary = selector.getQuickSummary(comparison);

      expect(summary).toContain('2 routes compared');
    });
  });

  describe('createRouteSelector', () => {
    it('should create a RouteSelector instance', () => {
      const selector = createRouteSelector();
      expect(selector).toBeInstanceOf(RouteSelector);
    });
  });
});

describe('generateTrackingId', () => {
  it('should generate a unique tracking ID', () => {
    const id = generateTrackingId({
      protocol: 'CCTP',
      sourceChainId: 1,
      destinationChainId: 42161,
    });

    expect(id).toMatch(/^cctp-1-42161-\d+-[a-z0-9]+$/);
  });

  it('should use provided timestamp', () => {
    const timestamp = 1700000000000;
    const id = generateTrackingId({
      protocol: 'CCTP',
      sourceChainId: 1,
      destinationChainId: 42161,
      timestamp,
    });

    expect(id).toContain('-1700000000000-');
  });

  it('should lowercase protocol name', () => {
    const id = generateTrackingId({
      protocol: 'STARGATE',
      sourceChainId: 8453,
      destinationChainId: 10,
    });

    expect(id).toMatch(/^stargate-/);
  });
});

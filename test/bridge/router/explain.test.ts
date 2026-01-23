import { describe, it, expect } from 'vitest';
import { ExplainBridge, createExplainer } from '../../../src/bridge/router/explain.js';
import type {
  BridgeQuote,
  BridgeRouteComparison,
  UnifiedBridgeResult,
  UnifiedBridgeStatus,
  BridgePreview,
  BridgeProtocolInfo,
} from '../../../src/bridge/types.js';
import type { Hash, Address } from '../../../src/core/types.js';

describe('ExplainBridge', () => {
  const explainer = new ExplainBridge();

  const mockQuote: BridgeQuote = {
    protocol: 'CCTP',
    inputAmount: 1000000000n,
    outputAmount: 999000000n,
    fee: {
      protocol: 0n,
      gas: 1000000n,
      totalUSD: 1.5,
    },
    estimatedTime: {
      seconds: 900,
      display: '~15 minutes',
    },
    route: {
      sourceChainId: 1,
      destinationChainId: 42161,
      token: 'USDC',
      description: 'USDC via CCTP from Ethereum to Arbitrum',
    },
    expiry: new Date(Date.now() + 300000),
  };

  const mockComparison: BridgeRouteComparison = {
    quotes: [mockQuote],
    recommended: mockQuote,
    recommendation: {
      reason: 'Lowest fees',
      savings: 'Saves $0.50 vs alternatives',
    },
  };

  describe('explainComparison', () => {
    it('should return no routes message when no recommendation', () => {
      const result = explainer.explainComparison({
        quotes: [],
        recommended: null,
        recommendation: {},
      });

      expect(result).toContain('No bridge routes are available');
    });

    it('should provide brief explanation', () => {
      const result = explainer.explainComparison(mockComparison, 'brief');

      expect(result).toContain('CCTP');
      expect(result).toContain('$1.50');
      expect(result).toContain('~15 minutes');
    });

    it('should provide standard explanation', () => {
      const result = explainer.explainComparison(mockComparison, 'standard');

      expect(result).toContain('Recommended: CCTP');
      expect(result).toContain('Fee: $1.50');
      expect(result).toContain('Time: ~15 minutes');
      expect(result).toContain('Lowest fees');
      expect(result).toContain('Saves $0.50');
    });

    it('should provide detailed explanation', () => {
      const multiQuoteComparison: BridgeRouteComparison = {
        ...mockComparison,
        quotes: [
          mockQuote,
          {
            ...mockQuote,
            protocol: 'Stargate',
            fee: { ...mockQuote.fee, totalUSD: 2.0 },
          },
        ],
      };

      const result = explainer.explainComparison(multiQuoteComparison, 'detailed');

      expect(result).toContain('=== Recommended Route ===');
      expect(result).toContain('=== All Available Routes ===');
      expect(result).toContain('CCTP');
      expect(result).toContain('Stargate');
    });

    it('should default to standard level', () => {
      const result = explainer.explainComparison(mockComparison);

      expect(result).toContain('Recommended: CCTP');
    });
  });

  describe('explainPreview', () => {
    it('should explain a preview that can bridge', () => {
      const preview: BridgePreview = {
        canBridge: true,
        blockers: [],
        quote: mockQuote,
        allQuotes: [mockQuote],
        sourceChain: { id: 1, name: 'Ethereum' },
        destinationChain: { id: 42161, name: 'Arbitrum' },
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        balance: { raw: 2000000000n, formatted: '2000 USDC' },
        needsApproval: false,
      };

      const result = explainer.explainPreview(preview);

      expect(result).toContain('Bridge Preview');
      expect(result).toContain('Status: Ready to bridge');
      expect(result).toContain('Recommended: CCTP');
      expect(result).toContain('Your balance: 2000 USDC');
    });

    it('should explain a preview with blockers', () => {
      const preview: BridgePreview = {
        canBridge: false,
        blockers: ['Insufficient balance', 'Route unavailable'],
        quote: null,
        allQuotes: [],
        sourceChain: { id: 1, name: 'Ethereum' },
        destinationChain: { id: 42161, name: 'Arbitrum' },
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        balance: { raw: 100000000n, formatted: '100 USDC' },
        needsApproval: false,
      };

      const result = explainer.explainPreview(preview);

      expect(result).toContain('Status: Cannot bridge');
      expect(result).toContain('Insufficient balance');
      expect(result).toContain('Route unavailable');
    });

    it('should indicate when approval is needed', () => {
      const preview: BridgePreview = {
        canBridge: true,
        blockers: [],
        quote: mockQuote,
        allQuotes: [mockQuote],
        sourceChain: { id: 1, name: 'Ethereum' },
        destinationChain: { id: 42161, name: 'Arbitrum' },
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        balance: { raw: 2000000000n, formatted: '2000 USDC' },
        needsApproval: true,
      };

      const result = explainer.explainPreview(preview);

      expect(result).toContain('Token approval will be required');
    });
  });

  describe('explainResult', () => {
    it('should explain a bridge result', () => {
      const result: UnifiedBridgeResult = {
        success: true,
        protocol: 'CCTP',
        trackingId: 'track-123',
        sourceTxHash: '0xabc123' as Hash,
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        fee: { raw: 1000000n, formatted: '1 USDC', usd: 1.0 },
        sourceChain: { id: 1, name: 'Ethereum' },
        destinationChain: { id: 42161, name: 'Arbitrum' },
        recipient: '0xRecipient' as Address,
        estimatedTime: '~15 minutes',
        summary: 'Bridge summary',
        protocolData: {},
      };

      const explanation = explainer.explainResult(result);

      expect(explanation).toContain('Bridge Initiated Successfully');
      expect(explanation).toContain('Protocol: CCTP');
      expect(explanation).toContain('Amount: 1000 USDC');
      expect(explanation).toContain('Ethereum -> Arbitrum');
      expect(explanation).toContain('Tracking ID: track-123');
      expect(explanation).toContain('Source TX: 0xabc123');
    });
  });

  describe('explainStatus', () => {
    it('should explain pending burn status', () => {
      const status: UnifiedBridgeStatus = {
        trackingId: 'track-123',
        protocol: 'CCTP',
        status: 'pending_burn',
        sourceTxHash: '0xabc' as Hash,
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        progress: 10,
        message: 'Pending',
        updatedAt: new Date(),
      };

      const result = explainer.explainStatus(status);

      expect(result).toContain('Bridge Status: track-123');
      expect(result).toContain('Waiting for burn transaction');
      expect(result).toContain('Progress: 10%');
    });

    it('should explain completed status', () => {
      const status: UnifiedBridgeStatus = {
        trackingId: 'track-123',
        protocol: 'CCTP',
        status: 'completed',
        sourceTxHash: '0xabc' as Hash,
        destinationTxHash: '0xdef' as Hash,
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        progress: 100,
        message: 'Complete',
        updatedAt: new Date(),
      };

      const result = explainer.explainStatus(status);

      expect(result).toContain('complete');
      expect(result).toContain('Destination TX: 0xdef');
    });

    it('should explain status with error', () => {
      const status: UnifiedBridgeStatus = {
        trackingId: 'track-123',
        protocol: 'CCTP',
        status: 'failed',
        sourceTxHash: '0xabc' as Hash,
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        progress: 0,
        message: 'Failed',
        updatedAt: new Date(),
        error: 'Attestation service unavailable',
      };

      const result = explainer.explainStatus(status);

      expect(result).toContain('failed');
      expect(result).toContain('Error: Attestation service unavailable');
    });

    it('should handle unknown status gracefully', () => {
      const status: UnifiedBridgeStatus = {
        trackingId: 'track-123',
        protocol: 'CCTP',
        status: 'unknown_status' as UnifiedBridgeStatus['status'],
        sourceTxHash: '0xabc' as Hash,
        amount: { raw: 1000000000n, formatted: '1000 USDC' },
        progress: 50,
        message: 'Unknown',
        updatedAt: new Date(),
      };

      const result = explainer.explainStatus(status);

      expect(result).toContain('unknown_status');
    });
  });

  describe('explainProtocol', () => {
    it('should explain a protocol with attestation model', () => {
      const info: BridgeProtocolInfo = {
        name: 'CCTP',
        displayName: 'Circle CCTP',
        supportedTokens: ['USDC'],
        typicalSpeed: 'standard',
        finalityModel: 'attestation',
        hasProtocolFees: false,
      };

      const result = explainer.explainProtocol(info);

      expect(result).toContain('Circle CCTP (CCTP)');
      expect(result).toContain('Supported tokens: USDC');
      expect(result).toContain('external attestation');
      expect(result).toContain('Standard transfers');
      expect(result).toContain('No (gas only)');
    });

    it('should explain different speed levels', () => {
      const fastProtocol: BridgeProtocolInfo = {
        name: 'Fast',
        displayName: 'Fast Bridge',
        supportedTokens: ['USDC'],
        typicalSpeed: 'fast',
        finalityModel: 'optimistic',
        hasProtocolFees: true,
      };

      const result = explainer.explainProtocol(fastProtocol);

      expect(result).toContain('Fast transfers (1-5 minutes)');
      expect(result).toContain('Assumes valid unless challenged');
      expect(result).toContain('Protocol fees: Yes');
    });
  });

  describe('explainPreferences', () => {
    it('should explain available preference options', () => {
      const result = explainer.explainPreferences();

      expect(result).toContain('Route Preferences');
      expect(result).toContain('cost');
      expect(result).toContain('speed');
      expect(result).toContain('reliability');
      expect(result).toContain('maxFeeUSD');
      expect(result).toContain('maxTimeMinutes');
      expect(result).toContain('preferredProtocols');
      expect(result).toContain('excludeProtocols');
    });
  });

  describe('suggestFix', () => {
    it('should suggest fix for BRIDGE_NO_ROUTE', () => {
      const result = explainer.suggestFix({
        code: 'BRIDGE_NO_ROUTE',
        message: 'No route found',
      });

      expect(result).toContain('different token');
      expect(result).toContain('USDC');
    });

    it('should suggest fix for BRIDGE_ATTESTATION_TIMEOUT', () => {
      const result = explainer.suggestFix({
        code: 'BRIDGE_ATTESTATION_TIMEOUT',
        message: 'Timeout',
      });

      expect(result).toContain('funds are safe');
      expect(result).toContain('wait longer');
    });

    it('should provide generic suggestion for unknown errors', () => {
      const result = explainer.suggestFix({
        code: 'UNKNOWN_ERROR',
        message: 'Something went wrong',
      });

      expect(result).toContain('Something went wrong');
      expect(result).toContain('try again');
    });

    it('should suggest fix for BRIDGE_SAME_CHAIN', () => {
      const result = explainer.suggestFix({
        code: 'BRIDGE_SAME_CHAIN',
        message: 'Same chain',
      });

      expect(result).toContain('regular transfer');
    });
  });

  describe('createExplainer', () => {
    it('should create an ExplainBridge instance', () => {
      const instance = createExplainer();

      expect(instance).toBeInstanceOf(ExplainBridge);
    });
  });
});

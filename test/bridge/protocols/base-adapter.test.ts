import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Hex } from '../../../src/core/types.js';
import type {
  BridgeProtocolInfo,
  BridgeRequest,
  BridgeQuote,
  BridgeInitResult,
  BridgeStatusResult,
} from '../../../src/bridge/types.js';
import { BaseBridgeAdapter, type BaseAdapterConfig } from '../../../src/bridge/protocols/base-adapter.js';

// Mock RPC Client
const createMockRpc = (chainId = 1) => ({
  getChainId: vi.fn().mockResolvedValue(chainId),
  getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
});

// Mock Account
const createMockAccount = () => ({
  address: '0x1234567890123456789012345678901234567890' as const,
  sign: vi.fn(),
  signMessage: vi.fn(),
  signTypedData: vi.fn(),
});

// Concrete implementation for testing
class TestBridgeAdapter extends BaseBridgeAdapter {
  readonly info: BridgeProtocolInfo = {
    name: 'TestBridge',
    displayName: 'Test Bridge Protocol',
    supportedTokens: ['USDC', 'USDT'] as const,
    typicalSpeed: 'fast',
    finalityModel: 'attestation',
    hasProtocolFees: false,
  };

  getSupportedChains(): number[] {
    return [1, 42161, 8453];
  }

  isRouteSupported(sourceChainId: number, destChainId: number, token: string): boolean {
    return sourceChainId !== destChainId && this.supportedTokens.includes(token);
  }

  getEstimatedTime(): string {
    return '10-15 minutes';
  }

  async getQuote(_request: BridgeRequest): Promise<BridgeQuote> {
    return {
      protocol: this.name,
      inputAmount: 100000000n,
      outputAmount: 100000000n,
      fee: { protocol: 0n, gas: 100000n, totalUSD: 0.1 },
      estimatedTime: { minSeconds: 600, maxSeconds: 900, display: '10-15 min' },
      route: { description: 'Test route' },
    };
  }

  async estimateFees(_request: BridgeRequest): Promise<{ protocolFee: bigint; gasFee: bigint }> {
    return { protocolFee: 0n, gasFee: 100000n };
  }

  async initiateBridge(_request: BridgeRequest): Promise<BridgeInitResult> {
    return {
      success: true,
      burnTxHash: '0xabc' as Hex,
      messageHash: '0xdef' as Hex,
    };
  }

  async getStatus(_messageHash: Hex): Promise<BridgeStatusResult> {
    return {
      status: 'attestation_pending',
      messageHash: _messageHash,
      updatedAt: new Date(),
    };
  }

  async waitForAttestation(_messageHash: Hex): Promise<Hex> {
    return '0xattestation' as Hex;
  }

  // Expose protected methods for testing
  public testFormatTimeEstimate(minSeconds: number, maxSeconds: number): string {
    return this.formatTimeEstimate(minSeconds, maxSeconds);
  }

  public testCreateRouteDescription(
    sourceChainName: string,
    destChainName: string,
    token: string
  ): string {
    return this.createRouteDescription(sourceChainName, destChainName, token);
  }

  public async testGetSourceChainId(): Promise<number> {
    return this.getSourceChainId();
  }
}

describe('BaseBridgeAdapter', () => {
  let adapter: TestBridgeAdapter;
  let mockRpc: ReturnType<typeof createMockRpc>;
  let mockAccount: ReturnType<typeof createMockAccount>;

  beforeEach(() => {
    mockRpc = createMockRpc();
    mockAccount = createMockAccount();
    adapter = new TestBridgeAdapter({
      sourceRpc: mockRpc as unknown as BaseAdapterConfig['sourceRpc'],
      account: mockAccount as unknown as BaseAdapterConfig['account'],
    });
  });

  describe('name getter', () => {
    it('should return protocol name from info', () => {
      expect(adapter.name).toBe('TestBridge');
    });
  });

  describe('supportedTokens getter', () => {
    it('should return supported tokens from info', () => {
      expect(adapter.supportedTokens).toContain('USDC');
      expect(adapter.supportedTokens).toContain('USDT');
    });
  });

  describe('getSourceChainId', () => {
    it('should fetch and cache chain ID', async () => {
      const chainId = await adapter.testGetSourceChainId();
      expect(chainId).toBe(1);
      expect(mockRpc.getChainId).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const chainId2 = await adapter.testGetSourceChainId();
      expect(chainId2).toBe(1);
      expect(mockRpc.getChainId).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAvailable', () => {
    it('should return true when RPC is accessible', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when RPC throws', async () => {
      mockRpc.getChainId.mockRejectedValue(new Error('RPC error'));
      const freshAdapter = new TestBridgeAdapter({
        sourceRpc: mockRpc as unknown as BaseAdapterConfig['sourceRpc'],
        account: mockAccount as unknown as BaseAdapterConfig['account'],
      });

      const available = await freshAdapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('getReliabilityScore', () => {
    it('should return default score of 80', () => {
      expect(adapter.getReliabilityScore()).toBe(80);
    });
  });

  describe('formatTimeEstimate', () => {
    it('should format seconds correctly', () => {
      expect(adapter.testFormatTimeEstimate(30, 30)).toBe('~30 seconds');
      expect(adapter.testFormatTimeEstimate(45, 45)).toBe('~45 seconds');
    });

    it('should format single minute correctly', () => {
      expect(adapter.testFormatTimeEstimate(60, 60)).toBe('~1 minute');
    });

    it('should format minutes correctly', () => {
      expect(adapter.testFormatTimeEstimate(120, 120)).toBe('~2 minutes');
      expect(adapter.testFormatTimeEstimate(300, 300)).toBe('~5 minutes');
    });

    it('should format single hour correctly', () => {
      expect(adapter.testFormatTimeEstimate(3600, 3600)).toBe('~1 hour');
    });

    it('should format hours correctly', () => {
      expect(adapter.testFormatTimeEstimate(7200, 7200)).toBe('~2 hours');
    });

    it('should format minute ranges', () => {
      expect(adapter.testFormatTimeEstimate(600, 900)).toBe('10-15 minutes');
      expect(adapter.testFormatTimeEstimate(120, 300)).toBe('2-5 minutes');
    });

    it('should format mixed ranges', () => {
      expect(adapter.testFormatTimeEstimate(30, 120)).toBe('30 seconds - 2 minutes');
      expect(adapter.testFormatTimeEstimate(1800, 7200)).toBe('30 minutes - 2 hours');
    });
  });

  describe('createRouteDescription', () => {
    it('should create route description', () => {
      const description = adapter.testCreateRouteDescription('Ethereum', 'Arbitrum', 'USDC');
      expect(description).toBe('USDC via Test Bridge Protocol: Ethereum -> Arbitrum');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { anthropicTools, type AnthropicTool, type AnthropicToolsAdapter } from '../../src/integrations/anthropic.js';
import type { AgentWallet } from '../../src/agent/wallet.js';
import type { Address } from '../../src/core/types.js';

describe('Anthropic Integration', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;

  let mockWallet: AgentWallet;
  let adapter: AnthropicToolsAdapter;

  beforeEach(() => {
    mockWallet = {
      address: testAddress,
      getBalance: vi.fn().mockResolvedValue({
        wei: 1000000000000000000n,
        eth: '1.0',
        formatted: '1.0 ETH',
      }),
      getTokenBalance: vi.fn(),
      getLimits: vi.fn().mockReturnValue({
        perTransaction: { limit: '10', used: '0', remaining: '10' },
        hourly: { limit: '100', used: '5', remaining: '95' },
        daily: { limit: '1000', used: '50', remaining: '950' },
      }),
      getCapabilities: vi.fn().mockReturnValue({
        address: testAddress,
        agentId: 'test',
        network: { chainId: 1 },
        limits: {},
        operations: ['send'],
      }),
      send: vi.fn(),
      transferToken: vi.fn(),
      preview: vi.fn(),
    } as unknown as AgentWallet;

    adapter = anthropicTools(mockWallet);
  });

  describe('anthropicTools', () => {
    it('creates adapter with definitions', () => {
      expect(adapter).toBeDefined();
      expect(adapter.definitions).toBeDefined();
      expect(Array.isArray(adapter.definitions)).toBe(true);
    });

    it('formats tools for Anthropic', () => {
      const tool = adapter.definitions[0];

      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('input_schema');
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema).toHaveProperty('properties');
      expect(tool.input_schema).toHaveProperty('required');
    });

    it('includes all expected tools', () => {
      const toolNames = adapter.definitions.map((t) => t.name);

      expect(toolNames).toContain('eth_getBalance');
      expect(toolNames).toContain('eth_send');
      expect(toolNames).toContain('eth_preview');
    });
  });

  describe('execute', () => {
    it('executes tool by name', async () => {
      const result = await adapter.execute('eth_getBalance', {});

      expect(result.success).toBe(true);
      expect(result.summary).toContain('1.0 ETH');
    });

    it('returns error for unknown tool', async () => {
      const result = await adapter.execute('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('passes parameters to tool', async () => {
      const recipient = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
      await adapter.execute('eth_getBalance', { address: recipient });

      expect(mockWallet.getBalance).toHaveBeenCalledWith(recipient);
    });
  });

  describe('getToolNames', () => {
    it('returns list of tool names', () => {
      const names = adapter.getToolNames();

      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('eth_getBalance');
    });
  });

  describe('tool format compatibility', () => {
    it('produces valid Anthropic tool format', () => {
      for (const tool of adapter.definitions) {
        // Check required Anthropic fields
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe('string');
        expect(tool.description.length).toBeGreaterThan(0);
        expect(tool.input_schema.type).toBe('object');
        expect(typeof tool.input_schema.properties).toBe('object');
        expect(Array.isArray(tool.input_schema.required)).toBe(true);
      }
    });
  });
});

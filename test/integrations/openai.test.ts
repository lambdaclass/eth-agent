import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openaiTools, type OpenAITool, type OpenAIToolsAdapter } from '../../src/integrations/openai.js';
import type { AgentWallet } from '../../src/agent/wallet.js';
import type { Address } from '../../src/core/types.js';

describe('OpenAI Integration', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;

  let mockWallet: AgentWallet;
  let adapter: OpenAIToolsAdapter;

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

    adapter = openaiTools(mockWallet);
  });

  describe('openaiTools', () => {
    it('creates adapter with definitions', () => {
      expect(adapter).toBeDefined();
      expect(adapter.definitions).toBeDefined();
      expect(Array.isArray(adapter.definitions)).toBe(true);
    });

    it('formats tools for OpenAI', () => {
      const tool = adapter.definitions[0];

      expect(tool.type).toBe('function');
      expect(tool.function).toBeDefined();
      expect(tool.function.name).toBeDefined();
      expect(tool.function.description).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
      expect(tool.function.parameters.type).toBe('object');
    });

    it('includes all expected tools', () => {
      const toolNames = adapter.definitions.map((t) => t.function.name);

      expect(toolNames).toContain('eth_getBalance');
      expect(toolNames).toContain('eth_send');
      expect(toolNames).toContain('eth_preview');
    });
  });

  describe('execute', () => {
    it('executes tool with object params', async () => {
      const result = await adapter.execute('eth_getBalance', {});

      expect(result.success).toBe(true);
      expect(result.summary).toContain('1.0 ETH');
    });

    it('executes tool with JSON string params', async () => {
      const result = await adapter.execute('eth_getBalance', '{}');

      expect(result.success).toBe(true);
    });

    it('parses JSON arguments from OpenAI format', async () => {
      const recipient = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      const jsonArgs = JSON.stringify({ address: recipient });

      await adapter.execute('eth_getBalance', jsonArgs);

      expect(mockWallet.getBalance).toHaveBeenCalledWith(recipient);
    });

    it('returns error for unknown tool', async () => {
      const result = await adapter.execute('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
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
    it('produces valid OpenAI function calling format', () => {
      for (const tool of adapter.definitions) {
        // Check required OpenAI fields
        expect(tool.type).toBe('function');
        expect(typeof tool.function.name).toBe('string');
        expect(tool.function.name.length).toBeGreaterThan(0);
        expect(typeof tool.function.description).toBe('string');
        expect(tool.function.parameters.type).toBe('object');
        expect(typeof tool.function.parameters.properties).toBe('object');
        expect(Array.isArray(tool.function.parameters.required)).toBe(true);
      }
    });
  });
});

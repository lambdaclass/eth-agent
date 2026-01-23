import { describe, it, expect, vi, beforeEach } from 'vitest';
import { langchainTools, createDynamicTool, type LangChainTool, type LangChainToolsAdapter } from '../../src/integrations/langchain.js';
import type { AgentWallet } from '../../src/agent/wallet.js';
import type { Address } from '../../src/core/types.js';
import { createTools } from '../../src/integrations/tools.js';

describe('LangChain Integration', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;

  let mockWallet: AgentWallet;
  let adapter: LangChainToolsAdapter;

  beforeEach(() => {
    mockWallet = {
      address: testAddress,
      // Note: Use string instead of BigInt for JSON serialization in LangChain
      getBalance: vi.fn().mockResolvedValue({
        wei: '1000000000000000000',
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

    adapter = langchainTools(mockWallet);
  });

  describe('langchainTools', () => {
    it('creates adapter with tools', () => {
      expect(adapter).toBeDefined();
      expect(adapter.tools).toBeDefined();
      expect(Array.isArray(adapter.tools)).toBe(true);
    });

    it('formats tools for LangChain', () => {
      const tool = adapter.tools[0];

      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.schema).toBeDefined();
      expect(tool.schema.type).toBe('object');
      expect(tool.call).toBeTypeOf('function');
    });

    it('includes all expected tools', () => {
      const toolNames = adapter.tools.map((t) => t.name);

      expect(toolNames).toContain('eth_getBalance');
      expect(toolNames).toContain('eth_send');
      expect(toolNames).toContain('eth_preview');
    });
  });

  describe('asLangChainTools', () => {
    it('returns the same tools array', () => {
      const tools = adapter.asLangChainTools();

      expect(tools).toBe(adapter.tools);
      expect(Array.isArray(tools)).toBe(true);
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

  describe('tool.call', () => {
    it('calls tool and returns JSON string', async () => {
      const tool = adapter.tools.find((t) => t.name === 'eth_getBalance')!;
      const result = await tool.call({});

      expect(typeof result).toBe('string');

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('1.0 ETH');
    });

    it('includes all result fields in JSON', async () => {
      const tool = adapter.tools.find((t) => t.name === 'eth_getBalance')!;
      const result = await tool.call({});
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('data');
    });

    it('passes input to underlying handler', async () => {
      const tool = adapter.tools.find((t) => t.name === 'eth_getBalance')!;
      const recipient = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

      await tool.call({ address: recipient });

      expect(mockWallet.getBalance).toHaveBeenCalledWith(recipient);
    });

    it('handles errors gracefully', async () => {
      mockWallet.getBalance = vi.fn().mockRejectedValue(new Error('RPC error'));

      const tool = adapter.tools.find((t) => t.name === 'eth_getBalance')!;
      const result = await tool.call({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('RPC error');
    });
  });

  describe('createDynamicTool', () => {
    it('creates dynamic tool from tool definition', () => {
      const tools = createTools(mockWallet);
      const balanceTool = tools.find((t) => t.name === 'eth_getBalance')!;
      const dynamicTool = createDynamicTool(balanceTool);

      expect(dynamicTool.name).toBe('eth_getBalance');
      expect(dynamicTool.description).toBeTruthy();
      expect(dynamicTool.schema).toBeDefined();
      expect(dynamicTool.func).toBeTypeOf('function');
    });

    it('func returns summary string', async () => {
      const tools = createTools(mockWallet);
      const balanceTool = tools.find((t) => t.name === 'eth_getBalance')!;
      const dynamicTool = createDynamicTool(balanceTool);

      const result = await dynamicTool.func({});

      expect(typeof result).toBe('string');
      expect(result).toContain('1.0 ETH');
    });

    it('func passes input to handler', async () => {
      const tools = createTools(mockWallet);
      const balanceTool = tools.find((t) => t.name === 'eth_getBalance')!;
      const dynamicTool = createDynamicTool(balanceTool);
      const recipient = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

      await dynamicTool.func({ address: recipient });

      expect(mockWallet.getBalance).toHaveBeenCalledWith(recipient);
    });
  });

  describe('tool format compatibility', () => {
    it('produces valid LangChain tool format', () => {
      for (const tool of adapter.tools) {
        // Check required LangChain fields
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe('string');
        expect(tool.schema.type).toBe('object');
        expect(typeof tool.call).toBe('function');
      }
    });
  });
});

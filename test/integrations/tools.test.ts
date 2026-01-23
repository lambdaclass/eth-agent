import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTools, getTool, executeTool, type ToolDefinition } from '../../src/integrations/tools.js';
import type { AgentWallet } from '../../src/agent/wallet.js';
import type { Address } from '../../src/core/types.js';

describe('Tools', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const recipient = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;

  let mockWallet: AgentWallet;
  let tools: ToolDefinition[];

  beforeEach(() => {
    mockWallet = {
      address: testAddress,
      getBalance: vi.fn(),
      getTokenBalance: vi.fn(),
      getLimits: vi.fn(),
      getCapabilities: vi.fn(),
      send: vi.fn(),
      transferToken: vi.fn(),
      preview: vi.fn(),
    } as unknown as AgentWallet;

    tools = createTools(mockWallet);
  });

  describe('createTools', () => {
    it('creates all expected tools', () => {
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('eth_getBalance');
      expect(toolNames).toContain('eth_getTokenBalance');
      expect(toolNames).toContain('eth_getLimits');
      expect(toolNames).toContain('eth_getCapabilities');
      expect(toolNames).toContain('eth_send');
      expect(toolNames).toContain('eth_transferToken');
      expect(toolNames).toContain('eth_preview');
    });

    it('tools have correct metadata structure', () => {
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.parameters.type).toBe('object');
        expect(tool.handler).toBeTypeOf('function');
        expect(tool.metadata.category).toMatch(/^(read|write|info)$/);
        expect(typeof tool.metadata.requiresApproval).toBe('boolean');
        expect(tool.metadata.riskLevel).toMatch(/^(none|low|medium|high)$/);
      }
    });
  });

  describe('eth_getBalance tool', () => {
    it('gets wallet balance', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue({
        wei: 1000000000000000000n,
        eth: '1.0',
        formatted: '1.0 ETH',
      });

      const tool = getTool(tools, 'eth_getBalance')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        wei: 1000000000000000000n,
        eth: '1.0',
        formatted: '1.0 ETH',
      });
      expect(result.summary).toContain('1.0 ETH');
      expect(mockWallet.getBalance).toHaveBeenCalledWith(undefined);
    });

    it('gets balance for specific address', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue({
        wei: 500000000000000000n,
        eth: '0.5',
        formatted: '0.5 ETH',
      });

      const tool = getTool(tools, 'eth_getBalance')!;
      await tool.handler({ address: recipient });

      expect(mockWallet.getBalance).toHaveBeenCalledWith(recipient);
    });

    it('handles error', async () => {
      vi.mocked(mockWallet.getBalance).mockRejectedValue(new Error('RPC error'));

      const tool = getTool(tools, 'eth_getBalance')!;
      const result = await tool.handler({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('RPC error');
      expect(result.summary).toContain('Failed');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getBalance')!;

      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  describe('eth_getTokenBalance tool', () => {
    it('gets token balance', async () => {
      vi.mocked(mockWallet.getTokenBalance).mockResolvedValue({
        raw: 1000000n,
        formatted: '1.0',
        symbol: 'USDC',
        decimals: 6,
      });

      const tool = getTool(tools, 'eth_getTokenBalance')!;
      const result = await tool.handler({ token: testAddress });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        raw: 1000000n,
        formatted: '1.0',
        symbol: 'USDC',
        decimals: 6,
      });
      expect(result.summary).toContain('1.0 USDC');
    });

    it('gets token balance for specific address', async () => {
      vi.mocked(mockWallet.getTokenBalance).mockResolvedValue({
        raw: 500000n,
        formatted: '0.5',
        symbol: 'DAI',
        decimals: 18,
      });

      const tool = getTool(tools, 'eth_getTokenBalance')!;
      await tool.handler({ token: testAddress, address: recipient });

      expect(mockWallet.getTokenBalance).toHaveBeenCalledWith(testAddress, recipient);
    });

    it('handles error', async () => {
      vi.mocked(mockWallet.getTokenBalance).mockRejectedValue(new Error('Invalid token'));

      const tool = getTool(tools, 'eth_getTokenBalance')!;
      const result = await tool.handler({ token: testAddress });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });

  describe('eth_getLimits tool', () => {
    it('gets spending limits', async () => {
      vi.mocked(mockWallet.getLimits).mockReturnValue({
        perTransaction: { limit: '10', used: '0', remaining: '10' },
        hourly: { limit: '100', used: '5', remaining: '95' },
        daily: { limit: '1000', used: '50', remaining: '950' },
      });

      const tool = getTool(tools, 'eth_getLimits')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Daily remaining: 950 ETH');
      expect(result.summary).toContain('Hourly remaining: 95 ETH');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getLimits')!;

      expect(tool.metadata.category).toBe('info');
      expect(tool.metadata.requiresApproval).toBe(false);
    });
  });

  describe('eth_getCapabilities tool', () => {
    it('gets wallet capabilities', async () => {
      vi.mocked(mockWallet.getCapabilities).mockReturnValue({
        address: testAddress,
        agentId: 'test-agent',
        network: { chainId: 1 },
        limits: {} as any,
        operations: ['send', 'getBalance'],
      });

      const tool = getTool(tools, 'eth_getCapabilities')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.summary).toContain(testAddress);
      expect(result.summary).toContain('chain 1');
    });
  });

  describe('eth_send tool', () => {
    it('sends ETH', async () => {
      vi.mocked(mockWallet.send).mockResolvedValue({
        success: true,
        hash: '0x1234' as any,
        summary: 'Sent 0.1 ETH to recipient',
        transaction: {} as any,
        wallet: {} as any,
        limits: {} as any,
      });

      const tool = getTool(tools, 'eth_send')!;
      const result = await tool.handler({ to: recipient, amount: '0.1 ETH' });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Sent');
      expect(mockWallet.send).toHaveBeenCalledWith({
        to: recipient,
        amount: '0.1 ETH',
      });
    });

    it('handles send error', async () => {
      vi.mocked(mockWallet.send).mockRejectedValue(new Error('Insufficient funds'));

      const tool = getTool(tools, 'eth_send')!;
      const result = await tool.handler({ to: recipient, amount: '100 ETH' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient funds');
      expect(result.summary).toContain('Failed to send');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_send')!;

      expect(tool.metadata.category).toBe('write');
      expect(tool.metadata.requiresApproval).toBe(true);
      expect(tool.metadata.riskLevel).toBe('high');
    });

    it('has required parameters', () => {
      const tool = getTool(tools, 'eth_send')!;

      expect(tool.parameters.required).toContain('to');
      expect(tool.parameters.required).toContain('amount');
    });
  });

  describe('eth_transferToken tool', () => {
    it('transfers tokens', async () => {
      vi.mocked(mockWallet.transferToken).mockResolvedValue({
        success: true,
        hash: '0x5678' as any,
        summary: 'Transferred 100 USDC',
        transaction: {} as any,
        wallet: {} as any,
        limits: {} as any,
      });

      const tool = getTool(tools, 'eth_transferToken')!;
      const result = await tool.handler({
        token: testAddress,
        to: recipient,
        amount: '100',
      });

      expect(result.success).toBe(true);
      expect(mockWallet.transferToken).toHaveBeenCalledWith({
        token: testAddress,
        to: recipient,
        amount: '100',
      });
    });

    it('handles transfer error', async () => {
      vi.mocked(mockWallet.transferToken).mockRejectedValue(new Error('Allowance exceeded'));

      const tool = getTool(tools, 'eth_transferToken')!;
      const result = await tool.handler({
        token: testAddress,
        to: recipient,
        amount: '1000000',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Allowance exceeded');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_transferToken')!;

      expect(tool.metadata.category).toBe('write');
      expect(tool.metadata.requiresApproval).toBe(true);
      expect(tool.metadata.riskLevel).toBe('high');
    });
  });

  describe('eth_preview tool', () => {
    it('previews transaction that can execute', async () => {
      vi.mocked(mockWallet.preview).mockResolvedValue({
        canExecute: true,
        blockers: [],
        costs: {
          value: { wei: 100000000000000000n, eth: '0.1' },
          gas: { wei: 1000000000000000n, eth: '0.001' },
          total: { wei: 101000000000000000n, eth: '0.101' },
        },
        simulation: { success: true },
      });

      const tool = getTool(tools, 'eth_preview')!;
      const result = await tool.handler({ to: recipient, amount: '0.1 ETH' });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Can execute');
      expect(result.summary).toContain('0.101 ETH');
    });

    it('previews transaction that cannot execute', async () => {
      vi.mocked(mockWallet.preview).mockResolvedValue({
        canExecute: false,
        blockers: ['Insufficient funds', 'Address blocked'],
        costs: {
          value: { wei: 100000000000000000000n, eth: '100' },
          gas: { wei: 1000000000000000n, eth: '0.001' },
          total: { wei: 100001000000000000000n, eth: '100.001' },
        },
        simulation: { success: false, error: 'Insufficient funds' },
      });

      const tool = getTool(tools, 'eth_preview')!;
      const result = await tool.handler({ to: recipient, amount: '100 ETH' });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Cannot execute');
      expect(result.summary).toContain('Insufficient funds');
    });

    it('handles preview error', async () => {
      vi.mocked(mockWallet.preview).mockRejectedValue(new Error('Invalid address'));

      const tool = getTool(tools, 'eth_preview')!;
      const result = await tool.handler({ to: 'invalid', amount: '0.1 ETH' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid address');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_preview')!;

      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  describe('getTool', () => {
    it('finds tool by name', () => {
      const tool = getTool(tools, 'eth_getBalance');

      expect(tool).toBeDefined();
      expect(tool!.name).toBe('eth_getBalance');
    });

    it('returns undefined for unknown tool', () => {
      const tool = getTool(tools, 'unknown_tool');

      expect(tool).toBeUndefined();
    });
  });

  describe('executeTool', () => {
    it('executes tool by name', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue({
        wei: 1000000000000000000n,
        eth: '1.0',
        formatted: '1.0 ETH',
      });

      const result = await executeTool(tools, 'eth_getBalance', {});

      expect(result.success).toBe(true);
    });

    it('returns error for unknown tool', async () => {
      const result = await executeTool(tools, 'unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown tool: unknown_tool');
      expect(result.summary).toContain('not found');
    });
  });

  describe('eth_swap tool', () => {
    beforeEach(() => {
      (mockWallet as any).swap = vi.fn();
      (mockWallet as any).getSwapQuote = vi.fn();
      (mockWallet as any).getSwapLimits = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_swap');
    });

    it('has correct parameters schema', () => {
      const tool = getTool(tools, 'eth_swap');
      expect(tool).toBeDefined();
      expect(tool!.parameters.properties).toHaveProperty('fromToken');
      expect(tool!.parameters.properties).toHaveProperty('toToken');
      expect(tool!.parameters.properties).toHaveProperty('amount');
      expect(tool!.parameters.properties).toHaveProperty('slippageTolerance');
      expect(tool!.parameters.required).toContain('fromToken');
      expect(tool!.parameters.required).toContain('toToken');
      expect(tool!.parameters.required).toContain('amount');
    });

    it('executes swap via wallet', async () => {
      (mockWallet as any).swap.mockResolvedValue({
        success: true,
        hash: '0xabc123',
        summary: 'Swapped 100 USDC for 0.04 ETH',
        swap: {
          tokenIn: { symbol: 'USDC', amount: '100' },
          tokenOut: { symbol: 'ETH', amount: '0.04' },
        },
      });

      const tool = getTool(tools, 'eth_swap')!;
      const result = await tool.handler({
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: '100',
      });

      expect(result.success).toBe(true);
      expect((mockWallet as any).swap).toHaveBeenCalledWith({
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: '100',
        slippageTolerance: undefined,
      });
    });

    it('passes slippage tolerance', async () => {
      (mockWallet as any).swap.mockResolvedValue({
        success: true,
        hash: '0xabc123',
        summary: 'Swapped',
      });

      const tool = getTool(tools, 'eth_swap')!;
      await tool.handler({
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: '100',
        slippageTolerance: 0.5,
      });

      expect((mockWallet as any).swap).toHaveBeenCalledWith({
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: '100',
        slippageTolerance: 0.5,
      });
    });

    it('handles errors properly', async () => {
      (mockWallet as any).swap.mockRejectedValue(new Error('Insufficient liquidity'));

      const tool = getTool(tools, 'eth_swap')!;
      const result = await tool.handler({
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: '100',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient liquidity');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_swap')!;
      expect(tool.metadata.category).toBe('write');
      expect(tool.metadata.riskLevel).toBe('high');
    });
  });

  describe('eth_getSwapQuote tool', () => {
    beforeEach(() => {
      (mockWallet as any).getSwapQuote = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_getSwapQuote');
    });

    it('returns quote from wallet', async () => {
      (mockWallet as any).getSwapQuote.mockResolvedValue({
        fromToken: { symbol: 'USDC', amount: '100' },
        toToken: { symbol: 'ETH', amount: '0.04' },
        amountOutMinimum: '0.0398',
        priceImpact: 0.05,
        route: 'USDC -> WETH -> ETH',
      });

      const tool = getTool(tools, 'eth_getSwapQuote')!;
      const result = await tool.handler({
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: '100',
      });

      expect(result.success).toBe(true);
      expect(result.data.fromToken.symbol).toBe('USDC');
      expect(result.data.toToken.symbol).toBe('ETH');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getSwapQuote')!;
      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  describe('eth_getSwapLimits tool', () => {
    beforeEach(() => {
      (mockWallet as any).getSwapLimits = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_getSwapLimits');
    });

    it('returns swap limits', async () => {
      (mockWallet as any).getSwapLimits.mockReturnValue({
        perTransaction: { limit: '1000', unit: 'USD' },
        daily: { limit: '10000', used: '500', remaining: '9500', unit: 'USD' },
        maxSlippagePercent: 1,
        maxPriceImpactPercent: 5,
        allowedTokens: ['ETH', 'USDC'],
      });

      const tool = getTool(tools, 'eth_getSwapLimits')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.data.perTransaction.limit).toBe('1000');
      expect(result.data.maxSlippagePercent).toBe(1);
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getSwapLimits')!;
      expect(tool.metadata.category).toBe('info');
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });
});

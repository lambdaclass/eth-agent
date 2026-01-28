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

      // Core tools
      expect(toolNames).toContain('eth_getBalance');
      expect(toolNames).toContain('eth_getTokenBalance');
      expect(toolNames).toContain('eth_getLimits');
      expect(toolNames).toContain('eth_getCapabilities');
      expect(toolNames).toContain('eth_send');
      expect(toolNames).toContain('eth_transferToken');
      expect(toolNames).toContain('eth_preview');

      // Swap tools
      expect(toolNames).toContain('eth_swap');
      expect(toolNames).toContain('eth_getSwapQuote');
      expect(toolNames).toContain('eth_getSwapLimits');

      // Stablecoin tools
      expect(toolNames).toContain('eth_sendStablecoin');
      expect(toolNames).toContain('eth_getStablecoinBalance');
      expect(toolNames).toContain('eth_getStablecoinBalances');

      // Bridge tools
      expect(toolNames).toContain('eth_bridge');
      expect(toolNames).toContain('eth_previewBridge');
      expect(toolNames).toContain('eth_compareBridgeRoutes');
      expect(toolNames).toContain('eth_getBridgeStatus');
      expect(toolNames).toContain('eth_getBridgeLimits');
      expect(toolNames).toContain('eth_getStablecoinBalanceOnChain');
    });

    it('creates the correct number of tools', () => {
      // 7 core + 3 swap + 3 stablecoin + 8 bridge (incl. fast CCTP tools) = 21 tools
      expect(tools.length).toBe(21);
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

  // === Stablecoin Tools Tests ===

  describe('eth_sendStablecoin tool', () => {
    beforeEach(() => {
      (mockWallet as any).sendStablecoin = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_sendStablecoin');
    });

    it('has correct parameters schema', () => {
      const tool = getTool(tools, 'eth_sendStablecoin');
      expect(tool).toBeDefined();
      expect(tool!.parameters.properties).toHaveProperty('token');
      expect(tool!.parameters.properties).toHaveProperty('to');
      expect(tool!.parameters.properties).toHaveProperty('amount');
      expect(tool!.parameters.required).toContain('token');
      expect(tool!.parameters.required).toContain('to');
      expect(tool!.parameters.required).toContain('amount');
      // Check enum values for token
      expect(tool!.parameters.properties['token'].enum).toContain('USDC');
      expect(tool!.parameters.properties['token'].enum).toContain('USDT');
      expect(tool!.parameters.properties['token'].enum).toContain('DAI');
    });

    it('sends stablecoin via wallet', async () => {
      (mockWallet as any).sendStablecoin.mockResolvedValue({
        success: true,
        hash: '0xabc123',
        summary: 'Sent 100 USDC to alice.eth. TX: 0xabc123',
        token: { symbol: 'USDC', amount: '100', rawAmount: 100000000n },
      });

      const tool = getTool(tools, 'eth_sendStablecoin')!;
      const result = await tool.handler({
        token: 'USDC',
        to: 'alice.eth',
        amount: '100',
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Sent 100 USDC');
      expect((mockWallet as any).sendStablecoin).toHaveBeenCalledWith({
        token: expect.objectContaining({ symbol: 'USDC' }),
        to: 'alice.eth',
        amount: '100',
      });
    });

    it('handles unknown stablecoin', async () => {
      const tool = getTool(tools, 'eth_sendStablecoin')!;
      const result = await tool.handler({
        token: 'UNKNOWN',
        to: 'alice.eth',
        amount: '100',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown stablecoin');
      expect((mockWallet as any).sendStablecoin).not.toHaveBeenCalled();
    });

    it('handles send error', async () => {
      (mockWallet as any).sendStablecoin.mockRejectedValue(new Error('Insufficient USDC balance'));

      const tool = getTool(tools, 'eth_sendStablecoin')!;
      const result = await tool.handler({
        token: 'USDC',
        to: 'alice.eth',
        amount: '1000000',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient USDC balance');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_sendStablecoin')!;
      expect(tool.metadata.category).toBe('write');
      expect(tool.metadata.requiresApproval).toBe(true);
      expect(tool.metadata.riskLevel).toBe('high');
    });
  });

  describe('eth_getStablecoinBalance tool', () => {
    beforeEach(() => {
      (mockWallet as any).getStablecoinBalance = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_getStablecoinBalance');
    });

    it('has correct parameters schema', () => {
      const tool = getTool(tools, 'eth_getStablecoinBalance');
      expect(tool).toBeDefined();
      expect(tool!.parameters.properties).toHaveProperty('token');
      expect(tool!.parameters.properties).toHaveProperty('address');
      expect(tool!.parameters.required).toContain('token');
      expect(tool!.parameters.required).not.toContain('address');
    });

    it('gets stablecoin balance', async () => {
      (mockWallet as any).getStablecoinBalance.mockResolvedValue({
        raw: 1000000000n,
        formatted: '1,000.00',
        symbol: 'USDC',
        decimals: 6,
      });

      const tool = getTool(tools, 'eth_getStablecoinBalance')!;
      const result = await tool.handler({ token: 'USDC' });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('1,000.00 USDC');
      expect((mockWallet as any).getStablecoinBalance).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'USDC' }),
        undefined
      );
    });

    it('gets balance for specific address', async () => {
      (mockWallet as any).getStablecoinBalance.mockResolvedValue({
        raw: 500000000n,
        formatted: '500.00',
        symbol: 'USDT',
        decimals: 6,
      });

      const tool = getTool(tools, 'eth_getStablecoinBalance')!;
      await tool.handler({ token: 'USDT', address: recipient });

      expect((mockWallet as any).getStablecoinBalance).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'USDT' }),
        recipient
      );
    });

    it('handles unknown stablecoin', async () => {
      const tool = getTool(tools, 'eth_getStablecoinBalance')!;
      const result = await tool.handler({ token: 'INVALID' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown stablecoin');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getStablecoinBalance')!;
      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  describe('eth_getStablecoinBalances tool', () => {
    beforeEach(() => {
      (mockWallet as any).getStablecoinBalances = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_getStablecoinBalances');
    });

    it('gets all stablecoin balances', async () => {
      (mockWallet as any).getStablecoinBalances.mockResolvedValue({
        USDC: { raw: 1000000000n, formatted: '1,000.00', symbol: 'USDC', decimals: 6 },
        USDT: { raw: 500000000n, formatted: '500.00', symbol: 'USDT', decimals: 6 },
        DAI: { raw: 0n, formatted: '0', symbol: 'DAI', decimals: 18 },
      });

      const tool = getTool(tools, 'eth_getStablecoinBalances')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.summary).toContain('1,000.00 USDC');
      expect(result.summary).toContain('500.00 USDT');
      expect(result.summary).not.toContain('DAI'); // Zero balance not shown
    });

    it('handles no balances', async () => {
      (mockWallet as any).getStablecoinBalances.mockResolvedValue({
        USDC: { raw: 0n, formatted: '0', symbol: 'USDC', decimals: 6 },
        USDT: { raw: 0n, formatted: '0', symbol: 'USDT', decimals: 6 },
      });

      const tool = getTool(tools, 'eth_getStablecoinBalances')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.summary).toBe('No stablecoin balances');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getStablecoinBalances')!;
      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  // === Bridge Tools Tests ===

  describe('eth_bridge tool', () => {
    beforeEach(() => {
      (mockWallet as any).bridge = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_bridge');
    });

    it('has correct parameters schema', () => {
      const tool = getTool(tools, 'eth_bridge');
      expect(tool).toBeDefined();
      expect(tool!.parameters.properties).toHaveProperty('token');
      expect(tool!.parameters.properties).toHaveProperty('amount');
      expect(tool!.parameters.properties).toHaveProperty('destinationChainId');
      expect(tool!.parameters.properties).toHaveProperty('recipient');
      expect(tool!.parameters.properties).toHaveProperty('priority');
      expect(tool!.parameters.required).toContain('token');
      expect(tool!.parameters.required).toContain('amount');
      expect(tool!.parameters.required).toContain('destinationChainId');
      expect(tool!.parameters.required).not.toContain('recipient');
      expect(tool!.parameters.required).not.toContain('priority');
    });

    it('executes bridge via wallet', async () => {
      (mockWallet as any).bridge.mockResolvedValue({
        trackingId: 'CCTP_1_42161_0xabc123',
        protocol: 'CCTP',
        sourceTxHash: '0xabc123',
        amount: { raw: 100000000n, formatted: '100' },
        fee: { totalUSD: 0 },
        estimatedTime: '15-20 minutes',
        recipient: testAddress,
      });

      const tool = getTool(tools, 'eth_bridge')!;
      const result = await tool.handler({
        token: 'USDC',
        amount: '100',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Bridging 100 USDC');
      expect(result.summary).toContain('Arbitrum');
      expect(result.summary).toContain('CCTP');
      expect(result.data.trackingId).toBe('CCTP_1_42161_0xabc123');
      expect((mockWallet as any).bridge).toHaveBeenCalledWith({
        token: expect.objectContaining({ symbol: 'USDC' }),
        amount: '100',
        destinationChainId: 42161,
        recipient: undefined,
        preference: { priority: 'cost' },
      });
    });

    it('passes recipient and priority', async () => {
      (mockWallet as any).bridge.mockResolvedValue({
        trackingId: 'CCTP_1_8453_0xdef456',
        protocol: 'CCTP',
        sourceTxHash: '0xdef456',
        amount: { raw: 500000000n, formatted: '500' },
        fee: { totalUSD: 0 },
        estimatedTime: '15-20 minutes',
        recipient: recipient,
      });

      const tool = getTool(tools, 'eth_bridge')!;
      await tool.handler({
        token: 'USDC',
        amount: '500',
        destinationChainId: 8453,
        recipient: recipient,
        priority: 'speed',
      });

      expect((mockWallet as any).bridge).toHaveBeenCalledWith({
        token: expect.objectContaining({ symbol: 'USDC' }),
        amount: '500',
        destinationChainId: 8453,
        recipient: recipient,
        preference: { priority: 'speed' },
      });
    });

    it('handles unknown stablecoin', async () => {
      const tool = getTool(tools, 'eth_bridge')!;
      const result = await tool.handler({
        token: 'INVALID',
        amount: '100',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown stablecoin');
      expect((mockWallet as any).bridge).not.toHaveBeenCalled();
    });

    it('handles bridge error', async () => {
      (mockWallet as any).bridge.mockRejectedValue(new Error('Destination chain not supported'));

      const tool = getTool(tools, 'eth_bridge')!;
      const result = await tool.handler({
        token: 'USDC',
        amount: '100',
        destinationChainId: 999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Destination chain not supported');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_bridge')!;
      expect(tool.metadata.category).toBe('write');
      expect(tool.metadata.requiresApproval).toBe(true);
      expect(tool.metadata.riskLevel).toBe('high');
    });
  });

  describe('eth_previewBridge tool', () => {
    beforeEach(() => {
      (mockWallet as any).previewBridgeWithRouter = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_previewBridge');
    });

    it('previews bridge that can execute', async () => {
      (mockWallet as any).previewBridgeWithRouter.mockResolvedValue({
        canBridge: true,
        blockers: [],
        amount: { raw: 1000000000n, formatted: '1,000' },
        quote: {
          protocol: 'CCTP',
          fee: { totalUSD: 0 },
          estimatedTime: { display: '15-20 minutes' },
        },
      });

      const tool = getTool(tools, 'eth_previewBridge')!;
      const result = await tool.handler({
        token: 'USDC',
        amount: '1000',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Can bridge');
      expect(result.summary).toContain('1,000 USDC');
      expect(result.summary).toContain('Arbitrum');
      expect(result.summary).toContain('CCTP');
    });

    it('previews bridge that cannot execute', async () => {
      (mockWallet as any).previewBridgeWithRouter.mockResolvedValue({
        canBridge: false,
        blockers: ['Insufficient balance', 'Daily limit exceeded'],
        amount: { raw: 1000000000n, formatted: '1,000' },
        quote: null,
      });

      const tool = getTool(tools, 'eth_previewBridge')!;
      const result = await tool.handler({
        token: 'USDC',
        amount: '1000',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Cannot bridge');
      expect(result.summary).toContain('Insufficient balance');
      expect(result.summary).toContain('Daily limit exceeded');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_previewBridge')!;
      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  describe('eth_compareBridgeRoutes tool', () => {
    beforeEach(() => {
      (mockWallet as any).compareBridgeRoutes = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_compareBridgeRoutes');
    });

    it('compares bridge routes', async () => {
      (mockWallet as any).compareBridgeRoutes.mockResolvedValue({
        quotes: [
          { protocol: 'CCTP', fee: { totalUSD: 0 }, estimatedTime: { display: '15-20 min' } },
          { protocol: 'Stargate', fee: { totalUSD: 0.6 }, estimatedTime: { display: '5-10 min' } },
        ],
        recommended: { protocol: 'CCTP' },
        recommendation: { reason: 'Lowest fees' },
      });

      const tool = getTool(tools, 'eth_compareBridgeRoutes')!;
      const result = await tool.handler({
        token: 'USDC',
        amount: '1000',
        destinationChainId: 42161,
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Recommended: CCTP');
      expect(result.summary).toContain('CCTP: $0.00 fee');
      expect(result.summary).toContain('Stargate: $0.60 fee');
    });

    it('handles no routes available', async () => {
      (mockWallet as any).compareBridgeRoutes.mockResolvedValue({
        quotes: [],
        recommended: null,
        recommendation: { reason: 'No routes available' },
      });

      const tool = getTool(tools, 'eth_compareBridgeRoutes')!;
      const result = await tool.handler({
        token: 'USDC',
        amount: '1000',
        destinationChainId: 999,
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('No routes available');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_compareBridgeRoutes')!;
      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  describe('eth_getBridgeStatus tool', () => {
    beforeEach(() => {
      (mockWallet as any).getBridgeStatusByTrackingId = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_getBridgeStatus');
    });

    it('has correct parameters schema', () => {
      const tool = getTool(tools, 'eth_getBridgeStatus');
      expect(tool).toBeDefined();
      expect(tool!.parameters.properties).toHaveProperty('trackingId');
      expect(tool!.parameters.required).toContain('trackingId');
    });

    it('gets bridge status', async () => {
      (mockWallet as any).getBridgeStatusByTrackingId.mockResolvedValue({
        status: 'attestation_pending',
        message: 'Waiting for Circle attestation',
        progress: 50,
      });

      const tool = getTool(tools, 'eth_getBridgeStatus')!;
      const result = await tool.handler({
        trackingId: 'CCTP_1_42161_0xabc123',
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('attestation_pending');
      expect(result.summary).toContain('Waiting for Circle attestation');
      expect(result.summary).toContain('50%');
      expect((mockWallet as any).getBridgeStatusByTrackingId).toHaveBeenCalledWith(
        'CCTP_1_42161_0xabc123'
      );
    });

    it('handles error', async () => {
      (mockWallet as any).getBridgeStatusByTrackingId.mockRejectedValue(
        new Error('Invalid tracking ID')
      );

      const tool = getTool(tools, 'eth_getBridgeStatus')!;
      const result = await tool.handler({
        trackingId: 'invalid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid tracking ID');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getBridgeStatus')!;
      expect(tool.metadata.category).toBe('read');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });

  describe('eth_getBridgeLimits tool', () => {
    beforeEach(() => {
      (mockWallet as any).getBridgeLimits = vi.fn();
      tools = createTools(mockWallet);
    });

    it('exists in tools list', () => {
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('eth_getBridgeLimits');
    });

    it('gets bridge limits', async () => {
      (mockWallet as any).getBridgeLimits.mockReturnValue({
        perTransaction: { limit: '1000', used: '0', remaining: '1000' },
        daily: { limit: '5000', used: '500', remaining: '4500' },
        allowedDestinations: [42161, 8453, 10],
      });

      const tool = getTool(tools, 'eth_getBridgeLimits')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Per tx: $1000');
      expect(result.summary).toContain('Daily remaining: $4500');
      expect(result.summary).toContain('Arbitrum');
      expect(result.summary).toContain('Base');
      expect(result.summary).toContain('Optimism');
    });

    it('shows all chains when no restrictions', async () => {
      (mockWallet as any).getBridgeLimits.mockReturnValue({
        perTransaction: { limit: '1000', used: '0', remaining: '1000' },
        daily: { limit: '5000', used: '0', remaining: '5000' },
        allowedDestinations: undefined,
      });

      const tool = getTool(tools, 'eth_getBridgeLimits')!;
      const result = await tool.handler({});

      expect(result.success).toBe(true);
      expect(result.summary).toContain('all chains');
    });

    it('has correct metadata', () => {
      const tool = getTool(tools, 'eth_getBridgeLimits')!;
      expect(tool.metadata.category).toBe('info');
      expect(tool.metadata.requiresApproval).toBe(false);
      expect(tool.metadata.riskLevel).toBe('none');
    });
  });
});

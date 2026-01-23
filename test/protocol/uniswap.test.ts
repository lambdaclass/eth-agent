import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UniswapClient,
  createUniswapClient,
  isUniswapSupported,
  getDefaultDeadline,
  UNISWAP_ROUTER_ADDRESSES,
  UNISWAP_QUOTER_ADDRESSES,
  WETH_ADDRESSES,
  FEE_TIERS,
  SWAP_ROUTER_ABI,
  QUOTER_ABI,
} from '../../src/protocol/uniswap.js';
import { RPCClient } from '../../src/protocol/rpc.js';
import { GasOracle } from '../../src/protocol/gas.js';
import { Contract } from '../../src/protocol/contract.js';
import type { Address, Hex } from '../../src/core/types.js';
import { GWEI } from '../../src/core/units.js';

// Mock modules
vi.mock('../../src/protocol/rpc.js', () => ({
  RPCClient: vi.fn(),
}));

vi.mock('../../src/protocol/gas.js', () => ({
  GasOracle: vi.fn(),
}));

vi.mock('../../src/protocol/contract.js', () => ({
  Contract: vi.fn(),
}));

describe('Uniswap Protocol', () => {
  describe('Constants', () => {
    it('defines router addresses for major chains', () => {
      expect(UNISWAP_ROUTER_ADDRESSES[1]).toBeDefined(); // Mainnet
      expect(UNISWAP_ROUTER_ADDRESSES[10]).toBeDefined(); // Optimism
      expect(UNISWAP_ROUTER_ADDRESSES[137]).toBeDefined(); // Polygon
      expect(UNISWAP_ROUTER_ADDRESSES[42161]).toBeDefined(); // Arbitrum
      expect(UNISWAP_ROUTER_ADDRESSES[8453]).toBeDefined(); // Base
    });

    it('defines quoter addresses for major chains', () => {
      expect(UNISWAP_QUOTER_ADDRESSES[1]).toBeDefined();
      expect(UNISWAP_QUOTER_ADDRESSES[8453]).toBeDefined();
    });

    it('defines WETH addresses for major chains', () => {
      expect(WETH_ADDRESSES[1]).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      expect(WETH_ADDRESSES[8453]).toBe('0x4200000000000000000000000000000000000006');
    });

    it('defines fee tiers', () => {
      expect(FEE_TIERS).toContain(500);
      expect(FEE_TIERS).toContain(3000);
      expect(FEE_TIERS).toContain(10000);
    });

    it('defines SWAP_ROUTER_ABI', () => {
      expect(SWAP_ROUTER_ABI).toBeDefined();
      expect(SWAP_ROUTER_ABI.find(fn => fn.name === 'exactInputSingle')).toBeDefined();
      expect(SWAP_ROUTER_ABI.find(fn => fn.name === 'exactInput')).toBeDefined();
      expect(SWAP_ROUTER_ABI.find(fn => fn.name === 'multicall')).toBeDefined();
    });

    it('defines QUOTER_ABI', () => {
      expect(QUOTER_ABI).toBeDefined();
      expect(QUOTER_ABI.find(fn => fn.name === 'quoteExactInputSingle')).toBeDefined();
      expect(QUOTER_ABI.find(fn => fn.name === 'quoteExactInput')).toBeDefined();
    });
  });

  describe('isUniswapSupported', () => {
    it('returns true for supported chains', () => {
      expect(isUniswapSupported(1)).toBe(true);
      expect(isUniswapSupported(10)).toBe(true);
      expect(isUniswapSupported(137)).toBe(true);
      expect(isUniswapSupported(42161)).toBe(true);
      expect(isUniswapSupported(8453)).toBe(true);
    });

    it('returns false for unsupported chains', () => {
      expect(isUniswapSupported(999999)).toBe(false);
    });
  });

  describe('getDefaultDeadline', () => {
    it('returns timestamp 20 minutes in the future by default', () => {
      const before = Math.floor(Date.now() / 1000);
      const deadline = getDefaultDeadline();
      const after = Math.floor(Date.now() / 1000);

      expect(deadline).toBeGreaterThanOrEqual(before + 1200);
      expect(deadline).toBeLessThanOrEqual(after + 1200);
    });

    it('accepts custom seconds parameter', () => {
      const before = Math.floor(Date.now() / 1000);
      const deadline = getDefaultDeadline(600); // 10 minutes
      const after = Math.floor(Date.now() / 1000);

      expect(deadline).toBeGreaterThanOrEqual(before + 600);
      expect(deadline).toBeLessThanOrEqual(after + 600);
    });
  });

  describe('createUniswapClient', () => {
    let mockRpc: any;

    beforeEach(() => {
      mockRpc = {
        getChainId: vi.fn().mockResolvedValue(1),
        call: vi.fn(),
      };
      vi.mocked(RPCClient).mockImplementation(() => mockRpc);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('creates a UniswapClient instance', () => {
      const client = createUniswapClient({ rpc: mockRpc });
      expect(client).toBeInstanceOf(UniswapClient);
    });
  });

  describe('UniswapClient', () => {
    let mockRpc: any;
    let mockGasOracle: any;
    let mockContract: any;
    let client: UniswapClient;

    const tokenIn = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address; // USDC
    const tokenOut = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address; // WETH
    const testHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;

    beforeEach(() => {
      mockRpc = {
        getChainId: vi.fn().mockResolvedValue(1),
        call: vi.fn(),
        getTransactionCount: vi.fn().mockResolvedValue(5),
        sendRawTransaction: vi.fn().mockResolvedValue(testHash),
        waitForTransaction: vi.fn().mockResolvedValue({
          status: 'success',
          hash: testHash,
          gasUsed: 150000n,
          effectiveGasPrice: GWEI(20),
          blockNumber: 12345,
          logs: [],
        }),
      };

      mockGasOracle = {
        estimateGas: vi.fn().mockResolvedValue({
          gasLimit: 200000n,
          maxFeePerGas: GWEI(30),
          maxPriorityFeePerGas: GWEI(2),
        }),
      };
      vi.mocked(GasOracle).mockImplementation(() => mockGasOracle);

      mockContract = {
        read: vi.fn().mockResolvedValue(0n), // No existing allowance
        write: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({ hash: testHash }),
        }),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract);

      client = new UniswapClient({ rpc: mockRpc, chainId: 1 });
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('getWETHAddress', () => {
      it('returns WETH address for the chain', async () => {
        const address = await client.getWETHAddress();
        expect(address).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      });

      it('throws for unsupported chain', async () => {
        const unsupportedClient = new UniswapClient({ rpc: mockRpc, chainId: 999999 });
        await expect(unsupportedClient.getWETHAddress()).rejects.toThrow('WETH not configured');
      });
    });

    describe('getQuote', () => {
      it('returns quote when pool exists', async () => {
        // Mock a successful quote response
        // Response format: amountOut (uint256), sqrtPriceX96After (uint160), initializedTicksCrossed (uint32), gasEstimate (uint256)
        const mockResponse = '0x' +
          '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // 1e18 amountOut
          '0000000000000000000000000000000000000000000000000000000000000000' + // sqrtPriceX96After
          '0000000000000000000000000000000000000000000000000000000000000001' + // ticks crossed
          '000000000000000000000000000000000000000000000000000000000003d090'; // gas estimate

        mockRpc.call.mockResolvedValue(mockResponse);

        const quote = await client.getQuote({
          tokenIn,
          tokenOut,
          amountIn: 1000000n, // 1 USDC (6 decimals)
        });

        expect(quote.amountIn).toBe(1000000n);
        expect(quote.amountOut).toBeGreaterThan(0n);
        expect(quote.fee).toBeOneOf([500, 3000, 10000]);
        expect(quote.path).toHaveLength(1);
        expect(quote.path[0].tokenIn).toBe(tokenIn);
        expect(quote.path[0].tokenOut).toBe(tokenOut);
      });

      it('calculates amountOutMinimum with slippage', async () => {
        const mockResponse = '0x' +
          '00000000000000000000000000000000000000000000000000000000000f4240' + // 1,000,000 amountOut
          '0000000000000000000000000000000000000000000000000000000000000000' +
          '0000000000000000000000000000000000000000000000000000000000000001' +
          '000000000000000000000000000000000000000000000000000000000003d090';

        mockRpc.call.mockResolvedValue(mockResponse);

        const quote = await client.getQuote({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
          slippageTolerance: 0.5, // 0.5%
        });

        // amountOutMinimum should be 99.5% of amountOut
        const expectedMin = (quote.amountOut * 9950n) / 10000n;
        expect(quote.amountOutMinimum).toBe(expectedMin);
      });

      it('uses default slippage of 0.5%', async () => {
        const mockResponse = '0x' +
          '00000000000000000000000000000000000000000000000000000000000f4240' +
          '0000000000000000000000000000000000000000000000000000000000000000' +
          '0000000000000000000000000000000000000000000000000000000000000001' +
          '000000000000000000000000000000000000000000000000000000000003d090';

        mockRpc.call.mockResolvedValue(mockResponse);

        const quote = await client.getQuote({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
        });

        // Default 0.5% slippage
        const expectedMin = (quote.amountOut * 9950n) / 10000n;
        expect(quote.amountOutMinimum).toBe(expectedMin);
      });

      it('tries multiple fee tiers', async () => {
        // First two fee tiers fail, third succeeds
        mockRpc.call
          .mockRejectedValueOnce(new Error('No pool'))
          .mockRejectedValueOnce(new Error('No pool'))
          .mockResolvedValueOnce('0x' +
            '0000000000000000000000000000000000000000000000000de0b6b3a7640000' +
            '0000000000000000000000000000000000000000000000000000000000000000' +
            '0000000000000000000000000000000000000000000000000000000000000001' +
            '000000000000000000000000000000000000000000000000000000000003d090');

        const quote = await client.getQuote({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
        });

        expect(mockRpc.call).toHaveBeenCalledTimes(3);
        expect(quote.fee).toBe(10000); // Third tier
      });

      it('throws when no liquidity found', async () => {
        mockRpc.call.mockRejectedValue(new Error('No pool'));

        await expect(client.getQuote({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
        })).rejects.toThrow('No liquidity found');
      });

      it('selects best quote across fee tiers', async () => {
        // First tier returns less, second returns more
        mockRpc.call
          .mockResolvedValueOnce('0x' +
            '0000000000000000000000000000000000000000000000000000000000000064' + // 100
            '0000000000000000000000000000000000000000000000000000000000000000' +
            '0000000000000000000000000000000000000000000000000000000000000001' +
            '000000000000000000000000000000000000000000000000000000000003d090')
          .mockResolvedValueOnce('0x' +
            '00000000000000000000000000000000000000000000000000000000000000c8' + // 200 (better)
            '0000000000000000000000000000000000000000000000000000000000000000' +
            '0000000000000000000000000000000000000000000000000000000000000001' +
            '000000000000000000000000000000000000000000000000000000000003d090')
          .mockRejectedValueOnce(new Error('No pool'));

        const quote = await client.getQuote({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
        });

        expect(quote.amountOut).toBe(200n); // Should select the better quote
        expect(quote.fee).toBe(3000); // Second tier
      });
    });

    describe('ensureApproval', () => {
      const mockAccount = {
        address: '0x1234567890123456789012345678901234567890' as Address,
        sign: vi.fn(),
      };

      beforeEach(() => {
        client = new UniswapClient({ rpc: mockRpc, account: mockAccount as any, chainId: 1 });
      });

      it('throws if no account provided', async () => {
        const clientNoAccount = new UniswapClient({ rpc: mockRpc, chainId: 1 });
        await expect(clientNoAccount.ensureApproval(
          tokenIn,
          1000000n,
          mockAccount.address
        )).rejects.toThrow('Account required');
      });

      it('returns null if already approved', async () => {
        mockContract.read.mockResolvedValue(2n ** 256n - 1n); // Max approval

        const result = await client.ensureApproval(
          tokenIn,
          1000000n,
          mockAccount.address
        );

        expect(result).toBeNull();
        expect(mockContract.write).not.toHaveBeenCalled();
      });

      it('approves if allowance insufficient', async () => {
        mockContract.read.mockResolvedValue(0n); // No allowance

        const result = await client.ensureApproval(
          tokenIn,
          1000000n,
          mockAccount.address
        );

        expect(result).toBe(testHash);
        expect(mockContract.write).toHaveBeenCalledWith('approve', expect.any(Array));
      });
    });

    describe('executeSwap', () => {
      const mockSignature = {
        r: '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
        s: '0x5678901234567890123456789012345678901234567890123456789012345678' as Hex,
        yParity: 0,
      };
      const mockAccount = {
        address: '0x1234567890123456789012345678901234567890' as Address,
        sign: vi.fn().mockReturnValue(mockSignature),
      };

      beforeEach(() => {
        client = new UniswapClient({ rpc: mockRpc, account: mockAccount as any, chainId: 1 });
      });

      it('throws if no account provided', async () => {
        const clientNoAccount = new UniswapClient({ rpc: mockRpc, chainId: 1 });
        await expect(clientNoAccount.executeSwap({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
          amountOutMinimum: 900000n,
          recipient: mockAccount.address,
          deadline: getDefaultDeadline(),
        })).rejects.toThrow('Account required');
      });

      it('executes swap and returns result', async () => {
        const result = await client.executeSwap({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
          amountOutMinimum: 900000n,
          recipient: mockAccount.address,
          deadline: getDefaultDeadline(),
          fee: 3000,
        });

        expect(result.hash).toBe(testHash);
        expect(result.amountIn).toBe(1000000n);
        expect(result.gasUsed).toBe(150000n);
        expect(result.blockNumber).toBe(12345);
        expect(mockRpc.sendRawTransaction).toHaveBeenCalled();
        expect(mockRpc.waitForTransaction).toHaveBeenCalledWith(testHash);
      });

      it('parses actual output amount from Transfer logs', async () => {
        // Mock receipt with Transfer event log
        const actualOutputAmount = 950000n; // More than minimum
        const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

        mockRpc.waitForTransaction.mockResolvedValueOnce({
          status: 'success',
          hash: testHash,
          gasUsed: 150000n,
          effectiveGasPrice: GWEI(20),
          blockNumber: 12345,
          logs: [
            {
              address: tokenOut, // Output token
              topics: [
                TRANSFER_TOPIC as any,
                '0x0000000000000000000000001234567890123456789012345678901234567890', // from (pool)
                '0x0000000000000000000000001234567890123456789012345678901234567890', // to (recipient)
              ],
              data: '0x' + actualOutputAmount.toString(16).padStart(64, '0'), // 950000 in hex
              blockNumber: 12345,
              transactionHash: testHash,
              transactionIndex: 0,
              blockHash: testHash,
              logIndex: 0,
              removed: false,
            },
          ],
        });

        const result = await client.executeSwap({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
          amountOutMinimum: 900000n,
          recipient: mockAccount.address,
          deadline: getDefaultDeadline(),
          fee: 3000,
        });

        // Should use actual output from logs, not the minimum
        expect(result.amountOut).toBe(actualOutputAmount);
      });

      it('falls back to amountOutMinimum when logs are empty', async () => {
        mockRpc.waitForTransaction.mockResolvedValueOnce({
          status: 'success',
          hash: testHash,
          gasUsed: 150000n,
          effectiveGasPrice: GWEI(20),
          blockNumber: 12345,
          logs: [],
        });

        const result = await client.executeSwap({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
          amountOutMinimum: 900000n,
          recipient: mockAccount.address,
          deadline: getDefaultDeadline(),
          fee: 3000,
        });

        // Should fall back to amountOutMinimum
        expect(result.amountOut).toBe(900000n);
      });
    });

    describe('executeSwapWithETH', () => {
      const mockSignature = {
        r: '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
        s: '0x5678901234567890123456789012345678901234567890123456789012345678' as Hex,
        yParity: 0,
      };
      const mockAccount = {
        address: '0x1234567890123456789012345678901234567890' as Address,
        sign: vi.fn().mockReturnValue(mockSignature),
      };

      beforeEach(() => {
        client = new UniswapClient({ rpc: mockRpc, account: mockAccount as any, chainId: 1 });
      });

      it('throws if no account provided', async () => {
        const clientNoAccount = new UniswapClient({ rpc: mockRpc, chainId: 1 });
        await expect(clientNoAccount.executeSwapWithETH({
          tokenIn: WETH_ADDRESSES[1] as Address,
          tokenOut,
          amountIn: 1000000000000000000n,
          amountOutMinimum: 900000n,
          recipient: mockAccount.address,
          deadline: getDefaultDeadline(),
          value: 1000000000000000000n,
        })).rejects.toThrow('Account required');
      });

      it('executes swap with ETH value', async () => {
        const result = await client.executeSwapWithETH({
          tokenIn: WETH_ADDRESSES[1] as Address,
          tokenOut,
          amountIn: 1000000000000000000n,
          amountOutMinimum: 900000n,
          recipient: mockAccount.address,
          deadline: getDefaultDeadline(),
          value: 1000000000000000000n,
        });

        expect(result.hash).toBe(testHash);
        expect(result.amountIn).toBe(1000000000000000000n);
        expect(mockGasOracle.estimateGas).toHaveBeenCalledWith(
          expect.objectContaining({
            value: 1000000000000000000n,
          })
        );
      });
    });

    describe('chain caching', () => {
      it('caches chain ID after first call', async () => {
        mockRpc.getChainId.mockResolvedValue(1);
        const clientNoCachedChain = new UniswapClient({ rpc: mockRpc });

        // First call should fetch chain ID
        await clientNoCachedChain.getWETHAddress();
        expect(mockRpc.getChainId).toHaveBeenCalledTimes(1);

        // Second call should use cached value
        await clientNoCachedChain.getWETHAddress();
        expect(mockRpc.getChainId).toHaveBeenCalledTimes(1);
      });
    });

    describe('unsupported chains', () => {
      it('throws when router not available', async () => {
        const unsupportedClient = new UniswapClient({ rpc: mockRpc, chainId: 999999 });

        // Mock a quote response to trigger router lookup
        mockRpc.call.mockResolvedValue('0x' + '00'.repeat(128));

        await expect(unsupportedClient.getQuote({
          tokenIn,
          tokenOut,
          amountIn: 1000000n,
        })).rejects.toThrow('Quoter not supported');
      });
    });
  });
});

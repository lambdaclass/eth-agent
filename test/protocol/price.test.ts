import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriceOracle, createPriceOracle } from '../../src/protocol/price.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { Address, Hex } from '../../src/core/types.js';
import { ETH } from '../../src/core/units.js';

describe('PriceOracle', () => {
  let mockRpc: RPCClient;

  // Sample Chainlink response for ETH/USD
  // latestRoundData returns: (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
  const mockPriceResponse = (price: number, updatedAt: number = Math.floor(Date.now() / 1000)) => {
    const roundId = '0x' + '1'.padStart(64, '0');
    const answer = '0x' + (BigInt(Math.floor(price * 1e8))).toString(16).padStart(64, '0');
    const startedAt = '0x' + BigInt(updatedAt - 10).toString(16).padStart(64, '0');
    const updatedAtHex = '0x' + BigInt(updatedAt).toString(16).padStart(64, '0');
    const answeredInRound = '0x' + '1'.padStart(64, '0');
    return `0x${roundId.slice(2)}${answer.slice(2)}${startedAt.slice(2)}${updatedAtHex.slice(2)}${answeredInRound.slice(2)}` as Hex;
  };

  beforeEach(() => {
    mockRpc = {
      call: vi.fn().mockResolvedValue(mockPriceResponse(2500)),
    } as unknown as RPCClient;
  });

  describe('constructor', () => {
    it('creates oracle with chain ID', () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });
      expect(oracle).toBeInstanceOf(PriceOracle);
    });

    it('creates oracle with custom feed', () => {
      const customFeed = '0x1234567890123456789012345678901234567890' as Address;
      const oracle = new PriceOracle({ rpc: mockRpc, customFeed });
      expect(oracle).toBeInstanceOf(PriceOracle);
    });

    it('creates oracle with fallback price', () => {
      const oracle = new PriceOracle({ rpc: mockRpc, fallbackPrice: 2000 });
      expect(oracle).toBeInstanceOf(PriceOracle);
    });

    it('creates oracle without feed address for unknown chain', () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 999999 });
      expect(oracle).toBeInstanceOf(PriceOracle);
    });
  });

  describe('getETHPrice', () => {
    it('fetches price from Chainlink feed', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const price = await oracle.getETHPrice();

      expect(price.price).toBe(2500);
      expect(price.decimals).toBe(8);
      expect(price.roundId).toBe(1n);
      expect(mockRpc.call).toHaveBeenCalledWith({
        to: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
        data: '0xfeaf968c',
      });
    });

    it('returns cached price within TTL', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      // First call
      await oracle.getETHPrice();
      expect(mockRpc.call).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await oracle.getETHPrice();
      expect(mockRpc.call).toHaveBeenCalledTimes(1);
    });

    it('returns fallback price when no feed configured', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, fallbackPrice: 1800 });

      const price = await oracle.getETHPrice();

      expect(price.price).toBe(1800);
      expect(price.roundId).toBe(0n);
      expect(mockRpc.call).not.toHaveBeenCalled();
    });

    it('returns fallback price when RPC call fails', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error('RPC error'));
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1, fallbackPrice: 2000 });

      const price = await oracle.getETHPrice();

      expect(price.price).toBe(2000);
      expect(price.roundId).toBe(0n);
    });

    it('returns zero when no feed and no fallback', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc });

      const price = await oracle.getETHPrice();

      expect(price.price).toBe(0);
    });

    it('uses custom feed address', async () => {
      const customFeed = '0x9999999999999999999999999999999999999999' as Address;
      const oracle = new PriceOracle({ rpc: mockRpc, customFeed });

      await oracle.getETHPrice();

      expect(mockRpc.call).toHaveBeenCalledWith({
        to: customFeed,
        data: '0xfeaf968c',
      });
    });

    it('supports all known chains', async () => {
      const chainConfigs = [
        { chainId: 1, feed: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' },
        { chainId: 11155111, feed: '0x694AA1769357215DE4FAC081bf1f309aDC325306' },
        { chainId: 10, feed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5' },
        { chainId: 42161, feed: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612' },
        { chainId: 8453, feed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' },
        { chainId: 137, feed: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0' },
      ];

      for (const { chainId, feed } of chainConfigs) {
        const freshMockRpc = {
          call: vi.fn().mockResolvedValue(mockPriceResponse(2500)),
        } as unknown as RPCClient;

        const oracle = new PriceOracle({ rpc: freshMockRpc, chainId });
        await oracle.getETHPrice();

        expect(freshMockRpc.call).toHaveBeenCalledWith({
          to: feed,
          data: '0xfeaf968c',
        });
      }
    });
  });

  describe('ethToUSD', () => {
    it('converts ETH to USD', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const usd = await oracle.ethToUSD(ETH(1));

      expect(usd).toBe(2500);
    });

    it('handles fractional ETH amounts', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const usd = await oracle.ethToUSD(ETH(0.5));

      expect(usd).toBe(1250);
    });

    it('returns 0 for 0 wei', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const usd = await oracle.ethToUSD(0n);

      expect(usd).toBe(0);
    });
  });

  describe('usdToETH', () => {
    it('converts USD to ETH', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const wei = await oracle.usdToETH(2500);

      expect(wei).toBe(ETH(1));
    });

    it('handles fractional USD amounts', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const wei = await oracle.usdToETH(1250);

      expect(wei).toBe(ETH(0.5));
    });

    it('returns 0 when price is 0', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc }); // No feed, price = 0

      const wei = await oracle.usdToETH(100);

      expect(wei).toBe(0n);
    });
  });

  describe('formatWithUSD', () => {
    it('formats amount with USD value', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const result = await oracle.formatWithUSD(ETH(1));

      expect(result.wei).toBe(ETH(1));
      expect(result.eth).toBe('1');
      expect(result.usd).toBe(2500);
      expect(result.formatted).toBe('1 ETH ($2500.00)');
    });

    it('formats small amounts correctly', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue(mockPriceResponse(2500));
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      const result = await oracle.formatWithUSD(ETH(0.001));

      expect(result.eth).toBe('0.001');
      expect(result.usd).toBe(2.5);
      expect(result.formatted).toBe('0.001 ETH ($2.50)');
    });
  });

  describe('clearCache', () => {
    it('clears the price cache', async () => {
      const oracle = new PriceOracle({ rpc: mockRpc, chainId: 1 });

      // Fetch once to populate cache
      await oracle.getETHPrice();
      expect(mockRpc.call).toHaveBeenCalledTimes(1);

      // Clear cache
      oracle.clearCache();

      // Next fetch should call RPC again
      await oracle.getETHPrice();
      expect(mockRpc.call).toHaveBeenCalledTimes(2);
    });
  });

  describe('with fallback price', () => {
    it('returns fallback when no feed available', async () => {
      const failingRpc = {
        call: async () => {
          throw new Error('Not available');
        },
      };

      const oracle = new PriceOracle({
        rpc: failingRpc as unknown as RPCClient,
        fallbackPrice: 3000,
      });

      const price = await oracle.getETHPrice();
      expect(price.price).toBe(3000);
      expect(price.decimals).toBe(8);
    });
  });
});

describe('createPriceOracle', () => {
  it('creates price oracle instance', () => {
    const mockRpc = {} as RPCClient;
    const oracle = createPriceOracle(mockRpc);

    expect(oracle).toBeInstanceOf(PriceOracle);
  });

  it('creates price oracle with chain ID', () => {
    const mockRpc = {
      call: vi.fn().mockResolvedValue('0x'),
    } as unknown as RPCClient;
    const oracle = createPriceOracle(mockRpc, 1);

    expect(oracle).toBeInstanceOf(PriceOracle);
  });

  it('creates price oracle without chain ID', () => {
    const mockRpc = {} as RPCClient;
    const oracle = createPriceOracle(mockRpc, undefined);

    expect(oracle).toBeInstanceOf(PriceOracle);
  });
});

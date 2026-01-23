import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GasOracle, GAS_LIMITS, calculateTxCost } from '../../src/protocol/gas.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import { GWEI } from '../../src/core/units.js';
import type { Address, Hex } from '../../src/core/types.js';

describe('GasOracle', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;

  let mockRpc: RPCClient;

  beforeEach(() => {
    mockRpc = {
      getBlock: vi.fn(),
      getGasPrice: vi.fn(),
      getFeeHistory: vi.fn(),
      estimateGas: vi.fn(),
    } as unknown as RPCClient;
  });

  describe('constructor', () => {
    it('creates oracle with default config', () => {
      const oracle = new GasOracle(mockRpc);
      expect(oracle).toBeInstanceOf(GasOracle);
    });

    it('creates oracle with custom config', () => {
      const oracle = new GasOracle(mockRpc, {
        useEIP1559: false,
        gasLimitMultiplier: 1.2,
        maxGasPrice: GWEI(1000),
        minGasPrice: GWEI(5),
      });
      expect(oracle).toBeInstanceOf(GasOracle);
    });
  });

  describe('getGasPrices', () => {
    it('returns EIP-1559 prices when supported', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        baseFeePerGas: GWEI(20),
        number: 100,
        hash: '0x123',
        parentHash: '0x123',
      } as any);

      vi.mocked(mockRpc.getFeeHistory).mockResolvedValue({
        oldestBlock: 90,
        baseFeePerGas: [GWEI(20), GWEI(21)],
        gasUsedRatio: [0.5, 0.6],
        reward: [
          [GWEI(1), GWEI(2), GWEI(3)],
          [GWEI(1), GWEI(2), GWEI(3)],
        ],
      });

      const oracle = new GasOracle(mockRpc);
      const prices = await oracle.getGasPrices();

      expect(prices.slow).toBeGreaterThan(0n);
      expect(prices.standard).toBeGreaterThan(0n);
      expect(prices.fast).toBeGreaterThan(0n);
      expect(prices.fast).toBeGreaterThanOrEqual(prices.standard);
      expect(prices.standard).toBeGreaterThanOrEqual(prices.slow);
    });

    it('returns legacy prices when EIP-1559 not supported', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        number: 100,
        hash: '0x123',
        parentHash: '0x123',
        // No baseFeePerGas
      } as any);

      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(50));

      const oracle = new GasOracle(mockRpc);
      const prices = await oracle.getGasPrices();

      expect(prices.slow).toBe(GWEI(45)); // 90% of 50
      expect(prices.standard).toBe(GWEI(50));
      expect(prices.fast).toBe(GWEI(60)); // 120% of 50
    });

    it('returns legacy prices when useEIP1559 is false', async () => {
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(30));

      const oracle = new GasOracle(mockRpc, { useEIP1559: false });
      const prices = await oracle.getGasPrices();

      expect(prices.slow).toBe(GWEI(27)); // 90% of 30
      expect(prices.standard).toBe(GWEI(30));
      expect(prices.fast).toBe(GWEI(36)); // 120% of 30
    });

    it('caches EIP-1559 support check', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        baseFeePerGas: GWEI(20),
        number: 100,
      } as any);

      vi.mocked(mockRpc.getFeeHistory).mockResolvedValue({
        oldestBlock: 90,
        baseFeePerGas: [GWEI(20)],
        gasUsedRatio: [0.5],
        reward: [[GWEI(2), GWEI(3), GWEI(4)]],
      });

      const oracle = new GasOracle(mockRpc);

      await oracle.getGasPrices();
      await oracle.getGasPrices();

      // getBlock should only be called once
      expect(mockRpc.getBlock).toHaveBeenCalledTimes(1);
    });

    it('handles EIP-1559 check error gracefully', async () => {
      vi.mocked(mockRpc.getBlock).mockRejectedValue(new Error('RPC error'));
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(30));

      const oracle = new GasOracle(mockRpc);
      const prices = await oracle.getGasPrices();

      // Falls back to legacy
      expect(prices.standard).toBe(GWEI(30));
    });
  });

  describe('getEIP1559Fees', () => {
    it('calculates fees from fee history', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        baseFeePerGas: GWEI(20),
        number: 100,
      } as any);

      vi.mocked(mockRpc.getFeeHistory).mockResolvedValue({
        oldestBlock: 90,
        baseFeePerGas: [GWEI(20), GWEI(22)],
        gasUsedRatio: [0.5, 0.6],
        reward: [
          [GWEI(1), GWEI(2), GWEI(5)],
          [GWEI(1), GWEI(3), GWEI(6)],
        ],
      });

      const oracle = new GasOracle(mockRpc);
      const fees = await oracle.getEIP1559Fees();

      expect(fees.maxFeePerGas.slow).toBeGreaterThan(0n);
      expect(fees.maxFeePerGas.standard).toBeGreaterThan(0n);
      expect(fees.maxFeePerGas.fast).toBeGreaterThan(0n);
      expect(fees.maxPriorityFeePerGas.slow).toBeGreaterThanOrEqual(GWEI(1));
      expect(fees.maxPriorityFeePerGas.standard).toBeGreaterThanOrEqual(GWEI(1));
      expect(fees.maxPriorityFeePerGas.fast).toBeGreaterThanOrEqual(GWEI(1));
    });

    it('uses minimum priority fee when rewards are low', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        baseFeePerGas: GWEI(20),
        number: 100,
      } as any);

      vi.mocked(mockRpc.getFeeHistory).mockResolvedValue({
        oldestBlock: 90,
        baseFeePerGas: [GWEI(20)],
        gasUsedRatio: [0.5],
        reward: [[0n, 0n, 0n]], // Zero rewards
      });

      const oracle = new GasOracle(mockRpc);
      const fees = await oracle.getEIP1559Fees();

      // Should use minimum of 1 GWEI
      expect(fees.maxPriorityFeePerGas.slow).toBeGreaterThanOrEqual(GWEI(1));
    });

    it('handles empty reward array', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        baseFeePerGas: GWEI(20),
        number: 100,
      } as any);

      vi.mocked(mockRpc.getFeeHistory).mockResolvedValue({
        oldestBlock: 90,
        baseFeePerGas: [GWEI(20)],
        gasUsedRatio: [0.5],
        // No reward field
      });

      const oracle = new GasOracle(mockRpc);
      const fees = await oracle.getEIP1559Fees();

      // Should use default of 20 GWEI
      expect(fees.maxPriorityFeePerGas.slow).toBeGreaterThan(0n);
    });
  });

  describe('estimateGas', () => {
    it('estimates gas with EIP-1559', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        baseFeePerGas: GWEI(20),
        number: 100,
      } as any);

      vi.mocked(mockRpc.estimateGas).mockResolvedValue(21000n);

      vi.mocked(mockRpc.getFeeHistory).mockResolvedValue({
        oldestBlock: 90,
        baseFeePerGas: [GWEI(20)],
        gasUsedRatio: [0.5],
        reward: [[GWEI(2), GWEI(3), GWEI(5)]],
      });

      const oracle = new GasOracle(mockRpc);
      const estimate = await oracle.estimateGas({ to: testAddress, value: 1000n });

      expect(estimate.gasLimit).toBeGreaterThanOrEqual(21000n);
      expect(estimate.maxFeePerGas).toBeGreaterThan(0n);
      expect(estimate.maxPriorityFeePerGas).toBeGreaterThan(0n);
      expect(estimate.estimatedCost).toBeGreaterThan(0n);
      expect(estimate.gasPrice).toBeUndefined();
    });

    it('estimates gas with legacy pricing', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        number: 100,
        // No baseFeePerGas
      } as any);

      vi.mocked(mockRpc.estimateGas).mockResolvedValue(21000n);
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(50));

      const oracle = new GasOracle(mockRpc);
      const estimate = await oracle.estimateGas({ to: testAddress, value: 1000n });

      expect(estimate.gasLimit).toBeGreaterThanOrEqual(21000n);
      expect(estimate.gasPrice).toBe(GWEI(50));
      expect(estimate.maxFeePerGas).toBeUndefined();
    });

    it('applies gas limit multiplier', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        number: 100,
      } as any);

      vi.mocked(mockRpc.estimateGas).mockResolvedValue(100000n);
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(30));

      const oracle = new GasOracle(mockRpc, { gasLimitMultiplier: 1.5 });
      const estimate = await oracle.estimateGas({ to: testAddress, data: '0x1234' as Hex });

      expect(estimate.gasLimit).toBe(150000n);
    });

    it('clamps gas price to max', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        number: 100,
      } as any);

      vi.mocked(mockRpc.estimateGas).mockResolvedValue(21000n);
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(1000)); // Very high

      const oracle = new GasOracle(mockRpc, { maxGasPrice: GWEI(100) });
      const estimate = await oracle.estimateGas({ to: testAddress });

      expect(estimate.gasPrice).toBe(GWEI(100));
    });

    it('clamps gas price to min', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        number: 100,
      } as any);

      vi.mocked(mockRpc.estimateGas).mockResolvedValue(21000n);
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(100n); // Very low

      const oracle = new GasOracle(mockRpc, { minGasPrice: GWEI(1) });
      const estimate = await oracle.estimateGas({ to: testAddress });

      expect(estimate.gasPrice).toBe(GWEI(1));
    });

    it('includes all transaction params in estimate', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({
        number: 100,
      } as any);

      vi.mocked(mockRpc.estimateGas).mockResolvedValue(50000n);
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(30));

      const oracle = new GasOracle(mockRpc);
      await oracle.estimateGas({
        to: testAddress,
        from: testAddress,
        data: '0x1234' as Hex,
        value: 1000n,
      });

      expect(mockRpc.estimateGas).toHaveBeenCalledWith({
        to: testAddress,
        from: testAddress,
        data: '0x1234',
        value: 1000n,
      });
    });
  });

  describe('GAS_LIMITS', () => {
    it('has correct values for common operations', () => {
      expect(GAS_LIMITS.transfer).toBe(21000n);
      expect(GAS_LIMITS.erc20Transfer).toBe(65000n);
      expect(GAS_LIMITS.erc20Approve).toBe(46000n);
      expect(GAS_LIMITS.erc721Transfer).toBe(85000n);
      expect(GAS_LIMITS.deployBase).toBe(100000n);
      expect(GAS_LIMITS.swap).toBe(200000n);
    });
  });

  describe('calculateTxCost', () => {
    it('calculates cost without value', () => {
      const cost = calculateTxCost(21000n, GWEI(30));
      expect(cost).toBe(21000n * GWEI(30));
    });

    it('calculates cost with value', () => {
      const value = 1000000000000000000n; // 1 ETH
      const cost = calculateTxCost(21000n, GWEI(30), value);
      expect(cost).toBe(21000n * GWEI(30) + value);
    });

    it('defaults value to 0', () => {
      const cost = calculateTxCost(50000n, GWEI(50));
      expect(cost).toBe(50000n * GWEI(50));
    });
  });
});

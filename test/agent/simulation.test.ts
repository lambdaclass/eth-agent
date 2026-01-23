import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationEngine, explainSimulation } from '../../src/agent/simulation.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { Address, Hex } from '../../src/core/types.js';

describe('SimulationEngine', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const recipient = '0x0987654321098765432109876543210987654321' as Address;

  let mockRpc: RPCClient;
  let simulation: SimulationEngine;

  beforeEach(() => {
    mockRpc = {
      call: vi.fn(),
      estimateGas: vi.fn(),
      getBalance: vi.fn(),
    } as unknown as RPCClient;

    simulation = new SimulationEngine(mockRpc);
  });

  describe('simulate', () => {
    it('returns success for valid transaction', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x' as Hex);
      vi.mocked(mockRpc.estimateGas).mockResolvedValue(21000n);

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(21000n);
      expect(result.logs).toEqual([]);
    });

    it('returns success with return data', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0xdeadbeef' as Hex);
      vi.mocked(mockRpc.estimateGas).mockResolvedValue(50000n);

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        data: '0x1234' as Hex,
      });

      expect(result.success).toBe(true);
      expect(result.returnData).toBe('0xdeadbeef');
      expect(result.gasUsed).toBe(50000n);
    });

    it('handles estimateGas failure gracefully', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x' as Hex);
      vi.mocked(mockRpc.estimateGas).mockRejectedValue(new Error('estimation failed'));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
        gasLimit: 30000n,
      });

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(30000n); // Falls back to provided gasLimit
    });

    it('handles estimateGas failure with default', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x' as Hex);
      vi.mocked(mockRpc.estimateGas).mockRejectedValue(new Error('estimation failed'));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(21000n); // Default gas
    });

    it('returns failure for revert', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error('execution reverted: insufficient balance'));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('insufficient balance');
      expect(result.gasUsed).toBe(0n);
    });

    it('returns failure for revert without reason', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error('revert'));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('revert');
    });

    it('returns failure for custom error', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error("custom error 'InsufficientFunds'"));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('InsufficientFunds');
    });

    it('returns failure for panic', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error('Panic(17)'));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Panic');
    });

    it('returns failure for out of gas', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error('out of gas'));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
        gasLimit: 50000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Out of gas');
      expect(result.gasUsed).toBe(50000n);
    });

    it('returns failure for unknown error', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error('Unknown RPC error'));

      const result = await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown RPC error');
    });

    it('returns error when to address is missing', async () => {
      const result = await simulation.simulate({
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('to address is required');
    });

    it('handles value and data in call params', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x' as Hex);
      vi.mocked(mockRpc.estimateGas).mockResolvedValue(21000n);

      await simulation.simulate({
        to: recipient,
        from: testAddress,
        value: 5000n,
        data: '0xabcdef' as Hex,
      });

      expect(mockRpc.call).toHaveBeenCalledWith(
        expect.objectContaining({
          to: recipient,
          from: testAddress,
          value: 5000n,
          data: '0xabcdef',
        }),
        'latest'
      );
    });
  });

  describe('validate', () => {
    it('returns result for successful simulation', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x' as Hex);
      vi.mocked(mockRpc.estimateGas).mockResolvedValue(21000n);

      const result = await simulation.validate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      });

      expect(result.success).toBe(true);
    });

    it('throws RevertError for failed simulation', async () => {
      vi.mocked(mockRpc.call).mockRejectedValue(new Error('execution reverted: test error'));

      await expect(simulation.validate({
        to: recipient,
        from: testAddress,
        value: 1000n,
      })).rejects.toThrow('test error');
    });
  });

  describe('checkBalance', () => {
    it('returns sufficient when balance covers cost', async () => {
      vi.mocked(mockRpc.getBalance).mockResolvedValue(10000000n);

      const result = await simulation.checkBalance(
        testAddress,
        1000n,    // value
        21000n,   // gas
        10n       // gasPrice
      );

      // 1000 + 21000 * 10 = 211000
      expect(result.sufficient).toBe(true);
      expect(result.balance).toBe(10000000n);
      expect(result.required).toBe(1000n + 21000n * 10n);
      expect(result.shortage).toBe(0n);
    });

    it('returns insufficient when balance is short', async () => {
      vi.mocked(mockRpc.getBalance).mockResolvedValue(1000n);

      const result = await simulation.checkBalance(
        testAddress,
        100000n,  // value
        21000n,   // gas
        100n      // gasPrice
      );

      expect(result.sufficient).toBe(false);
      expect(result.balance).toBe(1000n);
      expect(result.shortage).toBeGreaterThan(0n);
    });
  });

  describe('explainSimulation', () => {
    it('explains successful simulation', () => {
      const result = explainSimulation({
        success: true,
        gasUsed: 21000n,
        logs: [],
      });

      expect(result).toContain('Simulation successful');
      expect(result).toContain('21,000');
    });

    it('explains successful simulation with events', () => {
      const result = explainSimulation({
        success: true,
        gasUsed: 50000n,
        logs: [{} as any, {} as any],
      });

      expect(result).toContain('Simulation successful');
      expect(result).toContain('2 events');
    });

    it('explains failed simulation', () => {
      const result = explainSimulation({
        success: false,
        gasUsed: 0n,
        error: 'Insufficient funds',
        logs: [],
      });

      expect(result).toContain('Simulation failed');
      expect(result).toContain('Insufficient funds');
    });

    it('explains failed simulation without error', () => {
      const result = explainSimulation({
        success: false,
        gasUsed: 0n,
        logs: [],
      });

      expect(result).toContain('Unknown error');
    });
  });
});

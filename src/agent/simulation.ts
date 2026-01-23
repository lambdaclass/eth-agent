/**
 * Transaction simulation
 * Verify transactions before sending
 */

import type { Address, Hex, Hash, Log } from '../core/types.js';
import type { RPCClient } from '../protocol/rpc.js';
import { RevertError } from './errors.js';

export interface SimulationResult {
  success: boolean;
  gasUsed: bigint;
  returnData?: Hex;
  error?: string;
  logs: Log[];
  stateChanges?: StateChange[];
}

export interface StateChange {
  address: Address;
  before: Hex;
  after: Hex;
  slot?: Hash;
  type: 'balance' | 'storage' | 'code';
}

export interface SimulationOptions {
  // Block to simulate against
  blockTag?: 'latest' | 'pending' | number;
  // Whether to trace state changes (requires debug API)
  traceState?: boolean;
  // Override sender balance for simulation
  balanceOverride?: bigint;
}

/**
 * Simulation engine for pre-flight transaction checks
 */
export class SimulationEngine {
  constructor(private readonly rpc: RPCClient) {}

  /**
   * Simulate a transaction
   */
  async simulate(
    tx: {
      to?: Address;
      from: Address;
      data?: Hex;
      value?: bigint;
      gasLimit?: bigint;
    },
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const blockTag = options.blockTag ?? 'latest';

    try {
      // Build call params, only including defined values
      // Note: tx.to can be undefined for contract creation, but we require it for simulation
      if (!tx.to) {
        throw new Error('to address is required for simulation');
      }
      const callParams: { to: Address; from?: Address; data?: Hex; value?: bigint } = { to: tx.to, from: tx.from };
      if (tx.data !== undefined) callParams.data = tx.data;
      if (tx.value !== undefined) callParams.value = tx.value;

      // First try eth_call to check if it reverts
      const returnData = await this.rpc.call(callParams, blockTag);

      // Estimate gas
      let gasUsed: bigint;
      try {
        gasUsed = await this.rpc.estimateGas(callParams);
      } catch (_err) {
        // eth_estimateGas can fail even if eth_call succeeds
        // Use provided gasLimit or default
        gasUsed = tx.gasLimit ?? 21000n;
      }

      // Try to get logs from simulation if tracing is enabled
      // Note: This requires debug_traceCall which most public RPCs don't support
      const logs: Log[] = [];

      return {
        success: true,
        gasUsed,
        returnData,
        logs,
      };
    } catch (err) {
      // Parse error message
      const error = err as Error;
      const errorMessage = error.message;

      // Check for common revert patterns
      if (
        errorMessage.includes('revert') ||
        errorMessage.includes('execution reverted')
      ) {
        // Try to extract revert reason
        const reason = this.parseRevertReason(errorMessage);

        return {
          success: false,
          gasUsed: 0n,
          error: reason,
          logs: [],
        };
      }

      // Check for out of gas
      if (errorMessage.includes('out of gas')) {
        return {
          success: false,
          gasUsed: tx.gasLimit ?? 0n,
          error: 'Out of gas',
          logs: [],
        };
      }

      // Unknown error
      return {
        success: false,
        gasUsed: 0n,
        error: errorMessage,
        logs: [],
      };
    }
  }

  /**
   * Validate a transaction before sending
   * Throws if simulation fails
   */
  async validate(
    tx: {
      to?: Address;
      from: Address;
      data?: Hex;
      value?: bigint;
      gasLimit?: bigint;
    },
    options: SimulationOptions = {}
  ): Promise<SimulationResult> {
    const result = await this.simulate(tx, options);

    if (!result.success) {
      throw new RevertError(
        result.error ?? 'Transaction would fail',
        result.returnData
      );
    }

    return result;
  }

  /**
   * Check if sender has sufficient balance
   */
  async checkBalance(
    from: Address,
    value: bigint,
    estimatedGas: bigint,
    gasPrice: bigint
  ): Promise<{
    sufficient: boolean;
    balance: bigint;
    required: bigint;
    shortage: bigint;
  }> {
    const balance = await this.rpc.getBalance(from);
    const required = value + estimatedGas * gasPrice;
    const shortage = required > balance ? required - balance : 0n;

    return {
      sufficient: balance >= required,
      balance,
      required,
      shortage,
    };
  }

  /**
   * Parse revert reason from error message
   */
  private parseRevertReason(errorMessage: string): string {
    // Try to extract Error(string) revert reason
    const errorMatch = /execution reverted: (.+)/.exec(errorMessage);
    if (errorMatch?.[1]) {
      return errorMatch[1];
    }

    // Try to extract custom error
    const customMatch = /custom error '([^']+)'/.exec(errorMessage);
    if (customMatch?.[1]) {
      return `Custom error: ${customMatch[1]}`;
    }

    // Try to extract Panic code
    const panicMatch = /Panic\((\d+)\)/.exec(errorMessage);
    if (panicMatch?.[1]) {
      const code = parseInt(panicMatch[1]);
      return `Panic: ${this.panicCodeToString(code)}`;
    }

    // Return original message
    return errorMessage;
  }

  /**
   * Convert Solidity panic code to human-readable string
   */
  private panicCodeToString(code: number): string {
    const panicCodes: Record<number, string> = {
      0x00: 'Generic compiler panic',
      0x01: 'Assert failed',
      0x11: 'Arithmetic overflow/underflow',
      0x12: 'Division by zero',
      0x21: 'Invalid enum value',
      0x22: 'Invalid storage byte array',
      0x31: 'pop() on empty array',
      0x32: 'Array index out of bounds',
      0x41: 'Too much memory allocated',
      0x51: 'Zero-initialized function pointer',
    };

    return panicCodes[code] ?? `Unknown panic code ${code}`;
  }
}

/**
 * Generate a human-readable explanation of a simulation result
 */
export function explainSimulation(result: SimulationResult): string {
  if (result.success) {
    const gasInfo = `Estimated gas: ${result.gasUsed.toLocaleString('en-US')}`;
    const logInfo = result.logs.length > 0 ? ` (${result.logs.length} events)` : '';
    return `Simulation successful. ${gasInfo}${logInfo}`;
  }

  return `Simulation failed: ${result.error ?? 'Unknown error'}`;
}

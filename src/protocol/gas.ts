/**
 * Gas estimation and price oracle
 */

import type { Address, Hex, GasPrices } from '../core/types.js';
import type { RPCClient } from './rpc.js';
import { GWEI } from '../core/units.js';

export interface GasEstimate {
  gasLimit: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedCost: bigint;
}

export interface GasOracleConfig {
  // Use EIP-1559 if supported
  useEIP1559?: boolean;
  // Multiplier for gas limit estimation (default 1.1)
  gasLimitMultiplier?: number;
  // Maximum gas price allowed
  maxGasPrice?: bigint;
  // Minimum gas price (for safety)
  minGasPrice?: bigint;
}

/**
 * Gas oracle for price estimation
 */
export class GasOracle {
  private readonly config: Required<GasOracleConfig>;
  private chainSupportsEIP1559: boolean | null = null;

  constructor(
    private readonly rpc: RPCClient,
    config: GasOracleConfig = {}
  ) {
    this.config = {
      useEIP1559: config.useEIP1559 ?? true,
      gasLimitMultiplier: config.gasLimitMultiplier ?? 1.1,
      maxGasPrice: config.maxGasPrice ?? GWEI(500),
      minGasPrice: config.minGasPrice ?? GWEI(1),
    };
  }

  /**
   * Get current gas prices (slow, standard, fast)
   */
  async getGasPrices(): Promise<GasPrices> {
    const supportsEIP1559 = await this.supportsEIP1559();

    if (supportsEIP1559 && this.config.useEIP1559) {
      return this.getEIP1559Prices();
    }

    return this.getLegacyPrices();
  }

  /**
   * Get EIP-1559 fee estimates
   */
  async getEIP1559Fees(): Promise<{
    maxFeePerGas: { slow: bigint; standard: bigint; fast: bigint };
    maxPriorityFeePerGas: { slow: bigint; standard: bigint; fast: bigint };
  }> {
    const feeHistory = await this.rpc.getFeeHistory(10, 'latest', [10, 50, 90]);

    // Get latest base fee
    const baseFees = feeHistory.baseFeePerGas;
    const latestBaseFee = baseFees[baseFees.length - 1] ?? 0n;

    // Calculate average priority fees from history
    const priorityFees = {
      slow: this.percentile(feeHistory.reward?.map((r) => r[0] ?? 0n) ?? [], 10),
      standard: this.percentile(feeHistory.reward?.map((r) => r[1] ?? 0n) ?? [], 50),
      fast: this.percentile(feeHistory.reward?.map((r) => r[2] ?? 0n) ?? [], 90),
    };

    // Ensure minimum priority fee
    const minPriority = GWEI(1);
    priorityFees.slow = priorityFees.slow > minPriority ? priorityFees.slow : minPriority;
    priorityFees.standard = priorityFees.standard > minPriority ? priorityFees.standard : minPriority;
    priorityFees.fast = priorityFees.fast > minPriority ? priorityFees.fast : minPriority;

    // Calculate max fee with buffer for base fee increases
    const baseFeeBuffer = latestBaseFee * 2n; // Account for potential base fee increase

    return {
      maxFeePerGas: {
        slow: baseFeeBuffer + priorityFees.slow,
        standard: baseFeeBuffer + priorityFees.standard,
        fast: baseFeeBuffer + priorityFees.fast,
      },
      maxPriorityFeePerGas: priorityFees,
    };
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(tx: {
    to?: Address;
    from?: Address;
    data?: Hex;
    value?: bigint;
  }): Promise<GasEstimate> {
    // Get gas limit estimate
    const gasLimit = await this.rpc.estimateGas(tx);

    // Apply multiplier for safety margin
    const adjustedGasLimit = BigInt(
      Math.ceil(Number(gasLimit) * this.config.gasLimitMultiplier)
    );

    // Get gas price
    const supportsEIP1559 = await this.supportsEIP1559();

    if (supportsEIP1559 && this.config.useEIP1559) {
      const fees = await this.getEIP1559Fees();
      const maxFeePerGas = fees.maxFeePerGas.standard;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas.standard;

      return {
        gasLimit: adjustedGasLimit,
        maxFeePerGas: this.clampGasPrice(maxFeePerGas),
        maxPriorityFeePerGas: this.clampGasPrice(maxPriorityFeePerGas),
        estimatedCost: adjustedGasLimit * maxFeePerGas,
      };
    }

    const gasPrice = await this.rpc.getGasPrice();

    return {
      gasLimit: adjustedGasLimit,
      gasPrice: this.clampGasPrice(gasPrice),
      estimatedCost: adjustedGasLimit * gasPrice,
    };
  }

  /**
   * Check if the chain supports EIP-1559
   */
  private async supportsEIP1559(): Promise<boolean> {
    if (this.chainSupportsEIP1559 !== null) {
      return this.chainSupportsEIP1559;
    }

    try {
      const block = await this.rpc.getBlock('latest');
      this.chainSupportsEIP1559 = block?.baseFeePerGas !== undefined;
    } catch {
      this.chainSupportsEIP1559 = false;
    }

    return this.chainSupportsEIP1559;
  }

  /**
   * Get legacy gas prices from fee history
   */
  private async getLegacyPrices(): Promise<GasPrices> {
    const gasPrice = await this.rpc.getGasPrice();

    return {
      slow: (gasPrice * 90n) / 100n,
      standard: gasPrice,
      fast: (gasPrice * 120n) / 100n,
    };
  }

  /**
   * Get EIP-1559 gas prices (maxFeePerGas)
   */
  private async getEIP1559Prices(): Promise<GasPrices> {
    const fees = await this.getEIP1559Fees();

    return {
      slow: fees.maxFeePerGas.slow,
      standard: fees.maxFeePerGas.standard,
      fast: fees.maxFeePerGas.fast,
    };
  }

  /**
   * Calculate percentile from array
   */
  private percentile(values: bigint[], pct: number): bigint {
    if (values.length === 0) return GWEI(20); // Default

    const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const index = Math.floor((sorted.length - 1) * (pct / 100));
    return sorted[index] ?? GWEI(20);
  }

  /**
   * Clamp gas price to configured min/max
   */
  private clampGasPrice(price: bigint): bigint {
    if (price < this.config.minGasPrice) {
      return this.config.minGasPrice;
    }
    if (price > this.config.maxGasPrice) {
      return this.config.maxGasPrice;
    }
    return price;
  }
}

/**
 * Estimate gas for common operations
 */
export const GAS_LIMITS = {
  // ETH transfer
  transfer: 21000n,
  // ERC20 transfer
  erc20Transfer: 65000n,
  // ERC20 approve
  erc20Approve: 46000n,
  // ERC721 transfer
  erc721Transfer: 85000n,
  // Contract deployment (base)
  deployBase: 100000n,
  // Uniswap swap (approximate)
  swap: 200000n,
} as const;

/**
 * Calculate total transaction cost
 */
export function calculateTxCost(
  gasLimit: bigint,
  gasPrice: bigint,
  value: bigint = 0n
): bigint {
  return gasLimit * gasPrice + value;
}

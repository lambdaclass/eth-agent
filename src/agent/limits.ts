/**
 * Spending limits engine
 * Tracks and enforces spending limits for agent wallets
 */

import { formatETH, parseAmount, formatUnits, parseUnits } from '../core/units.js';
import {
  TransactionLimitError,
  HourlyLimitError,
  DailyLimitError,
  EmergencyStopError,
  StablecoinLimitError,
  SwapLimitError,
  TokenNotAllowedError,
  PriceImpactTooHighError,
} from './errors.js';
import {
  type StablecoinInfo,
  type StablecoinSymbol,
  STABLECOINS,
  parseStablecoinAmount,
  formatStablecoinAmount,
} from '../stablecoins/index.js';

export interface StablecoinLimits {
  perTransaction?: string | number;  // '1000' or 1000 means 1000 of the token
  perHour?: string | number;
  perDay?: string | number;
}

export interface SpendingLimits {
  // ETH limits (existing)
  perTransaction?: string | bigint;
  perHour?: string | bigint;
  perDay?: string | bigint;
  perWeek?: string | bigint;
  maxGasPerHour?: string | bigint;
  maxGasPerDay?: string | bigint;
  emergencyStop?: {
    haltIfSpentPercent?: number;
    minBalanceRequired?: string | bigint;
  };

  // Stablecoin limits (new)
  stablecoin?: {
    // Global USD-equivalent limits (applies to any stablecoin)
    perTransactionUSD?: string | number;  // '1000' means $1000 in any stablecoin
    perHourUSD?: string | number;
    perDayUSD?: string | number;

    // Per-token specific limits
    byToken?: Partial<Record<StablecoinSymbol, StablecoinLimits>>;
  };

  /**
   * Swap limits (for Uniswap and other DEX swaps)
   *
   * Controls spending limits, slippage tolerance, and token restrictions for token swaps.
   */
  swap?: {
    /** Maximum USD value per swap transaction (e.g., "5000" = $5,000 limit) */
    perTransactionUSD?: string | number;
    /** Maximum USD value of swaps per day (e.g., "50000" = $50,000 daily limit) */
    perDayUSD?: string | number;

    /**
     * Maximum allowed slippage as a percentage value.
     * - 0.5 means 0.5% maximum slippage
     * - 1 means 1% maximum slippage
     * - Default: 1 (1%)
     *
     * Swaps requesting higher slippage than this will be rejected.
     */
    maxSlippagePercent?: number;

    /**
     * Maximum allowed price impact as a percentage value.
     * - 1 means 1% maximum price impact
     * - 5 means 5% maximum price impact
     * - Default: 5 (5%)
     *
     * Swaps with higher price impact will be rejected to protect against
     * unfavorable trades in low-liquidity pools.
     */
    maxPriceImpactPercent?: number;

    /** Only allow swapping these tokens (by symbol, e.g., ["USDC", "ETH", "WETH"]) */
    allowedTokens?: string[];
    /** Block these tokens from swapping (by symbol) */
    blockedTokens?: string[];
  };
}

interface SpendingRecord {
  amount: bigint;
  timestamp: number;
}

interface StablecoinSpendingRecord {
  symbol: StablecoinSymbol;
  amount: bigint;  // Raw amount with token decimals
  usdEquivalent: bigint;  // Normalized to 6 decimals for comparison
  timestamp: number;
}

interface StablecoinLimitState {
  perTransaction: bigint;  // In normalized 6 decimals
  perHour: bigint;
  perDay: bigint;
}

interface SwapSpendingRecord {
  tokenIn: string;
  tokenOut: string;
  usdValue: bigint;  // Normalized to 6 decimals
  timestamp: number;
}

interface SwapLimitState {
  perTransaction: bigint;  // In normalized 6 decimals (USD)
  perDay: bigint;
  maxSlippagePercent: number;
  maxPriceImpactPercent: number;
  allowedTokens: Set<string> | null;  // null = all allowed
  blockedTokens: Set<string>;
}

interface LimitState {
  // Limits in wei
  perTransaction: bigint;
  perHour: bigint;
  perDay: bigint;
  perWeek: bigint;
  maxGasPerHour: bigint;
  maxGasPerDay: bigint;
  emergencyStop: {
    haltIfSpentPercent: number;
    minBalanceRequired: bigint;
  };

  // Spending history
  history: SpendingRecord[];
  gasHistory: SpendingRecord[];

  // Stablecoin limits and history
  stablecoinLimits: {
    global: StablecoinLimitState;
    byToken: Map<StablecoinSymbol, StablecoinLimitState>;
  };
  stablecoinHistory: StablecoinSpendingRecord[];

  // Swap limits and history
  swapLimits: SwapLimitState;
  swapHistory: SwapSpendingRecord[];

  // Emergency stop flag
  stopped: boolean;
  stopReason?: string;
}

// Standard decimals for USD comparison (6, matching USDC)
const USD_DECIMALS = 6;
const DEFAULT_USD_LIMIT = 10000n * 10n ** BigInt(USD_DECIMALS); // $10,000 default

export class LimitsEngine {
  private state: LimitState;

  constructor(limits: SpendingLimits = {}) {
    this.state = {
      perTransaction: this.parseLimit(limits.perTransaction, 10n ** 18n), // 1 ETH default
      perHour: this.parseLimit(limits.perHour, 5n * 10n ** 18n), // 5 ETH default
      perDay: this.parseLimit(limits.perDay, 20n * 10n ** 18n), // 20 ETH default
      perWeek: this.parseLimit(limits.perWeek, 100n * 10n ** 18n), // 100 ETH default
      maxGasPerHour: this.parseLimit(limits.maxGasPerHour, 5n * 10n ** 17n), // 0.5 ETH default
      maxGasPerDay: this.parseLimit(limits.maxGasPerDay, 2n * 10n ** 18n), // 2 ETH default
      emergencyStop: {
        haltIfSpentPercent: limits.emergencyStop?.haltIfSpentPercent ?? 50,
        minBalanceRequired: this.parseLimit(limits.emergencyStop?.minBalanceRequired, 10n ** 17n), // 0.1 ETH default
      },
      history: [],
      gasHistory: [],
      stablecoinLimits: this.parseStablecoinLimits(limits.stablecoin),
      stablecoinHistory: [],
      swapLimits: this.parseSwapLimits(limits.swap),
      swapHistory: [],
      stopped: false,
    };
  }

  /**
   * Parse stablecoin limits configuration
   */
  private parseStablecoinLimits(config?: SpendingLimits['stablecoin']): LimitState['stablecoinLimits'] {
    const global: StablecoinLimitState = {
      perTransaction: this.parseUSDLimit(config?.perTransactionUSD, 1000n * 10n ** BigInt(USD_DECIMALS)), // $1000 default
      perHour: this.parseUSDLimit(config?.perHourUSD, 5000n * 10n ** BigInt(USD_DECIMALS)), // $5000 default
      perDay: this.parseUSDLimit(config?.perDayUSD, DEFAULT_USD_LIMIT), // $10,000 default
    };

    const byToken = new Map<StablecoinSymbol, StablecoinLimitState>();

    if (config?.byToken) {
      for (const [symbol, tokenLimits] of Object.entries(config.byToken)) {
        if (tokenLimits) {
          const stablecoin = STABLECOINS[symbol as StablecoinSymbol];
          byToken.set(symbol as StablecoinSymbol, {
            perTransaction: this.parseTokenLimit(tokenLimits.perTransaction, stablecoin, global.perTransaction),
            perHour: this.parseTokenLimit(tokenLimits.perHour, stablecoin, global.perHour),
            perDay: this.parseTokenLimit(tokenLimits.perDay, stablecoin, global.perDay),
          });
        }
      }
    }

    return { global, byToken };
  }

  /**
   * Parse swap limits configuration
   */
  private parseSwapLimits(config?: SpendingLimits['swap']): SwapLimitState {
    // Parse allowed tokens list
    let allowedTokens: Set<string> | null = null;
    if (config?.allowedTokens && config.allowedTokens.length > 0) {
      allowedTokens = new Set(config.allowedTokens.map((t) => t.toUpperCase()));
    }

    // Parse blocked tokens list
    const blockedTokens = new Set<string>();
    if (config?.blockedTokens) {
      for (const t of config.blockedTokens) {
        blockedTokens.add(t.toUpperCase());
      }
    }

    return {
      perTransaction: this.parseUSDLimit(
        config?.perTransactionUSD,
        5000n * 10n ** BigInt(USD_DECIMALS) // $5000 default per swap
      ),
      perDay: this.parseUSDLimit(
        config?.perDayUSD,
        50000n * 10n ** BigInt(USD_DECIMALS) // $50,000 default per day
      ),
      maxSlippagePercent: config?.maxSlippagePercent ?? 1, // 1% default
      maxPriceImpactPercent: config?.maxPriceImpactPercent ?? 5, // 5% default
      allowedTokens,
      blockedTokens,
    };
  }

  /**
   * Parse a USD limit (normalized to 6 decimals)
   */
  private parseUSDLimit(value: string | number | undefined, defaultValue: bigint): bigint {
    if (value === undefined) return defaultValue;
    const amount = typeof value === 'number' ? value.toString() : value;
    // Parse as 6-decimal value
    return parseUnits(amount, USD_DECIMALS);
  }

  /**
   * Parse a token-specific limit, converting to normalized USD (6 decimals)
   */
  private parseTokenLimit(
    value: string | number | undefined,
    stablecoin: StablecoinInfo,
    defaultValue: bigint
  ): bigint {
    if (value === undefined) return defaultValue;
    const rawAmount = parseStablecoinAmount(value, stablecoin);
    // Normalize to 6 decimals for comparison
    return this.normalizeToUSD(rawAmount, stablecoin);
  }

  /**
   * Normalize a stablecoin amount to USD-equivalent (6 decimals)
   * For stablecoins, we assume 1:1 USD peg
   */
  private normalizeToUSD(amount: bigint, stablecoin: StablecoinInfo): bigint {
    if (stablecoin.decimals === USD_DECIMALS) {
      return amount;
    } else if (stablecoin.decimals > USD_DECIMALS) {
      // e.g., USDS (18 decimals) -> divide
      const factor = 10n ** BigInt(stablecoin.decimals - USD_DECIMALS);
      return amount / factor;
    } else {
      // e.g., GUSD (2 decimals) -> multiply
      const factor = 10n ** BigInt(USD_DECIMALS - stablecoin.decimals);
      return amount * factor;
    }
  }

  /**
   * Check if a transaction is within limits
   * Throws an error if any limit is exceeded
   */
  checkTransaction(amount: bigint, currentBalance?: bigint): void {
    // Check emergency stop
    if (this.state.stopped) {
      throw new EmergencyStopError(this.state.stopReason ?? 'Wallet is stopped');
    }

    // Check per-transaction limit
    if (amount > this.state.perTransaction) {
      throw new TransactionLimitError({
        requested: { eth: formatETH(amount) },
        limit: { eth: formatETH(this.state.perTransaction) },
      });
    }

    // Check hourly limit
    const hourlySpent = this.getSpentInWindow(60 * 60 * 1000);
    const hourlyRemaining = this.state.perHour - hourlySpent;

    if (amount > hourlyRemaining) {
      const resetsAt = this.getWindowResetTime(60 * 60 * 1000);
      throw new HourlyLimitError({
        requested: { eth: formatETH(amount) },
        remaining: { eth: formatETH(hourlyRemaining > 0n ? hourlyRemaining : 0n) },
        resetsAt,
      });
    }

    // Check daily limit
    const dailySpent = this.getSpentInWindow(24 * 60 * 60 * 1000);
    const dailyRemaining = this.state.perDay - dailySpent;

    if (amount > dailyRemaining) {
      const resetsAt = this.getWindowResetTime(24 * 60 * 60 * 1000);
      throw new DailyLimitError({
        requested: { eth: formatETH(amount) },
        remaining: { eth: formatETH(dailyRemaining > 0n ? dailyRemaining : 0n) },
        resetsAt,
      });
    }

    // Check emergency stop conditions
    if (currentBalance !== undefined) {
      // Check if transaction would leave balance below minimum
      if (currentBalance - amount < this.state.emergencyStop.minBalanceRequired) {
        this.triggerEmergencyStop(
          `Transaction would leave balance below minimum (${formatETH(this.state.emergencyStop.minBalanceRequired)} ETH)`
        );
        throw new EmergencyStopError(this.state.stopReason ?? 'Balance would be too low');
      }

      // Check if daily spending exceeds percentage threshold
      const percentSpent = Number((dailySpent + amount) * 100n / currentBalance);
      if (percentSpent > this.state.emergencyStop.haltIfSpentPercent) {
        this.triggerEmergencyStop(
          `Daily spending would exceed ${this.state.emergencyStop.haltIfSpentPercent}% of balance`
        );
        throw new EmergencyStopError(this.state.stopReason ?? 'Spending limit exceeded');
      }
    }
  }

  /**
   * Check if gas spending is within limits
   */
  checkGas(gasAmount: bigint): void {
    if (this.state.stopped) {
      throw new EmergencyStopError(this.state.stopReason ?? 'Wallet is stopped');
    }

    const hourlyGas = this.getGasSpentInWindow(60 * 60 * 1000);
    if (gasAmount + hourlyGas > this.state.maxGasPerHour) {
      throw new HourlyLimitError({
        requested: { eth: formatETH(gasAmount) },
        remaining: { eth: formatETH(this.state.maxGasPerHour - hourlyGas) },
        resetsAt: this.getWindowResetTime(60 * 60 * 1000),
      });
    }

    const dailyGas = this.getGasSpentInWindow(24 * 60 * 60 * 1000);
    if (gasAmount + dailyGas > this.state.maxGasPerDay) {
      throw new DailyLimitError({
        requested: { eth: formatETH(gasAmount) },
        remaining: { eth: formatETH(this.state.maxGasPerDay - dailyGas) },
        resetsAt: this.getWindowResetTime(24 * 60 * 60 * 1000),
      });
    }
  }

  /**
   * Record a successful transaction
   */
  recordSpend(amount: bigint, gasAmount: bigint): void {
    const now = Date.now();

    this.state.history.push({ amount, timestamp: now });
    this.state.gasHistory.push({ amount: gasAmount, timestamp: now });

    // Clean up old history
    this.cleanupHistory();
  }

  // ============ Stablecoin Limit Methods ============

  /**
   * Check if a stablecoin transaction is within limits
   * Throws StablecoinLimitError if any limit is exceeded
   */
  checkStablecoinTransaction(token: StablecoinInfo, amount: bigint): void {
    // Check emergency stop
    if (this.state.stopped) {
      throw new EmergencyStopError(this.state.stopReason ?? 'Wallet is stopped');
    }

    const symbol = token.symbol as StablecoinSymbol;
    const usdEquivalent = this.normalizeToUSD(amount, token);
    const formattedAmount = formatStablecoinAmount(amount, token);

    // Get limits for this token (or use global)
    const limits = this.state.stablecoinLimits.byToken.get(symbol) ?? this.state.stablecoinLimits.global;

    // Check per-transaction limit
    if (usdEquivalent > limits.perTransaction) {
      throw new StablecoinLimitError({
        type: 'transaction',
        token: symbol,
        requested: formattedAmount,
        limit: formatUnits(limits.perTransaction, USD_DECIMALS),
      });
    }

    // Check hourly limit
    const hourlySpent = this.getStablecoinSpentInWindow(60 * 60 * 1000, symbol);
    const hourlyRemaining = limits.perHour - hourlySpent;

    if (usdEquivalent > hourlyRemaining) {
      const resetsAt = this.getStablecoinWindowResetTime(60 * 60 * 1000, symbol);
      throw new StablecoinLimitError({
        type: 'hourly',
        token: symbol,
        requested: formattedAmount,
        remaining: formatUnits(hourlyRemaining > 0n ? hourlyRemaining : 0n, USD_DECIMALS),
        resetsAt,
      });
    }

    // Check daily limit
    const dailySpent = this.getStablecoinSpentInWindow(24 * 60 * 60 * 1000, symbol);
    const dailyRemaining = limits.perDay - dailySpent;

    if (usdEquivalent > dailyRemaining) {
      const resetsAt = this.getStablecoinWindowResetTime(24 * 60 * 60 * 1000, symbol);
      throw new StablecoinLimitError({
        type: 'daily',
        token: symbol,
        requested: formattedAmount,
        remaining: formatUnits(dailyRemaining > 0n ? dailyRemaining : 0n, USD_DECIMALS),
        resetsAt,
      });
    }
  }

  /**
   * Record a successful stablecoin transaction
   */
  recordStablecoinSpend(token: StablecoinInfo, amount: bigint): void {
    const now = Date.now();
    const symbol = token.symbol as StablecoinSymbol;
    const usdEquivalent = this.normalizeToUSD(amount, token);

    this.state.stablecoinHistory.push({
      symbol,
      amount,
      usdEquivalent,
      timestamp: now,
    });

    // Clean up old history
    this.cleanupStablecoinHistory();
  }

  /**
   * Get maximum stablecoin amount sendable considering all limits
   */
  getMaxStablecoinSendable(token: StablecoinInfo): bigint {
    if (this.state.stopped) return 0n;

    const symbol = token.symbol as StablecoinSymbol;
    const limits = this.state.stablecoinLimits.byToken.get(symbol) ?? this.state.stablecoinLimits.global;

    const hourlyRemaining = limits.perHour - this.getStablecoinSpentInWindow(60 * 60 * 1000, symbol);
    const dailyRemaining = limits.perDay - this.getStablecoinSpentInWindow(24 * 60 * 60 * 1000, symbol);

    // Get minimum of all limits (in USD-equivalent)
    let maxUSD = limits.perTransaction;
    if (hourlyRemaining < maxUSD) maxUSD = hourlyRemaining;
    if (dailyRemaining < maxUSD) maxUSD = dailyRemaining;

    if (maxUSD <= 0n) return 0n;

    // Convert back to token decimals
    return this.denormalizeFromUSD(maxUSD, token);
  }

  /**
   * Convert from normalized USD (6 decimals) back to token amount
   */
  private denormalizeFromUSD(usdAmount: bigint, token: StablecoinInfo): bigint {
    if (token.decimals === USD_DECIMALS) {
      return usdAmount;
    } else if (token.decimals > USD_DECIMALS) {
      const factor = 10n ** BigInt(token.decimals - USD_DECIMALS);
      return usdAmount * factor;
    } else {
      const factor = 10n ** BigInt(USD_DECIMALS - token.decimals);
      return usdAmount / factor;
    }
  }

  /**
   * Get stablecoin spending status
   */
  getStablecoinStatus(token?: StablecoinInfo): {
    global: {
      perTransaction: { limit: string; available: string };
      hourly: { limit: string; used: string; remaining: string; resetsAt: Date };
      daily: { limit: string; used: string; remaining: string; resetsAt: Date };
    };
    token?: {
      symbol: string;
      perTransaction: { limit: string; available: string };
      hourly: { limit: string; used: string; remaining: string; resetsAt: Date };
      daily: { limit: string; used: string; remaining: string; resetsAt: Date };
    };
  } {
    const globalLimits = this.state.stablecoinLimits.global;
    const globalHourlySpent = this.getGlobalStablecoinSpentInWindow(60 * 60 * 1000);
    const globalDailySpent = this.getGlobalStablecoinSpentInWindow(24 * 60 * 60 * 1000);

    const result: ReturnType<typeof this.getStablecoinStatus> = {
      global: {
        perTransaction: {
          limit: formatUnits(globalLimits.perTransaction, USD_DECIMALS),
          available: formatUnits(globalLimits.perTransaction, USD_DECIMALS),
        },
        hourly: {
          limit: formatUnits(globalLimits.perHour, USD_DECIMALS),
          used: formatUnits(globalHourlySpent, USD_DECIMALS),
          remaining: formatUnits(
            globalLimits.perHour > globalHourlySpent ? globalLimits.perHour - globalHourlySpent : 0n,
            USD_DECIMALS
          ),
          resetsAt: this.getGlobalStablecoinWindowResetTime(60 * 60 * 1000),
        },
        daily: {
          limit: formatUnits(globalLimits.perDay, USD_DECIMALS),
          used: formatUnits(globalDailySpent, USD_DECIMALS),
          remaining: formatUnits(
            globalLimits.perDay > globalDailySpent ? globalLimits.perDay - globalDailySpent : 0n,
            USD_DECIMALS
          ),
          resetsAt: this.getGlobalStablecoinWindowResetTime(24 * 60 * 60 * 1000),
        },
      },
    };

    if (token) {
      const symbol = token.symbol as StablecoinSymbol;
      const tokenLimits = this.state.stablecoinLimits.byToken.get(symbol) ?? globalLimits;
      const tokenHourlySpent = this.getStablecoinSpentInWindow(60 * 60 * 1000, symbol);
      const tokenDailySpent = this.getStablecoinSpentInWindow(24 * 60 * 60 * 1000, symbol);

      result.token = {
        symbol: token.symbol,
        perTransaction: {
          limit: formatUnits(tokenLimits.perTransaction, USD_DECIMALS),
          available: formatUnits(tokenLimits.perTransaction, USD_DECIMALS),
        },
        hourly: {
          limit: formatUnits(tokenLimits.perHour, USD_DECIMALS),
          used: formatUnits(tokenHourlySpent, USD_DECIMALS),
          remaining: formatUnits(
            tokenLimits.perHour > tokenHourlySpent ? tokenLimits.perHour - tokenHourlySpent : 0n,
            USD_DECIMALS
          ),
          resetsAt: this.getStablecoinWindowResetTime(60 * 60 * 1000, symbol),
        },
        daily: {
          limit: formatUnits(tokenLimits.perDay, USD_DECIMALS),
          used: formatUnits(tokenDailySpent, USD_DECIMALS),
          remaining: formatUnits(
            tokenLimits.perDay > tokenDailySpent ? tokenLimits.perDay - tokenDailySpent : 0n,
            USD_DECIMALS
          ),
          resetsAt: this.getStablecoinWindowResetTime(24 * 60 * 60 * 1000, symbol),
        },
      };
    }

    return result;
  }

  private getStablecoinSpentInWindow(windowMs: number, symbol?: StablecoinSymbol): bigint {
    const cutoff = Date.now() - windowMs;
    return this.state.stablecoinHistory
      .filter((r) => r.timestamp >= cutoff && (symbol === undefined || r.symbol === symbol))
      .reduce((sum, r) => sum + r.usdEquivalent, 0n);
  }

  private getGlobalStablecoinSpentInWindow(windowMs: number): bigint {
    return this.getStablecoinSpentInWindow(windowMs);
  }

  private getStablecoinWindowResetTime(windowMs: number, symbol?: StablecoinSymbol): Date {
    const cutoff = Date.now() - windowMs;
    const filtered = this.state.stablecoinHistory
      .filter((r) => r.timestamp >= cutoff && (symbol === undefined || r.symbol === symbol))
      .sort((a, b) => a.timestamp - b.timestamp);

    const oldest = filtered[0];
    if (oldest) {
      return new Date(oldest.timestamp + windowMs);
    }
    return new Date();
  }

  private getGlobalStablecoinWindowResetTime(windowMs: number): Date {
    return this.getStablecoinWindowResetTime(windowMs);
  }

  private cleanupStablecoinHistory(): void {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.state.stablecoinHistory = this.state.stablecoinHistory.filter((r) => r.timestamp >= weekAgo);
  }

  // ============ Swap Limit Methods ============

  /**
   * Check if a token is allowed for swapping
   */
  isTokenAllowedForSwap(tokenSymbol: string): boolean {
    const normalized = tokenSymbol.toUpperCase();

    // Check blocked tokens first
    if (this.state.swapLimits.blockedTokens.has(normalized)) {
      return false;
    }

    // If allowedTokens is null, all tokens are allowed (except blocked)
    if (this.state.swapLimits.allowedTokens === null) {
      return true;
    }

    // Otherwise, must be in allowed list
    return this.state.swapLimits.allowedTokens.has(normalized);
  }

  /**
   * Get maximum allowed slippage percentage
   */
  getMaxSlippagePercent(): number {
    return this.state.swapLimits.maxSlippagePercent;
  }

  /**
   * Get maximum allowed price impact percentage
   */
  getMaxPriceImpactPercent(): number {
    return this.state.swapLimits.maxPriceImpactPercent;
  }

  /**
   * Check if a swap transaction is within limits
   * @param tokenInSymbol - Symbol of input token
   * @param tokenOutSymbol - Symbol of output token
   * @param usdValue - USD value of the swap (normalized to 6 decimals)
   * @param priceImpact - Price impact percentage
   */
  checkSwapTransaction(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    usdValue: bigint,
    priceImpact?: number
  ): void {
    // Check emergency stop
    if (this.state.stopped) {
      throw new EmergencyStopError(this.state.stopReason ?? 'Wallet is stopped');
    }

    // Check token allowlists/blocklists
    if (!this.isTokenAllowedForSwap(tokenInSymbol)) {
      const reason = this.state.swapLimits.blockedTokens.has(tokenInSymbol.toUpperCase())
        ? 'blocked'
        : 'not_allowed';
      throw new TokenNotAllowedError({ token: tokenInSymbol, reason });
    }

    if (!this.isTokenAllowedForSwap(tokenOutSymbol)) {
      const reason = this.state.swapLimits.blockedTokens.has(tokenOutSymbol.toUpperCase())
        ? 'blocked'
        : 'not_allowed';
      throw new TokenNotAllowedError({ token: tokenOutSymbol, reason });
    }

    // Check price impact
    if (priceImpact !== undefined && priceImpact > this.state.swapLimits.maxPriceImpactPercent) {
      throw new PriceImpactTooHighError({
        priceImpact,
        maxAllowed: this.state.swapLimits.maxPriceImpactPercent,
      });
    }

    const formattedValue = formatUnits(usdValue, USD_DECIMALS);

    // Check per-transaction limit
    if (usdValue > this.state.swapLimits.perTransaction) {
      throw new SwapLimitError({
        type: 'transaction',
        requested: formattedValue,
        limit: formatUnits(this.state.swapLimits.perTransaction, USD_DECIMALS),
      });
    }

    // Check daily limit
    const dailySpent = this.getSwapSpentInWindow(24 * 60 * 60 * 1000);
    const dailyRemaining = this.state.swapLimits.perDay - dailySpent;

    if (usdValue > dailyRemaining) {
      const resetsAt = this.getSwapWindowResetTime(24 * 60 * 60 * 1000);
      throw new SwapLimitError({
        type: 'daily',
        requested: formattedValue,
        remaining: formatUnits(dailyRemaining > 0n ? dailyRemaining : 0n, USD_DECIMALS),
        resetsAt,
      });
    }
  }

  /**
   * Record a successful swap transaction
   */
  recordSwapSpend(tokenInSymbol: string, tokenOutSymbol: string, usdValue: bigint): void {
    const now = Date.now();

    this.state.swapHistory.push({
      tokenIn: tokenInSymbol.toUpperCase(),
      tokenOut: tokenOutSymbol.toUpperCase(),
      usdValue,
      timestamp: now,
    });

    // Clean up old history
    this.cleanupSwapHistory();
  }

  /**
   * Get swap spending status
   */
  getSwapStatus(): {
    perTransaction: { limit: string; available: string };
    daily: { limit: string; used: string; remaining: string; resetsAt: Date };
    maxSlippagePercent: number;
    maxPriceImpactPercent: number;
    allowedTokens: string[] | null;
    blockedTokens: string[];
  } {
    const dailySpent = this.getSwapSpentInWindow(24 * 60 * 60 * 1000);
    const dailyRemaining = this.state.swapLimits.perDay > dailySpent
      ? this.state.swapLimits.perDay - dailySpent
      : 0n;

    return {
      perTransaction: {
        limit: formatUnits(this.state.swapLimits.perTransaction, USD_DECIMALS),
        available: formatUnits(this.state.swapLimits.perTransaction, USD_DECIMALS),
      },
      daily: {
        limit: formatUnits(this.state.swapLimits.perDay, USD_DECIMALS),
        used: formatUnits(dailySpent, USD_DECIMALS),
        remaining: formatUnits(dailyRemaining, USD_DECIMALS),
        resetsAt: this.getSwapWindowResetTime(24 * 60 * 60 * 1000),
      },
      maxSlippagePercent: this.state.swapLimits.maxSlippagePercent,
      maxPriceImpactPercent: this.state.swapLimits.maxPriceImpactPercent,
      allowedTokens: this.state.swapLimits.allowedTokens
        ? Array.from(this.state.swapLimits.allowedTokens)
        : null,
      blockedTokens: Array.from(this.state.swapLimits.blockedTokens),
    };
  }

  /**
   * Get maximum USD value for a swap considering limits
   */
  getMaxSwapUSD(): bigint {
    if (this.state.stopped) return 0n;

    const dailyRemaining = this.state.swapLimits.perDay - this.getSwapSpentInWindow(24 * 60 * 60 * 1000);

    // Return the minimum of per-transaction and daily remaining
    let max = this.state.swapLimits.perTransaction;
    if (dailyRemaining < max) max = dailyRemaining;

    return max > 0n ? max : 0n;
  }

  private getSwapSpentInWindow(windowMs: number): bigint {
    const cutoff = Date.now() - windowMs;
    return this.state.swapHistory
      .filter((r) => r.timestamp >= cutoff)
      .reduce((sum, r) => sum + r.usdValue, 0n);
  }

  private getSwapWindowResetTime(windowMs: number): Date {
    const cutoff = Date.now() - windowMs;
    const filtered = this.state.swapHistory
      .filter((r) => r.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);

    const oldest = filtered[0];
    if (oldest) {
      return new Date(oldest.timestamp + windowMs);
    }
    return new Date();
  }

  private cleanupSwapHistory(): void {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.state.swapHistory = this.state.swapHistory.filter((r) => r.timestamp >= weekAgo);
  }

  /**
   * Get current limit status
   */
  getStatus(): {
    perTransaction: { limit: string; available: string };
    hourly: { limit: string; used: string; remaining: string; resetsAt: Date };
    daily: { limit: string; used: string; remaining: string; resetsAt: Date };
    stopped: boolean;
    stopReason?: string;
  } {
    const hourlySpent = this.getSpentInWindow(60 * 60 * 1000);
    const dailySpent = this.getSpentInWindow(24 * 60 * 60 * 1000);

    const result: {
      perTransaction: { limit: string; available: string };
      hourly: { limit: string; used: string; remaining: string; resetsAt: Date };
      daily: { limit: string; used: string; remaining: string; resetsAt: Date };
      stopped: boolean;
      stopReason?: string;
    } = {
      perTransaction: {
        limit: formatETH(this.state.perTransaction),
        available: formatETH(this.state.perTransaction),
      },
      hourly: {
        limit: formatETH(this.state.perHour),
        used: formatETH(hourlySpent),
        remaining: formatETH(
          this.state.perHour > hourlySpent ? this.state.perHour - hourlySpent : 0n
        ),
        resetsAt: this.getWindowResetTime(60 * 60 * 1000),
      },
      daily: {
        limit: formatETH(this.state.perDay),
        used: formatETH(dailySpent),
        remaining: formatETH(
          this.state.perDay > dailySpent ? this.state.perDay - dailySpent : 0n
        ),
        resetsAt: this.getWindowResetTime(24 * 60 * 60 * 1000),
      },
      stopped: this.state.stopped,
    };
    if (this.state.stopReason !== undefined) {
      result.stopReason = this.state.stopReason;
    }
    return result;
  }

  /**
   * Get maximum sendable amount considering all limits
   */
  getMaxSendable(): bigint {
    if (this.state.stopped) return 0n;

    const hourlyRemaining = this.state.perHour - this.getSpentInWindow(60 * 60 * 1000);
    const dailyRemaining = this.state.perDay - this.getSpentInWindow(24 * 60 * 60 * 1000);

    // Return the minimum of all limits
    let max = this.state.perTransaction;
    if (hourlyRemaining < max) max = hourlyRemaining;
    if (dailyRemaining < max) max = dailyRemaining;

    return max > 0n ? max : 0n;
  }

  /**
   * Resume operations after emergency stop
   */
  resume(): void {
    this.state.stopped = false;
    delete this.state.stopReason;
  }

  /**
   * Manually trigger emergency stop
   */
  triggerEmergencyStop(reason: string): void {
    this.state.stopped = true;
    this.state.stopReason = reason;
  }

  /**
   * Update limits
   */
  updateLimits(limits: Partial<SpendingLimits>): void {
    if (limits.perTransaction !== undefined) {
      this.state.perTransaction = this.parseLimit(limits.perTransaction, this.state.perTransaction);
    }
    if (limits.perHour !== undefined) {
      this.state.perHour = this.parseLimit(limits.perHour, this.state.perHour);
    }
    if (limits.perDay !== undefined) {
      this.state.perDay = this.parseLimit(limits.perDay, this.state.perDay);
    }
    if (limits.perWeek !== undefined) {
      this.state.perWeek = this.parseLimit(limits.perWeek, this.state.perWeek);
    }
    if (limits.maxGasPerHour !== undefined) {
      this.state.maxGasPerHour = this.parseLimit(limits.maxGasPerHour, this.state.maxGasPerHour);
    }
    if (limits.maxGasPerDay !== undefined) {
      this.state.maxGasPerDay = this.parseLimit(limits.maxGasPerDay, this.state.maxGasPerDay);
    }
    if (limits.emergencyStop) {
      if (limits.emergencyStop.haltIfSpentPercent !== undefined) {
        this.state.emergencyStop.haltIfSpentPercent = limits.emergencyStop.haltIfSpentPercent;
      }
      if (limits.emergencyStop.minBalanceRequired !== undefined) {
        this.state.emergencyStop.minBalanceRequired = this.parseLimit(
          limits.emergencyStop.minBalanceRequired,
          this.state.emergencyStop.minBalanceRequired
        );
      }
    }
  }

  private parseLimit(value: string | bigint | undefined, defaultValue: bigint): bigint {
    if (value === undefined) return defaultValue;
    if (typeof value === 'bigint') return value;
    return parseAmount(value);
  }

  private getSpentInWindow(windowMs: number): bigint {
    const cutoff = Date.now() - windowMs;
    return this.state.history
      .filter((r) => r.timestamp >= cutoff)
      .reduce((sum, r) => sum + r.amount, 0n);
  }

  private getGasSpentInWindow(windowMs: number): bigint {
    const cutoff = Date.now() - windowMs;
    return this.state.gasHistory
      .filter((r) => r.timestamp >= cutoff)
      .reduce((sum, r) => sum + r.amount, 0n);
  }

  private getWindowResetTime(windowMs: number): Date {
    // Find oldest record in window
    const cutoff = Date.now() - windowMs;
    const oldestInWindow = this.state.history
      .filter((r) => r.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (oldestInWindow) {
      // Window resets when oldest record expires
      return new Date(oldestInWindow.timestamp + windowMs);
    }

    // No records, reset is now
    return new Date();
  }

  private cleanupHistory(): void {
    // Keep only last week of history
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.state.history = this.state.history.filter((r) => r.timestamp >= weekAgo);
    this.state.gasHistory = this.state.gasHistory.filter((r) => r.timestamp >= weekAgo);
  }
}

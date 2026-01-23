/**
 * Ethereum unit conversions
 * ETH, GWEI, WEI and token unit handling
 */

// Wei is the smallest unit of ether
// 1 ETH = 10^18 Wei
// 1 GWEI = 10^9 Wei

const WEI_PER_ETH = 10n ** 18n;
const WEI_PER_GWEI = 10n ** 9n;

/**
 * Convert ETH to Wei
 */
export function ETH(amount: number | string): bigint {
  return parseUnits(String(amount), 18);
}

/**
 * Convert GWEI to Wei
 */
export function GWEI(amount: number | string): bigint {
  return parseUnits(String(amount), 9);
}

/**
 * Create Wei value directly
 */
export function WEI(amount: number | bigint | string): bigint {
  if (typeof amount === 'bigint') return amount;
  if (typeof amount === 'number') return BigInt(amount);
  return BigInt(amount);
}

/**
 * Parse a human-readable amount string with optional unit
 * Examples: "1.5 ETH", "100 GWEI", "1000000", "1000 USDC"
 */
export function parseAmount(amount: string, defaultDecimals = 18): bigint {
  const normalized = amount.trim().toUpperCase();

  // Check for unit suffix
  if (normalized.endsWith(' ETH') || normalized.endsWith('ETH')) {
    const value = normalized.replace(/\s*ETH$/i, '').trim();
    return parseUnits(value, 18);
  }

  if (normalized.endsWith(' GWEI') || normalized.endsWith('GWEI')) {
    const value = normalized.replace(/\s*GWEI$/i, '').trim();
    return parseUnits(value, 9);
  }

  if (normalized.endsWith(' WEI') || normalized.endsWith('WEI')) {
    const value = normalized.replace(/\s*WEI$/i, '').trim();
    return BigInt(value);
  }

  // No unit specified, use default decimals
  // If the value contains a decimal point, parse with decimals
  if (amount.includes('.')) {
    return parseUnits(amount, defaultDecimals);
  }

  // Otherwise treat as raw integer
  return BigInt(amount);
}

/**
 * Parse a decimal string with given decimals
 * e.g., parseUnits("1.5", 18) = 1500000000000000000n
 */
export function parseUnits(value: string, decimals: number): bigint {
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }

  const normalized = value.trim();

  // Handle negative values
  const negative = normalized.startsWith('-');
  const abs = negative ? normalized.slice(1) : normalized;

  // Split by decimal point
  const parts = abs.split('.');

  if (parts.length > 2) {
    throw new Error(`Invalid number: ${value}`);
  }

  const intPart = parts[0] ?? '0';
  let fracPart = parts[1] ?? '';

  // Validate parts are numeric
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new Error(`Invalid number: ${value}`);
  }

  // Truncate or pad fractional part to match decimals
  if (fracPart.length > decimals) {
    // Truncate (not round) excess decimals
    fracPart = fracPart.slice(0, decimals);
  } else {
    // Pad with zeros
    fracPart = fracPart.padEnd(decimals, '0');
  }

  const combined = intPart + fracPart;
  const result = BigInt(combined);

  return negative ? -result : result;
}

/**
 * Format Wei to a decimal string with given decimals
 * e.g., formatUnits(1500000000000000000n, 18) = "1.5"
 */
export function formatUnits(value: bigint, decimals: number): string {
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;

  const str = abs.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, -decimals) || '0';
  const fracPart = str.slice(-decimals);

  // Remove trailing zeros from fractional part
  const trimmedFrac = fracPart.replace(/0+$/, '');

  const result = trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
  return negative ? `-${result}` : result;
}

/**
 * Format Wei to ETH string
 */
export function formatETH(wei: bigint): string {
  return formatUnits(wei, 18);
}

/**
 * Format Wei to GWEI string
 */
export function formatGWEI(wei: bigint): string {
  return formatUnits(wei, 9);
}

/**
 * Format Wei with automatic unit selection and suffix
 */
export function formatAuto(wei: bigint): string {
  const abs = wei < 0n ? -wei : wei;

  if (abs >= WEI_PER_ETH / 1000n) {
    // >= 0.001 ETH: show in ETH
    return `${formatUnits(wei, 18)} ETH`;
  }

  if (abs >= WEI_PER_GWEI) {
    // >= 1 GWEI: show in GWEI
    return `${formatUnits(wei, 9)} GWEI`;
  }

  // Show in Wei
  return `${wei} WEI`;
}

/**
 * Convert between decimal precisions
 * Useful for converting between different token decimals
 */
export function convertDecimals(
  value: bigint,
  fromDecimals: number,
  toDecimals: number
): bigint {
  if (fromDecimals === toDecimals) return value;

  if (fromDecimals < toDecimals) {
    // Multiply to increase precision
    const factor = 10n ** BigInt(toDecimals - fromDecimals);
    return value * factor;
  }

  // Divide to decrease precision (truncates)
  const factor = 10n ** BigInt(fromDecimals - toDecimals);
  return value / factor;
}

/**
 * Common token decimals
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  WETH: 18,
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WBTC: 8,
};

/**
 * Get decimals for a token symbol
 */
export function getTokenDecimals(symbol: string): number {
  const decimals = TOKEN_DECIMALS[symbol.toUpperCase()];
  if (decimals === undefined) {
    throw new Error(`Unknown token: ${symbol}. Specify decimals explicitly.`);
  }
  return decimals;
}

/**
 * Parse token amount with symbol
 * e.g., parseTokenAmount("1000 USDC") = 1000000000n (6 decimals)
 */
export function parseTokenAmount(amount: string): { value: bigint; symbol?: string } {
  const normalized = amount.trim();

  // Try to extract symbol
  const match = /^([\d.]+)\s*([A-Za-z]+)$/.exec(normalized);

  if (match) {
    const valueStr = match[1];
    const symbol = match[2];

    if (!valueStr || !symbol) {
      throw new Error(`Invalid token amount: ${amount}`);
    }

    const decimals = TOKEN_DECIMALS[symbol.toUpperCase()];

    if (decimals !== undefined) {
      return {
        value: parseUnits(valueStr, decimals),
        symbol: symbol.toUpperCase(),
      };
    }

    // Unknown symbol, return as-is with 18 decimals (ETH default)
    return {
      value: parseUnits(valueStr, 18),
      symbol: symbol.toUpperCase(),
    };
  }

  // No symbol, parse with default 18 decimals
  return { value: parseAmount(normalized) };
}

/**
 * Multiply a value by a percentage (with precision)
 * e.g., mulPercent(100, 1.5) = 101 (for 1.5% increase)
 */
export function mulPercent(value: bigint, percent: number): bigint {
  // Use 10000 for 0.01% precision
  const factor = BigInt(Math.round(percent * 100));
  return (value * factor) / 10000n;
}

/**
 * Add a percentage to a value
 */
export function addPercent(value: bigint, percent: number): bigint {
  const addition = mulPercent(value, percent);
  return value + addition;
}

/**
 * Calculate the percentage of a total
 */
export function toPercent(value: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((value * 10000n) / total) / 100;
}

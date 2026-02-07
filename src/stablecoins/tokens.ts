/**
 * Well-known stablecoin addresses across chains
 */

export interface StablecoinInfo {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Record<number, string>; // chainId -> address
}

/**
 * USDC - USD Coin (Circle)
 */
export const USDC: StablecoinInfo = {
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  addresses: {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',       // Ethereum Mainnet
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',      // Optimism
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',     // Polygon
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',   // Arbitrum One
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',    // Base
    43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',   // Avalanche
    56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',      // BNB Chain
    11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia
    84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',    // Base Sepolia
  },
};

/**
 * USDT - Tether USD
 */
export const USDT: StablecoinInfo = {
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  addresses: {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',       // Ethereum Mainnet
    10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',      // Optimism
    137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',     // Polygon
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',   // Arbitrum One
    8453: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',    // Base
    43114: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',   // Avalanche
    56: '0x55d398326f99059fF775485246999027B3197955',      // BNB Chain
  },
};

/**
 * USDS - Sky USD (formerly DAI, rebranded from MakerDAO to Sky)
 */
export const USDS: StablecoinInfo = {
  symbol: 'USDS',
  name: 'Sky USD',
  decimals: 18,
  addresses: {
    1: '0xdC035D45d973E3EC169d2276DDab16f1e407384F',       // Ethereum Mainnet
    8453: '0x820C137fa70C8691f0e44Dc420a5e53c168921Dc',    // Base
  },
};

/**
 * DAI - Legacy Dai Stablecoin (MakerDAO)
 * Note: MakerDAO has rebranded to Sky and DAI is being migrated to USDS
 */
export const DAI: StablecoinInfo = {
  symbol: 'DAI',
  name: 'Dai Stablecoin',
  decimals: 18,
  addresses: {
    1: '0x6B175474E89094C44Da98b954EesdFDC1B0A7D',         // Ethereum Mainnet
    10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',      // Optimism
    137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',     // Polygon
    42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',   // Arbitrum One
    8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',    // Base
    43114: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',   // Avalanche
    56: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',      // BNB Chain
  },
};

/**
 * PYUSD - PayPal USD
 */
export const PYUSD: StablecoinInfo = {
  symbol: 'PYUSD',
  name: 'PayPal USD',
  decimals: 6,
  addresses: {
    1: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',       // Ethereum Mainnet
  },
};

/**
 * FRAX - Frax Stablecoin
 */
export const FRAX: StablecoinInfo = {
  symbol: 'FRAX',
  name: 'Frax',
  decimals: 18,
  addresses: {
    1: '0x853d955aCEf822Db058eb8505911ED77F175b99e',       // Ethereum Mainnet
    10: '0x2E3D870790dC77A83DD1d18184Acc7439A53f475',      // Optimism
    137: '0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89',     // Polygon
    42161: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',   // Arbitrum One
    43114: '0xD24C2Ad096400B6FBcd2ad8B24E7acBc21A1da64',   // Avalanche
  },
};

/**
 * All supported stablecoins
 */
export const STABLECOINS = {
  USDC,
  USDT,
  USDS,
  DAI,
  PYUSD,
  FRAX,
} as const;

export type StablecoinSymbol = keyof typeof STABLECOINS;

/**
 * Get stablecoin address for a specific chain
 */
export function getStablecoinAddress(
  stablecoin: StablecoinInfo,
  chainId: number
): string | undefined {
  return stablecoin.addresses[chainId];
}

/**
 * Get all stablecoin addresses for a chain
 */
export function getStablecoinsForChain(chainId: number): Map<StablecoinSymbol, string> {
  const result = new Map<StablecoinSymbol, string>();
  for (const [symbol, info] of Object.entries(STABLECOINS)) {
    const address = info.addresses[chainId];
    if (address) {
      result.set(symbol as StablecoinSymbol, address);
    }
  }
  return result;
}

/**
 * Check if an address is a known stablecoin on a chain
 */
export function isKnownStablecoin(address: string, chainId: number): StablecoinInfo | undefined {
  const normalizedAddress = address.toLowerCase();
  for (const info of Object.values(STABLECOINS)) {
    const stablecoinAddress = info.addresses[chainId];
    if (stablecoinAddress?.toLowerCase() === normalizedAddress) {
      return info;
    }
  }
  return undefined;
}

/**
 * Validate and normalize an amount string
 * @returns normalized amount string or throws with reason
 */
export function validateAmountInput(amount: string | number, tokenSymbol: string): string {
  // Handle number input
  if (typeof amount === 'number') {
    if (Number.isNaN(amount)) {
      throw new Error(`Invalid ${tokenSymbol} amount: NaN is not a valid amount`);
    }
    if (!Number.isFinite(amount)) {
      throw new Error(`Invalid ${tokenSymbol} amount: Infinity is not a valid amount`);
    }
    if (amount < 0) {
      throw new Error(`Invalid ${tokenSymbol} amount: negative amounts are not allowed`);
    }
    return amount.toString();
  }

  // Handle string input
  const trimmed = amount.trim();

  if (trimmed === '') {
    throw new Error(`Invalid ${tokenSymbol} amount: amount cannot be empty`);
  }

  // Remove commas (common in formatted numbers like "1,000.50")
  const normalized = trimmed.replace(/,/g, '');

  // Check for negative sign
  if (normalized.startsWith('-')) {
    throw new Error(`Invalid ${tokenSymbol} amount: negative amounts are not allowed`);
  }

  // Check for multiple decimal points
  const decimalCount = (normalized.match(/\./g) ?? []).length;
  if (decimalCount > 1) {
    throw new Error(`Invalid ${tokenSymbol} amount: multiple decimal points found`);
  }

  // Check for scientific notation (not supported for precision reasons)
  if (/[eE]/.test(normalized)) {
    throw new Error(`Invalid ${tokenSymbol} amount: scientific notation is not supported`);
  }

  // Check that it's a valid number pattern (digits, optional decimal, more digits)
  if (!/^\d*\.?\d*$/.test(normalized)) {
    throw new Error(`Invalid ${tokenSymbol} amount: contains invalid characters`);
  }

  // Check it's not just a decimal point
  if (normalized === '.') {
    throw new Error(`Invalid ${tokenSymbol} amount: amount cannot be just a decimal point`);
  }

  // Ensure there's at least one digit
  if (!/\d/.test(normalized)) {
    throw new Error(`Invalid ${tokenSymbol} amount: no digits found`);
  }

  return normalized;
}

/**
 * Parse stablecoin amount from human-readable string
 * Handles decimals correctly (USDC=6, USDS=18)
 * @throws Error if amount is invalid (empty, negative, NaN, etc.)
 */
export function parseStablecoinAmount(amount: string | number, stablecoin: StablecoinInfo): bigint {
  const amountStr = validateAmountInput(amount, stablecoin.symbol);
  const [whole = '0', fraction = ''] = amountStr.split('.');
  const wholeNormalized = whole === '' ? '0' : whole;
  const paddedFraction = fraction.padEnd(stablecoin.decimals, '0').slice(0, stablecoin.decimals);
  return BigInt(wholeNormalized + paddedFraction);
}

/**
 * Format stablecoin amount to human-readable string
 */
export function formatStablecoinAmount(amount: bigint, stablecoin: StablecoinInfo): string {
  const amountStr = amount.toString().padStart(stablecoin.decimals + 1, '0');
  const whole = amountStr.slice(0, -stablecoin.decimals) || '0';
  const fraction = amountStr.slice(-stablecoin.decimals);

  // Trim trailing zeros from fraction
  const trimmedFraction = fraction.replace(/0+$/, '');

  if (trimmedFraction) {
    return `${whole}.${trimmedFraction}`;
  }
  return whole;
}

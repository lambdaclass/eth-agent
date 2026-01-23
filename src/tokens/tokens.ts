/**
 * General token registry
 * Common tokens across Ethereum and L2s
 */

// Import stablecoins for use in this module
import {
  type StablecoinInfo,
  type StablecoinSymbol,
  STABLECOINS,
  USDC,
  USDT,
  USDS,
  DAI,
  PYUSD,
  FRAX,
  getStablecoinAddress,
  getStablecoinsForChain,
  isKnownStablecoin,
  parseStablecoinAmount,
  formatStablecoinAmount,
  validateAmountInput,
} from '../stablecoins/index.js';

// Re-export stablecoin types and utilities for convenience
export {
  type StablecoinInfo,
  type StablecoinSymbol,
  STABLECOINS,
  USDC,
  USDT,
  USDS,
  DAI,
  PYUSD,
  FRAX,
  getStablecoinAddress,
  getStablecoinsForChain,
  isKnownStablecoin,
  parseStablecoinAmount,
  formatStablecoinAmount,
};

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Record<number, string>; // chainId -> address
  isNative?: boolean;
}

/**
 * Native ETH placeholder - uses zero address
 * When swapping, the router handles wrapping/unwrapping
 */
export const ETH_TOKEN: TokenInfo = {
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  addresses: {
    1: '0x0000000000000000000000000000000000000000',
    10: '0x0000000000000000000000000000000000000000',
    137: '0x0000000000000000000000000000000000000000',
    42161: '0x0000000000000000000000000000000000000000',
    8453: '0x0000000000000000000000000000000000000000',
    43114: '0x0000000000000000000000000000000000000000',
    56: '0x0000000000000000000000000000000000000000',
    11155111: '0x0000000000000000000000000000000000000000',
  },
  isNative: true,
};

/**
 * WETH - Wrapped Ether
 */
export const WETH: TokenInfo = {
  symbol: 'WETH',
  name: 'Wrapped Ether',
  decimals: 18,
  addresses: {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',       // Ethereum Mainnet
    10: '0x4200000000000000000000000000000000000006',      // Optimism
    137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',     // Polygon (bridged WETH)
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',   // Arbitrum One
    8453: '0x4200000000000000000000000000000000000006',    // Base
    43114: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',   // Avalanche
    56: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',      // BNB Chain
    11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia
  },
};

/**
 * UNI - Uniswap Token
 */
export const UNI: TokenInfo = {
  symbol: 'UNI',
  name: 'Uniswap',
  decimals: 18,
  addresses: {
    1: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',       // Ethereum Mainnet
    10: '0x6fd9d7AD17242c41f7131d257212c54A0e816691',      // Optimism
    137: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',     // Polygon
    42161: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',   // Arbitrum One
    8453: '0xc3De830EA07524a0761646a6a4e4be0e114a3C83',    // Base
  },
};

/**
 * LINK - Chainlink Token
 */
export const LINK: TokenInfo = {
  symbol: 'LINK',
  name: 'Chainlink',
  decimals: 18,
  addresses: {
    1: '0x514910771AF9Ca656af840dff83E8264EcF986CA',       // Ethereum Mainnet
    10: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',      // Optimism
    137: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',     // Polygon
    42161: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',   // Arbitrum One
    8453: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',    // Base
    43114: '0x5947BB275c521040051D82396192181b413227A3',   // Avalanche
    56: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',      // BNB Chain
  },
};

/**
 * WBTC - Wrapped Bitcoin
 */
export const WBTC: TokenInfo = {
  symbol: 'WBTC',
  name: 'Wrapped Bitcoin',
  decimals: 8,
  addresses: {
    1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',       // Ethereum Mainnet
    10: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',      // Optimism
    137: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',     // Polygon
    42161: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',   // Arbitrum One
    43114: '0x50b7545627a5162F82A992c33b87aDc75187B218',   // Avalanche
  },
};

/**
 * AAVE - Aave Token
 */
export const AAVE: TokenInfo = {
  symbol: 'AAVE',
  name: 'Aave',
  decimals: 18,
  addresses: {
    1: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',       // Ethereum Mainnet
    10: '0x76FB31fb4af56892A25e32cFC43De717950c9278',      // Optimism
    137: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',     // Polygon
    42161: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196',   // Arbitrum One
    43114: '0x63a72806098Bd3D9520cC43356dD78afe5D386D9',   // Avalanche
  },
};

/**
 * CRV - Curve DAO Token
 */
export const CRV: TokenInfo = {
  symbol: 'CRV',
  name: 'Curve DAO Token',
  decimals: 18,
  addresses: {
    1: '0xD533a949740bb3306d119CC777fa900bA034cd52',       // Ethereum Mainnet
    10: '0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53',      // Optimism
    137: '0x172370d5Cd63279eFa6d502DAB29171933a610AF',     // Polygon
    42161: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978',   // Arbitrum One
    43114: '0x249848BeCA43aC405b8102Ec90Dd5F22CA513c06',   // Avalanche
  },
};

/**
 * MKR - Maker Token
 */
export const MKR: TokenInfo = {
  symbol: 'MKR',
  name: 'Maker',
  decimals: 18,
  addresses: {
    1: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',       // Ethereum Mainnet
  },
};

/**
 * SNX - Synthetix Token
 */
export const SNX: TokenInfo = {
  symbol: 'SNX',
  name: 'Synthetix',
  decimals: 18,
  addresses: {
    1: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',       // Ethereum Mainnet
    10: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4',      // Optimism
    137: '0x50B728D8D964fd00C2d0AAD81718b71311feF68a',     // Polygon
  },
};

/**
 * LDO - Lido DAO Token
 */
export const LDO: TokenInfo = {
  symbol: 'LDO',
  name: 'Lido DAO',
  decimals: 18,
  addresses: {
    1: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',       // Ethereum Mainnet
    10: '0xFdb794692724153d1488CcdBE0C56c252596735F',      // Optimism
    137: '0xC3C7d422809852031b44ab29EEC9F1EfF2A58756',     // Polygon
    42161: '0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60',   // Arbitrum One
  },
};

/**
 * All supported non-stablecoin tokens
 */
export const TOKENS = {
  ETH: ETH_TOKEN,
  WETH,
  UNI,
  LINK,
  WBTC,
  AAVE,
  CRV,
  MKR,
  SNX,
  LDO,
} as const;

export type TokenSymbol = keyof typeof TOKENS;

/**
 * Get token info by symbol (case-insensitive)
 */
export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
  const normalized = symbol.toUpperCase();
  return TOKENS[normalized as TokenSymbol];
}

/**
 * Get token address for a specific chain
 */
export function getTokenAddress(token: TokenInfo, chainId: number): string | undefined {
  return token.addresses[chainId];
}

/**
 * Get all tokens available on a chain
 */
export function getTokensForChain(chainId: number): Map<string, string> {
  const result = new Map<string, string>();
  for (const [symbol, info] of Object.entries(TOKENS)) {
    const address = info.addresses[chainId];
    if (address) {
      result.set(symbol, address);
    }
  }
  return result;
}

/**
 * Check if a symbol is a known token (non-stablecoin)
 */
export function isKnownToken(symbol: string): boolean {
  return getTokenBySymbol(symbol) !== undefined;
}

/**
 * Resolve a token from ticker symbol (supports both tokens and stablecoins)
 * Returns the token info and address for the given chain
 */
export function resolveToken(
  symbolOrAddress: string,
  chainId: number
): { token: TokenInfo; address: string } | undefined {
  // First, try as a direct token lookup
  const normalized = symbolOrAddress.toUpperCase();

  // Check tokens first
  const token = TOKENS[normalized as TokenSymbol];
  if (token) {
    const address = token.addresses[chainId];
    if (address) {
      return { token, address };
    }
    return undefined;
  }

  // Check stablecoins
  const stablecoin = STABLECOINS[normalized as keyof typeof STABLECOINS];
  if (stablecoin) {
    const address = stablecoin.addresses[chainId];
    if (address) {
      return { token: stablecoin, address };
    }
    return undefined;
  }

  // If it looks like an address, return it as a custom token
  if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length === 42) {
    // Return a minimal token info for custom addresses
    return {
      token: {
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18, // Default, caller should verify
        addresses: { [chainId]: symbolOrAddress },
      },
      address: symbolOrAddress,
    };
  }

  return undefined;
}

/**
 * Parse token amount from human-readable string
 * @throws Error if amount is invalid (empty, negative, NaN, etc.)
 */
export function parseTokenAmount(amount: string | number, token: TokenInfo): bigint {
  const amountStr = validateAmountInput(amount, token.symbol);
  const [whole = '0', fraction = ''] = amountStr.split('.');
  const wholeNormalized = whole === '' ? '0' : whole;
  const paddedFraction = fraction.padEnd(token.decimals, '0').slice(0, token.decimals);
  return BigInt(wholeNormalized + paddedFraction);
}

/**
 * Format token amount to human-readable string
 */
export function formatTokenAmount(amount: bigint, token: TokenInfo): string {
  const amountStr = amount.toString().padStart(token.decimals + 1, '0');
  const whole = amountStr.slice(0, -token.decimals) || '0';
  const fraction = amountStr.slice(-token.decimals);

  // Trim trailing zeros from fraction
  const trimmedFraction = fraction.replace(/0+$/, '');

  if (trimmedFraction) {
    return `${whole}.${trimmedFraction}`;
  }
  return whole;
}

/**
 * Check if a token is native ETH
 */
export function isNativeETH(token: TokenInfo): boolean {
  return token.isNative === true || token.symbol === 'ETH';
}

/**
 * Get WETH address for a chain (commonly needed for swaps involving ETH)
 */
export function getWETHAddress(chainId: number): string | undefined {
  return WETH.addresses[chainId];
}

/**
 * Across Protocol constants and contract addresses
 * Official Across V3 deployment addresses
 */

import type { Address } from '../../core/types.js';

/**
 * Across SpokePool configuration per chain
 */
export interface AcrossChainConfig {
  /** SpokePool contract address */
  spokePool: Address;
  /** Supported tokens on this chain */
  supportedTokens: Record<string, Address>;
}

/**
 * Across SpokePool contract addresses by chain ID
 * These are the V3 SpokePool contracts
 */
export const ACROSS_CONTRACTS: Record<number, AcrossChainConfig> = {
  // Ethereum Mainnet
  1: {
    spokePool: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5' as Address,
    supportedTokens: {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
      DAI: '0x6B175474E89094C44Da98b954EescdeCB5c811111' as Address,
      WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address,
    },
  },
  // Optimism
  10: {
    spokePool: '0x6f26Bf09B1C792e3228e5467807a900A503c0281' as Address,
    supportedTokens: {
      USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,
      'USDC.e': '0x7F5c764cBc14f9669B88837ca1490cCa17c31607' as Address,
      USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' as Address,
      WETH: '0x4200000000000000000000000000000000000006' as Address,
      DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as Address,
      WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095' as Address,
    },
  },
  // Arbitrum One
  42161: {
    spokePool: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A' as Address,
    supportedTokens: {
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
      'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as Address,
      USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
      WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as Address,
      DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as Address,
      WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as Address,
    },
  },
  // Base
  8453: {
    spokePool: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64' as Address,
    supportedTokens: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
      USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as Address,
      WETH: '0x4200000000000000000000000000000000000006' as Address,
      DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' as Address,
    },
  },
  // Polygon PoS
  137: {
    spokePool: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096' as Address,
    supportedTokens: {
      USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as Address,
      'USDC.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Address,
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as Address,
      WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' as Address,
      DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' as Address,
      WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6' as Address,
    },
  },
  // zkSync Era
  324: {
    spokePool: '0xE0B015E54d54fc84a6cB9B666099c46adE9335FF' as Address,
    supportedTokens: {
      USDC: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4' as Address,
      WETH: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91' as Address,
    },
  },
  // Linea
  59144: {
    spokePool: '0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75' as Address,
    supportedTokens: {
      USDC: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff' as Address,
      WETH: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f' as Address,
    },
  },

  // ============ Testnets ============

  // Ethereum Sepolia
  11155111: {
    spokePool: '0x5ef6C01E11889d86803e0B23e3cB3F9E9d97B662' as Address,
    supportedTokens: {
      USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
      WETH: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as Address,
    },
  },
  // Arbitrum Sepolia
  421614: {
    spokePool: '0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75' as Address,
    supportedTokens: {
      USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as Address,
      WETH: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73' as Address,
    },
  },
  // Base Sepolia
  84532: {
    spokePool: '0x82B564983aE7274c86695917BBf8C99ECb6F0F8F' as Address,
    supportedTokens: {
      USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
      WETH: '0x4200000000000000000000000000000000000006' as Address,
    },
  },
} as const;

/**
 * Across API endpoints
 */
export const ACROSS_API = {
  /** Mainnet API */
  mainnet: 'https://app.across.to/api',
  /** Testnet API */
  testnet: 'https://testnet.across.to/api',
} as const;

/**
 * Get Across config for a chain
 */
export function getAcrossConfig(chainId: number): AcrossChainConfig | undefined {
  return ACROSS_CONTRACTS[chainId];
}

/**
 * Get all supported Across chain IDs
 */
export function getSupportedAcrossChains(): number[] {
  return Object.keys(ACROSS_CONTRACTS).map(Number);
}

/**
 * Check if chain is a testnet
 */
export function isAcrossTestnet(chainId: number): boolean {
  const testnets = [11155111, 421614, 84532];
  return testnets.includes(chainId);
}

/**
 * Get token address on a specific chain
 */
export function getAcrossTokenAddress(
  chainId: number,
  tokenSymbol: string
): Address | undefined {
  const config = ACROSS_CONTRACTS[chainId];
  if (!config) return undefined;
  const tokens = config.supportedTokens as Record<string, Address>;
  return tokens[tokenSymbol];
}

/**
 * Check if a token is supported on a chain
 */
export function isTokenSupportedOnChain(chainId: number, tokenSymbol: string): boolean {
  const config = ACROSS_CONTRACTS[chainId];
  if (!config) return false;
  return tokenSymbol in config.supportedTokens;
}

/**
 * Chain names for display (extends the ones in constants.ts)
 */
export function getAcrossChainName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    42161: 'Arbitrum',
    8453: 'Base',
    137: 'Polygon',
    324: 'zkSync Era',
    59144: 'Linea',
    11155111: 'Sepolia',
    421614: 'Arb Sepolia',
    84532: 'Base Sepolia',
  };
  return names[chainId] ?? `Chain ${String(chainId)}`;
}

/**
 * CCTP constants and contract addresses
 * Official Circle CCTP deployment addresses
 */

import type { Address } from '../core/types.js';
import type { CCTPDomain } from './types.js';

/**
 * CCTP contract configuration per chain
 */
export interface CCTPChainConfig {
  /** TokenMessenger contract address */
  tokenMessenger: Address;
  /** MessageTransmitter contract address */
  messageTransmitter: Address;
  /** Circle's CCTP domain ID for this chain */
  domain: CCTPDomain;
  /** USDC token address on this chain */
  usdc: Address;
}

/**
 * CCTP contract addresses by chain ID
 * Includes both mainnet and testnet deployments
 */
export const CCTP_CONTRACTS: Record<number, CCTPChainConfig> = {
  // Ethereum Mainnet
  1: {
    tokenMessenger: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155' as Address,
    messageTransmitter: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81' as Address,
    domain: 0,
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
  },
  // Avalanche
  43114: {
    tokenMessenger: '0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982' as Address,
    messageTransmitter: '0x8186359aF5F57FbB40c6b14A588d2A59C0C29880' as Address,
    domain: 1,
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as Address,
  },
  // Optimism
  10: {
    tokenMessenger: '0x2B4069517957735bE00ceE0fadAE88a26365528f' as Address,
    messageTransmitter: '0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8' as Address,
    domain: 2,
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,
  },
  // Arbitrum One
  42161: {
    tokenMessenger: '0x19330d10D9Cc8751218eaf51E8885D058642E08A' as Address,
    messageTransmitter: '0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca' as Address,
    domain: 3,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
  },
  // Base
  8453: {
    tokenMessenger: '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962' as Address,
    messageTransmitter: '0xAD09780d193884d503182aD4588450C416D6F9D4' as Address,
    domain: 6,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  // Polygon PoS
  137: {
    tokenMessenger: '0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE' as Address,
    messageTransmitter: '0xF3be9355363857F3e001be68856A2f96b4C39Ba9' as Address,
    domain: 7,
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as Address,
  },

  // ============ Testnets ============

  // Ethereum Sepolia
  11155111: {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' as Address,
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD' as Address,
    domain: 0,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  },
  // Avalanche Fuji
  43113: {
    tokenMessenger: '0xeb08f243E5d3FCFF26A9E38Ae5520A669f4019d0' as Address,
    messageTransmitter: '0xa9fB1b3009DCb79E2fe346c16a604B8Fa8aE0a79' as Address,
    domain: 1,
    usdc: '0x5425890298aed601595a70AB815c96711a31Bc65' as Address,
  },
  // Optimism Sepolia
  11155420: {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' as Address,
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD' as Address,
    domain: 2,
    usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address,
  },
  // Arbitrum Sepolia
  421614: {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' as Address,
    messageTransmitter: '0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872' as Address,
    domain: 3,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as Address,
  },
  // Base Sepolia
  84532: {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' as Address,
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD' as Address,
    domain: 6,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  },
  // Polygon Amoy
  80002: {
    tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' as Address,
    messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD' as Address,
    domain: 7,
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582' as Address,
  },
} as const;

/**
 * Circle's attestation API endpoints
 */
export const CIRCLE_ATTESTATION_API = {
  /** Mainnet attestation service */
  mainnet: 'https://iris-api.circle.com/v1/attestations',
  /** Testnet attestation service */
  testnet: 'https://iris-api-sandbox.circle.com/v1/attestations',
} as const;

/**
 * Get CCTP config for a chain
 */
export function getCCTPConfig(chainId: number): CCTPChainConfig | undefined {
  return CCTP_CONTRACTS[chainId];
}

/**
 * Get all supported CCTP chain IDs
 */
export function getSupportedCCTPChains(): number[] {
  return Object.keys(CCTP_CONTRACTS).map(Number);
}

/**
 * Check if chain is a testnet
 */
export function isTestnet(chainId: number): boolean {
  const testnets = [11155111, 43113, 11155420, 421614, 84532, 80002];
  return testnets.includes(chainId);
}

/**
 * Get chain name for display
 */
export function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum',
    43114: 'Avalanche',
    10: 'Optimism',
    42161: 'Arbitrum',
    8453: 'Base',
    137: 'Polygon',
    11155111: 'Sepolia',
    43113: 'Fuji',
    11155420: 'OP Sepolia',
    421614: 'Arb Sepolia',
    84532: 'Base Sepolia',
    80002: 'Polygon Amoy',
  };
  return names[chainId] ?? `Chain ${String(chainId)}`;
}

// Wallet state management for the frontend
// In a real app, this would connect to a backend service that manages the wallet

export interface WalletState {
  address: string;
  chainId: number;
  chainName: string;
  connected: boolean;
}

export interface Balance {
  symbol: string;
  name: string;
  balance: string;
  formatted: string;
  decimals: number;
  usdValue?: string;
}

export interface LimitStatus {
  limit: string;
  used: string;
  remaining: string;
  percentage: number;
}

export interface LimitsStatus {
  perTransaction: LimitStatus;
  hourly: LimitStatus;
  daily: LimitStatus;
}

export interface Transaction {
  id: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  blockNumber?: number;
  gasUsed?: string;
}

export interface PendingApproval {
  id: string;
  type: 'transfer';
  to: string;
  toLabel?: string;
  amount: string;
  token: string;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
  requestedAt: number;
  expiresAt: number;
}

export interface AddressEntry {
  address: string;
  label?: string;
  reason?: string;
  addedAt: number;
}

export interface WalletConfig {
  limits: {
    perTransaction: string;
    perHour: string;
    perDay: string;
  };
  trustedAddresses: AddressEntry[];
  blockedAddresses: AddressEntry[];
  requireApprovalWhen: {
    amountExceeds: string;
    recipientIsNew: boolean;
  };
}

// Chain definitions with default RPC URLs
export const CHAINS: Record<number, { name: string; explorer: string; rpcUrl: string }> = {
  1: { name: 'Ethereum', explorer: 'https://etherscan.io', rpcUrl: 'https://eth.llamarpc.com' },
  10: { name: 'Optimism', explorer: 'https://optimistic.etherscan.io', rpcUrl: 'https://mainnet.optimism.io' },
  137: { name: 'Polygon', explorer: 'https://polygonscan.com', rpcUrl: 'https://polygon-rpc.com' },
  42161: { name: 'Arbitrum', explorer: 'https://arbiscan.io', rpcUrl: 'https://arb1.arbitrum.io/rpc' },
  8453: { name: 'Base', explorer: 'https://basescan.org', rpcUrl: 'https://mainnet.base.org' },
  43114: { name: 'Avalanche', explorer: 'https://snowtrace.io', rpcUrl: 'https://api.avax.network/ext/bc/C/rpc' },
  11155111: { name: 'Sepolia', explorer: 'https://sepolia.etherscan.io', rpcUrl: 'https://rpc.sepolia.org' },
};

// Token definitions
export const TOKENS: Record<string, { name: string; decimals: number; color: string }> = {
  ETH: { name: 'Ether', decimals: 18, color: '#627EEA' },
  USDC: { name: 'USD Coin', decimals: 6, color: '#2775CA' },
  USDT: { name: 'Tether', decimals: 6, color: '#50AF95' },
  DAI: { name: 'Dai', decimals: 18, color: '#F5AC37' },
  USDS: { name: 'Sky USD', decimals: 18, color: '#1BAA6E' },
  PYUSD: { name: 'PayPal USD', decimals: 6, color: '#003087' },
  FRAX: { name: 'Frax', decimals: 18, color: '#000000' },
};

export function getExplorerUrl(chainId: number, hash: string, type: 'tx' | 'address' = 'tx'): string {
  const chain = CHAINS[chainId];
  if (!chain) return '';
  return `${chain.explorer}/${type}/${hash}`;
}

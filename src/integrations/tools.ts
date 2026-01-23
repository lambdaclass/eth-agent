/**
 * Universal tool definitions
 * Framework-agnostic tool schemas
 */

import type { AgentWallet } from '../agent/index.js';
import type { Address } from '../core/types.js';
import {
  STABLECOINS,
  getStablecoinsForChain,
} from '../stablecoins/index.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
  metadata: {
    category: 'read' | 'write' | 'info';
    requiresApproval: boolean;
    riskLevel: 'none' | 'low' | 'medium' | 'high';
  };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  summary: string;
}

/**
 * Create tool definitions for a wallet
 */
export function createTools(wallet: AgentWallet): ToolDefinition[] {
  return [
    // === Read Operations ===
    {
      name: 'eth_getBalance',
      description: 'Get the ETH balance of an address. Returns balance in ETH and Wei.',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Ethereum address (0x...) or ENS name. Leave empty for wallet address.',
          },
        },
        required: [],
      },
      handler: async (params) => {
        try {
          const result = await wallet.getBalance(params['address'] as string | undefined);
          return {
            success: true,
            data: result,
            summary: `Balance: ${result.formatted}`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get balance: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'eth_getTokenBalance',
      description: 'Get the ERC20 token balance of an address.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Token contract address (0x...)',
          },
          address: {
            type: 'string',
            description: 'Address to check. Leave empty for wallet address.',
          },
        },
        required: ['token'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.getTokenBalance(
            params['token'] as Address,
            params['address'] as string | undefined
          );
          return {
            success: true,
            data: result,
            summary: `Balance: ${result.formatted} ${result.symbol}`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get token balance: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'eth_getLimits',
      description: 'Get current spending limits and usage.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async () => {
        const limits = wallet.getLimits();
        return {
          success: true,
          data: limits,
          summary: `Daily remaining: ${limits.daily.remaining} ETH, Hourly remaining: ${limits.hourly.remaining} ETH`,
        };
      },
      metadata: {
        category: 'info',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'eth_getCapabilities',
      description: 'Get wallet capabilities and configuration.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async () => {
        const caps = wallet.getCapabilities();
        return {
          success: true,
          data: caps,
          summary: `Wallet ${caps.address} on chain ${caps.network.chainId}`,
        };
      },
      metadata: {
        category: 'info',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    // === Write Operations ===
    {
      name: 'eth_send',
      description: `Send ETH to an address or ENS name. Includes safety checks, simulation, and spending limits.

Example usage:
- Send 0.1 ETH to vitalik.eth
- Send 0.05 ETH to 0x1234...

The transaction will be simulated before sending. Spending limits apply.`,
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address (0x...) or ENS name (e.g., vitalik.eth)',
          },
          amount: {
            type: 'string',
            description: 'Amount to send with unit (e.g., "0.1 ETH", "100 GWEI")',
          },
        },
        required: ['to', 'amount'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.send({
            to: params['to'] as string,
            amount: params['amount'] as string,
          });
          return {
            success: result.success,
            data: result,
            summary: result.summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to send: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'write',
        requiresApproval: true,
        riskLevel: 'high',
      },
    },

    {
      name: 'eth_transferToken',
      description: 'Transfer ERC20 tokens to an address.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Token contract address (0x...)',
          },
          to: {
            type: 'string',
            description: 'Recipient address (0x...) or ENS name',
          },
          amount: {
            type: 'string',
            description: 'Amount to transfer (in token units, e.g., "100" for 100 USDC)',
          },
        },
        required: ['token', 'to', 'amount'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.transferToken({
            token: params['token'] as Address,
            to: params['to'] as string,
            amount: params['amount'] as string,
          });
          return {
            success: result.success,
            data: result,
            summary: result.summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to transfer: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'write',
        requiresApproval: true,
        riskLevel: 'high',
      },
    },

    {
      name: 'eth_preview',
      description: 'Preview a transaction without executing it. Shows costs, simulation results, and any blockers.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address (0x...) or ENS name',
          },
          amount: {
            type: 'string',
            description: 'Amount to send with unit (e.g., "0.1 ETH")',
          },
        },
        required: ['to', 'amount'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.preview({
            to: params['to'] as string,
            amount: params['amount'] as string,
          });

          const summary = result.canExecute
            ? `Can execute. Total cost: ${result.costs.total.eth} ETH`
            : `Cannot execute: ${result.blockers.join(', ')}`;

          return {
            success: true,
            data: result,
            summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to preview: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

// === Swap Operations ===
    {
      name: 'eth_swap',
      description: `Swap tokens using Uniswap V3. Supports ETH, WETH, and any ERC20 token by symbol or address.

Example usage:
- Swap 100 USDC for ETH
- Swap 0.1 ETH for USDC
- Swap 50 UNI for WETH

The swap will be quoted before execution to show expected output. Slippage protection and spending limits apply.`,
      parameters: {
        type: 'object',
        properties: {
          fromToken: {
            type: 'string',
            description: 'Token to swap from - symbol (e.g., "USDC", "ETH", "WETH", "UNI") or contract address',
          },
          toToken: {
            type: 'string',
            description: 'Token to swap to - symbol (e.g., "ETH", "USDC", "WETH") or contract address',
          },
          amount: {
            type: 'string',
            description: 'Amount to swap in human-readable format (e.g., "100" for 100 USDC, "0.5" for 0.5 ETH)',
          },
          slippageTolerance: {
            type: 'number',
            description: 'Maximum slippage tolerance as a percentage (e.g., 0.5 for 0.5%). Default is 0.5%',
          },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.swap({
            fromToken: params['fromToken'] as string,
            toToken: params['toToken'] as string,
            amount: params['amount'] as string,
            slippageTolerance: params['slippageTolerance'] as number | undefined,
          });
          return {
            success: result.success,
            data: result,
            summary: result.summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to swap: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'write',
        requiresApproval: true,
        riskLevel: 'high',
      },
    },

    {
      name: 'eth_getSwapQuote',
      description: 'Get a quote for a token swap without executing it. Shows expected output, price impact, and fees.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: {
            type: 'string',
            description: 'Token to swap from - symbol (e.g., "USDC", "ETH") or contract address',
          },
          toToken: {
            type: 'string',
            description: 'Token to swap to - symbol (e.g., "ETH", "USDC") or contract address',
          },
          amount: {
            type: 'string',
            description: 'Amount to swap in human-readable format (e.g., "100" for 100 USDC)',
          },
          slippageTolerance: {
            type: 'number',
            description: 'Slippage tolerance as a percentage. Default is 0.5%',
          },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.getSwapQuote({
            fromToken: params['fromToken'] as string,
            toToken: params['toToken'] as string,
            amount: params['amount'] as string,
            slippageTolerance: params['slippageTolerance'] as number | undefined,
          });

          const summary = `Quote: ${result.fromToken.amount} ${result.fromToken.symbol} → ${result.toToken.amount} ${result.toToken.symbol} (min: ${result.amountOutMinimum}, impact: ${result.priceImpact.toFixed(2)}%)`;

          return {
            success: true,
            data: result,
            summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get quote: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'eth_getSwapLimits',
      description: 'Get current swap spending limits and usage.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async () => {
        const limits = wallet.getSwapLimits();
        return {
          success: true,
          data: limits,
          summary: `Swap limits - Daily remaining: $${limits.daily.remaining}, Per tx: $${limits.perTransaction.limit}, Max slippage: ${limits.maxSlippagePercent}%`,
        };
      },
      metadata: {
        category: 'info',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    // === Stablecoin Operations ===
    {
      name: 'usdc_send',
      description: `Send USDC to an address or ENS name. Amount is in human-readable units (100 means 100 USDC).

Example usage:
- Send 100 USDC to alice.eth
- Send 50.50 USDC to 0x1234...

Spending limits apply. Transaction will be simulated before sending.`,
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address (0x...) or ENS name (e.g., alice.eth)',
          },
          amount: {
            type: 'string',
            description: 'Amount to send (e.g., "100" for 100 USDC)',
          },
        },
        required: ['to', 'amount'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.sendUSDC({
            to: params['to'] as string,
            amount: params['amount'] as string,
          });

          return {
            success: result.success,
            data: result,
            summary: result.summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to send USDC: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'write',
        requiresApproval: true,
        riskLevel: 'high',
      },
    },

    {
      name: 'usdt_send',
      description: `Send USDT to an address or ENS name. Amount is in human-readable units (100 means 100 USDT).

Example usage:
- Send 100 USDT to alice.eth
- Send 50.50 USDT to 0x1234...

Spending limits apply. Transaction will be simulated before sending.`,
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address (0x...) or ENS name (e.g., alice.eth)',
          },
          amount: {
            type: 'string',
            description: 'Amount to send (e.g., "100" for 100 USDT)',
          },
        },
        required: ['to', 'amount'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.sendUSDT({
            to: params['to'] as string,
            amount: params['amount'] as string,
          });

          return {
            success: result.success,
            data: result,
            summary: result.summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to send USDT: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'write',
        requiresApproval: true,
        riskLevel: 'high',
      },
    },

    {
      name: 'usdc_balance',
      description: 'Get the USDC balance for the wallet or any address.',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Address to check. Leave empty for wallet address.',
          },
        },
        required: [],
      },
      handler: async (params) => {
        try {
          const result = await wallet.getStablecoinBalance(
            STABLECOINS.USDC,
            params['address'] as string | undefined
          );

          return {
            success: true,
            data: result,
            summary: `USDC Balance: ${result.formatted}`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get USDC balance: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'usdt_balance',
      description: 'Get the USDT balance for the wallet or any address.',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Address to check. Leave empty for wallet address.',
          },
        },
        required: [],
      },
      handler: async (params) => {
        try {
          const result = await wallet.getStablecoinBalance(
            STABLECOINS.USDT,
            params['address'] as string | undefined
          );

          return {
            success: true,
            data: result,
            summary: `USDT Balance: ${result.formatted}`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get USDT balance: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'stablecoin_balances',
      description: 'Get all stablecoin balances for the wallet. Returns balances for all supported stablecoins on the current network (USDC, USDT, DAI, etc.).',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Address to check. Leave empty for wallet address.',
          },
        },
        required: [],
      },
      handler: async (params) => {
        try {
          const result = await wallet.getStablecoinBalances(
            params['address'] as string | undefined
          );

          const balancesSummary = Object.entries(result)
            .map(([symbol, bal]) => `${symbol}: ${bal.formatted}`)
            .join(', ');

          return {
            success: true,
            data: result,
            summary: balancesSummary || 'No stablecoins available on this network',
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get stablecoin balances: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    // === Network Information ===
    {
      name: 'network_list',
      description: `List all supported networks with their details. Use this to find available L2 networks for lower fees.

Supported networks include:
- Ethereum Mainnet (mainnet)
- L2s: Arbitrum, Optimism, Base, Polygon, Taiko, Scroll, Linea, zkSync Era
- Testnets: Sepolia, and L2 testnets`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async () => {
        const networks = [
          { name: 'mainnet', chainId: 1, type: 'L1', description: 'Ethereum Mainnet' },
          { name: 'arbitrum', chainId: 42161, type: 'L2', description: 'Arbitrum One - Optimistic rollup, low fees' },
          { name: 'optimism', chainId: 10, type: 'L2', description: 'OP Mainnet - Optimistic rollup, OP Stack' },
          { name: 'base', chainId: 8453, type: 'L2', description: 'Base - Coinbase L2, OP Stack' },
          { name: 'polygon', chainId: 137, type: 'L2', description: 'Polygon PoS - Sidechain, very low fees' },
          { name: 'taiko', chainId: 167000, type: 'L2', description: 'Taiko - Type 1 zkEVM, Ethereum equivalent' },
          { name: 'scroll', chainId: 534352, type: 'L2', description: 'Scroll - zkEVM, EVM equivalent' },
          { name: 'linea', chainId: 59144, type: 'L2', description: 'Linea - zkEVM by Consensys' },
          { name: 'zksync', chainId: 324, type: 'L2', description: 'zkSync Era - zkEVM with native account abstraction' },
          { name: 'sepolia', chainId: 11155111, type: 'testnet', description: 'Ethereum Sepolia Testnet' },
          { name: 'taiko-hekla', chainId: 167009, type: 'testnet', description: 'Taiko Hekla Testnet' },
          { name: 'scroll-sepolia', chainId: 534351, type: 'testnet', description: 'Scroll Sepolia Testnet' },
          { name: 'linea-sepolia', chainId: 59141, type: 'testnet', description: 'Linea Sepolia Testnet' },
          { name: 'zksync-sepolia', chainId: 300, type: 'testnet', description: 'zkSync Sepolia Testnet' },
        ];

        return {
          success: true,
          data: { networks },
          summary: `${networks.filter(n => n.type === 'L2').length} L2 networks available for lower fees: ${networks.filter(n => n.type === 'L2').map(n => n.name).join(', ')}`,
        };
      },
      metadata: {
        category: 'info',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'network_info',
      description: 'Get information about the current network including chain ID and available stablecoins.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async () => {
        try {
          const caps = wallet.getCapabilities();
          const chainId = caps.network.chainId;
          const available = getStablecoinsForChain(chainId);

          const networkNames: Record<number, string> = {
            1: 'Ethereum Mainnet',
            10: 'Optimism',
            137: 'Polygon',
            42161: 'Arbitrum One',
            8453: 'Base',
            43114: 'Avalanche',
            56: 'BNB Chain',
            167000: 'Taiko',
            534352: 'Scroll',
            59144: 'Linea',
            324: 'zkSync Era',
            11155111: 'Sepolia',
            167009: 'Taiko Hekla',
            534351: 'Scroll Sepolia',
            59141: 'Linea Sepolia',
            300: 'zkSync Sepolia',
          };

          return {
            success: true,
            data: {
              chainId,
              name: networkNames[chainId] || `Chain ${chainId}`,
              walletAddress: caps.address,
              availableStablecoins: Array.from(available.keys()),
            },
            summary: `Connected to ${networkNames[chainId] || `Chain ${chainId}`} (${chainId}). Stablecoins: ${Array.from(available.keys()).join(', ') || 'none'}`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get network info: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'info',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },
  ];
}

/**
 * Get tool by name
 */
export function getTool(tools: ToolDefinition[], name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  tools: ToolDefinition[],
  name: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const tool = getTool(tools, name);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
      summary: `Tool "${name}" not found`,
    };
  }

  return tool.handler(params);
}

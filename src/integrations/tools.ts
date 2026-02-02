/**
 * Universal tool definitions
 * Framework-agnostic tool schemas
 */

import type { AgentWallet } from '../agent/index.js';
import type { Address, Hash, Hex } from '../core/types.js';
import { STABLECOINS, type StablecoinInfo, getStablecoinAddress } from '../stablecoins/tokens.js';
import { RPCClient } from '../protocol/rpc.js';

/**
 * Resolve stablecoin by symbol
 */
function resolveStablecoin(symbol: string): StablecoinInfo | undefined {
  const upper = symbol.toUpperCase();
  return STABLECOINS[upper as keyof typeof STABLECOINS];
}

/**
 * Supported chain IDs for bridging with human-readable names
 */
const SUPPORTED_CHAINS: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  // Testnets
  11155111: 'Sepolia',
  11155420: 'OP Sepolia',
  84532: 'Base Sepolia',
  421614: 'Arbitrum Sepolia',
  80002: 'Polygon Amoy',
  43113: 'Avalanche Fuji',
};

/**
 * Default public RPC URLs for supported chains
 * Used for verifying bridged tokens on destination chains
 */
const DEFAULT_RPC_URLS: Record<number, string> = {
  1: 'https://eth.llamarpc.com',
  10: 'https://mainnet.optimism.io',
  137: 'https://polygon-rpc.com',
  8453: 'https://mainnet.base.org',
  42161: 'https://arb1.arbitrum.io/rpc',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
  // Testnets
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  11155420: 'https://sepolia.optimism.io',
  84532: 'https://sepolia.base.org',
  421614: 'https://sepolia-rollup.arbitrum.io/rpc',
  80002: 'https://rpc-amoy.polygon.technology',
  43113: 'https://api.avax-test.network/ext/bc/C/rpc',
};

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
      name: 'eth_sendStablecoin',
      description: `Send stablecoins (USDC, USDT, DAI, etc.) to an address. Human-readable amounts - no decimals needed.

Example usage:
- Send 100 USDC to alice.eth
- Send 50.25 USDT to 0x1234...

Supported tokens: USDC, USDT, USDS, DAI, PYUSD, FRAX
Spending limits apply.`,
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Stablecoin symbol: USDC, USDT, USDS, DAI, PYUSD, or FRAX',
            enum: ['USDC', 'USDT', 'USDS', 'DAI', 'PYUSD', 'FRAX'],
          },
          to: {
            type: 'string',
            description: 'Recipient address (0x...) or ENS name (e.g., alice.eth)',
          },
          amount: {
            type: 'string',
            description: 'Amount to send in human-readable format (e.g., "100" for 100 USDC)',
          },
        },
        required: ['token', 'to', 'amount'],
      },
      handler: async (params) => {
        try {
          const stablecoin = resolveStablecoin(params['token'] as string);
          if (!stablecoin) {
            const tokenName = String(params['token']);
            return {
              success: false,
              error: `Unknown stablecoin: ${tokenName}. Supported: USDC, USDT, USDS, DAI, PYUSD, FRAX`,
              summary: `Unknown stablecoin: ${tokenName}`,
            };
          }

          const result = await wallet.sendStablecoin({
            token: stablecoin,
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
            summary: `Failed to send stablecoin: ${(err as Error).message}`,
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
      name: 'eth_getStablecoinBalance',
      description: 'Get the balance of a specific stablecoin.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Stablecoin symbol: USDC, USDT, USDS, DAI, PYUSD, or FRAX',
            enum: ['USDC', 'USDT', 'USDS', 'DAI', 'PYUSD', 'FRAX'],
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
          const stablecoin = resolveStablecoin(params['token'] as string);
          if (!stablecoin) {
            const tokenName = String(params['token']);
            return {
              success: false,
              error: `Unknown stablecoin: ${tokenName}`,
              summary: `Unknown stablecoin: ${tokenName}`,
            };
          }

          const result = await wallet.getStablecoinBalance(
            stablecoin,
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
      name: 'eth_getStablecoinBalances',
      description: 'Get balances of all supported stablecoins on the current chain.',
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
          const balances = await wallet.getStablecoinBalances(
            params['address'] as string | undefined
          );

          const nonZero = Object.entries(balances)
            .filter(([, b]) => b.raw > 0n)
            .map(([symbol, b]) => `${b.formatted} ${symbol}`)
            .join(', ');

          return {
            success: true,
            data: balances,
            summary: nonZero || 'No stablecoin balances',
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get balances: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'read',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    // === Bridge Operations ===
    {
      name: 'eth_bridge',
      description: `Bridge stablecoins to another chain. Auto-selects the best route based on cost or speed.

Example usage:
- Bridge 100 USDC to Arbitrum (chain 42161)
- Bridge 500 USDC to Base (chain 8453) prioritizing speed

Supported chains: Ethereum (1), Arbitrum (42161), Optimism (10), Base (8453), Polygon (137), Avalanche (43114)
Testnets: Sepolia (11155111), Base Sepolia (84532), OP Sepolia (11155420), Arb Sepolia (421614)

Returns a tracking ID to monitor bridge progress.`,
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Stablecoin to bridge: USDC (most supported), USDT, or DAI',
            enum: ['USDC', 'USDT', 'DAI'],
          },
          amount: {
            type: 'string',
            description: 'Amount to bridge in human-readable format (e.g., "100" for 100 USDC)',
          },
          destinationChainId: {
            type: 'number',
            description: 'Destination chain ID (e.g., 42161 for Arbitrum, 8453 for Base)',
          },
          recipient: {
            type: 'string',
            description: 'Recipient address on destination chain. Defaults to sender address.',
          },
          priority: {
            type: 'string',
            description: 'Route selection priority: "cost" (lowest fees) or "speed" (fastest)',
            enum: ['cost', 'speed'],
          },
        },
        required: ['token', 'amount', 'destinationChainId'],
      },
      handler: async (params) => {
        try {
          const stablecoin = resolveStablecoin(params['token'] as string);
          if (!stablecoin) {
            const tokenName = String(params['token']);
            return {
              success: false,
              error: `Unknown stablecoin: ${tokenName}. Supported for bridging: USDC, USDT, DAI`,
              summary: `Unknown stablecoin: ${tokenName}`,
            };
          }

          const destChainId = params['destinationChainId'] as number;
          const destChainName = SUPPORTED_CHAINS[destChainId] || `Chain ${destChainId}`;

          const result = await wallet.bridge({
            token: stablecoin,
            amount: params['amount'] as string,
            destinationChainId: destChainId,
            recipient: params['recipient'] as string | undefined,
            preference: {
              priority: (params['priority'] as 'cost' | 'speed') || 'cost',
            },
          });

          return {
            success: true,
            data: {
              trackingId: result.trackingId,
              protocol: result.protocol,
              sourceTxHash: result.sourceTxHash,
              amount: result.amount,
              fee: result.fee,
              estimatedTime: result.estimatedTime,
              destinationChain: destChainName,
            },
            summary: `Bridging ${result.amount.formatted} ${stablecoin.symbol} to ${destChainName} via ${result.protocol}. Tracking ID: ${result.trackingId}`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to bridge: ${(err as Error).message}`,
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
      name: 'eth_previewBridge',
      description: 'Preview a bridge operation without executing. Shows fees, estimated time, and validates the operation.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Stablecoin to bridge: USDC, USDT, or DAI',
            enum: ['USDC', 'USDT', 'DAI'],
          },
          amount: {
            type: 'string',
            description: 'Amount to bridge in human-readable format',
          },
          destinationChainId: {
            type: 'number',
            description: 'Destination chain ID',
          },
          priority: {
            type: 'string',
            description: 'Route selection priority: "cost" or "speed"',
            enum: ['cost', 'speed'],
          },
        },
        required: ['token', 'amount', 'destinationChainId'],
      },
      handler: async (params) => {
        try {
          const stablecoin = resolveStablecoin(params['token'] as string);
          if (!stablecoin) {
            const tokenName = String(params['token']);
            return {
              success: false,
              error: `Unknown stablecoin: ${tokenName}`,
              summary: `Unknown stablecoin: ${tokenName}`,
            };
          }

          const destChainId = params['destinationChainId'] as number;
          const preview = await wallet.previewBridgeWithRouter({
            token: stablecoin,
            amount: params['amount'] as string,
            destinationChainId: destChainId,
            preference: {
              priority: (params['priority'] as 'cost' | 'speed') || 'cost',
            },
          });

          const destChainName = SUPPORTED_CHAINS[destChainId] ||
            `Chain ${String(destChainId)}`;

          if (preview.canBridge) {
            const summary = `Can bridge ${preview.amount.formatted} ${stablecoin.symbol} to ${destChainName}. ` +
              `Protocol: ${preview.quote?.protocol || 'auto'}, ` +
              `Fee: $${preview.quote?.fee.totalUSD.toFixed(2) || '0'}, ` +
              `Time: ${preview.quote?.estimatedTime.display || 'unknown'}`;
            return {
              success: true,
              data: preview,
              summary,
            };
          } else {
            return {
              success: true,
              data: preview,
              summary: `Cannot bridge: ${preview.blockers.join(', ')}`,
            };
          }
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to preview bridge: ${(err as Error).message}`,
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
      name: 'eth_compareBridgeRoutes',
      description: 'Compare available bridge routes to find the best option for your transfer.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Stablecoin to bridge: USDC, USDT, or DAI',
            enum: ['USDC', 'USDT', 'DAI'],
          },
          amount: {
            type: 'string',
            description: 'Amount to bridge in human-readable format',
          },
          destinationChainId: {
            type: 'number',
            description: 'Destination chain ID',
          },
        },
        required: ['token', 'amount', 'destinationChainId'],
      },
      handler: async (params) => {
        try {
          const stablecoin = resolveStablecoin(params['token'] as string);
          if (!stablecoin) {
            const tokenName = String(params['token']);
            return {
              success: false,
              error: `Unknown stablecoin: ${tokenName}`,
              summary: `Unknown stablecoin: ${tokenName}`,
            };
          }

          const routes = await wallet.compareBridgeRoutes({
            token: stablecoin,
            amount: params['amount'] as string,
            destinationChainId: params['destinationChainId'] as number,
          });

          const routeSummaries = routes.quotes.map(
            (q) => `${q.protocol}: $${q.fee.totalUSD.toFixed(2)} fee, ${q.estimatedTime.display}`
          );

          const summary = routes.recommended
            ? `Recommended: ${routes.recommended.protocol}. Options: ${routeSummaries.join('; ')}`
            : `No routes available for this bridge`;

          return {
            success: true,
            data: routes,
            summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to compare routes: ${(err as Error).message}`,
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
      name: 'eth_getBridgeStatus',
      description: 'Get the status of a bridge operation using its tracking ID.',
      parameters: {
        type: 'object',
        properties: {
          trackingId: {
            type: 'string',
            description: 'The tracking ID returned from eth_bridge',
          },
        },
        required: ['trackingId'],
      },
      handler: async (params) => {
        try {
          const status = await wallet.getBridgeStatusByTrackingId(
            params['trackingId'] as string
          );

          return {
            success: true,
            data: status,
            summary: `Bridge ${status.status}: ${status.message} (${status.progress}% complete)`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get bridge status: ${(err as Error).message}`,
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
      name: 'eth_waitForFastBridgeAttestation',
      description: `Wait for fast CCTP attestation using the burn transaction hash.
This is much faster than standard attestation (10-30 seconds vs 15-30 minutes).

Use this when fast bridge mode is enabled. Pass the burn transaction hash from the bridge result.

Example: After bridging, use the burnTxHash to wait for the fast attestation.`,
      parameters: {
        type: 'object',
        properties: {
          burnTxHash: {
            type: 'string',
            description: 'The transaction hash of the bridge burn operation',
          },
        },
        required: ['burnTxHash'],
      },
      handler: async (params) => {
        try {
          const burnTxHash = params['burnTxHash'] as Hash;
          const result = await wallet.waitForFastBridgeAttestation(burnTxHash);

          return {
            success: true,
            data: result,
            summary: `Fast attestation ready! Attestation received for tx ${burnTxHash.slice(0, 10)}...`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get fast attestation: ${(err as Error).message}`,
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
      name: 'eth_completeBridge',
      description: `Complete a bridge operation by minting tokens on the destination chain.

After a bridge is initiated and attestation is received, this tool calls receiveMessage()
on the destination chain's MessageTransmitter to mint the bridged tokens.

IMPORTANT: This is required to complete the bridge! The tokens won't appear on the
destination chain until this step is executed.

Flow:
1. eth_bridge → Burns tokens on source, returns trackingId and sourceTxHash
2. eth_waitForFastBridgeAttestation → Gets attestation (includes message bytes)
3. eth_completeBridge → Mints tokens on destination using attestation

The message bytes come from the attestation result (attestation.message field).`,
      parameters: {
        type: 'object',
        properties: {
          trackingId: {
            type: 'string',
            description: 'The tracking ID returned from eth_bridge',
          },
          attestation: {
            type: 'string',
            description: 'The attestation signature from eth_waitForFastBridgeAttestation',
          },
          messageBytes: {
            type: 'string',
            description: 'The message bytes from the attestation result (attestation.message field)',
          },
        },
        required: ['trackingId', 'attestation', 'messageBytes'],
      },
      handler: async (params) => {
        try {
          const result = await wallet.completeBridge({
            trackingId: params['trackingId'] as string,
            attestation: params['attestation'] as Hex,
            messageBytes: params['messageBytes'] as Hex,
          });

          return {
            success: result.success,
            data: {
              mintTxHash: result.mintTxHash,
              amount: result.amount,
              recipient: result.recipient,
            },
            summary: `Bridge completed! Minted ${result.amount.formatted} USDC to ${result.recipient}. TX: ${result.mintTxHash.slice(0, 10)}...`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to complete bridge: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'write',
        requiresApproval: true,
        riskLevel: 'medium',
      },
    },

    {
      name: 'eth_getFastBridgeFee',
      description: `Get the fee for fast CCTP transfers to a destination chain.
Fast transfers use optimistic finality and require a small fee (typically ~0.1% or less).

Use this to preview the fee before initiating a fast bridge transfer.`,
      parameters: {
        type: 'object',
        properties: {
          destinationChainId: {
            type: 'number',
            description: 'The destination chain ID',
          },
          amount: {
            type: 'string',
            description: 'Optional: Amount in USDC to calculate the max fee (e.g., "100")',
          },
        },
        required: ['destinationChainId'],
      },
      handler: async (params) => {
        try {
          const destChainId = params['destinationChainId'] as number;
          const amountStr = params['amount'] as string | undefined;

          // Convert amount to raw if provided (USDC has 6 decimals)
          let amount: bigint | undefined;
          if (amountStr) {
            const [whole, fraction = ''] = amountStr.split('.');
            const paddedFraction = fraction.padEnd(6, '0').slice(0, 6);
            amount = BigInt(whole + paddedFraction);
          }

          const fee = await wallet.getFastBridgeFee(destChainId, amount);
          const destChainName = SUPPORTED_CHAINS[destChainId] || `Chain ${destChainId}`;

          let summary = `Fast bridge fee to ${destChainName}: ${fee.feePercentage * 100}%`;
          if (fee.maxFeeFormatted) {
            summary += ` (max fee: ${fee.maxFeeFormatted} USDC)`;
          }

          return {
            success: true,
            data: fee,
            summary,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get fast bridge fee: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'info',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'eth_getBridgeLimits',
      description: 'Get current bridge spending limits and allowed destination chains.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: async () => {
        try {
          const limits = wallet.getBridgeLimits();

          const allowedChains = limits.allowedDestinations
            ?.map((id) => SUPPORTED_CHAINS[id] || `Chain ${id}`)
            .join(', ') || 'all chains';

          return {
            success: true,
            data: limits,
            summary: `Bridge limits - Per tx: $${limits.perTransaction.limit}, Daily remaining: $${limits.daily.remaining}, Allowed: ${allowedChains}`,
          };
        } catch (err) {
          return {
            success: false,
            error: (err as Error).message,
            summary: `Failed to get bridge limits: ${(err as Error).message}`,
          };
        }
      },
      metadata: {
        category: 'info',
        requiresApproval: false,
        riskLevel: 'none',
      },
    },

    {
      name: 'eth_getStablecoinBalanceOnChain',
      description: `Check stablecoin balance on a different chain. Use this to verify bridged tokens arrived on the destination chain.

Example usage:
- Check USDC balance on Base Sepolia after bridging from Sepolia
- Verify tokens arrived on Arbitrum after bridge completes

This tool connects to the destination chain's RPC to check the actual on-chain balance.`,
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Stablecoin symbol: USDC, USDT, USDS, DAI, PYUSD, or FRAX',
            enum: ['USDC', 'USDT', 'USDS', 'DAI', 'PYUSD', 'FRAX'],
          },
          chainId: {
            type: 'number',
            description: 'Chain ID to check balance on (e.g., 84532 for Base Sepolia, 8453 for Base)',
          },
          address: {
            type: 'string',
            description: 'Address to check. Leave empty for wallet address.',
          },
          rpcUrl: {
            type: 'string',
            description: 'Optional custom RPC URL. Uses default public RPC if not provided.',
          },
        },
        required: ['token', 'chainId'],
      },
      handler: async (params) => {
        try {
          const stablecoin = resolveStablecoin(params['token'] as string);
          if (!stablecoin) {
            const tokenName = String(params['token']);
            return {
              success: false,
              error: `Unknown stablecoin: ${tokenName}`,
              summary: `Unknown stablecoin: ${tokenName}`,
            };
          }

          const chainId = params['chainId'] as number;
          const chainName = SUPPORTED_CHAINS[chainId] || `Chain ${chainId}`;

          // Get the stablecoin address on the destination chain
          const tokenAddress = getStablecoinAddress(stablecoin, chainId);
          if (!tokenAddress) {
            return {
              success: false,
              error: `${stablecoin.symbol} not supported on ${chainName}`,
              summary: `${stablecoin.symbol} not available on ${chainName}`,
            };
          }

          // Get RPC URL (custom or default)
          const rpcUrl = (params['rpcUrl'] as string) || DEFAULT_RPC_URLS[chainId];
          if (!rpcUrl) {
            return {
              success: false,
              error: `No RPC URL available for ${chainName}. Please provide a custom rpcUrl.`,
              summary: `No RPC for ${chainName}`,
            };
          }

          // Create RPC client for destination chain
          const rpc = new RPCClient(rpcUrl);

          // Get address to check (default to wallet address)
          const addressToCheck = (params['address'] as string) || wallet.address;

          // Call balanceOf on the token contract
          const balanceData = await rpc.call({
            to: tokenAddress as Address,
            data: `0x70a08231000000000000000000000000${addressToCheck.slice(2).toLowerCase()}` as Hex,
          });

          const rawBalance = BigInt(balanceData || '0x0');
          const decimals = stablecoin.decimals;
          const divisor = BigInt(10 ** decimals);
          const whole = rawBalance / divisor;
          const fraction = rawBalance % divisor;
          const formatted = `${whole}.${fraction.toString().padStart(decimals, '0').slice(0, 2)}`;

          return {
            success: true,
            data: {
              symbol: stablecoin.symbol,
              chain: chainName,
              chainId,
              address: addressToCheck,
              tokenAddress,
              raw: rawBalance.toString(),
              formatted,
              decimals,
            },
            summary: `${stablecoin.symbol} balance on ${chainName}: ${formatted} ${stablecoin.symbol}`,
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

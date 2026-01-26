/**
 * Universal tool definitions
 * Framework-agnostic tool schemas
 */

import type { AgentWallet } from '../agent/index.js';
import type { Address } from '../core/types.js';
import { STABLECOINS, type StablecoinInfo } from '../stablecoins/tokens.js';

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

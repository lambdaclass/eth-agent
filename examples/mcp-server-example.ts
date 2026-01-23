/**
 * MCP Server Example
 *
 * Demonstrates running eth-agent as an MCP server for Claude Desktop:
 * - Setting up the MCP server
 * - Registering tools
 * - Handling tool calls
 * - Security considerations
 *
 * Run: npx tsx examples/mcp-server-example.ts
 *
 * Then add to Claude Desktop config (~/.config/claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "eth-agent": {
 *       "command": "npx",
 *       "args": ["tsx", "/path/to/examples/mcp-server-example.ts"],
 *       "env": {
 *         "ETH_PRIVATE_KEY": "0x...",
 *         "RPC_URL": "https://eth.llamarpc.com"
 *       }
 *     }
 *   }
 * }
 */

import {
  AgentWallet,
  SafetyPresets,
  USDC,
  USDT,
  USDS,
  DAI,
  type StablecoinInfo,
} from '@lambdaclass/eth-agent';

// Token map for MCP tools
const STABLECOIN_MAP: Record<string, StablecoinInfo> = {
  USDC,
  USDT,
  USDS,
  DAI,
};

// MCP Tool Schema
interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

// MCP Tool Result
interface MCPToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

// Create MCP tools for eth-agent
function createMCPTools(wallet: AgentWallet): MCPToolSchema[] {
  return [
    {
      name: 'eth_get_balance',
      description: 'Get the ETH balance of the wallet or a specified address',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Optional address or ENS name. Leave empty for wallet balance.',
          },
        },
        required: [],
      },
    },
    {
      name: 'eth_get_stablecoin_balances',
      description: 'Get all stablecoin balances (USDC, USDT, DAI, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Optional address. Leave empty for wallet balance.',
          },
        },
        required: [],
      },
    },
    {
      name: 'eth_send_stablecoin',
      description: 'Send stablecoins to an address. Includes safety limits and simulation.',
      inputSchema: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Token symbol (USDC, USDT, DAI, USDS)',
            enum: ['USDC', 'USDT', 'DAI', 'USDS'],
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
    },
    {
      name: 'eth_get_spending_limits',
      description: 'Get current spending limits and usage',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'eth_preview_transaction',
      description: 'Preview a transaction without executing it',
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address or ENS name',
          },
          amount: {
            type: 'string',
            description: 'Amount with unit (e.g., "0.1 ETH")',
          },
        },
        required: ['to', 'amount'],
      },
    },
    {
      name: 'eth_get_wallet_info',
      description: 'Get wallet address and network information',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

// Execute MCP tool
async function executeMCPTool(
  wallet: AgentWallet,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  try {
    switch (toolName) {
      case 'eth_get_balance': {
        const balance = await wallet.getBalance(args.address as string | undefined);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              address: args.address ?? wallet.address,
              balance: balance.formatted,
              wei: balance.wei.toString(),
            }, null, 2),
          }],
        };
      }

      case 'eth_get_stablecoin_balances': {
        const balances = await wallet.getStablecoinBalances(args.address as string | undefined);
        const formatted: Record<string, string> = {};
        for (const [symbol, balance] of Object.entries(balances)) {
          formatted[symbol] = `${balance.formatted} ${symbol}`;
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              address: args.address ?? wallet.address,
              balances: formatted,
            }, null, 2),
          }],
        };
      }

      case 'eth_send_stablecoin': {
        const token = STABLECOIN_MAP[(args.token as string).toUpperCase()];
        if (!token) {
          return {
            content: [{ type: 'text', text: `Unknown token: ${args.token}` }],
            isError: true,
          };
        }

        const result = await wallet.sendStablecoin({
          token,
          to: args.to as string,
          amount: args.amount as string,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              summary: result.summary,
              hash: result.hash,
              token: result.token,
            }, null, 2),
          }],
        };
      }

      case 'eth_get_spending_limits': {
        const limits = wallet.getLimits();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              perTransaction: `${limits.perTransaction.limit} ETH`,
              hourly: {
                limit: `${limits.hourly.limit} ETH`,
                used: `${limits.hourly.used} ETH`,
                remaining: `${limits.hourly.remaining} ETH`,
              },
              daily: {
                limit: `${limits.daily.limit} ETH`,
                used: `${limits.daily.used} ETH`,
                remaining: `${limits.daily.remaining} ETH`,
              },
              stopped: limits.stopped,
            }, null, 2),
          }],
        };
      }

      case 'eth_preview_transaction': {
        const preview = await wallet.preview({
          to: args.to as string,
          amount: args.amount as string,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              canExecute: preview.canExecute,
              blockers: preview.blockers,
              costs: {
                value: preview.costs.value.eth + ' ETH',
                gas: preview.costs.gas.eth + ' ETH',
                total: preview.costs.total.eth + ' ETH',
              },
              simulation: preview.simulation,
            }, null, 2),
          }],
        };
      }

      case 'eth_get_wallet_info': {
        const caps = wallet.getCapabilities();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              address: caps.address,
              agentId: caps.agentId,
              network: caps.network,
              operations: caps.operations,
            }, null, 2),
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
      isError: true,
    };
  }
}

// Simple MCP Server implementation
class MCPServer {
  private wallet: AgentWallet;
  private tools: MCPToolSchema[];

  constructor(wallet: AgentWallet) {
    this.wallet = wallet;
    this.tools = createMCPTools(wallet);
  }

  // Handle incoming MCP messages
  async handleMessage(message: { method: string; params?: Record<string, unknown>; id?: number }): Promise<unknown> {
    switch (message.method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'eth-agent',
            version: '0.1.0',
          },
        };

      case 'tools/list':
        return {
          tools: this.tools,
        };

      case 'tools/call': {
        const { name, arguments: args } = message.params as {
          name: string;
          arguments: Record<string, unknown>;
        };
        return await executeMCPTool(this.wallet, name, args);
      }

      default:
        throw new Error(`Unknown method: ${message.method}`);
    }
  }

  // Start listening for messages via stdio
  async listen(): Promise<void> {
    process.stdin.setEncoding('utf8');

    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk;

      // Process complete messages (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);
          const response = await this.handleMessage(message);

          // Send response
          const output = JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: response,
          });
          process.stdout.write(output + '\n');
        } catch (err) {
          // Send error response
          const output = JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: (err as Error).message,
            },
          });
          process.stdout.write(output + '\n');
        }
      }
    });

    // Keep alive
    await new Promise(() => {});
  }
}

async function main() {
  // Check for required environment
  const privateKey = process.env.ETH_PRIVATE_KEY;
  if (!privateKey) {
    console.error('ETH_PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  // Create wallet with conservative limits for MCP
  const wallet = AgentWallet.create({
    privateKey,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',
    ...SafetyPresets.CONSERVATIVE, // Use conservative limits for AI access
    agentId: 'claude-desktop',
  });

  // Determine mode
  const isDemo = process.argv.includes('--demo');

  if (isDemo) {
    // Demo mode: show tools and sample executions
    console.log('=== MCP Server Demo ===\n');
    console.log(`Wallet: ${wallet.address}\n`);

    console.log('--- Available Tools ---\n');
    const tools = createMCPTools(wallet);
    for (const tool of tools) {
      console.log(`${tool.name}:`);
      console.log(`  ${tool.description}`);
      console.log(`  Required: ${tool.inputSchema.required.join(', ') || 'none'}`);
      console.log();
    }

    console.log('--- Sample Tool Executions ---\n');

    // Get wallet info
    console.log('eth_get_wallet_info:');
    const info = await executeMCPTool(wallet, 'eth_get_wallet_info', {});
    console.log(info.content[0].text);
    console.log();

    // Get balance
    console.log('eth_get_balance:');
    const balance = await executeMCPTool(wallet, 'eth_get_balance', {});
    console.log(balance.content[0].text);
    console.log();

    // Get stablecoin balances
    console.log('eth_get_stablecoin_balances:');
    const stableBalances = await executeMCPTool(wallet, 'eth_get_stablecoin_balances', {});
    console.log(stableBalances.content[0].text);
    console.log();

    // Get limits
    console.log('eth_get_spending_limits:');
    const limits = await executeMCPTool(wallet, 'eth_get_spending_limits', {});
    console.log(limits.content[0].text);
    console.log();

    // Preview transaction
    console.log('eth_preview_transaction (0.01 ETH to vitalik.eth):');
    const preview = await executeMCPTool(wallet, 'eth_preview_transaction', {
      to: 'vitalik.eth',
      amount: '0.01 ETH',
    });
    console.log(preview.content[0].text);
    console.log();

    console.log('--- Claude Desktop Config ---\n');
    console.log(`Add to ~/.config/claude/claude_desktop_config.json:

{
  "mcpServers": {
    "eth-agent": {
      "command": "npx",
      "args": ["tsx", "${process.argv[1]}"],
      "env": {
        "ETH_PRIVATE_KEY": "YOUR_PRIVATE_KEY",
        "RPC_URL": "https://eth.llamarpc.com"
      }
    }
  }
}
`);
  } else {
    // Production mode: start MCP server
    const server = new MCPServer(wallet);
    await server.listen();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

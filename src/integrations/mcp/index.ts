/**
 * MCP (Model Context Protocol) server implementation
 * Provides tools, resources, and prompts for Ethereum operations
 */

import type { AgentWallet } from '../../agent/index.js';
import { createTools, type ToolDefinition } from '../tools.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export interface MCPServerConfig {
  wallet: AgentWallet;
  tools?: string[];
  resources?: boolean;
  prompts?: boolean;
}

export interface MCPServer {
  // Tool operations
  listTools: () => MCPTool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;

  // Resource operations
  listResources: () => MCPResource[];
  readResource: (uri: string) => Promise<{
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }>;

  // Prompt operations
  listPrompts: () => MCPPrompt[];
  getPrompt: (name: string, args?: Record<string, string>) => Promise<{
    messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
  }>;
}

/**
 * Create an MCP server for the wallet
 */
export function createMCPServer(config: MCPServerConfig): MCPServer {
  const tools = createTools(config.wallet);
  const enabledTools = config.tools
    ? tools.filter((t) => config.tools?.includes(t.name))
    : tools;

  const resources: MCPResource[] = config.resources !== false ? [
    {
      uri: 'eth://wallet',
      name: 'Wallet Info',
      description: 'Current wallet address, balance, and limits',
      mimeType: 'application/json',
    },
    {
      uri: 'eth://network',
      name: 'Network Info',
      description: 'Current network status',
      mimeType: 'application/json',
    },
  ] : [];

  const prompts: MCPPrompt[] = config.prompts !== false ? [
    {
      name: 'check_balance',
      description: 'Check wallet balance and status',
      arguments: [],
    },
    {
      name: 'send_payment',
      description: 'Send ETH to an address',
      arguments: [
        { name: 'recipient', description: 'Address or ENS name', required: true },
        { name: 'amount', description: 'Amount in ETH', required: true },
      ],
    },
  ] : [];

  return {
    listTools: () => enabledTools.map(formatMCPTool),

    callTool: async (name, args) => {
      const tool = enabledTools.find((t) => t.name === name);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        const result = await tool.handler(args);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              summary: result.summary,
              data: result.data,
              error: result.error,
            }, null, 2),
          }],
          isError: !result.success,
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },

    listResources: () => resources,

    readResource: async (uri) => {
      switch (uri) {
        case 'eth://wallet': {
          const caps = config.wallet.getCapabilities();
          const balance = await config.wallet.getBalance();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                address: caps.address,
                balance: balance.formatted,
                limits: caps.limits,
              }, null, 2),
            }],
          };
        }
        case 'eth://network': {
          const caps = config.wallet.getCapabilities();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                chainId: caps.network.chainId,
              }, null, 2),
            }],
          };
        }
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    },

    listPrompts: () => prompts,

    getPrompt: async (name, args) => {
      switch (name) {
        case 'check_balance': {
          const balance = await config.wallet.getBalance();
          const limits = config.wallet.getLimits();
          return {
            messages: [{
              role: 'user',
              content: {
                type: 'text',
                text: `Check my wallet status.\n\nCurrent balance: ${balance.formatted}\nDaily limit remaining: ${limits.daily.remaining} ETH\nHourly limit remaining: ${limits.hourly.remaining} ETH`,
              },
            }],
          };
        }
        case 'send_payment': {
          const recipient = args?.['recipient'] ?? '[recipient]';
          const amount = args?.['amount'] ?? '[amount]';
          return {
            messages: [{
              role: 'user',
              content: {
                type: 'text',
                text: `Send ${amount} ETH to ${recipient}. Please preview the transaction first, then execute if the preview looks correct.`,
              },
            }],
          };
        }
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    },
  };
}

/**
 * Format tool for MCP
 */
function formatMCPTool(tool: ToolDefinition): MCPTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
  };
}

/**
 * Create stdio transport for MCP server
 * For use with Claude Desktop and other MCP clients
 */
export function createStdioServer(config: MCPServerConfig): void {
  const server = createMCPServer(config);

  // Read from stdin, write to stdout
  // This is a simplified implementation - full MCP requires proper JSON-RPC handling
  process.stdin.setEncoding('utf8');

  let buffer = '';

  process.stdin.on('data', (chunk) => {
    buffer += chunk;

    // Try to parse complete JSON-RPC messages
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const request = JSON.parse(line) as {
          jsonrpc: '2.0';
          id: number | string;
          method: string;
          params?: Record<string, unknown>;
        };

        handleRequest(server, request)
          .then((response) => {
            process.stdout.write(JSON.stringify(response) + '\n');
          })
          .catch((err) => {
            process.stdout.write(JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32000, message: (err as Error).message },
            }) + '\n');
          });
      } catch {
        // Ignore parse errors
      }
    }
  });
}

async function handleRequest(
  server: MCPServer,
  request: { jsonrpc: '2.0'; id: number | string; method: string; params?: Record<string, unknown> }
): Promise<{ jsonrpc: '2.0'; id: number | string; result?: unknown; error?: { code: number; message: string } }> {
  switch (request.method) {
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: server.listTools() },
      };

    case 'tools/call': {
      const params = request.params as { name: string; arguments?: Record<string, unknown> };
      const result = await server.callTool(params.name, params.arguments ?? {});
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    }

    case 'resources/list':
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { resources: server.listResources() },
      };

    case 'resources/read': {
      const params = request.params as { uri: string };
      const result = await server.readResource(params.uri);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    }

    case 'prompts/list':
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { prompts: server.listPrompts() },
      };

    case 'prompts/get': {
      const params = request.params as { name: string; arguments?: Record<string, string> };
      const result = await server.getPrompt(params.name, params.arguments);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
  }
}

/**
 * Anthropic Claude tool integration
 * Formats tools for Claude's tool_use format
 */

import type { AgentWallet } from '../agent/index.js';
import { createTools, executeTool, type ToolDefinition, type ToolResult } from './tools.js';

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface AnthropicToolsAdapter {
  definitions: AnthropicTool[];
  execute: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
  getToolNames: () => string[];
}

/**
 * Create Anthropic tool definitions from wallet
 */
export function anthropicTools(wallet: AgentWallet): AnthropicToolsAdapter {
  const tools = createTools(wallet);

  return {
    definitions: tools.map(formatAnthropicTool),
    execute: async (name: string, input: Record<string, unknown>) => {
      return executeTool(tools, name, input);
    },
    getToolNames: () => tools.map((t) => t.name),
  };
}

/**
 * Format a tool definition for Anthropic
 */
function formatAnthropicTool(tool: ToolDefinition): AnthropicTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

/**
 * Example usage with Anthropic SDK
 *
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 * import { AgentWallet, anthropicTools } from 'eth-agent';
 *
 * const wallet = AgentWallet.create({ privateKey: '0x...' });
 * const client = new Anthropic();
 * const tools = anthropicTools(wallet);
 *
 * const response = await client.messages.create({
 *   model: 'claude-sonnet-4-20250514',
 *   max_tokens: 1024,
 *   tools: tools.definitions,
 *   messages: [{ role: 'user', content: 'What is my ETH balance?' }],
 * });
 *
 * // Handle tool use
 * for (const block of response.content) {
 *   if (block.type === 'tool_use') {
 *     const result = await tools.execute(block.name, block.input);
 *     console.log(result.summary);
 *   }
 * }
 * ```
 */

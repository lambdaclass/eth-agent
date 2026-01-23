/**
 * OpenAI function calling integration
 * Formats tools for OpenAI's function calling format
 */

import type { AgentWallet } from '../agent/index.js';
import { createTools, executeTool, type ToolDefinition, type ToolResult } from './tools.js';

export interface OpenAITool {
  type: 'function';
  function: {
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
  };
}

export interface OpenAIToolsAdapter {
  definitions: OpenAITool[];
  execute: (name: string, args: string | Record<string, unknown>) => Promise<ToolResult>;
  getToolNames: () => string[];
}

/**
 * Create OpenAI tool definitions from wallet
 */
export function openaiTools(wallet: AgentWallet): OpenAIToolsAdapter {
  const tools = createTools(wallet);

  return {
    definitions: tools.map(formatOpenAITool),
    execute: async (name: string, args: string | Record<string, unknown>) => {
      const params = typeof args === 'string' ? JSON.parse(args) as Record<string, unknown> : args;
      return executeTool(tools, name, params);
    },
    getToolNames: () => tools.map((t) => t.name),
  };
}

/**
 * Format a tool definition for OpenAI
 */
function formatOpenAITool(tool: ToolDefinition): OpenAITool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/**
 * Example usage with OpenAI SDK
 *
 * ```typescript
 * import OpenAI from 'openai';
 * import { AgentWallet, openaiTools } from 'eth-agent';
 *
 * const wallet = AgentWallet.create({ privateKey: '0x...' });
 * const client = new OpenAI();
 * const tools = openaiTools(wallet);
 *
 * const response = await client.chat.completions.create({
 *   model: 'gpt-4-turbo',
 *   messages: [{ role: 'user', content: 'What is my ETH balance?' }],
 *   tools: tools.definitions,
 *   tool_choice: 'auto',
 * });
 *
 * // Handle tool calls
 * const toolCalls = response.choices[0].message.tool_calls;
 * if (toolCalls) {
 *   for (const call of toolCalls) {
 *     const result = await tools.execute(
 *       call.function.name,
 *       call.function.arguments
 *     );
 *     console.log(result.summary);
 *   }
 * }
 * ```
 */

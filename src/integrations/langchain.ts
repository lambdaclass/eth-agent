/**
 * LangChain tools integration
 * Formats tools for LangChain's tool interface
 */

import type { AgentWallet } from '../agent/index.js';
import { createTools, type ToolDefinition } from './tools.js';

/**
 * LangChain-compatible tool interface
 * Note: This is a simplified interface. For full LangChain integration,
 * use @langchain/core
 */
export interface LangChainTool {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  call: (input: Record<string, unknown>) => Promise<string>;
}

export interface LangChainToolsAdapter {
  tools: LangChainTool[];
  asLangChainTools: () => LangChainTool[];
  getToolNames: () => string[];
}

/**
 * Create LangChain tool definitions from wallet
 */
export function langchainTools(wallet: AgentWallet): LangChainToolsAdapter {
  const tools = createTools(wallet);
  const lcTools = tools.map(formatLangChainTool);

  return {
    tools: lcTools,
    asLangChainTools: () => lcTools,
    getToolNames: () => tools.map((t) => t.name),
  };
}

/**
 * Format a tool definition for LangChain
 */
function formatLangChainTool(tool: ToolDefinition): LangChainTool {
  return {
    name: tool.name,
    description: tool.description,
    schema: tool.parameters,
    call: async (input: Record<string, unknown>) => {
      const result = await tool.handler(input);
      // LangChain expects string output
      return JSON.stringify({
        success: result.success,
        summary: result.summary,
        data: result.data,
        error: result.error,
      });
    },
  };
}

/**
 * Example usage with LangChain
 *
 * ```typescript
 * import { ChatAnthropic } from '@langchain/anthropic';
 * import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
 * import { AgentWallet, langchainTools } from 'eth-agent';
 *
 * const wallet = AgentWallet.create({ privateKey: '0x...' });
 * const tools = langchainTools(wallet);
 *
 * const llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
 *
 * const agent = createToolCallingAgent({
 *   llm,
 *   tools: tools.asLangChainTools(),
 *   prompt: promptTemplate,
 * });
 *
 * const executor = AgentExecutor.fromAgentAndTools({ agent, tools });
 * const result = await executor.invoke({ input: 'What is my balance?' });
 * ```
 */

/**
 * Create a DynamicStructuredTool-compatible object
 * For use with LangChain's DynamicStructuredTool
 */
export function createDynamicTool(tool: ToolDefinition): {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  func: (input: Record<string, unknown>) => Promise<string>;
} {
  return {
    name: tool.name,
    description: tool.description,
    schema: tool.parameters,
    func: async (input: Record<string, unknown>) => {
      const result = await tool.handler(input);
      return result.summary;
    },
  };
}

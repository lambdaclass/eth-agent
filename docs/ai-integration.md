# AI Framework Integration

eth-agent provides first-class integrations with major AI frameworks, transforming wallet operations into tool definitions that LLMs can invoke safely.

## Overview

Each integration exposes the same core operations:

| Tool | Description |
|------|-------------|
| `get_balance` | Check ETH balance for any address |
| `send_transaction` | Send ETH with safety limits |
| `preview_transaction` | Simulate before executing |
| `get_token_balance` | Check ERC-20 token balance |
| `transfer_token` | Transfer ERC-20 tokens |
| `bridge_usdc` | Bridge USDC to another chain |
| `preview_bridge` | Preview a bridge operation |
| `get_bridge_status` | Check bridge transaction status |
| `get_capabilities` | Get wallet info and limits |

Safety limits apply regardless of which framework invokes the tools.

## Anthropic Claude

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AgentWallet, anthropicTools } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  limits: { perTransaction: '0.1 ETH', perDay: '1 ETH' },
});

const client = new Anthropic();
const tools = anthropicTools(wallet);

async function chat(userMessage: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    tools: tools.definitions,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Handle tool calls
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const result = await tools.execute(block.name, block.input);
      console.log(`Tool ${block.name}:`, result);
    }
  }

  return response;
}

// Example usage
await chat('What is my ETH balance?');
await chat('Send 0.01 ETH to vitalik.eth');
```

### Tool Definitions

The `anthropicTools` function returns:

```typescript
interface AnthropicTools {
  definitions: Anthropic.Tool[];  // Tool schemas for API
  execute: (name: string, input: unknown) => Promise<unknown>;  // Executor
}
```

## OpenAI

```typescript
import OpenAI from 'openai';
import { AgentWallet, openaiTools } from 'eth-agent/openai';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  limits: { perTransaction: '0.1 ETH', perDay: '1 ETH' },
});

const client = new OpenAI();
const tools = openaiTools(wallet);

async function chat(userMessage: string) {
  const response = await client.chat.completions.create({
    model: 'gpt-4-turbo',
    tools: tools.definitions,
    messages: [{ role: 'user', content: userMessage }],
  });

  const message = response.choices[0]?.message;

  // Handle tool calls
  if (message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const input = JSON.parse(toolCall.function.arguments);
      const result = await tools.execute(toolCall.function.name, input);
      console.log(`Tool ${toolCall.function.name}:`, result);
    }
  }

  return response;
}
```

### Function Calling Schema

OpenAI tools follow the function calling format:

```typescript
{
  type: 'function',
  function: {
    name: 'send_transaction',
    description: 'Send ETH to an address',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient address or ENS name' },
        amount: { type: 'string', description: 'Amount to send (e.g., "0.1 ETH")' },
      },
      required: ['to', 'amount'],
    },
  },
}
```

## LangChain

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { AgentWallet, langchainTools } from 'eth-agent/langchain';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  limits: { perTransaction: '0.1 ETH', perDay: '1 ETH' },
});

const tools = langchainTools(wallet);
const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

const agent = await createToolCallingAgent({
  llm: model,
  tools,
  prompt: yourPromptTemplate,
});

const executor = new AgentExecutor({ agent, tools });

const result = await executor.invoke({
  input: 'Send 0.01 ETH to alice.eth and tell me the transaction hash',
});
```

### LangChain Tool Format

Each tool is a `StructuredTool` with:

```typescript
class SendTransactionTool extends StructuredTool {
  name = 'send_transaction';
  description = 'Send ETH to an address with safety limits';
  schema = z.object({
    to: z.string().describe('Recipient address or ENS name'),
    amount: z.string().describe('Amount to send (e.g., "0.1 ETH")'),
  });

  async _call(input: { to: string; amount: string }) {
    return await this.wallet.send(input);
  }
}
```

## MCP (Model Context Protocol)

For Claude Desktop and other MCP-compatible applications:

```typescript
import { AgentWallet, createMCPServer } from 'eth-agent/mcp';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  limits: { perTransaction: '0.1 ETH', perDay: '1 ETH' },
});

const server = createMCPServer({ wallet });

// Start stdio server for Claude Desktop
server.listen();
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "eth-agent": {
      "command": "npx",
      "args": ["eth-agent-mcp"],
      "env": {
        "ETH_PRIVATE_KEY": "0x...",
        "ETH_RPC_URL": "https://eth.llamarpc.com"
      }
    }
  }
}
```

## Error Handling in AI Contexts

All tools return structured errors that LLMs can interpret:

```typescript
// When a tool fails, the result includes actionable information
{
  success: false,
  error: {
    code: 'DAILY_LIMIT_EXCEEDED',
    message: 'Transaction would exceed daily limit',
    suggestion: 'Reduce amount to 0.5 ETH or wait until tomorrow',
    retryable: true,
    retryAfter: 43200000,  // 12 hours in ms
  }
}
```

LLMs can use this to provide helpful responses:

> "I can't send 2 ETH right now because it would exceed your daily limit. You have 0.5 ETH remaining today. Would you like me to send 0.5 ETH instead, or wait until tomorrow when your limit resets?"

## Human-in-the-Loop

Configure approval for high-value transactions:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  onApprovalRequired: async (request) => {
    // Send to your approval system (Slack, email, etc.)
    const approved = await notifyAndWaitForApproval(request);
    return approved;
  },
  approvalConfig: {
    requireApprovalWhen: {
      amountExceeds: '0.1 ETH',
      recipientIsNew: true,
    },
  },
});
```

When approval is required, the tool execution pauses until a human approves:

```typescript
// Tool call: send_transaction({ to: 'unknown.eth', amount: '0.5 ETH' })
// → Triggers onApprovalRequired callback
// → Waits for human approval
// → Returns result or ApprovalDeniedError
```

## Building Custom Tools

Create domain-specific tools using the base wallet:

```typescript
import { AgentWallet } from '@lambdaclass/eth-agent';

function createDeFiTools(wallet: AgentWallet) {
  return {
    definitions: [
      {
        name: 'swap_tokens',
        description: 'Swap tokens on Uniswap',
        parameters: {
          type: 'object',
          properties: {
            fromToken: { type: 'string' },
            toToken: { type: 'string' },
            amount: { type: 'string' },
            slippage: { type: 'number', default: 0.5 },
          },
          required: ['fromToken', 'toToken', 'amount'],
        },
      },
    ],
    execute: async (name: string, input: unknown) => {
      if (name === 'swap_tokens') {
        // Implement swap logic using wallet
        return await executeSwap(wallet, input);
      }
    },
  };
}
```

## Best Practices

1. **Start with conservative limits**: Use `SafetyPresets.CONSERVATIVE` initially.

2. **Always require approval for new recipients**: LLM hallucinations can produce plausible-looking addresses.

3. **Use preview before send**: Have the LLM call `preview_transaction` before `send_transaction` for high-value operations.

4. **Log all operations**: Enable logging for audit trails.

5. **Test with testnets**: Use Sepolia or Goerli before mainnet.

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  network: 'sepolia',  // Use testnet
  ...SafetyPresets.CONSERVATIVE,
});
```

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
| `get_capabilities` | Get wallet info and limits |
| `eth_swap` | Swap tokens using Uniswap V3 |
| `eth_getSwapQuote` | Get a quote before swapping |
| `eth_getSwapLimits` | Check swap limits and remaining allowance |

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
await chat('Swap 100 USDC for ETH');
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

## Token Swap Tools

The swap tools allow AI agents to execute token swaps using Uniswap V3 with built-in safety limits.

### eth_swap

Execute a token swap:

```typescript
// Tool call from AI
{
  name: 'eth_swap',
  input: {
    fromToken: 'USDC',      // Token symbol or address
    toToken: 'ETH',         // Token symbol or address
    amount: '100',          // Amount in human-readable units
    slippageTolerance: 0.5  // 0.5% max slippage (optional, default 0.5)
  }
}

// Response
{
  success: true,
  hash: '0xabc...',
  summary: 'Swapped 100 USDC for 0.042 ETH',
  swap: {
    tokenIn: { symbol: 'USDC', amount: '100' },
    tokenOut: { symbol: 'ETH', amount: '0.042' },
    priceImpact: 0.12
  }
}
```

### eth_getSwapQuote

Preview a swap before executing:

```typescript
// Tool call
{
  name: 'eth_getSwapQuote',
  input: {
    fromToken: 'ETH',
    toToken: 'USDC',
    amount: '0.1'
  }
}

// Response
{
  fromToken: { symbol: 'ETH', amount: '0.1' },
  toToken: { symbol: 'USDC', amount: '238.45' },
  amountOutMinimum: '237.26',  // After 0.5% slippage
  priceImpact: 0.08,
  route: 'ETH → USDC (0.3% fee pool)'
}
```

### eth_getSwapLimits

Check swap spending limits:

```typescript
// Tool call
{ name: 'eth_getSwapLimits', input: {} }

// Response
{
  perTransaction: { limit: '5000', unit: 'USD' },
  daily: { limit: '50000', used: '1200', remaining: '48800', unit: 'USD' },
  maxSlippagePercent: 1,
  maxPriceImpactPercent: 5,
  allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH']
}
```

### Example AI Conversation with Swaps

```
User: "I have 500 USDC. Can you swap half of it for ETH?"

AI: Let me first get a quote for swapping 250 USDC to ETH.
    [calls eth_getSwapQuote({ fromToken: 'USDC', toToken: 'ETH', amount: '250' })]

    The quote shows you'll receive approximately 0.105 ETH for 250 USDC,
    with a price impact of 0.05%. Would you like me to proceed?

User: "Yes, go ahead"

AI: [calls eth_swap({ fromToken: 'USDC', toToken: 'ETH', amount: '250', slippageTolerance: 0.5 })]

    Done! I swapped 250 USDC for 0.1048 ETH.
    Transaction: 0xabc...
```

## Building Custom Tools

Create domain-specific tools that extend the built-in capabilities:

```typescript
import { AgentWallet } from '@lambdaclass/eth-agent';

function createAdvancedDeFiTools(wallet: AgentWallet) {
  return {
    definitions: [
      {
        name: 'dollar_cost_average',
        description: 'Execute a DCA strategy by splitting a large swap into smaller ones',
        parameters: {
          type: 'object',
          properties: {
            fromToken: { type: 'string' },
            toToken: { type: 'string' },
            totalAmount: { type: 'string' },
            numSwaps: { type: 'number', description: 'Number of swaps to split into' },
          },
          required: ['fromToken', 'toToken', 'totalAmount', 'numSwaps'],
        },
      },
    ],
    execute: async (name: string, input: any) => {
      if (name === 'dollar_cost_average') {
        const { fromToken, toToken, totalAmount, numSwaps } = input;
        const amountPerSwap = (parseFloat(totalAmount) / numSwaps).toFixed(2);
        const results = [];

        for (let i = 0; i < numSwaps; i++) {
          // Use built-in swap with safety limits
          const result = await wallet.safeSwap({
            fromToken,
            toToken,
            amount: amountPerSwap,
          });
          results.push(result);
        }

        return { swaps: results, totalSwaps: numSwaps };
      }
    },
  };
}
```

## Best Practices

1. **Start with conservative limits**: Use `SafetyPresets.CONSERVATIVE` initially.

2. **Always require approval for new recipients**: LLM hallucinations can produce plausible-looking addresses.

3. **Use preview before send**: Have the LLM call `preview_transaction` before `send_transaction` for high-value operations.

4. **Get quotes before swapping**: Instruct the AI to call `eth_getSwapQuote` before `eth_swap` for any significant swap amount.

5. **Use token allowlists for swaps**: Restrict which tokens the AI can swap to prevent trading in unknown or scam tokens.

6. **Log all operations**: Enable logging for audit trails.

7. **Test with testnets**: Use Sepolia or Goerli before mainnet.

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  network: 'sepolia',  // Use testnet
  ...SafetyPresets.CONSERVATIVE,
  limits: {
    ...SafetyPresets.CONSERVATIVE.limits,
    swap: {
      perTransactionUSD: 1000,
      perDayUSD: 5000,
      maxSlippagePercent: 1,
      maxPriceImpactPercent: 5,
      allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH'],  // Restrict to known tokens
    },
  },
});
```

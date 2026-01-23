# AI Framework Integration

eth-agent provides first-class integrations with major AI frameworks, transforming wallet operations into tool definitions that LLMs can invoke safely.

## Overview

Each integration exposes the same core operations:

### Read Operations
| Tool | Description |
|------|-------------|
| `eth_getBalance` | Check ETH balance for any address |
| `eth_getTokenBalance` | Check ERC-20 token balance |
| `eth_getLimits` | Get current spending limits and usage |
| `eth_getCapabilities` | Get wallet info and configuration |
| `eth_preview` | Simulate transaction before executing |
| `eth_getStablecoinBalance` | Check balance of a specific stablecoin |
| `eth_getStablecoinBalances` | Get all stablecoin balances |
| `eth_getSwapQuote` | Get a quote before swapping |
| `eth_getSwapLimits` | Check swap limits and remaining allowance |
| `eth_previewBridge` | Preview bridge with validation |
| `eth_compareBridgeRoutes` | Compare available bridge routes |
| `eth_getBridgeStatus` | Check bridge status by tracking ID |
| `eth_getBridgeLimits` | Check bridge limits and allowed chains |

### Write Operations
| Tool | Description |
|------|-------------|
| `eth_send` | Send ETH with safety limits |
| `eth_transferToken` | Transfer ERC-20 tokens |
| `eth_sendStablecoin` | Send stablecoins (USDC, USDT, DAI, etc.) |
| `eth_swap` | Swap tokens using Uniswap V3 |
| `eth_bridge` | Bridge stablecoins to another chain |

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

## Stablecoin Tools

The stablecoin tools provide first-class support for USDC, USDT, DAI, and other major stablecoins with human-readable amounts.

### eth_sendStablecoin

Send stablecoins to any address:

```typescript
// Tool call from AI
{
  name: 'eth_sendStablecoin',
  input: {
    token: 'USDC',           // USDC, USDT, USDS, DAI, PYUSD, FRAX
    to: 'alice.eth',         // Address or ENS name
    amount: '100'            // Human-readable (no decimals needed)
  }
}

// Response
{
  success: true,
  data: {
    hash: '0xabc...',
    summary: 'Sent 100 USDC to alice.eth. TX: 0xabc...'
  }
}
```

### eth_getStablecoinBalance / eth_getStablecoinBalances

Check stablecoin balances:

```typescript
// Get single stablecoin balance
{ name: 'eth_getStablecoinBalance', input: { token: 'USDC' } }
// → { success: true, summary: 'Balance: 1,234.56 USDC' }

// Get all stablecoin balances
{ name: 'eth_getStablecoinBalances', input: {} }
// → { success: true, summary: '1,234.56 USDC, 500 USDT' }
```

## Bridge Tools

Bridge stablecoins between chains with automatic route selection.

### eth_bridge

Bridge tokens to another chain:

```typescript
// Tool call from AI
{
  name: 'eth_bridge',
  input: {
    token: 'USDC',
    amount: '100',
    destinationChainId: 42161,  // Arbitrum
    priority: 'cost'            // or 'speed'
  }
}

// Response
{
  success: true,
  data: {
    trackingId: 'CCTP_11155111_84532_0xabc...',
    protocol: 'CCTP',
    sourceTxHash: '0xabc...',
    estimatedTime: '15-20 minutes',
    fee: { totalUSD: 0 }
  },
  summary: 'Bridging 100 USDC to Arbitrum via CCTP. Tracking ID: CCTP_...'
}
```

### Supported Chains

| Chain | Chain ID | Testnet ID |
|-------|----------|------------|
| Ethereum | 1 | 11155111 (Sepolia) |
| Arbitrum | 42161 | 421614 |
| Optimism | 10 | 11155420 |
| Base | 8453 | 84532 |
| Polygon | 137 | 80002 |
| Avalanche | 43114 | 43113 |

### eth_previewBridge

Preview before bridging:

```typescript
// Tool call
{
  name: 'eth_previewBridge',
  input: {
    token: 'USDC',
    amount: '1000',
    destinationChainId: 8453  // Base
  }
}

// Response
{
  success: true,
  summary: 'Can bridge 1000 USDC to Base. Protocol: CCTP, Fee: $0.00, Time: 15-20 minutes'
}
```

### eth_compareBridgeRoutes

Compare available bridging protocols:

```typescript
// Tool call
{
  name: 'eth_compareBridgeRoutes',
  input: { token: 'USDC', amount: '1000', destinationChainId: 42161 }
}

// Response
{
  success: true,
  summary: 'Recommended: CCTP. Options: CCTP: $0.00 fee, 15-20 min; Stargate: $0.60 fee, 5-10 min'
}
```

### eth_getBridgeStatus

Track bridge progress using the tracking ID:

```typescript
// Tool call
{
  name: 'eth_getBridgeStatus',
  input: { trackingId: 'CCTP_11155111_84532_0xabc...' }
}

// Response
{
  success: true,
  summary: 'Bridge attestation_pending: Waiting for Circle attestation (50% complete)'
}
```

### Example AI Conversation with Bridging

```
User: "I need to move 500 USDC from Ethereum to Arbitrum"

AI: Let me first check your USDC balance and preview the bridge.
    [calls eth_getStablecoinBalance({ token: 'USDC' })]
    [calls eth_previewBridge({ token: 'USDC', amount: '500', destinationChainId: 42161 })]

    You have 1,234.56 USDC. I can bridge 500 USDC to Arbitrum via CCTP
    with no protocol fees (just gas). Estimated time: 15-20 minutes.
    Would you like me to proceed?

User: "Yes, please"

AI: [calls eth_bridge({ token: 'USDC', amount: '500', destinationChainId: 42161 })]

    Bridge initiated! Your 500 USDC is being sent to Arbitrum.
    Tracking ID: CCTP_1_42161_0xdef...

    You can check the status anytime with the tracking ID.
    The bridge typically completes in 15-20 minutes.
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

3. **Use preview before send**: Have the LLM call `eth_preview` before `eth_send` for high-value operations.

4. **Get quotes before swapping**: Instruct the AI to call `eth_getSwapQuote` before `eth_swap` for any significant swap amount.

5. **Preview bridges before executing**: Use `eth_previewBridge` or `eth_compareBridgeRoutes` before `eth_bridge` to validate the operation and show the user expected fees/times.

6. **Use token allowlists for swaps**: Restrict which tokens the AI can swap to prevent trading in unknown or scam tokens.

7. **Configure bridge destination allowlists**: Restrict which chains the AI can bridge to for additional safety.

8. **Log all operations**: Enable logging for audit trails.

9. **Test with testnets**: Use Sepolia, Base Sepolia, or other testnets before mainnet.

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  rpcUrl: 'https://sepolia.rpc.url',  // Use testnet
  ...SafetyPresets.CONSERVATIVE,
  limits: {
    ...SafetyPresets.CONSERVATIVE.limits,
    swap: {
      perTransactionUSD: 1000,
      perDayUSD: 5000,
      maxSlippagePercent: 1,
      maxPriceImpactPercent: 5,
      allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH'],
    },
    bridge: {
      perTransactionUSD: 1000,
      perDayUSD: 5000,
      allowedDestinations: [42161, 8453, 10],  // Arbitrum, Base, Optimism only
    },
  },
});
```

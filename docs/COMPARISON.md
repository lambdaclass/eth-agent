# eth-agent vs Traditional Ethereum Libraries

A comprehensive comparison of eth-agent with ethers.js, viem, wagmi, and web3.js—with a focus on what makes eth-agent the right choice for AI agent development.

## Introduction

The rise of autonomous AI agents capable of executing financial transactions presents challenges that existing Ethereum libraries were never designed to handle. ethers.js, viem, wagmi, and web3.js all assume a human developer is in the loop—reviewing transactions, catching errors, and making judgment calls. They provide no built-in protection against:

- **Unbounded spending** — An agent that hallucinates a large transfer has no guardrails
- **Unknown recipients** — No mechanism to verify addresses before first use
- **Cryptic errors** — `UNPREDICTABLE_GAS_LIMIT` tells an LLM nothing actionable
- **Silent failures** — Agents cannot recover from errors they cannot parse

eth-agent was designed from first principles for autonomous operation. Safety constraints are not optional middleware—they are foundational to the execution model.

## Library Overview

| Library | Type | Primary Use Case | AI Agent Support |
|---------|------|------------------|------------------|
| **eth-agent** | Agent SDK | Autonomous AI systems | Native |
| **ethers.js** | General SDK | dApp development | None |
| **viem** | General SDK | TypeScript-first dApps | None |
| **wagmi** | React hooks | React dApps | None |
| **web3.js** | General SDK | Legacy projects | None |

## Feature Comparison Matrix

### Safety & Guardrails

| Feature | eth-agent | ethers | viem | wagmi | web3.js |
|---------|-----------|--------|------|-------|---------|
| Per-transaction spending limits | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hourly spending limits | ✅ | ❌ | ❌ | ❌ | ❌ |
| Daily spending limits | ✅ | ❌ | ❌ | ❌ | ❌ |
| Weekly spending limits | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gas spending limits | ✅ | ❌ | ❌ | ❌ | ❌ |
| Human approval flows | ✅ | ❌ | ❌ | ❌ | ❌ |
| Address blocklists | ✅ | ❌ | ❌ | ❌ | ❌ |
| Address allowlists | ✅ | ❌ | ❌ | ❌ | ❌ |
| New recipient verification | ✅ | ❌ | ❌ | ❌ | ❌ |
| Emergency stop trigger | ✅ | ❌ | ❌ | ❌ | ❌ |
| Balance threshold alerts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transaction simulation | ✅ | ❌ | ✅* | ❌ | ❌ |
| Transaction preview | ✅ | ❌ | ❌ | ❌ | ❌ |

*viem supports `eth_call` simulation but without safety validation or structured preview.

### AI/LLM Integration

| Feature | eth-agent | ethers | viem | wagmi | web3.js |
|---------|-----------|--------|------|-------|---------|
| Pre-built LLM tool definitions | ✅ (18 tools) | ❌ | ❌ | ❌ | ❌ |
| Anthropic Claude integration | ✅ | ❌ | ❌ | ❌ | ❌ |
| OpenAI function calling | ✅ | ❌ | ❌ | ❌ | ❌ |
| LangChain tools | ✅ | ❌ | ❌ | ❌ | ❌ |
| MCP server support | ✅ | ❌ | ❌ | ❌ | ❌ |
| Structured errors with suggestions | ✅ | ❌ | ❌ | ❌ | ❌ |
| Machine-readable error codes | ✅ | Partial | ✅ | ✅ | ❌ |
| Result types (no throw) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Retry guidance in errors | ✅ | ❌ | ❌ | ❌ | ❌ |

### Operations

| Feature | eth-agent | ethers | viem | wagmi | web3.js |
|---------|-----------|--------|------|-------|---------|
| ETH transfers | ✅ | ✅ | ✅ | ✅ | ✅ |
| ERC-20 transfers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stablecoin-specific APIs | ✅ | ❌ | ❌ | ❌ | ❌ |
| One-line USDC transfer | ✅ | ❌ | ❌ | ❌ | ❌ |
| Auto decimal handling | ✅ | ❌ | ❌ | ❌ | ❌ |
| ENS resolution | ✅ | ✅ | ✅ | ✅ | ✅ |
| ENS caching | ✅ | ❌ | ❌ | ❌ | ❌ |
| Uniswap V3 swaps | ✅ | ❌ | ❌ | ❌ | ❌ |
| Swap slippage protection | ✅ | ❌ | ❌ | ❌ | ❌ |
| Price impact limits | ✅ | ❌ | ❌ | ❌ | ❌ |
| Swap spending limits | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cross-chain bridging | ✅ | ❌ | ❌ | ❌ | ❌ |
| CCTP integration | ✅ | ❌ | ❌ | ❌ | ❌ |
| Stargate integration | ✅ | ❌ | ❌ | ❌ | ❌ |
| Across integration | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bridge route comparison | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bridge status tracking | ✅ | ❌ | ❌ | ❌ | ❌ |
| ERC-4337 smart accounts | ✅ | ❌ | ✅ | ❌ | ❌ |
| Session keys | ✅ | ❌ | ❌ | ❌ | ❌ |

### Developer Experience

| Feature | eth-agent | ethers | viem | wagmi | web3.js |
|---------|-----------|--------|------|-------|---------|
| TypeScript-first | ✅ | ✅ | ✅ | ✅ | ❌ |
| Minimal runtime dependencies | ✅ (2) | ✅ (0) | ✅ (8) | ❌ (many) | ❌ (many) |
| Tree-shakeable | ✅ | ✅ | ✅ | ✅ | ✅ |
| Human-readable amounts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Subpath exports | ✅ | ✅ | ✅ | ✅ | ❌ |


## Why eth-agent is Better for AI Agents

### 1. Safety-First Architecture

Traditional libraries trust the caller. eth-agent does not. Every wallet instance carries immutable spending limits that cannot be bypassed:

```typescript
const wallet = AgentWallet.create({
  limits: {
    perTransaction: '0.1 ETH',
    perHour: '1 ETH',
    perDay: '5 ETH',
    stablecoin: {
      USDC: { perDay: '1000' },
    },
  },
});

// This fails with a structured error, regardless of what the agent requests
await wallet.send({ to: addr, amount: '10 ETH' });
// Error: TRANSACTION_LIMIT_EXCEEDED
// Suggestion: "Reduce amount to 0.1 ETH or less"
```

An agent cannot import a different module or modify configuration to circumvent these limits. The safety boundary exists in the library, not the application.

### 2. Structured Errors for Machine Consumption

When ethers.js fails, you get:

```
Error: cannot estimate gas; transaction may fail or may require manual gas limit
```

When eth-agent fails, you get:

```typescript
{
  code: 'DAILY_LIMIT_EXCEEDED',
  message: 'Transaction would exceed daily limit of 5 ETH',
  suggestion: 'Reduce amount to 2.5 ETH or wait until 2024-01-16T00:00:00Z',
  retryable: true,
  retryAfter: 14400000,
  details: {
    requested: { eth: '5' },
    remaining: { eth: '2.5' },
    resetAt: '2024-01-16T00:00:00Z'
  }
}
```

An agent can programmatically decide to:
- Retry with a smaller amount
- Schedule a retry after the limit resets
- Ask a human for approval to exceed limits
- Explain the situation clearly to the user

### 3. Human Approval Flows

High-value transactions can require human approval before execution:

```typescript
const wallet = AgentWallet.create({
  onApprovalRequired: async (request) => {
    // Send to Slack, SMS, UI component, etc.
    return await askHuman({
      summary: request.summary,
      amount: request.amount,
      recipient: request.to,
      riskLevel: request.riskLevel,
    });
  },
  approvalConfig: {
    requireApprovalWhen: {
      amountExceeds: '1 ETH',
      recipientIsNew: true,
      riskLevel: 'high',
    },
  },
});
```

The approval flow is part of the transaction lifecycle—not an afterthought. If approval is denied, the agent receives a structured `ApprovalDeniedError` with the reason.

### 4. Native LLM Tool Definitions

eth-agent provides 18 pre-built tools for AI frameworks:

**Anthropic Claude:**
```typescript
import { anthropicTools } from '@lambdaclass/eth-agent/anthropic';

const tools = anthropicTools(wallet);
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  tools: tools.definitions,
  messages: [{ role: 'user', content: 'Send 100 USDC to alice.eth' }],
});
```

**OpenAI:**
```typescript
import { openaiTools } from '@lambdaclass/eth-agent/openai';

const tools = openaiTools(wallet);
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  tools: tools.definitions,
  messages: [{ role: 'user', content: 'What is my USDC balance?' }],
});
```

**LangChain:**
```typescript
import { langchainTools } from '@lambdaclass/eth-agent/langchain';

const tools = langchainTools(wallet);
const agent = createReactAgent({ llm, tools });
```

**MCP (Claude Desktop):**
```typescript
import { createMCPServer } from '@lambdaclass/eth-agent/mcp';

const server = createMCPServer(wallet);
```

All 18 tools return consistent `ToolResult` objects with success status, data, error details, and human-readable summaries.

### 5. Result Types Instead of Exceptions

eth-agent provides Rust-inspired `Result<T, E>` types for explicit error handling:

```typescript
const result = await wallet.safeSendUSDC({ to: 'alice.eth', amount: '100' });

if (result.ok) {
  console.log(`Sent! Hash: ${result.value.hash}`);
} else {
  console.log(`Failed: ${result.error.suggestion}`);
  if (result.error.retryable) {
    await sleep(result.error.retryAfter);
    // Retry...
  }
}
```

No try/catch blocks. No uncaught exceptions crashing your agent. The error path is explicit and type-safe.

### 6. One-Line Stablecoin Operations

With ethers.js:
```typescript
const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const decimals = 6;
const amount = BigInt(100 * 10 ** decimals);
const contract = new ethers.Contract(usdcAddress, erc20Abi, wallet);
const tx = await contract.transfer(recipient, amount);
```

With eth-agent:
```typescript
await wallet.sendUSDC({ to: 'alice.eth', amount: '100' });
```

eth-agent handles:
- Contract address lookup per chain
- Decimal conversion (USDC=6, DAI=18, etc.)
- ENS resolution
- Safety limit checks
- Structured error responses

### 7. Built-in Cross-Chain Bridging

Traditional libraries require you to integrate with each bridge protocol separately. eth-agent provides a unified interface:

```typescript
// Preview available routes
const routes = await wallet.compareBridgeRoutes({
  token: USDC,
  amount: '1000',
  sourceChainId: 1,        // Ethereum
  destinationChainId: 42161 // Arbitrum
});

// Bridge using the cheapest route
await wallet.bridge({
  token: USDC,
  amount: '1000',
  destinationChainId: 42161,
  protocol: 'cctp', // or 'stargate', 'across'
});

// Track status
const status = await wallet.getBridgeStatus(txHash);
```

Supported protocols:
- **CCTP (Circle)** — Zero fees, 1:1 burn/mint, seconds with Fast Transfers (V2)
- **Stargate** — ~0.06% fee, 5-15 min
- **Across** — Variable fees, ~2 seconds on L2→L2 routes

## Code Comparison Examples

### Simple USDC Transfer

**ethers.js:**
```typescript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
const contract = new ethers.Contract(usdcAddress, erc20Abi, wallet);

// Must manually handle decimals
const amount = BigInt(100 * 10 ** 6); // 100 USDC
const tx = await contract.transfer(recipientAddress, amount);
await tx.wait();
```

**viem:**
```typescript
import { createWalletClient, http, parseUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const client = createWalletClient({
  account: privateKeyToAccount(privateKey),
  chain: mainnet,
  transport: http(rpcUrl),
});

const hash = await client.writeContract({
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  abi: erc20Abi,
  functionName: 'transfer',
  args: [recipientAddress, parseUnits('100', 6)],
});
```

**eth-agent:**
```typescript
import { AgentWallet, USDC } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({ privateKey, rpc });
await wallet.sendUSDC({ to: 'alice.eth', amount: '100' });
```

### Transfer with Safety Limits

**ethers.js / viem / web3.js:**
```typescript
// Not supported. You must build this yourself:
// - Track spending in a database
// - Check limits before each transaction
// - Handle concurrent requests
// - Reset limits on schedule
// - Add approval flows
// 500+ lines of custom code...
```

**eth-agent:**
```typescript
const wallet = AgentWallet.create({
  privateKey,
  rpc,
  limits: {
    perTransaction: '100 USDC',
    perDay: '1000 USDC',
  },
});

// Automatically enforced. No additional code needed.
await wallet.sendUSDC({ to: 'alice.eth', amount: '100' });
```

### Swap with Safety Checks

**ethers.js / viem:**
```typescript
// Requires:
// 1. Uniswap SDK integration
// 2. Manual route calculation
// 3. Manual slippage calculation
// 4. Manual price impact calculation
// 5. Custom limit enforcement
// 6. Error handling for all edge cases
// 1000+ lines of code...
```

**eth-agent:**
```typescript
const quote = await wallet.getSwapQuote({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
});

console.log(quote.priceImpact);    // "0.12%"
console.log(quote.minimumOutput); // "0.0312 ETH"

// Swap with automatic slippage and limit enforcement
await wallet.swap({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
  maxSlippage: 0.5, // 0.5%
});
```

## When to Use Each Library

| Use Case | Recommended Library |
|----------|---------------------|
| AI agents handling payments | **eth-agent** |
| Autonomous trading systems | **eth-agent** |
| Payment automation | **eth-agent** |
| Multi-agent systems | **eth-agent** |
| General dApp development | ethers.js or viem |
| React-based dApps | wagmi |
| Performance-critical apps | viem |
| Legacy project maintenance | web3.js |
| Complex custom contracts | ethers.js or viem |

## Summary

| What You Need | Traditional Libraries | eth-agent |
|---------------|----------------------|-----------|
| Stop an agent from overspending | Build it yourself | Built-in limits |
| Get human approval for large transfers | Build it yourself | Built-in approval flows |
| Integrate with Claude/GPT/LangChain | Build it yourself | 18 pre-built tools |
| Handle errors gracefully | Parse cryptic messages | Structured errors with suggestions |
| Send stablecoins easily | Manual contract calls | One-line operations |
| Bridge tokens cross-chain | Integrate each protocol | Unified bridge router |
| Track spending over time | Build it yourself | Built-in tracking |
| Prevent transfers to blocked addresses | Build it yourself | Built-in policies |
| Deploy with minimal dependencies | Varies by library | 2 audited deps |

eth-agent is not a replacement for ethers.js or viem in all scenarios. If you are building a traditional dApp with full human oversight, those libraries remain excellent choices.

But if you are building systems where AI agents operate autonomously with real funds, eth-agent provides the safety infrastructure that traditional libraries lack. The question is not whether you need spending limits and approval flows—you do. The question is whether you want to build them yourself or use a library designed for this purpose.

---

**Get Started:**
- [GitHub Repository](https://github.com/lambdaclass/eth-agent)
- [Getting Started Guide](./getting-started.md)
- [Safety Guide](./safety.md)
- [AI Integration Guide](./ai-integration.md)

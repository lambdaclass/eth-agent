# eth-agent: A Safety-First Ethereum SDK for Autonomous Agents

As AI systems transition from tools that assist humans to agents that act autonomously, their integration with financial infrastructure demands a fundamental rethinking of interface design. Existing Ethereum libraries—ethers.js, viem, web3.js—were built for human developers who review transactions before signing. They offer no protection against the failure modes unique to autonomous operation: hallucinated addresses, unbounded spending, and silent failures that leave agents unable to recover.

eth-agent is our answer to this architectural gap. It is a TypeScript SDK designed from first principles for autonomous Ethereum interaction, where safety constraints are not optional middleware but foundational to the execution model.

## The Problem with Existing Libraries

Consider what happens when an AI agent uses ethers.js to send a transaction:

```typescript
const wallet = new ethers.Wallet(privateKey, provider);
const tx = await wallet.sendTransaction({
  to: ensName,
  value: parseEther(amount)
});
```

This code has no concept of spending limits, no mechanism for human approval, and produces errors like `UNPREDICTABLE_GAS_LIMIT` or hex-encoded revert data that an LLM cannot interpret meaningfully. The library assumes a human is in the loop. When there isn't one, failure is silent or catastrophic.

The problem is not that ethers.js is poorly written—it isn't. The problem is that it was designed for a different threat model. We need libraries that assume the caller might be an unreliable reasoning system operating at scale.

## Design Principles

eth-agent is built on three principles:

**1. Safety constraints are not optional.** Every wallet instance carries spending limits that cannot be bypassed by the calling code. A transaction that would exceed the daily limit fails with a structured error, regardless of what the agent requests:

```typescript
const wallet = AgentWallet.create({
  limits: {
    perTransaction: '0.1 ETH',
    perHour: '1 ETH',
    perDay: '5 ETH',
  },
});
```

This is not a suggestion. An agent cannot import a different module or modify configuration to circumvent these limits. The safety boundary is in the library, not the application.

**2. Errors are structured for machine consumption.** Every exception carries machine-readable metadata:

```typescript
{
  code: 'DAILY_LIMIT_EXCEEDED',
  message: 'Transaction would exceed daily limit. Remaining: 2.5 ETH',
  suggestion: 'Reduce amount to 2.5 ETH or wait until 2024-01-16T00:00:00Z',
  retryable: true,
  retryAfter: 14400000,
  details: { requested: { eth: '5' }, remaining: { eth: '2.5' } }
}
```

An agent can programmatically determine whether to retry, how long to wait, and how to explain the failure to a user. This is the difference between `catch (e) { throw e }` and `catch (e) { return scheduledRetry(e.retryAfter) }`.

**3. Human oversight is architecturally supported.** For high-value operations, the library supports approval callbacks that halt execution until a human responds:

```typescript
const wallet = AgentWallet.create({
  onApprovalRequired: async (request) => {
    return await askHuman(request.summary);
  },
  approvalConfig: {
    requireApprovalWhen: {
      amountExceeds: '0.1 ETH',
      recipientIsNew: true,
    },
  },
});
```

This is not a webhook you add later. The approval flow is part of the transaction lifecycle, and the agent receives a structured denial if approval is withheld.

## Minimal Dependencies

eth-agent depends on exactly two runtime packages:

- `@noble/secp256k1` — ECDSA operations
- `@noble/hashes` — Keccak256, SHA256

Both are audited, maintained by [@paulmillr](https://github.com/paulmillr), and contain no transitive dependencies. We do not depend on ethers.js, viem, or web3.js. The core cryptographic primitives—RLP encoding, ABI encoding, transaction signing—are implemented directly.

This is a deliberate choice. Dependency bloat is a security liability, and autonomous systems should minimize their attack surface. At 96k lines, eth-agent is significantly smaller than comparable full-stack Ethereum libraries.

## Stablecoins as First-Class Citizens

Autonomous agents handling payments need stablecoins, not volatile assets. eth-agent provides built-in support for USDC, USDT, USDS (Sky), DAI, PYUSD, and FRAX with human-readable amounts:

```typescript
import { AgentWallet, USDC } from '@lambdaclass/eth-agent';

// Send 100 USDC (not 100 * 10^6)
await wallet.sendUSDC({ to: 'merchant.eth', amount: '100' });

// Multi-chain support built-in
const balance = await wallet.getStablecoinBalance(USDC);
console.log(balance.formatted);  // "1,234.56"
```

Decimals handling is automatic—USDC uses 6 decimals, USDS uses 18—and addresses are resolved per-chain. An agent can request `sendUSDC({ amount: '100' })` without understanding token decimals or looking up contract addresses. This is the kind of abstraction that prevents expensive mistakes.

## ERC-4337 and Account Abstraction

eth-agent includes first-class support for smart accounts (ERC-4337), bundlers, and paymasters:

```typescript
const smartAccount = await SmartAccount.create({
  owner: EOA.fromPrivateKey(key),
  rpc,
  bundler,
});

await smartAccount.execute([
  { to: addr1, value: ETH(0.1), data: '0x' },
  { to: addr2, value: ETH(0.2), data: '0x' },
]);
```

Session keys enable delegated signing with limited permissions—an agent can be granted authority to sign transactions up to 0.1 ETH for one hour, to specific contract addresses, with a maximum transaction count. When the session expires or limits are reached, signing fails cleanly.

## Framework Integrations

Adapters for OpenAI, Anthropic, and LangChain transform wallet operations into function definitions these frameworks can invoke:

```typescript
const tools = anthropicTools(wallet);

await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  tools: tools.definitions,
  messages: [{ role: 'user', content: 'Send 0.01 ETH to vitalik.eth' }],
});
```

The tools expose `get_balance`, `send_transaction`, `preview_transaction`, and related operations. Safety limits apply regardless of which framework invokes them.

## Current Status and Roadmap

eth-agent is in active development. The core wallet, transaction building, ERC-4337, and session key implementations are complete with 96% test coverage. MCP (Model Context Protocol) integration for Claude Desktop is in progress.

We welcome contributions. The codebase prioritizes readability over cleverness—traits are a last resort, macros are avoided, and code paths are explicit.

**Repository:** [github.com/unbalancedparentheses/eth-agent](https://github.com/unbalancedparentheses/eth-agent)

---

*eth-agent is dual-licensed under MIT and Apache 2.0.*

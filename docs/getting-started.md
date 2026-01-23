# Getting Started

This guide walks through creating your first AI-safe Ethereum wallet and executing transactions.

## Installation

```bash
npm install @lambdaclass/eth-agent
```

## Basic Setup

```typescript
import { AgentWallet } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  rpcUrl: 'https://eth.llamarpc.com',  // Optional, defaults to public RPC
});

console.log(`Address: ${wallet.address}`);
```

## Check Balance

```typescript
const balance = await wallet.getBalance();

console.log(balance.wei);       // 1500000000000000000n
console.log(balance.eth);       // "1.5"
console.log(balance.formatted); // "1.5 ETH"

// Check any address or ENS name
const other = await wallet.getBalance('vitalik.eth');
```

## Send ETH

```typescript
const result = await wallet.send({
  to: 'vitalik.eth',    // ENS names work
  amount: '0.01 ETH',   // Human-readable amounts
});

console.log(result.success);  // true
console.log(result.hash);     // 0x...
console.log(result.summary);  // "Sent 0.01 ETH to vitalik.eth..."
```

## Preview Before Sending

Always preview transactions before executing:

```typescript
const preview = await wallet.preview({
  to: 'alice.eth',
  amount: '0.5 ETH',
});

if (preview.canExecute) {
  console.log(`Value: ${preview.costs.value.eth} ETH`);
  console.log(`Gas: ${preview.costs.gas.eth} ETH`);
  console.log(`Total: ${preview.costs.total.eth} ETH`);
} else {
  console.log(`Cannot execute: ${preview.blockers.join(', ')}`);
}
```

## Add Safety Limits

```typescript
import { AgentWallet, SafetyPresets } from '@lambdaclass/eth-agent';

// Use a preset
const wallet = AgentWallet.create({
  privateKey: KEY,
  ...SafetyPresets.BALANCED,
});

// Or configure manually
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    perTransaction: '0.1 ETH',
    perHour: '1 ETH',
    perDay: '5 ETH',
  },
});
```

## Require Human Approval

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  onApprovalRequired: async (request) => {
    console.log(`Approve: ${request.summary}?`);
    // Integrate with your approval system
    return await askHuman();
  },
  approvalConfig: {
    requireApprovalWhen: {
      amountExceeds: '0.1 ETH',
      recipientIsNew: true,
    },
  },
});
```

## Send Stablecoins

Built-in support for USDC, USDT, USDS (Sky), DAI, PYUSD, and FRAX with automatic decimals handling:

```typescript
import { AgentWallet, USDC, USDT, USDS } from '@lambdaclass/eth-agent';

// Send USDC (human-readable amounts)
await wallet.sendUSDC({ to: 'alice.eth', amount: '100' });     // 100 USDC
await wallet.sendUSDT({ to: 'bob.eth', amount: '50.50' });     // 50.50 USDT

// Or use any stablecoin
await wallet.sendStablecoin({ token: USDS, to: 'alice.eth', amount: '1000' });

// Check balances
const usdcBalance = await wallet.getStablecoinBalance(USDC);
console.log(usdcBalance.formatted);  // "1,234.56"
console.log(usdcBalance.symbol);     // "USDC"

// Safe version with Result types
const result = await wallet.safeSendUSDC({ to: 'alice.eth', amount: '100' });
if (result.ok) {
  console.log(result.value.hash);
} else {
  console.log(result.error.suggestion);
}
```

## Transfer ERC-20 Tokens

For tokens not built-in, use the generic ERC-20 API:

```typescript
const result = await wallet.transferToken({
  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  to: 'bob.eth',
  amount: '100',
});

// Check token balance
const balance = await wallet.getTokenBalance(
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
);
console.log(`${balance.formatted} ${balance.symbol}`);
```

## Error Handling

Errors are structured for programmatic handling:

```typescript
try {
  await wallet.send({ to: 'alice.eth', amount: '100 ETH' });
} catch (error) {
  console.log(error.code);        // 'DAILY_LIMIT_EXCEEDED'
  console.log(error.suggestion);  // 'Reduce amount to 2.5 ETH...'
  console.log(error.retryable);   // true
  console.log(error.retryAfter);  // 14400000 (ms)
}
```

## Result Types (Explicit Error Handling)

For AI agents that need predictable error handling, use the safe methods:

```typescript
const result = await wallet.safeSend({ to: 'alice.eth', amount: '0.1 ETH' });

if (result.ok) {
  console.log(`Success: ${result.value.hash}`);
} else {
  console.log(`Error: ${result.error.code}`);
  console.log(`Suggestion: ${result.error.suggestion}`);
  if (result.error.retryable) {
    console.log(`Retry after: ${result.error.retryAfter}ms`);
  }
}
```

Pattern matching on errors:

```typescript
import { matchResult } from '@lambdaclass/eth-agent';

const message = matchResult(result)
  .ok((r) => `Sent! TX: ${r.hash}`)
  .errWith({ code: 'INSUFFICIENT_FUNDS' }, (e) => `Need more ETH`)
  .errWith({ code: 'DAILY_LIMIT_EXCEEDED' }, () => `Wait until tomorrow`)
  .err((e) => e.suggestion)
  .run();
```

## Next Steps

- [Safety Guide](./safety.md) — Configure spending limits and approval flows
- [Smart Accounts](./smart-accounts.md) — Use ERC-4337 account abstraction
- [AI Integration](./ai-integration.md) — Connect to OpenAI, Anthropic, LangChain
- [API Reference](./api-reference.md) — Complete API documentation

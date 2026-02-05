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

Human approval is supported for all wallet operations: sends, transfers, swaps, and bridges.

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  onApprovalRequired: async (request) => {
    // request.type: 'send' | 'transfer_token' | 'swap' | 'bridge'
    console.log(`Operation: ${request.type}`);
    console.log(`Approve: ${request.summary}?`);
    console.log(`Risk: ${request.details.risk}`);
    // Integrate with your approval system (Slack, email, etc.)
    return await askHuman();
  },
  approvalConfig: {
    requireApprovalWhen: {
      amountExceeds: '0.1 ETH',
      recipientIsNew: true,  // Untrusted addresses trigger approval
    },
  },
  trustedAddresses: [
    { address: 'treasury.eth', label: 'Company Treasury' },
  ],
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

## Bridge USDC Across Chains

Bridge USDC to other chains using Circle's CCTP (Cross-Chain Transfer Protocol):

```typescript
// Preview the bridge first
const preview = await wallet.previewBridgeUSDC({
  amount: '100',
  destinationChainId: 8453,  // Base
});

if (!preview.canBridge) {
  console.log('Cannot bridge:', preview.blockers);
  return;
}

console.log(`Will bridge ${preview.amount.formatted} USDC`);
console.log(`Estimated time: ${preview.estimatedTime}`);

// Execute the bridge (burns USDC on source chain)
const result = await wallet.bridgeUSDC({
  amount: '100',
  destinationChainId: 8453,
});

console.log(`Burn TX: ${result.burnTxHash}`);
console.log(`Message hash: ${result.messageHash}`);

// Check status anytime
const status = await wallet.getBridgeStatus(result.messageHash);
console.log(`Status: ${status.status}`);

// Wait for Circle attestation (10-30 min on mainnet)
const attestation = await wallet.waitForBridgeAttestation(result.messageHash);
console.log('Attestation received, bridge completing...');
```

Supported chains: Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche (and their testnets).

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

## Swap Tokens

Swap any token using Uniswap V3 with built-in slippage protection:

```typescript
// Get a quote first (optional but recommended)
const quote = await wallet.getSwapQuote({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
});

console.log(`Input: ${quote.fromToken.amount} ${quote.fromToken.symbol}`);
console.log(`Output: ${quote.toToken.amount} ${quote.toToken.symbol}`);
console.log(`Minimum output (after slippage): ${quote.amountOutMinimum}`);
console.log(`Price impact: ${quote.priceImpact}%`);

// Execute the swap
const result = await wallet.swap({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
  slippageTolerance: 0.5,  // 0.5% max slippage (not 50%!)
});

console.log(result.summary);
// → "Swapped 100 USDC for 0.042 ETH. TX: 0xabc..."
```

### Supported Tokens

Use token symbols or contract addresses:

```typescript
// By symbol (built-in tokens)
await wallet.swap({ fromToken: 'ETH', toToken: 'USDC', amount: '0.1' });
await wallet.swap({ fromToken: 'WETH', toToken: 'UNI', amount: '0.5' });
await wallet.swap({ fromToken: 'LINK', toToken: 'USDT', amount: '10' });

// By contract address (any ERC-20)
await wallet.swap({
  fromToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',  // UNI
  toToken: 'ETH',
  amount: '50',
});
```

### Swap with Limits

Configure swap-specific spending limits:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    swap: {
      perTransactionUSD: 5000,     // Max $5,000 per swap
      perDayUSD: 50000,            // Max $50,000 per day
      maxSlippagePercent: 1,       // Max 1% slippage allowed
      maxPriceImpactPercent: 5,    // Max 5% price impact
      allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH'],  // Optional allowlist
    },
  },
});

// Check swap limits
const limits = wallet.getSwapLimits();
console.log(`Daily remaining: $${limits.daily.remaining}`);
```

### Safe Swap (Result Types)

Use `safeSwap` for explicit error handling:

```typescript
const result = await wallet.safeSwap({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
});

if (result.ok) {
  console.log(`Swapped! TX: ${result.value.hash}`);
  console.log(`Received: ${result.value.swap.tokenOut.amount} ETH`);
} else {
  console.log(`Error: ${result.error.code}`);
  console.log(`Suggestion: ${result.error.suggestion}`);
}
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

- [Safety Guide](./safety.md) — Configure spending limits, bridge limits, and approval flows
- [Smart Accounts](./smart-accounts.md) — Use ERC-4337 account abstraction
- [AI Integration](./ai-integration.md) — Connect to OpenAI, Anthropic, LangChain
- [API Reference](./api-reference.md) — Complete API documentation including bridging

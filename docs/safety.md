# Safety Guide

eth-agent's safety features are not optional middleware—they are foundational to the execution model. This guide explains how to configure them for your threat model.

## Why Safety Matters for Agents

Traditional Ethereum libraries assume a human reviews each transaction. AI agents introduce new failure modes:

- **Hallucination**: An LLM might fabricate addresses or amounts
- **Unbounded spending**: A loop could drain your wallet
- **Silent failures**: Cryptic errors leave agents unable to recover
- **No oversight**: Autonomous operation without human checkpoints

eth-agent addresses each of these with architectural constraints.

## Spending Limits

### Configuration

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    perTransaction: '0.1 ETH',  // Max per single transaction
    perHour: '1 ETH',           // Rolling hourly cap
    perDay: '5 ETH',            // Rolling daily cap
  },
});
```

### Enforcement

Limits are enforced at the library level. An agent cannot bypass them:

```typescript
// This will throw TRANSACTION_LIMIT_EXCEEDED
await wallet.send({ to: addr, amount: '0.5 ETH' });

// This will throw DAILY_LIMIT_EXCEEDED after enough transactions
for (let i = 0; i < 100; i++) {
  await wallet.send({ to: addr, amount: '0.1 ETH' });
}
```

### Checking Limits

```typescript
const limits = wallet.getLimits();

console.log(limits.perTransaction.limit);  // "0.1"
console.log(limits.hourly.used);           // "0.3"
console.log(limits.hourly.remaining);      // "0.7"
console.log(limits.daily.used);            // "1.2"
console.log(limits.daily.remaining);       // "3.8"
```

## Swap Limits

Token swaps via Uniswap have their own set of limits to protect against unfavorable trades.

### Configuration

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    swap: {
      perTransactionUSD: 5000,      // Max $5,000 per swap
      perDayUSD: 50000,             // Max $50,000 per day in swaps
      maxSlippagePercent: 1,        // Max 1% slippage allowed
      maxPriceImpactPercent: 5,     // Max 5% price impact
      allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH', 'UNI', 'LINK'],
      blockedTokens: ['SCAM_TOKEN'],
    },
  },
});
```

### Slippage Protection

**Slippage** is the difference between the quoted price and the executed price. It's expressed as a **percentage value**:

- `0.5` = 0.5% maximum slippage
- `1` = 1% maximum slippage
- `0.1` = 0.1% maximum slippage

```typescript
// This swap will fail if executed price differs >1% from quote
await wallet.swap({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '1000',
  slippageTolerance: 1,  // 1% max slippage (NOT 100%!)
});
```

If the user requests a slippage higher than `maxSlippagePercent`, the swap is rejected:

```json
{
  "code": "SLIPPAGE_EXCEEDED",
  "message": "Requested slippage 5% exceeds maximum allowed 1%",
  "suggestion": "Reduce slippage tolerance or contact administrator"
}
```

### Price Impact Protection

**Price impact** measures how much your swap affects the pool's price. Large swaps in low-liquidity pools can suffer significant price impact.

```typescript
limits: {
  swap: {
    maxPriceImpactPercent: 5,  // Reject swaps with >5% price impact
  },
}
```

If a swap would cause excessive price impact:

```json
{
  "code": "PRICE_IMPACT_TOO_HIGH",
  "message": "Price impact 7.5% exceeds maximum allowed 5%",
  "suggestion": "Reduce swap amount or split into multiple smaller swaps"
}
```

### Token Allowlists and Blocklists

Restrict which tokens can be swapped:

```typescript
limits: {
  swap: {
    // Only these tokens can be swapped (if set)
    allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH'],

    // These tokens are always blocked
    blockedTokens: ['SCAM_TOKEN', 'RUGPULL'],
  },
}
```

Blocked token swaps throw:

```json
{
  "code": "TOKEN_NOT_ALLOWED",
  "message": "Token \"SCAM_TOKEN\" is blocked for swapping",
  "suggestion": "Use a different token that is allowed by the wallet configuration"
}
```

### Checking Swap Limits

```typescript
const limits = wallet.getSwapLimits();

console.log(limits.perTransaction.limit);    // "5000" (USD)
console.log(limits.daily.remaining);         // "45000" (USD)
console.log(limits.maxSlippagePercent);      // 1
console.log(limits.maxPriceImpactPercent);   // 5
console.log(limits.allowedTokens);           // ['ETH', 'USDC', ...] or null
console.log(limits.blockedTokens);           // ['SCAM_TOKEN']
```

### Bridge Limits

Cross-chain bridging has separate limits to control USDC transfers between chains:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    perTransaction: '0.1 ETH',
    perDay: '5 ETH',
    bridge: {
      perTransactionUSD: '1000',    // Max $1000 per bridge
      perDayUSD: '10000',           // Max $10,000 per day
      allowedDestinations: [        // Whitelist destination chains
        42161,  // Arbitrum
        8453,   // Base
        10,     // Optimism
      ],
    },
  },
});
```

#### Checking Bridge Limits

```typescript
const bridgeLimits = wallet.getBridgeLimits();

console.log(bridgeLimits.daily.limit);      // "10000"
console.log(bridgeLimits.daily.spent);      // "2500"
console.log(bridgeLimits.daily.remaining);  // "7500"
```

#### Bridge Limit Errors

```json
{
  "code": "BRIDGE_LIMIT_EXCEEDED",
  "message": "Bridge amount exceeds daily limit",
  "suggestion": "Reduce amount to 7500 USDC or wait until tomorrow"
}
```

```json
{
  "code": "BRIDGE_DESTINATION_NOT_ALLOWED",
  "message": "Destination chain 137 is not in allowed list",
  "suggestion": "Use one of the allowed destination chains: Arbitrum, Base, Optimism"
}
```
## Emergency Stop

Halt all operations if balance drops too low:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    perTransaction: '0.1 ETH',
    emergencyStop: {
      minBalanceRequired: '0.05 ETH',
    },
  },
});
```

When triggered:
```json
{
  "code": "EMERGENCY_STOP",
  "message": "Wallet is stopped: Balance below minimum threshold",
  "suggestion": "Contact administrator to review and resume operations"
}
```

## Human Approval

### Basic Configuration

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  onApprovalRequired: async (request) => {
    console.log(`Summary: ${request.summary}`);
    console.log(`Details:`, request.details);
    return await yourApprovalSystem.ask(request);
  },
  approvalConfig: {
    requireApprovalWhen: {
      amountExceeds: '0.1 ETH',
      recipientIsNew: true,
    },
  },
});
```

### Approval Request Structure

```typescript
interface ApprovalRequest {
  summary: string;  // "Send 0.5 ETH to 0x1234...5678"
  details: {
    to: Address;
    amount: { wei: bigint; eth: string };
    estimatedGas: { wei: bigint; eth: string };
    total: { wei: bigint; eth: string };
    recipient: {
      isTrusted: boolean;
      isNew: boolean;
      label?: string;
    };
  };
}
```

### Integration Examples

**Slack:**
```typescript
onApprovalRequired: async (request) => {
  const response = await slack.postMessage({
    channel: '#approvals',
    text: `Approve: ${request.summary}`,
    attachments: [{ fields: formatDetails(request.details) }],
  });
  return await waitForReaction(response.ts, '✅');
}
```

**Email:**
```typescript
onApprovalRequired: async (request) => {
  await sendEmail({
    to: 'treasury@company.com',
    subject: `Approval Required: ${request.summary}`,
    body: formatApprovalEmail(request),
  });
  return await waitForApprovalToken(request.id);
}
```

## Address Policies

### Trusted Addresses

Skip approval for known-good addresses:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  trustedAddresses: [
    { address: '0x1234...5678', label: 'Company Treasury' },
    { address: 'treasury.company.eth', label: 'ENS Treasury' },
  ],
});
```

### Blocked Addresses

Prevent transactions to known-bad addresses:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  blockedAddresses: [
    { address: '0xdead...beef', reason: 'Known scam' },
    { address: '0x0000...0000', reason: 'Burn address' },
  ],
});
```

Blocked transactions throw:
```json
{
  "code": "BLOCKED_ADDRESS",
  "message": "Address 0xdead...beef is blocked: Known scam",
  "suggestion": "This address cannot receive funds. Use a different recipient"
}
```

## Safety Presets

Pre-configured profiles for common use cases:

| Preset | Per-TX | Hourly | Daily | Approval |
|--------|--------|--------|-------|----------|
| `CONSERVATIVE` | 0.01 ETH | 0.1 ETH | 0.5 ETH | Always |
| `BALANCED` | 0.1 ETH | 1 ETH | 5 ETH | >0.1 ETH or new |
| `AGGRESSIVE` | 1 ETH | 10 ETH | 50 ETH | >1 ETH |
| `UNLIMITED` | 1M ETH | 1M ETH | 1M ETH | Never (testing only) |

```typescript
import { SafetyPresets } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: KEY,
  ...SafetyPresets.BALANCED,
});
```

## Transaction Simulation

All transactions are simulated before execution:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  requireSimulation: true,  // Default: true
});
```

Simulation catches:
- Reverts (with decoded reason)
- Insufficient balance
- Gas estimation failures
- Contract state issues

## Best Practices

1. **Start conservative**: Begin with `SafetyPresets.CONSERVATIVE` and relax limits as you gain confidence.

2. **Always require approval for new recipients**: Hallucinated addresses are a real risk.

3. **Set emergency stop thresholds**: Prevent complete drainage.

4. **Log all transactions**: Even successful ones, for audit trails.

5. **Test limits in staging**: Verify your limits match your threat model before production.

6. **Review blocked address lists**: Keep them updated with known scam addresses.

7. **Use token allowlists for swaps**: Only allow swapping well-known tokens to prevent trading in scam tokens.

8. **Keep slippage low**: Default to 0.5-1% slippage. High slippage tolerance can lead to unfavorable trades.

9. **Monitor price impact**: Set `maxPriceImpactPercent` to 5% or lower to avoid large losses in low-liquidity pools.

10. **Get quotes before swapping**: Use `getSwapQuote()` to preview expected output before executing.

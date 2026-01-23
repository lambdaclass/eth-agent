# eth-agent

[![npm version](https://img.shields.io/npm/v/@lambdaclass/eth-agent.svg)](https://www.npmjs.com/package/@lambdaclass/eth-agent)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen.svg)](https://github.com/lambdaclass/eth-agent)
[![License](https://img.shields.io/badge/license-MIT%2FApache--2.0-green.svg)](LICENSE-MIT)

**The simplest, safest way for AI agents to use Ethereum or any EVM chain. Send, swap, and bridge stablecoins in one line of code with spending limits and human approval flows built in.**

```typescript
import { AgentWallet } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  limits: { perTransaction: '1000 USDC', perDay: '10000 USDC' },
});

await wallet.sendUSDC({ to: 'merchant.eth', amount: '100' });
// → "Sent 100 USDC to merchant.eth. TX: 0xabc..."
```

## Why eth-agent?

AI agents need to pay for things, API calls, services, subscriptions. Stablecoins are the obvious choice: predictable value, instant settlement, global reach. But sending USDC with existing libraries is surprisingly hard:

**Without eth-agent:**
```typescript
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

// Just to send 100 USDC...
const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ensAddress = await provider.resolveName('merchant.eth');
if (!ensAddress) throw new Error('ENS resolution failed');

const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, wallet);
const decimals = await usdc.decimals();  // 6
const amount = ethers.parseUnits('100', decimals);
const balance = await usdc.balanceOf(wallet.address);
if (balance < amount) throw new Error('Insufficient USDC');

// No spending limits, no approval flow, no structured errors...
const tx = await usdc.transfer(ensAddress, amount);
await tx.wait();
```

**With eth-agent:**
```typescript
await wallet.sendUSDC({ to: 'merchant.eth', amount: '100' });
```

| Feature | eth-agent | Raw viem/ethers |
|---------|-----------|-----------------|
| Stablecoin transfers | One line | 15+ lines |
| Token swaps (Uniswap) | One line | 50+ lines |
| Cross-chain bridging | One line | 100+ lines |
| Spending limits | Built-in | Manual |
| Human approval | Built-in | Manual |
| ENS resolution | Automatic | Manual |
| Error recovery | Structured | Exceptions |

## Stablecoins

Built-in support for major stablecoins with automatic decimals and multi-chain addresses:

```typescript
import { AgentWallet, USDC, USDT, USDS } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  rpcUrl: 'https://eth.llamarpc.com',
});

// Human-readable amounts (no decimals needed)
await wallet.sendUSDC({ to: 'alice.eth', amount: '100' });       // 100 USDC
await wallet.sendUSDT({ to: 'bob.eth', amount: '50.50' });       // 50.50 USDT
await wallet.sendStablecoin({ token: USDS, to: 'carol.eth', amount: '1000' });

// Check balances
const balance = await wallet.getStablecoinBalance(USDC);
console.log(balance.formatted);  // "1,234.56"

// Get all stablecoin balances at once
const balances = await wallet.getStablecoinBalances();
// { USDC: { formatted: "1234.56", ... }, USDT: { formatted: "500", ... } }
```

### Supported Tokens

| Token | Symbol | Chains |
|-------|--------|--------|
| Ether | `ETH` | Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche |
| USD Coin | `USDC` | Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche, Taiko, Scroll, Linea, zkSync Era |
| Tether | `USDT` | Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche, Taiko, Scroll, Linea, zkSync Era |
| Sky USD | `USDS` | Ethereum, Base |
| PayPal USD | `PYUSD` | Ethereum |
| Frax | `FRAX` | Ethereum, Arbitrum, Optimism, Polygon |
| Dai | `DAI` | Ethereum, Arbitrum, Optimism, Base, Polygon |

```typescript
import { ETH, USDC, USDT, USDS, PYUSD, FRAX, DAI } from '@lambdaclass/eth-agent';
```

## Token Swaps

Swap any token using Uniswap V3 with built-in slippage protection and spending limits:

```typescript
import { AgentWallet } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  rpcUrl: 'https://eth.llamarpc.com',
});

// Swap 100 USDC for ETH
const result = await wallet.swap({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
  slippageTolerance: 0.5,  // 0.5% max slippage
});
console.log(result.summary);
// → "Swapped 100 USDC for 0.042 ETH. TX: 0xabc..."

// Get a quote before swapping
const quote = await wallet.getSwapQuote({
  fromToken: 'ETH',
  toToken: 'USDC',
  amount: '0.1',
});
console.log(`Expected: ${quote.toToken.amount} USDC`);
console.log(`Minimum after slippage: ${quote.amountOutMinimum} USDC`);
console.log(`Price impact: ${quote.priceImpact}%`);
```

### Supported Swap Tokens

| Token | Symbol | Description |
|-------|--------|-------------|
| Ether | `ETH` | Native ETH (auto-wrapped to WETH) |
| Wrapped Ether | `WETH` | Wrapped ETH |
| Uniswap | `UNI` | Uniswap governance token |
| Chainlink | `LINK` | Chainlink oracle token |
| Wrapped Bitcoin | `WBTC` | Bitcoin on Ethereum |
| Aave | `AAVE` | Aave governance token |
| + All stablecoins | `USDC`, `USDT`, etc. | See stablecoins section |

You can also swap any ERC20 token by its contract address:

```typescript
await wallet.swap({
  fromToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',  // UNI address
  toToken: 'ETH',
  amount: '50',
});
```

### Swap Limits

Configure spending limits for swaps:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    swap: {
      perTransactionUSD: 5000,    // Max $5,000 per swap
      perDayUSD: 50000,           // Max $50,000 per day
      maxSlippagePercent: 1,      // Max 1% slippage allowed
      maxPriceImpactPercent: 5,   // Max 5% price impact
      allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH'],  // Optional allowlist
    },
  },
});
```

## Bridging

Bridge stablecoins across chains with automatic route selection:

```typescript
import { USDC } from '@lambdaclass/eth-agent';

// Bridge 100 USDC from Ethereum to Arbitrum - auto-selects best route
const result = await wallet.bridge({
  token: USDC,
  amount: '100',
  destinationChainId: 42161,  // Arbitrum
});

console.log(result.trackingId);   // Unified tracking ID
console.log(result.protocol);     // 'CCTP' | 'Stargate' | 'Across'
console.log(result.summary);      // "Bridging 100 USDC to Arbitrum via CCTP"

// Check status using tracking ID
const status = await wallet.getBridgeStatusByTrackingId(result.trackingId);
console.log(`${status.message} (${status.progress}%)`);
```

### Route Selection

Compare routes or let the router choose:

```typescript
// Compare available routes before bridging
const routes = await wallet.compareBridgeRoutes({
  token: USDC,
  amount: '1000',
  destinationChainId: 8453,  // Base
});

for (const quote of routes.quotes) {
  console.log(`${quote.protocol}: $${quote.fee.totalUSD} fee, ${quote.estimatedTime.display}`);
}
console.log(`Recommended: ${routes.recommended.protocol}`);

// Preview with full validation
const preview = await wallet.previewBridgeWithRouter({
  token: USDC,
  amount: '1000',
  destinationChainId: 8453,
});

if (preview.canBridge) {
  console.log(`Ready to bridge. Fee: $${preview.quote.fee.totalUSD}`);
} else {
  console.log('Cannot bridge:', preview.blockers.join(', '));
}

// Prefer speed over cost
const fast = await wallet.bridge({
  token: USDC,
  amount: '500',
  destinationChainId: 8453,
  preference: { priority: 'speed' },
});
```

### Supported Protocols

| Protocol | Tokens | Speed | Fees | Notes |
|----------|--------|-------|------|-------|
| CCTP (Circle) | USDC | 10-20 min | $0 | Native burn/mint, no slippage |
| Stargate | USDC, USDT | 5-15 min | ~0.06% | Liquidity pools |
| Across | USDC, USDT | 2-5 min | Variable | Optimistic bridging |

### Supported Chains

| Chain | Chain ID | Testnet |
|-------|----------|---------|
| Ethereum | 1 | Sepolia (11155111) |
| Arbitrum | 42161 | Arb Sepolia (421614) |
| Optimism | 10 | OP Sepolia (11155420) |
| Base | 8453 | Base Sepolia (84532) |
| Polygon | 137 | Amoy (80002) |
| Avalanche | 43114 | Fuji (43113) |

### Bridge Limits

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    bridge: {
      perTransactionUSD: 1000,
      perDayUSD: 5000,
      allowedDestinations: [42161, 8453, 10],  // Arbitrum, Base, Optimism only
    },
  },
});
```
## Safety

Spending limits prevent your agent from draining a wallet:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    perTransaction: '100 USDC',   // Max per transfer
    perHour: '500 USDC',          // Hourly cap
    perDay: '2000 USDC',          // Daily cap
  },
});

// Transaction exceeding limit fails with structured error
try {
  await wallet.sendUSDC({ to: 'alice.eth', amount: '5000' });
} catch (e) {
  e.code        // 'DAILY_LIMIT_EXCEEDED'
  e.suggestion  // 'Reduce amount to 2000 USDC or wait until tomorrow'
}
```

**Presets:** `CONSERVATIVE` · `BALANCED` · `AGGRESSIVE`

```typescript
import { SafetyPresets } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: KEY,
  ...SafetyPresets.BALANCED,
});
```

**Human approval** for large transactions:

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  onApprovalRequired: async (tx) => {
    return await askHuman(`Approve ${tx.summary}?`);
  },
  approvalConfig: {
    requireApprovalWhen: { amountExceeds: '500 USDC' },
  },
});
```

## Error Handling

Errors are structured for LLM consumption:

```typescript
catch (error) {
  error.code        // 'INSUFFICIENT_FUNDS'
  error.suggestion  // 'You need 50 more USDC'
  error.retryable   // false
}
```

**Result types** for explicit error handling:

```typescript
const result = await wallet.safeSendUSDC({ to: 'alice.eth', amount: '100' });

if (result.ok) {
  console.log(result.value.hash);
} else {
  console.log(result.error.suggestion);
}
```

## ETH & Native Tokens

Also supports ETH and native token transfers:

```typescript
await wallet.send({ to: 'vitalik.eth', amount: '0.1 ETH' });

const preview = await wallet.preview({ to: 'alice.eth', amount: '1 ETH' });
if (!preview.canExecute) console.log(preview.blockers);
```

## AI Integrations

Ready-to-use tool definitions for AI frameworks with 18 tools covering transfers, swaps, and bridging:

```typescript
import { AgentWallet, anthropicTools } from '@lambdaclass/eth-agent';

const wallet = AgentWallet.create({
  privateKey: process.env.ETH_PRIVATE_KEY,
  rpcUrl: 'https://eth.llamarpc.com',
});

// Anthropic Claude
const tools = anthropicTools(wallet);
await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  tools: tools.definitions,
  messages: [{ role: 'user', content: 'Send 100 USDC to alice.eth' }],
});

// OpenAI
const tools = openaiTools(wallet);
await client.chat.completions.create({ tools: tools.definitions, ... });

// MCP (Claude Desktop)
createMCPServer({ wallet }).listen();
```

### Available Tools

| Category | Tools |
|----------|-------|
| **Transfers** | `eth_send`, `eth_sendStablecoin`, `eth_transferToken`, `eth_preview` |
| **Balances** | `eth_getBalance`, `eth_getTokenBalance`, `eth_getStablecoinBalance`, `eth_getStablecoinBalances` |
| **Swaps** | `eth_swap`, `eth_getSwapQuote`, `eth_getSwapLimits` |
| **Bridging** | `eth_bridge`, `eth_previewBridge`, `eth_compareBridgeRoutes`, `eth_getBridgeStatus`, `eth_getBridgeLimits` |
| **Info** | `eth_getLimits`, `eth_getCapabilities` |

All tools return structured responses with `success`, `data`, and `summary` fields for easy LLM consumption.

## Smart Accounts (ERC-4337)

Account abstraction with bundlers and paymasters:

```typescript
const smartAccount = await SmartAccount.create({ owner, rpc, bundler });
await smartAccount.execute({ to: '0x...', value: ETH(0.1) });

// Gasless transactions via paymaster
const paymaster = createRemotePaymaster({ url: PAYMASTER_URL });

// Session keys for delegated signing
const session = sessionManager.createSession({ maxValue: ETH(0.1), validUntil: ... });
```

## Architecture

```
eth-agent/
├── core/           # Primitives (hex, rlp, abi, units) — zero dependencies
├── stablecoins/    # USDC, USDT, USDS, DAI, PYUSD, FRAX definitions
├── tokens/         # General token registry (WETH, UNI, LINK, etc.)
├── protocol/       # Ethereum (rpc, tx, ens, erc-4337, contracts, uniswap)
├── bridge/         # Cross-chain (CCTP, Stargate, Across, router, tracking)
├── agent/          # Safety (wallet, limits, approval, errors)
└── integrations/   # AI frameworks (anthropic, openai, langchain, mcp)
```

**Only 2 runtime dependencies:** `@noble/secp256k1` + `@noble/hashes` (both audited)

## Documentation

- **[Getting Started](docs/getting-started.md)** — Installation and first transaction
- **[Safety Guide](docs/safety.md)** — Limits, approval flows, address policies
- **[Smart Accounts](docs/smart-accounts.md)** — ERC-4337, bundlers, paymasters
- **[AI Integration](docs/ai-integration.md)** — Anthropic, OpenAI, LangChain, MCP
- **[API Reference](docs/api-reference.md)** — Complete API documentation

## Development

```bash
nix develop         # Enter dev environment (includes Foundry)
npm install && npm test
npm run test:e2e    # E2E tests with Anvil
```

## License

MIT or Apache-2.0

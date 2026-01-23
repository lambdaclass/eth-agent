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
| USD Coin | `USDC` | Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche |
| Tether | `USDT` | Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche |
| Sky USD | `USDS` | Ethereum, Base |
| PayPal USD | `PYUSD` | Ethereum |
| Frax | `FRAX` | Ethereum, Arbitrum, Optimism, Polygon |
| Dai | `DAI` | Ethereum, Arbitrum, Optimism, Base, Polygon |

```typescript
import { ETH, USDC, USDT, USDS, PYUSD, FRAX, DAI } from '@lambdaclass/eth-agent';
```

## Bridging

Bridge USDC across chains using Circle's CCTP (Cross-Chain Transfer Protocol):

```typescript
// Bridge 100 USDC from Ethereum to Base
const result = await wallet.bridgeUSDC({
  amount: '100',
  destinationChainId: 8453,  // Base
});

console.log(result.burnTxHash);    // TX on source chain
console.log(result.messageHash);   // Track with this hash

// Wait for Circle attestation (10-30 min on mainnet)
const attestation = await wallet.waitForBridgeAttestation(result.messageHash);

// Check status anytime
const status = await wallet.getBridgeStatus(result.messageHash);
console.log(status.status);  // 'pending_burn' | 'attestation_pending' | 'completed' | ...
```

### Supported Chains

| Chain | Chain ID | Testnet |
|-------|----------|---------|
| Ethereum | 1 | Sepolia (11155111) |
| Arbitrum | 42161 | Arb Sepolia (421614) |
| Optimism | 10 | OP Sepolia (11155420) |
| Base | 8453 | Base Sepolia (84532) |
| Polygon | 137 | Amoy (80002) |
| Avalanche | 43114 | Fuji (43113) |

**Note:** Only USDC is supported for bridging. Transfers are 1:1 with no protocol fees (only gas costs).

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

Ready-to-use tool definitions for AI frameworks:

```typescript
// Anthropic Claude
const tools = anthropicTools(wallet);
await client.messages.create({ tools: tools.definitions, ... });

// OpenAI
const tools = openaiTools(wallet);
await client.chat.completions.create({ tools: tools.definitions, ... });

// MCP (Claude Desktop)
createMCPServer({ wallet }).listen();
```

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
├── protocol/       # Ethereum (rpc, tx, ens, erc-4337, contracts)
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

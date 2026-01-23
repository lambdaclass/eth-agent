# API Reference

Complete reference for eth-agent's public API.

## Main Exports

```typescript
import {
  // Wallet
  AgentWallet,
  createWallet,
  SafetyPresets,

  // Types
  type AgentWalletConfig,
  type SendOptions,
  type SendResult,
  type BalanceResult,
  type SwapOptions,
  type SwapResult,
  type SwapQuoteResult,

  // Tokens
  WETH,
  UNI,
  LINK,
  WBTC,
  resolveToken,

  // Errors
  EthAgentError,
  TransactionLimitError,
  InsufficientFundsError,
  BlockedAddressError,
  ApprovalDeniedError,
  SwapError,
  InsufficientLiquidityError,
  SlippageExceededError,
  TokenNotSupportedError,
  PriceImpactTooHighError,
} from '@lambdaclass/eth-agent';
```

## AgentWallet

The primary interface for AI agents.

### Create

```typescript
const wallet = AgentWallet.create(config: AgentWalletConfig): AgentWallet
```

#### AgentWalletConfig

| Property | Type | Description |
|----------|------|-------------|
| `privateKey` | `string \| Hex` | Private key (with or without 0x prefix) |
| `account` | `Account` | Account object (alternative to privateKey) |
| `rpcUrl` | `string` | JSON-RPC endpoint URL |
| `network` | `'mainnet' \| 'sepolia' \| 'goerli'` | Network preset |
| `limits` | `SpendingLimits` | Spending limit configuration |
| `onApprovalRequired` | `ApprovalHandler` | Callback for approval requests |
| `approvalConfig` | `ApprovalConfig` | Approval trigger conditions |
| `trustedAddresses` | `Array<{address, label}>` | Skip approval for these |
| `blockedAddresses` | `Array<{address, reason}>` | Block transactions to these |
| `requireSimulation` | `boolean` | Simulate before sending (default: true) |

### Methods

#### send

```typescript
async send(options: SendOptions): Promise<SendResult>
```

Send ETH to an address.

```typescript
interface SendOptions {
  to: string;           // Address or ENS name
  amount: string | bigint;  // "0.1 ETH" or wei
  data?: Hex;           // Optional calldata
  gasLimit?: bigint;    // Override gas limit
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

interface SendResult {
  success: boolean;
  hash: Hash;
  summary: string;
  transaction: {
    hash: Hash;
    from: Address;
    to: Address;
    value: { wei: bigint; eth: string };
    gasUsed?: bigint;
    blockNumber?: number;
  };
  wallet: {
    balance: { wei: bigint; eth: string };
  };
  limits: {
    remaining: {
      hourly: { eth: string };
      daily: { eth: string };
    };
  };
}
```

#### getBalance

```typescript
async getBalance(address?: string): Promise<BalanceResult>
```

Get ETH balance for the wallet or any address.

```typescript
interface BalanceResult {
  wei: bigint;
  eth: string;
  formatted: string;  // "1.5 ETH"
}
```

#### getTokenBalance

```typescript
async getTokenBalance(token: Address, address?: string): Promise<TokenBalanceResult>
```

Get ERC-20 token balance.

```typescript
interface TokenBalanceResult {
  raw: bigint;
  formatted: string;
  symbol: string;
  decimals: number;
}
```

#### transferToken

```typescript
async transferToken(options: {
  token: Address;
  to: string;
  amount: string | bigint;
}): Promise<SendResult>
```

Transfer ERC-20 tokens.

#### bridgeUSDC

```typescript
async bridgeUSDC(options: BridgeUSDCOptions): Promise<BridgeUSDCResult>
```

Bridge USDC to another chain using Circle's CCTP.

```typescript
interface BridgeUSDCOptions {
  amount: string | number;      // Human-readable amount (e.g., "100")
  destinationChainId: number;   // Target chain ID
  recipient?: string;           // Optional recipient (defaults to sender)
}

interface BridgeUSDCResult {
  burnTxHash: Hash;             // Transaction hash on source chain
  messageHash: Hex;             // CCTP message hash for tracking
  messageBytes: Hex;            // Raw message bytes
  nonce: bigint;                // CCTP nonce
  amount: { raw: bigint; formatted: string };
  recipient: Address;
  estimatedTime: string;        // e.g., "10-30 minutes"
  sourceChainId: number;
  destinationChainId: number;
  summary: string;              // Human-readable summary
  limits: { remaining: { daily: string } };
}
```

#### previewBridgeUSDC

```typescript
async previewBridgeUSDC(options: BridgeUSDCOptions): Promise<BridgePreviewResult>
```

Preview a bridge operation without executing.

```typescript
interface BridgePreviewResult {
  canBridge: boolean;
  blockers: string[];           // Reasons why bridge cannot proceed
  sourceChain: { id: number; name: string };
  destinationChain: { id: number; name: string };
  amount: { raw: bigint; formatted: string };
  balance: { raw: bigint; formatted: string };
  allowance: bigint;
  needsApproval: boolean;
  estimatedTime: string;
}
```

#### getBridgeStatus

```typescript
async getBridgeStatus(messageHash: Hex): Promise<BridgeStatusResult>
```

Get the status of a bridge transaction.

```typescript
interface BridgeStatusResult {
  status: BridgeStatus;
  messageHash: Hex;
  attestation?: Hex;            // Present when attestation is ready
  error?: string;
  updatedAt: Date;
}

type BridgeStatus =
  | 'pending_burn'              // Burn TX submitted
  | 'burn_confirmed'            // Burn TX confirmed
  | 'attestation_pending'       // Waiting for Circle attestation
  | 'attestation_ready'         // Attestation received
  | 'pending_mint'              // Mint TX submitted
  | 'completed'                 // Bridge complete
  | 'failed';                   // Bridge failed
```

#### waitForBridgeAttestation

```typescript
async waitForBridgeAttestation(messageHash: Hex): Promise<Hex>
```

Wait for Circle's attestation. Blocks until attestation is ready (10-30 min on mainnet).

Returns the attestation signature (`Hex`).

#### safeBridgeUSDC

```typescript
async safeBridgeUSDC(options: BridgeUSDCOptions): Promise<Result<BridgeUSDCResult, EthAgentError>>
```

Safe version that returns a `Result` type instead of throwing.

#### getBridgeLimits

```typescript
getBridgeLimits(): BridgeLimitStatus
```

Get current bridge spending limit status.

```typescript
interface BridgeLimitStatus {
  perTransaction: { limit: string };
  daily: { limit: string; spent: string; remaining: string };
  allowedDestinations?: number[];
}
```

#### getBridgeHistory

```typescript
getBridgeHistory(options?: { hours?: number; limit?: number }): BridgeSpendingRecord[]
```

Get recent bridge transaction history.

#### preview

```typescript
async preview(options: SendOptions): Promise<PreviewResult>
```

Preview a transaction without executing.

```typescript
interface PreviewResult {
  canExecute: boolean;
  blockers: string[];
  costs: {
    value: { wei: bigint; eth: string };
    gas: { wei: bigint; eth: string };
    total: { wei: bigint; eth: string };
  };
  simulation: { success: boolean; error?: string };
}
```

#### getLimits

```typescript
getLimits(): LimitStatus
```

Get current spending limit status.

```typescript
interface LimitStatus {
  perTransaction: { limit: string; };
  hourly: { limit: string; used: string; remaining: string; };
  daily: { limit: string; used: string; remaining: string; };
}
```

### Swap Methods

#### swap

```typescript
async swap(options: SwapOptions): Promise<SwapResult>
```

Swap tokens using Uniswap V3. Supports ETH, WETH, and any ERC-20 token.

```typescript
interface SwapOptions {
  fromToken: string;           // Token symbol ("USDC", "ETH") or address
  toToken: string;             // Token symbol or address
  amount: string | number;     // Human-readable amount ("100" for 100 USDC)
  slippageTolerance?: number;  // Max slippage as percentage (0.5 = 0.5%)
  deadline?: number;           // Seconds from now (default: 1200)
}

interface SwapResult {
  success: boolean;
  hash: Hash;
  summary: string;
  swap: {
    tokenIn: { symbol: string; amount: string; rawAmount: bigint };
    tokenOut: { symbol: string; amount: string; rawAmount: bigint };
    effectivePrice: string;
    priceImpact: number;
  };
  transaction: {
    hash: Hash;
    from: Address;
    gasUsed?: bigint;
    effectiveGasPrice?: bigint;
    blockNumber?: number;
  };
  limits: {
    remaining: { daily: { usd: string } };
  };
}
```

**Slippage Tolerance:**

The `slippageTolerance` parameter is expressed as a **percentage value**, not a decimal:
- `0.5` = 0.5% maximum slippage
- `1` = 1% maximum slippage
- `0.1` = 0.1% maximum slippage

Example:
```typescript
await wallet.swap({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
  slippageTolerance: 0.5,  // 0.5% max slippage (NOT 50%!)
});
```

#### getSwapQuote

```typescript
async getSwapQuote(options: SwapOptions): Promise<SwapQuoteResult>
```

Get a swap quote without executing. Use this to preview expected output.

```typescript
interface SwapQuoteResult {
  fromToken: {
    symbol: string;
    address: Address;
    amount: string;
    rawAmount: bigint;
    decimals: number;
  };
  toToken: {
    symbol: string;
    address: Address;
    amount: string;       // Expected output
    rawAmount: bigint;
    decimals: number;
  };
  amountOutMinimum: string;  // After slippage protection
  priceImpact: number;       // As percentage
  fee: number;               // Uniswap pool fee tier (500, 3000, or 10000)
  gasEstimate: bigint;
  effectivePrice: string;    // Price of fromToken in toToken
  slippageTolerance: number;
}
```

Example:
```typescript
const quote = await wallet.getSwapQuote({
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '1000',
  slippageTolerance: 1,  // 1% slippage
});

console.log(`Will receive: ~${quote.toToken.amount} ETH`);
console.log(`Minimum (after slippage): ${quote.amountOutMinimum} ETH`);
console.log(`Price impact: ${quote.priceImpact}%`);
console.log(`Fee tier: ${quote.fee / 10000}%`);
```

#### safeSwap

```typescript
async safeSwap(options: SwapOptions): Promise<Result<SwapResult, EthAgentError>>
```

Safe version of `swap()` that returns a Result type instead of throwing.

```typescript
const result = await wallet.safeSwap({
  fromToken: 'ETH',
  toToken: 'USDC',
  amount: '0.1',
});

if (result.ok) {
  console.log(`Swapped! TX: ${result.value.hash}`);
} else {
  console.log(`Error: ${result.error.code}`);
  // Handle specific errors
  if (result.error.code === 'INSUFFICIENT_LIQUIDITY') {
    console.log('Try a smaller amount or different token pair');
  }
}
```

#### getSwapLimits

```typescript
getSwapLimits(): SwapLimitStatus
```

Get current swap spending limits and usage.

```typescript
interface SwapLimitStatus {
  perTransaction: { limit: string; available: string };
  daily: {
    limit: string;
    used: string;
    remaining: string;
    resetsAt: Date;
  };
  maxSlippagePercent: number;
  maxPriceImpactPercent: number;
  allowedTokens: string[] | null;  // null = all allowed
  blockedTokens: string[];
}
```

## SpendingLimits

```typescript
interface SpendingLimits {
  // ETH limits
  perTransaction?: string;  // "0.1 ETH"
  perHour?: string;         // "1 ETH"
  perDay?: string;          // "5 ETH"
  emergencyStop?: {
    minBalanceRequired: string;  // "0.05 ETH"
  };

  // Stablecoin limits
  stablecoin?: {
    perTransactionUSD?: string | number;  // "1000" = $1,000
    perHourUSD?: string | number;
    perDayUSD?: string | number;
  };

  // Swap limits
  swap?: {
    perTransactionUSD?: string | number;  // Max USD per swap
    perDayUSD?: string | number;          // Max USD per day
    maxSlippagePercent?: number;          // Max slippage (1 = 1%)
    maxPriceImpactPercent?: number;       // Max price impact (5 = 5%)
    allowedTokens?: string[];             // Allowlist by symbol
    blockedTokens?: string[];             // Blocklist by symbol
  };
}
```

### Swap Limits Configuration

```typescript
const wallet = AgentWallet.create({
  privateKey: KEY,
  limits: {
    swap: {
      perTransactionUSD: 5000,      // Max $5,000 per swap
      perDayUSD: 50000,             // Max $50,000 per day
      maxSlippagePercent: 1,        // Max 1% slippage allowed
      maxPriceImpactPercent: 5,     // Max 5% price impact
      allowedTokens: ['ETH', 'USDC', 'USDT', 'WETH', 'UNI'],
      blockedTokens: ['SCAM_TOKEN'],
    },
  },
});
```

**Slippage vs Price Impact:**
- **Slippage** is the maximum acceptable difference between quoted and executed price
- **Price impact** is how much the swap affects the pool's price

If a swap would exceed `maxPriceImpactPercent`, it's rejected to protect against unfavorable trades in low-liquidity pools.

## SafetyPresets

```typescript
import { SafetyPresets } from '@lambdaclass/eth-agent';

// Pre-configured limit profiles
SafetyPresets.CONSERVATIVE  // 0.01/0.1/0.5 ETH, always approve
SafetyPresets.BALANCED      // 0.1/1/5 ETH, approve >0.1 or new
SafetyPresets.AGGRESSIVE    // 1/10/50 ETH, approve >1 ETH
SafetyPresets.UNLIMITED     // No limits (testing only)
```

## Core Utilities

```typescript
import {
  // Units
  ETH,
  GWEI,
  WEI,
  parseUnits,
  formatUnits,
  parseAmount,
  formatETH,

  // Address
  isAddress,
  toChecksumAddress,

  // Hex
  isHex,
  bytesToHex,
  hexToBytes,

  // Hash
  keccak256,
} from '@lambdaclass/eth-agent';
```

### Unit Functions

```typescript
ETH(1)              // 1000000000000000000n
ETH(0.1)            // 100000000000000000n
GWEI(50)            // 50000000000n
parseAmount('1 ETH') // 1000000000000000000n
formatETH(1000000000000000000n)  // "1"
```

## Protocol Layer

Low-level Ethereum primitives:

```typescript
import {
  RPCClient,
  EOA,
  Account,
  TransactionBuilder,
  Contract,
  ENS,
  GasOracle,
} from 'eth-agent/protocol';
```

### RPCClient

```typescript
const rpc = RPCClient.connect('https://eth.llamarpc.com');
// or
const rpc = new RPCClient({ url, timeout, retries });

await rpc.getBalance(address);
await rpc.getTransactionCount(address);
await rpc.getBlock('latest');
await rpc.sendRawTransaction(signedTx);
await rpc.waitForTransaction(hash);
await rpc.call({ to, data });
```

### EOA

```typescript
const account = EOA.fromPrivateKey('0x...');
const account = EOA.generate();

account.address;  // Address
account.sign(hash);  // Signature
```

### TransactionBuilder

```typescript
const signed = TransactionBuilder.create()
  .to(address)
  .value(ETH(0.1))
  .nonce(0)
  .chainId(1)
  .gasLimit(21000n)
  .maxFeePerGas(50_000_000_000n)
  .maxPriorityFeePerGas(1_500_000_000n)
  .data('0x...')  // Optional
  .sign(account);

signed.hash;  // Transaction hash
signed.raw;   // Serialized transaction
```

### Contract

```typescript
const contract = new Contract({
  address: tokenAddress,
  abi: ERC20_ABI,
  rpc,
  account,  // Optional, for writes
});

// Read
const balance = await contract.read<bigint>('balanceOf', [address]);

// Write
const result = await contract.write('transfer', [to, amount]);
const receipt = await result.wait();
```

## ERC-4337 (Smart Accounts)

```typescript
import {
  SmartAccount,
  BundlerClient,
  createBundler,
  createVerifyingPaymaster,
  createRemotePaymaster,
  SessionKeyManager,
  ENTRY_POINT_V07,
  ENTRY_POINT_V06,
} from '@lambdaclass/eth-agent';
```

### SmartAccount

```typescript
const smartAccount = await SmartAccount.create({
  owner: EOA.fromPrivateKey(key),
  rpc,
  bundler,
  entryPoint: ENTRY_POINT_V07,  // Optional
  index: 0n,  // Optional, for multiple accounts
});

smartAccount.address;
await smartAccount.isDeployed();
await smartAccount.getNonce();

// Execute single call
await smartAccount.execute({
  to: address,
  value: ETH(0.1),
  data: '0x',
});

// Execute batch
await smartAccount.execute([
  { to: addr1, value: ETH(0.1), data: '0x' },
  { to: addr2, value: ETH(0.2), data: '0x' },
]);
```

### BundlerClient

```typescript
const bundler = createBundler({
  url: 'https://api.pimlico.io/v2/sepolia/rpc?apikey=...',
  entryPoint: ENTRY_POINT_V07,
});

await bundler.sendUserOperation(userOp);
await bundler.estimateUserOperationGas(userOp);
await bundler.waitForUserOperation(hash);
```

### Paymaster

```typescript
// Verifying paymaster (self-hosted)
const paymaster = createVerifyingPaymaster({
  address: paymasterAddress,
  signerKey: paymasterSignerKey,
  validUntil: Math.floor(Date.now() / 1000) + 3600,
});

// Remote paymaster (API)
const paymaster = createRemotePaymaster({
  url: 'https://paymaster-api.example.com',
  entryPoint: ENTRY_POINT_V07,
});

const result = await paymaster.getPaymasterData(userOp);
```

### SessionKeyManager

```typescript
const manager = new SessionKeyManager(ownerPrivateKey);

const session = manager.createSession({
  validUntil: Math.floor(Date.now() / 1000) + 3600,
  maxValue: ETH(0.1),
  allowedTargets: [address],
  maxTransactions: 10,
});

const validation = manager.validateAction(session.publicKey, {
  target: address,
  value: ETH(0.05),
});

const signature = manager.signWithSession(session.publicKey, hash, {
  target: address,
  value: ETH(0.05),
});
```

## Error Types

All errors extend `EthAgentError` and include:

```typescript
interface EthAgentError {
  code: string;
  message: string;
  suggestion: string;
  retryable: boolean;
  retryAfter?: number;
  details?: Record<string, unknown>;
  toJSON(): object;
}
```

### Error Codes

| Code | Error Class | Description |
|------|-------------|-------------|
| `TRANSACTION_LIMIT_EXCEEDED` | `TransactionLimitError` | Single TX exceeds limit |
| `HOURLY_LIMIT_EXCEEDED` | `HourlyLimitError` | Hourly cap reached |
| `DAILY_LIMIT_EXCEEDED` | `DailyLimitError` | Daily cap reached |
| `INSUFFICIENT_FUNDS` | `InsufficientFundsError` | Not enough ETH |
| `BLOCKED_ADDRESS` | `BlockedAddressError` | Recipient is blocked |
| `APPROVAL_DENIED` | `ApprovalDeniedError` | Human rejected TX |
| `APPROVAL_TIMEOUT` | `ApprovalTimeoutError` | Approval timed out |
| `INVALID_ADDRESS` | `InvalidAddressError` | Bad address format |
| `INVALID_AMOUNT` | `InvalidAmountError` | Bad amount format |
| `GAS_ESTIMATION_FAILED` | `GasEstimationError` | Can't estimate gas |
| `NONCE_TOO_LOW` | `NonceError` | Nonce already used |
| `UNDERPRICED` | `UnderpricedError` | Gas price too low |
| `REVERT` | `RevertError` | Contract reverted |
| `EMERGENCY_STOP` | `EmergencyStopError` | Balance below minimum |
| `BRIDGE_UNSUPPORTED_ROUTE` | `BridgeUnsupportedRouteError` | Route not supported |
| `BRIDGE_SAME_CHAIN` | `BridgeSameChainError` | Source = destination |
| `BRIDGE_LIMIT_EXCEEDED` | `BridgeLimitError` | Amount exceeds bridge limit |
| `BRIDGE_DESTINATION_NOT_ALLOWED` | `BridgeDestinationNotAllowedError` | Destination not whitelisted |
| `BRIDGE_ATTESTATION_TIMEOUT` | `BridgeAttestationTimeoutError` | Attestation took too long |
| `BRIDGE_NO_ROUTE` | `BridgeNoRouteError` | No available routes |

#### Swap Error Codes

| Code | Error Class | Description |
|------|-------------|-------------|
| `INSUFFICIENT_LIQUIDITY` | `InsufficientLiquidityError` | No liquidity for token pair |
| `SLIPPAGE_EXCEEDED` | `SlippageExceededError` | Price moved beyond tolerance |
| `TOKEN_NOT_SUPPORTED` | `TokenNotSupportedError` | Token not on this chain |
| `PRICE_IMPACT_TOO_HIGH` | `PriceImpactTooHighError` | Swap would move price too much |
| `SWAP_TRANSACTION_LIMIT_EXCEEDED` | `SwapLimitError` | Swap USD exceeds per-tx limit |
| `SWAP_DAILY_LIMIT_EXCEEDED` | `SwapLimitError` | Swap USD exceeds daily limit |
| `TOKEN_NOT_ALLOWED` | `TokenNotAllowedError` | Token blocked or not in allowlist |

## Result Types

For explicit error handling without exceptions:

```typescript
import {
  ok, err, isOk, isErr,
  unwrap, unwrapOr,
  match, matchResult,
  ResultAsync,
  type Result,
} from '@lambdaclass/eth-agent';
```

### Result<T, E>

```typescript
type Result<T, E> = Ok<T> | Err<E>;

interface Ok<T> { ok: true; value: T; }
interface Err<E> { ok: false; error: E; }
```

### Safe Wallet Methods

```typescript
// Returns Result instead of throwing
await wallet.safeSend(options);       // Result<SendResult, EthAgentError>
await wallet.safeGetBalance();        // Result<BalanceResult, EthAgentError>
await wallet.safeTransferToken(opts); // Result<SendResult, EthAgentError>
await wallet.safeSwap(options);       // Result<SwapResult, EthAgentError>
await wallet.safeSendUSDC(options);   // Result<SendStablecoinResult, EthAgentError>
```

### Result Utilities

```typescript
// Type guards
isOk(result)   // result is Ok<T>
isErr(result)  // result is Err<E>

// Unwrapping
unwrap(result)           // T (throws if Err)
unwrapOr(result, default) // T (returns default if Err)

// Pattern matching
match(result, { ok: (v) => ..., err: (e) => ... })
```

### ResultAsync

```typescript
const result = await ResultAsync.fromPromise(fetch('/api'))
  .map(res => res.json())
  .mapErr(e => new Error(e.message))
  .andThen(data => ResultAsync.ok(data.value));
```

## Pattern Matching

```typescript
import { match, P_gt, P_lt, P_between, P_oneOf } from '@lambdaclass/eth-agent';
```

### Basic Matching

```typescript
const result = match(value)
  .with(42, () => 'forty-two')
  .with({ type: 'circle' }, (v) => `radius: ${v.radius}`)
  .when(x => x > 100, () => 'large')
  .otherwise(() => 'default');
```

### Exhaustive Matching

```typescript
const result = match(discriminatedUnion)
  .with({ type: 'A' }, handleA)
  .with({ type: 'B' }, handleB)
  .exhaustive();  // Throws if no match
```

### Predicate Helpers

```typescript
P_gt(10)           // x > 10
P_lt(10)           // x < 10
P_between(5, 15)   // 5 <= x <= 15
P_oneOf('a', 'b')  // x === 'a' || x === 'b'
P_string()         // typeof x === 'string'
P_number()         // typeof x === 'number'
```

## Typed Contracts

Compile-time type safety for contract interactions:

```typescript
import {
  createTypedContract,
  createERC20Contract,
  defineAbi,
  type AbiReturnType,
} from '@lambdaclass/eth-agent';
```

### Pre-typed Contracts

```typescript
const token = createERC20Contract({ address, rpc });

// Fully typed - IDE autocomplete, compile-time checks
const balance = await token.read.balanceOf([userAddress]);  // bigint
const symbol = await token.read.symbol([]);  // string

// Write with account
const tokenWithAccount = createERC20Contract({ address, rpc, account });
const result = await tokenWithAccount.write.transfer([to, amount]);
```

### Custom ABIs

```typescript
const abi = defineAbi([
  {
    type: 'function',
    name: 'getValue',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const);

// Type inference
type Return = AbiReturnType<typeof abi, 'getValue'>; // bigint

const contract = createTypedContract({ address, abi, rpc });
const value = await contract.read.getValue([]);  // typed as bigint
```

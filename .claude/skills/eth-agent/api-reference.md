# eth-agent API Reference

## AgentWallet

### Constructor Options

```typescript
interface AgentWalletConfig {
  // Required
  privateKey: string;           // Hex-encoded private key
  rpcUrl: string;               // Ethereum RPC endpoint

  // Optional - Safety
  limits?: {
    perTransaction?: string;    // Max per single transaction
    perHour?: string;           // Hourly spending cap
    perDay?: string;            // Daily spending cap
    perWeek?: string;           // Weekly spending cap
    emergencyStopBelow?: string; // Halt if balance drops below
  };

  // Optional - Approval
  approvalConfig?: {
    requireApprovalWhen?: {
      amountExceeds?: string;
      recipientIsNew?: boolean;
      recipientNotInTrusted?: boolean;
    };
    trustedAddresses?: string[];
  };
  onApprovalRequired?: (request: ApprovalRequest) => Promise<boolean>;

  // Optional - Address Policy
  addressPolicy?: {
    mode: 'allowlist' | 'blocklist';
    addresses: string[];
  };

  // Optional - ENS
  ensRpcUrl?: string;            // Separate RPC for ENS resolution
}
```

### Methods

#### ETH Operations

```typescript
// Send ETH
wallet.send(options: { to: string; amount: string | bigint }): Promise<TransactionResult>
wallet.safeSend(options): Promise<Result<TransactionResult>>

// Get balance
wallet.getBalance(address?: string): Promise<bigint>
wallet.safeGetBalance(address?: string): Promise<Result<bigint>>

// Preview transaction
wallet.preview(options: { to: string; amount: string }): Promise<TransactionPreview>
```

#### Stablecoin Operations

```typescript
// Send specific stablecoins
wallet.sendUSDC(options: { to: string; amount: string }): Promise<TransactionResult>
wallet.sendUSDT(options: { to: string; amount: string }): Promise<TransactionResult>
wallet.safeSendUSDC(options): Promise<Result<TransactionResult>>
wallet.safeSendUSDT(options): Promise<Result<TransactionResult>>

// Send any stablecoin
wallet.sendStablecoin(options: {
  token: StablecoinInfo;
  to: string;
  amount: string
}): Promise<TransactionResult>

// Get balances
wallet.getStablecoinBalance(token: StablecoinInfo): Promise<string>  // Formatted
wallet.getStablecoinBalances(): Promise<StablecoinBalances>          // All tokens
```

#### Token Operations (Generic ERC-20)

```typescript
wallet.transferToken(options: {
  token: Address;
  to: string;
  amount: string | bigint
}): Promise<TransactionResult>

wallet.getTokenBalance(token: Address, address?: string): Promise<bigint>
```

#### Limits & Approval

```typescript
wallet.getLimits(): Promise<LimitsStatus>
wallet.checkApproval(request: ApprovalRequest): Promise<ApprovalResult>
```

### Properties

```typescript
wallet.address: Address          // Wallet address
wallet.rpc: RPCClient           // Underlying RPC client
wallet.chainId: number          // Connected chain ID
```

## SmartAgentWallet

Extends AgentWallet with ERC-4337 smart account capabilities.

### Additional Constructor Options

```typescript
interface SmartAgentWalletConfig extends AgentWalletConfig {
  bundlerUrl: string;            // ERC-4337 bundler endpoint
  paymaster?: Paymaster;         // Optional paymaster for gasless tx
  entryPoint?: Address;          // Custom entry point (default: v0.7)
}
```

### Additional Methods

```typescript
// Gasless transfers (no ETH needed for gas)
smartWallet.sendUSDCGasless(options: { to: string; amount: string }): Promise<UserOpResult>
smartWallet.sendStablecoinGasless(options: {
  token: StablecoinInfo;
  to: string;
  amount: string
}): Promise<UserOpResult>

// Batch transfers (multiple recipients, one transaction)
smartWallet.batchTransferStablecoin(options: {
  token: StablecoinInfo;
  transfers: Array<{ to: string; amount: string }>;
}): Promise<UserOpResult>

// Get smart account address (deterministic)
smartWallet.getSmartAccountAddress(): Address
```

## Stablecoins

### Token Objects

```typescript
import { USDC, USDT, USDS, DAI, PYUSD, FRAX } from 'eth-agent';

interface StablecoinInfo {
  symbol: string;           // e.g., "USDC"
  name: string;             // e.g., "USD Coin"
  decimals: number;         // e.g., 6 for USDC, 18 for DAI
  addresses: {
    [chainId: number]: Address;
  };
}
```

### Utility Functions

```typescript
// Get address for specific chain
getStablecoinAddress(token: StablecoinInfo, chainId: number): Address | undefined

// Get all stablecoins available on a chain
getStablecoinsForChain(chainId: number): StablecoinInfo[]

// Check if address is a known stablecoin
isKnownStablecoin(address: Address): boolean

// Parse/format amounts
parseStablecoinAmount(amount: string | number, decimals: number): bigint
formatStablecoinAmount(raw: bigint, decimals: number): string
```

### Chain IDs

```typescript
// Common chain IDs
const ETHEREUM = 1;
const ARBITRUM = 42161;
const OPTIMISM = 10;
const BASE = 8453;
const POLYGON = 137;
const AVALANCHE = 43114;
```

## Result Type

```typescript
// Creating results
ok<T>(value: T): Ok<T>
err<E>(error: E): Err<E>

// Checking results
isOk<T>(result: Result<T>): result is Ok<T>
isErr<T>(result: Result<T>): result is Err<T>

// Extracting values
unwrap<T>(result: Result<T>): T                    // Throws if Err
unwrapOr<T>(result: Result<T>, defaultValue: T): T // Returns default if Err

// Pattern matching
matchResult(result)
  .ok(value => ...)
  .errWith({ code: 'SPECIFIC_ERROR' }, error => ...)
  .err(error => ...)
  .run()
```

## Error Codes

```typescript
type ErrorCode =
  // Transaction errors
  | 'INSUFFICIENT_FUNDS'
  | 'INSUFFICIENT_GAS'
  | 'NONCE_TOO_LOW'
  | 'TRANSACTION_REVERTED'
  | 'TRANSACTION_UNDERPRICED'

  // Limit errors
  | 'PER_TRANSACTION_LIMIT_EXCEEDED'
  | 'HOURLY_LIMIT_EXCEEDED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'WEEKLY_LIMIT_EXCEEDED'
  | 'EMERGENCY_STOP_TRIGGERED'

  // Approval errors
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_DENIED'
  | 'APPROVAL_TIMEOUT'

  // Address errors
  | 'ADDRESS_NOT_ALLOWED'
  | 'ADDRESS_BLOCKED'
  | 'INVALID_ADDRESS'
  | 'ENS_NOT_FOUND'

  // Network errors
  | 'RPC_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT';
```

## PaymentWatcher

```typescript
import { PaymentWatcher } from 'eth-agent';

const watcher = new PaymentWatcher({
  rpc: RPCClient;              // RPC client instance
  address: Address;            // Address to watch
  tokens: StablecoinInfo[];    // Tokens to monitor
  pollInterval?: number;       // Polling interval in ms (default: 12000)
});

// Start watching with callback
watcher.start(callback: (payment: Payment) => void): void

// Stop watching
watcher.stop(): void

// Wait for specific payment
watcher.waitForPayment(options: {
  token?: StablecoinInfo;      // Specific token (optional)
  from?: Address;              // Specific sender (optional)
  minAmount?: string | bigint; // Minimum amount (optional)
  timeout?: number;            // Timeout in ms (optional)
}): Promise<Payment>

interface Payment {
  token: StablecoinInfo;
  from: Address;
  to: Address;
  amount: bigint;
  formattedAmount: string;     // Human-readable
  txHash: string;
  blockNumber: number;
}
```

## Units

```typescript
// ETH units
ETH(amount: string | number): bigint    // "1.5" -> 1500000000000000000n
GWEI(amount: string | number): bigint   // "20" -> 20000000000n
WEI(amount: bigint | number): bigint    // passthrough

// Generic parsing
parseUnits(amount: string, decimals: number): bigint
formatUnits(amount: bigint, decimals: number): string
```

## AI Integration Tools

### Anthropic

```typescript
import { createAnthropicTools } from 'eth-agent';

const tools = createAnthropicTools(wallet);

tools.definitions    // Tool definitions for Claude API
tools.execute(name: string, input: object): Promise<ToolResult>
```

### OpenAI

```typescript
import { createOpenAITools } from 'eth-agent';

const tools = createOpenAITools(wallet);

tools.definitions    // Function definitions for OpenAI API
tools.execute(name: string, args: object): Promise<ToolResult>
```

### LangChain

```typescript
import { createLangChainTools } from 'eth-agent';

const tools = createLangChainTools(wallet);
// Returns array of LangChain Tool instances
```

## Paymasters

```typescript
// Remote paymaster (calls external service)
import { createRemotePaymaster } from 'eth-agent';

const paymaster = createRemotePaymaster({
  url: string;              // Paymaster service URL
  headers?: Record<string, string>;  // Optional auth headers
});

// Verifying paymaster (uses local signer)
import { createVerifyingPaymaster } from 'eth-agent';

const paymaster = createVerifyingPaymaster({
  address: Address;         // Paymaster contract address
  signer: Signer;           // Signer for paymaster signature
});
```

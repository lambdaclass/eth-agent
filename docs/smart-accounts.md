# Smart Accounts (ERC-4337)

eth-agent provides first-class support for ERC-4337 smart accounts, enabling account abstraction features like batched transactions, gas sponsorship, and session keys.

## Overview

Smart accounts differ from EOAs (Externally Owned Accounts) in several ways:

| Feature | EOA | Smart Account |
|---------|-----|---------------|
| Key recovery | No | Yes (via social recovery) |
| Batch transactions | No | Yes |
| Gas sponsorship | No | Yes (via paymasters) |
| Delegated signing | No | Yes (via session keys) |
| Custom validation | No | Yes |

## Creating a Smart Account

```typescript
import { SmartAccount, EOA, BundlerClient, RPCClient } from '@lambdaclass/eth-agent';

// Connect to RPC and bundler
const rpc = RPCClient.connect('https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY');
const bundler = new BundlerClient({
  url: 'https://api.pimlico.io/v2/sepolia/rpc?apikey=YOUR_KEY',
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // v0.7
});

// Create owner EOA
const owner = EOA.fromPrivateKey(process.env.OWNER_KEY);

// Create smart account
const smartAccount = await SmartAccount.create({
  owner,
  rpc,
  bundler,
  index: 0n,  // Optional: for multiple accounts per owner
});

console.log(`Smart Account: ${smartAccount.address}`);
console.log(`Is deployed: ${await smartAccount.isDeployed()}`);
```

## Sending Transactions

### Single Transaction

```typescript
const result = await smartAccount.execute({
  to: '0x...',
  value: ETH(0.1),
  data: '0x',
});

console.log(`Success: ${result.success}`);
console.log(`UserOp Hash: ${result.userOpHash}`);
console.log(`TX Hash: ${result.transactionHash}`);
```

### Batch Transactions

Execute multiple calls atomically in a single UserOperation:

```typescript
const result = await smartAccount.execute([
  { to: addr1, value: ETH(0.1), data: '0x' },
  { to: addr2, value: ETH(0.2), data: '0x' },
  { to: tokenContract, value: 0n, data: transferCalldata },
]);
```

## UserOperations

### Building UserOps

```typescript
const userOp = await smartAccount.buildUserOp({
  to: '0x...',
  value: ETH(0.1),
  data: '0x',
});

console.log(userOp.sender);             // Smart account address
console.log(userOp.nonce);              // Current nonce
console.log(userOp.initCode);           // Deployment code (if not deployed)
console.log(userOp.callGasLimit);       // Gas for execution
console.log(userOp.verificationGasLimit); // Gas for validation
console.log(userOp.maxFeePerGas);       // Max gas price
```

### Signing and Sending

```typescript
// Build
const userOp = await smartAccount.buildUserOp({ ... });

// Sign
const signedOp = smartAccount.signUserOp(userOp, chainId);

// Send
const hash = await smartAccount.sendUserOp(signedOp);

// Wait for inclusion
const receipt = await bundler.waitForUserOperation(hash);
```

## Paymasters (Gas Sponsorship)

Paymasters allow third parties to pay gas fees:

### Verifying Paymaster

```typescript
import { createVerifyingPaymaster } from '@lambdaclass/eth-agent';

const paymaster = createVerifyingPaymaster({
  address: PAYMASTER_ADDRESS,
  signerKey: PAYMASTER_SIGNER_KEY,
  validUntil: Math.floor(Date.now() / 1000) + 3600, // 1 hour
});

// Get paymaster data for a UserOp
const result = await paymaster.getPaymasterData(userOp);

// Build sponsored UserOp
const sponsoredOp = await smartAccount.buildUserOp(
  { to: '0x...', value: ETH(0.1), data: '0x' },
  { paymasterAndData: result.paymasterAndData }
);
```

### Remote Paymaster

```typescript
import { createRemotePaymaster } from '@lambdaclass/eth-agent';

const paymaster = createRemotePaymaster({
  url: 'https://paymaster-api.example.com',
  entryPoint: ENTRY_POINT_V07,
});

const result = await paymaster.getPaymasterData(userOp);
```

## Session Keys

Delegate limited signing authority to temporary keys:

```typescript
import { SessionKeyManager, ETH } from '@lambdaclass/eth-agent';

const manager = new SessionKeyManager(ownerPrivateKey);

// Create a session with constraints
const session = manager.createSession({
  validUntil: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  validAfter: 0,
  maxValue: ETH(0.1),
  allowedTargets: ['0x...'],      // Whitelist
  allowedSelectors: ['0xa9059cbb'], // transfer()
  maxTransactions: 10,
});

// Validate an action
const validation = manager.validateAction(session.publicKey, {
  target: '0x...',
  value: ETH(0.05),
  selector: '0xa9059cbb',
});

if (validation.valid) {
  // Sign with session key
  const sig = manager.signWithSession(session.publicKey, hash, {
    target: '0x...',
    value: ETH(0.05),
  });
}
```

### Session Key Constraints

| Constraint | Description |
|------------|-------------|
| `validUntil` | Expiration timestamp |
| `validAfter` | Not valid before timestamp |
| `maxValue` | Max ETH per transaction |
| `maxTotalValue` | Max total ETH |
| `allowedTargets` | Whitelist of addresses |
| `blockedTargets` | Blacklist of addresses |
| `allowedSelectors` | Whitelist of function selectors |
| `maxTransactions` | Max transaction count |
| `cooldownPeriod` | Seconds between transactions |

## Account Recovery

Smart accounts can implement recovery mechanisms. The owner key can be rotated without changing the account address:

```typescript
// Create with multiple potential owners
const smartAccount = await SmartAccount.create({
  owner: primaryOwner,
  rpc,
  bundler,
});

// Recovery: Update owner (requires current owner signature)
// Implementation depends on smart account contract
```

## Deployment

Smart accounts are deployed on first use:

```typescript
const smartAccount = await SmartAccount.create({ owner, rpc, bundler });

// Not deployed yet
console.log(await smartAccount.isDeployed()); // false

// First transaction deploys the account
await smartAccount.execute({ to: '0x...', value: ETH(0.01), data: '0x' });

// Now deployed
console.log(await smartAccount.isDeployed()); // true
```

The deployment is bundled with the first transaction—users don't need separate deployment steps.

## Supported Entry Points

eth-agent supports both ERC-4337 entry point versions:

| Version | Address | Status |
|---------|---------|--------|
| v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | Supported |
| v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | Default |

```typescript
const smartAccount = await SmartAccount.create({
  owner,
  rpc,
  bundler,
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // v0.6
});
```

/**
 * Typed Contracts Example
 *
 * Demonstrates compile-time type safety for contract interactions:
 * - ABI type inference
 * - Typed read/write methods
 * - Custom contract ABIs
 *
 * Run: npx tsx examples/typed-contracts.ts
 */

import {
  RPCClient,
  EOA,
  // Typed contract utilities
  createTypedContract,
  createERC20Contract,
  createERC721Contract,
  defineAbi,
  // Types
  type Address,
  type AbiReturnType,
  type AbiFunctionInputs,
} from '@lambdaclass/eth-agent';

// Well-known contract addresses
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
const BAYC_ADDRESS = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' as Address;

async function main() {
  const rpc = RPCClient.connect(process.env.RPC_URL ?? 'https://eth.llamarpc.com');

  console.log('=== Typed Contracts Example ===\n');

  // ============ Pre-typed ERC20 Contract ============
  console.log('--- ERC20 Contract (USDC) ---\n');

  const usdc = createERC20Contract({
    address: USDC_ADDRESS,
    rpc,
  });

  // All methods are fully typed!
  // usdc.read.balanceOf expects [Address] and returns bigint
  const balance = await usdc.read.balanceOf([
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address, // vitalik.eth
  ]);
  console.log(`Vitalik's USDC balance: ${balance}`);

  // Get token info
  const [name, symbol, decimals] = await Promise.all([
    usdc.read.name([]),
    usdc.read.symbol([]),
    usdc.read.decimals([]),
  ]);
  console.log(`Token: ${name} (${symbol}), ${decimals} decimals`);

  // ============ Pre-typed ERC721 Contract ============
  console.log('\n--- ERC721 Contract (BAYC) ---\n');

  const bayc = createERC721Contract({
    address: BAYC_ADDRESS,
    rpc,
  });

  // Check NFT ownership
  const owner = await bayc.read.ownerOf([1n]); // Token ID 1
  console.log(`BAYC #1 owner: ${owner}`);

  const nftBalance = await bayc.read.balanceOf([owner]);
  console.log(`Owner's BAYC count: ${nftBalance}`);

  // ============ Custom Contract with Type Inference ============
  console.log('\n--- Custom Contract ABI ---\n');

  // Define ABI with const assertion for type inference
  const customAbi = defineAbi([
    {
      type: 'function',
      name: 'getValue',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'setValue',
      inputs: [{ name: 'newValue', type: 'uint256' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'getOwner',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
    },
    {
      type: 'event',
      name: 'ValueChanged',
      inputs: [
        { name: 'oldValue', type: 'uint256', indexed: false },
        { name: 'newValue', type: 'uint256', indexed: false },
      ],
    },
  ] as const);

  // Type inference example (compile-time)
  type GetValueReturn = AbiReturnType<typeof customAbi, 'getValue'>; // bigint
  type SetValueInputs = AbiFunctionInputs<typeof customAbi, 'setValue'>; // [bigint]

  console.log('Custom ABI defined with inferred types:');
  console.log('  getValue() returns: bigint');
  console.log('  setValue(newValue) takes: [bigint]');
  console.log('  getOwner() returns: Address');

  // Create typed contract (would work with a real address)
  // const customContract = createTypedContract({
  //   address: '0x...' as Address,
  //   abi: customAbi,
  //   rpc,
  // });
  // const value = await customContract.read.getValue([]);  // typed as bigint
  // const owner = await customContract.read.getOwner([]);  // typed as Address

  // ============ Encoding Function Calls ============
  console.log('\n--- Encoding Function Calls ---\n');

  // Encode without executing (useful for batching)
  const transferCalldata = usdc.encode.transfer([
    '0x1234567890123456789012345678901234567890' as Address,
    1000000n, // 1 USDC (6 decimals)
  ]);
  console.log(`Encoded transfer: ${transferCalldata.slice(0, 20)}...`);

  // ============ With Account for Writes ============
  console.log('\n--- Write Operations (requires account) ---\n');

  if (process.env.ETH_PRIVATE_KEY) {
    const account = EOA.fromPrivateKey(process.env.ETH_PRIVATE_KEY as `0x${string}`);

    const usdcWithAccount = createERC20Contract({
      address: USDC_ADDRESS,
      rpc,
      account,
    });

    console.log(`Account: ${account.address}`);
    console.log('Write methods available:');
    console.log('  - transfer(to, amount)');
    console.log('  - approve(spender, amount)');
    console.log('  - transferFrom(from, to, amount)');

    // Example: Approve spending (would execute if uncommented)
    // const result = await usdcWithAccount.write.approve([
    //   '0xSpenderAddress' as Address,
    //   1000000n,
    // ]);
    // const receipt = await result.wait();
    // console.log(`Approved! TX: ${receipt.hash}`);
  } else {
    console.log('Set ETH_PRIVATE_KEY to enable write operations');
  }

  // ============ Type Safety Benefits ============
  console.log('\n--- Type Safety Benefits ---\n');

  console.log(`
The typed contract system provides:

1. Autocomplete - IDE suggests available methods
2. Type checking - Wrong argument types caught at compile time
3. Return type inference - No manual type assertions needed
4. Refactoring safety - Rename functions and types update

Example errors caught at compile time:

  // ❌ Wrong argument type
  // usdc.read.balanceOf(['not-an-address']);  // Type error!

  // ❌ Missing argument
  // usdc.read.balanceOf([]);  // Type error!

  // ❌ Wrong method name
  // usdc.read.getBalance([addr]);  // Type error!

  // ✅ Correct usage
  // usdc.read.balanceOf([address]);  // Returns bigint
`);

  console.log('=== Done ===');
}

main().catch(console.error);

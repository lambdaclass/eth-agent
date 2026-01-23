/**
 * Smart Account Example (ERC-4337)
 *
 * Demonstrates smart account operations:
 * - Creating a smart account
 * - Building UserOperations
 * - Batch transactions
 * - Using paymasters for gas sponsorship
 *
 * Run: npx tsx examples/smart-account.ts
 */

import {
  SmartAccount,
  EOA,
  BundlerClient,
  RPCClient,
  createVerifyingPaymaster,
  ETH,
  GWEI,
} from '@lambdaclass/eth-agent';

async function main() {
  // Connect to RPC and bundler
  const rpc = RPCClient.connect(
    process.env.RPC_URL ?? 'https://eth-sepolia.g.alchemy.com/v2/demo'
  );

  const bundler = new BundlerClient({
    url: process.env.BUNDLER_URL ?? 'https://api.pimlico.io/v2/sepolia/rpc?apikey=demo',
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // v0.7
  });

  // Create owner EOA (the signer for the smart account)
  const owner = EOA.fromPrivateKey(process.env.ETH_PRIVATE_KEY!);
  console.log(`Owner EOA: ${owner.address}`);

  // Create smart account
  const smartAccount = await SmartAccount.create({
    owner,
    rpc,
    bundler,
    // Optionally specify index for multiple accounts per owner
    index: 0n,
  });

  console.log(`Smart Account: ${smartAccount.address}`);

  // Check if deployed
  const isDeployed = await smartAccount.isDeployed();
  console.log(`Is deployed: ${isDeployed}`);

  // Get nonce
  const nonce = await smartAccount.getNonce();
  console.log(`Nonce: ${nonce}`);

  // Build a simple UserOperation
  console.log('\n--- Building UserOperation ---');
  const userOp = await smartAccount.buildUserOp({
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth
    value: ETH(0.001),
    data: '0x',
  });

  console.log('UserOperation:');
  console.log(`  Sender: ${userOp.sender}`);
  console.log(`  Nonce: ${userOp.nonce}`);
  console.log(`  InitCode: ${userOp.initCode === '0x' ? '(none - already deployed)' : '(included)'}`);
  console.log(`  CallGasLimit: ${userOp.callGasLimit}`);
  console.log(`  VerificationGasLimit: ${userOp.verificationGasLimit}`);
  console.log(`  MaxFeePerGas: ${userOp.maxFeePerGas} (${Number(userOp.maxFeePerGas) / 1e9} gwei)`);

  // Build batch UserOperation (multiple calls in one tx)
  console.log('\n--- Building Batch UserOperation ---');
  const batchOp = await smartAccount.buildUserOp([
    { to: '0x1234567890123456789012345678901234567890', value: ETH(0.001), data: '0x' },
    { to: '0x2345678901234567890123456789012345678901', value: ETH(0.002), data: '0x' },
    { to: '0x3456789012345678901234567890123456789012', value: 0n, data: '0xabcdef' },
  ]);
  console.log('Batch UserOperation built successfully');
  console.log(`  CallData length: ${batchOp.callData.length} chars`);

  // Sign and send (uncomment to execute)
  // console.log('\n--- Signing and Sending ---');
  // const result = await smartAccount.execute({
  //   to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  //   value: ETH(0.001),
  //   data: '0x',
  // });
  // console.log(`Success: ${result.success}`);
  // console.log(`UserOp Hash: ${result.userOpHash}`);
  // console.log(`Transaction Hash: ${result.transactionHash}`);

  // Using a paymaster for gas sponsorship
  console.log('\n--- Paymaster Example ---');
  const paymasterKey = process.env.PAYMASTER_KEY;
  if (paymasterKey) {
    const paymaster = createVerifyingPaymaster({
      address: '0x1234567890123456789012345678901234567890',
      signerKey: paymasterKey as `0x${string}`,
    });

    // Get paymaster data for the UserOp
    const paymasterResult = await paymaster.getPaymasterData(userOp);
    console.log(`PaymasterAndData: ${paymasterResult.paymasterAndData.slice(0, 50)}...`);

    // Build sponsored UserOp
    const sponsoredOp = await smartAccount.buildUserOp(
      { to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', value: ETH(0.001), data: '0x' },
      { paymasterAndData: paymasterResult.paymasterAndData }
    );
    console.log('Sponsored UserOperation built');
  } else {
    console.log('(Set PAYMASTER_KEY to test paymaster functionality)');
  }

  // Simple send helper
  console.log('\n--- Simple Send ---');
  // const hash = await smartAccount.send(
  //   '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  //   ETH(0.001)
  // );
  // console.log(`Sent! Hash: ${hash}`);
}

main().catch(console.error);

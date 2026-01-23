/**
 * Result Types Example
 *
 * Demonstrates explicit error handling with Result types:
 * - safeSend, safeGetBalance, safeTransferToken
 * - Pattern matching on errors
 * - ResultAsync chaining
 *
 * Run: npx tsx examples/result-types.ts
 */

import {
  AgentWallet,
  SafetyPresets,
  // Result type utilities
  isOk,
  isErr,
  match,
  matchResult,
  P_gt,
  ETH,
  type Result,
} from '@lambdaclass/eth-agent';

async function main() {
  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY!,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',
    ...SafetyPresets.BALANCED,
  });

  console.log('=== Result Types Example ===\n');
  console.log(`Wallet: ${wallet.address}\n`);

  // ============ Safe Methods ============
  console.log('--- Safe Methods (no exceptions) ---\n');

  // safeGetBalance returns Result instead of throwing
  const balanceResult = await wallet.safeGetBalance();

  if (isOk(balanceResult)) {
    console.log(`Balance: ${balanceResult.value.formatted}`);
  } else {
    console.log(`Error: ${balanceResult.error.message}`);
    console.log(`Suggestion: ${balanceResult.error.suggestion}`);
  }

  // ============ Pattern Matching on Results ============
  console.log('\n--- Pattern Matching on Results ---\n');

  // Using matchResult for Result-specific matching
  const balanceMessage = matchResult(balanceResult)
    .ok((balance) => `You have ${balance.formatted}`)
    .err((error) => `Failed to get balance: ${error.suggestion}`)
    .run();

  console.log(balanceMessage);

  // ============ Safe Send with Error Handling ============
  console.log('\n--- Safe Send with Error Patterns ---\n');

  const sendResult = await wallet.safeSend({
    to: 'vitalik.eth',
    amount: '1000 ETH', // Likely to fail due to limits or balance
  });

  // Match specific error codes
  const sendMessage = matchResult(sendResult)
    .ok((result) => `Success! TX: ${result.hash}`)
    .errWith({ code: 'INSUFFICIENT_FUNDS' }, (e) =>
      `Need ${e.details.shortage?.eth} more ETH`
    )
    .errWith({ code: 'DAILY_LIMIT_EXCEEDED' }, (e) =>
      `Daily limit reached. Remaining: ${e.details.remaining?.eth} ETH`
    )
    .errWith({ code: 'TRANSACTION_LIMIT_EXCEEDED' }, (e) =>
      `Amount too large. Max per TX: ${e.details.limit?.eth} ETH`
    )
    .err((e) => `Error: ${e.message}`)
    .run();

  console.log(sendMessage);

  // ============ General Pattern Matching ============
  console.log('\n--- General Pattern Matching ---\n');

  // Pattern matching on any value
  const amount = ETH(0.5);
  const sizeLabel = match(amount)
    .when(P_gt(ETH(1)), () => 'large transaction')
    .when(P_gt(ETH(0.1)), () => 'medium transaction')
    .otherwise(() => 'small transaction');

  console.log(`${amount} wei is a ${sizeLabel}`);

  // Pattern matching with object patterns
  type TxStatus =
    | { status: 'pending'; hash: string }
    | { status: 'confirmed'; hash: string; blockNumber: number }
    | { status: 'failed'; hash: string; error: string };

  const txStatus: TxStatus = { status: 'confirmed', hash: '0xabc...', blockNumber: 12345 };

  const statusMessage = match(txStatus)
    .with({ status: 'pending' }, (tx) => `Transaction ${tx.hash} is pending...`)
    .with({ status: 'confirmed' }, (tx) => `Confirmed in block ${tx.blockNumber}`)
    .with({ status: 'failed' }, (tx) => `Failed: ${tx.error}`)
    .exhaustive();

  console.log(statusMessage);

  // ============ Error Recovery Patterns ============
  console.log('\n--- Error Recovery Patterns ---\n');

  // Check if error is retryable
  if (isErr(sendResult)) {
    const error = sendResult.error;

    if (error.retryable) {
      console.log(`Error is retryable`);
      if (error.retryAfter) {
        const waitMinutes = Math.ceil(error.retryAfter / 60000);
        console.log(`Retry after: ${waitMinutes} minutes`);
      }
    } else {
      console.log(`Error is not retryable: ${error.suggestion}`);
    }
  }

  // ============ Composing Results ============
  console.log('\n--- Composing Results ---\n');

  // Chain operations that might fail
  async function getBalanceInETH(): Promise<Result<string, Error>> {
    const result = await wallet.safeGetBalance();
    if (isOk(result)) {
      return { ok: true, value: result.value.eth };
    }
    return { ok: false, error: new Error(result.error.message) };
  }

  const ethBalance = await getBalanceInETH();
  if (isOk(ethBalance)) {
    console.log(`Balance in ETH: ${ethBalance.value}`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);

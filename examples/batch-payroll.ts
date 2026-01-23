/**
 * Batch Payroll Example
 *
 * Demonstrates batch stablecoin payments using smart accounts:
 * - Loading payroll from CSV/JSON
 * - Batching multiple transfers in one transaction
 * - Gas savings with smart accounts
 * - Progress tracking and error handling
 *
 * Run: npx tsx examples/batch-payroll.ts
 */

import {
  SmartAgentWallet,
  EOA,
  BundlerClient,
  RPCClient,
  USDC,
  USDT,
  parseStablecoinAmount,
  formatStablecoinAmount,
  type StablecoinInfo,
  type BatchTransferItem,
} from '@lambdaclass/eth-agent';

// Payroll entry structure
interface PayrollEntry {
  recipient: string;      // Address or ENS
  amount: string;         // Human-readable amount
  token: 'USDC' | 'USDT'; // Stablecoin symbol
  memo?: string;          // Payment memo
  employeeId?: string;    // Internal reference
}

// Example payroll data
const SAMPLE_PAYROLL: PayrollEntry[] = [
  { recipient: 'alice.eth', amount: '5000', token: 'USDC', memo: 'January salary', employeeId: 'EMP001' },
  { recipient: 'bob.eth', amount: '4500', token: 'USDC', memo: 'January salary', employeeId: 'EMP002' },
  { recipient: '0x1234567890123456789012345678901234567890', amount: '6000', token: 'USDC', memo: 'Contractor payment', employeeId: 'CON001' },
  { recipient: 'carol.eth', amount: '5500', token: 'USDC', memo: 'January salary', employeeId: 'EMP003' },
  { recipient: '0x2345678901234567890123456789012345678901', amount: '4000', token: 'USDC', memo: 'Part-time', employeeId: 'EMP004' },
  { recipient: 'vendor.eth', amount: '2500', token: 'USDT', memo: 'Invoice #INV-2026-001' },
];

// Payroll processor
class PayrollProcessor {
  private wallet: SmartAgentWallet;
  private tokens: Record<string, StablecoinInfo> = {
    USDC,
    USDT,
  };

  constructor(wallet: SmartAgentWallet) {
    this.wallet = wallet;
  }

  // Calculate totals by token
  calculateTotals(entries: PayrollEntry[]): Map<string, { count: number; total: bigint; formatted: string }> {
    const totals = new Map<string, { count: number; total: bigint; formatted: string }>();

    for (const entry of entries) {
      const token = this.tokens[entry.token];
      const amount = parseStablecoinAmount(entry.amount, token);

      const existing = totals.get(entry.token) ?? { count: 0, total: 0n, formatted: '0' };
      existing.count++;
      existing.total += amount;
      existing.formatted = formatStablecoinAmount(existing.total, token);
      totals.set(entry.token, existing);
    }

    return totals;
  }

  // Validate payroll entries
  async validate(entries: PayrollEntry[]): Promise<{
    valid: PayrollEntry[];
    invalid: { entry: PayrollEntry; reason: string }[];
  }> {
    const valid: PayrollEntry[] = [];
    const invalid: { entry: PayrollEntry; reason: string }[] = [];

    for (const entry of entries) {
      // Check token is supported
      if (!this.tokens[entry.token]) {
        invalid.push({ entry, reason: `Unknown token: ${entry.token}` });
        continue;
      }

      // Check amount is positive
      const token = this.tokens[entry.token];
      try {
        const amount = parseStablecoinAmount(entry.amount, token);
        if (amount <= 0n) {
          invalid.push({ entry, reason: 'Amount must be positive' });
          continue;
        }
      } catch {
        invalid.push({ entry, reason: 'Invalid amount format' });
        continue;
      }

      // Check recipient is valid (basic check)
      if (!entry.recipient.endsWith('.eth') && !entry.recipient.startsWith('0x')) {
        invalid.push({ entry, reason: 'Invalid recipient address' });
        continue;
      }

      valid.push(entry);
    }

    return { valid, invalid };
  }

  // Group entries by token for batching
  groupByToken(entries: PayrollEntry[]): Map<string, PayrollEntry[]> {
    const groups = new Map<string, PayrollEntry[]>();

    for (const entry of entries) {
      const existing = groups.get(entry.token) ?? [];
      existing.push(entry);
      groups.set(entry.token, existing);
    }

    return groups;
  }

  // Execute batch payment
  async executeBatch(
    entries: PayrollEntry[],
    options?: { dryRun?: boolean; maxBatchSize?: number }
  ): Promise<{
    success: boolean;
    batches: {
      token: string;
      count: number;
      total: string;
      hash?: string;
      status: 'success' | 'failed' | 'skipped';
      error?: string;
    }[];
  }> {
    const { dryRun = false, maxBatchSize = 20 } = options ?? {};
    const groups = this.groupByToken(entries);
    const results: {
      token: string;
      count: number;
      total: string;
      hash?: string;
      status: 'success' | 'failed' | 'skipped';
      error?: string;
    }[] = [];

    for (const [tokenSymbol, tokenEntries] of groups) {
      const token = this.tokens[tokenSymbol];

      // Split into batches if needed
      const batches: PayrollEntry[][] = [];
      for (let i = 0; i < tokenEntries.length; i += maxBatchSize) {
        batches.push(tokenEntries.slice(i, i + maxBatchSize));
      }

      for (const batch of batches) {
        // Convert to BatchTransferItem format
        const transfers: BatchTransferItem[] = batch.map((entry) => ({
          to: entry.recipient,
          amount: entry.amount,
        }));

        const batchTotal = batch.reduce(
          (sum, e) => sum + parseStablecoinAmount(e.amount, token),
          0n
        );

        if (dryRun) {
          results.push({
            token: tokenSymbol,
            count: batch.length,
            total: formatStablecoinAmount(batchTotal, token),
            status: 'skipped',
          });
          continue;
        }

        try {
          console.log(`\nExecuting batch: ${batch.length} ${tokenSymbol} transfers...`);

          const result = await this.wallet.sendStablecoinBatch({
            token,
            transfers,
          });

          results.push({
            token: tokenSymbol,
            count: batch.length,
            total: formatStablecoinAmount(batchTotal, token),
            hash: result.transactionHash,
            status: 'success',
          });

          console.log(`  Success! TX: ${result.transactionHash}`);
        } catch (err) {
          results.push({
            token: tokenSymbol,
            count: batch.length,
            total: formatStablecoinAmount(batchTotal, token),
            status: 'failed',
            error: (err as Error).message,
          });

          console.log(`  Failed: ${(err as Error).message}`);
        }
      }
    }

    return {
      success: results.every((r) => r.status !== 'failed'),
      batches: results,
    };
  }
}

// Generate payroll report
function generateReport(
  entries: PayrollEntry[],
  totals: Map<string, { count: number; total: bigint; formatted: string }>,
  executionResult?: Awaited<ReturnType<PayrollProcessor['executeBatch']>>
): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                      PAYROLL REPORT                           ',
    '═══════════════════════════════════════════════════════════════',
    '',
    'SUMMARY:',
  ];

  for (const [token, data] of totals) {
    lines.push(`  ${token}: ${data.count} payments totaling ${data.formatted} ${token}`);
  }

  lines.push('');
  lines.push('DETAIL:');
  lines.push('───────────────────────────────────────────────────────────────');

  for (const entry of entries) {
    const recipient = entry.recipient.length > 20
      ? `${entry.recipient.slice(0, 10)}...${entry.recipient.slice(-8)}`
      : entry.recipient;
    lines.push(
      `  ${(entry.employeeId ?? 'N/A').padEnd(8)} ${recipient.padEnd(24)} ${entry.amount.padStart(10)} ${entry.token}  ${entry.memo ?? ''}`
    );
  }

  lines.push('───────────────────────────────────────────────────────────────');

  if (executionResult) {
    lines.push('');
    lines.push('EXECUTION:');

    for (const batch of executionResult.batches) {
      const status = batch.status === 'success' ? '✓' : batch.status === 'skipped' ? '○' : '✗';
      lines.push(
        `  ${status} ${batch.token}: ${batch.count} transfers (${batch.total} ${batch.token})`
      );
      if (batch.hash) {
        lines.push(`    TX: ${batch.hash}`);
      }
      if (batch.error) {
        lines.push(`    Error: ${batch.error}`);
      }
    }

    lines.push('');
    lines.push(`STATUS: ${executionResult.success ? 'COMPLETED' : 'FAILED'}`);
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

async function main() {
  console.log('=== Batch Payroll System ===\n');

  // Check for required environment variables
  const privateKey = process.env.ETH_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  const bundlerUrl = process.env.BUNDLER_URL;

  if (!privateKey) {
    console.error('Error: ETH_PRIVATE_KEY environment variable required');
    console.error('');
    console.error('Usage:');
    console.error('  ETH_PRIVATE_KEY=0x... RPC_URL=https://... BUNDLER_URL=https://... npx tsx examples/batch-payroll.ts');
    console.error('');
    console.error('Required:');
    console.error('  ETH_PRIVATE_KEY - Private key for the smart wallet owner');
    console.error('  RPC_URL        - Sepolia RPC endpoint (e.g., Alchemy, Infura)');
    console.error('  BUNDLER_URL    - ERC-4337 bundler endpoint (e.g., Pimlico, Stackup)');
    process.exit(1);
  }

  if (!rpcUrl) {
    console.error('Error: RPC_URL environment variable required');
    console.error('Get one from: https://www.alchemy.com/ or https://www.infura.io/');
    process.exit(1);
  }

  if (!bundlerUrl) {
    console.error('Error: BUNDLER_URL environment variable required');
    console.error('Get one from: https://www.pimlico.io/ or https://www.stackup.sh/');
    process.exit(1);
  }

  // Connect to RPC and bundler
  const rpc = RPCClient.connect(rpcUrl);

  const bundler = new BundlerClient({
    url: bundlerUrl,
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  });

  // Create owner EOA
  const owner = EOA.fromPrivateKey(privateKey as `0x${string}`);

  console.log(`Owner: ${owner.address}`);

  // Create smart wallet
  const wallet = await SmartAgentWallet.create({
    owner,
    rpc,
    bundler,
  });

  console.log(`Smart Wallet: ${wallet.address}\n`);

  // Initialize processor
  const processor = new PayrollProcessor(wallet);

  // Load payroll (in production, load from CSV/database)
  console.log('--- Loading Payroll ---\n');
  console.log(`Loaded ${SAMPLE_PAYROLL.length} entries\n`);

  // Validate entries
  console.log('--- Validating Entries ---\n');
  const { valid, invalid } = await processor.validate(SAMPLE_PAYROLL);
  console.log(`Valid: ${valid.length}`);
  console.log(`Invalid: ${invalid.length}`);

  if (invalid.length > 0) {
    console.log('\nInvalid entries:');
    for (const { entry, reason } of invalid) {
      console.log(`  - ${entry.recipient}: ${reason}`);
    }
  }

  // Calculate totals
  console.log('\n--- Calculating Totals ---\n');
  const totals = processor.calculateTotals(valid);
  for (const [token, data] of totals) {
    console.log(`${token}: ${data.count} payments = ${data.formatted} ${token}`);
  }

  // Dry run (preview without executing)
  console.log('\n--- Dry Run ---\n');
  const dryRunResult = await processor.executeBatch(valid, { dryRun: true });
  console.log('Dry run completed. No transactions sent.');

  // Generate report
  console.log('\n--- Report (Dry Run) ---\n');
  console.log(generateReport(valid, totals, dryRunResult));

  // Execute (uncomment to actually send)
  // console.log('\n--- Executing Payroll ---\n');
  // const result = await processor.executeBatch(valid);
  // console.log('\n--- Final Report ---\n');
  // console.log(generateReport(valid, totals, result));

  // Gas savings comparison
  console.log('\n--- Gas Savings Estimate ---\n');
  const individualGas = 65000n * BigInt(valid.length); // ~65k gas per ERC20 transfer
  const batchGas = 21000n + 35000n * BigInt(valid.length); // Base + reduced per-transfer
  const savings = ((individualGas - batchGas) * 100n) / individualGas;
  console.log(`Individual transfers: ~${individualGas} gas`);
  console.log(`Batched transfers: ~${batchGas} gas`);
  console.log(`Estimated savings: ~${savings}%`);
}

main().catch(console.error);

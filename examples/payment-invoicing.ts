/**
 * Payment & Invoicing Example
 *
 * Demonstrates payment receiving and invoice creation:
 * - Creating invoices with unique IDs
 * - Watching for incoming stablecoin payments
 * - Matching payments to invoices
 * - Timeout handling
 *
 * Run: npx tsx examples/payment-invoicing.ts
 */

import {
  AgentWallet,
  PaymentWatcher,
  USDC,
  USDT,
  DAI,
  parseStablecoinAmount,
  getStablecoinAddress,
  type StablecoinInfo,
  type IncomingPayment,
} from '@lambdaclass/eth-agent';
import * as crypto from 'crypto';

// Invoice structure
interface Invoice {
  id: string;
  amount: string;
  token: StablecoinInfo;
  recipient: string;
  memo?: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'paid' | 'expired';
  payment?: {
    hash: string;
    from: string;
    amount: string;
    confirmedAt: Date;
  };
}

// Simple in-memory invoice store
class InvoiceStore {
  private invoices = new Map<string, Invoice>();

  create(params: {
    amount: string;
    token: StablecoinInfo;
    recipient: string;
    memo?: string;
    expiresInMinutes?: number;
  }): Invoice {
    const id = crypto.randomUUID().slice(0, 8).toUpperCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (params.expiresInMinutes ?? 60) * 60 * 1000);

    const invoice: Invoice = {
      id,
      amount: params.amount,
      token: params.token,
      recipient: params.recipient,
      memo: params.memo,
      createdAt: now,
      expiresAt,
      status: 'pending',
    };

    this.invoices.set(id, invoice);
    return invoice;
  }

  get(id: string): Invoice | undefined {
    return this.invoices.get(id);
  }

  markPaid(id: string, payment: Invoice['payment']): void {
    const invoice = this.invoices.get(id);
    if (invoice) {
      invoice.status = 'paid';
      invoice.payment = payment;
    }
  }

  markExpired(id: string): void {
    const invoice = this.invoices.get(id);
    if (invoice && invoice.status === 'pending') {
      invoice.status = 'expired';
    }
  }

  getPendingForAmount(amount: bigint, token: StablecoinInfo): Invoice | undefined {
    for (const invoice of this.invoices.values()) {
      if (invoice.status !== 'pending') continue;
      if (invoice.token.symbol !== token.symbol) continue;

      const invoiceAmount = parseStablecoinAmount(invoice.amount, token);
      // Allow small tolerance (0.1%)
      const tolerance = invoiceAmount / 1000n;
      if (amount >= invoiceAmount - tolerance && amount <= invoiceAmount + tolerance) {
        return invoice;
      }
    }
    return undefined;
  }

  listPending(): Invoice[] {
    return Array.from(this.invoices.values()).filter((i) => i.status === 'pending');
  }
}

function formatInvoice(invoice: Invoice): string {
  const lines = [
    `┌─────────────────────────────────────────┐`,
    `│           INVOICE #${invoice.id}           │`,
    `├─────────────────────────────────────────┤`,
    `│ Amount: ${invoice.amount} ${invoice.token.symbol}`.padEnd(42) + '│',
    `│ Recipient: ${invoice.recipient.slice(0, 10)}...${invoice.recipient.slice(-8)}`.padEnd(42) + '│',
  ];

  if (invoice.memo) {
    lines.push(`│ Memo: ${invoice.memo}`.padEnd(42) + '│');
  }

  lines.push(`│ Status: ${invoice.status.toUpperCase()}`.padEnd(42) + '│');
  lines.push(`│ Expires: ${invoice.expiresAt.toISOString()}`.padEnd(42) + '│');

  if (invoice.payment) {
    lines.push(`├─────────────────────────────────────────┤`);
    lines.push(`│ PAID: ${invoice.payment.confirmedAt.toISOString()}`.padEnd(42) + '│');
    lines.push(`│ From: ${invoice.payment.from.slice(0, 10)}...`.padEnd(42) + '│');
    lines.push(`│ TX: ${invoice.payment.hash.slice(0, 20)}...`.padEnd(42) + '│');
  }

  lines.push(`└─────────────────────────────────────────┘`);

  return lines.join('\n');
}

async function main() {
  // Check for private key
  const privateKey = process.env.ETH_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: ETH_PRIVATE_KEY environment variable required');
    console.error('Usage: ETH_PRIVATE_KEY=0x... npx tsx examples/payment-invoicing.ts');
    process.exit(1);
  }

  // Create wallet for receiving payments
  const wallet = AgentWallet.create({
    privateKey,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',
  });

  console.log('=== Payment & Invoicing System ===\n');
  console.log(`Receiving address: ${wallet.address}\n`);

  // Initialize invoice store
  const store = new InvoiceStore();

  // Create some sample invoices
  console.log('--- Creating Invoices ---\n');

  const invoice1 = store.create({
    amount: '100',
    token: USDC,
    recipient: wallet.address,
    memo: 'API subscription - January 2026',
    expiresInMinutes: 30,
  });
  console.log(formatInvoice(invoice1));
  console.log();

  const invoice2 = store.create({
    amount: '250.50',
    token: USDT,
    recipient: wallet.address,
    memo: 'Consulting services',
    expiresInMinutes: 60,
  });
  console.log(formatInvoice(invoice2));
  console.log();

  const invoice3 = store.create({
    amount: '1000',
    token: DAI,
    recipient: wallet.address,
    memo: 'Enterprise license',
    expiresInMinutes: 1440, // 24 hours
  });
  console.log(formatInvoice(invoice3));
  console.log();

  // List pending invoices
  console.log('--- Pending Invoices ---\n');
  for (const inv of store.listPending()) {
    console.log(`${inv.id}: ${inv.amount} ${inv.token.symbol} - ${inv.memo ?? 'No memo'}`);
  }

  // Payment handler - matches incoming payments to invoices
  const handlePayment = (payment: IncomingPayment): void => {
    console.log(`\n[PAYMENT RECEIVED]`);
    console.log(`  Amount: ${payment.formattedAmount} ${payment.token.symbol}`);
    console.log(`  From: ${payment.from}`);
    console.log(`  TX: ${payment.transactionHash}`);

    // Try to match to an invoice
    const matchedInvoice = store.getPendingForAmount(payment.amount, payment.token);

    if (matchedInvoice) {
      store.markPaid(matchedInvoice.id, {
        hash: payment.transactionHash,
        from: payment.from,
        amount: payment.formattedAmount,
        confirmedAt: new Date(),
      });

      console.log(`\n[INVOICE MATCHED] #${matchedInvoice.id}`);
      console.log(formatInvoice(store.get(matchedInvoice.id)!));

      // Here you would trigger fulfillment logic:
      // - Activate subscription
      // - Send confirmation email
      // - Update database
      // - etc.
    } else {
      console.log(`\n[NO MATCHING INVOICE] Payment received but no pending invoice found`);
      console.log(`  Consider creating a credit or refund`);
    }
  };

  // Start watching for payments
  console.log('\n--- Starting Payment Watcher ---\n');
  console.log('Watching for USDC, USDT, and DAI payments...\n');
  console.log('(In production, this would run continuously)\n');

  // Method 1: Event-based watching
  const watcher = wallet.onStablecoinReceived(handlePayment, {
    tokens: [USDC, USDT, DAI],
    pollingInterval: 15000, // Check every 15 seconds
  });

  // Stop after 30 seconds for demo
  console.log('Watching for 30 seconds...\n');

  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Stop the watcher
  watcher.stop();
  console.log('\nWatcher stopped.\n');

  // Method 2: Wait for specific payment (blocking)
  console.log('--- Wait for Specific Payment (Demo) ---\n');
  console.log('Waiting for exactly 100 USDC (with 60s timeout)...\n');

  try {
    // This would block until payment is received or timeout
    // Uncomment to test:
    // const payment = await wallet.waitForPayment({
    //   token: USDC,
    //   minAmount: '100',
    //   timeout: 60000, // 60 seconds
    // });
    // console.log(`Received payment: ${payment.amount} ${payment.token.symbol}`);

    console.log('(Skipped for demo - uncomment to test)');
  } catch (err) {
    console.log(`Timeout or error: ${(err as Error).message}`);
  }

  // Check invoice expiry
  console.log('\n--- Checking Invoice Expiry ---\n');
  for (const inv of store.listPending()) {
    if (new Date() > inv.expiresAt) {
      store.markExpired(inv.id);
      console.log(`Invoice #${inv.id} expired`);
    } else {
      const remaining = Math.round((inv.expiresAt.getTime() - Date.now()) / 60000);
      console.log(`Invoice #${inv.id}: ${remaining} minutes remaining`);
    }
  }

  // Generate payment link (for integrations)
  console.log('\n--- Payment Links ---\n');
  for (const inv of store.listPending()) {
    // EIP-681 payment link format for ERC20 transfers
    // Format: ethereum:<token_address>@<chainId>/transfer?address=<recipient>&uint256=<amount>
    const tokenAddress = getStablecoinAddress(inv.token, 1);
    const amount = parseStablecoinAmount(inv.amount, inv.token);
    const paymentLink = `ethereum:${tokenAddress}@1/transfer?address=${inv.recipient}&uint256=${amount}`;
    console.log(`Invoice #${inv.id}:`);
    console.log(`  ${paymentLink}\n`);
  }

  console.log('=== Done ===');
}

main().catch(console.error);

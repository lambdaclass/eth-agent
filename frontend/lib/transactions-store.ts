// In-memory transaction store
// In production, you'd want to persist this to a database

export interface StoredTransaction {
  id: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  blockNumber?: number;
  gasUsed?: string;
}

const transactionHistory: StoredTransaction[] = [];

// Record a new transaction
export function recordTransaction(tx: Omit<StoredTransaction, 'id' | 'timestamp'>) {
  transactionHistory.unshift({
    id: crypto.randomUUID(),
    ...tx,
    timestamp: Date.now(),
  });

  // Keep only last 1000 transactions
  if (transactionHistory.length > 1000) {
    transactionHistory.pop();
  }
}

// Update transaction status
export function updateTransactionStatus(
  hash: string,
  status: 'confirmed' | 'failed',
  blockNumber?: number
) {
  const tx = transactionHistory.find((t) => t.hash === hash);
  if (tx) {
    tx.status = status;
    if (blockNumber) tx.blockNumber = blockNumber;
  }
}

// Get all transactions
export function getTransactions(): StoredTransaction[] {
  return [...transactionHistory];
}

// Get transactions with filtering
export function getFilteredTransactions(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): { transactions: StoredTransaction[]; total: number } {
  let transactions = [...transactionHistory];

  // Filter by status if provided
  if (options?.status && options.status !== 'all') {
    transactions = transactions.filter((tx) => tx.status === options.status);
  }

  // Sort by timestamp descending (newest first)
  transactions.sort((a, b) => b.timestamp - a.timestamp);

  // Get total before pagination
  const total = transactions.length;

  // Paginate
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  const paginatedTransactions = transactions.slice(offset, offset + limit);

  return {
    transactions: paginatedTransactions,
    total,
  };
}

// In-memory storage for strategies, logs, and transactions
// Data is lost on server restart

import { privateKeyToAddress } from '@lambdaclass/eth-agent/core';
import type { Hex } from '@lambdaclass/eth-agent';
import {
  Strategy,
  StrategyConfig,
  StrategyLog,
  StrategyTransaction,
  StrategyStatus,
  LogLevel,
  LogCategory,
} from './strategy-types';
import { getSettings } from './settings-store';

// Log subscribers for SSE streaming
type LogSubscriber = (log: StrategyLog) => void;

// Store types for global persistence
interface StrategyStoreData {
  strategies: Map<string, Strategy>;
  logs: Map<string, StrategyLog[]>;
  transactions: Map<string, StrategyTransaction[]>;
  logSubscribers: Map<string, Set<LogSubscriber>>;
}

// Use globalThis to persist data across hot reloads in development
const globalStore = globalThis as typeof globalThis & {
  __strategyStore?: StrategyStoreData;
};

if (!globalStore.__strategyStore) {
  globalStore.__strategyStore = {
    strategies: new Map<string, Strategy>(),
    logs: new Map<string, StrategyLog[]>(),
    transactions: new Map<string, StrategyTransaction[]>(),
    logSubscribers: new Map<string, Set<LogSubscriber>>(),
  };
}

// In-memory storage (persisted via globalThis in dev mode)
const strategies = globalStore.__strategyStore.strategies;
const logs = globalStore.__strategyStore.logs;
const transactions = globalStore.__strategyStore.transactions;
const logSubscribers = globalStore.__strategyStore.logSubscribers;

// Max logs per strategy to prevent memory bloat
const MAX_LOGS_PER_STRATEGY = 1000;
const MAX_TRANSACTIONS_PER_STRATEGY = 500;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getDefaultConfig(): StrategyConfig {
  const settings = getSettings();
  return {
    loopIntervalMs: 60000, // 1 minute
    rpcUrl: settings.rpcUrl,
    chainId: settings.chainId,
    limits: {
      perTransaction: '1 ETH',
      perHour: '5 ETH',
      perDay: '10 ETH',
    },
  };
}

// Strategy CRUD operations
export function createStrategy(
  name: string,
  privateKey: string,
  prompt: string,
  configOverrides?: Partial<StrategyConfig>
): Strategy {
  const id = generateId();

  // Derive wallet address from private key
  let walletAddress: string;
  try {
    const normalizedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
    walletAddress = privateKeyToAddress(normalizedKey);
  } catch {
    throw new Error('Invalid private key');
  }

  const strategy: Strategy = {
    id,
    name,
    privateKey,
    walletAddress,
    prompt,
    status: 'idle',
    createdAt: Date.now(),
    config: { ...getDefaultConfig(), ...configOverrides },
  };

  strategies.set(id, strategy);
  logs.set(id, []);
  transactions.set(id, []);

  return strategy;
}

export function getStrategy(id: string): Strategy | undefined {
  return strategies.get(id);
}

export function getAllStrategies(): Strategy[] {
  return Array.from(strategies.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateStrategy(
  id: string,
  updates: Partial<Pick<Strategy, 'name' | 'prompt' | 'status' | 'error' | 'startedAt' | 'stoppedAt' | 'config'>>
): Strategy | undefined {
  const strategy = strategies.get(id);
  if (!strategy) return undefined;

  const updated = { ...strategy, ...updates };
  strategies.set(id, updated);
  return updated;
}

export function updateStrategyStatus(id: string, status: StrategyStatus, error?: string): Strategy | undefined {
  const updates: Partial<Strategy> = { status, error: error || undefined };

  if (status === 'running') {
    updates.startedAt = Date.now();
  } else if (status === 'stopped') {
    updates.stoppedAt = Date.now();
  }

  return updateStrategy(id, updates);
}

export function deleteStrategy(id: string): boolean {
  const existed = strategies.has(id);
  strategies.delete(id);
  logs.delete(id);
  transactions.delete(id);
  logSubscribers.delete(id);
  return existed;
}

// Log operations
export function addLog(
  strategyId: string,
  level: LogLevel,
  category: LogCategory,
  message: string,
  data?: Record<string, unknown>
): StrategyLog | undefined {
  const strategyLogs = logs.get(strategyId);
  if (!strategyLogs) return undefined;

  const log: StrategyLog = {
    id: generateId(),
    strategyId,
    timestamp: Date.now(),
    level,
    category,
    message,
    data,
  };

  strategyLogs.push(log);

  // Trim old logs if over limit
  if (strategyLogs.length > MAX_LOGS_PER_STRATEGY) {
    strategyLogs.splice(0, strategyLogs.length - MAX_LOGS_PER_STRATEGY);
  }

  // Notify subscribers
  const subscribers = logSubscribers.get(strategyId);
  if (subscribers) {
    subscribers.forEach((callback) => {
      try {
        callback(log);
      } catch {
        // Ignore callback errors
      }
    });
  }

  return log;
}

export function getLogs(strategyId: string, limit = 100, offset = 0): StrategyLog[] {
  const strategyLogs = logs.get(strategyId);
  if (!strategyLogs) return [];

  // Return most recent logs first
  const sorted = [...strategyLogs].reverse();
  return sorted.slice(offset, offset + limit);
}

export function subscribeToLogs(strategyId: string, callback: LogSubscriber): () => void {
  let subscribers = logSubscribers.get(strategyId);
  if (!subscribers) {
    subscribers = new Set();
    logSubscribers.set(strategyId, subscribers);
  }

  subscribers.add(callback);

  // Return unsubscribe function
  return () => {
    subscribers?.delete(callback);
    if (subscribers?.size === 0) {
      logSubscribers.delete(strategyId);
    }
  };
}

// Transaction operations
export function addTransaction(
  strategyId: string,
  txData: Omit<StrategyTransaction, 'id' | 'strategyId'>
): StrategyTransaction | undefined {
  const strategyTxs = transactions.get(strategyId);
  if (!strategyTxs) return undefined;

  const tx: StrategyTransaction = {
    id: generateId(),
    strategyId,
    ...txData,
  };

  strategyTxs.push(tx);

  // Trim old transactions if over limit
  if (strategyTxs.length > MAX_TRANSACTIONS_PER_STRATEGY) {
    strategyTxs.splice(0, strategyTxs.length - MAX_TRANSACTIONS_PER_STRATEGY);
  }

  // Also add a log for the transaction
  addLog(strategyId, 'info', 'transaction', `Transaction ${tx.hash}: ${tx.amount} ${tx.token} to ${tx.to}`, {
    hash: tx.hash,
    amount: tx.amount,
    token: tx.token,
    to: tx.to,
    status: tx.status,
  });

  return tx;
}

export function updateTransactionStatus(
  strategyId: string,
  hash: string,
  status: StrategyTransaction['status'],
  blockNumber?: number,
  gasUsed?: string
): StrategyTransaction | undefined {
  const strategyTxs = transactions.get(strategyId);
  if (!strategyTxs) return undefined;

  const tx = strategyTxs.find((t) => t.hash === hash);
  if (!tx) return undefined;

  tx.status = status;
  if (blockNumber !== undefined) tx.blockNumber = blockNumber;
  if (gasUsed !== undefined) tx.gasUsed = gasUsed;

  return tx;
}

export function getTransactions(strategyId: string, limit = 50, offset = 0): StrategyTransaction[] {
  const strategyTxs = transactions.get(strategyId);
  if (!strategyTxs) return [];

  // Return most recent transactions first
  const sorted = [...strategyTxs].reverse();
  return sorted.slice(offset, offset + limit);
}

// Helper to get full strategy detail
export function getStrategyDetail(id: string): {
  strategy: Strategy;
  logs: StrategyLog[];
  transactions: StrategyTransaction[];
} | undefined {
  const strategy = getStrategy(id);
  if (!strategy) return undefined;

  return {
    strategy,
    logs: getLogs(id),
    transactions: getTransactions(id),
  };
}

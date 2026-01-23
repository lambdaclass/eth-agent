// Type definitions for trading strategies

export type StrategyStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export interface StrategyConfig {
  loopIntervalMs: number;
  rpcUrl: string;
  chainId: number;
  limits: {
    perTransaction: string;
    perHour: string;
    perDay: string;
  };
}

export interface Strategy {
  id: string;
  name: string;
  privateKey: string;
  walletAddress: string;
  prompt: string;
  status: StrategyStatus;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  error?: string;
  config: StrategyConfig;
}

export type LogLevel = 'info' | 'warn' | 'error';
export type LogCategory = 'system' | 'claude' | 'tool' | 'transaction';

export interface StrategyLog {
  id: string;
  strategyId: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
}

export interface StrategyTransaction {
  id: string;
  strategyId: string;
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

// API request/response types
export interface CreateStrategyRequest {
  name: string;
  privateKey: string;
  prompt: string;
  config?: Partial<StrategyConfig>;
}

export interface StrategyListResponse {
  strategies: Strategy[];
}

export interface StrategyDetailResponse extends Strategy {
  logs: StrategyLog[];
  transactions: StrategyTransaction[];
}

// Worker IPC message types
export type WorkerMessageType =
  | 'log'
  | 'transaction'
  | 'status_change'
  | 'error'
  | 'ready';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload: unknown;
}

export interface WorkerLogMessage extends WorkerMessage {
  type: 'log';
  payload: Omit<StrategyLog, 'id' | 'strategyId'>;
}

export interface WorkerTransactionMessage extends WorkerMessage {
  type: 'transaction';
  payload: Omit<StrategyTransaction, 'id' | 'strategyId'>;
}

export interface WorkerStatusMessage extends WorkerMessage {
  type: 'status_change';
  payload: { status: StrategyStatus; error?: string };
}

export interface WorkerErrorMessage extends WorkerMessage {
  type: 'error';
  payload: { message: string; stack?: string };
}

// Parent to worker commands
export type WorkerCommand = 'start' | 'pause' | 'resume' | 'stop';

export interface WorkerCommandMessage {
  command: WorkerCommand;
}

// Worker config passed via arguments
export interface WorkerConfig {
  strategyId: string;
  privateKey: string;
  prompt: string;
  rpcUrl: string;
  chainId: number;
  loopIntervalMs: number;
  limits: {
    perTransaction: string;
    perHour: string;
    perDay: string;
  };
}

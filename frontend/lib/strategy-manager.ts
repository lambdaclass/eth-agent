// Strategy manager - orchestrates child processes for running strategies

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import {
  WorkerConfig,
  WorkerMessage,
  WorkerLogMessage,
  WorkerTransactionMessage,
  WorkerStatusMessage,
  WorkerCommandMessage,
} from './strategy-types';
import {
  getStrategy,
  updateStrategyStatus,
  addLog,
  addTransaction,
} from './strategy-store';

// Use globalThis to persist processes across hot reloads in development
const globalProcesses = globalThis as typeof globalThis & {
  __strategyProcesses?: Map<string, ChildProcess>;
};

if (!globalProcesses.__strategyProcesses) {
  globalProcesses.__strategyProcesses = new Map<string, ChildProcess>();
}

// Map of strategy ID to child process
const processes = globalProcesses.__strategyProcesses;

// Get the worker script path
function getWorkerPath(): string {
  return path.join(process.cwd(), 'workers', 'strategy-worker.ts');
}

// Get the tsx executable path
function getTsxPath(): string {
  return path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
}

function handleWorkerMessage(strategyId: string, message: WorkerMessage): void {
  switch (message.type) {
    case 'log': {
      const logPayload = (message as WorkerLogMessage).payload;
      addLog(
        strategyId,
        logPayload.level,
        logPayload.category,
        logPayload.message,
        logPayload.data
      );
      break;
    }
    case 'transaction': {
      const txPayload = (message as WorkerTransactionMessage).payload;
      addTransaction(strategyId, txPayload);
      break;
    }
    case 'status_change': {
      const statusPayload = (message as WorkerStatusMessage).payload;
      updateStrategyStatus(strategyId, statusPayload.status, statusPayload.error);
      break;
    }
    case 'error': {
      const errorPayload = message.payload as { message: string; stack?: string };
      addLog(strategyId, 'error', 'system', errorPayload.message, {
        stack: errorPayload.stack,
      });
      break;
    }
    case 'ready':
      addLog(strategyId, 'info', 'system', 'Worker process ready');
      break;
  }
}

export function startStrategy(strategyId: string): { success: boolean; error?: string } {
  const strategy = getStrategy(strategyId);
  if (!strategy) {
    return { success: false, error: 'Strategy not found' };
  }

  if (processes.has(strategyId)) {
    return { success: false, error: 'Strategy is already running' };
  }

  if (strategy.status === 'running') {
    return { success: false, error: 'Strategy is already in running state' };
  }

  const workerConfig: WorkerConfig = {
    strategyId: strategy.id,
    privateKey: strategy.privateKey,
    prompt: strategy.prompt,
    rpcUrl: strategy.config.rpcUrl,
    chainId: strategy.config.chainId,
    loopIntervalMs: strategy.config.loopIntervalMs,
    limits: strategy.config.limits,
  };

  try {
    addLog(strategyId, 'info', 'system', 'Starting strategy worker process...');

    // Spawn the worker process using tsx to run TypeScript directly
    const child = spawn(getTsxPath(), [getWorkerPath(), JSON.stringify(workerConfig)], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    });

    processes.set(strategyId, child);

    // Handle messages from worker
    child.on('message', (message: WorkerMessage) => {
      handleWorkerMessage(strategyId, message);
    });

    // Handle stdout/stderr for debugging
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach((line) => {
        addLog(strategyId, 'info', 'system', `[stdout] ${line}`);
      });
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach((line) => {
        addLog(strategyId, 'error', 'system', `[stderr] ${line}`);
      });
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
      processes.delete(strategyId);
      const exitMsg = signal
        ? `Worker process killed by signal ${signal}`
        : `Worker process exited with code ${code}`;
      addLog(strategyId, code === 0 ? 'info' : 'error', 'system', exitMsg);

      // Update status if it wasn't already set to stopped
      const currentStrategy = getStrategy(strategyId);
      if (currentStrategy && currentStrategy.status !== 'stopped') {
        updateStrategyStatus(
          strategyId,
          code === 0 ? 'stopped' : 'error',
          code !== 0 ? `Exit code: ${code}` : undefined
        );
      }
    });

    // Handle process errors
    child.on('error', (err) => {
      processes.delete(strategyId);
      addLog(strategyId, 'error', 'system', `Worker process error: ${err.message}`);
      updateStrategyStatus(strategyId, 'error', err.message);
    });

    // Send start command
    const startCmd: WorkerCommandMessage = { command: 'start' };
    child.send(startCmd);

    updateStrategyStatus(strategyId, 'running');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start worker';
    addLog(strategyId, 'error', 'system', `Failed to start: ${message}`);
    updateStrategyStatus(strategyId, 'error', message);
    return { success: false, error: message };
  }
}

export function pauseStrategy(strategyId: string): { success: boolean; error?: string } {
  const child = processes.get(strategyId);
  if (!child) {
    return { success: false, error: 'Strategy is not running' };
  }

  const strategy = getStrategy(strategyId);
  if (!strategy || strategy.status !== 'running') {
    return { success: false, error: 'Strategy is not in running state' };
  }

  const cmd: WorkerCommandMessage = { command: 'pause' };
  child.send(cmd);
  updateStrategyStatus(strategyId, 'paused');
  addLog(strategyId, 'info', 'system', 'Strategy paused');

  return { success: true };
}

export function resumeStrategy(strategyId: string): { success: boolean; error?: string } {
  const child = processes.get(strategyId);
  if (!child) {
    return { success: false, error: 'Strategy is not running' };
  }

  const strategy = getStrategy(strategyId);
  if (!strategy || strategy.status !== 'paused') {
    return { success: false, error: 'Strategy is not in paused state' };
  }

  const cmd: WorkerCommandMessage = { command: 'resume' };
  child.send(cmd);
  updateStrategyStatus(strategyId, 'running');
  addLog(strategyId, 'info', 'system', 'Strategy resumed');

  return { success: true };
}

export function stopStrategy(strategyId: string): { success: boolean; error?: string } {
  const child = processes.get(strategyId);
  if (!child) {
    // Strategy might not be running but we should still update status
    const strategy = getStrategy(strategyId);
    if (strategy && strategy.status !== 'stopped' && strategy.status !== 'idle') {
      updateStrategyStatus(strategyId, 'stopped');
    }
    return { success: true };
  }

  const cmd: WorkerCommandMessage = { command: 'stop' };
  child.send(cmd);

  // Give the worker a chance to clean up, then force kill
  setTimeout(() => {
    if (processes.has(strategyId)) {
      child.kill('SIGTERM');
      processes.delete(strategyId);
    }
  }, 5000);

  addLog(strategyId, 'info', 'system', 'Strategy stop requested');
  return { success: true };
}

export function getRunningStrategies(): string[] {
  return Array.from(processes.keys());
}

export function isStrategyRunning(strategyId: string): boolean {
  return processes.has(strategyId);
}

// Clean up all processes on server shutdown
export function cleanupAllProcesses(): void {
  processes.forEach((child, strategyId) => {
    try {
      child.kill('SIGTERM');
      updateStrategyStatus(strategyId, 'stopped');
    } catch {
      // Ignore errors during cleanup
    }
  });
  processes.clear();
}

// Register cleanup handlers
if (typeof process !== 'undefined') {
  process.on('exit', cleanupAllProcesses);
  process.on('SIGINT', () => {
    cleanupAllProcesses();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanupAllProcesses();
    process.exit(0);
  });
}

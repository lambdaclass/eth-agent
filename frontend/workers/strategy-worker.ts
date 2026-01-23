/**
 * Strategy Worker - Child process entry point
 *
 * This worker runs in a separate Node.js process and executes trading strategies
 * using AgentWallet and Claude.
 *
 * Communication with parent process is done via IPC messages.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AgentWallet } from '@lambdaclass/eth-agent';
import { anthropicTools } from '@lambdaclass/eth-agent/anthropic';
import type {
  WorkerConfig,
  WorkerCommandMessage,
  WorkerMessage,
  WorkerLogMessage,
  WorkerTransactionMessage,
  WorkerStatusMessage,
  WorkerErrorMessage,
  LogLevel,
  LogCategory,
  StrategyTransaction,
} from '../lib/strategy-types';

// Parse config from command line arguments
const configArg = process.argv[2];
if (!configArg) {
  console.error('No config provided');
  process.exit(1);
}

let config: WorkerConfig;
try {
  config = JSON.parse(configArg);
} catch {
  console.error('Invalid config JSON');
  process.exit(1);
}

// State
let isRunning = false;
let isPaused = false;
let shouldStop = false;

// Helper to serialize BigInt values for JSON
function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

// Helper to send messages to parent
function sendToParent(message: WorkerMessage): void {
  if (process.send) {
    // Serialize BigInt values before sending
    const serialized = serializeBigInt(message) as WorkerMessage;
    process.send(serialized);
  }
}

function sendLog(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): void {
  const logMessage: WorkerLogMessage = {
    type: 'log',
    payload: {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    },
  };
  sendToParent(logMessage);
}

function sendTransaction(tx: Omit<StrategyTransaction, 'id' | 'strategyId'>): void {
  const txMessage: WorkerTransactionMessage = {
    type: 'transaction',
    payload: tx,
  };
  sendToParent(txMessage);
}

function sendStatus(status: 'running' | 'paused' | 'stopped' | 'error', error?: string): void {
  const statusMessage: WorkerStatusMessage = {
    type: 'status_change',
    payload: { status, error },
  };
  sendToParent(statusMessage);
}

function sendError(message: string, stack?: string): void {
  const errorMessage: WorkerErrorMessage = {
    type: 'error',
    payload: { message, stack },
  };
  sendToParent(errorMessage);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Initialize wallet and tools
let wallet: AgentWallet;
let tools: ReturnType<typeof anthropicTools>;
let claude: Anthropic;

function initialize(): void {
  sendLog('info', 'system', 'Initializing wallet and tools...');

  try {
    // Normalize private key
    const privateKey = config.privateKey.startsWith('0x')
      ? config.privateKey
      : `0x${config.privateKey}`;

    // Create wallet
    wallet = AgentWallet.create({
      privateKey: privateKey as `0x${string}`,
      rpcUrl: config.rpcUrl,
      limits: {
        perTransaction: config.limits.perTransaction,
        perHour: config.limits.perHour,
        perDay: config.limits.perDay,
      },
    });

    // Initialize Anthropic tools
    tools = anthropicTools(wallet);

    // Initialize Claude client
    claude = new Anthropic();

    const caps = wallet.getCapabilities();
    sendLog('info', 'system', `Wallet initialized: ${caps.address} on chain ${caps.network.chainId}`);
    sendLog('info', 'system', `Available tools: ${tools.getToolNames().join(', ')}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown initialization error';
    sendError(message, err instanceof Error ? err.stack : undefined);
    throw err;
  }
}

// Execute a single iteration of the strategy loop
async function executeIteration(): Promise<void> {
  sendLog('info', 'system', 'Starting strategy iteration...');

  try {
    // Build the conversation with the strategy prompt
    const systemPrompt = `You are an autonomous trading agent with access to an Ethereum wallet.
Your task is to execute the trading strategy described below.
You have access to tools to check balances, preview transactions, and send ETH or tokens.
Always check balances and preview transactions before executing.
Be conservative and cautious with funds.

IMPORTANT: When you decide to send a transaction, you MUST call the eth_send or eth_transferToken tool. Do not just describe what you would do - actually execute it.

Available tools:
${tools.getToolNames().map((name: string) => `- ${name}`).join('\n')}`;

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Execute the following trading strategy:\n\n${config.prompt}\n\nFirst, check the current state (balances, etc.), then decide if any actions should be taken based on the strategy. If actions are needed, execute them immediately using the available tools.`,
      },
    ];

    sendLog('info', 'claude', 'Sending request to Claude...');

    // Agentic loop - continue until Claude is done
    let currentMessages = [...messages];
    let iterationCount = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (iterationCount < maxIterations) {
      iterationCount++;

      const response = await claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools.definitions,
        messages: currentMessages,
      });

      sendLog('info', 'claude', `Response received: ${response.stop_reason}`);

      // Process text content
      for (const block of response.content) {
        if (block.type === 'text') {
          sendLog('info', 'claude', block.text);
        }
      }

      // If Claude is done, exit the loop
      if (response.stop_reason === 'end_turn') {
        break;
      }

      // If Claude wants to use tools, execute them
      if (response.stop_reason === 'tool_use') {
        const toolResultContents: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            sendLog('info', 'tool', `Executing tool: ${block.name}`, { input: block.input });

            const result = await tools.execute(block.name, block.input as Record<string, unknown>);

            sendLog(
              result.success ? 'info' : 'error',
              'tool',
              `Tool ${block.name}: ${result.summary}`,
              { result: serializeBigInt(result.data) }
            );

            // Check if this was a send/transfer operation and log the transaction
            if (
              result.success &&
              result.data &&
              (block.name === 'eth_send' || block.name === 'eth_transferToken')
            ) {
              const txData = result.data as {
                hash?: string;
                to?: string;
                amount?: string;
                success?: boolean;
              };

              if (txData.hash) {
                const input = block.input as { to?: string; amount?: string; token?: string };
                sendTransaction({
                  hash: txData.hash,
                  from: wallet.getCapabilities().address,
                  to: input.to || 'unknown',
                  amount: input.amount || '0',
                  token: input.token || 'ETH',
                  status: 'pending',
                  timestamp: Date.now(),
                });
              }
            }

            toolResultContents.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(serializeBigInt(result)),
            });
          }
        }

        // Add assistant response and tool results to messages
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResultContents },
        ];
      } else {
        // Unknown stop reason, exit
        break;
      }
    }

    if (iterationCount >= maxIterations) {
      sendLog('warn', 'system', 'Max iterations reached, ending conversation');
    }

    sendLog('info', 'system', 'Iteration completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during iteration';
    sendLog('error', 'system', `Iteration error: ${message}`);
    sendError(message, err instanceof Error ? err.stack : undefined);
  }
}

// Main loop
async function runLoop(): Promise<void> {
  isRunning = true;
  sendLog('info', 'system', `Starting main loop with ${config.loopIntervalMs}ms interval`);

  while (!shouldStop) {
    if (isPaused) {
      await sleep(1000);
      continue;
    }

    try {
      await executeIteration();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown loop error';
      sendLog('error', 'system', `Loop error: ${message}`);
    }

    if (!shouldStop) {
      sendLog('info', 'system', `Sleeping for ${config.loopIntervalMs}ms...`);
      await sleep(config.loopIntervalMs);
    }
  }

  isRunning = false;
  sendStatus('stopped');
  sendLog('info', 'system', 'Strategy loop stopped');
}

// Handle commands from parent
process.on('message', (message: WorkerCommandMessage) => {
  switch (message.command) {
    case 'start':
      if (!isRunning) {
        shouldStop = false;
        isPaused = false;
        runLoop().catch((err) => {
          sendError(err.message, err.stack);
          process.exit(1);
        });
      }
      break;
    case 'pause':
      isPaused = true;
      sendStatus('paused');
      break;
    case 'resume':
      isPaused = false;
      sendStatus('running');
      break;
    case 'stop':
      shouldStop = true;
      break;
  }
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  sendError(`Uncaught exception: ${err.message}`, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  sendError(`Unhandled rejection: ${message}`);
});

// Initialize on startup
try {
  initialize();
  sendToParent({ type: 'ready', payload: {} });
} catch {
  process.exit(1);
}

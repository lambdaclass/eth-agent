/**
 * Interactive AI Agent Demo
 *
 * A conversational AI agent that can execute Ethereum transactions using natural language.
 * This demonstrates the core value proposition of eth-agent: safe, simple blockchain
 * interactions for AI agents.
 *
 * Features demonstrated:
 * - Natural language transaction execution
 * - Token swaps via Uniswap V3
 * - Cross-chain bridging
 * - Spending limits and safety checks
 * - Transaction simulation/preview
 *
 * Prerequisites:
 * - npm install @anthropic-ai/sdk
 * - Set ANTHROPIC_API_KEY environment variable
 * - Set ETH_PRIVATE_KEY environment variable (use a testnet key!)
 * - Optionally set RPC_URL (defaults to Sepolia testnet)
 *
 * Run: npx tsx examples/interactive-agent-demo.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'readline';
import { AgentWallet } from '../src/index.js';
import { anthropicTools } from '../src/integrations/anthropic.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Use Sepolia testnet by default for safe demos
  rpcUrl: process.env.RPC_URL ?? 'https://1rpc.io/sepolia',
  chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 11155111, // Sepolia

  // Claude model to use
  model: 'claude-sonnet-4-20250514' as const,

  // Safety limits for the demo (conservative for safety)
  limits: {
    perTransaction: '0.1 ETH',
    perHour: '0.5 ETH',
    perDay: '1 ETH',
    stablecoin: {
      perTransactionUSD: 100,
      perDayUSD: 500,
    },
    swap: {
      perTransactionUSD: 100,
      perDayUSD: 500,
      maxSlippagePercent: 1,
      maxPriceImpactPercent: 5,
    },
    bridge: {
      perTransactionUSD: 100,
      perDayUSD: 500,
    },
  },
};

// ============================================================================
// Terminal UI Helpers
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// Chain ID to name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  11155111: 'Sepolia',
  11155420: 'OP Sepolia',
  84532: 'Base Sepolia',
  421614: 'Arbitrum Sepolia',
};

function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`;
}

function printHeader(): void {
  console.log(`
${colors.cyan}========================================================================
    ETH-AGENT INTERACTIVE DEMO
    Natural Language Ethereum Transactions
========================================================================${colors.reset}
`);
}

function printWalletInfo(wallet: AgentWallet): void {
  const caps = wallet.getCapabilities();
  const chainName = getChainName(caps.network.chainId);
  console.log(`${colors.blue}Wallet Info${colors.reset}`);
  console.log(`  Address: ${colors.cyan}${caps.address}${colors.reset}`);
  console.log(`  Network: ${colors.yellow}${chainName} (Chain ${caps.network.chainId})${colors.reset}`);
}

function printLimits(wallet: AgentWallet): void {
  const ethLimits = wallet.getLimits();
  const swapLimits = wallet.getSwapLimits();
  const bridgeLimits = wallet.getBridgeLimits();
  const stablecoinLimits = wallet.getStablecoinLimits();

  console.log(`\n${colors.yellow}Safety Limits${colors.reset}`);
  console.log(`  ETH:        ${ethLimits.daily.remaining}/${ethLimits.daily.limit} ETH remaining today`);
  console.log(`  Stablecoin: $${stablecoinLimits.global.daily.remaining}/$${stablecoinLimits.global.daily.limit} remaining today`);
  console.log(`  Swap:       $${swapLimits.daily.remaining}/$${swapLimits.daily.limit} remaining today`);
  console.log(`  Bridge:     $${bridgeLimits.daily.remaining}/$${bridgeLimits.daily.limit} remaining today`);
}

function printAvailableTools(toolNames: string[]): void {
  console.log(`\n${colors.magenta}Available Tools${colors.reset}`);

  const categories: Record<string, string[]> = {
    'Balance & Info': toolNames.filter(t => t.includes('Balance') || t.includes('Capabilities') || t.includes('Limits')),
    'Send & Transfer': toolNames.filter(t => t.includes('send') || t.includes('transfer')),
    'Swap': toolNames.filter(t => t.toLowerCase().includes('swap')),
    'Bridge': toolNames.filter(t => t.toLowerCase().includes('bridge')),
    'Preview': toolNames.filter(t => t.includes('preview')),
  };

  for (const [category, tools] of Object.entries(categories)) {
    if (tools.length > 0) {
      console.log(`  ${colors.bold}${category}:${colors.reset} ${tools.join(', ')}`);
    }
  }
}

function printExamples(): void {
  console.log(`\n${colors.green}Example Commands${colors.reset}`);
  console.log(`  ${colors.dim}"What's my ETH balance?"${colors.reset}`);
  console.log(`  ${colors.dim}"Show me all my stablecoin balances"${colors.reset}`);
  console.log(`  ${colors.dim}"Get a quote to swap 0.01 ETH for USDC"${colors.reset}`);
  console.log(`  ${colors.dim}"Swap 10 USDC for ETH"${colors.reset}`);
  console.log(`  ${colors.dim}"Compare bridge routes for 50 USDC to Arbitrum"${colors.reset}`);
  console.log(`  ${colors.dim}"Bridge 25 USDC to Base"${colors.reset}`);
  console.log(`  ${colors.dim}"Preview sending 0.01 ETH to vitalik.eth"${colors.reset}`);
  console.log(`  ${colors.dim}"What are my current spending limits?"${colors.reset}`);
  console.log(`\n${colors.dim}Type 'quit' or 'exit' to end the session.${colors.reset}\n`);
}

function printToolCall(name: string, input: Record<string, unknown>): void {
  console.log(`\n${colors.cyan}Executing: ${colors.bold}${name}${colors.reset}`);
  if (Object.keys(input).length > 0) {
    console.log(`${colors.dim}  Parameters: ${JSON.stringify(input)}${colors.reset}`);
  }
}

function printToolResult(result: { success: boolean; summary: string }): void {
  const icon = result.success ? '[OK]' : '[FAIL]';
  const color = result.success ? colors.green : colors.red;
  console.log(`${color}${icon} ${result.summary}${colors.reset}`);
}

function printAssistantMessage(message: string): void {
  console.log(`\n${colors.blue}Assistant:${colors.reset} ${message}`);
}

function printThinking(): void {
  process.stdout.write(`${colors.dim}Thinking...${colors.reset}`);
}

function clearThinking(): void {
  process.stdout.write('\r\x1b[K');
}

// ============================================================================
// Approval Handler
// ============================================================================

function createApprovalHandler(rl: readline.Interface) {
  return async (request: { summary: string; details: Record<string, unknown> }): Promise<boolean> => {
    console.log(`\n${colors.yellow}APPROVAL REQUIRED${colors.reset}`);
    console.log(`  ${request.summary}`);

    if (request.details.value) {
      console.log(`  Value: ${JSON.stringify(request.details.value)}`);
    }
    if (request.details.to) {
      console.log(`  To: ${request.details.to}`);
    }

    return new Promise((resolve) => {
      rl.question(`${colors.yellow}Approve? (yes/no): ${colors.reset}`, (answer) => {
        const approved = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
        if (approved) {
          console.log(`${colors.green}Approved${colors.reset}`);
        } else {
          console.log(`${colors.red}Denied${colors.reset}`);
        }
        resolve(approved);
      });
    });
  };
}

// ============================================================================
// Main Agent Loop
// ============================================================================

async function runAgentLoop(
  anthropic: Anthropic,
  wallet: AgentWallet,
  tools: ReturnType<typeof anthropicTools>,
  rl: readline.Interface
): Promise<void> {
  const conversationHistory: Anthropic.MessageParam[] = [];

  const systemPrompt = `You are an AI assistant with access to an Ethereum wallet. You can help users:

1. **Check balances** - ETH, stablecoins (USDC, USDT, DAI), and other tokens
2. **Send transactions** - Transfer ETH or tokens to addresses (supports ENS names like vitalik.eth)
3. **Swap tokens** - Exchange tokens using Uniswap V3 (e.g., ETH <-> USDC)
4. **Bridge tokens** - Move stablecoins across chains (Ethereum, Arbitrum, Base, Optimism, etc.)
5. **Preview operations** - Simulate transactions before executing to see costs and potential issues

**Important Safety Notes:**
- Always preview or quote operations before executing them when the user hasn't explicitly asked to execute
- Spending limits are enforced - check limits if a transaction fails
- For swaps and bridges, explain the fees and expected outcomes
- When bridging, explain the estimated time and process

**Current Network:** ${getChainName(wallet.getCapabilities().network.chainId)} (Chain ${wallet.getCapabilities().network.chainId})
**Wallet Address:** ${wallet.address}

Be helpful, concise, and always prioritize safety. If an operation seems risky or unclear, ask for confirmation.`;

  while (true) {
    const userInput = await new Promise<string>((resolve) => {
      rl.question(`${colors.green}You:${colors.reset} `, resolve);
    });

    if (['quit', 'exit', 'q'].includes(userInput.toLowerCase().trim())) {
      console.log(`\n${colors.cyan}Goodbye! Stay safe out there.${colors.reset}\n`);
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    conversationHistory.push({
      role: 'user',
      content: userInput,
    });

    printThinking();

    try {
      let response = await anthropic.messages.create({
        model: CONFIG.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools.definitions,
        messages: conversationHistory,
      });

      clearThinking();

      while (response.stop_reason === 'tool_use') {
        const assistantContent = response.content;
        const toolUseBlocks = assistantContent.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        conversationHistory.push({
          role: 'assistant',
          content: assistantContent,
        });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          printToolCall(toolUse.name, toolUse.input as Record<string, unknown>);

          const result = await tools.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );

          printToolResult(result);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        conversationHistory.push({
          role: 'user',
          content: toolResults,
        });

        printThinking();

        response = await anthropic.messages.create({
          model: CONFIG.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: tools.definitions,
          messages: conversationHistory,
        });

        clearThinking();
      }

      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      if (textBlocks.length > 0) {
        const fullResponse = textBlocks.map((b) => b.text).join('\n');
        printAssistantMessage(fullResponse);

        conversationHistory.push({
          role: 'assistant',
          content: response.content,
        });
      }
    } catch (error) {
      clearThinking();
      console.error(`\n${colors.red}Error: ${(error as Error).message}${colors.reset}`);
      conversationHistory.pop();
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${colors.red}Error: ANTHROPIC_API_KEY environment variable is required${colors.reset}`);
    console.error(`${colors.dim}Get your API key at: https://console.anthropic.com/${colors.reset}`);
    process.exit(1);
  }

  if (!process.env.ETH_PRIVATE_KEY) {
    console.error(`${colors.red}Error: ETH_PRIVATE_KEY environment variable is required${colors.reset}`);
    console.error(`${colors.dim}Use a testnet private key for safety!${colors.reset}`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const anthropic = new Anthropic();

  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY,
    rpcUrl: CONFIG.rpcUrl,
    limits: CONFIG.limits,
    onApprovalRequired: createApprovalHandler(rl),
  });

  const tools = anthropicTools(wallet);

  printHeader();

  // Fetch chain ID first to populate cache for getCapabilities()
  try {
    await wallet.getChainId();
  } catch {
    // Will fall back to default chain ID
  }

  printWalletInfo(wallet);
  printLimits(wallet);
  printAvailableTools(tools.getToolNames());
  printExamples();

  try {
    const balance = await wallet.getBalance();
    console.log(`${colors.cyan}Current ETH Balance: ${balance.formatted}${colors.reset}\n`);
  } catch {
    console.log(`${colors.yellow}Could not fetch balance (network may be unavailable)${colors.reset}\n`);
  }

  await runAgentLoop(anthropic, wallet, tools, rl);

  rl.close();
}

main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});

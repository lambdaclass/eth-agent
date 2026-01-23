#!/usr/bin/env npx tsx
/**
 * CLI Tool Example
 *
 * A simple command-line interface for sending stablecoins:
 * - Interactive prompts
 * - Balance checking
 * - Transaction confirmation
 * - History tracking
 *
 * Run: npx tsx examples/cli-tool.ts [command] [args...]
 *
 * Commands:
 *   balance                    - Show ETH and stablecoin balances
 *   send <to> <amount> <token> - Send stablecoins (e.g., send alice.eth 100 USDC)
 *   limits                     - Show spending limits
 *   history                    - Show transaction history (in-memory)
 *   help                       - Show this help
 */

import * as readline from 'readline';
import {
  AgentWallet,
  USDC,
  USDT,
  USDS,
  DAI,
  SafetyPresets,
  type StablecoinInfo,
  type SendStablecoinResult,
} from '@lambdaclass/eth-agent';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

// Token map
const TOKENS: Record<string, StablecoinInfo> = {
  USDC,
  USDT,
  USDS,
  DAI,
};

// Simple transaction history (in-memory)
const history: {
  timestamp: Date;
  type: string;
  to: string;
  amount: string;
  token: string;
  hash: string;
  status: string;
}[] = [];

// CLI class
class CLI {
  private wallet: AgentWallet;
  private rl: readline.Interface;

  constructor(wallet: AgentWallet) {
    this.wallet = wallet;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private print(message: string, color?: keyof typeof colors): void {
    if (color) {
      console.log(`${colors[color]}${message}${colors.reset}`);
    } else {
      console.log(message);
    }
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  private async confirm(message: string): Promise<boolean> {
    const answer = await this.prompt(`${message} (y/n): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  async showBalance(): Promise<void> {
    this.print('\n--- Wallet Balances ---\n', 'cyan');
    this.print(`Address: ${this.wallet.address}\n`);

    // ETH balance
    try {
      const ethBalance = await this.wallet.getBalance();
      this.print(`ETH: ${ethBalance.formatted}`);
    } catch (err) {
      this.print(`ETH: Error - ${(err as Error).message}`, 'red');
    }

    this.print('');

    // Stablecoin balances
    this.print('Stablecoins:', 'dim');
    const balances = await this.wallet.getStablecoinBalances();
    for (const [symbol, balance] of Object.entries(balances)) {
      const value = parseFloat(balance.formatted);
      if (value > 0) {
        this.print(`  ${symbol}: ${balance.formatted}`, 'green');
      } else {
        this.print(`  ${symbol}: ${balance.formatted}`, 'dim');
      }
    }
    this.print('');
  }

  async showLimits(): Promise<void> {
    this.print('\n--- Spending Limits ---\n', 'cyan');

    const limits = this.wallet.getLimits();
    this.print(`Per-Transaction: ${limits.perTransaction.limit} ETH`);
    this.print(`Hourly: ${limits.hourly.used}/${limits.hourly.limit} ETH (${limits.hourly.remaining} remaining)`);
    this.print(`Daily: ${limits.daily.used}/${limits.daily.limit} ETH (${limits.daily.remaining} remaining)`);
    this.print(`Emergency Stop: ${limits.stopped ? 'ACTIVE' : 'inactive'}`);
    this.print('');
  }

  async send(to: string, amount: string, tokenSymbol: string): Promise<void> {
    const token = TOKENS[tokenSymbol.toUpperCase()];
    if (!token) {
      this.print(`Unknown token: ${tokenSymbol}. Supported: ${Object.keys(TOKENS).join(', ')}`, 'red');
      return;
    }

    this.print('\n--- Send Stablecoin ---\n', 'cyan');
    this.print(`To: ${to}`);
    this.print(`Amount: ${amount} ${token.symbol}`);
    this.print('');

    // Check balance
    try {
      const balance = await this.wallet.getStablecoinBalance(token);
      this.print(`Your balance: ${balance.formatted} ${token.symbol}`);

      const amountNum = parseFloat(amount);
      const balanceNum = parseFloat(balance.formatted);

      if (amountNum > balanceNum) {
        this.print(`Insufficient balance! Need ${amountNum - balanceNum} more ${token.symbol}`, 'red');
        return;
      }
    } catch (err) {
      this.print(`Error checking balance: ${(err as Error).message}`, 'red');
      return;
    }

    // Confirm
    this.print('');
    const confirmed = await this.confirm(`Send ${amount} ${token.symbol} to ${to}?`);

    if (!confirmed) {
      this.print('Transaction cancelled.', 'yellow');
      return;
    }

    // Execute
    this.print('\nSending...', 'dim');

    try {
      const result = await this.wallet.sendStablecoin({
        token,
        to,
        amount,
      });

      this.print(`\nSuccess!`, 'green');
      this.print(`TX: ${result.hash}`);
      this.print(result.summary);

      // Add to history
      history.push({
        timestamp: new Date(),
        type: 'send',
        to,
        amount,
        token: token.symbol,
        hash: result.hash,
        status: 'success',
      });
    } catch (err) {
      this.print(`\nFailed: ${(err as Error).message}`, 'red');

      history.push({
        timestamp: new Date(),
        type: 'send',
        to,
        amount,
        token: token.symbol,
        hash: 'n/a',
        status: 'failed',
      });
    }
    this.print('');
  }

  showHistory(): void {
    this.print('\n--- Transaction History ---\n', 'cyan');

    if (history.length === 0) {
      this.print('No transactions yet.', 'dim');
      return;
    }

    for (const tx of history) {
      const time = tx.timestamp.toLocaleTimeString();
      const status = tx.status === 'success' ? colors.green + '✓' : colors.red + '✗';
      this.print(
        `${time} ${status}${colors.reset} ${tx.type} ${tx.amount} ${tx.token} → ${tx.to}`
      );
      if (tx.hash !== 'n/a') {
        this.print(`         ${colors.dim}${tx.hash}${colors.reset}`);
      }
    }
    this.print('');
  }

  showHelp(): void {
    this.print('\n--- eth-agent CLI ---\n', 'cyan');
    this.print('Commands:');
    this.print('  balance                    Show ETH and stablecoin balances');
    this.print('  send <to> <amount> <token> Send stablecoins');
    this.print('  limits                     Show spending limits');
    this.print('  history                    Show transaction history');
    this.print('  help                       Show this help');
    this.print('  exit                       Exit the CLI');
    this.print('');
    this.print('Examples:');
    this.print('  send alice.eth 100 USDC');
    this.print('  send 0x123...abc 50.50 USDT');
    this.print('');
  }

  async interactive(): Promise<void> {
    this.print('\n╔═══════════════════════════════════════╗', 'blue');
    this.print('║         eth-agent CLI Tool            ║', 'blue');
    this.print('╚═══════════════════════════════════════╝', 'blue');
    this.print(`\nWallet: ${this.wallet.address}\n`);
    this.print('Type "help" for available commands.\n');

    while (true) {
      const input = await this.prompt(`${colors.cyan}eth-agent>${colors.reset} `);
      const [command, ...args] = input.trim().split(/\s+/);

      switch (command?.toLowerCase()) {
        case 'balance':
        case 'bal':
          await this.showBalance();
          break;

        case 'send':
          if (args.length < 3) {
            this.print('Usage: send <to> <amount> <token>', 'yellow');
            this.print('Example: send alice.eth 100 USDC');
          } else {
            await this.send(args[0], args[1], args[2]);
          }
          break;

        case 'limits':
        case 'limit':
          await this.showLimits();
          break;

        case 'history':
        case 'hist':
          this.showHistory();
          break;

        case 'help':
        case '?':
          this.showHelp();
          break;

        case 'exit':
        case 'quit':
        case 'q':
          this.print('\nGoodbye!', 'green');
          this.rl.close();
          return;

        case '':
          // Empty input, just show prompt again
          break;

        default:
          this.print(`Unknown command: ${command}. Type "help" for available commands.`, 'yellow');
      }
    }
  }

  close(): void {
    this.rl.close();
  }
}

async function main() {
  // Check for private key
  const privateKey = process.env.ETH_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: ETH_PRIVATE_KEY environment variable required');
    console.error('Usage: ETH_PRIVATE_KEY=0x... npx tsx examples/cli-tool.ts');
    process.exit(1);
  }

  // Create wallet
  const wallet = AgentWallet.create({
    privateKey,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',
    ...SafetyPresets.BALANCED,
  });

  const cli = new CLI(wallet);

  // Check for command-line arguments
  const [,, command, ...args] = process.argv;

  if (command) {
    // Non-interactive mode
    switch (command.toLowerCase()) {
      case 'balance':
        await cli.showBalance();
        break;
      case 'send':
        if (args.length < 3) {
          console.error('Usage: send <to> <amount> <token>');
          process.exit(1);
        }
        await cli.send(args[0], args[1], args[2]);
        break;
      case 'limits':
        await cli.showLimits();
        break;
      case 'history':
        cli.showHistory();
        break;
      case 'help':
        cli.showHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        cli.showHelp();
        process.exit(1);
    }
    cli.close();
  } else {
    // Interactive mode
    await cli.interactive();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

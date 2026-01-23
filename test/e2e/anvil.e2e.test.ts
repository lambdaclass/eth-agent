/**
 * End-to-end tests using Anvil (local Ethereum testnet)
 *
 * Anvil provides 10 pre-funded accounts with 10,000 ETH each.
 * These tests run against a real EVM, testing actual transaction signing,
 * RPC calls, and blockchain state.
 *
 * Run: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import {
  AgentWallet,
  SafetyPresets,
  RPCClient,
  EOA,
  ETH,
  GWEI,
  TransactionBuilder,
  formatETH,
  type Address,
  type Hex,
} from '../../src';

// Anvil default accounts (deterministic from default mnemonic)
const ANVIL_ACCOUNTS = {
  // Account #0
  account0: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex,
  },
  // Account #1
  account1: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex,
  },
  // Account #2
  account2: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as Hex,
  },
};

const ANVIL_RPC_URL = 'http://127.0.0.1:8545';
const ANVIL_CHAIN_ID = 31337;

let anvilProcess: ChildProcess | null = null;

async function startAnvil(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Start anvil with auto-mining (mines a block for each transaction)
    anvilProcess = spawn('anvil', ['--host', '127.0.0.1', '--port', '8545'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}` },
    });

    let started = false;

    anvilProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Listening on') && !started) {
        started = true;
        // Give it a moment to be fully ready
        setTimeout(resolve, 100);
      }
    });

    anvilProcess.stderr?.on('data', (data: Buffer) => {
      console.error('Anvil stderr:', data.toString());
    });

    anvilProcess.on('error', (error) => {
      reject(new Error(`Failed to start Anvil: ${error.message}`));
    });

    anvilProcess.on('exit', (code) => {
      if (!started) {
        reject(new Error(`Anvil exited with code ${code}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!started) {
        anvilProcess?.kill();
        reject(new Error('Anvil failed to start within 10 seconds'));
      }
    }, 10000);
  });
}

function stopAnvil(): void {
  if (anvilProcess) {
    anvilProcess.kill('SIGTERM');
    anvilProcess = null;
  }
}

describe('E2E: Anvil Local Testnet', () => {
  beforeAll(async () => {
    await startAnvil();
  }, 15000);

  afterAll(() => {
    stopAnvil();
  });

  describe('RPCClient', () => {
    it('connects to anvil and gets chain ID', async () => {
      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const chainId = await rpc.getChainId();
      expect(chainId).toBe(ANVIL_CHAIN_ID);
    });

    it('gets block number', async () => {
      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const blockNumber = await rpc.getBlockNumber();
      expect(blockNumber).toBeGreaterThanOrEqual(0);
    });

    it('gets balance of pre-funded account', async () => {
      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const balance = await rpc.getBalance(ANVIL_ACCOUNTS.account0.address);
      // Anvil accounts start with 10,000 ETH
      expect(balance).toBe(ETH(10000));
    });

    it('gets gas price', async () => {
      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const gasPrice = await rpc.getGasPrice();
      expect(gasPrice).toBeGreaterThan(0n);
    });
  });

  describe('EOA and TransactionBuilder', () => {
    it('creates account from private key', () => {
      const account = EOA.fromPrivateKey(ANVIL_ACCOUNTS.account0.privateKey);
      expect(account.address.toLowerCase()).toBe(ANVIL_ACCOUNTS.account0.address.toLowerCase());
    });

    it('sends ETH using low-level API', async () => {
      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const sender = EOA.fromPrivateKey(ANVIL_ACCOUNTS.account0.privateKey);
      const recipient = ANVIL_ACCOUNTS.account1.address;

      const balanceBefore = await rpc.getBalance(recipient);

      const nonce = await rpc.getTransactionCount(sender.address);
      const gasPrice = await rpc.getGasPrice();

      const signed = TransactionBuilder.create()
        .to(recipient)
        .value(ETH(1))
        .nonce(nonce)
        .chainId(ANVIL_CHAIN_ID)
        .gasLimit(21000n)
        .maxFeePerGas(gasPrice * 2n)
        .maxPriorityFeePerGas(GWEI(1))
        .sign(sender);

      const hash = await rpc.sendRawTransaction(signed.raw);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // Wait for transaction to be mined (confirmations=1, timeout=5000)
      const receipt = await rpc.waitForTransaction(hash, 1, 5000);
      expect(receipt.status).toBe('success');

      const balanceAfter = await rpc.getBalance(recipient);
      expect(balanceAfter).toBe(balanceBefore + ETH(1));
    });

    it('estimates gas for transfer', async () => {
      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const gas = await rpc.estimateGas({
        from: ANVIL_ACCOUNTS.account0.address,
        to: ANVIL_ACCOUNTS.account1.address,
        value: ETH(1),
      });
      expect(gas).toBe(21000n);
    });
  });

  describe('AgentWallet', () => {
    it('creates wallet and checks balance', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account1.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const balance = await wallet.getBalance();
      // Account 1 starts with 10,000 ETH
      expect(BigInt(balance.wei)).toBeGreaterThanOrEqual(ETH(9999)); // Allow for some spent gas
    });

    it('sends ETH with AgentWallet', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const balanceBefore = await rpc.getBalance(ANVIL_ACCOUNTS.account2.address);

      const result = await wallet.send({
        to: ANVIL_ACCOUNTS.account2.address,
        amount: '0.5 ETH',
      });

      expect(result.success).toBe(true);
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.summary).toContain('0.5 ETH');

      const balanceAfter = await rpc.getBalance(ANVIL_ACCOUNTS.account2.address);
      expect(balanceAfter).toBe(balanceBefore + ETH(0.5));
    });

    it('previews transaction before sending', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const preview = await wallet.preview({
        to: ANVIL_ACCOUNTS.account1.address,
        amount: '1 ETH',
      });

      expect(preview.canExecute).toBe(true);
      expect(preview.costs.value.wei).toBe(ETH(1));
      expect(preview.costs.gas.wei).toBeGreaterThan(0n);
      expect(preview.costs.total.wei).toBeGreaterThan(ETH(1));
    });

    it('respects spending limits', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
        limits: {
          perTransaction: '0.1 ETH',
        },
      });

      await expect(
        wallet.send({
          to: ANVIL_ACCOUNTS.account1.address,
          amount: '1 ETH',
        })
      ).rejects.toThrow(/limit/i);
    });

    it('uses safety presets', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
        ...SafetyPresets.CONSERVATIVE,
      });

      // CONSERVATIVE allows 0.01 ETH per transaction
      await expect(
        wallet.send({
          to: ANVIL_ACCOUNTS.account1.address,
          amount: '0.1 ETH',
        })
      ).rejects.toThrow(/limit/i);
    });

    it('handles approval flow', async () => {
      let approvalRequested = false;

      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
        onApprovalRequired: async (request) => {
          approvalRequested = true;
          expect(request.summary).toContain('ETH');
          return true; // Approve
        },
        approvalConfig: {
          requireApprovalWhen: {
            amountExceeds: '0.01 ETH',
          },
        },
      });

      const result = await wallet.send({
        to: ANVIL_ACCOUNTS.account1.address,
        amount: '0.05 ETH',
      });

      expect(approvalRequested).toBe(true);
      expect(result.success).toBe(true);
    });

    it('blocks transaction when approval denied', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
        onApprovalRequired: async () => false, // Deny
        approvalConfig: {
          requireApprovalWhen: {
            amountExceeds: '0.01 ETH',
          },
        },
      });

      await expect(
        wallet.send({
          to: ANVIL_ACCOUNTS.account1.address,
          amount: '0.05 ETH',
        })
      ).rejects.toThrow(/denied|rejected|not approved/i);
    });

    it('handles blocked addresses', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
        blockedAddresses: [
          { address: ANVIL_ACCOUNTS.account2.address, reason: 'Test blocked' },
        ],
      });

      await expect(
        wallet.send({
          to: ANVIL_ACCOUNTS.account2.address,
          amount: '0.01 ETH',
        })
      ).rejects.toThrow(/blocked/i);
    });

    it('tracks hourly spending', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account1.privateKey,
        rpcUrl: ANVIL_RPC_URL,
        limits: {
          perTransaction: '1 ETH',
          perHour: '0.1 ETH',
        },
      });

      // First transaction should succeed
      await wallet.send({
        to: ANVIL_ACCOUNTS.account2.address,
        amount: '0.05 ETH',
      });

      // Second transaction should exceed hourly limit
      await expect(
        wallet.send({
          to: ANVIL_ACCOUNTS.account2.address,
          amount: '0.1 ETH',
        })
      ).rejects.toThrow(/hourly.*limit/i);
    });
  });

  describe('safeSend with Result types', () => {
    it('returns Ok result on success', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const result = await wallet.safeSend({
        to: ANVIL_ACCOUNTS.account1.address,
        amount: '0.01 ETH',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(result.value.success).toBe(true);
      }
    });

    it('returns Err result on failure', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
        limits: {
          perTransaction: '0.001 ETH',
        },
      });

      const result = await wallet.safeSend({
        to: ANVIL_ACCOUNTS.account1.address,
        amount: '1 ETH',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toContain('LIMIT');
      }
    });
  });

  describe('Multiple transactions', () => {
    it('handles sequential transactions correctly', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account2.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const recipient = ANVIL_ACCOUNTS.account0.address;

      // Send 3 transactions in sequence
      for (let i = 0; i < 3; i++) {
        const result = await wallet.send({
          to: recipient,
          amount: '0.01 ETH',
        });
        expect(result.success).toBe(true);
      }

      // Verify nonce incremented correctly
      const rpc = RPCClient.connect(ANVIL_RPC_URL);
      const nonce = await rpc.getTransactionCount(ANVIL_ACCOUNTS.account2.address);
      expect(Number(nonce)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Error scenarios', () => {
    it('handles insufficient funds', async () => {
      // Create a new account with no funds
      const emptyAccount = EOA.generate();

      const wallet = AgentWallet.create({
        privateKey: emptyAccount.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      await expect(
        wallet.send({
          to: ANVIL_ACCOUNTS.account0.address,
          amount: '1 ETH',
        })
      ).rejects.toThrow(/insufficient|funds|balance/i);
    });

    it('handles invalid address', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      await expect(
        wallet.send({
          to: 'not-an-address',
          amount: '0.01 ETH',
        })
      ).rejects.toThrow(/invalid|address/i);
    });
  });
});

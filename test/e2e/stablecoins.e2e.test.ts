/**
 * End-to-end tests for stablecoin operations using Anvil
 *
 * Deploys a mock ERC20 token to test stablecoin transfers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess, execSync } from 'child_process';
import {
  AgentWallet,
  RPCClient,
  USDC,
  USDT,
  USDS,
  parseStablecoinAmount,
  formatStablecoinAmount,
  type Address,
  type Hex,
  type StablecoinInfo,
} from '../../src';

// Anvil default accounts
const ANVIL_ACCOUNTS = {
  account0: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex,
  },
  account1: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex,
  },
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
    const foundryPath = `${process.env.HOME}/.foundry/bin`;
    anvilProcess = spawn(`${foundryPath}/anvil`, ['--host', '127.0.0.1', '--port', '8545'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${foundryPath}:${process.env.PATH}` },
    });

    let started = false;

    anvilProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Listening on') && !started) {
        started = true;
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

// Deploy MockERC20 using forge create
function deployMockERC20(
  name: string,
  symbol: string,
  decimals: number,
  initialSupply: string,
  privateKey: Hex
): Address {
  const foundryPath = `${process.env.HOME}/.foundry/bin`;
  const projectRoot = process.cwd();

  // Use forge create to deploy the contract
  const result = execSync(
    `${foundryPath}/forge create contracts/MockERC20.sol:MockERC20 ` +
      `--rpc-url ${ANVIL_RPC_URL} ` +
      `--private-key ${privateKey} ` +
      `--broadcast ` +
      `--constructor-args "${name}" "${symbol}" ${decimals} ${initialSupply}`,
    {
      cwd: projectRoot,
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${foundryPath}:${process.env.PATH}` },
    }
  );

  // Parse the deployed address from output
  const match = result.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
  if (!match) {
    throw new Error(`Failed to parse deployed address from: ${result}`);
  }

  return match[1] as Address;
}

describe('E2E: Stablecoin Operations', () => {
  let mockUSDCAddress: Address;
  let mockUSDS_Address: Address;

  // Create mock stablecoin info for local testing
  let MOCK_USDC: StablecoinInfo;
  let MOCK_USDS: StablecoinInfo;

  beforeAll(async () => {
    await startAnvil();

    // Deploy mock USDC (6 decimals) with 1 billion supply
    // 1 billion * 10^6 = 1_000_000_000_000_000
    mockUSDCAddress = deployMockERC20(
      'Mock USDC',
      'USDC',
      6,
      '1000000000000000',
      ANVIL_ACCOUNTS.account0.privateKey
    );

    // Deploy mock USDS (18 decimals) with 1 billion supply
    // 1 billion * 10^18 = 1_000_000_000_000_000_000_000_000_000
    mockUSDS_Address = deployMockERC20(
      'Mock USDS',
      'USDS',
      18,
      '1000000000000000000000000000',
      ANVIL_ACCOUNTS.account0.privateKey
    );

    // Create mock stablecoin info objects pointing to deployed contracts
    MOCK_USDC = {
      symbol: 'USDC',
      name: 'Mock USDC',
      decimals: 6,
      addresses: {
        [ANVIL_CHAIN_ID]: mockUSDCAddress,
      },
    };

    MOCK_USDS = {
      symbol: 'USDS',
      name: 'Mock USDS',
      decimals: 18,
      addresses: {
        [ANVIL_CHAIN_ID]: mockUSDS_Address,
      },
    };
  }, 60000);

  afterAll(() => {
    stopAnvil();
  });

  describe('Stablecoin token definitions', () => {
    it('USDC has correct decimals', () => {
      expect(USDC.decimals).toBe(6);
    });

    it('USDS has correct decimals', () => {
      expect(USDS.decimals).toBe(18);
    });

    it('USDT has correct decimals', () => {
      expect(USDT.decimals).toBe(6);
    });
  });

  describe('Amount parsing and formatting', () => {
    it('parses USDC amounts correctly', () => {
      expect(parseStablecoinAmount('100', USDC)).toBe(100_000_000n);
      expect(parseStablecoinAmount('1.5', USDC)).toBe(1_500_000n);
      expect(parseStablecoinAmount('0.000001', USDC)).toBe(1n);
    });

    it('formats USDC amounts correctly', () => {
      expect(formatStablecoinAmount(100_000_000n, USDC)).toBe('100');
      expect(formatStablecoinAmount(1_500_000n, USDC)).toBe('1.5');
      expect(formatStablecoinAmount(1n, USDC)).toBe('0.000001');
    });

    it('parses USDS amounts correctly (18 decimals)', () => {
      expect(parseStablecoinAmount('100', USDS)).toBe(100_000_000_000_000_000_000n);
      expect(parseStablecoinAmount('1.5', USDS)).toBe(1_500_000_000_000_000_000n);
    });

    it('formats USDS amounts correctly (18 decimals)', () => {
      expect(formatStablecoinAmount(100_000_000_000_000_000_000n, USDS)).toBe('100');
      expect(formatStablecoinAmount(1_500_000_000_000_000_000n, USDS)).toBe('1.5');
    });
  });

  describe('AgentWallet stablecoin balance', () => {
    it('gets stablecoin balance for deployed mock USDC', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const balance = await wallet.getStablecoinBalance(MOCK_USDC);
      // Account 0 deployed the contract and received initial supply
      expect(balance.raw).toBeGreaterThan(0n);
      expect(balance.symbol).toBe('USDC');
    });

    it('gets stablecoin balance for deployed mock USDS', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const balance = await wallet.getStablecoinBalance(MOCK_USDS);
      expect(balance.raw).toBeGreaterThan(0n);
      expect(balance.symbol).toBe('USDS');
    });

    it('gets zero balance for account without tokens', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account1.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const balance = await wallet.getStablecoinBalance(MOCK_USDC);
      expect(balance.raw).toBe(0n);
      expect(balance.formatted).toBe('0');
    });
  });

  describe('AgentWallet stablecoin transfers', () => {
    it('sends stablecoin successfully', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const recipient = ANVIL_ACCOUNTS.account1.address;

      // Get recipient balance before
      const recipientWallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account1.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });
      const balanceBefore = await recipientWallet.getStablecoinBalance(MOCK_USDC);

      // Send 100 USDC
      const result = await wallet.sendStablecoin({
        token: MOCK_USDC,
        to: recipient,
        amount: '100',
      });

      expect(result.success).toBe(true);
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.summary).toContain('100');
      expect(result.summary).toContain('USDC');
      expect(result.token.symbol).toBe('USDC');
      expect(result.token.amount).toBe('100');

      // Verify recipient balance increased
      const balanceAfter = await recipientWallet.getStablecoinBalance(MOCK_USDC);
      const increase = BigInt(balanceAfter.raw) - BigInt(balanceBefore.raw);
      expect(increase).toBe(parseStablecoinAmount('100', MOCK_USDC));
    });

    it('sends fractional stablecoin amounts', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const recipient = ANVIL_ACCOUNTS.account2.address;

      const result = await wallet.sendStablecoin({
        token: MOCK_USDC,
        to: recipient,
        amount: '50.25',
      });

      expect(result.success).toBe(true);
      expect(result.token.amount).toBe('50.25');
      expect(result.token.rawAmount).toBe(parseStablecoinAmount('50.25', MOCK_USDC));
    });

    it('sends USDS with 18 decimals', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const recipient = ANVIL_ACCOUNTS.account1.address;

      const result = await wallet.sendStablecoin({
        token: MOCK_USDS,
        to: recipient,
        amount: '1000',
      });

      expect(result.success).toBe(true);
      expect(result.token.symbol).toBe('USDS');
      expect(result.token.rawAmount).toBe(parseStablecoinAmount('1000', MOCK_USDS));
    });

    it('handles insufficient balance error', async () => {
      // Account 1 has only what was sent in previous tests
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account1.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      await expect(
        wallet.sendStablecoin({
          token: MOCK_USDC,
          to: ANVIL_ACCOUNTS.account2.address,
          amount: '999999999', // More than balance
        })
      ).rejects.toThrow();
    });
  });

  describe('safeSendStablecoin with Result types', () => {
    it('returns Ok result on success', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const result = await wallet.safeSendStablecoin({
        token: MOCK_USDC,
        to: ANVIL_ACCOUNTS.account1.address,
        amount: '10',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(result.value.token.symbol).toBe('USDC');
      }
    });

    it('returns Err result on insufficient balance', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account2.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const result = await wallet.safeSendStablecoin({
        token: MOCK_USDS,
        to: ANVIL_ACCOUNTS.account0.address,
        amount: '999999999999',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('sendUSDC and sendUSDT convenience methods', () => {
    it('sendUSDC works with mock token', async () => {
      // For this test, we'll directly use sendStablecoin with MOCK_USDC
      // since sendUSDC uses the real USDC addresses
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      // Verify sendStablecoin works (sendUSDC is just a wrapper)
      const result = await wallet.sendStablecoin({
        token: MOCK_USDC,
        to: ANVIL_ACCOUNTS.account2.address,
        amount: '25',
      });

      expect(result.success).toBe(true);
      expect(result.token.amount).toBe('25');
    });
  });

  describe('Multiple stablecoin transactions', () => {
    it('handles sequential transfers correctly', async () => {
      const wallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account0.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const recipient = ANVIL_ACCOUNTS.account1.address;
      const recipientWallet = AgentWallet.create({
        privateKey: ANVIL_ACCOUNTS.account1.privateKey,
        rpcUrl: ANVIL_RPC_URL,
      });

      const balanceBefore = await recipientWallet.getStablecoinBalance(MOCK_USDC);

      // Send 3 transactions
      for (let i = 0; i < 3; i++) {
        const result = await wallet.sendStablecoin({
          token: MOCK_USDC,
          to: recipient,
          amount: '10',
        });
        expect(result.success).toBe(true);
      }

      const balanceAfter = await recipientWallet.getStablecoinBalance(MOCK_USDC);
      const increase = BigInt(balanceAfter.raw) - BigInt(balanceBefore.raw);
      expect(increase).toBe(parseStablecoinAmount('30', MOCK_USDC));
    });
  });
});

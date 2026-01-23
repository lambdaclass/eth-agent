/**
 * Integration tests for end-to-end wallet flows
 * Tests multiple components working together
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentWallet, createWallet } from '../../src/agent/wallet.js';
import { EOA } from '../../src/protocol/account.js';
import { RPCClient } from '../../src/protocol/rpc.js';
import { TransactionBuilder } from '../../src/protocol/transaction.js';
import { SessionKeyManager } from '../../src/protocol/session.js';
import { PriceOracle } from '../../src/protocol/price.js';
import { GasOracle } from '../../src/protocol/gas.js';
import { SimulationEngine } from '../../src/agent/simulation.js';
import { ENS } from '../../src/protocol/ens.js';
import { Contract } from '../../src/protocol/contract.js';
import { ETH, GWEI } from '../../src/core/units.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';

// Mock modules for wallet tests
vi.mock('../../src/protocol/rpc.js', () => ({
  RPCClient: vi.fn(),
}));

vi.mock('../../src/protocol/ens.js', () => ({
  ENS: vi.fn(),
  ENSResolver: vi.fn(),
}));

vi.mock('../../src/protocol/gas.js', () => ({
  GasOracle: vi.fn(),
}));

vi.mock('../../src/agent/simulation.js', () => ({
  SimulationEngine: vi.fn(),
}));

vi.mock('../../src/protocol/contract.js', () => ({
  Contract: vi.fn(),
  ERC20_ABI: [],
}));

describe('Wallet Integration', () => {
  const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex;
  const testAddress = '0xabcd567890123456789012345678901234567890' as Address;
  const testHash = '0x' + '11'.repeat(32) as Hash;

  let mockRpc: any;
  let mockEns: any;
  let mockGasOracle: any;
  let mockSimulation: any;
  let mockContract: any;

  beforeEach(() => {
    mockRpc = {
      getBalance: vi.fn().mockResolvedValue(ETH(10)),
      getTransactionCount: vi.fn().mockResolvedValue(5),
      getChainId: vi.fn().mockResolvedValue(1),
      sendRawTransaction: vi.fn().mockResolvedValue(testHash),
      waitForTransaction: vi.fn().mockResolvedValue({
        status: 'success',
        hash: testHash,
        gasUsed: 21000n,
        effectiveGasPrice: GWEI(20),
        blockNumber: 12345,
      }),
      getBlock: vi.fn().mockResolvedValue({
        baseFeePerGas: GWEI(10),
        number: 12345,
        timestamp: Math.floor(Date.now() / 1000),
      }),
      estimateGas: vi.fn().mockResolvedValue(21000n),
      call: vi.fn().mockResolvedValue('0x'),
      getGasPrice: vi.fn().mockResolvedValue(GWEI(20)),
    };
    vi.mocked(RPCClient).mockImplementation(() => mockRpc);

    mockEns = {
      resolve: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(ENS).mockImplementation(() => mockEns);

    mockGasOracle = {
      estimateGas: vi.fn().mockResolvedValue({
        gasLimit: 21000n,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
        estimatedCost: GWEI(30) * 21000n,
      }),
      getGasPrices: vi.fn().mockResolvedValue({
        slow: { maxFeePerGas: GWEI(20), maxPriorityFeePerGas: GWEI(1) },
        standard: { maxFeePerGas: GWEI(30), maxPriorityFeePerGas: GWEI(2) },
        fast: { maxFeePerGas: GWEI(50), maxPriorityFeePerGas: GWEI(3) },
      }),
    };
    vi.mocked(GasOracle).mockImplementation(() => mockGasOracle);

    mockSimulation = {
      simulate: vi.fn().mockResolvedValue({ success: true }),
      validate: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(SimulationEngine).mockImplementation(() => mockSimulation);

    mockContract = {
      read: vi.fn(),
      write: vi.fn(),
    };
    vi.mocked(Contract).mockImplementation(() => mockContract);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('complete send transaction flow', () => {
    it('sends ETH through wallet with all components', async () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const wallet = AgentWallet.create({
        account,
        rpcUrl: 'http://localhost:8545',
        approvalCallback: async () => true,
      });

      const result = await wallet.send({
        to: testAddress,
        amount: ETH(1),
      });

      expect(result.hash).toBe(testHash);
      expect(result.success).toBe(true);
      expect(mockRpc.getTransactionCount).toHaveBeenCalled();
      expect(mockRpc.sendRawTransaction).toHaveBeenCalled();
    });

    it('validates balance before sending', async () => {
      mockRpc.getBalance.mockResolvedValue(ETH(0.01));
      mockGasOracle.estimateGas.mockResolvedValue({
        gasLimit: 21000n,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
        estimatedCost: ETH(1), // Very high gas cost
      });

      const account = EOA.fromPrivateKey(testPrivateKey);
      const wallet = AgentWallet.create({
        account,
        rpcUrl: 'http://localhost:8545',
        approvalCallback: async () => true,
      });

      await expect(
        wallet.send({
          to: testAddress,
          value: ETH(1),
        })
      ).rejects.toThrow();
    });
  });

  describe('transaction builder with gas oracle', () => {
    it('builds transaction with gas oracle prices', async () => {
      const gasOracle = new GasOracle({
        rpc: mockRpc as RPCClient,
        chainId: 1,
      });

      const gasPrices = await gasOracle.getGasPrices();

      const builder = new TransactionBuilder()
        .to(testAddress)
        .value(ETH(1))
        .chainId(1)
        .nonce(5)
        .maxFeePerGas(gasPrices.standard.maxFeePerGas)
        .maxPriorityFeePerGas(gasPrices.standard.maxPriorityFeePerGas)
        .gasLimit(21000n);

      const tx = builder.build();

      expect(tx.to).toBe(testAddress);
      expect(tx.value).toBe(ETH(1));
      expect(tx.maxFeePerGas).toBe(GWEI(30));
    });
  });

  describe('session keys workflow', () => {
    it('creates and uses session keys', async () => {
      const manager = new SessionKeyManager(testPrivateKey);

      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
        allowedTargets: [testAddress],
      });

      const validation = manager.validateAction(session.publicKey, {
        target: testAddress,
        value: ETH(0.5),
      });

      expect(validation.valid).toBe(true);

      const signature = manager.signWithSession(session.publicKey, testHash, {
        target: testAddress,
        value: ETH(0.5),
      });

      expect(signature.signature).toMatch(/^0x/);
      expect(signature.sessionKey).toBe(session.publicKey);
    });

    it('respects session key limits', async () => {
      const manager = new SessionKeyManager(testPrivateKey);

      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(0.5),
        maxTransactions: 2,
      });

      // First transaction
      manager.signWithSession(session.publicKey, testHash, {
        target: testAddress,
        value: ETH(0.1),
      });

      // Second transaction
      manager.signWithSession(session.publicKey, testHash, {
        target: testAddress,
        value: ETH(0.1),
      });

      // Third transaction should fail
      expect(() =>
        manager.signWithSession(session.publicKey, testHash, {
          target: testAddress,
          value: ETH(0.1),
        })
      ).toThrow('Transaction limit reached');
    });
  });

  describe('price oracle integration', () => {
    it('formats transaction value in USD', async () => {
      const priceRpc = {
        call: vi.fn().mockResolvedValue(
          // Mock Chainlink response: $2500
          '0x' +
            '1'.padStart(64, '0') + // roundId
            (BigInt(250000000000)).toString(16).padStart(64, '0') + // answer ($2500 * 1e8)
            BigInt(Math.floor(Date.now() / 1000)).toString(16).padStart(64, '0') + // startedAt
            BigInt(Math.floor(Date.now() / 1000)).toString(16).padStart(64, '0') + // updatedAt
            '1'.padStart(64, '0') // answeredInRound
        ),
      } as any;

      const priceOracle = new PriceOracle({
        rpc: priceRpc,
        chainId: 1,
      });

      const result = await priceOracle.formatWithUSD(ETH(1));

      expect(result.eth).toBe('1');
      expect(result.usd).toBe(2500);
      expect(result.formatted).toBe('1 ETH ($2500.00)');
    });
  });

  describe('multi-chain configuration', () => {
    it('handles different chain configurations', async () => {
      const chains = [
        { chainId: 1, name: 'mainnet' },
        { chainId: 10, name: 'optimism' },
        { chainId: 42161, name: 'arbitrum' },
        { chainId: 8453, name: 'base' },
      ];

      for (const chain of chains) {
        mockRpc.getChainId.mockResolvedValue(chain.chainId);

        const account = EOA.fromPrivateKey(testPrivateKey);
        const wallet = AgentWallet.create({
          account,
          rpcUrl: 'http://localhost:8545',
          approvalCallback: async () => true,
        });

        const balance = await wallet.getBalance();
        expect(balance.wei).toBe(ETH(10));
      }
    });
  });

  describe('transaction retry flow', () => {
    it('handles multiple transactions', async () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const wallet = AgentWallet.create({
        account,
        rpcUrl: 'http://localhost:8545',
        approvalCallback: async () => true,
      });

      // First send
      const result1 = await wallet.send({
        to: testAddress,
        amount: ETH(1),
      });
      expect(result1.hash).toBe(testHash);

      // Second send
      mockRpc.getTransactionCount.mockResolvedValue(6); // Incremented nonce

      const result2 = await wallet.send({
        to: testAddress,
        amount: ETH(1),
      });
      expect(result2.hash).toBe(testHash);
    });
  });
});

describe('createWallet helper', () => {
  beforeEach(() => {
    const mockRpc = {
      getBalance: vi.fn().mockResolvedValue(ETH(5)),
      getTransactionCount: vi.fn().mockResolvedValue(0),
      getChainId: vi.fn().mockResolvedValue(1),
      sendRawTransaction: vi.fn().mockResolvedValue('0x' + '11'.repeat(32)),
      waitForTransaction: vi.fn().mockResolvedValue({ status: 'success' }),
      getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: GWEI(10) }),
      estimateGas: vi.fn().mockResolvedValue(21000n),
      call: vi.fn().mockResolvedValue('0x'),
      getGasPrice: vi.fn().mockResolvedValue(GWEI(20)),
    };
    vi.mocked(RPCClient).mockImplementation(() => mockRpc);

    vi.mocked(ENS).mockImplementation(() => ({
      resolve: vi.fn().mockResolvedValue(null),
    }) as any);

    vi.mocked(GasOracle).mockImplementation(() => ({
      estimateGas: vi.fn().mockResolvedValue({
        gasLimit: 21000n,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
        estimatedCost: GWEI(30) * 21000n,
      }),
    }) as any);

    vi.mocked(SimulationEngine).mockImplementation(() => ({
      simulate: vi.fn().mockResolvedValue({ success: true }),
      validate: vi.fn().mockResolvedValue(undefined),
    }) as any);

    vi.mocked(Contract).mockImplementation(() => ({
      read: vi.fn(),
      write: vi.fn(),
    }) as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates wallet with private key', async () => {
    const wallet = createWallet({
      privateKey: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex,
      rpcUrl: 'http://localhost:8545',
    });

    expect(wallet).toBeInstanceOf(AgentWallet);

    const balance = await wallet.getBalance();
    expect(balance.wei).toBe(ETH(5));
  });
});

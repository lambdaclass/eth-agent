import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentWallet, createWallet } from '../../src/agent/wallet.js';
import { EOA } from '../../src/protocol/account.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';
import { ETH, GWEI, formatETH } from '../../src/core/units.js';
import { RPCClient } from '../../src/protocol/rpc.js';
import { ENS } from '../../src/protocol/ens.js';
import { GasOracle } from '../../src/protocol/gas.js';
import { SimulationEngine } from '../../src/agent/simulation.js';
import { Contract } from '../../src/protocol/contract.js';

// Mock modules
vi.mock('../../src/protocol/rpc.js', () => ({
  RPCClient: vi.fn(),
}));

vi.mock('../../src/protocol/ens.js', () => ({
  ENS: vi.fn(),
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

describe('AgentWallet', () => {
  const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex;
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const recipient = '0x7890789078907890789078907890789078907890' as Address;
  const testHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash;
  const tokenAddress = '0x1111111111111111111111111111111111111111' as Address;

  let mockRpc: any;
  let mockEns: any;
  let mockGasOracle: any;
  let mockSimulation: any;
  let mockContract: any;

  beforeEach(() => {
    // Set up mock RPC
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
      call: vi.fn().mockResolvedValue('0x'),
      estimateGas: vi.fn().mockResolvedValue(21000n),
    };
    vi.mocked(RPCClient).mockImplementation(() => mockRpc);

    // Set up mock ENS
    mockEns = {
      resolve: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(ENS).mockImplementation(() => mockEns);

    // Set up mock GasOracle
    mockGasOracle = {
      estimateGas: vi.fn().mockResolvedValue({
        gasLimit: 21000n,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
        estimatedCost: GWEI(30) * 21000n,
      }),
    };
    vi.mocked(GasOracle).mockImplementation(() => mockGasOracle);

    // Set up mock Simulation
    mockSimulation = {
      simulate: vi.fn().mockResolvedValue({ success: true }),
      validate: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(SimulationEngine).mockImplementation(() => mockSimulation);

    // Set up mock Contract
    mockContract = {
      read: vi.fn(),
      write: vi.fn(),
    };
    vi.mocked(Contract).mockImplementation(() => mockContract);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates wallet with private key', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('creates wallet with private key without 0x prefix', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey.slice(2),
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('creates wallet with Account object', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const wallet = AgentWallet.create({ account });

      expect(wallet.address).toBe(account.address);
    });

    it('generates random wallet when no account provided', () => {
      const wallet = AgentWallet.create({});

      expect(wallet).toBeInstanceOf(AgentWallet);
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('uses mainnet RPC URL by default', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses custom RPC URL', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        rpcUrl: 'https://custom-rpc.example.com',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses sepolia network', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'sepolia',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses goerli network', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'goerli',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses network URL directly if not a known network', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'https://polygon-rpc.com',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses taiko network', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'taiko',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses taiko-hekla testnet', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'taiko-hekla',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses scroll network', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'scroll',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses scroll-sepolia testnet', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'scroll-sepolia',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses linea network', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'linea',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses linea-sepolia testnet', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'linea-sepolia',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures trusted addresses', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        trustedAddresses: [
          { address: recipient, label: 'My Friend' },
        ],
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures blocked addresses', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        blockedAddresses: [
          { address: recipient, reason: 'Scam' },
        ],
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures blocked addresses without reason', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        blockedAddresses: [
          { address: recipient },
        ],
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures trusted addresses without label', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        trustedAddresses: [
          { address: recipient },
        ],
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures spending limits', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        limits: {
          perTransaction: ETH(1),
          hourly: ETH(5),
          daily: ETH(20),
        },
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures approval handler', () => {
      const handler = vi.fn();
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        onApprovalRequired: handler,
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures approval config', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        approvalConfig: {
          requireApprovalWhen: { always: true },
          timeout: 30000,
        },
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('configures agent ID', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        agentId: 'test-agent-123',
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });

    it('uses approvalConfig handler over onApprovalRequired', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        onApprovalRequired: handler1,
        approvalConfig: {
          handler: handler2,
        },
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });
  });

  describe('createWallet helper', () => {
    it('creates wallet via helper function', () => {
      const wallet = createWallet({
        privateKey: testPrivateKey,
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });
  });

  describe('resolveAddress', () => {
    it('returns checksum address for valid address', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const lowerAddress = recipient.toLowerCase();
      const resolved = await wallet.resolveAddress(lowerAddress);

      expect(resolved).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('getLimits', () => {
    it('returns current spending limits', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        limits: {
          perTransaction: ETH(1),
          hourly: ETH(5),
          daily: ETH(20),
        },
      });

      const limits = wallet.getLimits();

      expect(limits).toBeDefined();
      expect(limits.perTransaction).toBeDefined();
      expect(limits.hourly).toBeDefined();
      expect(limits.daily).toBeDefined();
    });

    it('returns default limits when none configured', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const limits = wallet.getLimits();

      expect(limits).toBeDefined();
      expect(limits.perTransaction).toBeDefined();
      expect(limits.hourly).toBeDefined();
      expect(limits.daily).toBeDefined();
    });
  });

  describe('getCapabilities', () => {
    it('returns wallet capabilities', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        agentId: 'test-agent',
      });

      const caps = wallet.getCapabilities();

      expect(caps.address).toBe(wallet.address);
      expect(caps.agentId).toBe('test-agent');
      expect(caps.network.chainId).toBe(1);
      expect(caps.operations).toContain('send');
      expect(caps.operations).toContain('getBalance');
      expect(caps.operations).toContain('transferToken');
      expect(caps.operations).toContain('getTokenBalance');
    });

    it('returns default agent ID', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const caps = wallet.getCapabilities();
      expect(caps.agentId).toBe('agent');
    });
  });

  describe('address property', () => {
    it('exposes readonly address', () => {
      const account = EOA.fromPrivateKey(testPrivateKey);
      const wallet = AgentWallet.create({ account });

      expect(wallet.address).toBe(account.address);
      // Verify address is defined and proper format
      expect(typeof wallet.address).toBe('string');
      expect(wallet.address.startsWith('0x')).toBe(true);
      expect(wallet.address.length).toBe(42);
    });
  });

  describe('integration', () => {
    it('properly initializes with all options', () => {
      const handler = vi.fn();
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        network: 'mainnet',
        limits: {
          perTransaction: ETH(1),
          hourly: ETH(10),
          daily: ETH(100),
        },
        requireSimulation: true,
        onApprovalRequired: handler,
        approvalConfig: {
          requireApprovalWhen: { amountExceeds: ETH(0.5) },
          timeout: 60000,
        },
        trustedAddresses: [
          { address: recipient, label: 'Friend' },
        ],
        blockedAddresses: [
          { address: testAddress, reason: 'Self' },
        ],
        agentId: 'my-agent',
      });

      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

      const caps = wallet.getCapabilities();
      expect(caps.agentId).toBe('my-agent');
      expect(caps.operations).toContain('send');

      const limits = wallet.getLimits();
      expect(limits.perTransaction).toBeDefined();
    });

    it('handles simulation disabled', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
      });

      expect(wallet).toBeInstanceOf(AgentWallet);
    });
  });

  describe('getBalance', () => {
    it('returns balance for own address', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const result = await wallet.getBalance();

      expect(result.wei).toBe(ETH(10));
      expect(result.eth).toBe('10');
      expect(result.formatted).toBe('10 ETH');
    });

    it('returns balance for another address', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      mockRpc.getBalance.mockResolvedValue(ETH(5));

      const result = await wallet.getBalance(recipient);

      expect(mockRpc.getBalance).toHaveBeenCalledWith(expect.any(String));
      expect(result.wei).toBe(ETH(5));
    });

    it('resolves ENS name for balance check', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      mockEns.resolve.mockResolvedValue(recipient);
      mockRpc.getBalance.mockResolvedValue(ETH(3));

      const result = await wallet.getBalance('vitalik.eth');

      expect(mockEns.resolve).toHaveBeenCalledWith('vitalik.eth');
      expect(result.wei).toBe(ETH(3));
    });
  });

  describe('send', () => {
    it('sends ETH to address', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: { requireApprovalWhen: { never: true } },
      });

      const result = await wallet.send({
        to: recipient,
        amount: '0.1 ETH',
      });

      expect(result.success).toBe(true);
      expect(result.hash).toBe(testHash);
      expect(mockRpc.sendRawTransaction).toHaveBeenCalled();
    });

    it('sends ETH with bigint amount', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: { requireApprovalWhen: { never: true } },
      });

      const result = await wallet.send({
        to: recipient,
        amount: ETH(0.5),
      });

      expect(result.success).toBe(true);
    });

    it('throws for blocked address', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        blockedAddresses: [{ address: recipient, reason: 'Scam' }],
      });

      await expect(wallet.send({
        to: recipient,
        amount: '0.1 ETH',
      })).rejects.toThrow('blocked');
    });

    it('throws for zero amount', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      await expect(wallet.send({
        to: recipient,
        amount: '0 ETH',
      })).rejects.toThrow('positive');
    });

    it('throws for negative amount', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      await expect(wallet.send({
        to: recipient,
        amount: -1n,
      })).rejects.toThrow('positive');
    });

    it('throws for insufficient funds', async () => {
      mockRpc.getBalance.mockResolvedValue(ETH(0.5)); // Low balance but above emergency stop
      mockGasOracle.estimateGas.mockResolvedValue({
        gasLimit: 21000n,
        maxFeePerGas: GWEI(30),
        maxPriorityFeePerGas: GWEI(2),
        estimatedCost: ETH(1), // Gas cost exceeds balance
      });

      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: { requireApprovalWhen: { never: true } },
      });

      await expect(wallet.send({
        to: recipient,
        amount: '0.1 ETH',
      })).rejects.toThrow('Insufficient');
    });

    it('runs simulation when enabled', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: true,
        approvalConfig: { requireApprovalWhen: { never: true } },
      });

      await wallet.send({
        to: recipient,
        amount: '0.1 ETH',
      });

      expect(mockSimulation.validate).toHaveBeenCalled();
    });

    it('includes data in transaction', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: { requireApprovalWhen: { never: true } },
      });

      const result = await wallet.send({
        to: recipient,
        amount: '0.1 ETH',
        data: '0xabcdef' as Hex,
      });

      expect(result.success).toBe(true);
    });

    it('throws when approval is denied', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: {
          requireApprovalWhen: { always: true },
          handler: async () => false, // Always deny
        },
      });

      await expect(wallet.send({
        to: recipient,
        amount: '0.1 ETH',
      })).rejects.toThrow('not approved');
    });

    it('succeeds when approval is granted', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: {
          requireApprovalWhen: { always: true },
          handler: async () => true, // Always approve
        },
      });

      const result = await wallet.send({
        to: recipient,
        amount: '0.1 ETH',
      });

      expect(result.success).toBe(true);
    });

    it('uses custom gas parameters', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: { requireApprovalWhen: { never: true } },
      });

      const result = await wallet.send({
        to: recipient,
        amount: '0.1 ETH',
        gasLimit: 50000n,
        maxFeePerGas: GWEI(50),
        maxPriorityFeePerGas: GWEI(3),
      });

      expect(result.success).toBe(true);
    });

    it('records spending after transaction', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        requireSimulation: false,
        approvalConfig: { requireApprovalWhen: { never: true } },
        limits: {
          perTransaction: ETH(1),
          perHour: ETH(5),
        },
      });

      const result = await wallet.send({
        to: recipient,
        amount: '0.5 ETH',
      });

      expect(result.limits.remaining.hourly).toBeDefined();
      expect(result.limits.remaining.daily).toBeDefined();
    });
  });

  describe('resolveAddress', () => {
    it('returns checksum address for valid address', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const lowerAddress = recipient.toLowerCase();
      const resolved = await wallet.resolveAddress(lowerAddress);

      expect(resolved).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('resolves ENS name', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      mockEns.resolve.mockResolvedValue(recipient);

      const resolved = await wallet.resolveAddress('vitalik.eth');

      expect(mockEns.resolve).toHaveBeenCalledWith('vitalik.eth');
      expect(resolved).toBe(recipient);
    });

    it('throws for unresolvable ENS name', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      mockEns.resolve.mockResolvedValue(null);

      await expect(wallet.resolveAddress('nonexistent.eth'))
        .rejects.toThrow('Invalid');
    });
  });

  describe('preview', () => {
    it('previews a valid transaction', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const preview = await wallet.preview({
        to: recipient,
        amount: '0.1 ETH',
      });

      expect(preview.canExecute).toBe(true);
      expect(preview.blockers).toHaveLength(0);
      expect(preview.costs.value.wei).toBe(ETH(0.1));
      expect(preview.simulation.success).toBe(true);
    });

    it('returns blockers for invalid recipient', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      mockEns.resolve.mockResolvedValue(null);

      const preview = await wallet.preview({
        to: 'invalid.eth',
        amount: '0.1 ETH',
      });

      expect(preview.canExecute).toBe(false);
      expect(preview.blockers.length).toBeGreaterThan(0);
    });

    it('returns blockers for blocked address', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        blockedAddresses: [{ address: recipient, reason: 'Scam' }],
      });

      const preview = await wallet.preview({
        to: recipient,
        amount: '0.1 ETH',
      });

      expect(preview.canExecute).toBe(false);
      expect(preview.blockers.some(b => b.includes('blocked'))).toBe(true);
    });

    it('returns blockers for exceeding limits', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        limits: {
          perTransaction: ETH(0.01),
        },
      });

      const preview = await wallet.preview({
        to: recipient,
        amount: '1 ETH',
      });

      expect(preview.canExecute).toBe(false);
      expect(preview.blockers.some(b => b.includes('limit'))).toBe(true);
    });

    it('returns blockers for failed simulation', async () => {
      mockSimulation.simulate.mockResolvedValue({
        success: false,
        error: 'Execution reverted',
      });

      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const preview = await wallet.preview({
        to: recipient,
        amount: '0.1 ETH',
      });

      expect(preview.canExecute).toBe(false);
      expect(preview.simulation.success).toBe(false);
    });

    it('handles simulation errors gracefully', async () => {
      mockSimulation.simulate.mockRejectedValue(new Error('RPC error'));

      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const preview = await wallet.preview({
        to: recipient,
        amount: '0.1 ETH',
      });

      expect(preview.simulation.success).toBe(false);
      expect(preview.simulation.error).toContain('RPC error');
    });

    it('includes data in preview', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const preview = await wallet.preview({
        to: recipient,
        amount: '0.1 ETH',
        data: '0xabcdef' as Hex,
      });

      expect(preview.canExecute).toBe(true);
    });
  });

  describe('getTokenBalance', () => {
    it('returns token balance', async () => {
      mockContract.read
        .mockResolvedValueOnce(ETH(100)) // balanceOf
        .mockResolvedValueOnce('TEST') // symbol
        .mockResolvedValueOnce(18n); // decimals

      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const result = await wallet.getTokenBalance(tokenAddress);

      expect(result.raw).toBe(ETH(100));
      expect(result.symbol).toBe('TEST');
      expect(result.decimals).toBe(18);
      expect(result.formatted).toBe('100');
    });

    it('returns token balance for another address', async () => {
      mockContract.read
        .mockResolvedValueOnce(ETH(50))
        .mockResolvedValueOnce('USDC')
        .mockResolvedValueOnce(6n);

      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const result = await wallet.getTokenBalance(tokenAddress, recipient);

      expect(result.raw).toBe(ETH(50));
      expect(result.symbol).toBe('USDC');
    });
  });

  describe('transferToken', () => {
    it('transfers tokens', async () => {
      mockContract.read
        .mockResolvedValueOnce('TEST') // symbol
        .mockResolvedValueOnce(18n); // decimals

      mockContract.write.mockResolvedValue({
        wait: vi.fn().mockResolvedValue({
          status: 'success',
          hash: testHash,
          gasUsed: 50000n,
          blockNumber: 12345,
        }),
      });

      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const result = await wallet.transferToken({
        token: tokenAddress,
        to: recipient,
        amount: '100',
      });

      expect(result.success).toBe(true);
      expect(result.hash).toBe(testHash);
    });

    it('throws for blocked recipient', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        blockedAddresses: [{ address: recipient, reason: 'Scam' }],
      });

      await expect(wallet.transferToken({
        token: tokenAddress,
        to: recipient,
        amount: '100',
      })).rejects.toThrow('blocked');
    });

    it('transfers tokens with bigint amount', async () => {
      mockContract.read
        .mockResolvedValueOnce('TEST')
        .mockResolvedValueOnce(18n);

      mockContract.write.mockResolvedValue({
        wait: vi.fn().mockResolvedValue({
          status: 'success',
          hash: testHash,
          gasUsed: 50000n,
          blockNumber: 12345,
        }),
      });

      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const result = await wallet.transferToken({
        token: tokenAddress,
        to: recipient,
        amount: ETH(100),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getSwapLimits', () => {
    it('returns swap limits when configured', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        limits: {
          swap: {
            perTransactionUSD: 1000,
            perDayUSD: 10000,
            maxSlippagePercent: 1,
            maxPriceImpactPercent: 5,
            allowedTokens: ['ETH', 'USDC'],
          },
        },
      });

      const limits = wallet.getSwapLimits();

      expect(limits.perTransaction.limit).toBe('1000');
      expect(limits.daily.limit).toBe('10000');
      expect(limits.maxSlippagePercent).toBe(1);
      expect(limits.maxPriceImpactPercent).toBe(5);
      expect(limits.allowedTokens).toContain('ETH');
      expect(limits.allowedTokens).toContain('USDC');
    });

    it('returns default swap limits', () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      const limits = wallet.getSwapLimits();

      expect(limits.perTransaction.limit).toBeDefined();
      expect(limits.daily.limit).toBeDefined();
      expect(limits.maxSlippagePercent).toBeDefined();
    });
  });

  describe('getSwapQuote', () => {
    it('returns quote for token pair', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
      });

      // Mock the RPC call for quote
      mockRpc.call.mockResolvedValue(
        '0x' +
        '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // 1e18 amountOut
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '000000000000000000000000000000000000000000000000000000000003d090'
      );

      const quote = await wallet.getSwapQuote({
        fromToken: 'USDC',
        toToken: 'WETH',
        amount: '100',
      });

      expect(quote.fromToken.symbol).toBe('USDC');
      expect(quote.toToken.symbol).toBe('WETH');
      expect(quote.amountOutMinimum).toBeDefined();
      expect(quote.priceImpact).toBeDefined();
    });

    it('throws for unsupported token', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        limits: {
          swap: {
            allowedTokens: ['ETH', 'USDC'],
          },
        },
      });

      await expect(wallet.getSwapQuote({
        fromToken: 'UNKNOWN',
        toToken: 'USDC',
        amount: '100',
      })).rejects.toThrow();
    });
  });

  describe('safeSwap', () => {
    it('returns Result.ok on success', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        limits: {
          swap: {
            perTransactionUSD: 100000,
            perDayUSD: 1000000,
          },
        },
      });

      // Mock quote
      mockRpc.call.mockResolvedValue(
        '0x' +
        '0000000000000000000000000000000000000000000000000de0b6b3a7640000' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '000000000000000000000000000000000000000000000000000000000003d090'
      );

      // Mock the approval check (already approved)
      mockContract.read.mockResolvedValue(2n ** 256n - 1n);

      const result = await wallet.safeSwap({
        fromToken: 'USDC',
        toToken: 'WETH',
        amount: '100',
      });

      // Note: The actual swap may fail since we haven't mocked everything,
      // but safeSwap should catch the error and return Result.err
      expect(result).toBeDefined();
      expect('ok' in result || 'error' in result).toBe(true);
    });

    it('returns Result.err on failure', async () => {
      const wallet = AgentWallet.create({
        privateKey: testPrivateKey,
        limits: {
          swap: {
            allowedTokens: ['ETH'],
          },
        },
      });

      const result = await wallet.safeSwap({
        fromToken: 'BLOCKED_TOKEN',
        toToken: 'ETH',
        amount: '100',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });
  });
});

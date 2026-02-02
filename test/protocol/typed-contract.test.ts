import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTypedContract,
  createERC20Contract,
  createERC721Contract,
  ERC20_TYPED_ABI,
  ERC721_TYPED_ABI,
  type TypedContract,
} from '../../src/protocol/typed-contract.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';

// Mock the Contract class
vi.mock('../../src/protocol/contract.js', () => ({
  Contract: vi.fn().mockImplementation(() => ({
    read: vi.fn().mockImplementation((method: string) => {
      if (method === 'balanceOf') return Promise.resolve(1000n);
      if (method === 'name') return Promise.resolve('Test Token');
      if (method === 'symbol') return Promise.resolve('TEST');
      if (method === 'decimals') return Promise.resolve(18);
      if (method === 'totalSupply') return Promise.resolve(1000000n);
      if (method === 'allowance') return Promise.resolve(500n);
      if (method === 'ownerOf') return Promise.resolve('0x1234567890123456789012345678901234567890' as Address);
      if (method === 'getApproved') return Promise.resolve('0x0000000000000000000000000000000000000000' as Address);
      if (method === 'isApprovedForAll') return Promise.resolve(false);
      return Promise.resolve(undefined);
    }),
    write: vi.fn().mockResolvedValue({
      hash: '0xhash' as Hash,
      wait: vi.fn().mockResolvedValue({ status: 'success' }),
    }),
    queryEvents: vi.fn().mockResolvedValue([
      {
        args: { from: '0xfrom', to: '0xto', value: 100n },
        log: { blockNumber: 12345, transactionHash: '0xtxhash' as Hash },
      },
    ]),
    encodeFunction: vi.fn().mockReturnValue('0xencoded' as Hex),
  })),
}));

// Mock RPC Client
const createMockRpc = () => ({
  getChainId: vi.fn().mockResolvedValue(1),
  getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
  call: vi.fn().mockResolvedValue('0x'),
});

describe('createTypedContract', () => {
  let mockRpc: ReturnType<typeof createMockRpc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = createMockRpc();
  });

  const TEST_ABI = [
    {
      type: 'function',
      name: 'balanceOf',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'transfer',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
    },
    {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { name: 'from', type: 'address', indexed: true },
        { name: 'to', type: 'address', indexed: true },
        { name: 'value', type: 'uint256', indexed: false },
      ],
    },
  ] as const;

  describe('basic contract creation', () => {
    it('should create typed contract with address and ABI', () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      expect(contract.address).toBe(address);
      expect(contract.abi).toBe(TEST_ABI);
      expect(contract.read).toBeDefined();
      expect(contract.write).toBeDefined();
      expect(contract.events).toBeDefined();
      expect(contract.encode).toBeDefined();
    });
  });

  describe('read proxy', () => {
    it('should call contract read method', async () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      const balance = await contract.read.balanceOf(['0xuser']);
      expect(balance).toBe(1000n);
    });
  });

  describe('write proxy', () => {
    it('should call contract write method', async () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      const result = await contract.write.transfer(['0xto', 100n], { value: 0n });
      expect(result).toBeDefined();
      expect(result.hash).toBe('0xhash');
    });

    it('should pass options to write method', async () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      const result = await contract.write.transfer(['0xto', 100n], {
        value: 1000n,
        gasLimit: 50000n,
      });
      expect(result).toBeDefined();
    });
  });

  describe('events proxy', () => {
    it('should query contract events', async () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      const events = await contract.events.Transfer({
        fromBlock: 0,
        toBlock: 'latest',
      });

      expect(events).toHaveLength(1);
      expect(events[0].args).toBeDefined();
      expect(events[0].blockNumber).toBe(12345);
      expect(events[0].transactionHash).toBe('0xtxhash');
    });

    it('should query events without filter', async () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      const events = await contract.events.Transfer();
      expect(events).toHaveLength(1);
    });
  });

  describe('encode proxy', () => {
    it('should encode function call data', () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      const encoded = contract.encode.transfer(['0xto', 100n]);
      expect(encoded).toBe('0xencoded');
    });

    it('should encode read function for call', () => {
      const address = '0x1234567890123456789012345678901234567890' as Address;
      const contract = createTypedContract({
        address,
        abi: TEST_ABI,
        rpc: mockRpc as any,
      });

      const encoded = contract.encode.balanceOf(['0xaccount']);
      expect(encoded).toBe('0xencoded');
    });
  });
});

describe('createERC20Contract', () => {
  let mockRpc: ReturnType<typeof createMockRpc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = createMockRpc();
  });

  it('should create ERC20 contract with correct ABI', () => {
    const address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
    const contract = createERC20Contract({
      address,
      rpc: mockRpc as any,
    });

    expect(contract.address).toBe(address);
    expect(contract.abi).toBe(ERC20_TYPED_ABI);
  });

  it('should have all ERC20 read methods', async () => {
    const address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
    const contract = createERC20Contract({
      address,
      rpc: mockRpc as any,
    });

    // Test all read methods exist
    expect(contract.read.name).toBeDefined();
    expect(contract.read.symbol).toBeDefined();
    expect(contract.read.decimals).toBeDefined();
    expect(contract.read.totalSupply).toBeDefined();
    expect(contract.read.balanceOf).toBeDefined();
    expect(contract.read.allowance).toBeDefined();

    // Test they can be called
    const name = await contract.read.name([]);
    expect(name).toBe('Test Token');

    const balance = await contract.read.balanceOf(['0xaccount']);
    expect(balance).toBe(1000n);
  });

  it('should have all ERC20 write methods', () => {
    const address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
    const contract = createERC20Contract({
      address,
      rpc: mockRpc as any,
    });

    expect(contract.write.transfer).toBeDefined();
    expect(contract.write.approve).toBeDefined();
    expect(contract.write.transferFrom).toBeDefined();
  });

  it('should have ERC20 events', () => {
    const address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
    const contract = createERC20Contract({
      address,
      rpc: mockRpc as any,
    });

    expect(contract.events.Transfer).toBeDefined();
    expect(contract.events.Approval).toBeDefined();
  });
});

describe('createERC721Contract', () => {
  let mockRpc: ReturnType<typeof createMockRpc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = createMockRpc();
  });

  it('should create ERC721 contract with correct ABI', () => {
    const address = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' as Address;
    const contract = createERC721Contract({
      address,
      rpc: mockRpc as any,
    });

    expect(contract.address).toBe(address);
    expect(contract.abi).toBe(ERC721_TYPED_ABI);
  });

  it('should have all ERC721 read methods', async () => {
    const address = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' as Address;
    const contract = createERC721Contract({
      address,
      rpc: mockRpc as any,
    });

    expect(contract.read.balanceOf).toBeDefined();
    expect(contract.read.ownerOf).toBeDefined();
    expect(contract.read.getApproved).toBeDefined();
    expect(contract.read.isApprovedForAll).toBeDefined();

    const owner = await contract.read.ownerOf([1n]);
    expect(owner).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should have all ERC721 write methods', () => {
    const address = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' as Address;
    const contract = createERC721Contract({
      address,
      rpc: mockRpc as any,
    });

    expect(contract.write.safeTransferFrom).toBeDefined();
    expect(contract.write.transferFrom).toBeDefined();
    expect(contract.write.approve).toBeDefined();
    expect(contract.write.setApprovalForAll).toBeDefined();
  });

  it('should have ERC721 events', () => {
    const address = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' as Address;
    const contract = createERC721Contract({
      address,
      rpc: mockRpc as any,
    });

    expect(contract.events.Transfer).toBeDefined();
    expect(contract.events.Approval).toBeDefined();
  });
});

describe('ERC20_TYPED_ABI', () => {
  it('should have all standard ERC20 functions', () => {
    const functionNames = ERC20_TYPED_ABI
      .filter((item) => item.type === 'function')
      .map((item) => item.name);

    expect(functionNames).toContain('name');
    expect(functionNames).toContain('symbol');
    expect(functionNames).toContain('decimals');
    expect(functionNames).toContain('totalSupply');
    expect(functionNames).toContain('balanceOf');
    expect(functionNames).toContain('allowance');
    expect(functionNames).toContain('transfer');
    expect(functionNames).toContain('approve');
    expect(functionNames).toContain('transferFrom');
  });

  it('should have all standard ERC20 events', () => {
    const eventNames = ERC20_TYPED_ABI
      .filter((item) => item.type === 'event')
      .map((item) => item.name);

    expect(eventNames).toContain('Transfer');
    expect(eventNames).toContain('Approval');
  });
});

describe('ERC721_TYPED_ABI', () => {
  it('should have all standard ERC721 functions', () => {
    const functionNames = ERC721_TYPED_ABI
      .filter((item) => item.type === 'function')
      .map((item) => item.name);

    expect(functionNames).toContain('balanceOf');
    expect(functionNames).toContain('ownerOf');
    expect(functionNames).toContain('safeTransferFrom');
    expect(functionNames).toContain('transferFrom');
    expect(functionNames).toContain('approve');
    expect(functionNames).toContain('getApproved');
    expect(functionNames).toContain('setApprovalForAll');
    expect(functionNames).toContain('isApprovedForAll');
  });

  it('should have all standard ERC721 events', () => {
    const eventNames = ERC721_TYPED_ABI
      .filter((item) => item.type === 'event')
      .map((item) => item.name);

    expect(eventNames).toContain('Transfer');
    expect(eventNames).toContain('Approval');
  });
});

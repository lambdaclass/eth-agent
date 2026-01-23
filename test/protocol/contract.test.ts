import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Contract, createContract, ERC20_ABI, ERC721_ABI } from '../../src/protocol/contract.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { Account } from '../../src/protocol/account.js';
import type { Address, Hash, Hex, ABI, Log } from '../../src/core/types.js';
import { GWEI } from '../../src/core/units.js';

describe('Contract', () => {
  const contractAddress = '0x1234567890123456789012345678901234567890' as Address;
  const userAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
  const testHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash;

  const testABI: ABI = [
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
      type: 'function',
      name: 'getMultiple',
      inputs: [],
      outputs: [
        { name: 'a', type: 'uint256' },
        { name: 'b', type: 'string' },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'noReturn',
      inputs: [],
      outputs: [],
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
  ];

  let mockRpc: RPCClient;
  let mockAccount: Account;

  beforeEach(() => {
    mockRpc = {
      call: vi.fn(),
      estimateGas: vi.fn(),
      getTransactionCount: vi.fn(),
      getChainId: vi.fn(),
      sendRawTransaction: vi.fn(),
      waitForTransaction: vi.fn(),
      getBlock: vi.fn(),
      getGasPrice: vi.fn(),
      getFeeHistory: vi.fn(),
      getLogs: vi.fn(),
    } as unknown as RPCClient;

    mockAccount = {
      address: userAddress,
      publicKey: '0x04' + '1234567890abcdef'.repeat(8) as Hex,
      sign: vi.fn().mockReturnValue({
        r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        s: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
        v: 27,
        yParity: 0,
      }),
      signMessage: vi.fn().mockReturnValue({
        r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        s: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
        v: 27,
        yParity: 0,
      }),
    } as unknown as Account;
  });

  describe('constructor', () => {
    it('creates contract instance', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      expect(contract).toBeInstanceOf(Contract);
      expect(contract.address).toBe(contractAddress);
      expect(contract.abi).toBe(testABI);
    });

    it('creates contract with account', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        account: mockAccount,
      });

      expect(contract).toBeInstanceOf(Contract);
    });
  });

  describe('createContract', () => {
    it('creates contract via helper function', () => {
      const contract = createContract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      expect(contract).toBeInstanceOf(Contract);
    });
  });

  describe('read', () => {
    it('calls view function', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' as Hex);

      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const result = await contract.read<bigint>('balanceOf', [userAddress]);

      expect(result).toBe(1000000000000000000n);
      expect(mockRpc.call).toHaveBeenCalledWith(
        expect.objectContaining({
          to: contractAddress,
          data: expect.any(String),
        }),
        'latest'
      );
    });

    it('throws on unknown function', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      await expect(contract.read('unknownFunction')).rejects.toThrow('Function not found');
    });

    it('returns undefined for void function', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x' as Hex);

      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const result = await contract.read('noReturn');

      expect(result).toBeUndefined();
    });

    it('returns array for multiple outputs', async () => {
      // Encoded (123, "hello")
      vi.mocked(mockRpc.call).mockResolvedValue(
        '0x000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000568656c6c6f000000000000000000000000000000000000000000000000000000' as Hex
      );

      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const result = await contract.read<[bigint, string]>('getMultiple');

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(123n);
      expect(result[1]).toBe('hello');
    });

    it('accepts call options', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000001' as Hex);

      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      await contract.read('balanceOf', [userAddress], {
        from: userAddress,
        value: 1000n,
        blockTag: 100,
      });

      expect(mockRpc.call).toHaveBeenCalledWith(
        expect.objectContaining({
          from: userAddress,
          value: 1000n,
        }),
        100
      );
    });
  });

  describe('write', () => {
    beforeEach(() => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({ baseFeePerGas: GWEI(20), number: 100 } as any);
      vi.mocked(mockRpc.estimateGas).mockResolvedValue(50000n);
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(30));
      vi.mocked(mockRpc.getFeeHistory).mockResolvedValue({
        oldestBlock: 100,
        baseFeePerGas: [GWEI(20), GWEI(21)],
        gasUsedRatio: [0.5],
        reward: [[GWEI(2), GWEI(3), GWEI(5)]],
      });
      vi.mocked(mockRpc.getTransactionCount).mockResolvedValue(5);
      vi.mocked(mockRpc.getChainId).mockResolvedValue(1);
      vi.mocked(mockRpc.sendRawTransaction).mockResolvedValue(testHash);
      vi.mocked(mockRpc.waitForTransaction).mockResolvedValue({
        transactionHash: testHash,
        blockNumber: 100,
        gasUsed: 45000n,
        status: 'success',
        logs: [],
      } as any);
    });

    it('throws without account', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        // No account
      });

      await expect(contract.write('transfer', [userAddress, 1000n])).rejects.toThrow('Account required');
    });

    it('throws on unknown function', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        account: mockAccount,
      });

      await expect(contract.write('unknownFunction')).rejects.toThrow('Function not found');
    });

    it('writes to contract with EIP-1559', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        account: mockAccount,
      });

      const result = await contract.write('transfer', [userAddress, 1000n]);

      expect(result.hash).toBe(testHash);
      expect(mockRpc.sendRawTransaction).toHaveBeenCalled();
    });

    it('writes with legacy gas price', async () => {
      vi.mocked(mockRpc.getBlock).mockResolvedValue({ number: 100 } as any); // No baseFeePerGas
      vi.mocked(mockRpc.getGasPrice).mockResolvedValue(GWEI(30));

      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        account: mockAccount,
      });

      const result = await contract.write('transfer', [userAddress, 1000n]);

      expect(result.hash).toBe(testHash);
    });

    it('uses provided options', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        account: mockAccount,
      });

      const result = await contract.write('transfer', [userAddress, 1000n], {
        value: 1000n,
        gasLimit: 100000n,
        maxFeePerGas: GWEI(50),
        maxPriorityFeePerGas: GWEI(2),
        nonce: 10,
      });

      expect(result.hash).toBe(testHash);
    });

    it('waits for receipt', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        account: mockAccount,
      });

      const result = await contract.write('transfer', [userAddress, 1000n]);
      const receipt = await result.wait();

      expect(receipt.hash).toBe(testHash);
      expect(receipt.blockNumber).toBe(100);
      expect(receipt.gasUsed).toBe(45000n);
      expect(receipt.status).toBe('success');
    });

    it('waits with confirmations', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
        account: mockAccount,
      });

      const result = await contract.write('transfer', [userAddress, 1000n]);
      await result.wait(3);

      expect(mockRpc.waitForTransaction).toHaveBeenCalledWith(testHash, 3);
    });
  });

  describe('encodeFunction', () => {
    it('encodes function call', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const data = contract.encodeFunction('balanceOf', [userAddress]);

      expect(data.startsWith('0x70a08231')).toBe(true); // balanceOf selector
    });

    it('throws on unknown function', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      expect(() => contract.encodeFunction('unknownFunction')).toThrow('Function not found');
    });
  });

  describe('decodeResult', () => {
    it('decodes function result', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const result = contract.decodeResult<bigint>(
        'balanceOf',
        '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' as Hex
      );

      expect(result).toBe(1000000000000000000n);
    });

    it('decodes multiple outputs', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const result = contract.decodeResult<[bigint, string]>(
        'getMultiple',
        '0x000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000568656c6c6f000000000000000000000000000000000000000000000000000000' as Hex
      );

      expect(result).toHaveLength(2);
    });

    it('throws on unknown function', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      expect(() => contract.decodeResult('unknownFunction', '0x' as Hex)).toThrow('Function not found');
    });
  });

  describe('decodeEvent', () => {
    it('decodes event log', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const log: Log = {
        address: contractAddress,
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hash, // Transfer signature
          `0x000000000000000000000000${userAddress.slice(2)}` as Hash, // from (indexed)
          `0x000000000000000000000000${contractAddress.slice(2)}` as Hash, // to (indexed)
        ],
        data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' as Hex, // value
        blockNumber: 100,
        transactionHash: testHash,
        transactionIndex: 0,
        blockHash: testHash,
        logIndex: 0,
        removed: false,
      };

      const decoded = contract.decodeEvent('Transfer', log);

      expect(decoded['value']).toBe(1000000000000000000n);
    });

    it('throws on unknown event', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const log: Log = {
        address: contractAddress,
        topics: [testHash],
        data: '0x' as Hex,
        blockNumber: 100,
        transactionHash: testHash,
        transactionIndex: 0,
        blockHash: testHash,
        logIndex: 0,
        removed: false,
      };

      expect(() => contract.decodeEvent('UnknownEvent', log)).toThrow('Event not found');
    });
  });

  describe('getEventTopic', () => {
    it('returns event topic hash', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const topic = contract.getEventTopic('Transfer');

      expect(topic).toBe('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
    });

    it('throws on unknown event', () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      expect(() => contract.getEventTopic('UnknownEvent')).toThrow('Event not found');
    });
  });

  describe('queryEvents', () => {
    it('queries past events', async () => {
      vi.mocked(mockRpc.getLogs).mockResolvedValue([
        {
          address: contractAddress,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hash,
            `0x000000000000000000000000${userAddress.slice(2)}` as Hash,
            `0x000000000000000000000000${contractAddress.slice(2)}` as Hash,
          ],
          data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' as Hex,
          blockNumber: 100,
          transactionHash: testHash,
          transactionIndex: 0,
          blockHash: testHash,
          logIndex: 0,
          removed: false,
        },
      ]);

      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      const events = await contract.queryEvents('Transfer', {
        fromBlock: 90,
        toBlock: 110,
      });

      expect(events).toHaveLength(1);
      expect(events[0].args['value']).toBe(1000000000000000000n);
      expect(events[0].log.blockNumber).toBe(100);
    });

    it('throws on unknown event', async () => {
      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      await expect(contract.queryEvents('UnknownEvent')).rejects.toThrow('Event not found');
    });

    it('queries with indexed args filter', async () => {
      vi.mocked(mockRpc.getLogs).mockResolvedValue([]);

      const contract = new Contract({
        address: contractAddress,
        abi: testABI,
        rpc: mockRpc,
      });

      await contract.queryEvents('Transfer', {
        args: { from: userAddress },
      });

      expect(mockRpc.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          address: contractAddress,
          topics: expect.arrayContaining([
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            userAddress,
          ]),
        })
      );
    });
  });

  describe('ERC20_ABI', () => {
    it('has all required functions', () => {
      const functionNames = ERC20_ABI.filter((item) => item.type === 'function').map((item) => item.name);

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

    it('has Transfer and Approval events', () => {
      const eventNames = ERC20_ABI.filter((item) => item.type === 'event').map((item) => item.name);

      expect(eventNames).toContain('Transfer');
      expect(eventNames).toContain('Approval');
    });
  });

  describe('ERC721_ABI', () => {
    it('has all required functions', () => {
      const functionNames = ERC721_ABI.filter((item) => item.type === 'function').map((item) => item.name);

      expect(functionNames).toContain('balanceOf');
      expect(functionNames).toContain('ownerOf');
      expect(functionNames).toContain('safeTransferFrom');
      expect(functionNames).toContain('transferFrom');
      expect(functionNames).toContain('approve');
      expect(functionNames).toContain('setApprovalForAll');
      expect(functionNames).toContain('getApproved');
      expect(functionNames).toContain('isApprovedForAll');
    });

    it('has Transfer and Approval events', () => {
      const eventNames = ERC721_ABI.filter((item) => item.type === 'event').map((item) => item.name);

      expect(eventNames).toContain('Transfer');
      expect(eventNames).toContain('Approval');
    });
  });
});

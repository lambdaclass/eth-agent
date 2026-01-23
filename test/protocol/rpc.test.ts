import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RPCClient, RPCRequestError } from '../../src/protocol/rpc.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';

describe('RPCClient', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const testHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash;

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const mockFetch = (response: unknown, options?: { status?: number; error?: boolean }) => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      if (options?.error) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: options?.status ? options.status >= 200 && options.status < 300 : true,
        status: options?.status ?? 200,
        statusText: options?.status === 500 ? 'Internal Server Error' : 'OK',
        json: () => Promise.resolve(response),
      });
    });
  };

  describe('constructor', () => {
    it('creates client from URL string', () => {
      const client = new RPCClient('https://rpc.example.com');
      expect(client).toBeInstanceOf(RPCClient);
    });

    it('creates client from options object', () => {
      const client = new RPCClient({
        url: 'https://rpc.example.com',
        timeout: 5000,
        retries: 2,
        retryDelay: 500,
        headers: { 'X-Custom': 'header' },
      });
      expect(client).toBeInstanceOf(RPCClient);
    });

    it('creates client with defaults', () => {
      const client = new RPCClient({ url: 'https://rpc.example.com' });
      expect(client).toBeInstanceOf(RPCClient);
    });
  });

  describe('request ID', () => {
    it('starts with random offset to prevent collisions', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });

      const client1 = new RPCClient('https://rpc.example.com');
      const client2 = new RPCClient('https://rpc.example.com');

      await client1.getChainId();
      await client2.getChainId();

      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const body1 = JSON.parse(calls[0][1]?.body as string);
      const body2 = JSON.parse(calls[1][1]?.body as string);

      // IDs should be different between instances (random offset)
      expect(body1.id).not.toBe(body2.id);
    });

    it('increments ID for subsequent requests', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });

      const client = new RPCClient('https://rpc.example.com');

      await client.getChainId();
      await client.getChainId();
      await client.getChainId();

      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const id1 = JSON.parse(calls[0][1]?.body as string).id;
      const id2 = JSON.parse(calls[1][1]?.body as string).id;
      const id3 = JSON.parse(calls[2][1]?.body as string).id;

      // IDs should increment sequentially
      expect(id2).toBe(id1 + 1);
      expect(id3).toBe(id2 + 1);
    });

    it('uses IDs within safe integer range', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });

      const client = new RPCClient('https://rpc.example.com');
      await client.getChainId();

      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const id = JSON.parse(calls[0][1]?.body as string).id;

      // ID should be a positive integer within expected range
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(1_000_000_001); // random offset (up to 1B) + 1 increment
    });
  });

  describe('connect', () => {
    it('creates client via static method', () => {
      const client = RPCClient.connect('https://rpc.example.com');
      expect(client).toBeInstanceOf(RPCClient);
    });
  });

  describe('request', () => {
    it('sends JSON-RPC request', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });
      const client = new RPCClient('https://rpc.example.com');

      const result = await client.request<Hex>('eth_chainId');

      expect(result).toBe('0x1');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://rpc.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining('"method":"eth_chainId"'),
        })
      );
    });

    it('throws RPCRequestError on RPC error', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid request', data: 'details' },
      });
      const client = new RPCClient('https://rpc.example.com');

      await expect(client.request('eth_chainId')).rejects.toThrow(RPCRequestError);
      await expect(client.request('eth_chainId')).rejects.toThrow('Invalid request');
    });

    it('throws on HTTP error', async () => {
      mockFetch(null, { status: 500 });
      const client = new RPCClient({ url: 'https://rpc.example.com', retries: 0 });

      await expect(client.request('eth_chainId')).rejects.toThrow('HTTP 500');
    });

    it('retries on network error', async () => {
      const client = new RPCClient({ url: 'https://rpc.example.com', retries: 2, retryDelay: 10 });
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ jsonrpc: '2.0', id: callCount, result: '0x1' }),
        });
      });

      const result = await client.request<Hex>('eth_chainId');
      expect(result).toBe('0x1');
      expect(callCount).toBe(3);
    });

    it('does not retry on RPC error', async () => {
      const client = new RPCClient({ url: 'https://rpc.example.com', retries: 2, retryDelay: 10 });
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            id: callCount,
            error: { code: -32600, message: 'Invalid request' },
          }),
        });
      });

      await expect(client.request('eth_chainId')).rejects.toThrow(RPCRequestError);
      expect(callCount).toBe(1);
    });
  });

  describe('batch', () => {
    it('sends batch request', async () => {
      mockFetch([
        { jsonrpc: '2.0', id: 1, result: '0x1' },
        { jsonrpc: '2.0', id: 2, result: '0x100' },
      ]);
      const client = new RPCClient('https://rpc.example.com');

      const results = await client.batch([
        { method: 'eth_chainId' },
        { method: 'eth_blockNumber' },
      ]);

      expect(results).toEqual(['0x1', '0x100']);
    });

    it('throws on batch error', async () => {
      mockFetch([
        { jsonrpc: '2.0', id: 1, result: '0x1' },
        { jsonrpc: '2.0', id: 2, error: { code: -32600, message: 'Error' } },
      ]);
      const client = new RPCClient('https://rpc.example.com');

      await expect(client.batch([
        { method: 'eth_chainId' },
        { method: 'eth_blockNumber' },
      ])).rejects.toThrow(RPCRequestError);
    });
  });

  describe('getChainId', () => {
    it('returns chain ID', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });
      const client = new RPCClient('https://rpc.example.com');

      const chainId = await client.getChainId();
      expect(chainId).toBe(1);
    });
  });

  describe('getBlockNumber', () => {
    it('returns block number', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x100' });
      const client = new RPCClient('https://rpc.example.com');

      const blockNumber = await client.getBlockNumber();
      expect(blockNumber).toBe(256);
    });
  });

  describe('getGasPrice', () => {
    it('returns gas price', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x3b9aca00' });
      const client = new RPCClient('https://rpc.example.com');

      const gasPrice = await client.getGasPrice();
      expect(gasPrice).toBe(1000000000n);
    });
  });

  describe('getMaxPriorityFeePerGas', () => {
    it('returns priority fee', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x77359400' });
      const client = new RPCClient('https://rpc.example.com');

      const fee = await client.getMaxPriorityFeePerGas();
      expect(fee).toBe(2000000000n);
    });
  });

  describe('getBalance', () => {
    it('returns balance at latest block', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0xde0b6b3a7640000' });
      const client = new RPCClient('https://rpc.example.com');

      const balance = await client.getBalance(testAddress);
      expect(balance).toBe(1000000000000000000n);
    });

    it('returns balance at specific block', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0xde0b6b3a7640000' });
      const client = new RPCClient('https://rpc.example.com');

      await client.getBalance(testAddress, 100);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"0x64"'),
        })
      );
    });
  });

  describe('getTransactionCount', () => {
    it('returns nonce at pending block', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x5' });
      const client = new RPCClient('https://rpc.example.com');

      const nonce = await client.getTransactionCount(testAddress);
      expect(nonce).toBe(5);
    });

    it('returns nonce at specific block', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x3' });
      const client = new RPCClient('https://rpc.example.com');

      const nonce = await client.getTransactionCount(testAddress, 50);
      expect(nonce).toBe(3);
    });
  });

  describe('getCode', () => {
    it('returns contract code', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x6080604052' });
      const client = new RPCClient('https://rpc.example.com');

      const code = await client.getCode(testAddress);
      expect(code).toBe('0x6080604052');
    });
  });

  describe('getStorageAt', () => {
    it('returns storage value', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' });
      const client = new RPCClient('https://rpc.example.com');

      const value = await client.getStorageAt(testAddress, '0x0');
      expect(value).toBe('0x0000000000000000000000000000000000000000000000000000000000000001');
    });

    it('handles numeric position', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x01' });
      const client = new RPCClient('https://rpc.example.com');

      await client.getStorageAt(testAddress, 5);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"0x5"'),
        })
      );
    });
  });

  describe('getBlock', () => {
    it('returns block by number', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          number: '0x100',
          hash: testHash,
          parentHash: testHash,
          nonce: '0x0',
          sha3Uncles: testHash,
          logsBloom: '0x00',
          transactionsRoot: testHash,
          stateRoot: testHash,
          receiptsRoot: testHash,
          miner: testAddress,
          difficulty: '0x0',
          totalDifficulty: '0x0',
          extraData: '0x',
          size: '0x100',
          gasLimit: '0x1c9c380',
          gasUsed: '0x5208',
          timestamp: '0x60000000',
          transactions: [],
          uncles: [],
          baseFeePerGas: '0x3b9aca00',
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const block = await client.getBlock(256);

      expect(block).not.toBeNull();
      expect(block!.number).toBe(256);
      expect(block!.gasLimit).toBe(30000000n);
      expect(block!.baseFeePerGas).toBe(1000000000n);
    });

    it('returns null for non-existent block', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: null });
      const client = new RPCClient('https://rpc.example.com');

      const block = await client.getBlock(999999999);
      expect(block).toBeNull();
    });

    it('returns block with full transactions', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          number: '0x100',
          hash: testHash,
          parentHash: testHash,
          nonce: '0x0',
          sha3Uncles: testHash,
          logsBloom: '0x00',
          transactionsRoot: testHash,
          stateRoot: testHash,
          receiptsRoot: testHash,
          miner: testAddress,
          difficulty: '0x0',
          totalDifficulty: '0x0',
          extraData: '0x',
          size: '0x100',
          gasLimit: '0x1c9c380',
          gasUsed: '0x5208',
          timestamp: '0x60000000',
          transactions: [{
            hash: testHash,
            nonce: '0x0',
            from: testAddress,
            to: testAddress,
            value: '0x0',
            gas: '0x5208',
            input: '0x',
            v: '0x1b',
            r: testHash,
            s: testHash,
            type: '0x0',
          }],
          uncles: [],
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const block = await client.getBlock(256, true);

      expect(block).not.toBeNull();
      expect(Array.isArray(block!.transactions)).toBe(true);
      expect(typeof block!.transactions[0]).toBe('object');
    });
  });

  describe('getBlockByHash', () => {
    it('returns block by hash', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          number: '0x100',
          hash: testHash,
          parentHash: testHash,
          nonce: '0x0',
          sha3Uncles: testHash,
          logsBloom: '0x00',
          transactionsRoot: testHash,
          stateRoot: testHash,
          receiptsRoot: testHash,
          miner: testAddress,
          difficulty: '0x0',
          totalDifficulty: '0x0',
          extraData: '0x',
          size: '0x100',
          gasLimit: '0x1c9c380',
          gasUsed: '0x5208',
          timestamp: '0x60000000',
          transactions: [],
          uncles: [],
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const block = await client.getBlockByHash(testHash);
      expect(block).not.toBeNull();
      expect(block!.hash).toBe(testHash);
    });
  });

  describe('getTransaction', () => {
    it('returns transaction by hash', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          hash: testHash,
          nonce: '0x5',
          blockHash: testHash,
          blockNumber: '0x100',
          transactionIndex: '0x0',
          from: testAddress,
          to: testAddress,
          value: '0xde0b6b3a7640000',
          gas: '0x5208',
          gasPrice: '0x3b9aca00',
          input: '0x',
          v: '0x1b',
          r: testHash,
          s: testHash,
          type: '0x0',
          chainId: '0x1',
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const tx = await client.getTransaction(testHash);

      expect(tx).not.toBeNull();
      expect(tx!.hash).toBe(testHash);
      expect(tx!.nonce).toBe(5);
      expect(tx!.value).toBe(1000000000000000000n);
      expect(tx!.chainId).toBe(1);
    });

    it('returns transaction with EIP-1559 fields', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          hash: testHash,
          nonce: '0x5',
          from: testAddress,
          to: testAddress,
          value: '0x0',
          gas: '0x5208',
          maxFeePerGas: '0x77359400',
          maxPriorityFeePerGas: '0x3b9aca00',
          input: '0x',
          v: '0x1',
          r: testHash,
          s: testHash,
          type: '0x2',
          accessList: [{ address: testAddress, storageKeys: [testHash] }],
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const tx = await client.getTransaction(testHash);

      expect(tx).not.toBeNull();
      expect(tx!.maxFeePerGas).toBe(2000000000n);
      expect(tx!.maxPriorityFeePerGas).toBe(1000000000n);
      expect(tx!.accessList).toHaveLength(1);
    });
  });

  describe('getTransactionByHash', () => {
    it('is alias for getTransaction', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          hash: testHash,
          nonce: '0x0',
          from: testAddress,
          value: '0x0',
          gas: '0x5208',
          input: '0x',
          v: '0x1b',
          r: testHash,
          s: testHash,
          type: '0x0',
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const tx = await client.getTransactionByHash(testHash);
      expect(tx).not.toBeNull();
    });
  });

  describe('getTransactionReceipt', () => {
    it('returns receipt for mined transaction', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          transactionHash: testHash,
          transactionIndex: '0x0',
          blockHash: testHash,
          blockNumber: '0x100',
          from: testAddress,
          to: testAddress,
          cumulativeGasUsed: '0x5208',
          gasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00',
          logs: [],
          logsBloom: '0x00',
          status: '0x1',
          type: '0x2',
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const receipt = await client.getTransactionReceipt(testHash);

      expect(receipt).not.toBeNull();
      expect(receipt!.status).toBe('success');
      expect(receipt!.gasUsed).toBe(21000n);
      expect(receipt!.type).toBe('eip1559');
    });

    it('returns receipt with reverted status', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          transactionHash: testHash,
          transactionIndex: '0x0',
          blockHash: testHash,
          blockNumber: '0x100',
          from: testAddress,
          cumulativeGasUsed: '0x5208',
          gasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00',
          logs: [],
          logsBloom: '0x00',
          status: '0x0',
          type: '0x0',
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const receipt = await client.getTransactionReceipt(testHash);

      expect(receipt).not.toBeNull();
      expect(receipt!.status).toBe('reverted');
      expect(receipt!.type).toBe('legacy');
    });

    it('returns receipt with contract address', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          transactionHash: testHash,
          transactionIndex: '0x0',
          blockHash: testHash,
          blockNumber: '0x100',
          from: testAddress,
          contractAddress: testAddress,
          cumulativeGasUsed: '0x10000',
          gasUsed: '0x10000',
          effectiveGasPrice: '0x3b9aca00',
          logs: [],
          logsBloom: '0x00',
          status: '0x1',
          type: '0x1',
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const receipt = await client.getTransactionReceipt(testHash);

      expect(receipt).not.toBeNull();
      expect(receipt!.contractAddress).toBe(testAddress);
      expect(receipt!.type).toBe('eip2930');
    });

    it('parses logs in receipt', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          transactionHash: testHash,
          transactionIndex: '0x0',
          blockHash: testHash,
          blockNumber: '0x100',
          from: testAddress,
          to: testAddress,
          cumulativeGasUsed: '0x5208',
          gasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00',
          logs: [{
            address: testAddress,
            topics: [testHash],
            data: '0x1234',
            blockNumber: '0x100',
            transactionHash: testHash,
            transactionIndex: '0x0',
            blockHash: testHash,
            logIndex: '0x0',
            removed: false,
          }],
          logsBloom: '0x00',
          status: '0x1',
          type: '0x2',
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const receipt = await client.getTransactionReceipt(testHash);

      expect(receipt!.logs).toHaveLength(1);
      expect(receipt!.logs[0].address).toBe(testAddress);
      expect(receipt!.logs[0].blockNumber).toBe(256);
    });
  });

  describe('call', () => {
    it('calls contract read function', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000000000000000001' });
      const client = new RPCClient('https://rpc.example.com');

      const result = await client.call({ to: testAddress, data: '0x70a08231' as Hex });

      expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000000001');
    });

    it('includes from and value in call', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x' });
      const client = new RPCClient('https://rpc.example.com');

      await client.call({ to: testAddress, data: '0x1234' as Hex, from: testAddress, value: 1000n });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"from"'),
        })
      );
    });
  });

  describe('estimateGas', () => {
    it('estimates gas for transaction', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x5208' });
      const client = new RPCClient('https://rpc.example.com');

      const gas = await client.estimateGas({ to: testAddress, value: 1000n });

      expect(gas).toBe(21000n);
    });

    it('includes all optional params', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: '0x10000' });
      const client = new RPCClient('https://rpc.example.com');

      await client.estimateGas({
        to: testAddress,
        from: testAddress,
        data: '0x1234' as Hex,
        value: 1000n,
        gasPrice: 1000000000n,
        maxFeePerGas: 2000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });

      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  describe('sendRawTransaction', () => {
    it('sends signed transaction', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: testHash });
      const client = new RPCClient('https://rpc.example.com');

      const hash = await client.sendRawTransaction('0xf86c...' as Hex);

      expect(hash).toBe(testHash);
    });
  });

  describe('getLogs', () => {
    it('gets logs with address filter', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: [{
          address: testAddress,
          topics: [testHash],
          data: '0x1234',
          blockNumber: '0x100',
          transactionHash: testHash,
          transactionIndex: '0x0',
          blockHash: testHash,
          logIndex: '0x0',
          removed: false,
        }],
      });
      const client = new RPCClient('https://rpc.example.com');

      const logs = await client.getLogs({ address: testAddress });

      expect(logs).toHaveLength(1);
      expect(logs[0].address).toBe(testAddress);
      expect(logs[0].blockNumber).toBe(256);
    });

    it('gets logs with block range', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: [] });
      const client = new RPCClient('https://rpc.example.com');

      await client.getLogs({ fromBlock: 100, toBlock: 200, topics: [testHash] });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"fromBlock":"0x64"'),
        })
      );
    });

    it('gets logs with block hash', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: [] });
      const client = new RPCClient('https://rpc.example.com');

      await client.getLogs({ blockHash: testHash });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"blockHash"'),
        })
      );
    });
  });

  describe('getFeeHistory', () => {
    it('gets fee history', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          oldestBlock: '0x100',
          baseFeePerGas: ['0x3b9aca00', '0x3b9aca00'],
          gasUsedRatio: [0.5, 0.6],
          reward: [['0x3b9aca00'], ['0x3b9aca00']],
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const history = await client.getFeeHistory(2, 'latest', [50]);

      expect(history.oldestBlock).toBe(256);
      expect(history.baseFeePerGas).toHaveLength(2);
      expect(history.baseFeePerGas[0]).toBe(1000000000n);
      expect(history.reward).toBeDefined();
    });

    it('handles fee history without reward', async () => {
      mockFetch({
        jsonrpc: '2.0',
        id: 1,
        result: {
          oldestBlock: '0x100',
          baseFeePerGas: ['0x3b9aca00'],
          gasUsedRatio: [0.5],
        },
      });
      const client = new RPCClient('https://rpc.example.com');

      const history = await client.getFeeHistory(1, 100);

      expect(history.reward).toBeUndefined();
    });
  });

  describe('waitForTransaction', () => {
    it('returns receipt when mined', async () => {
      const client = new RPCClient('https://rpc.example.com');
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            id: callCount,
            result: callCount === 1 ? null : {
              transactionHash: testHash,
              transactionIndex: '0x0',
              blockHash: testHash,
              blockNumber: '0x100',
              from: testAddress,
              cumulativeGasUsed: '0x5208',
              gasUsed: '0x5208',
              effectiveGasPrice: '0x3b9aca00',
              logs: [],
              logsBloom: '0x00',
              status: '0x1',
              type: '0x2',
            },
          }),
        });
      });

      const receipt = await client.waitForTransaction(testHash, 1, 5000);

      expect(receipt.status).toBe('success');
    });

    it('waits for confirmations', async () => {
      const client = new RPCClient('https://rpc.example.com');
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const method = JSON.parse((globalThis.fetch as any).mock.calls[callCount - 1]?.[1]?.body || '{}').method;

        if (method === 'eth_getTransactionReceipt') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              jsonrpc: '2.0',
              id: callCount,
              result: {
                transactionHash: testHash,
                transactionIndex: '0x0',
                blockHash: testHash,
                blockNumber: '0x100',
                from: testAddress,
                cumulativeGasUsed: '0x5208',
                gasUsed: '0x5208',
                effectiveGasPrice: '0x3b9aca00',
                logs: [],
                logsBloom: '0x00',
                status: '0x1',
                type: '0x2',
              },
            }),
          });
        }

        // eth_blockNumber
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            id: callCount,
            result: '0x103', // 259, so 4 confirmations (259 - 256 + 1)
          }),
        });
      });

      const receipt = await client.waitForTransaction(testHash, 3, 5000);

      expect(receipt.status).toBe('success');
    });

    it('throws on timeout', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1, result: null });
      const client = new RPCClient('https://rpc.example.com');

      await expect(client.waitForTransaction(testHash, 1, 100)).rejects.toThrow('not mined within');
    });
  });

  describe('RPCRequestError', () => {
    it('creates error with code and data', () => {
      const error = new RPCRequestError(-32600, 'Invalid request', { detail: 'test' });

      expect(error.message).toBe('Invalid request');
      expect(error.code).toBe(-32600);
      expect(error.data).toEqual({ detail: 'test' });
      expect(error.name).toBe('RPCRequestError');
    });
  });
});

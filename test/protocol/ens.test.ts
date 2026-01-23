import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ENS, namehash, dnsEncode, isENSName, resolveAddress } from '../../src/protocol/ens.js';
import type { RPCClient } from '../../src/protocol/rpc.js';
import type { Address, Hash, Hex } from '../../src/core/types.js';

describe('ENS', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as Address;
  const resolverAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
  const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;

  let mockRpc: RPCClient;

  beforeEach(() => {
    mockRpc = {
      call: vi.fn(),
    } as unknown as RPCClient;
  });

  describe('resolve', () => {
    it('resolves ENS name to address', async () => {
      // First call: getResolver returns resolver address
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        // Second call: addr(bytes32) returns the address
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.resolve('vitalik.eth');

      expect(result).toBe(testAddress);
    });

    it('appends .eth if no TLD', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.resolve('vitalik');

      expect(result).toBe(testAddress);
    });

    it('returns null when no resolver', async () => {
      vi.mocked(mockRpc.call).mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.resolve('nonexistent.eth');

      expect(result).toBeNull();
    });

    it('returns null when resolver returns zero address', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce(`0x000000000000000000000000${zeroAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.resolve('test.eth');

      expect(result).toBeNull();
    });

    it('returns null when address lookup returns empty', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.resolve('test.eth');

      expect(result).toBeNull();
    });

    it('returns null when address lookup returns zero', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.resolve('test.eth');

      expect(result).toBeNull();
    });

    it('returns null on RPC error', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockRejectedValueOnce(new Error('RPC error'));

      const ens = new ENS(mockRpc);
      const result = await ens.resolve('error.eth');

      expect(result).toBeNull();
    });
  });

  describe('reverse', () => {
    it('reverse resolves address to name', async () => {
      // First call: getResolver for reverse record
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        // Second call: name(bytes32) returns the name
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000b766974616c696b2e657468000000000000000000000000000000000000000000' as Hex)
        // Third call: forward resolution check - getResolver
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        // Fourth call: forward resolution check - addr
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.reverse(testAddress);

      expect(result).toBe('vitalik.eth');
    });

    it('returns null when no resolver for reverse record', async () => {
      vi.mocked(mockRpc.call).mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.reverse(testAddress);

      expect(result).toBeNull();
    });

    it('returns null when name lookup returns empty', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.reverse(testAddress);

      expect(result).toBeNull();
    });

    it('returns null when forward resolution fails', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000b766974616c696b2e657468000000000000000000000000000000000000000000' as Hex)
        // Forward check returns different address
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x0000000000000000000000009999999999999999999999999999999999999999' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.reverse(testAddress);

      expect(result).toBeNull();
    });

    it('returns null on RPC error', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockRejectedValueOnce(new Error('RPC error'));

      const ens = new ENS(mockRpc);
      const result = await ens.reverse(testAddress);

      expect(result).toBeNull();
    });
  });

  describe('getText', () => {
    it('gets text record', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001368747470733a2f2f6769746875622e636f6d00000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getText('vitalik.eth', 'url');

      // The decoded string may have trailing null bytes from ABI decoding
      expect(result?.replace(/\0/g, '')).toBe('https://github.com');
    });

    it('appends .eth if no TLD', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000005746573743100000000000000000000000000000000000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getText('vitalik', 'key');

      expect(result).toBeTruthy();
    });

    it('returns null when no resolver', async () => {
      vi.mocked(mockRpc.call).mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getText('test.eth', 'url');

      expect(result).toBeNull();
    });

    it('returns null on empty response', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getText('test.eth', 'url');

      expect(result).toBeNull();
    });

    it('returns null on RPC error', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockRejectedValueOnce(new Error('RPC error'));

      const ens = new ENS(mockRpc);
      const result = await ens.getText('test.eth', 'url');

      expect(result).toBeNull();
    });
  });

  describe('getContentHash', () => {
    it('gets content hash', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000020e3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getContentHash('vitalik.eth');

      expect(result).toBeTruthy();
    });

    it('appends .eth if no TLD', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000005e301017012' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getContentHash('vitalik');

      expect(result).toBeTruthy();
    });

    it('returns null when no resolver', async () => {
      vi.mocked(mockRpc.call).mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getContentHash('test.eth');

      expect(result).toBeNull();
    });

    it('returns null on empty response', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce('0x' as Hex);

      const ens = new ENS(mockRpc);
      const result = await ens.getContentHash('test.eth');

      expect(result).toBeNull();
    });

    it('returns null on RPC error', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockRejectedValueOnce(new Error('RPC error'));

      const ens = new ENS(mockRpc);
      const result = await ens.getContentHash('test.eth');

      expect(result).toBeNull();
    });
  });

  describe('namehash', () => {
    it('computes namehash for empty string', () => {
      const hash = namehash('');
      expect(hash).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('computes namehash for eth', () => {
      const hash = namehash('eth');
      expect(hash).toBe('0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae');
    });

    it('computes namehash for foo.eth', () => {
      const hash = namehash('foo.eth');
      expect(hash).toBe('0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f');
    });

    it('normalizes to lowercase', () => {
      const hash1 = namehash('Foo.Eth');
      const hash2 = namehash('foo.eth');
      expect(hash1).toBe(hash2);
    });

    it('handles multiple subdomains', () => {
      const hash = namehash('sub.foo.eth');
      expect(hash).toHaveLength(66);
      expect(hash.startsWith('0x')).toBe(true);
    });

    it('skips empty labels', () => {
      const hash1 = namehash('.eth');
      const hash2 = namehash('eth');
      expect(hash1).toBe(hash2);
    });
  });

  describe('dnsEncode', () => {
    it('encodes simple name', () => {
      const encoded = dnsEncode('eth');
      // 3 (length) + 'eth' + 0 (terminator)
      expect(encoded).toBe('0x03657468' + '00');
    });

    it('encodes multi-part name', () => {
      const encoded = dnsEncode('foo.eth');
      // 3 (length) + 'foo' + 3 (length) + 'eth' + 0 (terminator)
      expect(encoded).toBe('0x03666f6f03657468' + '00');
    });

    it('throws on label too long', () => {
      const longLabel = 'a'.repeat(256);
      expect(() => dnsEncode(longLabel)).toThrow('Label too long');
    });
  });

  describe('isENSName', () => {
    it('returns true for valid ENS names', () => {
      expect(isENSName('vitalik.eth')).toBe(true);
      expect(isENSName('foo.eth')).toBe(true);
      expect(isENSName('sub.foo.eth')).toBe(true);
      expect(isENSName('test123.eth')).toBe(true);
      expect(isENSName('my-name.eth')).toBe(true);
      expect(isENSName('my_name.eth')).toBe(true);
    });

    it('returns true for international names', () => {
      expect(isENSName('日本語.eth')).toBe(true);
      expect(isENSName('émoji.eth')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isENSName('')).toBe(false);
    });

    it('returns false for names starting with dot', () => {
      expect(isENSName('.eth')).toBe(false);
    });

    it('returns false for names ending with dot', () => {
      expect(isENSName('eth.')).toBe(false);
    });

    it('returns false for names with empty labels', () => {
      expect(isENSName('foo..eth')).toBe(false);
    });

    it('returns false for names starting with hyphen', () => {
      expect(isENSName('-foo.eth')).toBe(false);
    });

    it('returns false for names ending with hyphen', () => {
      expect(isENSName('foo-.eth')).toBe(false);
    });

    it('returns false for names with invalid characters', () => {
      expect(isENSName('foo@bar.eth')).toBe(false);
      expect(isENSName('foo bar.eth')).toBe(false);
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns cached result on second call', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);

      // First call - makes RPC calls
      const result1 = await ens.resolve('vitalik.eth');
      expect(result1).toBe(testAddress);
      expect(mockRpc.call).toHaveBeenCalledTimes(2);

      // Second call - should use cache
      const result2 = await ens.resolve('vitalik.eth');
      expect(result2).toBe(testAddress);
      expect(mockRpc.call).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('normalizes name for caching (case-insensitive)', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);

      await ens.resolve('Vitalik.ETH');
      await ens.resolve('vitalik.eth');
      await ens.resolve('VITALIK.ETH');

      // All should use the same cache entry
      expect(mockRpc.call).toHaveBeenCalledTimes(2);
    });

    it('caches null results', async () => {
      vi.mocked(mockRpc.call).mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const ens = new ENS(mockRpc);

      const result1 = await ens.resolve('nonexistent.eth');
      expect(result1).toBeNull();
      expect(mockRpc.call).toHaveBeenCalledTimes(1);

      const result2 = await ens.resolve('nonexistent.eth');
      expect(result2).toBeNull();
      expect(mockRpc.call).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('skipCache bypasses cache', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);

      await ens.resolve('vitalik.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(2);

      // With skipCache, should make new RPC calls
      await ens.resolve('vitalik.eth', { skipCache: true });
      expect(mockRpc.call).toHaveBeenCalledTimes(4);
    });

    it('cache expires after TTL', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      // Create ENS with 1 second TTL
      const ens = new ENS(mockRpc, 100, 1000);

      await ens.resolve('vitalik.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(2);

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      // Should make new RPC calls
      await ens.resolve('vitalik.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(4);
    });

    it('clearCache() empties the cache', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);

      await ens.resolve('vitalik.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(2);

      ens.clearCache();

      // Should make new RPC calls after clear
      await ens.resolve('vitalik.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(4);
    });

    it('invalidateCache() removes specific entry', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);

      await ens.resolve('vitalik.eth');
      await ens.resolve('nick.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(4);

      // Invalidate only vitalik.eth
      const invalidated = ens.invalidateCache('vitalik.eth');
      expect(invalidated).toBe(true);

      // vitalik.eth should make new calls
      await ens.resolve('vitalik.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(6);

      // nick.eth should still be cached
      await ens.resolve('nick.eth');
      expect(mockRpc.call).toHaveBeenCalledTimes(6);
    });

    it('does not cache on RPC error (allows retry)', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockRejectedValueOnce(new Error('RPC error'))
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const ens = new ENS(mockRpc);

      // First call fails
      const result1 = await ens.resolve('vitalik.eth');
      expect(result1).toBeNull();
      expect(mockRpc.call).toHaveBeenCalledTimes(2);

      // Retry should make new calls (error not cached)
      const result2 = await ens.resolve('vitalik.eth');
      expect(result2).toBe(testAddress);
      expect(mockRpc.call).toHaveBeenCalledTimes(4);
    });
  });

  describe('resolveAddress', () => {
    it('returns address if already an address', async () => {
      const result = await resolveAddress(testAddress, mockRpc);
      expect(result).toBe(testAddress);
    });

    it('resolves ENS name', async () => {
      vi.mocked(mockRpc.call)
        .mockResolvedValueOnce('0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex)
        .mockResolvedValueOnce(`0x000000000000000000000000${testAddress.slice(2)}` as Hex);

      const result = await resolveAddress('vitalik.eth', mockRpc);
      expect(result).toBe(testAddress);
    });

    it('throws on failed resolution', async () => {
      vi.mocked(mockRpc.call).mockResolvedValueOnce('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      await expect(resolveAddress('nonexistent.eth', mockRpc)).rejects.toThrow('Failed to resolve ENS name');
    });
  });
});

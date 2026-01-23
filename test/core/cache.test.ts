import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from '../../src/core/cache.js';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('stores and retrieves values', () => {
      const cache = new LRUCache<string, number>();

      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('returns undefined for missing keys', () => {
      const cache = new LRUCache<string, number>();

      expect(cache.get('missing')).toBeUndefined();
    });

    it('has() returns true for existing keys', () => {
      const cache = new LRUCache<string, number>();

      cache.set('a', 1);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('delete() removes keys', () => {
      const cache = new LRUCache<string, number>();

      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);

      const deleted = cache.delete('a');
      expect(deleted).toBe(true);
      expect(cache.get('a')).toBeUndefined();
    });

    it('delete() returns false for missing keys', () => {
      const cache = new LRUCache<string, number>();

      const deleted = cache.delete('missing');
      expect(deleted).toBe(false);
    });

    it('clear() removes all entries', () => {
      const cache = new LRUCache<string, number>();

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('reports correct size', () => {
      const cache = new LRUCache<string, number>();

      expect(cache.size).toBe(0);

      cache.set('a', 1);
      expect(cache.size).toBe(1);

      cache.set('b', 2);
      expect(cache.size).toBe(2);

      cache.delete('a');
      expect(cache.size).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when at capacity', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size).toBe(3);

      // Adding a 4th entry should evict 'a' (oldest)
      cache.set('d', 4);

      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('accessing an entry makes it most recently used', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it most recently used
      cache.get('a');

      // Adding 'd' should evict 'b' (now oldest)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('updating an entry makes it most recently used', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to make it most recently used
      cache.set('a', 10);

      // Adding 'd' should evict 'b' (now oldest)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(10);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('TTL expiration', () => {
    it('returns undefined for expired entries', () => {
      const cache = new LRUCache<string, number>(100, 1000); // 1 second TTL

      cache.set('a', 1);

      expect(cache.get('a')).toBe(1);

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      expect(cache.get('a')).toBeUndefined();
    });

    it('has() returns false for expired entries', () => {
      const cache = new LRUCache<string, number>(100, 1000);

      cache.set('a', 1);

      expect(cache.has('a')).toBe(true);

      vi.advanceTimersByTime(1001);

      expect(cache.has('a')).toBe(false);
    });

    it('respects custom TTL per entry', () => {
      const cache = new LRUCache<string, number>(100, 10000); // 10 second default

      cache.set('short', 1, 1000);  // 1 second TTL
      cache.set('long', 2, 5000);   // 5 second TTL

      expect(cache.get('short')).toBe(1);
      expect(cache.get('long')).toBe(2);

      vi.advanceTimersByTime(1001);

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe(2);

      vi.advanceTimersByTime(4000);

      expect(cache.get('long')).toBeUndefined();
    });

    it('removes expired entries on access', () => {
      const cache = new LRUCache<string, number>(100, 1000);

      cache.set('a', 1);

      expect(cache.size).toBe(1);

      vi.advanceTimersByTime(1001);

      // Accessing expired entry removes it
      cache.get('a');

      expect(cache.size).toBe(0);
    });
  });

  describe('prune()', () => {
    it('removes all expired entries', () => {
      const cache = new LRUCache<string, number>(100, 5000);

      cache.set('a', 1, 1000);
      cache.set('b', 2, 2000);
      cache.set('c', 3, 10000);

      vi.advanceTimersByTime(2500);

      const pruned = cache.prune();

      expect(pruned).toBe(2);
      expect(cache.size).toBe(1);
      expect(cache.get('c')).toBe(3);
    });

    it('returns 0 when nothing to prune', () => {
      const cache = new LRUCache<string, number>(100, 10000);

      cache.set('a', 1);
      cache.set('b', 2);

      const pruned = cache.prune();

      expect(pruned).toBe(0);
      expect(cache.size).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles null values', () => {
      const cache = new LRUCache<string, null>();

      cache.set('a', null);

      expect(cache.get('a')).toBeNull();
      expect(cache.has('a')).toBe(true);
    });

    it('handles undefined values distinctly from missing', () => {
      // Note: This is tricky - undefined could mean "not found" or "value is undefined"
      // Our implementation returns undefined for both cases
      const cache = new LRUCache<string, string | undefined>();

      cache.set('a', undefined);

      // has() can distinguish
      expect(cache.has('a')).toBe(true);
    });

    it('handles complex keys', () => {
      const cache = new LRUCache<object, number>();
      const key1 = { id: 1 };
      const key2 = { id: 2 };

      cache.set(key1, 1);
      cache.set(key2, 2);

      expect(cache.get(key1)).toBe(1);
      expect(cache.get(key2)).toBe(2);

      // Different object reference won't match
      expect(cache.get({ id: 1 })).toBeUndefined();
    });

    it('handles maxSize of 1', () => {
      const cache = new LRUCache<string, number>(1);

      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);

      cache.set('b', 2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
    });
  });
});

/**
 * LRU Cache with TTL support
 * Used for caching ENS resolutions and other time-sensitive data
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Least Recently Used cache with optional TTL
 */
export class LRUCache<K, V> {
  private readonly cache = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;

  /**
   * Create a new LRU cache
   * @param maxSize Maximum number of entries (default: 100)
   * @param defaultTTL Default TTL in milliseconds (default: 300000 = 5 minutes)
   */
  constructor(maxSize = 100, defaultTTL = 300000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get a value from the cache
   * Returns undefined if not found or expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Optional TTL in milliseconds (uses default if not provided)
   */
  set(key: K, value: V, ttl?: number): void {
    // Delete if exists to update position
    this.cache.delete(key);

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries (including expired ones not yet cleaned)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove all expired entries
   * Call this periodically if you want proactive cleanup
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

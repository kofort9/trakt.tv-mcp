/**
 * LRU Cache with TTL for search results
 * Reduces API calls for frequently searched content
 */

export interface CacheEntry<T> {
  value: T;
  expiry: number; // Unix timestamp in ms
  hits: number; // Track cache hits for metrics
}

export interface CacheConfig {
  maxSize: number; // Maximum number of entries
  ttlMs: number; // Time to live in milliseconds
  enableMetrics: boolean; // Track cache performance
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * LRU (Least Recently Used) Cache implementation with TTL support
 *
 * Features:
 * - LRU eviction when cache is full
 * - TTL-based expiration
 * - Performance metrics tracking
 * - Thread-safe operations (single-threaded Node.js)
 * - Memory-bounded with configurable size
 */
export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private readonly config: CacheConfig;
  private metrics: CacheMetrics;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 500, // Default: cache 500 search results
      ttlMs: config.ttlMs || 3600000, // Default: 1 hour TTL
      enableMetrics: config.enableMetrics ?? true,
    };

    // Use Map which preserves insertion order (ES6+)
    // Oldest entries are at the beginning, newest at the end
    this.cache = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    };
  }

  /**
   * Get value from cache
   * Returns undefined if not found or expired
   * Updates access order (LRU) on hit
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.recordMiss();
      return undefined;
    }

    // Check expiry
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.metrics.size = this.cache.size;
      this.recordMiss();
      return undefined;
    }

    // Update access order (LRU) by moving to end
    // Delete and re-insert to move to end of Map
    this.cache.delete(key);
    this.cache.set(key, {
      ...entry,
      hits: entry.hits + 1,
    });

    this.recordHit();
    return entry.value;
  }

  /**
   * Set value in cache
   * Evicts LRU entry if at capacity
   */
  set(key: K, value: V): void {
    // Remove existing entry if present (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.config.maxSize) {
      // First key in Map is the oldest (LRU)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.metrics.evictions++;
      }
    }

    // Add new entry (inserted at end of Map)
    const entry: CacheEntry<V> = {
      value,
      expiry: Date.now() + this.config.ttlMs,
      hits: 0,
    };

    this.cache.set(key, entry);
    this.metrics.size = this.cache.size;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.metrics.size = this.cache.size;
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.metrics.size = this.cache.size;
    }
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.metrics.size = 0;
  }

  /**
   * Remove expired entries (cleanup)
   * Returns number of entries removed
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.metrics.size = this.cache.size;
    return removed;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: this.cache.size,
      hitRate: 0,
    };
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in cache (oldest first, LRU order)
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  private recordHit(): void {
    if (!this.config.enableMetrics) return;
    this.metrics.hits++;
    this.updateHitRate();
  }

  private recordMiss(): void {
    if (!this.config.enableMetrics) return;
    this.metrics.misses++;
    this.updateHitRate();
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }
}

/**
 * Generate cache key for search queries
 * Normalizes query to lowercase and trims whitespace
 */
export function generateSearchCacheKey(
  query: string,
  type?: 'show' | 'movie',
  year?: number
): string {
  const normalizedQuery = query.toLowerCase().trim();
  const typeStr = type || 'all';
  const yearStr = year ? `_${year}` : '';
  return `search:${typeStr}:${normalizedQuery}${yearStr}`;
}

/**
 * Generate cache key for episode lookups
 */
export function generateEpisodeCacheKey(
  showId: string | number,
  season: number,
  episode: number
): string {
  return `episode:${showId}:s${season}e${episode}`;
}

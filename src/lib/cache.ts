/**
 * LRU Cache with TTL for search results
 * Reduces API calls for frequently searched content
 */

export interface CacheEntry<T> {
  value: T;
  expiry: number; // Unix timestamp in ms
  hits: number; // Track cache hits for metrics
  size: number; // Estimated size in bytes
}

export interface CacheConfig {
  maxSize: number; // Maximum number of entries
  ttlMs: number; // Time to live in milliseconds
  enableMetrics: boolean; // Track cache performance
  maxMemoryBytes?: number; // Optional maximum memory limit in bytes
  memoryWarningThreshold?: number; // Percentage (0-1) of maxMemory to trigger warning
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  memoryUsage: number; // Current estimated memory usage in bytes
}

/**
 * Estimate size of value in bytes
 * Handles circular references by tracking visited objects
 * Limits depth to prevent stack overflow
 */
function estimateSize(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0
): number {
  // Prevent stack overflow for deeply nested objects
  if (depth > 20) return 0;

  if (value === null || value === undefined) return 0;
  if (typeof value === 'boolean') return 4;
  if (typeof value === 'number') return 8;
  // String length * 2 is a good estimate for UTF-16 strings in memory
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'symbol') return 0; // Symbols not counted
  if (typeof value === 'bigint') return 8; // Estimate 64-bit int
  if (typeof value === 'function') return 0; // Functions not counted

  if (typeof value === 'object') {
    if (seen.has(value as object)) return 0;
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.reduce(
        (acc, item) => acc + estimateSize(item, seen, depth + 1),
        0
      );
    }

    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [k, v]) => {
        return (
          acc + estimateSize(k, seen, depth + 1) + estimateSize(v, seen, depth + 1)
        );
      },
      0
    );
  }
  return 0;
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
  private hasWarnedMemory = false;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 500, // Default: cache 500 search results
      ttlMs: config.ttlMs || 3600000, // Default: 1 hour TTL
      enableMetrics: config.enableMetrics ?? true,
      maxMemoryBytes: config.maxMemoryBytes,
      memoryWarningThreshold: config.memoryWarningThreshold || 0.9, // Default: warn at 90%
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
      memoryUsage: 0,
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
      this.metrics.memoryUsage -= entry.size;
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
    const valueSize = estimateSize(value);

    // Remove existing entry if present (will be re-added at end)
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Check memory limits if configured
    if (this.config.maxMemoryBytes) {
      // If new item is larger than total max memory, don't cache it
      if (valueSize > this.config.maxMemoryBytes) {
        console.warn(
          `Cache item too large: ${valueSize} bytes > ${this.config.maxMemoryBytes} bytes`
        );
        return;
      }

      // Check warning threshold
      const threshold =
        this.config.maxMemoryBytes * (this.config.memoryWarningThreshold || 0.9);
      if (this.metrics.memoryUsage + valueSize > threshold) {
        if (!this.hasWarnedMemory) {
          console.warn(
            `Cache memory usage high: ${this.metrics.memoryUsage + valueSize}/${this.config.maxMemoryBytes} bytes`
          );
          this.hasWarnedMemory = true;
        }
      } else {
        this.hasWarnedMemory = false;
      }

      // Evict until we have space
      while (
        this.metrics.memoryUsage + valueSize > this.config.maxMemoryBytes &&
        this.cache.size > 0
      ) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.delete(firstKey);
          this.metrics.evictions++;
        }
      }
    }

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.config.maxSize) {
      // First key in Map is the oldest (LRU)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.delete(firstKey);
        this.metrics.evictions++;
      }
    }

    // Add new entry (inserted at end of Map)
    const entry: CacheEntry<V> = {
      value,
      expiry: Date.now() + this.config.ttlMs,
      hits: 0,
      size: valueSize,
    };

    this.cache.set(key, entry);
    this.metrics.size = this.cache.size;
    this.metrics.memoryUsage += valueSize;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiry) {
      this.metrics.memoryUsage -= entry.size;
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
    const entry = this.cache.get(key);
    if (entry) {
      this.metrics.memoryUsage -= entry.size;
    }

    const deleted = this.cache.delete(key);
    if (deleted) {
      this.metrics.size = this.cache.size;
      this.resetWarningFlag();
    }
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.metrics.size = 0;
    this.metrics.memoryUsage = 0;
    this.hasWarnedMemory = false;
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
        this.metrics.memoryUsage -= entry.size;
        this.cache.delete(key);
        removed++;
      }
    }

    this.metrics.size = this.cache.size;
    if (removed > 0) {
      this.resetWarningFlag();
    }
    return removed;
  }

  private resetWarningFlag(): void {
    if (!this.config.maxMemoryBytes) return;
    
    const threshold =
      this.config.maxMemoryBytes * (this.config.memoryWarningThreshold || 0.9);
    if (this.metrics.memoryUsage < threshold) {
      this.hasWarnedMemory = false;
    }
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
      memoryUsage: this.metrics.memoryUsage,
    };
  }

  /**
   * Get current memory usage in bytes
   */
  getCurrentMemoryUsage(): number {
    return this.metrics.memoryUsage;
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

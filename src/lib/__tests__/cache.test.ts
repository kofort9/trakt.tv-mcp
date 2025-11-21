import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache, generateSearchCacheKey, generateEpisodeCacheKey } from '../cache.js';

describe('LRUCache', () => {
  describe('basic operations', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
      cache = new LRUCache({
        maxSize: 3,
        ttlMs: 1000, // 1 second for testing
        enableMetrics: true,
      });
    });

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.size()).toBe(3);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return current size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });

    it('should return keys in LRU order (oldest first)', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const keys = cache.keys();
      expect(keys).toEqual(['key1', 'key2', 'key3']);
    });
  });

  describe('LRU eviction', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
      cache = new LRUCache({
        maxSize: 3,
        ttlMs: 10000, // Long TTL to test eviction without expiry
        enableMetrics: true,
      });
    });

    it('should evict LRU item when at capacity', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
      expect(cache.size()).toBe(3);
    });

    it('should update access order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1, making it most recently used
      cache.get('key1');

      // Add key4, should evict key2 (not key1)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined(); // Evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update existing key without eviction', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update key1 (should not cause eviction)
      cache.set('key1', 'updated');

      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBe('updated');
    });

    it('should track evictions in metrics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Evicts key1
      cache.set('key5', 'value5'); // Evicts key2

      const metrics = cache.getMetrics();
      expect(metrics.evictions).toBe(2);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const cache = new LRUCache<string, string>({
        maxSize: 10,
        ttlMs: 100, // 100ms TTL
        enableMetrics: true,
      });

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
    });

    it('should remove expired entries on has() check', async () => {
      const cache = new LRUCache<string, string>({
        maxSize: 10,
        ttlMs: 100,
        enableMetrics: true,
      });

      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(cache.has('key1')).toBe(false);
      expect(cache.size()).toBe(0); // Entry removed
    });

    it('should prune expired entries', async () => {
      const cache = new LRUCache<string, string>({
        maxSize: 10,
        ttlMs: 100,
        enableMetrics: true,
      });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.size()).toBe(3);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const pruned = cache.prune();
      expect(pruned).toBe(3);
      expect(cache.size()).toBe(0);
    });

    it('should prune only expired entries', async () => {
      const cache = new LRUCache<string, string>({
        maxSize: 10,
        ttlMs: 200, // 200ms TTL
        enableMetrics: true,
      });

      cache.set('key1', 'value1');

      await new Promise((resolve) => setTimeout(resolve, 100));

      cache.set('key2', 'value2'); // Added after 100ms, still fresh

      await new Promise((resolve) => setTimeout(resolve, 150)); // Total 250ms

      const pruned = cache.prune();
      expect(pruned).toBe(1); // Only key1 expired
      expect(cache.size()).toBe(1);
      expect(cache.get('key2')).toBe('value2');
    });

    it('should return 0 when pruning cache with no expired entries', () => {
      const cache = new LRUCache<string, string>({
        maxSize: 10,
        ttlMs: 10000, // Long TTL
        enableMetrics: true,
      });

      cache.set('key1', 'value1');

      const pruned = cache.prune();
      expect(pruned).toBe(0);
      expect(cache.size()).toBe(1);
    });
  });

  describe('metrics tracking', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
      cache = new LRUCache({
        maxSize: 10,
        ttlMs: 10000,
        enableMetrics: true,
      });
    });

    it('should track cache hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key1'); // Hit
      cache.get('key3'); // Miss

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(2);
      expect(metrics.hitRate).toBeCloseTo(0.5);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Hit
      cache.get('key3'); // Miss

      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBeCloseTo(0.75); // 3/4 = 0.75
    });

    it('should track cache size', () => {
      expect(cache.getMetrics().size).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.getMetrics().size).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.getMetrics().size).toBe(2);

      cache.delete('key1');
      expect(cache.getMetrics().size).toBe(1);
    });

    it('should track evictions', () => {
      const smallCache = new LRUCache<string, string>({
        maxSize: 2,
        ttlMs: 10000,
        enableMetrics: true,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      expect(smallCache.getMetrics().evictions).toBe(0);

      smallCache.set('key3', 'value3'); // Evicts key1
      expect(smallCache.getMetrics().evictions).toBe(1);

      smallCache.set('key4', 'value4'); // Evicts key2
      expect(smallCache.getMetrics().evictions).toBe(2);
    });

    it('should handle zero total requests for hit rate', () => {
      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBe(0);
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });

    it('should reset metrics', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key2');

      let metrics = cache.getMetrics();
      expect(metrics.hits).toBeGreaterThan(0);
      expect(metrics.misses).toBeGreaterThan(0);

      cache.resetMetrics();

      metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
      expect(metrics.hitRate).toBe(0);
      expect(metrics.size).toBe(1); // Size preserved
    });

    it('should not track metrics when disabled', () => {
      const noMetricsCache = new LRUCache<string, string>({
        maxSize: 10,
        ttlMs: 10000,
        enableMetrics: false,
      });

      noMetricsCache.set('key1', 'value1');
      noMetricsCache.get('key1');
      noMetricsCache.get('key2');

      const metrics = noMetricsCache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });

    it('should track entry hits', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // 1st hit
      cache.get('key1'); // 2nd hit
      cache.get('key1'); // 3rd hit

      // Internal entry should track hits
      // We verify this indirectly through the access pattern
      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(3);
    });
  });

  describe('complex data types', () => {
    it('should handle object values', () => {
      interface Movie {
        title: string;
        year: number;
      }

      const cache = new LRUCache<string, Movie>({
        maxSize: 10,
        ttlMs: 10000,
      });

      const movie: Movie = { title: 'The Matrix', year: 1999 };
      cache.set('matrix', movie);

      const retrieved = cache.get('matrix');
      expect(retrieved).toEqual(movie);
      expect(retrieved?.title).toBe('The Matrix');
    });

    it('should handle array values', () => {
      const cache = new LRUCache<string, number[]>({
        maxSize: 10,
        ttlMs: 10000,
      });

      cache.set('numbers', [1, 2, 3, 4, 5]);

      const retrieved = cache.get('numbers');
      expect(retrieved).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle numeric keys', () => {
      const cache = new LRUCache<number, string>({
        maxSize: 10,
        ttlMs: 10000,
      });

      cache.set(123, 'value123');
      cache.set(456, 'value456');

      expect(cache.get(123)).toBe('value123');
      expect(cache.get(456)).toBe('value456');
    });
  });

  describe('edge cases', () => {
    it('should handle empty cache operations', () => {
      const cache = new LRUCache<string, string>({
        maxSize: 10,
        ttlMs: 10000,
      });

      expect(cache.size()).toBe(0);
      expect(cache.get('key')).toBeUndefined();
      expect(cache.has('key')).toBe(false);
      expect(cache.delete('key')).toBe(false);
      expect(cache.prune()).toBe(0);
      expect(cache.keys()).toEqual([]);
    });

    it('should handle cache size of 1', () => {
      const cache = new LRUCache<string, string>({
        maxSize: 1,
        ttlMs: 10000,
      });

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      cache.set('key2', 'value2'); // Evicts key1
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('should handle rapid updates to same key', () => {
      const cache = new LRUCache<string, number>({
        maxSize: 3,
        ttlMs: 10000,
      });

      for (let i = 0; i < 100; i++) {
        cache.set('counter', i);
      }

      expect(cache.get('counter')).toBe(99);
      expect(cache.size()).toBe(1); // Only one key
    });

    it('should handle default configuration', () => {
      const cache = new LRUCache<string, string>();

      // Should use default values
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      const metrics = cache.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('memory bounds', () => {
    it('should not exceed max size', () => {
      const cache = new LRUCache<string, string>({
        maxSize: 100,
        ttlMs: 10000,
      });

      // Add 200 entries
      for (let i = 0; i < 200; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      expect(cache.size()).toBe(100);
      expect(cache.getMetrics().size).toBe(100);

      // First 100 entries should be evicted
      expect(cache.get('key0')).toBeUndefined();
      expect(cache.get('key99')).toBeUndefined();

      // Last 100 entries should exist
      expect(cache.get('key100')).toBe('value100');
      expect(cache.get('key199')).toBe('value199');
    });

    it('should maintain bounded memory with large dataset', () => {
      const cache = new LRUCache<string, string>({
        maxSize: 500, // As per spec
        ttlMs: 3600000, // 1 hour
      });

      // Simulate realistic usage
      for (let i = 0; i < 1000; i++) {
        cache.set(`search:movie:title${i}`, JSON.stringify({ title: `Movie ${i}` }));
      }

      expect(cache.size()).toBe(500);
      expect(cache.getMetrics().evictions).toBe(500); // 1000 - 500
    });
  });

  describe('memory tracking', () => {
    it('should track memory usage for string values', () => {
      const cache = new LRUCache<string, string>({ enableMetrics: true });
      // "value" is 5 chars * 2 bytes = 10 bytes
      cache.set('key', 'value');
      expect(cache.getCurrentMemoryUsage()).toBe(10);
    });

    it('should track memory usage for number values', () => {
      const cache = new LRUCache<string, number>({ enableMetrics: true });
      cache.set('key', 123);
      expect(cache.getCurrentMemoryUsage()).toBe(8);
    });

    it('should track memory usage for object values', () => {
      const cache = new LRUCache<string, object>({ enableMetrics: true });
      // {a: 1} -> key "a" (2 bytes) + value 1 (8 bytes) = 10 bytes
      cache.set('key', { a: 1 });
      expect(cache.getCurrentMemoryUsage()).toBe(10);
    });

    it('should update memory usage on overwrite', () => {
      const cache = new LRUCache<string, string>({ enableMetrics: true });
      cache.set('key', 'short'); // 10 bytes
      expect(cache.getCurrentMemoryUsage()).toBe(10);

      cache.set('key', 'longer value'); // 12 chars * 2 = 24 bytes
      expect(cache.getCurrentMemoryUsage()).toBe(24);
    });

    it('should decrease memory usage on delete', () => {
      const cache = new LRUCache<string, string>({ enableMetrics: true });
      cache.set('key', 'value');
      expect(cache.getCurrentMemoryUsage()).toBe(10);

      cache.delete('key');
      expect(cache.getCurrentMemoryUsage()).toBe(0);
    });

    it('should decrease memory usage on expiry', async () => {
      const cache = new LRUCache<string, string>({
        ttlMs: 10,
        enableMetrics: true,
      });
      cache.set('key', 'value');

      await new Promise((resolve) => setTimeout(resolve, 20));

      cache.get('key'); // triggers expiry check
      expect(cache.getCurrentMemoryUsage()).toBe(0);
    });

    it('should enforce max memory limit', () => {
      const cache = new LRUCache<string, string>({
        maxMemoryBytes: 20,
        enableMetrics: true,
      });

      cache.set('k1', '12345'); // 10 bytes
      cache.set('k2', '12345'); // 10 bytes -> Total 20 bytes
      expect(cache.size()).toBe(2);

      cache.set('k3', '12345'); // 10 bytes -> Total 30 bytes (exceeds 20)
      // Should evict k1 (LRU)

      expect(cache.size()).toBe(2);
      expect(cache.has('k1')).toBe(false);
      expect(cache.has('k2')).toBe(true);
      expect(cache.has('k3')).toBe(true);
      expect(cache.getCurrentMemoryUsage()).toBe(20);
    });

    it('should reject item larger than max memory', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cache = new LRUCache<string, string>({
        maxMemoryBytes: 10,
        enableMetrics: true,
      });

      // "large value" is > 10 bytes
      cache.set('k1', 'large value');

      expect(cache.size()).toBe(0);
      expect(cache.getCurrentMemoryUsage()).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache item too large')
      );
      consoleSpy.mockRestore();
    });

    it('should warn when memory threshold exceeded', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cache = new LRUCache<string, string>({
        maxMemoryBytes: 100,
        memoryWarningThreshold: 0.5, // Warn at 50 bytes
        enableMetrics: true,
      });

      cache.set('k1', '1'.repeat(20)); // 40 bytes (20 chars * 2)
      expect(consoleSpy).not.toHaveBeenCalled();

      cache.set('k2', '1'.repeat(10)); // 20 bytes. Total 60 bytes. > 50 bytes.
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache memory usage high')
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('generateSearchCacheKey', () => {
  it('should generate key for movie search', () => {
    const key = generateSearchCacheKey('The Matrix', 'movie');
    expect(key).toBe('search:movie:the matrix');
  });

  it('should generate key for show search', () => {
    const key = generateSearchCacheKey('Breaking Bad', 'show');
    expect(key).toBe('search:show:breaking bad');
  });

  it('should generate key for generic search', () => {
    const key = generateSearchCacheKey('Dune');
    expect(key).toBe('search:all:dune');
  });

  it('should include year in key', () => {
    const key = generateSearchCacheKey('Dune', 'movie', 2021);
    expect(key).toBe('search:movie:dune_2021');
  });

  it('should normalize to lowercase', () => {
    const key1 = generateSearchCacheKey('The MATRIX', 'movie');
    const key2 = generateSearchCacheKey('the matrix', 'movie');
    expect(key1).toBe(key2);
    expect(key1).toBe('search:movie:the matrix');
  });

  it('should trim whitespace', () => {
    const key = generateSearchCacheKey('  Breaking Bad  ', 'show');
    expect(key).toBe('search:show:breaking bad');
  });

  it('should handle empty strings', () => {
    const key = generateSearchCacheKey('');
    expect(key).toBe('search:all:');
  });

  it('should create different keys for different parameters', () => {
    const key1 = generateSearchCacheKey('Dune', 'movie');
    const key2 = generateSearchCacheKey('Dune', 'movie', 2021);
    const key3 = generateSearchCacheKey('Dune', 'show');

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key2).not.toBe(key3);
  });
});

describe('generateEpisodeCacheKey', () => {
  it('should generate key for episode lookup with string ID', () => {
    const key = generateEpisodeCacheKey('breaking-bad', 1, 1);
    expect(key).toBe('episode:breaking-bad:s1e1');
  });

  it('should generate key for episode lookup with numeric ID', () => {
    const key = generateEpisodeCacheKey(12345, 3, 7);
    expect(key).toBe('episode:12345:s3e7');
  });

  it('should handle double-digit seasons and episodes', () => {
    const key = generateEpisodeCacheKey('show-id', 12, 24);
    expect(key).toBe('episode:show-id:s12e24');
  });

  it('should create different keys for different episodes', () => {
    const key1 = generateEpisodeCacheKey('show', 1, 1);
    const key2 = generateEpisodeCacheKey('show', 1, 2);
    const key3 = generateEpisodeCacheKey('show', 2, 1);

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key2).not.toBe(key3);
  });
});

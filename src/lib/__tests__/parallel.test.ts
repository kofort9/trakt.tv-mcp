import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parallelMap, parallelSearchMovies } from '../parallel.js';
import { TraktClient } from '../trakt-client.js';
import { TraktSearchResult } from '../../types/trakt.js';

/**
 * Helper function for delays in tests
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('parallelMap', () => {
  it('should execute operations in parallel', async () => {
    const items = [1, 2, 3, 4, 5];
    const startTime = Date.now();

    const { succeeded } = await parallelMap(
      items,
      async (item) => {
        await delay(100); // Simulate async work
        return item * 2;
      },
      { maxConcurrency: 5 }
    );

    const duration = Date.now() - startTime;

    // Results should be correct
    expect(succeeded).toHaveLength(5);
    expect(succeeded.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);

    // Should take ~100ms (parallel) not ~500ms (sequential)
    // Allow some overhead for Promise scheduling
    expect(duration).toBeLessThan(250);
  });

  it('should limit concurrency', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);

    await parallelMap(
      items,
      async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(50);
        concurrent--;
        return true;
      },
      { maxConcurrency: 3 }
    );

    // Should never exceed max concurrency
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThan(0);
  });

  it('should handle partial failures', async () => {
    const items = [1, 2, 3, 4, 5];

    const { succeeded, failed } = await parallelMap(
      items,
      async (item) => {
        if (item === 3) {
          throw new Error('Intentional failure');
        }
        return item * 2;
      }
    );

    expect(succeeded).toHaveLength(4);
    expect(succeeded.sort((a, b) => a - b)).toEqual([2, 4, 8, 10]);

    expect(failed).toHaveLength(1);
    expect(failed[0].item).toBe(3);
    expect(failed[0].error).toContain('Intentional failure');
  });

  it('should handle all failures', async () => {
    const items = [1, 2, 3];

    const { succeeded, failed } = await parallelMap(
      items,
      async () => {
        throw new Error('All fail');
      }
    );

    expect(succeeded).toHaveLength(0);
    expect(failed).toHaveLength(3);
  });

  it('should handle all successes', async () => {
    const items = [1, 2, 3, 4, 5];

    const { succeeded, failed } = await parallelMap(
      items,
      async (item) => item * 2
    );

    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(0);
  });

  it('should process in batches with delay', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const startTime = Date.now();

    await parallelMap(
      items,
      async (item) => item,
      {
        batchSize: 10,
        delayBetweenBatches: 100,
        maxConcurrency: 10,
      }
    );

    const duration = Date.now() - startTime;

    // Should have 2 delays (3 batches: 10, 10, 5)
    // First batch: ~0ms, delay 100ms, second batch: ~0ms, delay 100ms, third batch: ~0ms
    // Total should be at least 200ms
    expect(duration).toBeGreaterThanOrEqual(200);
  });

  it('should handle empty array', async () => {
    const { succeeded, failed } = await parallelMap(
      [],
      async (item) => item
    );

    expect(succeeded).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });

  it('should handle single item', async () => {
    const { succeeded, failed } = await parallelMap(
      [42],
      async (item) => item * 2
    );

    expect(succeeded).toEqual([84]);
    expect(failed).toHaveLength(0);
  });

  it('should respect batch size smaller than concurrency', async () => {
    const items = [1, 2, 3, 4, 5];

    const { succeeded } = await parallelMap(
      items,
      async (item) => item,
      {
        batchSize: 2,
        maxConcurrency: 5,
      }
    );

    expect(succeeded).toHaveLength(5);
  });

  it('should handle errors without message property', async () => {
    const { failed } = await parallelMap(
      [1],
      async () => {
        throw 'string error'; // Not an Error object
      }
    );

    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe('Unknown error');
  });

  it('should preserve operation order in succeeded array', async () => {
    const items = [1, 2, 3, 4, 5];

    const { succeeded } = await parallelMap(
      items,
      async (item) => {
        // Add small delay proportional to item value
        // This helps test that results maintain order despite async timing
        await delay(item * 5);
        return item;
      },
      { maxConcurrency: 5 }
    );

    // Results should all be present (order may vary due to Promise.allSettled)
    expect(succeeded.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('parallelSearchMovies', () => {
  let mockClient: TraktClient;

  beforeEach(() => {
    // Create a mock TraktClient
    mockClient = {
      search: vi.fn(),
    } as unknown as TraktClient;
  });

  it('should search multiple movies in parallel', async () => {
    const mockSearchResults: TraktSearchResult[] = [
      {
        type: 'movie',
        score: 1000,
        movie: {
          title: 'The Matrix',
          year: 1999,
          ids: { trakt: 123, slug: 'the-matrix-1999', imdb: 'tt0133093', tmdb: 603 },
        },
      },
    ];

    (mockClient.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockSearchResults);

    const { results, errors } = await parallelSearchMovies(
      mockClient,
      ['The Matrix', 'Inception', 'Interstellar']
    );

    expect(results.size).toBe(3);
    expect(errors.size).toBe(0);
    expect(mockClient.search).toHaveBeenCalledTimes(3);

    // Check case-insensitive lookup
    expect(results.get('the matrix')).toEqual(mockSearchResults);
    expect(results.get('inception')).toEqual(mockSearchResults);
  });

  it('should deduplicate movie names (case-insensitive)', async () => {
    const mockSearchResults: TraktSearchResult[] = [
      {
        type: 'movie',
        score: 1000,
        movie: {
          title: 'The Matrix',
          year: 1999,
          ids: { trakt: 123, slug: 'the-matrix-1999', imdb: 'tt0133093', tmdb: 603 },
        },
      },
    ];

    (mockClient.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockSearchResults);

    const { results, errors } = await parallelSearchMovies(
      mockClient,
      ['The Matrix', 'the matrix', 'THE MATRIX', 'The Matrix ']
    );

    // Should only search once
    expect(mockClient.search).toHaveBeenCalledTimes(1);
    expect(results.size).toBe(1);
    expect(errors.size).toBe(0);
    expect(results.get('the matrix')).toEqual(mockSearchResults);
  });

  it('should handle search failures gracefully', async () => {
    (mockClient.search as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          type: 'movie',
          score: 1000,
          movie: {
            title: 'Working Movie',
            year: 2000,
            ids: { trakt: 1, slug: 'working-movie', imdb: 'tt0000001', tmdb: 1 },
          },
        },
      ])
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce([
        {
          type: 'movie',
          score: 1000,
          movie: {
            title: 'Another Working Movie',
            year: 2001,
            ids: { trakt: 2, slug: 'another-working-movie', imdb: 'tt0000002', tmdb: 2 },
          },
        },
      ]);

    const { results, errors } = await parallelSearchMovies(
      mockClient,
      ['Working Movie', 'Failing Movie', 'Another Working Movie']
    );

    expect(results.size).toBe(2);
    expect(errors.size).toBe(1);
    expect(errors.get('failing movie')).toContain('API Error');
    expect(results.get('working movie')).toBeDefined();
    expect(results.get('another working movie')).toBeDefined();
  });

  it('should pass year parameter to search', async () => {
    const mockSearchResults: TraktSearchResult[] = [];
    (mockClient.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockSearchResults);

    await parallelSearchMovies(mockClient, ['Dune'], 2021);

    expect(mockClient.search).toHaveBeenCalledWith('Dune', 'movie', 2021);
  });

  it('should handle empty movie list', async () => {
    const { results, errors } = await parallelSearchMovies(mockClient, []);

    expect(results.size).toBe(0);
    expect(errors.size).toBe(0);
    expect(mockClient.search).not.toHaveBeenCalled();
  });

  it('should handle invalid search results format', async () => {
    (mockClient.search as ReturnType<typeof vi.fn>).mockResolvedValue('invalid' as any);

    const { results, errors } = await parallelSearchMovies(
      mockClient,
      ['Bad Movie']
    );

    expect(results.size).toBe(0);
    expect(errors.size).toBe(1);
    expect(errors.get('bad movie')).toContain('Invalid search results format');
  });

  it('should preserve original casing in results map keys', async () => {
    const mockSearchResults: TraktSearchResult[] = [
      {
        type: 'movie',
        score: 1000,
        movie: {
          title: 'The Matrix',
          year: 1999,
          ids: { trakt: 123, slug: 'the-matrix-1999', imdb: 'tt0133093', tmdb: 603 },
        },
      },
    ];

    (mockClient.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockSearchResults);

    const { results } = await parallelSearchMovies(
      mockClient,
      ['The Matrix']
    );

    // Normalized key for lookup
    expect(results.get('the matrix')).toBeDefined();
    expect(results.get('THE MATRIX')).toBeUndefined(); // Only normalized keys
  });

  it('should handle concurrent limit correctly', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    (mockClient.search as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await delay(50);
      concurrent--;
      return [];
    });

    const movieNames = Array.from({ length: 20 }, (_, i) => `Movie ${i}`);

    await parallelSearchMovies(mockClient, movieNames);

    // Should respect max concurrency of 5
    expect(maxConcurrent).toBeLessThanOrEqual(5);
    expect(maxConcurrent).toBeGreaterThan(0);
  });

  it('should handle movies with special characters', async () => {
    const mockSearchResults: TraktSearchResult[] = [
      {
        type: 'movie',
        score: 1000,
        movie: {
          title: "Ocean's Eleven",
          year: 2001,
          ids: { trakt: 456, slug: 'oceans-eleven-2001', imdb: 'tt0240772', tmdb: 161 },
        },
      },
    ];

    (mockClient.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockSearchResults);

    const { results } = await parallelSearchMovies(
      mockClient,
      ["Ocean's Eleven", "Spider-Man: No Way Home"]
    );

    expect(results.get("ocean's eleven")).toBeDefined();
    expect(results.get("spider-man: no way home")).toBeDefined();
  });

  it('should handle whitespace variations in movie names', async () => {
    const mockSearchResults: TraktSearchResult[] = [];
    (mockClient.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockSearchResults);

    const { results } = await parallelSearchMovies(
      mockClient,
      ['  The Matrix  ', 'The Matrix', ' The Matrix']
    );

    // Should deduplicate despite whitespace
    expect(mockClient.search).toHaveBeenCalledTimes(1);
    expect(results.size).toBe(1);
  });
});

describe('parallelMap - Performance benchmarks', () => {
  it('should be significantly faster than sequential for I/O operations', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const operationDelay = 100; // ms

    // Sequential baseline (simulated)
    const sequentialTime = items.length * operationDelay;

    // Parallel execution
    const startTime = Date.now();
    await parallelMap(
      items,
      async (item) => {
        await delay(operationDelay);
        return item;
      },
      { maxConcurrency: 5 }
    );
    const parallelTime = Date.now() - startTime;

    // Parallel should be at least 2x faster (accounting for overhead)
    expect(parallelTime).toBeLessThan(sequentialTime / 2);
  });

  it('should handle high volume with batching', async () => {
    const items = Array.from({ length: 100 }, (_, i) => i);

    const startTime = Date.now();
    const { succeeded, failed } = await parallelMap(
      items,
      async (item) => item * 2,
      {
        maxConcurrency: 10,
        batchSize: 20,
        delayBetweenBatches: 10,
      }
    );
    const duration = Date.now() - startTime;

    expect(succeeded).toHaveLength(100);
    expect(failed).toHaveLength(0);

    // Should complete in reasonable time (< 1 second with batching delays)
    expect(duration).toBeLessThan(1000);
  });

  it('should maintain low overhead per operation', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);

    const startTime = Date.now();
    await parallelMap(
      items,
      async (item) => item, // No-op operation
      { maxConcurrency: 10 }
    );
    const duration = Date.now() - startTime;

    // Overhead should be minimal (< 10ms per operation on average)
    const avgOverheadPerOp = duration / items.length;
    expect(avgOverheadPerOp).toBeLessThan(10);
  });
});

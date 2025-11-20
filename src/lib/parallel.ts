/**
 * Utilities for parallel API operations with rate limiting
 * Enables concurrent execution while respecting Trakt API rate limits
 */

import { TraktClient } from './trakt-client.js';
import { TraktSearchResult } from '../types/trakt.js';

/**
 * Configuration for parallel execution
 */
export interface ParallelConfig {
  maxConcurrency: number; // Max concurrent requests
  batchSize: number; // Process in batches
  delayBetweenBatches?: number; // Delay between batches (ms)
}

/**
 * Result of parallel operations with partial success support
 */
export interface ParallelResult<T> {
  succeeded: T[];
  failed: Array<{
    item: unknown;
    error: string;
  }>;
}

/**
 * Execute async operations in parallel with controlled concurrency
 * Respects rate limiting by batching requests
 *
 * @param items - Items to process
 * @param operation - Async operation to perform on each item
 * @param config - Configuration for concurrency and batching
 * @returns Results with succeeded and failed items
 */
export async function parallelMap<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  config: Partial<ParallelConfig> = {}
): Promise<ParallelResult<R>> {
  const {
    maxConcurrency = 5,
    batchSize = 10,
    delayBetweenBatches = 0,
  } = config;

  const succeeded: R[] = [];
  const failed: Array<{ item: T; error: string }> = [];

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // Limit concurrency within each batch
    const chunks = chunkArray(batch, maxConcurrency);

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(item => operation(item))
      );

      // Process results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          succeeded.push(result.value);
        } else {
          failed.push({
            item: chunk[index],
            error: result.reason?.message || 'Unknown error',
          });
        }
      });
    }

    // Delay between batches to respect rate limits
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await delay(delayBetweenBatches);
    }
  }

  return { succeeded, failed };
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Promise-based delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Result of parallel movie search
 */
export interface ParallelSearchResult {
  movieName: string;
  searchResults: TraktSearchResult[];
}

/**
 * Parallel search with deduplication
 * If the same movie is searched multiple times, only make one API call
 *
 * @param client - Trakt API client
 * @param movieNames - List of movie names to search
 * @param year - Optional year filter
 * @returns Map of movie names to search results and errors
 */
export async function parallelSearchMovies(
  client: TraktClient,
  movieNames: string[],
  year?: number
): Promise<{
  results: Map<string, TraktSearchResult[]>;
  errors: Map<string, string>;
}> {
  // Deduplicate movie names (case-insensitive) while preserving original casing
  const uniqueMoviesMap = new Map<string, string>();
  movieNames.forEach(name => {
    const normalizedName = name.toLowerCase().trim();
    if (!uniqueMoviesMap.has(normalizedName)) {
      uniqueMoviesMap.set(normalizedName, name);
    }
  });

  const uniqueMovies = Array.from(uniqueMoviesMap.values());
  const results = new Map<string, TraktSearchResult[]>();
  const errors = new Map<string, string>();

  // Parallel search with controlled concurrency
  const { succeeded, failed } = await parallelMap(
    uniqueMovies,
    async (movieName): Promise<ParallelSearchResult> => {
      try {
        const searchResults = await client.search(movieName, 'movie', year);
        if (!Array.isArray(searchResults)) {
          throw new Error('Invalid search results format');
        }
        return { movieName, searchResults };
      } catch (error) {
        throw new Error(
          `Failed to search for "${movieName}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
    {
      maxConcurrency: 5, // Max 5 concurrent searches
      batchSize: 10, // Process 10 at a time
      delayBetweenBatches: 100, // 100ms between batches
    }
  );

  // Process successful results
  succeeded.forEach(({ movieName, searchResults }) => {
    // Store with normalized key for case-insensitive lookup
    const normalizedName = movieName.toLowerCase().trim();
    results.set(normalizedName, searchResults);
  });

  // Process failures
  failed.forEach(({ item, error }) => {
    const movieName = item as string;
    const normalizedName = movieName.toLowerCase().trim();
    errors.set(normalizedName, error);
  });

  return { results, errors };
}

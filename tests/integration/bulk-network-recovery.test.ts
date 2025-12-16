import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import { BulkSummaryBuilder } from '../../src/domain/trakt/bulk-summary.js';
import { parseWatchNote } from '../../src/shared/nl-parser.js';

describe('Bulk Operations Network Failure Recovery', () => {
  let mockClient: TraktClient;
  let callCount: number;

  beforeEach(() => {
    callCount = 0;
    mockClient = {
      search: vi.fn(),
      addToHistory: vi.fn(),
    } as unknown as TraktClient;
  });

  describe('Transient Network Failures', () => {
    it('should handle intermittent search failures gracefully', async () => {
      // Simulate intermittent failures: first 2 calls fail, then succeed
      (mockClient.search as any).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Network timeout');
        }
        return Promise.resolve([
          {
            show: {
              title: 'Test Show',
              year: 2024,
              ids: { trakt: 1 },
            },
            score: 100,
          },
        ]);
      });

      const builder = new BulkSummaryBuilder(mockClient);
      const entries = [
        { rawText: 'watched show 1', parsed: parseWatchNote('watched show 1', new Date().toISOString()) },
        { rawText: 'watched show 2', parsed: parseWatchNote('watched show 2', new Date().toISOString()) },
        { rawText: 'watched show 3', parsed: parseWatchNote('watched show 3', new Date().toISOString()) },
      ];

      const summary = await builder.buildSummary(entries);

      // First 2 should be errors, third should succeed
      expect(summary.errors).toBe(2);
      expect(summary.resolved).toBe(1);
      expect(summary.entries[0].searchStatus).toBe('error');
      expect(summary.entries[0].error).toContain('Network timeout');
      expect(summary.entries[1].searchStatus).toBe('error');
      expect(summary.entries[2].searchStatus).toBe('resolved');
    });

    it('should continue processing after partial failures', async () => {
      // Fail every other search
      let searchCount = 0;
      (mockClient.search as any).mockImplementation(() => {
        searchCount++;
        if (searchCount % 2 === 0) {
          throw new Error('Rate limit exceeded');
        }
        return Promise.resolve([
          {
            movie: {
              title: 'Test Movie',
              year: 2024,
              ids: { trakt: searchCount },
            },
            score: 100,
          },
        ]);
      });

      const builder = new BulkSummaryBuilder(mockClient);
      const entries = Array.from({ length: 10 }, (_, i) => ({
        rawText: `watched movie ${i}`,
        parsed: parseWatchNote(`watched movie ${i}`, new Date().toISOString()),
      }));

      const summary = await builder.buildSummary(entries);

      expect(summary.totalEntries).toBe(10);
      expect(summary.errors).toBe(5);
      expect(summary.resolved).toBe(5);
    });
  });

  describe('Complete Network Outage', () => {
    it('should handle complete network failure gracefully', async () => {
      (mockClient.search as any).mockRejectedValue(new Error('Network unreachable'));

      const builder = new BulkSummaryBuilder(mockClient);
      const entries = [
        { rawText: 'watched movie 1', parsed: parseWatchNote('watched movie 1', new Date().toISOString()) },
        { rawText: 'watched movie 2', parsed: parseWatchNote('watched movie 2', new Date().toISOString()) },
      ];

      const summary = await builder.buildSummary(entries);

      expect(summary.totalEntries).toBe(2);
      expect(summary.errors).toBe(2);
      expect(summary.resolved).toBe(0);
      expect(summary.entries[0].error).toContain('Network unreachable');
    });

    it('should not crash on undefined/null responses', async () => {
      (mockClient.search as any).mockResolvedValue(null);

      const builder = new BulkSummaryBuilder(mockClient);
      const entries = [
        { rawText: 'watched movie', parsed: parseWatchNote('watched movie', new Date().toISOString()) },
      ];

      const summary = await builder.buildSummary(entries);

      expect(summary.totalEntries).toBe(1);
      expect(summary.notFound).toBe(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should handle slow responses without blocking other requests', async () => {
      const delays = [100, 2000, 50, 1500, 75]; // Mix of fast and slow responses
      let requestIndex = 0;

      (mockClient.search as any).mockImplementation(() => {
        const delay = delays[requestIndex % delays.length];
        requestIndex++;

        return new Promise((resolve) => {
          setTimeout(() => {
            resolve([
              {
                movie: {
                  title: 'Test Movie',
                  year: 2024,
                  ids: { trakt: requestIndex },
                },
                score: 100,
              },
            ]);
          }, delay);
        });
      });

      const builder = new BulkSummaryBuilder(mockClient, 3); // Concurrency limit of 3
      const entries = Array.from({ length: 5 }, (_, i) => ({
        rawText: `watched movie ${i}`,
        parsed: parseWatchNote(`watched movie ${i}`, new Date().toISOString()),
      }));

      const startTime = Date.now();
      const summary = await builder.buildSummary(entries);
      const duration = Date.now() - startTime;

      expect(summary.resolved).toBe(5);
      // With concurrency=3, should not take as long as processing sequentially
      // Sequential would be: 100+2000+50+1500+75 = 3725ms
      // Concurrent should be significantly faster
      expect(duration).toBeLessThan(3500);
    });
  });

  describe('API Error Handling', () => {
    it('should handle 429 rate limit errors', async () => {
      const error = new Error('Rate limit exceeded');
      (error as any).statusCode = 429;
      (mockClient.search as any).mockRejectedValue(error);

      const builder = new BulkSummaryBuilder(mockClient);
      const entries = [
        { rawText: 'watched movie', parsed: parseWatchNote('watched movie', new Date().toISOString()) },
      ];

      const summary = await builder.buildSummary(entries);

      expect(summary.errors).toBe(1);
      expect(summary.entries[0].error).toContain('Rate limit');
    });

    it('should handle 500 server errors', async () => {
      const error = new Error('Internal server error');
      (error as any).statusCode = 500;
      (mockClient.search as any).mockRejectedValue(error);

      const builder = new BulkSummaryBuilder(mockClient);
      const entries = [
        { rawText: 'watched movie', parsed: parseWatchNote('watched movie', new Date().toISOString()) },
      ];

      const summary = await builder.buildSummary(entries);

      expect(summary.errors).toBe(1);
      expect(summary.entries[0].error).toContain('Internal server error');
    });

    it('should handle malformed API responses', async () => {
      (mockClient.search as any).mockResolvedValue([
        {
          // Missing required fields
          invalid: 'data',
        },
      ]);

      const builder = new BulkSummaryBuilder(mockClient);
      const entries = [
        { rawText: 'watched movie', parsed: parseWatchNote('watched movie', new Date().toISOString()) },
      ];

      const summary = await builder.buildSummary(entries);

      // Should handle gracefully - likely treating as ambiguous or error
      expect(summary.totalEntries).toBe(1);
      expect(summary.errors + summary.notFound + summary.ambiguous).toBeGreaterThan(0);
    });
  });

  describe('Concurrency Control', () => {
    it('should respect concurrency limits', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      (mockClient.search as any).mockImplementation(() => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        return new Promise((resolve) => {
          setTimeout(() => {
            currentConcurrent--;
            resolve([
              {
                movie: {
                  title: 'Test Movie',
                  year: 2024,
                  ids: { trakt: 1 },
                },
                score: 100,
              },
            ]);
          }, 100);
        });
      });

      const concurrencyLimit = 3;
      const builder = new BulkSummaryBuilder(mockClient, concurrencyLimit);
      const entries = Array.from({ length: 10 }, (_, i) => ({
        rawText: `watched movie ${i}`,
        parsed: parseWatchNote(`watched movie ${i}`, new Date().toISOString()),
      }));

      await builder.buildSummary(entries);

      // Should never exceed the concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(concurrencyLimit);
    });
  });
});

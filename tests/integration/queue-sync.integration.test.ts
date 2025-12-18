import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WatchLogQueue } from '../../src/domain/trakt/watch-queue.js';
import { syncLogwatchQueue } from '../../src/domain/trakt/tools.js';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';

// Mock TraktClient
vi.mock('../../src/domain/trakt/trakt-client.js');

describe('Queue Sync Workflow', () => {
  let tempDir: string;
  let queuePath: string;
  let queue: WatchLogQueue;
  let mockClient: any;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `trakt-mcp-queue-sync-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    queuePath = path.join(tempDir, 'pending-logs.jsonl');
    queue = new WatchLogQueue(queuePath);

    // Setup mock client
    mockClient = {
      search: vi.fn(),
      addToHistory: vi.fn(),
      getHistory: vi.fn(),
    };
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Full Sync Flow', () => {
    it('should sync simple movie entry successfully', async () => {
      // Add entry to queue
      await queue.append('watched Dune 2021 movie');

      // Mock search result
      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      // Mock history (no duplicates) - returns empty array
      mockClient.getHistory.mockResolvedValue([]);

      // Mock successful add
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      // Sync with auto-confirm
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
      expect(result.data.failed).toBe(0);
    });

    it('should sync episode entry successfully', async () => {
      await queue.append('watched The Bear S2E5');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      // Mock empty history (no duplicates)
      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { episodes: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
    });

    it('should skip low-confidence entries', async () => {
      await queue.append('watched'); // No title

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(1);
    });

    it('should archive after successful sync', async () => {
      await queue.append('watched Dune 2021');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.archivePath).toBeTruthy();
      expect(fs.existsSync(result.data.archivePath)).toBe(true);
    });
  });

  describe('Dry Run Mode', () => {
    it('should preview all entries without syncing', async () => {
      await queue.append('watched Dune 2021');
      await queue.append('watched Inception 2010');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.action_required).toBe('review');
      expect(result.data.summary).toBeTruthy();
      expect(result.data.formattedTable).toBeTruthy();

      // Should not have called addToHistory
      expect(mockClient.addToHistory).not.toHaveBeenCalled();
    });

    it('should show summary table', async () => {
      await queue.append('watched Dune 2021');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
            genres: ['Sci-Fi'],
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        dryRun: true,
      });

      expect(result.data.formattedTable).toContain('BULK SYNC SUMMARY');
      expect(result.data.formattedTable).toContain('Dune');
    });

    it('should not modify queue file', async () => {
      await queue.append('watched Dune 2021');

      const beforeList = await queue.list();

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        dryRun: true,
      });

      const afterList = await queue.list();
      expect(afterList).toEqual(beforeList);
    });
  });

  describe('Error Handling', () => {
    it('should mark failed entries and continue', async () => {
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      // First search succeeds, second fails
      mockClient.search
        .mockResolvedValueOnce([
          {
            score: 100,
            movie: {
              title: 'Dune',
              year: 2021,
              ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
            },
          },
        ])
        .mockRejectedValueOnce(new Error('Network error'));

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
      expect(result.data.failed).toBe(1);
    });

    it('should handle network errors', async () => {
      await queue.append('watched Dune 2021 movie');

      mockClient.search.mockRejectedValue(new Error('Network error'));

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.failed).toBe(1);
    });

    it('should preserve failed entries for retry', async () => {
      await queue.append('watched Dune 2021 movie');

      mockClient.search.mockRejectedValue(new Error('Network error'));

      await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Failed entry should still be in queue
      const remaining = await queue.list();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].status).toBe('failed');
    });
  });

  describe('Date Handling', () => {
    it('should use parsed date from text', async () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const capturedISO = captured.toISOString();

      // Manually create entry with specific capturedAt
      const queueEntry = {
        id: '123',
        rawText: 'watched Dune 2021 movie yesterday',
        capturedAt: capturedISO,
        status: 'pending' as const,
        source: 'cli' as const,
      };

      // Write directly to file
      fs.writeFileSync(queuePath, JSON.stringify(queueEntry) + '\n', { mode: 0o600 });

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);

      // Check that addToHistory was called with parsed date (yesterday)
      const historyCall = mockClient.addToHistory.mock.calls[0][0];
      expect(historyCall.movies[0].watched_at).toBe('2025-12-15');
    });

    it('should fall back to capturedAt when no date in text', async () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const capturedISO = captured.toISOString();

      const queueEntry = {
        id: '123',
        rawText: 'watched Dune 2021 movie',
        capturedAt: capturedISO,
        status: 'pending' as const,
        source: 'cli' as const,
      };

      fs.writeFileSync(queuePath, JSON.stringify(queueEntry) + '\n', { mode: 0o600 });

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);

      // Should use capturedAt
      const historyCall = mockClient.addToHistory.mock.calls[0][0];
      expect(historyCall.movies[0].watched_at).toBe(capturedISO);
    });

    it('should handle temporal modifiers correctly', async () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const capturedISO = captured.toISOString();

      const queueEntry = {
        id: '123',
        rawText: 'just watched Dune 2021 movie',
        capturedAt: capturedISO,
        status: 'pending' as const,
        source: 'cli' as const,
      };

      fs.writeFileSync(queuePath, JSON.stringify(queueEntry) + '\n', { mode: 0o600 });

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);

      // Should use capturedAt for "just watched"
      const historyCall = mockClient.addToHistory.mock.calls[0][0];
      expect(historyCall.movies[0].watched_at).toBe(capturedISO);
    });
  });

  describe('Interactive Mode', () => {
    it('should return first entry for confirmation without autoConfirm', async () => {
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.action_required).toBe('confirm_entry');
      expect(result.data.currentEntry).toBeTruthy();
      expect(result.data.currentIndex).toBe(0);
      expect(result.data.totalEntries).toBe(2);
      expect(result.data.remaining).toBe(1);
    });

    it('should support entryIndex parameter to start at specific entry', async () => {
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Inception',
            year: 2010,
            ids: { trakt: 67890, slug: 'inception-2010', imdb: 'tt456', tmdb: 789 },
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
        entryIndex: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data.currentIndex).toBe(1);
      expect(result.data.remaining).toBe(0);
      expect(result.data.currentEntry.rawText).toContain('Inception');
    });

    it('should handle skip action and move to next entry', async () => {
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      const entries = await queue.getPending();
      const firstEntryId = entries[0].id;

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        entryId: firstEntryId,
        action: 'skip',
      });

      expect(result.success).toBe(true);
      expect(result.data.action_required).toBe('confirm_entry');
      expect(result.data.currentIndex).toBe(1);

      // Verify first entry was marked as skipped
      const allEntries = await queue.list();
      expect(allEntries[0].status).toBe('skipped');
    });

    it('should handle fail action and move to next entry', async () => {
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      const entries = await queue.getPending();
      const firstEntryId = entries[0].id;

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        entryId: firstEntryId,
        action: 'fail',
      });

      expect(result.success).toBe(true);
      expect(result.data.action_required).toBe('confirm_entry');
      expect(result.data.currentIndex).toBe(1);

      // Verify first entry was marked as failed
      const allEntries = await queue.list();
      expect(allEntries[0].status).toBe('failed');
    });

    it('should complete when skipping last entry', async () => {
      await queue.append('watched Dune 2021 movie');

      const entries = await queue.getPending();
      const entryId = entries[0].id;

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        entryId,
        action: 'skip',
      });

      expect(result.success).toBe(true);
      expect(result.data.action_required).toBeUndefined();
      expect(result.data.skipped).toBe(1);
      expect(result.data.totalProcessed).toBe(1);
    });

    it('should return error for invalid entryId', async () => {
      await queue.append('watched Dune 2021 movie');

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        entryId: 'invalid-id',
        action: 'skip',
      });

      expect(result.success).toBe(false);
      if (!result.success && 'error' in result) {
        expect(result.error.code).toBe('ENTRY_NOT_FOUND');
      }
    });

    it('should include search results in interactive mode', async () => {
      await queue.append('watched Dune 2021 movie');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.searchResults).toBeTruthy();
      expect(Array.isArray(result.data.searchResults)).toBe(true);
    });
  });

  describe('Ambiguous Entry Handling', () => {
    it('should skip ambiguous entries in autoConfirm mode', async () => {
      await queue.append('watched Dune movie');

      // Return multiple movies with different IDs
      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt1', tmdb: 1 },
          },
        },
        {
          score: 95,
          movie: {
            title: 'Dune',
            year: 1984,
            ids: { trakt: 67890, slug: 'dune-1984', imdb: 'tt2', tmdb: 2 },
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(1);
      expect(result.data.synced).toBe(0);

      // Check that ambiguousEntries array is populated
      expect(result.data.ambiguousEntries).toBeTruthy();
      expect(result.data.ambiguousEntries.length).toBe(1);
      expect(result.data.ambiguousEntries[0].id).toBeTruthy();
      expect(result.data.ambiguousEntries[0].rawText).toContain('Dune');
    });

    it('should not skip when all results have same ID', async () => {
      await queue.append('watched Dune 2021 movie');

      // Return same movie multiple times (shouldn't happen, but test the logic)
      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
      expect(result.data.skipped).toBe(0);
    });

    it('should include search results preview in ambiguous entries', async () => {
      await queue.append('watched Dune movie');

      // Return 10 results to test slicing
      const searchResults = Array.from({ length: 10 }, (_, i) => ({
        score: 100 - i,
        movie: {
          title: 'Dune',
          year: 2021 - i,
          ids: { trakt: 12345 + i, slug: `dune-${2021 - i}`, imdb: `tt${i}`, tmdb: i },
        },
      }));

      mockClient.search.mockResolvedValue(searchResults);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.ambiguousEntries).toBeTruthy();
      expect(result.data.ambiguousEntries[0].matches).toBeTruthy();
      // Should only include first 5 results
      expect(result.data.ambiguousEntries[0].matches.length).toBe(5);
      // Should include helpful context
      expect(result.data.ambiguousEntries[0].hint).toBeTruthy();
      expect(result.data.ambiguousEntries[0].matchCount).toBe(10);
    });
  });
});


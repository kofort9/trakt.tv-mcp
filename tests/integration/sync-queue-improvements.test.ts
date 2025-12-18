import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WatchLogQueue } from '../../src/domain/trakt/watch-queue.js';
import { syncLogwatchQueue } from '../../src/domain/trakt/tools.js';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';

// Mock TraktClient
vi.mock('../../src/domain/trakt/trakt-client.js');

describe('Sync Queue Improvements', () => {
  let tempDir: string;
  let queuePath: string;
  let queue: WatchLogQueue;
  let mockClient: any;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `trakt-mcp-sync-improvements-${Date.now()}`);
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

  describe('Interactive Mode Workflow', () => {
    it('should present first entry for confirmation when autoConfirm is false', async () => {
      // Setup: Add entries to queue
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      // Execute: Call sync in interactive mode
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      // Assert: Should return first entry for confirmation
      expect(result.success).toBe(true);
      expect(result.data.action_required).toBe('confirm_entry');
      expect(result.data.currentEntry).toBeDefined();
      expect(result.data.currentEntry.rawText).toBe('watched Dune 2021 movie');
      expect(result.data.totalEntries).toBe(2);
      expect(result.data.remaining).toBe(1);
    });

    it('should present next entry after marking first as synced', async () => {
      // Setup
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      // Execute: Get first entry
      const result1 = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      // Mark first as synced
      await queue.markSynced(result1.data.currentEntry.id, {
        type: 'movie',
        traktId: 12345,
        title: 'Dune',
        year: 2021,
      });

      // Execute: Get next entry
      const result2 = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      // Assert: Should return second entry
      expect(result2.success).toBe(true);
      expect(result2.data.currentEntry.rawText).toBe('watched Inception 2010 movie');
      expect(result2.data.remaining).toBe(0);
    });

    it('should skip entry marked as skipped and present next entry', async () => {
      // Setup
      await queue.append('watched ambiguous movie');
      await queue.append('watched Inception 2010 movie');

      // Execute: Get first entry
      const result1 = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      // Skip first entry
      await queue.markSkipped(result1.data.currentEntry.id);

      // Execute: Get next entry
      const result2 = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      // Assert: Should skip to second entry
      expect(result2.data.currentEntry.rawText).toBe('watched Inception 2010 movie');
    });

    it('should provide accurate progress indicator', async () => {
      // Setup: Add 5 entries
      for (let i = 1; i <= 5; i++) {
        await queue.append(`watched movie ${i}`);
      }

      // Execute and verify each step
      // Note: totalEntries reflects PENDING entries, which decreases as entries are synced
      for (let i = 0; i < 5; i++) {
        const pendingCount = 5 - i; // Remaining pending entries

        const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
          queuePath,
          autoConfirm: false,
        });

        expect(result.data.totalEntries).toBe(pendingCount);
        expect(result.data.remaining).toBe(pendingCount - 1); // remaining = total - 1 (current)

        // Mark as synced to move to next
        await queue.markSynced(result.data.currentEntry.id, {
          type: 'movie',
          traktId: i,
          title: `Movie ${i}`,
        });
      }

      // Final call should return no pending
      const finalResult = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      expect(finalResult.data.synced).toBe(0);
      expect(finalResult.data.message).toContain('No pending entries');
    });

    it('should handle entries with unknown type by performing search in interactive mode', async () => {
      // Setup: Entry without explicit type keyword
      await queue.append("I've seen forest gump");

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Forrest Gump',
            year: 1994,
            ids: { trakt: 12345, slug: 'forrest-gump-1994', imdb: 'tt109830', tmdb: 13 },
          },
        },
      ]);

      // Execute: Get entry in interactive mode
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: false,
      });

      // Assert: Entry returned - type is 'infer_from_search' (let search determine type)
      // Interactive mode should still perform search and return results for user confirmation
      expect(result.data.currentEntry.parsed.type).toBe('infer_from_search');
      // Search results should be provided so user can confirm
      expect(result.data.searchResults).toBeDefined();
    });
  });

  describe('Auto-Confirm Ambiguity Handling', () => {
    it('should sync entry with unique match automatically', async () => {
      // Setup - include "movie" keyword for type detection
      await queue.append('watched Paterson (2016) movie');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Paterson',
            year: 2016,
            ids: { trakt: 12345, slug: 'paterson-2016', imdb: 'tt5247022', tmdb: 364980 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
      expect(result.data.failed).toBe(0);
      expect(result.data.skipped).toBe(0);
    });

    it('should SKIP ambiguous entries instead of auto-selecting first result', async () => {
      // Setup: Entry without year (ambiguous)
      await queue.append('watched Dune movie');

      // Mock multiple search results
      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 1984,
            ids: { trakt: 111, slug: 'dune-1984', imdb: 'tt0087182', tmdb: 841 },
          },
        },
        {
          score: 95,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 222, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
          },
        },
      ]);

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert: Should skip, NOT auto-select first
      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(0);
      expect(result.data.skipped).toBe(1);
      expect(result.data.failed).toBe(0);

      // Check that entry is marked as skipped in queue
      const entries = await queue.list();
      expect(entries[0].status).toBe('skipped');
      // Note: markSkipped doesn't set failureReason, check results array instead
      expect(result.data.results[0].reason).toContain('Ambiguous');
    });

    it('should populate ambiguousEntries array with skipped ambiguous entries', async () => {
      // Setup: Multiple entries, some ambiguous
      await queue.append('watched Dune movie'); // Ambiguous (no year)
      await queue.append('watched Paterson (2016) movie'); // Unique (has year)

      // Mock search results
      mockClient.search
        .mockResolvedValueOnce([
          { score: 100, movie: { title: 'Dune', year: 1984, ids: { trakt: 111 } } },
          { score: 95, movie: { title: 'Dune', year: 2021, ids: { trakt: 222 } } },
        ])
        .mockResolvedValueOnce([
          { score: 100, movie: { title: 'Paterson', year: 2016, ids: { trakt: 333 } } },
        ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert
      expect(result.data.synced).toBe(1); // Only Paterson
      expect(result.data.skipped).toBe(1); // Dune
      expect(result.data.ambiguousEntries).toBeDefined();
      expect(result.data.ambiguousEntries.length).toBeGreaterThan(0);
      expect(result.data.ambiguousEntries[0].rawText).toContain('Dune');
    });

    it('should skip low confidence entries without attempting search', async () => {
      // Setup: Entry with no title (low confidence)
      await queue.append('watched');

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert
      expect(result.data.skipped).toBe(1);
      expect(mockClient.search).not.toHaveBeenCalled(); // No search attempted
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully without crashing', async () => {
      // Setup
      await queue.append('watched Dune 2021 movie');

      mockClient.search.mockRejectedValue(new Error('Network error'));

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert: Should not crash, should mark as failed
      expect(result.success).toBe(true); // Overall operation succeeds
      expect(result.data.failed).toBe(1);
      expect(result.data.synced).toBe(0);

      // Check entry marked as failed
      const entries = await queue.list();
      expect(entries[0].status).toBe('failed');
      expect(entries[0].failureReason).toContain('Network error');
    });

    it('should handle 429 rate limit errors by marking entry as failed', async () => {
      // Note: Retry logic is in TraktClient interceptors, not in syncLogwatchQueue.
      // When client throws rate limit error, sync function marks entry as failed.
      // Setup
      await queue.append('watched Dune 2021 movie');

      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).statusCode = 429;

      mockClient.search.mockRejectedValue(rateLimitError);

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert: Entry marked as failed (retry is handled at client level, not here)
      expect(result.data.failed).toBe(1);
      expect(result.data.synced).toBe(0);

      const entries = await queue.list();
      expect(entries[0].status).toBe('failed');
    });

    it('should handle invalid queue entries gracefully', async () => {
      // Setup: Manually add malformed entry
      fs.appendFileSync(queuePath, '{"id":"invalid","incomplete":true}\n', 'utf8');
      await queue.append('watched Dune 2021 movie');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert: Should skip invalid entry and process valid one
      expect(result.success).toBe(true);
      expect(result.data.synced).toBeGreaterThanOrEqual(1);
    });

    it('should preserve failed entries for manual retry', async () => {
      // Setup
      await queue.append('watched nonexistent movie 9999');

      mockClient.search.mockResolvedValue([]); // No results

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert
      expect(result.data.failed).toBe(1);

      // Check that entry is still in queue
      const entries = await queue.list();
      expect(entries.length).toBe(1);
      expect(entries[0].status).toBe('failed');
      expect(entries[0].failureReason).toContain('No search results');
    });

    it('should handle TraktClient with null _retryCount safely', async () => {
      // Setup: Mock client with null retry count
      const clientWithNullRetry = {
        ...mockClient,
        _retryCount: null,
      };

      await queue.append('watched Dune 2021 movie');

      clientWithNullRetry.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
          },
        },
      ]);

      clientWithNullRetry.getHistory.mockResolvedValue([]);
      clientWithNullRetry.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      // Execute: Should not crash even with null retry count
      const result = await syncLogwatchQueue(clientWithNullRetry as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
    });
  });

  describe('Data Integrity', () => {
    it('should create archive with all entries after sync', async () => {
      // Setup
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
          },
        },
      ]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert
      expect(result.data.archivePath).toBeDefined();
      expect(fs.existsSync(result.data.archivePath)).toBe(true);

      // Verify archive contains all entries
      const archiveContent = fs.readFileSync(result.data.archivePath, 'utf8');
      const archiveLines = archiveContent.split('\n').filter(Boolean);
      expect(archiveLines.length).toBe(2);
    });

    it('should retain only failed/skipped/pending entries in queue after sync', async () => {
      // Setup
      await queue.append('watched Dune 2021 movie'); // Will sync
      await queue.append('watched nonexistent movie'); // Will fail

      mockClient.search
        .mockResolvedValueOnce([
          {
            score: 100,
            movie: {
              title: 'Dune',
              year: 2021,
              ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
            },
          },
        ])
        .mockResolvedValueOnce([]); // No results for second

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      // Execute
      await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert: Queue should only have failed entry
      const entries = await queue.list();
      expect(entries.length).toBe(1);
      expect(entries[0].status).toBe('failed');
    });

    it('should not corrupt queue file on error', async () => {
      // Setup
      await queue.append('watched Dune 2021 movie');

      // Mock error during sync
      mockClient.search.mockRejectedValue(new Error('Simulated error'));

      // Execute
      await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Assert: Queue file should still be valid JSON
      const entries = await queue.list();
      expect(entries.length).toBe(1);
      expect(entries[0].status).toBe('failed');

      // Verify file can be parsed
      const content = fs.readFileSync(queuePath, 'utf8');
      expect(() => {
        content.split('\n').filter(Boolean).forEach(JSON.parse);
      }).not.toThrow();
    });
  });

  describe('Dry Run Mode', () => {
    it('should preview all entries without syncing', async () => {
      // Setup
      await queue.append('watched Dune 2021 movie');
      await queue.append('watched Inception 2010 movie');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
          },
        },
      ]);

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        dryRun: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.action_required).toBe('review');
      expect(result.data.summary).toBeDefined();
      expect(result.data.formattedTable).toBeDefined();

      // Verify no sync occurred
      expect(mockClient.addToHistory).not.toHaveBeenCalled();

      // Verify queue unchanged
      const entries = await queue.list();
      expect(entries.every((e) => e.status === 'pending')).toBe(true);
    });

    it('should show summary table with correct counts', async () => {
      // Setup: Mix of resolvable and problematic entries
      await queue.append('watched Dune 2021 movie'); // Resolvable
      await queue.append('watched Dune movie'); // Ambiguous
      await queue.append('watched nonexistent movie'); // Not found (no results)

      mockClient.search
        .mockResolvedValueOnce([
          {
            score: 100,
            movie: {
              title: 'Dune',
              year: 2021,
              ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
            },
          },
        ])
        .mockResolvedValueOnce([
          { score: 100, movie: { title: 'Dune', year: 1984, ids: { trakt: 111 } } },
          { score: 95, movie: { title: 'Dune', year: 2021, ids: { trakt: 222 } } },
        ])
        .mockResolvedValueOnce([]);

      // Execute
      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        dryRun: true,
      });

      // Assert
      expect(result.data.summary.resolved).toBeGreaterThan(0);
      expect(result.data.summary.ambiguous).toBeGreaterThan(0);
      expect(result.data.summary.notFound).toBeGreaterThan(0);
      expect(result.data.formattedTable).toContain('BULK SYNC SUMMARY');
    });
  });
});

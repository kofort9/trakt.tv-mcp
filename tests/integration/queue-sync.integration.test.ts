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
      await queue.append('watched Dune 2021');

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

      // Mock history (no duplicates)
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
      await queue.append('watched Dune 2021');
      await queue.append('watched Inception 2010');

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
      await queue.append('watched Dune 2021');

      mockClient.search.mockRejectedValue(new Error('Network error'));

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.failed).toBe(1);
    });

    it('should preserve failed entries for retry', async () => {
      await queue.append('watched Dune 2021');

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
        rawText: 'watched Dune yesterday',
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

      await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Check that addToHistory was called with parsed date (yesterday)
      const historyCall = mockClient.addToHistory.mock.calls[0][0];
      expect(historyCall.movies[0].watched_at).toBe('2025-12-15');
    });

    it('should fall back to capturedAt when no date in text', async () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const capturedISO = captured.toISOString();

      const queueEntry = {
        id: '123',
        rawText: 'watched Dune',
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

      await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Should use capturedAt
      const historyCall = mockClient.addToHistory.mock.calls[0][0];
      expect(historyCall.movies[0].watched_at).toBe(capturedISO);
    });

    it('should handle temporal modifiers correctly', async () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const capturedISO = captured.toISOString();

      const queueEntry = {
        id: '123',
        rawText: 'just watched Dune',
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

      await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Should use capturedAt for "just watched"
      const historyCall = mockClient.addToHistory.mock.calls[0][0];
      expect(historyCall.movies[0].watched_at).toBe(capturedISO);
    });
  });
});

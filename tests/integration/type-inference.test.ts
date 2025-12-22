/**
 * Tests for Search-First Type Inference (Phase 0, Task 0.3)
 *
 * These tests cover the scenario where users don't include explicit type keywords
 * like "movie" or "show" in their watch notes. The parser returns 'infer_from_search'
 * and the sync logic uses Trakt search results to determine the content type.
 *
 * Based on case study entries from docs/case-studies/2025-12-16-sync-queue-first-test.md
 *
 * @see docs/test-plans/phase-0-test-plan.md Section 0.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WatchLogQueue } from '../../src/domain/trakt/watch-queue.js';
import { syncLogwatchQueue } from '../../src/domain/trakt/tools.js';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import { parseWatchNote } from '../../src/shared/nl-parser.js';

// Mock TraktClient
vi.mock('../../src/domain/trakt/trakt-client.js');

describe('Search-First Type Inference', () => {
  let tempDir: string;
  let queuePath: string;
  let queue: WatchLogQueue;
  let mockClient: {
    search: ReturnType<typeof vi.fn>;
    addToHistory: ReturnType<typeof vi.fn>;
    getHistory: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `trakt-mcp-type-inference-${Date.now()}`);
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
    vi.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Case Study Regression Tests', () => {
    /**
     * These tests reproduce the exact entries from the 2025-12-16 case study
     * that failed because they lacked explicit type keywords.
     */

    it('should infer movie type for "i watched columbus 2017"', async () => {
      // Case study entry #1: No "movie" keyword, year included
      await queue.append('i watched columbus 2017');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Columbus',
            year: 2017,
            ids: { trakt: 282870, slug: 'columbus-2017', imdb: 'tt5990474', tmdb: 419478 },
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
      expect(result.data.failed).toBe(0);

      // Verify the addToHistory was called with movie type
      expect(mockClient.addToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          movies: expect.arrayContaining([
            expect.objectContaining({
              ids: { trakt: 282870 },
            }),
          ]),
        }),
        expect.anything()
      );
    });

    it('should infer movie type for "I just finished Still walking (2009)"', async () => {
      // Case study entry: "just finished" temporal modifier with year in parentheses
      await queue.append('I just finished Still walking (2009)');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Still Walking',
            year: 2008, // Note: actual Trakt year is 2008
            ids: { trakt: 25171, slug: 'still-walking-2008', imdb: 'tt1087578', tmdb: 29878 },
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
    });

    it('should infer movie type for "I just finished in the mood for love (2000)"', async () => {
      // Case study entry: Wong Kar-wai film
      await queue.append('I just finished in the mood for love (2000)');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'In the Mood for Love',
            year: 2000,
            ids: { trakt: 502, slug: 'in-the-mood-for-love-2000', imdb: 'tt0118694', tmdb: 843 },
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
    });

    it('should infer movie type for "just finished chungking express (1995)"', async () => {
      // Case study entry: lowercase, no "I" prefix
      await queue.append('just finished chungking express (1995)');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Chungking Express',
            year: 1994, // Actual Trakt year
            ids: { trakt: 614, slug: 'chungking-express-1994', imdb: 'tt0109424', tmdb: 11104 },
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
    });

    it('should infer movie type for "watched lady bird (2017)"', async () => {
      // Case study entry: simple format without "movie"
      await queue.append('watched lady bird (2017)');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Lady Bird',
            year: 2017,
            ids: { trakt: 296939, slug: 'lady-bird-2017', imdb: 'tt4925292', tmdb: 391713 },
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
    });
  });

  describe('Type Inference from Search Results', () => {
    it('should infer "movie" when search returns only movies', async () => {
      await queue.append('watched Paterson');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Paterson',
            year: 2016,
            ids: { trakt: 240930, slug: 'paterson-2016', imdb: 'tt5247022', tmdb: 370755 },
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
    });

    it('should infer "show" when search returns only shows AND episode info is present', async () => {
      // Entry has S2E5 - should be detected as episode type by parser
      await queue.append('watched The Bear S2E5');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 186475, slug: 'the-bear', imdb: 'tt14452776', tmdb: 136315 },
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

    it('should skip show result when no episode info provided', async () => {
      // Entry has no S#E# but search returns a show - can't sync without episode info
      await queue.append('watched The Bear');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 186475, slug: 'the-bear', imdb: 'tt14452776', tmdb: 136315 },
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
      expect(result.data.results[0].reason).toContain('episode');
    });

    it('should skip ambiguous entry when movie and show have same name', async () => {
      // "Fargo" is both a movie and a show
      await queue.append('watched Fargo');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Fargo',
            year: 1996,
            ids: { trakt: 5, slug: 'fargo-1996', imdb: 'tt0116282', tmdb: 275 },
          },
        },
        {
          score: 95,
          show: {
            title: 'Fargo',
            year: 2014,
            ids: { trakt: 59, slug: 'fargo', imdb: 'tt2802850', tmdb: 60622 },
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      // Ambiguous = multiple results, should be skipped
      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(1);
      expect(result.data.synced).toBe(0);
      expect(result.data.ambiguousEntries).toHaveLength(1);
    });

    it('should sync when episode info disambiguates mixed-name content', async () => {
      // "Fargo" is both a movie (1996) and a show (2014)
      // But S1E1 makes it clear: user wants the show
      // The search will be filtered to "show" type due to episode info
      await queue.append('watched Fargo S1E1');

      // Since searchType='show' (due to episode pattern), search is filtered
      mockClient.search.mockResolvedValue([
        {
          score: 100,
          show: {
            title: 'Fargo',
            year: 2014,
            ids: { trakt: 60622, slug: 'fargo', imdb: 'tt2802850', tmdb: 60622 },
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
      // Verify search was called with 'show' type filter (not undefined)
      expect(mockClient.search).toHaveBeenCalledWith('Fargo', 'show', undefined, expect.anything());
    });
  });

  describe('Parser Type Detection', () => {
    const capturedAt = '2025-12-20T12:00:00.000Z';

    it('should return infer_from_search for entry without type keywords', () => {
      const result = parseWatchNote('watched columbus 2017', capturedAt);

      expect(result.type).toBe('infer_from_search');
      expect(result.title.toLowerCase()).toBe('columbus');
      expect(result.year).toBe(2017);
    });

    it('should return movie when explicit "movie" keyword present', () => {
      const result = parseWatchNote('watched columbus 2017 movie', capturedAt);

      expect(result.type).toBe('movie');
      expect(result.title.toLowerCase()).toBe('columbus');
    });

    it('should return movie when explicit "film" keyword present', () => {
      const result = parseWatchNote('watched Dune 2021 film', capturedAt);

      expect(result.type).toBe('movie');
      expect(result.title.toLowerCase()).toBe('dune');
    });

    it('should return episode when S#E# pattern present', () => {
      const result = parseWatchNote('watched The Bear S2E5', capturedAt);

      expect(result.type).toBe('episode');
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });

    it('should return episode when season X episode Y pattern present', () => {
      const result = parseWatchNote('watched The Bear season 2 episode 5', capturedAt);

      expect(result.type).toBe('episode');
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });

    it('should return episode when show/series keyword present', () => {
      const result = parseWatchNote('watched The Bear show', capturedAt);

      expect(result.type).toBe('episode');
    });

    it('should extract year from parentheses format', () => {
      const result = parseWatchNote('watched In the Mood for Love (2000)', capturedAt);

      expect(result.year).toBe(2000);
      expect(result.type).toBe('infer_from_search');
    });

    it('should handle "just finished" temporal modifier', () => {
      const result = parseWatchNote('just finished Dune 2021', capturedAt);

      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just finished');
      expect(result.type).toBe('infer_from_search');
    });

    it('should handle recall patterns like "I\'ve seen"', () => {
      const result = parseWatchNote("I've seen Forrest Gump", capturedAt);

      expect(result.isRecallPattern).toBe(true);
      expect(result.type).toBe('infer_from_search');
    });

    it('should preserve movie titles that look like years (2046)', () => {
      const result = parseWatchNote('watched 2046', capturedAt);

      // 2046 is a movie title, not a year - should be kept
      expect(result.title).toBe('2046');
      expect(result.year).toBeUndefined();
    });
  });

  describe('Smart Auto-Confirm Edge Cases', () => {
    it('should skip entries with 0 search results', async () => {
      await queue.append('watched nonexistent movie xyzzy 9999');

      mockClient.search.mockResolvedValue([]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(0);
      expect(result.data.skipped).toBe(1);
      expect(result.data.results[0].reason).toContain('No');
    });

    it('should skip entries with 2+ different search results', async () => {
      // "Dune" without year is ambiguous
      await queue.append('watched Dune');

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

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(0);
      expect(result.data.skipped).toBe(1);
      expect(result.data.ambiguousEntries).toHaveLength(1);
      expect(result.data.ambiguousEntries[0].matchCount).toBe(2);
    });

    it('should process entry with exactly 1 search result', async () => {
      // Year disambiguates
      await queue.append('watched Paterson (2016)');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Paterson',
            year: 2016,
            ids: { trakt: 333, slug: 'paterson-2016', imdb: 'tt5247022', tmdb: 370755 },
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

    it('should handle mixed batch: some sync, some skip', async () => {
      await queue.append('watched Paterson (2016)'); // Unique - will sync
      await queue.append('watched Dune'); // Ambiguous - will skip
      await queue.append('watched nonexistent 9999'); // Not found - will skip

      mockClient.search
        .mockResolvedValueOnce([
          {
            score: 100,
            movie: {
              title: 'Paterson',
              year: 2016,
              ids: { trakt: 333, slug: 'paterson-2016', imdb: 'tt5247022', tmdb: 370755 },
            },
          },
        ])
        .mockResolvedValueOnce([
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
        ])
        .mockResolvedValueOnce([]);

      mockClient.getHistory.mockResolvedValue([]);
      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
      expect(result.data.skipped).toBe(2);
      expect(result.data.ambiguousEntries).toHaveLength(1);
    });

    it('should skip low confidence entries without searching', async () => {
      // Entry that results in empty title = low confidence
      await queue.append('watched');

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(1);
      // Should not have called search since confidence is low
      expect(mockClient.search).not.toHaveBeenCalled();
    });
  });

  describe('Duplicate Detection', () => {
    it('should skip entries that are already in recent history', async () => {
      await queue.append('watched Dune 2021');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 438631, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
          },
        },
      ]);

      // Simulate that this movie was already watched within 48 hours
      mockClient.getHistory.mockResolvedValue([
        {
          id: 999,
          watched_at: new Date().toISOString(),
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 438631 },
          },
        },
      ]);

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.skipped).toBe(1);
      // addToHistory should NOT have been called since it's a duplicate
      expect(mockClient.addToHistory).not.toHaveBeenCalled();
    });

    it('should allow duplicates when allowDuplicates is true', async () => {
      await queue.append('watched Dune 2021');

      mockClient.search.mockResolvedValue([
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 438631, slug: 'dune-2021', imdb: 'tt1160419', tmdb: 438631 },
          },
        },
      ]);

      // Even though it's in history...
      mockClient.getHistory.mockResolvedValue([
        {
          id: 999,
          watched_at: new Date().toISOString(),
          movie: { title: 'Dune', year: 2021, ids: { trakt: 438631 } },
        },
      ]);

      mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

      const result = await syncLogwatchQueue(mockClient as unknown as TraktClient, {
        queuePath,
        autoConfirm: true,
        allowDuplicates: true, // Force allow
      });

      expect(result.success).toBe(true);
      expect(result.data.synced).toBe(1);
      expect(mockClient.addToHistory).toHaveBeenCalled();
    });
  });
});

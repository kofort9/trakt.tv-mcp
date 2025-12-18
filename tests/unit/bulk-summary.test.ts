import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BulkSummaryBuilder } from '../../src/domain/trakt/bulk-summary.js';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import { ParsedWatchEntry } from '../../src/shared/nl-parser.js';

// Mock TraktClient
vi.mock('../../src/domain/trakt/trakt-client.js');

describe('BulkSummaryBuilder', () => {
  let mockClient: any;
  let builder: BulkSummaryBuilder;

  beforeEach(() => {
    mockClient = {
      search: vi.fn(),
    };
    builder = new BulkSummaryBuilder(mockClient as unknown as TraktClient);
  });

  const createParsedEntry = (overrides: Partial<ParsedWatchEntry> = {}): ParsedWatchEntry => ({
    title: 'Test Movie',
    type: 'movie',
    confidence: 'high',
    dateSource: 'parsed',
    watchedAt: '2025-12-16',
    isRecallPattern: false,
    ...overrides,
  });

  describe('buildSummary', () => {
    it('should classify resolved entries (1 match)', async () => {
      const mockSearchResult = [
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
            genres: ['Sci-Fi', 'Drama'],
            overview: 'A noble family...',
          },
        },
      ];

      mockClient.search.mockResolvedValue(mockSearchResult);

      const entries = [{ rawText: 'watched Dune', parsed: createParsedEntry({ title: 'Dune' }) }];

      const summary = await builder.buildSummary(entries);

      expect(summary.totalEntries).toBe(1);
      expect(summary.resolved).toBe(1);
      expect(summary.ambiguous).toBe(0);
      expect(summary.notFound).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.entries[0].searchStatus).toBe('resolved');
      expect(summary.entries[0].matches).toHaveLength(1);
    });

    it('should classify ambiguous entries (2+ matches)', async () => {
      const mockSearchResult = [
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
            genres: ['Sci-Fi'],
          },
        },
        {
          score: 90,
          movie: {
            title: 'Dune',
            year: 1984,
            ids: { trakt: 67890, slug: 'dune-1984', imdb: 'tt456', tmdb: 789 },
            genres: ['Sci-Fi'],
          },
        },
      ];

      mockClient.search.mockResolvedValue(mockSearchResult);

      const entries = [{ rawText: 'watched Dune', parsed: createParsedEntry({ title: 'Dune' }) }];

      const summary = await builder.buildSummary(entries);

      expect(summary.totalEntries).toBe(1);
      expect(summary.resolved).toBe(0);
      expect(summary.ambiguous).toBe(1);
      expect(summary.entries[0].searchStatus).toBe('ambiguous');
      expect(summary.entries[0].matches).toHaveLength(2);
    });

    it('should classify not found entries (0 matches)', async () => {
      mockClient.search.mockResolvedValue([]);

      const entries = [
        { rawText: 'watched Unknown Movie', parsed: createParsedEntry({ title: 'Unknown Movie' }) },
      ];

      const summary = await builder.buildSummary(entries);

      expect(summary.totalEntries).toBe(1);
      expect(summary.notFound).toBe(1);
      expect(summary.entries[0].searchStatus).toBe('not_found');
    });

    it('should handle search errors', async () => {
      mockClient.search.mockRejectedValue(new Error('API Error'));

      const entries = [{ rawText: 'watched Dune', parsed: createParsedEntry({ title: 'Dune' }) }];

      const summary = await builder.buildSummary(entries);

      expect(summary.totalEntries).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.entries[0].searchStatus).toBe('error');
      expect(summary.entries[0].error).toContain('API Error');
    });

    it('should process entries in parallel', async () => {
      const mockSearchResult = [
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ];

      mockClient.search.mockResolvedValue(mockSearchResult);

      const entries = [
        { rawText: 'watched Dune', parsed: createParsedEntry({ title: 'Dune' }) },
        { rawText: 'watched Inception', parsed: createParsedEntry({ title: 'Inception' }) },
        { rawText: 'watched The Matrix', parsed: createParsedEntry({ title: 'The Matrix' }) },
      ];

      const startTime = Date.now();
      await builder.buildSummary(entries);
      const duration = Date.now() - startTime;

      // If processed sequentially with 100ms delay each, would take ~300ms
      // Parallel should be much faster
      expect(duration).toBeLessThan(500);
    });

    it('should skip low confidence entries', async () => {
      const entries = [
        { rawText: 'something', parsed: createParsedEntry({ title: '', confidence: 'low' }) },
      ];

      const summary = await builder.buildSummary(entries);

      expect(summary.notFound).toBe(1);
      expect(summary.entries[0].searchStatus).toBe('not_found');
      expect(summary.entries[0].error).toContain('Low confidence');
    });

    it('should skip entries with missing title', async () => {
      const entries = [{ rawText: 'watched', parsed: createParsedEntry({ title: '' }) }];

      const summary = await builder.buildSummary(entries);

      expect(summary.notFound).toBe(1);
      expect(summary.entries[0].error).toContain('missing title');
    });

    it('should handle infer_from_search type by searching without type filter', async () => {
      const mockSearchResult = [
        {
          score: 100,
          movie: {
            title: 'Something',
            year: 2020,
            ids: { trakt: 12345, slug: 'something', imdb: 'tt123', tmdb: 123 },
          },
        },
      ];
      mockClient.search.mockResolvedValue(mockSearchResult);

      const entries = [
        {
          rawText: 'watched something',
          parsed: createParsedEntry({ title: 'Something', type: 'infer_from_search' }),
        },
      ];

      const summary = await builder.buildSummary(entries);

      // 'infer_from_search' type uses type-less search, letting Trakt determine the type
      expect(summary.resolved).toBe(1);
      expect(summary.errors).toBe(0);
      expect(summary.entries[0].matches?.[0].type).toBe('movie');
      // Verify search was called without type filter (undefined for type)
      expect(mockClient.search).toHaveBeenCalledWith('Something', undefined, undefined, {
        toolName: 'bulk_summary',
      });
    });

    it('should limit matches to top 3', async () => {
      const mockSearchResult = Array.from({ length: 10 }, (_, i) => ({
        score: 100 - i,
        movie: {
          title: `Movie ${i}`,
          year: 2020 + i,
          ids: { trakt: 1000 + i, slug: `movie-${i}`, imdb: `tt${i}`, tmdb: i },
        },
      }));

      mockClient.search.mockResolvedValue(mockSearchResult);

      const entries = [{ rawText: 'watched Movie', parsed: createParsedEntry({ title: 'Movie' }) }];

      const summary = await builder.buildSummary(entries);

      expect(summary.entries[0].matches).toHaveLength(3);
    });

    it('should handle episode searches', async () => {
      const mockSearchResult = [
        {
          score: 100,
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
            genres: ['Comedy', 'Drama'],
          },
        },
      ];

      mockClient.search.mockResolvedValue(mockSearchResult);

      const entries = [
        {
          rawText: 'watched The Bear S2E5',
          parsed: createParsedEntry({
            title: 'The Bear',
            type: 'episode',
            season: 2,
            episode: 5,
          }),
        },
      ];

      const summary = await builder.buildSummary(entries);

      expect(summary.resolved).toBe(1);
      expect(summary.entries[0].matches?.[0].type).toBe('show');
    });

    it('should return minimal match data (title, year, traktId, type)', async () => {
      // Note: genres, overview, score are intentionally stripped to reduce token cost
      const mockSearchResult = [
        {
          score: 100,
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
            genres: ['Sci-Fi', 'Drama', 'Adventure'],
            overview: 'A noble family becomes embroiled...',
          },
        },
      ];

      mockClient.search.mockResolvedValue(mockSearchResult);

      const entries = [{ rawText: 'watched Dune', parsed: createParsedEntry({ title: 'Dune' }) }];

      const summary = await builder.buildSummary(entries);

      const match = summary.entries[0].matches?.[0];
      expect(match?.title).toBe('Dune');
      expect(match?.year).toBe(2021);
      expect(match?.traktId).toBe(12345);
      expect(match?.type).toBe('movie');
      // Verbose fields are stripped to reduce token cost
      expect(match?.genres).toBeUndefined();
      expect(match?.overview).toBeUndefined();
      expect(match?.score).toBeUndefined();
    });
  });

  describe('formatTable', () => {
    it('should format resolved entries with checkmark', () => {
      const summary = {
        totalEntries: 1,
        resolved: 1,
        ambiguous: 0,
        notFound: 0,
        errors: 0,
        entries: [
          {
            index: 0,
            rawText: 'watched Dune',
            parsed: createParsedEntry({ title: 'Dune', year: 2021 }),
            searchStatus: 'resolved' as const,
            matches: [
              {
                title: 'Dune',
                year: 2021,
                traktId: 12345,
                type: 'movie' as const,
                genres: ['Sci-Fi'],
              },
            ],
          },
        ],
      };

      const table = builder.formatTable(summary);

      expect(table).toContain('✓');
      expect(table).toContain('Dune');
      expect(table).toContain('(2021)');
      expect(table).toContain('✅ Ready to proceed');
    });

    it('should format ambiguous entries with warning', () => {
      const summary = {
        totalEntries: 1,
        resolved: 0,
        ambiguous: 1,
        notFound: 0,
        errors: 0,
        entries: [
          {
            index: 0,
            rawText: 'watched Dune',
            parsed: createParsedEntry({ title: 'Dune' }),
            searchStatus: 'ambiguous' as const,
            matches: [
              {
                title: 'Dune',
                year: 2021,
                traktId: 12345,
                type: 'movie' as const,
                genres: ['Sci-Fi'],
              },
              {
                title: 'Dune',
                year: 1984,
                traktId: 67890,
                type: 'movie' as const,
                genres: ['Sci-Fi'],
              },
            ],
          },
        ],
      };

      const table = builder.formatTable(summary);

      expect(table).toContain('⚠️');
      expect(table).toContain('1. Dune (2021)');
      expect(table).toContain('2. Dune (1984)');
    });

    it('should format not found entries with X', () => {
      const summary = {
        totalEntries: 1,
        resolved: 0,
        ambiguous: 0,
        notFound: 1,
        errors: 0,
        entries: [
          {
            index: 0,
            rawText: 'watched Unknown',
            parsed: createParsedEntry({ title: 'Unknown' }),
            searchStatus: 'not_found' as const,
          },
        ],
      };

      const table = builder.formatTable(summary);

      expect(table).toContain('✗');
      expect(table).toContain('Unknown');
    });

    it('should include counts in header', () => {
      const summary = {
        totalEntries: 4,
        resolved: 1,
        ambiguous: 1,
        notFound: 1,
        errors: 1,
        entries: [],
      };

      const table = builder.formatTable(summary);

      expect(table).toContain('4 Entries');
      expect(table).toContain('✓ Resolved: 1');
      expect(table).toContain('⚠️  Ambiguous: 1');
      expect(table).toContain('✗ Not Found: 1');
      expect(table).toContain('🔴 Errors: 1');
    });

    it('should truncate long titles', () => {
      const longTitle =
        'The Lord of the Rings: The Fellowship of the Ring Extended Edition Special Edition';

      const summary = {
        totalEntries: 1,
        resolved: 1,
        ambiguous: 0,
        notFound: 0,
        errors: 0,
        entries: [
          {
            index: 0,
            rawText: longTitle,
            parsed: createParsedEntry({ title: longTitle }),
            searchStatus: 'resolved' as const,
          },
        ],
      };

      const table = builder.formatTable(summary);

      // Should contain truncation indicator
      expect(table).toContain('...');
    });

    it('should show error details', () => {
      const summary = {
        totalEntries: 1,
        resolved: 0,
        ambiguous: 0,
        notFound: 0,
        errors: 1,
        entries: [
          {
            index: 0,
            rawText: 'watched Dune',
            parsed: createParsedEntry({ title: 'Dune' }),
            searchStatus: 'error' as const,
            error: 'Network timeout',
          },
        ],
      };

      const table = builder.formatTable(summary);

      expect(table).toContain('🔴');
      expect(table).toContain('Error: Network timeout');
      expect(table).toContain('❌ Cannot proceed');
    });

    it('should show episode information', () => {
      const summary = {
        totalEntries: 1,
        resolved: 1,
        ambiguous: 0,
        notFound: 0,
        errors: 0,
        entries: [
          {
            index: 0,
            rawText: 'watched The Bear S2E5',
            parsed: createParsedEntry({
              title: 'The Bear',
              type: 'episode',
              season: 2,
              episode: 5,
            }),
            searchStatus: 'resolved' as const,
          },
        ],
      };

      const table = builder.formatTable(summary);

      expect(table).toContain('S2E5');
    });

    it('should handle empty summary', () => {
      const summary = {
        totalEntries: 0,
        resolved: 0,
        ambiguous: 0,
        notFound: 0,
        errors: 0,
        entries: [],
      };

      const table = builder.formatTable(summary);

      expect(table).toContain('0 Entries');
      expect(table).toContain('✅ Ready to proceed');
    });
  });
});

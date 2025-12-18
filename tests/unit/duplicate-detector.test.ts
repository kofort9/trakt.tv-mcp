import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DuplicateDetector } from '../../src/domain/trakt/duplicate-detector.js';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import { TraktWatchedItem } from '../../src/types/trakt.js';

// Mock TraktClient
vi.mock('../../src/domain/trakt/trakt-client.js');

describe('DuplicateDetector', () => {
  let mockClient: any;
  let detector: DuplicateDetector;

  beforeEach(() => {
    mockClient = {
      getHistory: vi.fn(),
    };
    detector = new DuplicateDetector(mockClient as unknown as TraktClient);
  });

  describe('checkRecent - Episodes', () => {
    it('should detect duplicate episode within 48 hours', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: oneHourAgo.toISOString(),
          action: 'watch',
          type: 'episode',
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
          },
          episode: {
            season: 2,
            number: 5,
            title: 'Episode 5',
            ids: { trakt: 67890, tvdb: 789, imdb: 'tt456', tmdb: 789 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      const result = await detector.checkRecent({
        type: 'episode',
        traktId: 12345,
        season: 2,
        episode: 5,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingEntry).toEqual(mockHistory[0]);
      expect(result.watchedAt).toBe(oneHourAgo.toISOString());
    });

    it('should not flag episode as duplicate outside window', async () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: threeDaysAgo.toISOString(),
          action: 'watch',
          type: 'episode',
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
          },
          episode: {
            season: 2,
            number: 5,
            title: 'Episode 5',
            ids: { trakt: 67890, tvdb: 789, imdb: 'tt456', tmdb: 789 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      const result = await detector.checkRecent({
        type: 'episode',
        traktId: 12345,
        season: 2,
        episode: 5,
      });

      expect(result.isDuplicate).toBe(false);
    });

    it('should match by traktId and season/episode', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: oneHourAgo.toISOString(),
          action: 'watch',
          type: 'episode',
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
          },
          episode: {
            season: 2,
            number: 5,
            title: 'Episode 5',
            ids: { trakt: 67890, tvdb: 789, imdb: 'tt456', tmdb: 789 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      // Different episode - should not match
      const result1 = await detector.checkRecent({
        type: 'episode',
        traktId: 12345,
        season: 2,
        episode: 6, // Different episode
      });
      expect(result1.isDuplicate).toBe(false);

      // Different show - should not match
      const result2 = await detector.checkRecent({
        type: 'episode',
        traktId: 99999, // Different show
        season: 2,
        episode: 5,
      });
      expect(result2.isDuplicate).toBe(false);

      // Same show and episode - should match
      const result3 = await detector.checkRecent({
        type: 'episode',
        traktId: 12345,
        season: 2,
        episode: 5,
      });
      expect(result3.isDuplicate).toBe(true);
    });
  });

  describe('checkRecent - Movies', () => {
    it('should detect duplicate movie within 48 hours', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: oneHourAgo.toISOString(),
          action: 'watch',
          type: 'movie',
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      const result = await detector.checkRecent({
        type: 'movie',
        traktId: 12345,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingEntry).toEqual(mockHistory[0]);
      expect(result.watchedAt).toBe(oneHourAgo.toISOString());
    });

    it('should not flag movie as duplicate outside window', async () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: threeDaysAgo.toISOString(),
          action: 'watch',
          type: 'movie',
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      const result = await detector.checkRecent({
        type: 'movie',
        traktId: 12345,
      });

      expect(result.isDuplicate).toBe(false);
    });

    it('should match movie by traktId', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: oneHourAgo.toISOString(),
          action: 'watch',
          type: 'movie',
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      // Different movie - should not match
      const result1 = await detector.checkRecent({
        type: 'movie',
        traktId: 99999,
      });
      expect(result1.isDuplicate).toBe(false);

      // Same movie - should match
      const result2 = await detector.checkRecent({
        type: 'movie',
        traktId: 12345,
      });
      expect(result2.isDuplicate).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty history', async () => {
      mockClient.getHistory.mockResolvedValue([]);

      const result = await detector.checkRecent({
        type: 'movie',
        traktId: 12345,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.existingEntry).toBeUndefined();
    });

    it('should handle API errors gracefully', async () => {
      mockClient.getHistory.mockRejectedValue(new Error('API Error'));

      const result = await detector.checkRecent({
        type: 'movie',
        traktId: 12345,
      });

      // Should not throw, should return false
      expect(result.isDuplicate).toBe(false);
    });

    it('should handle malformed history responses', async () => {
      mockClient.getHistory.mockResolvedValue(null);

      const result = await detector.checkRecent({
        type: 'movie',
        traktId: 12345,
      });

      expect(result.isDuplicate).toBe(false);
    });

    it('should handle history with missing episode data', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: oneHourAgo.toISOString(),
          action: 'watch',
          type: 'episode',
          show: {
            title: 'The Bear',
            year: 2022,
            ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
          },
          // Missing episode data
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      const result = await detector.checkRecent({
        type: 'episode',
        traktId: 12345,
        season: 2,
        episode: 5,
      });

      // Should not match without episode data
      expect(result.isDuplicate).toBe(false);
    });

    it('should respect custom window hours', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: twoHoursAgo.toISOString(),
          action: 'watch',
          type: 'movie',
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      // With 1-hour window - should not find
      const result1 = await detector.checkRecent(
        {
          type: 'movie',
          traktId: 12345,
        },
        1
      );
      expect(result1.isDuplicate).toBe(false);

      // With 3-hour window - should find
      const result2 = await detector.checkRecent(
        {
          type: 'movie',
          traktId: 12345,
        },
        3
      );
      expect(result2.isDuplicate).toBe(true);
    });

    it('should handle concurrent checks', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: oneHourAgo.toISOString(),
          action: 'watch',
          type: 'movie',
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      // Run multiple checks concurrently
      const results = await Promise.all([
        detector.checkRecent({ type: 'movie', traktId: 12345 }),
        detector.checkRecent({ type: 'movie', traktId: 12345 }),
        detector.checkRecent({ type: 'movie', traktId: 99999 }),
      ]);

      expect(results[0].isDuplicate).toBe(true);
      expect(results[1].isDuplicate).toBe(true);
      expect(results[2].isDuplicate).toBe(false);
    });

    it('should handle history with multiple entries', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const mockHistory: TraktWatchedItem[] = [
        {
          watched_at: oneHourAgo.toISOString(),
          action: 'watch',
          type: 'movie',
          movie: {
            title: 'Dune',
            year: 2021,
            ids: { trakt: 12345, slug: 'dune-2021', imdb: 'tt123', tmdb: 456 },
          },
        },
        {
          watched_at: twoHoursAgo.toISOString(),
          action: 'watch',
          type: 'movie',
          movie: {
            title: 'Inception',
            year: 2010,
            ids: { trakt: 67890, slug: 'inception', imdb: 'tt456', tmdb: 789 },
          },
        },
      ];

      mockClient.getHistory.mockResolvedValue(mockHistory);

      // Should find the first match
      const result = await detector.checkRecent({
        type: 'movie',
        traktId: 12345,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingEntry?.movie?.title).toBe('Dune');
    });
  });
});


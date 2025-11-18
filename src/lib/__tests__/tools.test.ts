import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraktClient } from '../trakt-client.js';
import * as tools from '../tools.js';
import { TraktConfig } from '../../types/trakt.js';
import { TraktOAuth } from '../oauth.js';

// Create a mock TraktClient
const createMockClient = (): TraktClient => {
  const config: TraktConfig = {
    clientId: 'test-id',
    clientSecret: 'test-secret',
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
    apiVersion: '2',
    apiBaseUrl: 'https://api.trakt.tv',
  };

  const oauth = {
    isAuthenticated: vi.fn().mockReturnValue(true),
    getAccessToken: vi.fn().mockResolvedValue('test-token'),
  } as unknown as TraktOAuth;

  return new TraktClient(config, oauth);
};

describe('tools', () => {
  let mockClient: TraktClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('searchEpisode', () => {
    it('should find episode successfully', async () => {
      vi.spyOn(mockClient, 'search').mockResolvedValue([
        {
          type: 'show',
          score: 100,
          show: {
            title: 'Breaking Bad',
            ids: { trakt: 1, slug: 'breaking-bad', tvdb: 81189 },
          },
        },
      ]);

      vi.spyOn(mockClient, 'searchEpisode').mockResolvedValue({
        season: 1,
        number: 1,
        title: 'Pilot',
        ids: { trakt: 73640, tvdb: 349232 },
      });

      const result = await tools.searchEpisode(mockClient, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Pilot');
      }
    });

    it('should return error when show not found', async () => {
      vi.spyOn(mockClient, 'search').mockResolvedValue([]);

      const result = await tools.searchEpisode(mockClient, {
        showName: 'Unknown Show',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should validate season and episode numbers', async () => {
      const result = await tools.searchEpisode(mockClient, {
        showName: 'Test Show',
        season: -1,
        episode: 1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('logWatch', () => {
    it('should log episode successfully', async () => {
      vi.spyOn(mockClient, 'search').mockResolvedValue([
        {
          type: 'show',
          score: 100,
          show: {
            title: 'Test Show',
            ids: { trakt: 1, slug: 'test-show' },
          },
        },
      ]);

      vi.spyOn(mockClient, 'searchEpisode').mockResolvedValue({
        season: 1,
        number: 1,
        title: 'Test Episode',
        ids: { trakt: 1 },
      });

      vi.spyOn(mockClient, 'addToHistory').mockResolvedValue({
        added: { episodes: 1, movies: 0 },
        not_found: { movies: [], shows: [], seasons: [], episodes: [] },
      });

      const result = await tools.logWatch(mockClient, {
        type: 'episode',
        showName: 'Test Show',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.added.episodes).toBe(1);
      }
    });

    it('should log movie successfully', async () => {
      vi.spyOn(mockClient, 'search').mockResolvedValue([
        {
          type: 'movie',
          score: 100,
          movie: {
            title: 'Test Movie',
            ids: { trakt: 1, slug: 'test-movie' },
          },
        },
      ]);

      vi.spyOn(mockClient, 'addToHistory').mockResolvedValue({
        added: { episodes: 0, movies: 1 },
        not_found: { movies: [], shows: [], seasons: [], episodes: [] },
      });

      const result = await tools.logWatch(mockClient, {
        type: 'movie',
        movieName: 'Test Movie',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.added.movies).toBe(1);
      }
    });

    it('should validate required fields for episodes', async () => {
      const result = await tools.logWatch(mockClient, {
        type: 'episode',
        showName: 'Test',
        // Missing season and episode
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should validate required fields for movies', async () => {
      const result = await tools.logWatch(mockClient, {
        type: 'movie',
        // Missing movieName
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('bulkLog', () => {
    it('should log multiple episodes successfully', async () => {
      vi.spyOn(mockClient, 'search').mockResolvedValue([
        {
          type: 'show',
          score: 100,
          show: {
            title: 'Test Show',
            ids: { trakt: 1, slug: 'test-show' },
          },
        },
      ]);

      vi.spyOn(mockClient, 'addToHistory').mockResolvedValue({
        added: { episodes: 5, movies: 0 },
        not_found: { movies: [], shows: [], seasons: [], episodes: [] },
      });

      const result = await tools.bulkLog(mockClient, {
        type: 'episodes',
        showName: 'Test Show',
        season: 1,
        episodes: '1-5',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.added.episodes).toBe(5);
      }
    });

    it('should log multiple movies successfully', async () => {
      vi.spyOn(mockClient, 'search')
        .mockResolvedValueOnce([
          {
            type: 'movie',
            score: 100,
            movie: { title: 'Movie 1', ids: { trakt: 1, slug: 'movie-1' } },
          },
        ])
        .mockResolvedValueOnce([
          {
            type: 'movie',
            score: 100,
            movie: { title: 'Movie 2', ids: { trakt: 2, slug: 'movie-2' } },
          },
        ]);

      vi.spyOn(mockClient, 'addToHistory').mockResolvedValue({
        added: { episodes: 0, movies: 2 },
        not_found: { movies: [], shows: [], seasons: [], episodes: [] },
      });

      const result = await tools.bulkLog(mockClient, {
        type: 'movies',
        movieNames: ['Movie 1', 'Movie 2'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.added.movies).toBe(2);
      }
    });

    it('should validate episode range format', async () => {
      const result = await tools.bulkLog(mockClient, {
        type: 'episodes',
        showName: 'Test',
        season: 1,
        episodes: 'invalid',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('should retrieve history successfully', async () => {
      const mockHistory = [
        {
          watched_at: '2024-01-01T12:00:00.000Z',
          action: 'watch',
          type: 'episode',
          episode: { season: 1, number: 1, title: 'Test', ids: { trakt: 1 } },
          show: { title: 'Test Show', ids: { trakt: 1, slug: 'test-show' } },
        },
      ];

      vi.spyOn(mockClient, 'getHistory').mockResolvedValue(mockHistory);

      const result = await tools.getHistory(mockClient, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockHistory);
      }
    });

    it('should apply limit when specified', async () => {
      const mockHistory = Array(100).fill({
        watched_at: '2024-01-01T12:00:00.000Z',
        action: 'watch',
        type: 'episode',
      });

      vi.spyOn(mockClient, 'getHistory').mockResolvedValue(mockHistory);

      const result = await tools.getHistory(mockClient, { limit: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(10);
      }
    });
  });

  describe('summarizeHistory', () => {
    it('should summarize history correctly', async () => {
      const mockHistory = [
        {
          watched_at: new Date().toISOString(),
          action: 'watch',
          type: 'episode',
          episode: { season: 1, number: 1, title: 'Ep1', ids: { trakt: 1 } },
          show: {
            title: 'Show 1',
            ids: { trakt: 1, slug: 'show-1' },
          },
        },
        {
          watched_at: new Date().toISOString(),
          action: 'watch',
          type: 'episode',
          episode: { season: 1, number: 2, title: 'Ep2', ids: { trakt: 2 } },
          show: {
            title: 'Show 1',
            ids: { trakt: 1, slug: 'show-1' },
          },
        },
        {
          watched_at: new Date().toISOString(),
          action: 'watch',
          type: 'movie',
          movie: { title: 'Movie 1', ids: { trakt: 1, slug: 'movie-1' } },
        },
      ];

      vi.spyOn(mockClient, 'getHistory').mockResolvedValue(mockHistory);

      const result = await tools.summarizeHistory(mockClient, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total_watched).toBe(3);
        expect(result.data.unique_shows).toBe(1);
        expect(result.data.unique_movies).toBe(1);
        expect(result.data.total_episodes).toBe(2);
        expect(result.data.most_watched_show?.episodes_watched).toBe(2);
      }
    });
  });

  describe('getUpcoming', () => {
    it('should get upcoming episodes', async () => {
      const mockCalendar = [
        {
          first_aired: '2024-01-15T20:00:00.000Z',
          episode: {
            season: 1,
            number: 5,
            title: 'Next Episode',
            ids: { trakt: 1 },
          },
          show: { title: 'Test Show', ids: { trakt: 1, slug: 'test-show' } },
        },
      ];

      vi.spyOn(mockClient, 'getCalendar').mockResolvedValue(mockCalendar);

      const result = await tools.getUpcoming(mockClient, { days: 7 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockCalendar);
      }
    });

    it('should validate days parameter', async () => {
      const result = await tools.getUpcoming(mockClient, { days: 31 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('followShow', () => {
    it('should follow show successfully', async () => {
      const mockShow = {
        title: 'Test Show',
        ids: { trakt: 1, slug: 'test-show' },
      };

      vi.spyOn(mockClient, 'search').mockResolvedValue([
        { type: 'show', score: 100, show: mockShow },
      ]);

      vi.spyOn(mockClient, 'addToWatchlist').mockResolvedValue({});

      const result = await tools.followShow(mockClient, {
        showName: 'Test Show',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.show.title).toBe('Test Show');
        expect(result.data.added).toBe(true);
      }
    });

    it('should return error when show not found', async () => {
      vi.spyOn(mockClient, 'search').mockResolvedValue([]);

      const result = await tools.followShow(mockClient, {
        showName: 'Unknown Show',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('unfollowShow', () => {
    it('should unfollow show successfully', async () => {
      const mockShow = {
        title: 'Test Show',
        ids: { trakt: 1, slug: 'test-show' },
      };

      vi.spyOn(mockClient, 'search').mockResolvedValue([
        { type: 'show', score: 100, show: mockShow },
      ]);

      vi.spyOn(mockClient, 'removeFromWatchlist').mockResolvedValue({});

      const result = await tools.unfollowShow(mockClient, {
        showName: 'Test Show',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.show.title).toBe('Test Show');
        expect(result.data.removed).toBe(true);
      }
    });

    it('should return error when show not found', async () => {
      vi.spyOn(mockClient, 'search').mockResolvedValue([]);

      const result = await tools.unfollowShow(mockClient, {
        showName: 'Unknown Show',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });
});

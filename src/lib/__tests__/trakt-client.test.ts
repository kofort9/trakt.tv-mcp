import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { TraktClient } from '../trakt-client.js';
import { TraktOAuth } from '../oauth.js';
import { TraktConfig } from '../../types/trakt.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('TraktClient', () => {
  let config: TraktConfig;
  let mockOAuth: TraktOAuth;
  let client: TraktClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    config = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
      apiVersion: '2',
      apiBaseUrl: 'https://api.trakt.tv',
    };

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn((onFulfilled) => {
            mockAxiosInstance._requestInterceptor = onFulfilled;
          }),
        },
        response: {
          use: vi.fn(),
        },
      },
    };

    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

    // Mock OAuth
    mockOAuth = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
    } as any;

    client = new TraktClient(config, mockOAuth);
  });

  describe('initialization', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.trakt.tv',
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': 'test-client-id',
        },
      });
    });

    it('should set up request and response interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('HTTP methods', () => {
    it('should make GET request', async () => {
      const mockData = { id: 1, title: 'Test' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const result = await client.get('/test');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', undefined);
      expect(result).toEqual(mockData);
    });

    it('should make POST request', async () => {
      const mockData = { success: true };
      const postData = { item: 'test' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockData });

      const result = await client.post('/test', postData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/test', postData, undefined);
      expect(result).toEqual(mockData);
    });

    it('should make PUT request', async () => {
      const mockData = { updated: true };
      const putData = { item: 'test' };
      mockAxiosInstance.put.mockResolvedValue({ data: mockData });

      const result = await client.put('/test', putData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/test', putData, undefined);
      expect(result).toEqual(mockData);
    });

    it('should make DELETE request', async () => {
      const mockData = { deleted: true };
      mockAxiosInstance.delete.mockResolvedValue({ data: mockData });

      const result = await client.delete('/test');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/test', undefined);
      expect(result).toEqual(mockData);
    });
  });

  describe('search', () => {
    it('should search without type filter', async () => {
      const mockResults = [{ type: 'show', show: { title: 'Test Show' } }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

      const result = await client.search('test query');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search/show,movie', {
        params: { query: 'test query' },
      });
      expect(result).toEqual(mockResults);
    });

    it('should search with type filter', async () => {
      const mockResults = [{ type: 'show', show: { title: 'Test Show' } }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

      const result = await client.search('test query', 'show');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search/show', {
        params: { query: 'test query', type: 'show' },
      });
      expect(result).toEqual(mockResults);
    });

    it('should search with year filter', async () => {
      const mockResults = [{ type: 'movie', movie: { title: 'Test Movie' } }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

      const result = await client.search('test query', 'movie', 2020);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search/movie', {
        params: { query: 'test query', type: 'movie', years: 2020 },
      });
      expect(result).toEqual(mockResults);
    });
  });

  describe('show operations', () => {
    it('should get show information', async () => {
      const mockShow = { title: 'Test Show', year: 2020 };
      mockAxiosInstance.get.mockResolvedValue({ data: mockShow });

      const result = await client.getShow('test-show');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/shows/test-show', { params: {} });
      expect(result).toEqual(mockShow);
    });

    it('should get show information with extended details', async () => {
      const mockShow = { title: 'Test Show', year: 2020, overview: 'Test overview' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockShow });

      const result = await client.getShow('test-show', 'full');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/shows/test-show', {
        params: { extended: 'full' },
      });
      expect(result).toEqual(mockShow);
    });

    it('should get season episodes', async () => {
      const mockEpisodes = [
        { season: 1, number: 1, title: 'Episode 1' },
        { season: 1, number: 2, title: 'Episode 2' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockEpisodes });

      const result = await client.getSeasonEpisodes('test-show', 1);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/shows/test-show/seasons/1', undefined);
      expect(result).toEqual(mockEpisodes);
    });
  });

  describe('history operations', () => {
    it('should get history without filters', async () => {
      const mockHistory = [{ watched_at: '2024-01-01', type: 'episode' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockHistory });

      const result = await client.getHistory();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sync/history', {
        params: { page: 1, limit: 50 },
      });
      expect(result).toEqual(mockHistory);
    });

    it('should get history with type filter', async () => {
      const mockHistory = [{ watched_at: '2024-01-01', type: 'show' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockHistory });

      const result = await client.getHistory('shows');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sync/history/shows', {
        params: { page: 1, limit: 50 },
      });
      expect(result).toEqual(mockHistory);
    });

    it('should add items to history', async () => {
      const items = { episodes: [{ watched_at: '2024-01-01' }] };
      const mockResponse = { added: { episodes: 1 } };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await client.addToHistory(items);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/sync/history', items, undefined);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('watchlist operations', () => {
    it('should get watchlist', async () => {
      const mockWatchlist = [{ listed_at: '2024-01-01', type: 'show' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockWatchlist });

      const result = await client.getWatchlist();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/sync/watchlist', undefined);
      expect(result).toEqual(mockWatchlist);
    });

    it('should add items to watchlist', async () => {
      const items = { shows: [{ ids: { trakt: 123 } }] };
      const mockResponse = { added: { shows: 1 } };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await client.addToWatchlist(items);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/sync/watchlist', items, undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should remove items from watchlist', async () => {
      const items = { shows: [{ ids: { trakt: 123 } }] };
      const mockResponse = { deleted: { shows: 1 } };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await client.removeFromWatchlist(items);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/sync/watchlist/remove',
        items,
        undefined
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('calendar operations', () => {
    it('should get calendar for shows', async () => {
      const mockCalendar = [{ first_aired: '2024-01-01', episode: {} }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockCalendar });

      const result = await client.getCalendar('2024-01-01', 7);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/calendars/my/shows/2024-01-01/7',
        undefined
      );
      expect(result).toEqual(mockCalendar);
    });
  });

  describe('cache integration', () => {
    describe('search caching', () => {
      it('should cache search results', async () => {
        const mockResults = [{ type: 'show', show: { title: 'Breaking Bad' } }];
        mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

        // First call - should hit API
        const result1 = await client.search('Breaking Bad', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(mockResults);

        // Second call - should hit cache
        const result2 = await client.search('Breaking Bad', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1); // Still only 1 API call
        expect(result2).toEqual(mockResults);
      });

      it('should generate different cache keys for different search params', async () => {
        const mockResults1 = [{ type: 'movie', movie: { title: 'Dune', year: 2021 } }];
        const mockResults2 = [{ type: 'movie', movie: { title: 'Dune', year: 1984 } }];

        mockAxiosInstance.get
          .mockResolvedValueOnce({ data: mockResults1 })
          .mockResolvedValueOnce({ data: mockResults2 });

        // Different year = different cache key
        await client.search('Dune', 'movie', 2021);
        await client.search('Dune', 'movie', 1984);

        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      });

      it('should generate different cache keys for different types', async () => {
        const mockShowResults = [{ type: 'show', show: { title: 'The Matrix' } }];
        const mockMovieResults = [{ type: 'movie', movie: { title: 'The Matrix' } }];

        mockAxiosInstance.get
          .mockResolvedValueOnce({ data: mockShowResults })
          .mockResolvedValueOnce({ data: mockMovieResults });

        await client.search('The Matrix', 'show');
        await client.search('The Matrix', 'movie');

        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      });

      it('should be case-insensitive for queries', async () => {
        const mockResults = [{ type: 'show', show: { title: 'Breaking Bad' } }];
        mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

        // First call with lowercase
        await client.search('breaking bad', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

        // Second call with uppercase - should hit cache
        await client.search('BREAKING BAD', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

        // Third call with mixed case - should hit cache
        await client.search('Breaking Bad', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      });

      it('should trim whitespace in queries', async () => {
        const mockResults = [{ type: 'show', show: { title: 'Breaking Bad' } }];
        mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

        await client.search('  Breaking Bad  ', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

        // Should hit cache despite different whitespace
        await client.search('Breaking Bad', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      });
    });

    describe('episode caching', () => {
      it('should cache episode lookups', async () => {
        const mockEpisode = { season: 1, number: 1, title: 'Pilot' };
        mockAxiosInstance.get.mockResolvedValue({ data: mockEpisode });

        // First call - should hit API
        const result1 = await client.searchEpisode('breaking-bad', 1, 1);
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(mockEpisode);

        // Second call - should hit cache
        const result2 = await client.searchEpisode('breaking-bad', 1, 1);
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1); // Still only 1 API call
        expect(result2).toEqual(mockEpisode);
      });

      it('should generate different cache keys for different episodes', async () => {
        const mockEp1 = { season: 1, number: 1, title: 'Pilot' };
        const mockEp2 = { season: 1, number: 2, title: 'Episode 2' };

        mockAxiosInstance.get
          .mockResolvedValueOnce({ data: mockEp1 })
          .mockResolvedValueOnce({ data: mockEp2 });

        await client.searchEpisode('breaking-bad', 1, 1);
        await client.searchEpisode('breaking-bad', 1, 2);

        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      });
    });

    describe('cache metrics', () => {
      it('should track cache metrics', async () => {
        const mockResults = [{ type: 'show', show: { title: 'Test' } }];
        mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

        // Initial metrics
        let metrics = client.getCacheMetrics();
        expect(metrics.hits).toBe(0);
        expect(metrics.misses).toBe(0);
        expect(metrics.hitRate).toBe(0);

        // First call - cache miss
        await client.search('Test', 'show');
        metrics = client.getCacheMetrics();
        expect(metrics.misses).toBe(1);
        expect(metrics.hits).toBe(0);
        expect(metrics.hitRate).toBe(0);

        // Second call - cache hit
        await client.search('Test', 'show');
        metrics = client.getCacheMetrics();
        expect(metrics.hits).toBe(1);
        expect(metrics.misses).toBe(1);
        expect(metrics.hitRate).toBe(0.5);

        // Third call - cache hit
        await client.search('Test', 'show');
        metrics = client.getCacheMetrics();
        expect(metrics.hits).toBe(2);
        expect(metrics.misses).toBe(1);
        expect(metrics.hitRate).toBeCloseTo(0.667, 2);
      });

      it('should return correct cache size', async () => {
        const mockResults = [{ type: 'show', show: { title: 'Test' } }];
        mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

        expect(client.getCacheMetrics().size).toBe(0);

        await client.search('Test1', 'show');
        expect(client.getCacheMetrics().size).toBe(1);

        await client.search('Test2', 'show');
        expect(client.getCacheMetrics().size).toBe(2);

        await client.search('Test1', 'show'); // Cache hit, size unchanged
        expect(client.getCacheMetrics().size).toBe(2);
      });
    });

    describe('cache management', () => {
      it('should clear cache', async () => {
        const mockResults = [{ type: 'show', show: { title: 'Test' } }];
        mockAxiosInstance.get.mockResolvedValue({ data: mockResults });

        // Add to cache
        await client.search('Test', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

        // Clear cache
        client.clearSearchCache();
        expect(client.getCacheMetrics().size).toBe(0);

        // Next call should hit API again
        await client.search('Test', 'show');
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      });

      it('should prune cache (no-op for non-expired entries)', () => {
        // With default 1-hour TTL, entries won't expire in test
        const removed = client.pruneCache();
        expect(removed).toBe(0);
      });
    });
  });
});

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
});

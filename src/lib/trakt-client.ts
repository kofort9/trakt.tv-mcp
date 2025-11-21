import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { TraktConfig, TraktSettings } from '../types/trakt.js';
import { TraktOAuth } from './oauth.js';
import { logger } from './logger.js';
import { LRUCache, generateSearchCacheKey, generateEpisodeCacheKey } from './cache.js';

/**
 * Rate limiter for API requests
 */
class RateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindow: number;

  constructor(maxRequests: number = 1000, timeWindowMs: number = 300000) {
    // Trakt allows 1000 requests per 5 minutes (300000ms)
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    // Remove requests outside the time window
    this.requestTimes = this.requestTimes.filter((time) => now - time < this.timeWindow);

    if (this.requestTimes.length >= this.maxRequests) {
      // Calculate how long to wait
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.timeWindow - (now - oldestRequest);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.requestTimes.push(now);
  }
}

/**
 * Trakt.tv API client with authentication and rate limiting
 */
export class TraktClient {
  private oauth: TraktOAuth;
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private searchCache: LRUCache<string, unknown>;

  constructor(config: TraktConfig, oauth: TraktOAuth) {
    this.oauth = oauth;
    this.rateLimiter = new RateLimiter();

    // Initialize search cache with default settings
    this.searchCache = new LRUCache({
      maxSize: 500, // Cache up to 500 unique searches
      ttlMs: 3600000, // 1 hour TTL
      enableMetrics: true,
    });

    this.client = axios.create({
      baseURL: config.apiBaseUrl,
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': config.apiVersion,
        'trakt-api-key': config.clientId,
      },
    });

    // Add request interceptor for authentication and logging
    this.client.interceptors.request.use(
      async (config) => {
        await this.rateLimiter.waitIfNeeded();

        if (this.oauth.isAuthenticated()) {
          const token = await this.oauth.getAccessToken();
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Generate correlation ID and log request initiation
        const correlationId = logger.generateCorrelationId();
        const startTime = Date.now();

        // Store metadata in config for use in response interceptor
        (
          config as AxiosRequestConfig & {
            _correlationId?: string;
            _startTime?: number;
            _toolName?: string;
          }
        )._correlationId = correlationId;
        (
          config as AxiosRequestConfig & {
            _correlationId?: string;
            _startTime?: number;
            _toolName?: string;
          }
        )._startTime = startTime;

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for logging and error handling with retry logic
    this.client.interceptors.response.use(
      (response) => {
        // Log successful response
        const config = response.config as AxiosRequestConfig & {
          _correlationId?: string;
          _startTime?: number;
          _toolName?: string;
        };
        const correlationId = config._correlationId || logger.generateCorrelationId();
        const startTime = config._startTime || Date.now();

        const partialLog = logger.createRequestLog(config, correlationId, config._toolName);
        const fullLog = logger.completeRequestLog(partialLog, response, startTime);
        logger.logRequest(fullLog);

        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as AxiosRequestConfig & {
          _retryCount?: number;
          _correlationId?: string;
          _startTime?: number;
          _toolName?: string;
        };

        // Log error before handling (unless it's a retry)
        if (!config._retryCount || config._retryCount === 0) {
          const correlationId = config._correlationId || logger.generateCorrelationId();
          const startTime = config._startTime || Date.now();
          const partialLog = logger.createRequestLog(config, correlationId, config._toolName);
          const fullLog = logger.completeRequestLogWithError(partialLog, error, startTime);
          logger.logRequest(fullLog);
        }

        if (error.response?.status === 401 || error.response?.status === 403) {
          // Token expired or invalid (Trakt.tv returns 403 for auth failures)
          throw new Error('Authentication failed. Please re-authenticate.');
        }

        if (error.response?.status === 429) {
          // Rate limit exceeded - implement exponential backoff retry
          const retryCount = config._retryCount || 0;
          const maxRetries = 3;

          if (retryCount < maxRetries) {
            // Calculate exponential backoff delay: 1s, 2s, 4s
            const backoffDelay = Math.pow(2, retryCount) * 1000;

            console.warn(
              `Rate limit hit. Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries})`
            );

            // Wait for backoff delay
            await new Promise((resolve) => setTimeout(resolve, backoffDelay));

            // Increment retry count
            config._retryCount = retryCount + 1;

            // Retry the request
            return this.client.request(config);
          } else {
            // Max retries exceeded
            throw new Error(
              'Rate limit exceeded after multiple retries. Please wait a few minutes and try again.'
            );
          }
        }

        throw error;
      }
    );
  }

  /**
   * Make a GET request to the Trakt API
   */
  async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(endpoint, config);
    return response.data;
  }

  /**
   * Make a POST request to the Trakt API
   */
  async post<T>(endpoint: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(endpoint, data, config);
    return response.data;
  }

  /**
   * Make a PUT request to the Trakt API
   */
  async put<T>(endpoint: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(endpoint, data, config);
    return response.data;
  }

  /**
   * Make a DELETE request to the Trakt API
   */
  async delete<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(endpoint, config);
    return response.data;
  }

  /**
   * Search for shows and movies (with caching)
   */
  async search(query: string, type?: 'show' | 'movie', year?: number) {
    const cacheKey = generateSearchCacheKey(query, type, year);

    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached !== undefined) {
      console.error(`[CACHE_HIT] Search: "${query}" (${type || 'all'}${year ? `, ${year}` : ''})`);
      return cached;
    }

    // Cache miss - fetch from API
    console.error(`[CACHE_MISS] Search: "${query}" (${type || 'all'}${year ? `, ${year}` : ''})`);

    const params: Record<string, string | number> = { query };
    if (type) params.type = type;
    if (year) params.years = year;

    const result = await this.get(`/search/${type || 'show,movie'}`, { params });

    // Store in cache
    this.searchCache.set(cacheKey, result);

    return result;
  }

  /**
   * Search for a specific episode (with caching)
   */
  async searchEpisode(showId: string, season: number, episode: number) {
    const cacheKey = generateEpisodeCacheKey(showId, season, episode);

    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached !== undefined) {
      console.error(`[CACHE_HIT] Episode: ${showId} S${season}E${episode}`);
      return cached;
    }

    // Cache miss - fetch from API
    console.error(`[CACHE_MISS] Episode: ${showId} S${season}E${episode}`);

    const result = await this.get(`/shows/${showId}/seasons/${season}/episodes/${episode}`);

    // Store in cache
    this.searchCache.set(cacheKey, result);

    return result;
  }

  /**
   * Get show information
   */
  async getShow(id: string, extended?: 'full') {
    const params = extended ? { extended } : {};
    return this.get(`/shows/${id}`, { params });
  }

  /**
   * Get season episodes
   */
  async getSeasonEpisodes(showId: string, season: number) {
    return this.get(`/shows/${showId}/seasons/${season}`);
  }

  /**
   * Get user's settings (includes profile info)
   */
  async getUserSettings() {
    return this.get<TraktSettings>('/users/settings');
  }

  /**
   * Get user's watch history
   */
  async getHistory(type?: 'shows' | 'movies', startAt?: string, endAt?: string, page = 1) {
    const params: Record<string, string | number> = { page, limit: 50 };
    if (startAt) params.start_at = startAt;
    if (endAt) params.end_at = endAt;

    const endpoint = type ? `/sync/history/${type}` : '/sync/history';
    return this.get(endpoint, { params });
  }

  /**
   * Add items to watch history
   */
  async addToHistory(items: unknown) {
    return this.post('/sync/history', items);
  }

  /**
   * Get user's watchlist
   */
  async getWatchlist(type?: 'shows' | 'movies') {
    const endpoint = type ? `/sync/watchlist/${type}` : '/sync/watchlist';
    return this.get(endpoint);
  }

  /**
   * Add items to watchlist
   */
  async addToWatchlist(items: unknown) {
    return this.post('/sync/watchlist', items);
  }

  /**
   * Remove items from watchlist
   */
  async removeFromWatchlist(items: unknown) {
    return this.post('/sync/watchlist/remove', items);
  }

  /**
   * Get calendar for user's shows
   */
  async getCalendar(startDate: string, days = 7) {
    return this.get(`/calendars/my/shows/${startDate}/${days}`);
  }

  /**
   * Get watched progress for a show
   */
  async getShowProgress(showId: string) {
    return this.get(`/shows/${showId}/progress/watched`);
  }

  /**
   * Get user's collected shows
   */
  async getCollectedShows() {
    return this.get('/sync/collection/shows');
  }

  /**
   * Remove items from history
   */
  async removeFromHistory(items: unknown) {
    return this.post('/sync/history/remove', items);
  }

  /**
   * Get cache metrics (for debugging/monitoring)
   */
  getCacheMetrics() {
    return this.searchCache.getMetrics();
  }

  /**
   * Clear search cache (for testing or manual refresh)
   */
  clearSearchCache(): void {
    this.searchCache.clear();
    console.error('[CACHE] Search cache cleared');
  }

  /**
   * Prune expired cache entries
   * Returns number of entries removed
   */
  pruneCache(): number {
    const removed = this.searchCache.prune();
    if (removed > 0) {
      console.error(`[CACHE] Pruned ${removed} expired entries`);
    }
    return removed;
  }
}

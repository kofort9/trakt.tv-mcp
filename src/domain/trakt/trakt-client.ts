import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { TraktConfig, TraktSettings } from '../../types/trakt.js';
import { TraktOAuth } from './oauth.js';
import { logger } from '../../core/logger.js';
import { LRUCache, generateSearchCacheKey, generateEpisodeCacheKey } from './cache.js';
import { logCacheEvent } from '../../core/langfuse.js';
import { logDebug, logInfo, logWarn } from '../../core/logging.js';

type TraktRequestMetadata = {
  _toolName?: string;
  _correlationId?: string;
  _startTime?: number;
  _retryCount?: number;
};

type TraktRequestConfig = InternalAxiosRequestConfig & TraktRequestMetadata;

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
  private addToolName(
    config: AxiosRequestConfig | undefined,
    toolName?: string
  ): AxiosRequestConfig & TraktRequestMetadata {
    return {
      ...(config || {}),
      _toolName: toolName ?? (config as TraktRequestMetadata | undefined)?._toolName,
    };
  }

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
        const enhancedConfig = config as TraktRequestConfig;
        await this.rateLimiter.waitIfNeeded();

        if (this.oauth.isAuthenticated()) {
          const token = await this.oauth.getAccessToken();
          enhancedConfig.headers.Authorization = `Bearer ${token}`;
        }

        // Generate correlation ID and log request initiation
        const correlationId = logger.generateCorrelationId();
        const startTime = Date.now();

        // Store metadata in config for use in response interceptor
        enhancedConfig._correlationId = correlationId;
        enhancedConfig._startTime = startTime;
        // Defensive init: ensure _retryCount is always defined (prevents edge-case crashes)
        enhancedConfig._retryCount = enhancedConfig._retryCount ?? 0;

        return enhancedConfig;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for logging and error handling with retry logic
    this.client.interceptors.response.use(
      (response) => {
        // Log successful response
        const config = response.config as TraktRequestConfig & {
          _correlationId?: string;
          _startTime?: number;
        };
        const correlationId = config._correlationId || logger.generateCorrelationId();
        const startTime = config._startTime || Date.now();

        const partialLog = logger.createRequestLog(config, correlationId, config._toolName);
        const fullLog = logger.completeRequestLog(partialLog, response, startTime);
        logger.logRequest(fullLog);

        return response;
      },
      async (error: AxiosError) => {
        // Safely access config - it may not exist if request never completed
        const config = error.config as
          | (TraktRequestConfig & {
              _retryCount?: number;
              _correlationId?: string;
              _startTime?: number;
            })
          | undefined;

        // Log error before handling (unless it's a retry)
        // Check config exists before accessing properties
        if (config && (!config._retryCount || config._retryCount === 0)) {
          const correlationId = config._correlationId || logger.generateCorrelationId();
          const startTime = config._startTime || Date.now();
          const partialLog = logger.createRequestLog(config, correlationId, config._toolName);
          const fullLog = logger.completeRequestLogWithError(partialLog, error, startTime);
          logger.logRequest(fullLog);
        } else if (!config) {
          // Request never completed - log minimal error
          logWarn(`Request failed before completion: ${error.message}`);
        }

        if (error.response?.status === 401 || error.response?.status === 403) {
          // Token expired or invalid (Trakt.tv returns 403 for auth failures)
          throw new Error('Authentication failed. Please re-authenticate.');
        }

        if (error.response?.status === 429) {
          // Rate limit exceeded - implement exponential backoff retry
          // Cannot retry if config is missing
          if (!config) {
            throw new Error('Rate limit exceeded but request config unavailable for retry.');
          }

          // Initialize _retryCount if undefined
          const retryCount = config._retryCount ?? 0;
          const maxRetries = 3;

          if (retryCount < maxRetries) {
            // Calculate exponential backoff delay: 1s, 2s, 4s
            const backoffDelay = Math.pow(2, retryCount) * 1000;

            logWarn(
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
  async get<T>(endpoint: string, config?: AxiosRequestConfig, toolName?: string): Promise<T> {
    const response = await this.client.get<T>(endpoint, this.addToolName(config, toolName));
    return response.data;
  }

  /**
   * Make a POST request to the Trakt API
   */
  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
    toolName?: string
  ): Promise<T> {
    const response = await this.client.post<T>(endpoint, data, this.addToolName(config, toolName));
    return response.data;
  }

  /**
   * Make a PUT request to the Trakt API
   */
  async put<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
    toolName?: string
  ): Promise<T> {
    const response = await this.client.put<T>(endpoint, data, this.addToolName(config, toolName));
    return response.data;
  }

  /**
   * Make a DELETE request to the Trakt API
   */
  async delete<T>(endpoint: string, config?: AxiosRequestConfig, toolName?: string): Promise<T> {
    const response = await this.client.delete<T>(endpoint, this.addToolName(config, toolName));
    return response.data;
  }

  /**
   * Search for shows and movies (with caching)
   *
   * @param extended - Request extended data (genres, overview) for better disambiguation
   */
  async search(
    query: string,
    type?: 'show' | 'movie',
    year?: number,
    options?: { toolName?: string; extended?: boolean }
  ) {
    const extended = options?.extended ?? true; // Default to true for better disambiguation
    const cacheKey = generateSearchCacheKey(query, type, year) + (extended ? ':ext' : '');

    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached !== undefined) {
      logCacheEvent('hit', cacheKey, 'search_content');
      logDebug(`[CACHE_HIT] Search: "${query}" (${type || 'all'}${year ? `, ${year}` : ''})`);
      return cached;
    }

    // Cache miss - fetch from API
    logCacheEvent('miss', cacheKey, 'search_content');
    logDebug(`[CACHE_MISS] Search: "${query}" (${type || 'all'}${year ? `, ${year}` : ''})`);

    const params: Record<string, string | number> = { query };
    if (year) params.years = year;
    if (extended) params.extended = 'full';

    const result = await this.get(`/search/${type || 'show,movie'}`, { params }, options?.toolName);

    // Store in cache
    this.searchCache.set(cacheKey, result);

    return result;
  }

  /**
   * Search for a specific episode (with caching)
   */
  async searchEpisode(
    showId: string,
    season: number,
    episode: number,
    options?: { toolName?: string }
  ) {
    const cacheKey = generateEpisodeCacheKey(showId, season, episode);

    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached !== undefined) {
      logCacheEvent('hit', cacheKey, 'searchEpisode');
      logDebug(`[CACHE_HIT] Episode: ${showId} S${season}E${episode}`);
      return cached;
    }

    // Cache miss - fetch from API
    logCacheEvent('miss', cacheKey, 'searchEpisode');
    logDebug(`[CACHE_MISS] Episode: ${showId} S${season}E${episode}`);

    const result = await this.get(
      `/shows/${showId}/seasons/${season}/episodes/${episode}`,
      undefined,
      options?.toolName
    );

    // Store in cache
    this.searchCache.set(cacheKey, result);

    return result;
  }

  /**
   * Get show information
   */
  async getShow(id: string, extended?: 'full', options?: { toolName?: string }) {
    const params = extended ? { extended } : {};
    return this.get(`/shows/${id}`, { params }, options?.toolName);
  }

  /**
   * Get episodes for a season
   */
  async getSeasonEpisodes(showId: string, season: number, options?: { toolName?: string }) {
    return this.get(`/shows/${showId}/seasons/${season}`, undefined, options?.toolName);
  }

  /**
   * Get user's settings (includes profile info)
   */
  async getUserSettings(options?: { toolName?: string }): Promise<TraktSettings> {
    return this.get<TraktSettings>('/users/settings', undefined, options?.toolName);
  }

  /**
   * Get user's watch history
   */
  async getHistory(
    type?: 'shows' | 'movies',
    startAt?: string,
    endAt?: string,
    page = 1,
    options?: { toolName?: string }
  ) {
    const params: Record<string, string | number> = { page, limit: 50 };
    if (startAt) params.start_at = startAt;
    if (endAt) params.end_at = endAt;

    const endpoint = type ? `/sync/history/${type}` : '/sync/history';
    return this.get(endpoint, { params }, options?.toolName);
  }

  /**
   * Add items to watch history
   */
  async addToHistory(items: unknown, options?: { toolName?: string }) {
    return this.post('/sync/history', items, undefined, options?.toolName);
  }

  /**
   * Get user's watchlist
   */
  async getWatchlist(type?: 'shows' | 'movies', options?: { toolName?: string }) {
    const endpoint = type ? `/sync/watchlist/${type}` : '/sync/watchlist';
    return this.get(endpoint, undefined, options?.toolName);
  }

  /**
   * Add items to watchlist
   */
  async addToWatchlist(items: unknown, options?: { toolName?: string }) {
    return this.post('/sync/watchlist', items, undefined, options?.toolName);
  }

  /**
   * Remove items from watchlist
   */
  async removeFromWatchlist(items: unknown, options?: { toolName?: string }) {
    return this.post('/sync/watchlist/remove', items, undefined, options?.toolName);
  }

  /**
   * Get calendar for user's shows
   */
  async getCalendar(startDate: string, days = 7, options?: { toolName?: string }) {
    return this.get(`/calendars/my/shows/${startDate}/${days}`, undefined, options?.toolName);
  }

  /**
   * Get watched progress for a show
   */
  async getShowProgress(showId: string, options?: { toolName?: string }) {
    return this.get(`/shows/${showId}/progress/watched`, undefined, options?.toolName);
  }

  /**
   * Get user's collected shows
   */
  async getCollectedShows(options?: { toolName?: string }) {
    return this.get('/sync/collection/shows', undefined, options?.toolName);
  }

  /**
   * Remove items from history
   */
  async removeFromHistory(items: unknown, options?: { toolName?: string }) {
    return this.post('/sync/history/remove', items, undefined, options?.toolName);
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
    logInfo('[CACHE] Search cache cleared');
  }

  /**
   * Prune expired cache entries
   * Returns number of entries removed
   */
  pruneCache(): number {
    const removed = this.searchCache.prune();
    if (removed > 0) {
      logInfo(`[CACHE] Pruned ${removed} expired entries`);
    }
    return removed;
  }
}

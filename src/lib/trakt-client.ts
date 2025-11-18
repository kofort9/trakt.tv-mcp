import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { TraktConfig } from '../types/trakt.js';
import { TraktOAuth } from './oauth.js';

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

  constructor(config: TraktConfig, oauth: TraktOAuth) {
    this.oauth = oauth;
    this.rateLimiter = new RateLimiter();

    this.client = axios.create({
      baseURL: config.apiBaseUrl,
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': config.apiVersion,
        'trakt-api-key': config.clientId,
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      async (config) => {
        await this.rateLimiter.waitIfNeeded();

        if (this.oauth.isAuthenticated()) {
          const token = await this.oauth.getAccessToken();
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          throw new Error('Authentication failed. Please re-authenticate.');
        }

        if (error.response?.status === 429) {
          // Rate limit exceeded
          throw new Error('Rate limit exceeded. Please try again later.');
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
   * Search for shows and movies
   */
  async search(query: string, type?: 'show' | 'movie', year?: number) {
    const params: Record<string, string | number> = { query };
    if (type) params.type = type;
    if (year) params.years = year;

    return this.get(`/search/${type || 'show,movie'}`, { params });
  }

  /**
   * Search for a specific episode
   */
  async searchEpisode(showId: string, season: number, episode: number) {
    return this.get(`/shows/${showId}/seasons/${season}/episodes/${episode}`);
  }

  /**
   * Get show information
   */
  async getShow(id: string, extended?: 'full') {
    const params = extended ? { extended } : {};
    return this.get(`/shows/${id}`, { params });
  }

  /**
   * Get episodes for a season
   */
  async getSeasonEpisodes(showId: string, season: number) {
    return this.get(`/shows/${showId}/seasons/${season}`);
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
}

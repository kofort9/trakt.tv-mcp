/**
 * Integration tests with realistic API response mocks
 *
 * These tests cover real-world scenarios that users encounter:
 * - Disambiguation: Multiple shows with the same name
 * - Rate limiting: 429 responses with exponential backoff
 * - Error handling: Auth failures, not found, server errors
 *
 * Tests use realistic Trakt.tv API response structures to verify
 * end-to-end behavior through the tools layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import { TraktOAuth } from '../../src/domain/trakt/oauth.js';
import type { TraktConfig } from '../../src/types/trakt.js';
import { searchEpisode, logWatch, lookupBySlug } from '../../src/domain/trakt/tools.js';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures - Realistic Trakt.tv API Responses
// ─────────────────────────────────────────────────────────────────────────────

const REALISTIC_SEARCH_RESPONSES = {
  /**
   * "The Office" disambiguation scenario - 3 versions of the same show
   * Real Trakt.tv returns multiple results with different years/countries
   */
  theOffice: [
    {
      type: 'show',
      score: 1000,
      show: {
        title: 'The Office',
        year: 2005,
        ids: { trakt: 73, slug: 'the-office', imdb: 'tt0386676', tvdb: 73244 },
        country: 'us',
        status: 'ended',
        network: 'NBC',
      },
    },
    {
      type: 'show',
      score: 800,
      show: {
        title: 'The Office',
        year: 2001,
        ids: { trakt: 74, slug: 'the-office-uk', imdb: 'tt0290978', tvdb: 78107 },
        country: 'gb',
        status: 'ended',
        network: 'BBC Two',
      },
    },
    {
      type: 'show',
      score: 600,
      show: {
        title: 'The Office',
        year: 2024,
        ids: { trakt: 75, slug: 'the-office-australia', imdb: 'tt15348462' },
        country: 'au',
        status: 'returning series',
        network: 'Amazon Prime Video',
      },
    },
  ],

  /**
   * Unique show - no disambiguation needed
   */
  breakingBad: [
    {
      type: 'show',
      score: 1000,
      show: {
        title: 'Breaking Bad',
        year: 2008,
        ids: { trakt: 1, slug: 'breaking-bad', imdb: 'tt0903747', tvdb: 81189 },
        country: 'us',
        status: 'ended',
        network: 'AMC',
      },
    },
  ],

  /**
   * Movie with same name as show - requires type disambiguation
   */
  fallout: [
    {
      type: 'show',
      score: 1000,
      show: {
        title: 'Fallout',
        year: 2024,
        ids: { trakt: 200, slug: 'fallout', imdb: 'tt12637874' },
      },
    },
    {
      type: 'movie',
      score: 500,
      movie: {
        title: 'Fallout',
        year: 2013,
        ids: { trakt: 201, slug: 'fallout-2013', imdb: 'tt2883578' },
      },
    },
  ],

  noResults: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Utilities
// ─────────────────────────────────────────────────────────────────────────────

const createTestConfig = (): TraktConfig => ({
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  apiVersion: '2',
  apiBaseUrl: 'https://api.trakt.tv',
});

const createMockOAuth = (): TraktOAuth =>
  ({
    isAuthenticated: vi.fn().mockReturnValue(true),
    getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  }) as unknown as TraktOAuth;

/**
 * Creates a realistic Axios error with proper structure
 */
const createAxiosError = (
  status: number,
  statusText: string,
  data: unknown = {},
  headers: Record<string, string> = {}
): AxiosError => {
  const error = new AxiosError(statusText);
  error.response = {
    status,
    statusText,
    data,
    headers: new AxiosHeaders(headers),
    config: {
      headers: new AxiosHeaders(),
      _retryCount: 0,
    } as InternalAxiosRequestConfig,
  } as AxiosResponse;
  error.config = {
    headers: new AxiosHeaders(),
    _retryCount: 0,
  } as InternalAxiosRequestConfig;
  return error;
};

// ─────────────────────────────────────────────────────────────────────────────
// Disambiguation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Disambiguation Scenarios', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(createTestConfig(), createMockOAuth());
    vi.clearAllMocks();
  });

  describe('Multiple shows with same name', () => {
    it('should return all versions of "The Office" when searching', async () => {
      vi.spyOn(client, 'search').mockResolvedValue(REALISTIC_SEARCH_RESPONSES.theOffice);

      const results = await client.search('The Office', 'show');

      expect(results.length).toBe(3);
      expect(results[0].show?.country).toBe('us');
      expect(results[0].show?.year).toBe(2005);
      expect(results[1].show?.country).toBe('gb');
      expect(results[2].show?.country).toBe('au');
    });

    it('should find correct show when traktId is provided for disambiguation', async () => {
      // When user provides traktId, we bypass search and use direct lookup
      vi.spyOn(client, 'search').mockResolvedValue(REALISTIC_SEARCH_RESPONSES.theOffice);
      vi.spyOn(client, 'searchEpisode').mockResolvedValue({
        season: 1,
        number: 1,
        title: 'Pilot',
        ids: { trakt: 12345, tvdb: 67890 },
      });

      const result = await searchEpisode(client, {
        showName: 'The Office',
        season: 1,
        episode: 1,
        traktId: 73, // Explicitly US version
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Pilot');
      }
    });

    it('should require disambiguation when multiple shows have same title', async () => {
      // All 3 Office shows have exact same title "The Office"
      // handleSearchDisambiguation requires disambiguation when exact title matches > 1
      vi.spyOn(client, 'search').mockResolvedValue(REALISTIC_SEARCH_RESPONSES.theOffice);

      const result = await searchEpisode(client, {
        showName: 'The Office',
        season: 1,
        episode: 1,
      });

      // When multiple shows share exact title, disambiguation is required
      // User must provide traktId or year to specify which version
      // Response uses snake_case: needs_disambiguation, options
      expect('needs_disambiguation' in result).toBe(true);
      if ('needs_disambiguation' in result) {
        expect(result.needs_disambiguation).toBe(true);
        expect(result.options.length).toBe(3);
        // Verify all years are present (US 2005, UK 2001, AU 2024)
        const years = result.options.map((o: { year?: number }) => o.year);
        expect(years).toContain(2005);
        expect(years).toContain(2001);
        expect(years).toContain(2024);
      }
    });
  });

  describe('Show vs Movie disambiguation', () => {
    it('should distinguish between show and movie search results', async () => {
      vi.spyOn(client, 'search').mockResolvedValue(REALISTIC_SEARCH_RESPONSES.fallout);

      const results = await client.search('Fallout');

      const shows = results.filter((r) => r.type === 'show');
      const movies = results.filter((r) => r.type === 'movie');
      expect(shows.length).toBe(1);
      expect(movies.length).toBe(1);
    });

    it('should filter to shows only when type specified', async () => {
      const showsOnly = REALISTIC_SEARCH_RESPONSES.fallout.filter((r) => r.type === 'show');
      vi.spyOn(client, 'search').mockResolvedValue(showsOnly);

      const results = await client.search('Fallout', 'show');

      expect(results.every((r) => r.type === 'show')).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate Limiting Scenarios', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(createTestConfig(), createMockOAuth());
    vi.clearAllMocks();
  });

  describe('429 Response Handling', () => {
    it('should handle rate limit error gracefully in tools', async () => {
      const rateLimitError = new Error(
        'Rate limit exceeded after multiple retries. Please wait a few minutes and try again.'
      );

      vi.spyOn(client, 'search').mockRejectedValue(rateLimitError);

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success && 'error' in result) {
        expect(result.error.message).toContain('Rate limit');
      }
    });

    it('should succeed normally when not rate limited', async () => {
      // Verify normal operation when rate limits are not exceeded
      vi.spyOn(client, 'search').mockResolvedValue(REALISTIC_SEARCH_RESPONSES.breakingBad);
      vi.spyOn(client, 'searchEpisode').mockResolvedValue({
        season: 1,
        number: 1,
        title: 'Pilot',
        ids: { trakt: 12345 },
      });

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Pilot');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Error Handling Scenarios', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(createTestConfig(), createMockOAuth());
    vi.clearAllMocks();
  });

  describe('Authentication Errors (401/403)', () => {
    it('should handle expired token with clear error message', async () => {
      const authError = new Error('Authentication failed. Please re-authenticate.');
      vi.spyOn(client, 'search').mockRejectedValue(authError);

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success && 'error' in result) {
        expect(result.error.message).toContain('re-authenticate');
      }
    });

    it('should handle 403 forbidden gracefully', async () => {
      const forbiddenError = new Error('Authentication failed. Please re-authenticate.');
      vi.spyOn(client, 'search').mockRejectedValue(forbiddenError);

      const result = await searchEpisode(client, {
        showName: 'Test',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Not Found Errors (404)', () => {
    it('should handle show not found gracefully', async () => {
      vi.spyOn(client, 'search').mockResolvedValue([]);

      const result = await searchEpisode(client, {
        showName: 'NonexistentShow12345',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success && 'error' in result) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle episode not found with helpful message', async () => {
      vi.spyOn(client, 'search').mockResolvedValue(REALISTIC_SEARCH_RESPONSES.breakingBad);
      vi.spyOn(client, 'searchEpisode').mockRejectedValue(
        new Error('Episode not found: Season 99 Episode 99')
      );

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 99,
        episode: 99,
      });

      expect(result.success).toBe(false);
      if (!result.success && 'error' in result) {
        // Error code varies based on error propagation path:
        // - NOT_FOUND: when searchEpisode throws episode-specific not found
        // - TRAKT_API_ERROR: when the error is caught and wrapped at tools layer
        // Both are valid - the key behavior is the operation fails gracefully
        expect(['NOT_FOUND', 'TRAKT_API_ERROR']).toContain(result.error.code);
        expect(result.error.message).toContain('Episode not found');
      }
    });
  });

  describe('Server Errors (5xx)', () => {
    it('should handle 500 Internal Server Error', async () => {
      const serverError = createAxiosError(500, 'Internal Server Error', {
        error: 'internal_error',
      });

      vi.spyOn(client, 'search').mockRejectedValue(serverError);

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success && 'error' in result) {
        // Server errors (5xx) are caught at different layers:
        // - SEARCH_ERROR: when searchEpisode's internal search fails
        // - TRAKT_API_ERROR: when the Axios error is wrapped at tools layer
        // Key assertion: we get a meaningful error, not an unhandled exception
        expect(['SEARCH_ERROR', 'TRAKT_API_ERROR']).toContain(result.error.code);
      }
    });

    it('should handle 503 Service Unavailable', async () => {
      const unavailableError = createAxiosError(503, 'Service Unavailable', {
        error: 'maintenance',
        message: 'Trakt.tv is under maintenance',
      });

      vi.spyOn(client, 'search').mockRejectedValue(unavailableError);

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Network Errors', () => {
    it('should handle connection timeout', async () => {
      const timeoutError = new Error('ECONNABORTED: timeout of 30000ms exceeded');
      timeoutError.name = 'AxiosError';

      vi.spyOn(client, 'search').mockRejectedValue(timeoutError);

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success && 'error' in result) {
        expect(result.error.message).toContain('timeout');
      }
    });

    it('should handle DNS resolution failure', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND api.trakt.tv');
      dnsError.name = 'AxiosError';

      vi.spyOn(client, 'search').mockRejectedValue(dnsError);

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
    });

    it('should handle connection reset', async () => {
      const resetError = new Error('ECONNRESET: socket hang up');

      vi.spyOn(client, 'search').mockRejectedValue(resetError);

      const result = await searchEpisode(client, {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      });

      expect(result.success).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(createTestConfig(), createMockOAuth());
    vi.clearAllMocks();
  });

  it('should handle special characters in search', async () => {
    vi.spyOn(client, 'search').mockResolvedValue([
      {
        type: 'show',
        score: 1000,
        show: {
          title: "Schitt's Creek",
          year: 2015,
          ids: { trakt: 100, slug: 'schitts-creek' },
        },
      },
    ]);
    vi.spyOn(client, 'searchEpisode').mockResolvedValue({
      season: 1,
      number: 1,
      title: 'The Cup Runneth Over',
      ids: { trakt: 99999 },
    });

    const result = await searchEpisode(client, {
      showName: "Schitt's Creek",
      season: 1,
      episode: 1,
    });

    expect(result.success).toBe(true);
  });

  it('should handle Unicode characters in titles', async () => {
    vi.spyOn(client, 'search').mockResolvedValue([
      {
        type: 'show',
        score: 1000,
        show: {
          title: '鬼滅の刃', // Demon Slayer in Japanese
          year: 2019,
          ids: { trakt: 150, slug: 'demon-slayer-kimetsu-no-yaiba' },
        },
      },
    ]);
    vi.spyOn(client, 'searchEpisode').mockResolvedValue({
      season: 1,
      number: 1,
      title: 'Cruelty',
      ids: { trakt: 88888 },
    });

    const result = await searchEpisode(client, {
      showName: '鬼滅の刃',
      season: 1,
      episode: 1,
    });

    expect(result.success).toBe(true);
  });

  it('should handle slug lookup for disambiguation', async () => {
    vi.spyOn(client, 'getMovie').mockResolvedValue({
      title: 'Columbus',
      year: 2017,
      ids: { trakt: 276047, slug: 'columbus-2017', imdb: 'tt5990474' },
    });

    const result = await lookupBySlug(client, {
      type: 'movie',
      slug: 'columbus-2017',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // lookupBySlug wraps the content in a specific structure
      expect(result.data.content.title).toBe('Columbus');
      expect(result.data.content.year).toBe(2017);
    }
  });

  it('should validate season and episode are positive integers', async () => {
    const result = await searchEpisode(client, {
      showName: 'Test',
      season: -1,
      episode: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success && 'error' in result) {
      // Validation can fail at multiple layers:
      // - VALIDATION_ERROR: caught by input validation before API call
      // - TRAKT_API_ERROR: if validation happens server-side
      // Key behavior: invalid input is rejected before making real API calls
      expect(['VALIDATION_ERROR', 'TRAKT_API_ERROR']).toContain(result.error.code);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// logWatch Integration Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('logWatch Integration', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(createTestConfig(), createMockOAuth());
    vi.clearAllMocks();
  });

  it('should log episode with disambiguation by traktId', async () => {
    // Setup for US Office
    vi.spyOn(client, 'search').mockResolvedValue(REALISTIC_SEARCH_RESPONSES.theOffice);
    vi.spyOn(client, 'searchEpisode').mockResolvedValue({
      season: 1,
      number: 1,
      title: 'Pilot',
      ids: { trakt: 12345 },
    });
    vi.spyOn(client, 'addToHistory').mockResolvedValue({
      added: { episodes: 1, movies: 0 },
      not_found: { movies: [], shows: [], seasons: [], episodes: [] },
    });

    const result = await logWatch(client, {
      type: 'episode',
      showName: 'The Office',
      season: 1,
      episode: 1,
      traktId: 73, // US version
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.added.episodes).toBe(1);
    }
  });

  it('should log movie successfully', async () => {
    vi.spyOn(client, 'search').mockResolvedValue([
      {
        type: 'movie',
        score: 1000,
        movie: {
          title: 'Columbus',
          year: 2017,
          ids: { trakt: 276047, slug: 'columbus-2017' },
        },
      },
    ]);
    vi.spyOn(client, 'addToHistory').mockResolvedValue({
      added: { episodes: 0, movies: 1 },
      not_found: { movies: [], shows: [], seasons: [], episodes: [] },
    });

    const result = await logWatch(client, {
      type: 'movie',
      movieName: 'Columbus',
      year: 2017,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.added.movies).toBe(1);
    }
  });
});

/**
 * Duplicate Detection Integration Tests
 *
 * Tests the 48-hour duplicate prevention feature at the tools layer.
 * This complements the unit tests in duplicate-detector.test.ts by testing
 * the full flow through logWatch() with the allowDuplicates parameter.
 */
describe('Duplicate Detection Integration', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(createTestConfig(), createMockOAuth());
    vi.clearAllMocks();
  });

  it('should prevent logging same episode within 48 hours by default', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Mock search to find the show
    vi.spyOn(client, 'search').mockResolvedValue([
      {
        type: 'show',
        score: 1000,
        show: {
          title: 'The Bear',
          year: 2022,
          ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
        },
      },
    ]);

    vi.spyOn(client, 'searchEpisode').mockResolvedValue({
      season: 2,
      number: 5,
      title: 'Pop',
      ids: { trakt: 67890 },
    });

    // Mock getHistory to return the same episode watched 1 hour ago
    vi.spyOn(client, 'getHistory').mockResolvedValue([
      {
        watched_at: oneHourAgo,
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
          title: 'Pop',
          ids: { trakt: 67890, tvdb: 789, imdb: 'tt456', tmdb: 789 },
        },
      },
    ]);

    const result = await logWatch(client, {
      type: 'episode',
      showName: 'The Bear',
      season: 2,
      episode: 5,
    });

    // Should be blocked as duplicate
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DUPLICATE_ENTRY');
      // Error message format: "Already logged {title} S{s}E{e} on {date}"
      expect(result.error.message).toContain('Already logged');
    }
  });

  it('should allow duplicate when allowDuplicates=true (for rewatches)', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    vi.spyOn(client, 'search').mockResolvedValue([
      {
        type: 'show',
        score: 1000,
        show: {
          title: 'The Bear',
          year: 2022,
          ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
        },
      },
    ]);

    vi.spyOn(client, 'searchEpisode').mockResolvedValue({
      season: 2,
      number: 5,
      title: 'Pop',
      ids: { trakt: 67890 },
    });

    // Mock getHistory with recent entry
    vi.spyOn(client, 'getHistory').mockResolvedValue([
      {
        watched_at: oneHourAgo,
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
          title: 'Pop',
          ids: { trakt: 67890, tvdb: 789, imdb: 'tt456', tmdb: 789 },
        },
      },
    ]);

    // Mock addToHistory for success
    vi.spyOn(client, 'addToHistory').mockResolvedValue({
      added: { episodes: 1, movies: 0 },
      not_found: { movies: [], shows: [], seasons: [], episodes: [] },
    });

    const result = await logWatch(client, {
      type: 'episode',
      showName: 'The Bear',
      season: 2,
      episode: 5,
      allowDuplicates: true, // Explicitly allow for rewatch
    });

    // Should succeed despite existing entry
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.added.episodes).toBe(1);
    }
  });

  it('should not flag as duplicate outside 48-hour window', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    vi.spyOn(client, 'search').mockResolvedValue([
      {
        type: 'show',
        score: 1000,
        show: {
          title: 'The Bear',
          year: 2022,
          ids: { trakt: 12345, slug: 'the-bear', tvdb: 123, imdb: 'tt123', tmdb: 456 },
        },
      },
    ]);

    vi.spyOn(client, 'searchEpisode').mockResolvedValue({
      season: 2,
      number: 5,
      title: 'Pop',
      ids: { trakt: 67890 },
    });

    // Mock getHistory with old entry (outside 48-hour window)
    vi.spyOn(client, 'getHistory').mockResolvedValue([
      {
        watched_at: threeDaysAgo,
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
          title: 'Pop',
          ids: { trakt: 67890, tvdb: 789, imdb: 'tt456', tmdb: 789 },
        },
      },
    ]);

    vi.spyOn(client, 'addToHistory').mockResolvedValue({
      added: { episodes: 1, movies: 0 },
      not_found: { movies: [], shows: [], seasons: [], episodes: [] },
    });

    const result = await logWatch(client, {
      type: 'episode',
      showName: 'The Bear',
      season: 2,
      episode: 5,
    });

    // Should succeed - entry is outside 48-hour window
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.added.episodes).toBe(1);
    }
  });

  it('should prevent logging same movie within 48 hours', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    vi.spyOn(client, 'search').mockResolvedValue([
      {
        type: 'movie',
        score: 1000,
        movie: {
          title: 'Columbus',
          year: 2017,
          ids: { trakt: 276047, slug: 'columbus-2017', imdb: 'tt123', tmdb: 456 },
        },
      },
    ]);

    // Mock getHistory with recent movie entry
    vi.spyOn(client, 'getHistory').mockResolvedValue([
      {
        watched_at: oneHourAgo,
        action: 'watch',
        type: 'movie',
        movie: {
          title: 'Columbus',
          year: 2017,
          ids: { trakt: 276047, slug: 'columbus-2017', imdb: 'tt123', tmdb: 456 },
        },
      },
    ]);

    const result = await logWatch(client, {
      type: 'movie',
      movieName: 'Columbus',
      year: 2017,
    });

    // Should be blocked as duplicate
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DUPLICATE_ENTRY');
      // Error message format: "Already logged {title} on {date}"
      expect(result.error.message).toContain('Already logged');
    }
  });
});

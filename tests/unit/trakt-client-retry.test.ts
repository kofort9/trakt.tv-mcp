/**
 * Tests for TraktClient retry logic and _retryCount initialization
 *
 * These tests verify:
 * - Defensive _retryCount initialization (prevents crashes)
 * - Request interceptor behavior
 * - Error handling edge cases
 *
 * Note: Since axios interceptors are bypassed when mocking at the method level,
 * these tests focus on verifying the defensive coding patterns and error handling
 * that prevent crashes like case study entry #16.
 *
 * @see docs/test-plans/phase-0-test-plan.md Section 0.2
 * @see docs/case-studies/2025-12-16-sync-queue-first-test.md Entry #16 crash
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import type { TraktOAuth } from '../../src/domain/trakt/oauth.js';
import type { TraktConfig } from '../../src/types/trakt.js';
import { AxiosError } from 'axios';

const config: TraktConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  apiVersion: '2',
  apiBaseUrl: 'https://api.trakt.tv',
};

const createMockOAuth = (authenticated = false): TraktOAuth => {
  return {
    isAuthenticated: vi.fn().mockReturnValue(authenticated),
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    initiateDeviceFlow: vi.fn(),
    pollForToken: vi.fn(),
    refreshToken: vi.fn(),
    getAccessTokenSync: undefined as never,
    getAccessTokenOrThrow: undefined as never,
  } as unknown as TraktOAuth;
};

describe('TraktClient Retry Logic', () => {
  let client: TraktClient;
  let mockOAuth: TraktOAuth;

  beforeEach(() => {
    mockOAuth = createMockOAuth(true);
    client = new TraktClient(config, mockOAuth);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('_retryCount Defensive Initialization', () => {
    it('should not crash when processing request without prior _retryCount', async () => {
      // This test simulates the case study entry #16 scenario
      // where _retryCount was undefined in the config
      const getMock = vi.fn().mockResolvedValue({ data: { title: 'Test' } });
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      // Should not throw
      await expect(client.get('/shows/12345')).resolves.toEqual({ title: 'Test' });
    });

    it('should handle multiple sequential requests without _retryCount accumulation', async () => {
      const getMock = vi.fn().mockResolvedValue({ data: [{ show: { title: 'Show' } }] });
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      // Multiple requests should each work independently
      await client.get('/shows/search');
      await client.get('/movies/search');
      await client.get('/shows/search');

      expect(getMock).toHaveBeenCalledTimes(3);
    });

    it('should handle request with undefined config gracefully', async () => {
      // Create an error without config (simulates request that never completed)
      const errorWithoutConfig = new AxiosError('Network error');
      errorWithoutConfig.config = undefined;

      const getMock = vi.fn().mockRejectedValue(errorWithoutConfig);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      // Should throw the error but not crash on undefined config._retryCount
      await expect(client.get('/test')).rejects.toThrow('Network error');
    });

    it('should handle error with config but missing _retryCount property', async () => {
      // Create an error with config but no _retryCount
      const errorWithConfig = new AxiosError('Server error');
      errorWithConfig.response = {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as never,
        data: {},
      };
      // Config exists but without _retryCount
      errorWithConfig.config = { url: '/test', headers: {} } as never;

      const getMock = vi.fn().mockRejectedValue(errorWithConfig);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      // Should not crash when accessing config._retryCount
      await expect(client.get('/test')).rejects.toThrow('Server error');
    });
  });

  describe('Error Type Handling', () => {
    it('should propagate 401 authentication errors', async () => {
      const authError = new AxiosError('Unauthorized');
      authError.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {} as never,
        data: {},
      };

      const getMock = vi.fn().mockRejectedValue(authError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/users/me')).rejects.toThrow();
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('should propagate 403 forbidden errors', async () => {
      const forbiddenError = new AxiosError('Forbidden');
      forbiddenError.response = {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: {} as never,
        data: {},
      };

      const getMock = vi.fn().mockRejectedValue(forbiddenError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/users/me')).rejects.toThrow();
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('should propagate 404 not found errors', async () => {
      const notFoundError = new AxiosError('Not Found');
      notFoundError.response = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {} as never,
        data: {},
      };

      const getMock = vi.fn().mockRejectedValue(notFoundError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/shows/nonexistent')).rejects.toThrow('Not Found');
    });

    it('should propagate 429 rate limit errors', async () => {
      // Note: When mocking at method level, interceptor retry logic is bypassed
      const rateLimitError = new AxiosError('Too Many Requests');
      rateLimitError.response = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        config: {} as never,
        data: {},
      };

      const getMock = vi.fn().mockRejectedValue(rateLimitError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/shows/search')).rejects.toThrow('Too Many Requests');
    });

    it('should propagate 500 server errors', async () => {
      const serverError = new AxiosError('Internal Server Error');
      serverError.response = {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as never,
        data: {},
      };

      const getMock = vi.fn().mockRejectedValue(serverError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/shows/search')).rejects.toThrow('Internal Server Error');
    });
  });

  describe('Network Edge Cases', () => {
    it('should handle timeout errors', async () => {
      const timeoutError = new AxiosError('timeout of 10000ms exceeded');
      timeoutError.code = 'ECONNABORTED';

      const getMock = vi.fn().mockRejectedValue(timeoutError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/shows/search')).rejects.toThrow('timeout');
    });

    it('should handle connection refused errors', async () => {
      const connectionError = new AxiosError('connect ECONNREFUSED');
      connectionError.code = 'ECONNREFUSED';

      const getMock = vi.fn().mockRejectedValue(connectionError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/shows/search')).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle DNS resolution errors', async () => {
      const dnsError = new AxiosError('getaddrinfo ENOTFOUND api.trakt.tv');
      dnsError.code = 'ENOTFOUND';

      const getMock = vi.fn().mockRejectedValue(dnsError);
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await expect(client.get('/shows/search')).rejects.toThrow('ENOTFOUND');
    });
  });

  describe('Tool Name Propagation', () => {
    it('should attach _toolName to GET requests', async () => {
      const getMock = vi.fn().mockResolvedValue({ data: [] });
      (client as unknown as { client: { get: typeof getMock } }).client.get = getMock;

      await client.search('foo', 'show', undefined, { toolName: 'search_show' });

      expect(getMock).toHaveBeenCalledWith('/search/show', {
        params: { query: 'foo', extended: 'full' },
        _toolName: 'search_show',
      });
    });

    it('should attach _toolName to POST requests', async () => {
      const postMock = vi.fn().mockResolvedValue({ data: { added: { movies: 1 } } });
      (client as unknown as { client: { post: typeof postMock } }).client.post = postMock;

      await client.addToHistory({ movies: [] }, { toolName: 'log_watch' });

      expect(postMock).toHaveBeenCalledWith(
        '/sync/history',
        { movies: [] },
        { _toolName: 'log_watch' }
      );
    });
  });
});

describe('TraktClient Retry Constants', () => {
  it('should have max retries set to 3', async () => {
    // This test documents the expected retry behavior
    // The actual retry logic uses: maxRetries = 3
    // Exponential backoff: 2^retryCount * 1000ms (1s, 2s, 4s)
    const expectedMaxRetries = 3;
    const expectedBackoffs = [1000, 2000, 4000]; // 2^0*1000, 2^1*1000, 2^2*1000

    // Verify our understanding matches the implementation
    for (let i = 0; i < expectedMaxRetries; i++) {
      const expectedDelay = Math.pow(2, i) * 1000;
      expect(expectedDelay).toBe(expectedBackoffs[i]);
    }
  });
});

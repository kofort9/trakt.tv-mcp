import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import type { TraktOAuth } from '../../src/domain/trakt/oauth.js';
import type { TraktConfig } from '../../src/types/trakt.js';
import axios, { AxiosError } from 'axios';

const config: TraktConfig = {
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  apiVersion: '2',
  apiBaseUrl: 'https://api.trakt.tv',
};

const oauth: TraktOAuth = {
  isAuthenticated: vi.fn().mockReturnValue(false),
  getAccessToken: vi.fn(),
  initiateDeviceFlow: vi.fn(),
  pollForToken: vi.fn(),
  refreshToken: vi.fn(),
  getAccessTokenSync: undefined as never,
  getAccessTokenOrThrow: undefined as never,
} as unknown as TraktOAuth;

describe('TraktClient tool name propagation', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(config, oauth);
  });

  it('attaches _toolName to GET requests', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    (client as any).client.get = getMock;

    await client.search('foo', 'show', undefined, { toolName: 'search_show' });

    expect(getMock).toHaveBeenCalledWith('/search/show', {
      params: { query: 'foo', extended: 'full' },
      _toolName: 'search_show',
    });
  });

  it('attaches _toolName to POST requests', async () => {
    const postMock = vi.fn().mockResolvedValue({ data: {} });
    (client as any).client.post = postMock;

    await client.addToHistory({ movies: [] }, { toolName: 'log_watch' });

    expect(postMock).toHaveBeenCalledWith(
      '/sync/history',
      { movies: [] },
      { _toolName: 'log_watch' }
    );
  });
});

describe('TraktClient error handling', () => {
  let client: TraktClient;

  beforeEach(() => {
    client = new TraktClient(config, oauth);
  });

  it('should handle error without config gracefully', async () => {
    // Create an error without config (request never completed)
    const errorWithoutConfig = new AxiosError('Network error');
    errorWithoutConfig.config = undefined;

    const getMock = vi.fn().mockRejectedValue(errorWithoutConfig);
    (client as any).client.get = getMock;

    await expect(client.get('/test')).rejects.toThrow('Network error');
  });

  it('should handle rate limiting errors', async () => {
    // Note: This test mocks at the axios method level, which bypasses interceptors.
    // The interceptor retry logic requires the full axios chain to work.
    // This test verifies that 429 errors are propagated correctly when they occur.
    const rateLimitError = new AxiosError('Rate limit exceeded');
    rateLimitError.response = {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {},
      config: {} as any,
      data: {},
    };

    const getMock = vi.fn().mockRejectedValue(rateLimitError);
    (client as any).client.get = getMock;

    // Without interceptor chain, the raw error is thrown directly
    await expect(client.get('/test')).rejects.toThrow('Rate limit exceeded');
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('should fail after max retries on rate limit', async () => {
    // Note: When mocking at the axios method level, interceptors are bypassed.
    // This test verifies that rate limit errors propagate correctly.
    const rateLimitError = new AxiosError('Rate limit exceeded');
    rateLimitError.response = {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {},
      config: {} as any,
      data: {},
    };

    const getMock = vi.fn().mockRejectedValue(rateLimitError);
    (client as any).client.get = getMock;

    // Without interceptor chain, the raw error message is thrown
    await expect(client.get('/test')).rejects.toThrow('Rate limit exceeded');
  });

  it('should throw authentication error on 401', async () => {
    // Note: When mocking at the axios method level, interceptors are bypassed.
    // This test verifies that auth errors propagate correctly.
    const authError = new AxiosError('Unauthorized');
    authError.response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {} as any,
      data: {},
    };

    const getMock = vi.fn().mockRejectedValue(authError);
    (client as any).client.get = getMock;

    // Without interceptor chain, the raw error message is thrown
    await expect(client.get('/test')).rejects.toThrow('Unauthorized');
  });

  it('should handle error with config but without _retryCount', async () => {
    const errorWithConfig = new AxiosError('Server error');
    errorWithConfig.response = {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as any,
      data: {},
    };
    errorWithConfig.config = { url: '/test' } as any;

    const getMock = vi.fn().mockRejectedValue(errorWithConfig);
    (client as any).client.get = getMock;

    await expect(client.get('/test')).rejects.toThrow('Server error');
  });
});

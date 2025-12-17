import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import type { TraktOAuth } from '../../src/domain/trakt/oauth.js';
import type { TraktConfig } from '../../src/types/trakt.js';

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

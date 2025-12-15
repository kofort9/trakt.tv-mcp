import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import { TraktOAuth } from '../../src/domain/trakt/oauth.js';
import { TraktConfig } from '../../src/types/trakt.js';

// Mock config module before importing index.js to prevent loadConfig() from running
vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(() => ({
    clientId: 'test-id',
    clientSecret: 'test-secret',
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
    apiVersion: '2',
    apiBaseUrl: 'https://api.trakt.tv',
  })),
}));

// Import after mocking to ensure config is mocked during module initialization
const { handleResourceRead } = await import('../../src/index.js');

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

describe('MCP Resource Handler', () => {
  let mockClient: TraktClient;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  describe('handleResourceRead', () => {
    it('should return null for non-matching URI', async () => {
      const resources = [
        { uri: 'trakt://watchlist/shows', mimeType: 'application/json' },
        { uri: 'trakt://watchlist/movies', mimeType: 'application/json' },
      ];

      const handler = vi.fn().mockResolvedValue(JSON.stringify({ items: [] }));

      const result = await handleResourceRead(
        resources,
        'trakt://unknown/uri',
        handler,
        mockClient
      );

      expect(result).toBeNull();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return contents for matching URI', async () => {
      const resources = [
        { uri: 'trakt://watchlist/shows', mimeType: 'application/json' },
        { uri: 'trakt://watchlist/movies', mimeType: 'application/json' },
      ];

      const mockData = JSON.stringify({ items: [{ title: 'Test Show' }] });
      const handler = vi.fn().mockResolvedValue(mockData);

      const result = await handleResourceRead(
        resources,
        'trakt://watchlist/shows',
        handler,
        mockClient
      );

      expect(result).toEqual({
        contents: [
          {
            uri: 'trakt://watchlist/shows',
            mimeType: 'application/json',
            text: mockData,
          },
        ],
      });
      expect(handler).toHaveBeenCalledWith(mockClient, 'trakt://watchlist/shows');
    });

    it('should use single-pass lookup (only call find once)', async () => {
      const resources = [
        { uri: 'trakt://history/shows/recent', mimeType: 'application/json' },
        { uri: 'trakt://history/movies/recent', mimeType: 'application/json' },
      ];

      // Spy on array.find to ensure it's only called once
      const findSpy = vi.spyOn(resources, 'find');

      const handler = vi.fn().mockResolvedValue(JSON.stringify({ items: [] }));

      await handleResourceRead(resources, 'trakt://history/movies/recent', handler, mockClient);

      // Should only call find once (single-pass)
      expect(findSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle handler errors', async () => {
      const resources = [{ uri: 'trakt://profile', mimeType: 'application/json' }];

      const handler = vi.fn().mockRejectedValue(new Error('API error'));

      await expect(
        handleResourceRead(resources, 'trakt://profile', handler, mockClient)
      ).rejects.toThrow('API error');
    });

    it('should work with different mimeTypes', async () => {
      const resources = [{ uri: 'trakt://custom', mimeType: 'text/plain' }];

      const handler = vi.fn().mockResolvedValue('plain text data');

      const result = await handleResourceRead(resources, 'trakt://custom', handler, mockClient);

      expect(result).toEqual({
        contents: [
          {
            uri: 'trakt://custom',
            mimeType: 'text/plain',
            text: 'plain text data',
          },
        ],
      });
    });

    it('should handle empty resource arrays', async () => {
      const resources: Array<{ uri: string; mimeType: string }> = [];
      const handler = vi.fn();

      const result = await handleResourceRead(resources, 'trakt://any', handler, mockClient);

      expect(result).toBeNull();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

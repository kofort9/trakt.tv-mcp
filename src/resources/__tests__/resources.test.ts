import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraktClient } from '../../lib/trakt-client.js';
import { getProfile } from '../profile.js';
import { getWatchlist } from '../watchlist.js';
import { getHistory } from '../history.js';
import { TraktConfig, TraktUser } from '../../types/trakt.js';
import { TraktOAuth } from '../../lib/oauth.js';

// Mock TraktClient
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

describe('Resources', () => {
  let mockClient: TraktClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('Profile Resource', () => {
    it('should return user profile', async () => {
      const mockUser: TraktUser = {
        username: 'testuser',
        name: 'Test User',
        ids: { slug: 'testuser' },
        joined_at: '2024-01-01T00:00:00.000Z',
        location: 'Earth',
        about: 'I like movies',
        gender: 'male',
        age: 30,
        images: { avatar: { full: 'avatar.jpg' } },
      };

      vi.spyOn(mockClient, 'getUserSettings').mockResolvedValue({
        user: mockUser,
        account: {
          timezone: 'UTC',
          date_format: 'mdy',
          time_24hr: true,
          cover_image: 'cover.jpg'
        }
      });

      const result = await getProfile(mockClient);
      const parsed = JSON.parse(result);
      
      expect(parsed).toEqual(mockUser);
    });
  });

  describe('Watchlist Resource', () => {
    it('should return shows watchlist', async () => {
      const mockWatchlist = [
        { type: 'show', show: { title: 'Show 1', ids: { trakt: 1, slug: 'show-1' } } }
      ];
      
      vi.spyOn(mockClient, 'getWatchlist').mockResolvedValue(mockWatchlist);

      const result = await getWatchlist(mockClient, 'trakt://watchlist/shows');
      const parsed = JSON.parse(result);
      
      expect(parsed).toEqual(mockWatchlist);
      expect(mockClient.getWatchlist).toHaveBeenCalledWith('shows');
    });

    it('should return movies watchlist', async () => {
        const mockWatchlist = [
          { type: 'movie', movie: { title: 'Movie 1', ids: { trakt: 1, slug: 'movie-1' } } }
        ];
        
        vi.spyOn(mockClient, 'getWatchlist').mockResolvedValue(mockWatchlist);
  
        const result = await getWatchlist(mockClient, 'trakt://watchlist/movies');
        const parsed = JSON.parse(result);
        
        expect(parsed).toEqual(mockWatchlist);
        expect(mockClient.getWatchlist).toHaveBeenCalledWith('movies');
    });

    it('should throw error for unknown URI', async () => {
      await expect(getWatchlist(mockClient, 'trakt://watchlist/invalid'))
        .rejects.toThrow('Unknown watchlist URI');
    });
  });

  describe('History Resource', () => {
    it('should return recent shows history', async () => {
        const mockHistory = [
            { type: 'episode', show: { title: 'Show 1' }, watched_at: '2024-01-01' }
        ];
        
        vi.spyOn(mockClient, 'getHistory').mockResolvedValue(mockHistory);

        const result = await getHistory(mockClient, 'trakt://history/shows/recent');
        const parsed = JSON.parse(result);
        
        expect(parsed.metadata.type).toBe('shows');
        expect(parsed.items).toEqual(mockHistory);
        expect(mockClient.getHistory).toHaveBeenCalledWith('shows', undefined, undefined, 1);
    });

    it('should return recent movies history', async () => {
        const mockHistory = [
            { type: 'movie', movie: { title: 'Movie 1' }, watched_at: '2024-01-01' }
        ];
        
        vi.spyOn(mockClient, 'getHistory').mockResolvedValue(mockHistory);

        const result = await getHistory(mockClient, 'trakt://history/movies/recent');
        const parsed = JSON.parse(result);
        
        expect(parsed.metadata.type).toBe('movies');
        expect(parsed.items).toEqual(mockHistory);
        expect(mockClient.getHistory).toHaveBeenCalledWith('movies', undefined, undefined, 1);
    });

    it('should throw error for unknown URI', async () => {
        await expect(getHistory(mockClient, 'trakt://history/invalid'))
          .rejects.toThrow('Unknown history URI');
    });
  });
});


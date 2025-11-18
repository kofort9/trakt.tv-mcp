import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { TraktOAuth } from '../oauth.js';
import { TraktConfig, DeviceCodeResponse, TokenResponse } from '../../types/trakt.js';
import * as fs from 'fs';

// Mock axios and fs
vi.mock('axios');
vi.mock('fs');

const mockedAxios = vi.mocked(axios, true);
const mockedFs = vi.mocked(fs);

describe('TraktOAuth', () => {
  let config: TraktConfig;
  let oauth: TraktOAuth;

  beforeEach(() => {
    config = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
      apiVersion: '2',
      apiBaseUrl: 'https://api.trakt.tv',
    };

    // Mock fs functions
    mockedFs.existsSync = vi.fn().mockReturnValue(false);
    mockedFs.readFileSync = vi.fn();
    mockedFs.writeFileSync = vi.fn();

    oauth = new TraktOAuth(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initiateDeviceFlow', () => {
    it('should initiate device flow and return device code', async () => {
      const mockDeviceCode: DeviceCodeResponse = {
        device_code: 'test-device-code',
        user_code: 'TEST123',
        verification_url: 'https://trakt.tv/activate',
        expires_in: 600,
        interval: 5,
      };

      mockedAxios.post = vi.fn().mockResolvedValue({ data: mockDeviceCode });

      const result = await oauth.initiateDeviceFlow();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.trakt.tv/oauth/device/code',
        { client_id: 'test-client-id' },
        { headers: { 'Content-Type': 'application/json' } }
      );
      expect(result).toEqual(mockDeviceCode);
    });
  });

  describe('pollForToken', () => {
    it('should successfully poll and receive token', async () => {
      const mockTokenResponse: TokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 7776000,
        refresh_token: 'test-refresh-token',
        scope: 'public',
        created_at: Date.now() / 1000,
      };

      mockedAxios.post = vi.fn().mockResolvedValue({ data: mockTokenResponse });

      const result = await oauth.pollForToken('test-device-code', 1);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.trakt.tv/oauth/device/token',
        {
          code: 'test-device-code',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      expect(result).toEqual(mockTokenResponse);
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error on invalid device code (404)', async () => {
      mockedAxios.post = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 404,
          data: { error: 'invalid_grant' },
        },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(oauth.pollForToken('invalid-code', 1)).rejects.toThrow(
        'Device authorization failed'
      );
    });

    it('should throw error on expired device code (410)', async () => {
      mockedAxios.post = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 410,
          data: { error: 'expired_token' },
        },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(oauth.pollForToken('expired-code', 1)).rejects.toThrow(
        'Device authorization failed'
      );
    });

    it('should throw error on denied authorization (418)', async () => {
      mockedAxios.post = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 418,
          data: { error: 'access_denied' },
        },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(oauth.pollForToken('denied-code', 1)).rejects.toThrow(
        'Device authorization failed'
      );
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      // Set up initial token
      const initialToken = {
        access_token: 'old-access-token',
        token_type: 'Bearer',
        expires_in: 7776000,
        refresh_token: 'test-refresh-token',
        scope: 'public',
        created_at: Date.now() / 1000,
        expires_at: Date.now() - 1000, // Expired
      };

      // Mock token loading
      mockedFs.existsSync = vi.fn().mockReturnValue(true);
      mockedFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(initialToken));

      oauth = new TraktOAuth(config);

      const mockNewToken: TokenResponse = {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 7776000,
        refresh_token: 'new-refresh-token',
        scope: 'public',
        created_at: Date.now() / 1000,
      };

      mockedAxios.post = vi.fn().mockResolvedValue({ data: mockNewToken });

      await oauth.refreshToken();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.trakt.tv/oauth/token',
        {
          refresh_token: 'test-refresh-token',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          grant_type: 'refresh_token',
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error when no refresh token available', async () => {
      await expect(oauth.refreshToken()).rejects.toThrow(
        'No refresh token available. Please authenticate again.'
      );
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when authenticated and not expired', async () => {
      const token = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 7776000,
        refresh_token: 'test-refresh-token',
        scope: 'public',
        created_at: Date.now() / 1000,
        expires_at: Date.now() + 3600000, // Expires in 1 hour
      };

      mockedFs.existsSync = vi.fn().mockReturnValue(true);
      mockedFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(token));

      oauth = new TraktOAuth(config);

      const accessToken = await oauth.getAccessToken();

      expect(accessToken).toBe('test-access-token');
    });

    it('should throw error when not authenticated', async () => {
      await expect(oauth.getAccessToken()).rejects.toThrow(
        'Not authenticated. Please run device authorization flow first.'
      );
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token is stored', () => {
      expect(oauth.isAuthenticated()).toBe(false);
    });

    it('should return true when token is loaded', () => {
      const token = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 7776000,
        refresh_token: 'test-refresh-token',
        scope: 'public',
        created_at: Date.now() / 1000,
        expires_at: Date.now() + 3600000,
      };

      mockedFs.existsSync = vi.fn().mockReturnValue(true);
      mockedFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(token));

      oauth = new TraktOAuth(config);

      expect(oauth.isAuthenticated()).toBe(true);
    });
  });

  describe('logout', () => {
    it('should clear stored token', () => {
      const token = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 7776000,
        refresh_token: 'test-refresh-token',
        scope: 'public',
        created_at: Date.now() / 1000,
        expires_at: Date.now() + 3600000,
      };

      mockedFs.existsSync = vi.fn().mockReturnValue(true);
      mockedFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(token));

      oauth = new TraktOAuth(config);
      expect(oauth.isAuthenticated()).toBe(true);

      oauth.logout();

      expect(oauth.isAuthenticated()).toBe(false);
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.trakt-mcp-token.json'),
        JSON.stringify(null)
      );
    });
  });
});

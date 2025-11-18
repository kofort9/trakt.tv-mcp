import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, getDefaultPrivacy } from '../config.js';

describe('Configuration Loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load configuration with all environment variables set', () => {
      process.env.TRAKT_CLIENT_ID = 'test-client-id';
      process.env.TRAKT_CLIENT_SECRET = 'test-client-secret';
      process.env.TRAKT_REDIRECT_URI = 'http://localhost:8000/callback';
      process.env.TRAKT_API_VERSION = '2';
      process.env.TRAKT_API_BASE_URL = 'https://api.trakt.tv';

      const config = loadConfig();

      expect(config).toEqual({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:8000/callback',
        apiVersion: '2',
        apiBaseUrl: 'https://api.trakt.tv',
      });
    });

    it('should use default values for optional environment variables', () => {
      process.env.TRAKT_CLIENT_ID = 'test-client-id';
      process.env.TRAKT_CLIENT_SECRET = 'test-client-secret';

      const config = loadConfig();

      expect(config).toEqual({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
        apiVersion: '2',
        apiBaseUrl: 'https://api.trakt.tv',
      });
    });

    it('should throw error when TRAKT_CLIENT_ID is missing', () => {
      process.env.TRAKT_CLIENT_SECRET = 'test-client-secret';
      delete process.env.TRAKT_CLIENT_ID;

      expect(() => loadConfig()).toThrow(
        'Missing required Trakt.tv credentials. Please set TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET in .env file.'
      );
    });

    it('should throw error when TRAKT_CLIENT_SECRET is missing', () => {
      process.env.TRAKT_CLIENT_ID = 'test-client-id';
      delete process.env.TRAKT_CLIENT_SECRET;

      expect(() => loadConfig()).toThrow(
        'Missing required Trakt.tv credentials. Please set TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET in .env file.'
      );
    });

    it('should throw error when both credentials are missing', () => {
      delete process.env.TRAKT_CLIENT_ID;
      delete process.env.TRAKT_CLIENT_SECRET;

      expect(() => loadConfig()).toThrow(
        'Missing required Trakt.tv credentials. Please set TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET in .env file.'
      );
    });
  });

  describe('getDefaultPrivacy', () => {
    it('should return "private" when DEFAULT_PRIVACY is not set', () => {
      delete process.env.DEFAULT_PRIVACY;
      expect(getDefaultPrivacy()).toBe('private');
    });

    it('should return "public" when DEFAULT_PRIVACY is set to "public"', () => {
      process.env.DEFAULT_PRIVACY = 'public';
      expect(getDefaultPrivacy()).toBe('public');
    });

    it('should return "public" when DEFAULT_PRIVACY is set to "PUBLIC"', () => {
      process.env.DEFAULT_PRIVACY = 'PUBLIC';
      expect(getDefaultPrivacy()).toBe('public');
    });

    it('should return "private" when DEFAULT_PRIVACY is set to "private"', () => {
      process.env.DEFAULT_PRIVACY = 'private';
      expect(getDefaultPrivacy()).toBe('private');
    });

    it('should return "private" when DEFAULT_PRIVACY is set to invalid value', () => {
      process.env.DEFAULT_PRIVACY = 'invalid';
      expect(getDefaultPrivacy()).toBe('private');
    });
  });
});

import dotenv from 'dotenv';
import { TraktConfig } from '../types/trakt.js';

// Load environment variables
dotenv.config();

/**
 * Validates and loads the Trakt.tv configuration from environment variables
 */
export function loadConfig(): TraktConfig {
  const requiredVars = {
    clientId: process.env.TRAKT_CLIENT_ID,
    clientSecret: process.env.TRAKT_CLIENT_SECRET,
    redirectUri: process.env.TRAKT_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob',
    apiVersion: process.env.TRAKT_API_VERSION || '2',
    apiBaseUrl: process.env.TRAKT_API_BASE_URL || 'https://api.trakt.tv',
  };

  // Validate required credentials
  if (!requiredVars.clientId || !requiredVars.clientSecret) {
    throw new Error(
      'Missing required Trakt.tv credentials. Please set TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET in .env file.'
    );
  }

  return {
    clientId: requiredVars.clientId,
    clientSecret: requiredVars.clientSecret,
    redirectUri: requiredVars.redirectUri,
    apiVersion: requiredVars.apiVersion,
    apiBaseUrl: requiredVars.apiBaseUrl,
  };
}

/**
 * Get the default privacy setting for watch tracking
 */
export function getDefaultPrivacy(): 'public' | 'private' {
  const privacy = process.env.DEFAULT_PRIVACY?.toLowerCase();
  return privacy === 'public' ? 'public' : 'private';
}

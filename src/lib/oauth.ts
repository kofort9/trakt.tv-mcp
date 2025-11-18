import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  DeviceCodeResponse,
  TokenResponse,
  StoredToken,
  TraktConfig,
} from '../types/trakt.js';

const TOKEN_FILE_PATH = join(homedir(), '.trakt-mcp-token.json');

/**
 * OAuth manager for Trakt.tv authentication
 */
export class TraktOAuth {
  private config: TraktConfig;
  private token: StoredToken | null = null;

  constructor(config: TraktConfig) {
    this.config = config;
    this.loadToken();
  }

  /**
   * Initiate the device authorization flow
   */
  async initiateDeviceFlow(): Promise<DeviceCodeResponse> {
    const response = await axios.post<DeviceCodeResponse>(
      `${this.config.apiBaseUrl}/oauth/device/code`,
      {
        client_id: this.config.clientId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  /**
   * Poll for device authorization token
   */
  async pollForToken(deviceCode: string, interval: number): Promise<TokenResponse> {
    const pollInterval = interval * 1000; // Convert to milliseconds

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      try {
        const response = await axios.post<TokenResponse>(
          `${this.config.apiBaseUrl}/oauth/device/token`,
          {
            code: deviceCode,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        // Success! Save and return the token
        const tokenWithExpiry: StoredToken = {
          ...response.data,
          expires_at: Date.now() + response.data.expires_in * 1000,
        };
        this.token = tokenWithExpiry;
        this.saveToken(tokenWithExpiry);
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;

          // 400 = pending authorization, keep polling
          if (status === 400) {
            continue;
          }

          // 404 = invalid code, 410 = expired, 418 = denied
          if (status === 404 || status === 410 || status === 418) {
            throw new Error(`Device authorization failed: ${error.response.data.error}`);
          }

          // 429 = polling too fast
          if (status === 429) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            continue;
          }
        }

        throw error;
      }
    }
  }

  /**
   * Refresh an expired access token
   */
  async refreshToken(): Promise<void> {
    if (!this.token?.refresh_token) {
      throw new Error('No refresh token available. Please authenticate again.');
    }

    const response = await axios.post<TokenResponse>(
      `${this.config.apiBaseUrl}/oauth/token`,
      {
        refresh_token: this.token.refresh_token,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const tokenWithExpiry: StoredToken = {
      ...response.data,
      expires_at: Date.now() + response.data.expires_in * 1000,
    };

    this.token = tokenWithExpiry;
    this.saveToken(tokenWithExpiry);
  }

  /**
   * Get current access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    if (!this.token) {
      throw new Error('Not authenticated. Please run device authorization flow first.');
    }

    // Check if token is expired or will expire in the next 5 minutes
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes
    if (Date.now() + expiryBuffer >= this.token.expires_at) {
      await this.refreshToken();
    }

    return this.token!.access_token;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /**
   * Clear stored authentication
   */
  logout(): void {
    this.token = null;
    if (existsSync(TOKEN_FILE_PATH)) {
      writeFileSync(TOKEN_FILE_PATH, JSON.stringify(null));
    }
  }

  /**
   * Load token from disk
   */
  private loadToken(): void {
    try {
      if (existsSync(TOKEN_FILE_PATH)) {
        const data = readFileSync(TOKEN_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(data);
        if (parsed && parsed.access_token) {
          this.token = parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load token:', error);
    }
  }

  /**
   * Save token to disk
   */
  private saveToken(token: StoredToken): void {
    try {
      writeFileSync(TOKEN_FILE_PATH, JSON.stringify(token, null, 2));
    } catch (error) {
      console.error('Failed to save token:', error);
    }
  }
}

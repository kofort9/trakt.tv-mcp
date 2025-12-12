import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { DeviceCodeResponse, TokenResponse, StoredToken, TraktConfig } from '../types/trakt.js';
import { logError } from './logging.js';

const TOKEN_FILE_PATH = join(homedir(), '.trakt-mcp', '.trakt-token.json');

/**
 * OAuth manager for Trakt.tv authentication
 */
export class TraktOAuth {
  private config: TraktConfig;
  private token: StoredToken | null = null;
  private isPolling: boolean = false;
  private abortPolling: boolean = false;

  constructor(config: TraktConfig) {
    this.config = config;
    this.loadToken();
  }

  /**
   * Check if a polling operation is currently in progress
   */
  isPollingInProgress(): boolean {
    return this.isPolling;
  }

  /**
   * Cancel any ongoing polling operation
   */
  cancelPolling(): void {
    this.abortPolling = true;
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
   * @param deviceCode - The device code from initiateDeviceFlow
   * @param interval - Polling interval in seconds
   * @throws Error if polling is already in progress, cancelled, or authorization fails
   */
  async pollForToken(deviceCode: string, interval: number): Promise<TokenResponse> {
    // Guard against concurrent polling operations
    if (this.isPolling) {
      throw new Error(
        'Polling already in progress. Call cancelPolling() first to start a new poll.'
      );
    }

    this.isPolling = true;
    this.abortPolling = false;
    const pollInterval = interval * 1000; // Convert to milliseconds

    try {
      while (true) {
        // Check for cancellation before waiting
        if (this.abortPolling) {
          throw new Error('Polling was cancelled');
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        // Check for cancellation after waiting
        if (this.abortPolling) {
          throw new Error('Polling was cancelled');
        }

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
    } finally {
      // Always reset polling state when done
      this.isPolling = false;
      this.abortPolling = false;
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
      logError('Failed to load token:', error);
    }
  }

  /**
   * Save token to disk
   */
  private saveToken(token: StoredToken): void {
    try {
      const tokenDir = dirname(TOKEN_FILE_PATH);
      // Ensure directory exists with secure permissions (0700 = user only)
      if (!existsSync(tokenDir)) {
        mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
      }
      writeFileSync(TOKEN_FILE_PATH, JSON.stringify(token, null, 2));
      // Set file permissions to 0600 (user read/write only) for security
      chmodSync(TOKEN_FILE_PATH, 0o600);
    } catch (error) {
      logError('Failed to save token:', error);
    }
  }
}

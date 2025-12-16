import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { loadConfig } from '../../src/core/config.js';
import { TraktOAuth } from '../../src/domain/trakt/oauth.js';
import { TraktClient } from '../../src/domain/trakt/trakt-client.js';
import * as tools from '../../src/domain/trakt/tools.js';
import type { TraktWatchlistItem } from '../../src/types/trakt.js';

const e2eEnabled = process.env.E2E_TESTS_ENABLED === 'true';
const requiredEnv = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
let skipReason = !e2eEnabled
  ? 'E2E_TESTS_ENABLED is not true'
  : missingEnv.length
    ? `Missing env vars: ${missingEnv.join(', ')}`
    : '';

if (skipReason) {
  describe.skip(`E2E workflows (Trakt API) - ${skipReason}`, () => {
    it('skipped (enable with E2E_TESTS_ENABLED=true and Trakt credentials)', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const ISO_TOLERANCE_MS = 10 * 60 * 1000; // 10 minutes

  let client: TraktClient;
  let shouldSkip = false;
  let skipMessage = '';

  beforeAll(async () => {
    const config = loadConfig();
    let oauth = new TraktOAuth(config);

    if (!oauth.isAuthenticated()) {
      const tokenJson = process.env.TRAKT_TOKEN_JSON;
      if (tokenJson) {
        try {
          const parsed = JSON.parse(tokenJson);
          const tokenPath = join(homedir(), '.trakt-mcp', '.trakt-token.json');
          mkdirSync(dirname(tokenPath), { recursive: true });
          writeFileSync(tokenPath, JSON.stringify(parsed), { encoding: 'utf8', mode: 0o600 });
          oauth = new TraktOAuth(config);
        } catch (error) {
          shouldSkip = true;
          skipMessage = `Invalid TRAKT_TOKEN_JSON: ${error instanceof Error ? error.message : String(error)}`;
          return;
        }
      }
    }

    if (!oauth.isAuthenticated()) {
      shouldSkip = true;
      skipMessage = 'Trakt OAuth token not found. Run authenticate tool or set TRAKT_TOKEN_JSON.';
      return;
    }

    // Ensure token is fresh (will refresh if near expiry)
    await oauth.getAccessToken();
    client = new TraktClient(config, oauth);
  });

  if (skipReason) {
    describe.skip(`E2E workflows (Trakt API) - ${skipReason}`, () => {
      it('skipped (seed Trakt token first)', () => {
        expect(true).toBe(true);
      });
    });
  } else {
    async function isShowInWatchlist(traktId: number): Promise<boolean> {
      const watchlist = await client.getWatchlist('shows');
      if (!Array.isArray(watchlist)) {
        return false;
      }

      return watchlist.some((item: TraktWatchlistItem) => item.show?.ids?.trakt === traktId);
    }

    describe('E2E workflows (Trakt API)', () => {
      it('logs a movie and sees it in history', async () => {
        if (shouldSkip) {
          expect.skip(skipMessage);
          return;
        }

        const movieName = 'Dune';
        const year = 2021;
        const watchedAt = new Date().toISOString();

        const logResult = await tools.logWatch(client, {
          type: 'movie',
          movieName,
          year,
          watchedAt,
        });

        expect(logResult.success).toBe(true);

        const historyResult = await tools.getHistory(client, { type: 'movies', limit: 40 });
        expect(historyResult.success).toBe(true);
        const items = historyResult.data ?? [];

        const found = items.some((item) => {
          if (item.type !== 'movie' || !item.movie) return false;
          const titleMatches = item.movie.title.toLowerCase().includes(movieName.toLowerCase());
          const timeDelta = Math.abs(
            new Date(item.watched_at).getTime() - new Date(watchedAt).getTime()
          );
          return titleMatches && timeDelta <= ISO_TOLERANCE_MS;
        });

        expect(found).toBe(true);
      });

      it('bulk logs episodes and verifies recent history contains the show', async () => {
        if (shouldSkip) {
          expect.skip(skipMessage);
          return;
        }

        const showName = 'The Office';
        const year = 2005;
        const watchedAt = new Date().toISOString();

        const bulkResult = await tools.bulkLog(client, {
          type: 'episodes',
          showName,
          season: 1,
          episodes: '1-2',
          year,
          watchedAt,
        });

        expect(bulkResult.success).toBe(true);

        const historyResult = await tools.getHistory(client, { type: 'shows', limit: 60 });
        expect(historyResult.success).toBe(true);
        const items = historyResult.data ?? [];

        const recentEpisodes = items.filter((item) => {
          if (item.type !== 'episode' || !item.show) return false;
          const titleMatches = item.show.title.toLowerCase().includes(showName.toLowerCase());
          const timeDelta = Math.abs(
            new Date(item.watched_at).getTime() - new Date(watchedAt).getTime()
          );
          return titleMatches && timeDelta <= ISO_TOLERANCE_MS;
        });

        expect(recentEpisodes.length).toBeGreaterThan(0);
      });

      it('follows then unfollows a show and reflects in watchlist', async () => {
        if (shouldSkip) {
          expect.skip(skipMessage);
          return;
        }

        const showName = 'Severance';
        const year = 2022;

        const followResult = await tools.followShow(client, { showName, year });
        expect(followResult.success).toBe(true);

        const showId = followResult.success ? followResult.data.show.ids.trakt : undefined;
        expect(showId).toBeDefined();

        if (!showId) {
          throw new Error('Follow show did not return a trakt id');
        }

        const presentAfterFollow = await isShowInWatchlist(showId);
        expect(presentAfterFollow).toBe(true);

        const unfollowResult = await tools.unfollowShow(client, { showName, year });
        expect(unfollowResult.success).toBe(true);

        const presentAfterUnfollow = await isShowInWatchlist(showId);
        expect(presentAfterUnfollow).toBe(false);
      });
    });
  }
}

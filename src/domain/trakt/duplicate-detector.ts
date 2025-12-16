import { TraktClient } from './trakt-client.js';
import { TraktWatchedItem } from '../../types/trakt.js';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingEntry?: TraktWatchedItem;
  watchedAt?: string;
}

/**
 * Duplicate detection for watch history to prevent accidental re-logs
 *
 * Checks recent history (default: 48 hours) to prevent logging the same
 * episode/movie multiple times unless explicitly allowed.
 */
export class DuplicateDetector {
  constructor(private client: TraktClient) {}

  /**
   * Check if content has been logged recently
   *
   * @param content - Content to check (type, traktId, season, episode)
   * @param windowHours - Look-back window in hours (default: 48)
   * @returns DuplicateCheckResult with duplicate status and existing entry if found
   */
  async checkRecent(
    content: {
      type: 'episode' | 'movie';
      traktId: number;
      season?: number;
      episode?: number;
    },
    windowHours: number = 48
  ): Promise<DuplicateCheckResult> {
    try {
      // Calculate start date for the check window
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - windowHours);
      const startDateISO = startDate.toISOString();

      // Fetch recent history for the content type
      const historyType = content.type === 'episode' ? 'shows' : 'movies';
      const history = await this.client.getHistory(historyType, startDateISO, undefined, 1, {
        toolName: 'duplicate_detector',
      });

      if (!Array.isArray(history) || history.length === 0) {
        return { isDuplicate: false };
      }

      // Check for matching entry
      for (const entry of history) {
        // Verify entry is within the time window
        const entryDate = new Date(entry.watched_at);
        const windowStart = new Date();
        windowStart.setHours(windowStart.getHours() - windowHours);

        if (entryDate < windowStart) {
          // Entry is outside the window
          continue;
        }

        if (content.type === 'episode') {
          // Check episode match
          const show = entry.show;
          const episode = entry.episode;

          if (
            show?.ids.trakt === content.traktId &&
            episode?.season === content.season &&
            episode?.number === content.episode
          ) {
            return {
              isDuplicate: true,
              existingEntry: entry,
              watchedAt: entry.watched_at,
            };
          }
        } else {
          // Check movie match
          const movie = entry.movie;

          if (movie?.ids.trakt === content.traktId) {
            return {
              isDuplicate: true,
              existingEntry: entry,
              watchedAt: entry.watched_at,
            };
          }
        }
      }

      return { isDuplicate: false };
    } catch (error) {
      // Log error but don't fail the operation - duplicate detection is advisory
      console.error('Duplicate detection failed:', error);
      return { isDuplicate: false };
    }
  }
}

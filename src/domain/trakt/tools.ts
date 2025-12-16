import { TraktClient } from './trakt-client.js';
import { CacheMetrics } from './cache.js';
import { DuplicateDetector } from './duplicate-detector.js';
import { WatchLogQueue } from './watch-queue.js';
import { BulkSummaryBuilder } from './bulk-summary.js';
import { parseWatchNote } from '../../shared/nl-parser.js';
import {
  parseEpisodeRange,
  validateEpisodeNumber,
  validateSeasonNumber,
  createToolError,
  createToolSuccess,
  validateNonEmptyString,
  validateISO8601Date,
  handleSearchDisambiguation,
  sanitizeError,
  ToolError,
  ToolSuccess,
} from '../../shared/utils.js';
import { logger, RequestLog, ToolMetrics } from '../../core/logger.js';
import { parallelSearchMovies } from '../../core/parallel.js';
import {
  TraktEpisode,
  TraktShow,
  TraktWatchedItem,
  TraktHistoryAddResponse,
  TraktCalendarItem,
  TraktHistorySummary,
  DisambiguationResponse,
  LogPreviewResponse,
} from '../../types/trakt.js';

/**
 * Search for a specific episode by show name, season, and episode number
 */
export async function searchEpisode(
  client: TraktClient,
  args: {
    showName: string;
    season: number;
    episode: number;
    year?: number;
    traktId?: number;
  }
): Promise<ToolSuccess<TraktEpisode> | ToolError | DisambiguationResponse> {
  try {
    const { showName, season, episode, year, traktId } = args;

    // Validate inputs
    validateNonEmptyString(showName, 'showName');
    validateSeasonNumber(season);
    validateEpisodeNumber(episode);

    // First, search for the show
    const toolName = 'search_episode';
    const searchResults = await client.search(showName, 'show', year, { toolName });

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return createToolError('NOT_FOUND', `No show found matching "${showName}"`, undefined, [
        'Check the spelling of the show name',
        'Try using search_show to browse available titles',
        'Use the exact title as it appears on Trakt.tv',
        'Try including the year if there are multiple versions',
      ]);
    }

    // Handle disambiguation
    const disambiguationResult = handleSearchDisambiguation(
      searchResults,
      showName,
      'show',
      year,
      traktId
    );

    if (disambiguationResult.needsDisambiguation) {
      return disambiguationResult.response;
    }

    const show = disambiguationResult.selected.show;
    if (!show) {
      return createToolError('NOT_FOUND', `Show data not found in search results`);
    }

    // Get the specific episode
    const episodeData = await client.searchEpisode(show.ids.slug, season, episode, { toolName });

    return createToolSuccess<TraktEpisode>(episodeData as TraktEpisode);
  } catch (error) {
    const message = sanitizeError(error, 'searchEpisode');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Log a single episode or movie as watched.
 *
 * Accepts show/movie names and searches internally. For disambiguation,
 * use year or traktId parameters.
 *
 * @param watchedAt - Optional. ISO 8601 date string. Accepts two formats:
 *                    - Date only: "2025-12-08" (YYYY-MM-DD)
 *                    - Full timestamp: "2025-12-08T20:30:00.000Z"
 *                    Claude converts natural language ("yesterday", "last week")
 *                    to ISO format before calling this tool.
 *                    If not provided, defaults to current time.
 */
export async function logWatch(
  client: TraktClient,
  args: {
    type: 'episode' | 'movie';
    showName?: string;
    movieName?: string;
    season?: number;
    episode?: number;
    watchedAt?: string;
    year?: number;
    traktId?: number;
    preview?: boolean;
    allowDuplicates?: boolean;
  }
): Promise<
  | ToolSuccess<TraktHistoryAddResponse>
  | ToolSuccess<LogPreviewResponse>
  | ToolError
  | DisambiguationResponse
> {
  try {
    const {
      type,
      showName,
      movieName,
      season,
      episode,
      watchedAt,
      year,
      traktId,
      preview,
      allowDuplicates,
    } = args;
    const toolName = 'log_watch';
    const duplicateDetector = new DuplicateDetector(client);

    // Validate ISO 8601 format for watchedAt
    validateISO8601Date(watchedAt, 'watchedAt');

    // watchedAt accepts ISO 8601 format only (YYYY-MM-DD or full timestamp)
    // Claude handles natural language → ISO conversion
    const watched_at = watchedAt || new Date().toISOString();

    if (type === 'episode') {
      if (!showName || season === undefined || episode === undefined) {
        return createToolError(
          'VALIDATION_ERROR',
          'For episodes, showName, season, and episode are required'
        );
      }

      validateNonEmptyString(showName, 'showName');
      validateSeasonNumber(season);
      validateEpisodeNumber(episode);

      // Search for the show
      const searchResults = await client.search(showName, 'show', year, { toolName });
      if (!Array.isArray(searchResults) || searchResults.length === 0) {
        return createToolError('NOT_FOUND', `No show found matching "${showName}"`, undefined, [
          'Check the spelling of the show name',
          'Try using search_show to browse available titles',
        ]);
      }

      // Handle disambiguation
      const disambiguationResult = handleSearchDisambiguation(
        searchResults,
        showName,
        'show',
        year,
        traktId
      );

      if (disambiguationResult.needsDisambiguation) {
        return disambiguationResult.response;
      }

      const show = disambiguationResult.selected.show;
      if (!show) {
        return createToolError('NOT_FOUND', `Show data not found in search results`);
      }

      // Preview mode: return formatted preview without syncing
      if (preview) {
        return createToolSuccess<LogPreviewResponse>({
          action_required: 'confirm',
          preview: {
            type: 'episode',
            title: show.title,
            year: show.year,
            season,
            episode,
            watchedAt: watched_at,
            traktId: show.ids.trakt,
          },
          message: `Preview: Would log ${show.title}${show.year ? ` (${show.year})` : ''} S${season}E${episode} as watched on ${watched_at}`,
        });
      }

      // Add to history
      const historyData = {
        shows: [
          {
            watched_at,
            ids: { trakt: show.ids.trakt },
            seasons: [
              {
                number: season,
                episodes: [{ number: episode }],
              },
            ],
          },
        ],
      };

      const response = await client.addToHistory(historyData, { toolName });
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    } else {
      // Movie
      if (!movieName) {
        return createToolError('VALIDATION_ERROR', 'For movies, movieName is required');
      }

      validateNonEmptyString(movieName, 'movieName');

      // Search for the movie
      const searchResults = await client.search(movieName, 'movie', year, { toolName });
      if (!Array.isArray(searchResults) || searchResults.length === 0) {
        return createToolError('NOT_FOUND', `No movie found matching "${movieName}"`, undefined, [
          'Check the spelling of the movie name',
          'Try using search_show to browse available movies',
        ]);
      }

      // Handle disambiguation
      const disambiguationResult = handleSearchDisambiguation(
        searchResults,
        movieName,
        'movie',
        year,
        traktId
      );

      if (disambiguationResult.needsDisambiguation) {
        return disambiguationResult.response;
      }

      const movie = disambiguationResult.selected.movie;
      if (!movie) {
        return createToolError('NOT_FOUND', `Movie data not found in search results`);
      }

      // Check for duplicates unless explicitly allowed
      if (!allowDuplicates) {
        const duplicateCheck = await duplicateDetector.checkRecent({
          type: 'movie',
          traktId: movie.ids.trakt,
        });

        if (duplicateCheck.isDuplicate) {
          const watchedDate = duplicateCheck.watchedAt
            ? new Date(duplicateCheck.watchedAt).toLocaleDateString()
            : 'recently';
          return createToolError(
            'DUPLICATE_ENTRY',
            `Already logged ${movie.title}${movie.year ? ` (${movie.year})` : ''} on ${watchedDate}`,
            { existingEntry: duplicateCheck.existingEntry },
            [
              'This appears to be a duplicate entry',
              'Use allowDuplicates: true to log it again (for rewatches)',
              'Check your history with get_history tool to verify',
            ]
          );
        }
      }

      // Preview mode: return formatted preview without syncing
      if (preview) {
        return createToolSuccess<LogPreviewResponse>({
          action_required: 'confirm',
          preview: {
            type: 'movie',
            title: movie.title,
            year: movie.year,
            watchedAt: watched_at,
            traktId: movie.ids.trakt,
          },
          message: `Preview: Would log ${movie.title}${movie.year ? ` (${movie.year})` : ''} as watched on ${watched_at}`,
        });
      }

      // Add to history
      const historyData = {
        movies: [
          {
            watched_at,
            ids: { trakt: movie.ids.trakt },
          },
        ],
      };

      const response = await client.addToHistory(historyData, { toolName });
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    }
  } catch (error) {
    const message = sanitizeError(error, 'logWatch');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Undo recent watch history entries.
 *
 * Removes the last N entries from watch history with preview and confirmation support.
 *
 * @param limit - Number of entries to remove (default: 1, max: 10)
 * @param confirm - Must be true to actually remove. If false/undefined, returns preview only
 */
export async function undoLastLog(
  client: TraktClient,
  args: {
    limit?: number;
    confirm?: boolean;
  }
): Promise<ToolSuccess | ToolError> {
  try {
    const { limit = 1, confirm = false } = args;
    const toolName = 'undo_last_log';

    // Validate limit
    if (limit < 1 || limit > 10) {
      return createToolError('VALIDATION_ERROR', 'limit must be between 1 and 10');
    }

    // Fetch recent history
    const history = await client.getHistory(undefined, undefined, undefined, 1, { toolName });

    if (!Array.isArray(history) || history.length === 0) {
      return createToolError('NOT_FOUND', 'No recent watch history found');
    }

    // Get the entries to remove (limited to requested amount)
    const entriesToRemove = history.slice(0, limit);

    // Format preview of entries
    const previewEntries = entriesToRemove
      .map((entry) => {
        const watchedAt = new Date(entry.watched_at).toLocaleDateString();
        if (entry.type === 'episode' && entry.show && entry.episode) {
          return `- ${entry.show.title} S${entry.episode.season}E${entry.episode.number} (watched ${watchedAt})`;
        } else if (entry.type === 'movie' && entry.movie) {
          return `- ${entry.movie.title}${entry.movie.year ? ` (${entry.movie.year})` : ''} (watched ${watchedAt})`;
        }
        return `- Unknown entry (watched ${watchedAt})`;
      })
      .join('\n');

    // Preview mode - return what would be removed
    if (!confirm) {
      return createToolSuccess({
        action_required: 'confirm',
        preview: {
          count: entriesToRemove.length,
          entries: entriesToRemove,
        },
        message: `Preview: Would remove ${entriesToRemove.length} entr${entriesToRemove.length === 1 ? 'y' : 'ies'}:\n\n${previewEntries}\n\nTo proceed, call with confirm: true`,
      });
    }

    // Build removal request
    const removeData: {
      movies?: Array<{ ids: { trakt: number }; watched_at: string }>;
      episodes?: Array<{ ids: { trakt: number }; watched_at: string }>;
    } = {};

    for (const entry of entriesToRemove) {
      if (entry.type === 'episode' && entry.episode) {
        if (!removeData.episodes) removeData.episodes = [];
        removeData.episodes.push({
          ids: { trakt: entry.episode.ids.trakt },
          watched_at: entry.watched_at,
        });
      } else if (entry.type === 'movie' && entry.movie) {
        if (!removeData.movies) removeData.movies = [];
        removeData.movies.push({
          ids: { trakt: entry.movie.ids.trakt },
          watched_at: entry.watched_at,
        });
      }
    }

    // Remove from history
    const response = await client.removeFromHistory(removeData, { toolName });

    return createToolSuccess(
      {
        removed: entriesToRemove.length,
        details: previewEntries,
        response,
      },
      `Successfully removed ${entriesToRemove.length} entr${entriesToRemove.length === 1 ? 'y' : 'ies'} from history`
    );
  } catch (error) {
    const message = sanitizeError(error, 'undoLastLog');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Bulk log multiple episodes or movies at once.
 *
 * For episodes: accepts show name, season, and episode range string.
 * For movies: accepts array of movie names.
 *
 * @param episodes - For episodes: range string like "1-5" or "1,3,5" or "1-3,5,7-9"
 * @param watchedAt - Optional. ISO 8601 date string (YYYY-MM-DD or full timestamp).
 *                    Claude converts natural language to ISO format.
 */
export async function bulkLog(
  client: TraktClient,
  args: {
    type: 'episodes' | 'movies';
    showName?: string;
    movieNames?: string[];
    season?: number;
    episodes?: string; // Range string like "1-5" or "1,3,5"
    watchedAt?: string;
    year?: number;
    traktId?: number;
    preview?: boolean;
  }
): Promise<
  | ToolSuccess<TraktHistoryAddResponse>
  | ToolSuccess<LogPreviewResponse>
  | ToolError
  | DisambiguationResponse
> {
  try {
    const { type, showName, movieNames, season, episodes, watchedAt, year, traktId, preview } =
      args;
    const toolName = 'bulk_log';

    // Validate ISO 8601 format for watchedAt
    validateISO8601Date(watchedAt, 'watchedAt');

    // watchedAt accepts ISO 8601 format only
    const watched_at = watchedAt || new Date().toISOString();

    if (type === 'episodes') {
      if (!showName || season === undefined || !episodes) {
        return createToolError(
          'VALIDATION_ERROR',
          'For episodes, showName, season, and episodes range are required'
        );
      }

      validateNonEmptyString(showName, 'showName');
      validateSeasonNumber(season);

      // Parse episode range
      let episodeNumbers: number[];
      try {
        episodeNumbers = parseEpisodeRange(episodes);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createToolError('VALIDATION_ERROR', message);
      }

      // Search for the show
      const searchResults = await client.search(showName, 'show', year, { toolName });
      if (!Array.isArray(searchResults) || searchResults.length === 0) {
        return createToolError('NOT_FOUND', `No show found matching "${showName}"`, undefined, [
          'Check the spelling of the show name',
          'Try using search_show to browse available titles',
        ]);
      }

      // Handle disambiguation
      const disambiguationResult = handleSearchDisambiguation(
        searchResults,
        showName,
        'show',
        year,
        traktId
      );

      if (disambiguationResult.needsDisambiguation) {
        return disambiguationResult.response;
      }

      const show = disambiguationResult.selected.show;
      if (!show) {
        return createToolError('NOT_FOUND', `Show data not found in search results`);
      }

      // Preview mode: return formatted preview without syncing
      if (preview) {
        return createToolSuccess<LogPreviewResponse>({
          action_required: 'confirm',
          preview: {
            type: 'episodes',
            title: show.title,
            year: show.year,
            season,
            episodes: episodeNumbers,
            watchedAt: watched_at,
            traktId: show.ids.trakt,
            count: episodeNumbers.length,
          },
          message: `Preview: Would log ${episodeNumbers.length} episode(s) of ${show.title}${show.year ? ` (${show.year})` : ''} S${season} as watched on ${watched_at}`,
        });
      }

      // Build history data
      const historyData = {
        shows: [
          {
            watched_at,
            ids: { trakt: show.ids.trakt },
            seasons: [
              {
                number: season,
                episodes: episodeNumbers.map((num) => ({ number: num })),
              },
            ],
          },
        ],
      };

      const response = await client.addToHistory(historyData, { toolName });
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    } else {
      // Movies
      if (!movieNames || movieNames.length === 0) {
        return createToolError('VALIDATION_ERROR', 'For movies, movieNames array is required');
      }

      // Validate all movie names first
      for (const movieName of movieNames) {
        validateNonEmptyString(movieName, 'movieName');
      }

      // Parallel search for all movies
      const { results: searchResults, errors: searchErrors } = await parallelSearchMovies(
        client,
        movieNames,
        year,
        { toolName }
      );

      // Handle search errors
      if (searchErrors.size > 0) {
        const errorList = Array.from(searchErrors.entries())
          .map(([movie, error]) => `  - ${movie}: ${error}`)
          .join('\n');

        return createToolError(
          'TRAKT_API_ERROR',
          `Failed to search for ${searchErrors.size} movie(s):\n${errorList}`,
          { failedMovies: Array.from(searchErrors.keys()) }
        );
      }

      // Process search results and handle disambiguation
      const movieData: Array<{ watched_at: string; ids: { trakt: number } }> = [];

      for (const movieName of movieNames) {
        const normalizedName = movieName.toLowerCase().trim();
        const results = searchResults.get(normalizedName);

        if (!results || results.length === 0) {
          return createToolError('NOT_FOUND', `No movie found matching "${movieName}"`, undefined, [
            'Check the spelling of the movie name',
            'Try using search_show to browse available movies',
          ]);
        }

        // Handle disambiguation
        const disambiguationResult = handleSearchDisambiguation(
          results,
          movieName,
          'movie',
          year,
          traktId
        );

        if (disambiguationResult.needsDisambiguation) {
          return {
            ...disambiguationResult.response,
            message: `${disambiguationResult.response.message} (While processing "${movieName}")`,
          };
        }

        const movie = disambiguationResult.selected.movie;
        if (!movie) {
          return createToolError('NOT_FOUND', `Movie data not found for "${movieName}"`);
        }

        movieData.push({
          watched_at,
          ids: { trakt: movie.ids.trakt },
        });
      }

      // Preview mode: return formatted preview without syncing
      if (preview) {
        const movieTitles = movieNames.join(', ');
        return createToolSuccess<LogPreviewResponse>({
          action_required: 'confirm',
          preview: {
            type: 'movies',
            movies: movieNames,
            watchedAt: watched_at,
            count: movieNames.length,
          },
          message: `Preview: Would log ${movieNames.length} movie(s) (${movieTitles}) as watched on ${watched_at}`,
        });
      }

      const historyData = { movies: movieData };
      const response = await client.addToHistory(historyData, { toolName });
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    }
  } catch (error) {
    const message = sanitizeError(error, 'bulkLog');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Get watch history with optional filters.
 *
 * @param startDate - Optional. ISO 8601 date string (YYYY-MM-DD or full timestamp).
 *                    Claude converts natural language to ISO format.
 * @param endDate - Optional. ISO 8601 date string.
 */
export async function getHistory(
  client: TraktClient,
  args: {
    type?: 'shows' | 'movies';
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<ToolSuccess<TraktWatchedItem[]> | ToolError> {
  try {
    const { type, startDate, endDate, limit } = args;
    const toolName = 'get_history';

    // Validate ISO 8601 format for date parameters
    validateISO8601Date(startDate, 'startDate');
    validateISO8601Date(endDate, 'endDate');

    // startDate/endDate accept ISO 8601 format directly
    // Claude handles natural language → ISO conversion

    // Fetch history
    const history = await client.getHistory(type, startDate, endDate, undefined, { toolName });

    // Apply limit if specified
    let results = Array.isArray(history) ? history : [];
    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    // Add helpful message for empty results
    if (results.length === 0) {
      const parts: string[] = ['No watch history found'];
      if (startDate || endDate) {
        parts.push('in the specified date range');
      }
      if (type) {
        parts.push(`for ${type}`);
      }
      const message =
        parts.join(' ') + '. Try logging some content with log_watch or bulk_log first.';

      return {
        success: true,
        data: results,
        message,
      } as ToolSuccess<TraktWatchedItem[]>;
    }

    return createToolSuccess(results);
  } catch (error) {
    const message = sanitizeError(error, 'getHistory');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Summarize watch history with analytics.
 *
 * @param startDate - Optional. ISO 8601 date string (YYYY-MM-DD or full timestamp).
 *                    Claude converts natural language to ISO format.
 * @param endDate - Optional. ISO 8601 date string.
 */
export async function summarizeHistory(
  client: TraktClient,
  args: {
    startDate?: string;
    endDate?: string;
  }
): Promise<ToolSuccess<TraktHistorySummary> | ToolError> {
  try {
    const { startDate, endDate } = args;
    const toolName = 'summarize_history';

    // Validate ISO 8601 format for date parameters
    validateISO8601Date(startDate, 'startDate');
    validateISO8601Date(endDate, 'endDate');

    // startDate/endDate accept ISO 8601 format directly
    // Claude handles natural language → ISO conversion

    // Fetch full history
    const history = await client.getHistory(undefined, startDate, endDate, undefined, {
      toolName,
    });

    if (!Array.isArray(history)) {
      return createToolError('TRAKT_API_ERROR', 'Invalid history response format');
    }

    // Calculate statistics
    const shows = new Map<number, { show: TraktShow; count: number }>();
    const movies = new Set<number>();
    let totalEpisodes = 0;

    const now = Date.now();
    const day24h = 24 * 60 * 60 * 1000;
    const week = 7 * day24h;
    const month = 30 * day24h;

    let last24h = 0;
    let lastWeek = 0;
    let lastMonth = 0;

    for (const item of history) {
      const watchedTime = new Date(item.watched_at).getTime();
      const age = now - watchedTime;

      if (age <= day24h) last24h++;
      if (age <= week) lastWeek++;
      if (age <= month) lastMonth++;

      if (item.type === 'episode' && item.show && item.episode) {
        totalEpisodes++;
        const showId = item.show.ids.trakt;
        if (shows.has(showId)) {
          shows.get(showId)!.count++;
        } else {
          shows.set(showId, { show: item.show, count: 1 });
        }
      } else if (item.type === 'movie' && item.movie) {
        movies.add(item.movie.ids.trakt);
      }
    }

    // Find most watched show
    let mostWatchedShow: { show: TraktShow; episodes_watched: number } | undefined = undefined;

    for (const [_, data] of shows) {
      if (!mostWatchedShow || data.count > mostWatchedShow.episodes_watched) {
        mostWatchedShow = {
          show: data.show,
          episodes_watched: data.count,
        };
      }
    }

    const summary: TraktHistorySummary = {
      total_watched: history.length,
      unique_shows: shows.size,
      unique_movies: movies.size,
      total_episodes: totalEpisodes,
      most_watched_show: mostWatchedShow,
      recent_activity: {
        last_24h: last24h,
        last_week: lastWeek,
        last_month: lastMonth,
      },
    };

    return createToolSuccess(summary);
  } catch (error) {
    const message = sanitizeError(error, 'summarizeHistory');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Get upcoming episodes for tracked shows
 */
export async function getUpcoming(
  client: TraktClient,
  args: {
    days?: number;
  }
): Promise<ToolSuccess<TraktCalendarItem[]> | ToolError> {
  try {
    const days = args.days || 7;
    const toolName = 'get_upcoming';

    if (days < 1 || days > 30) {
      return createToolError('VALIDATION_ERROR', 'Days must be between 1 and 30');
    }

    // Get calendar starting from today
    const today = new Date().toISOString().split('T')[0];
    const calendar = await client.getCalendar(today, days, { toolName });

    const results = Array.isArray(calendar) ? calendar : [];

    // Add helpful message for empty results
    if (results.length === 0) {
      return createToolSuccess(
        results,
        'No upcoming episodes found. Try following some shows first using follow_show.'
      );
    }

    return createToolSuccess(results);
  } catch (error) {
    const message = sanitizeError(error, 'getUpcoming');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Follow/track a show by adding it to watchlist
 */
export async function followShow(
  client: TraktClient,
  args: {
    showName: string;
    year?: number;
    traktId?: number;
  }
): Promise<ToolSuccess<{ show: TraktShow; added: boolean }> | ToolError | DisambiguationResponse> {
  try {
    const { showName, year, traktId } = args;
    const toolName = 'follow_show';

    validateNonEmptyString(showName, 'showName');

    // Search for the show
    const searchResults = await client.search(showName, 'show', year, { toolName });
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return createToolError('NOT_FOUND', `No show found matching "${showName}"`, undefined, [
        'Check the spelling of the show name',
        'Try using search_show to browse available titles',
        'Use the exact title as it appears on Trakt.tv',
        'Try including the year if there are multiple versions',
      ]);
    }

    // Handle disambiguation
    const disambiguationResult = handleSearchDisambiguation(
      searchResults,
      showName,
      'show',
      year,
      traktId
    );

    if (disambiguationResult.needsDisambiguation) {
      return disambiguationResult.response;
    }

    const show = disambiguationResult.selected.show;
    if (!show) {
      return createToolError('NOT_FOUND', `Show data not found in search results`);
    }

    // Add to watchlist
    const watchlistData = {
      shows: [{ ids: { trakt: show.ids.trakt } }],
    };

    await client.addToWatchlist(watchlistData, { toolName });

    return createToolSuccess({
      show,
      added: true,
    });
  } catch (error) {
    const message = sanitizeError(error, 'followShow');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Unfollow a show by removing it from watchlist
 */
export async function unfollowShow(
  client: TraktClient,
  args: {
    showName: string;
    year?: number;
    traktId?: number;
  }
): Promise<
  ToolSuccess<{ show: TraktShow; removed: boolean }> | ToolError | DisambiguationResponse
> {
  try {
    const { showName, year, traktId } = args;
    const toolName = 'unfollow_show';

    validateNonEmptyString(showName, 'showName');

    // Search for the show
    const searchResults = await client.search(showName, 'show', year, { toolName });
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return createToolError('NOT_FOUND', `No show found matching "${showName}"`, undefined, [
        'Check the spelling of the show name',
        'Try using search_show to browse available titles',
        'Use the exact title as it appears on Trakt.tv',
        'Try including the year if there are multiple versions',
      ]);
    }

    // Handle disambiguation
    const disambiguationResult = handleSearchDisambiguation(
      searchResults,
      showName,
      'show',
      year,
      traktId
    );

    if (disambiguationResult.needsDisambiguation) {
      return disambiguationResult.response;
    }

    const show = disambiguationResult.selected.show;
    if (!show) {
      return createToolError('NOT_FOUND', `Show data not found in search results`);
    }

    // Remove from watchlist
    const watchlistData = {
      shows: [{ ids: { trakt: show.ids.trakt } }],
    };

    await client.removeFromWatchlist(watchlistData, { toolName });

    return createToolSuccess({
      show,
      removed: true,
    });
  } catch (error) {
    const message = sanitizeError(error, 'unfollowShow');
    return createToolError('TRAKT_API_ERROR', message);
  }
}

/**
 * Debug tool: Get recent API request logs and performance metrics
 *
 * This tool provides detailed information about recent API requests for debugging:
 * - Request/response details (URL, method, status, body)
 * - Timing information (duration in milliseconds)
 * - Rate limit information
 * - Error details if request failed
 * - Performance metrics per tool
 *
 * Useful for:
 * - Debugging failed operations
 * - Understanding API behavior
 * - Performance analysis
 * - Tracking rate limit usage
 */
export async function debugLastRequest(
  client: TraktClient,
  args: {
    limit?: number;
    toolName?: string;
    method?: string;
    statusCode?: number;
    includeMetrics?: boolean;
    errorsOnly?: boolean;
  }
): Promise<
  | ToolSuccess<{ logs: RequestLog[]; metrics?: ToolMetrics[]; cacheMetrics?: CacheMetrics }>
  | ToolError
> {
  try {
    const {
      limit = 10,
      toolName,
      method,
      statusCode,
      includeMetrics = true,
      errorsOnly = false,
    } = args;

    // Validate limit
    if (limit < 1 || limit > 100) {
      return createToolError('VALIDATION_ERROR', 'Limit must be between 1 and 100', undefined, [
        'Use a value between 1 and 100',
        'Default is 10',
      ]);
    }

    // Get logs with filters
    let logs = logger.getRecentLogs(limit, {
      toolName,
      method,
      statusCode,
    });

    // Apply error filter if requested
    if (errorsOnly) {
      logs = logs.filter((log) => log.statusCode && log.statusCode >= 400);
    }

    // Get metrics if requested
    let metrics: ToolMetrics[] | undefined;
    let cacheMetrics: CacheMetrics | undefined;
    if (includeMetrics) {
      metrics = logger.getMetrics(toolName);
      cacheMetrics = client.getCacheMetrics();
    }

    // Format response with helpful message
    let message: string;
    if (logs.length === 0) {
      message = 'No request logs found matching the specified filters.';
    } else {
      const parts = [`Found ${logs.length} request${logs.length === 1 ? '' : 's'}`];
      if (toolName) parts.push(`for tool "${toolName}"`);
      if (method) parts.push(`with method ${method}`);
      if (statusCode) parts.push(`with status ${statusCode}`);
      if (errorsOnly) parts.push(`(errors only)`);
      message = parts.join(' ') + '.';

      if (metrics && metrics.length > 0) {
        message += ` Performance metrics included for ${metrics.length} tool${metrics.length === 1 ? '' : 's'}.`;
      }
    }

    // Add cache metrics to message regardless of log count
    if (cacheMetrics) {
      message += ` Cache: ${cacheMetrics.size} items, ${cacheMetrics.hitRate.toFixed(2)} hit rate.`;
    }

    return createToolSuccess(
      {
        logs,
        ...(metrics && metrics.length > 0 ? { metrics } : {}),
        ...(cacheMetrics ? { cacheMetrics } : {}),
      },
      message
    );
  } catch (error) {
    const message = sanitizeError(error, 'debugLastRequest');
    return createToolError('DEBUG_ERROR', message);
  }
}

/**
 * Sync offline watch queue to Trakt
 *
 * Processes pending entries from the local queue, searches for matches,
 * and logs them to Trakt. Supports dry-run for preview.
 *
 * Note: Interactive confirmation is handled by Claude, not in this tool.
 * The tool returns parsed entries that Claude presents to the user.
 */
export async function syncLogwatchQueue(
  client: TraktClient,
  args: {
    queuePath?: string;
    dryRun?: boolean;
    autoConfirm?: boolean;
    showSummary?: boolean;
  }
): Promise<ToolSuccess | ToolError> {
  try {
    const { queuePath, dryRun = false, autoConfirm = false, showSummary = false } = args;
    const toolName = 'sync_logwatch_queue';

    const queue = queuePath ? new WatchLogQueue(queuePath) : new WatchLogQueue();
    const pending = await queue.getPending();

    if (pending.length === 0) {
      return createToolSuccess({
        synced: 0,
        failed: 0,
        skipped: 0,
        message: 'No pending entries to sync',
      });
    }

    // Parse all entries
    const parsedEntries = pending.map((entry) => ({
      id: entry.id,
      rawText: entry.rawText,
      capturedAt: entry.capturedAt,
      parsed: parseWatchNote(entry.rawText, entry.capturedAt),
    }));

    // Show summary if requested or in dry-run mode
    if (showSummary || dryRun) {
      const summaryBuilder = new BulkSummaryBuilder(client);
      const summary = await summaryBuilder.buildSummary(parsedEntries);
      const table = summaryBuilder.formatTable(summary);

      return createToolSuccess({
        action_required: 'review',
        summary,
        formattedTable: table,
        totalEntries: pending.length,
        canProceed: summary.errors === 0,
        message: `Summary: ${summary.resolved} resolved, ${summary.ambiguous} ambiguous, ${summary.notFound} not found, ${summary.errors} errors`,
      });
    }

    // For non-auto mode, return first entry for confirmation
    // Claude will guide user through each entry interactively
    if (!autoConfirm) {
      const firstEntry = parsedEntries[0];
      return createToolSuccess({
        action_required: 'confirm_entry',
        currentEntry: firstEntry,
        remaining: parsedEntries.length - 1,
        totalEntries: parsedEntries.length,
        message: `Ready to process ${parsedEntries.length} entries. First entry requires confirmation. Use the parsed data to search and log, then mark as synced/failed/skipped.`,
      });
    }

    // Auto-confirm mode: process all entries
    let synced = 0;
    let failed = 0;
    let skipped = 0;
    const results = [];

    for (const entry of parsedEntries) {
      try {
        const parsed = entry.parsed;

        // Skip entries with low confidence or no title
        if (parsed.confidence === 'low' || !parsed.title) {
          await queue.markSkipped(entry.id);
          skipped++;
          results.push({
            id: entry.id,
            status: 'skipped',
            reason: 'Low confidence or missing title',
          });
          continue;
        }

        // Search for content
        const searchType =
          parsed.type === 'episode' ? 'show' : parsed.type === 'movie' ? 'movie' : undefined;
        if (!searchType) {
          await queue.markFailed(entry.id, 'Unknown content type');
          failed++;
          results.push({ id: entry.id, status: 'failed', reason: 'Unknown content type' });
          continue;
        }

        const searchResults = await client.search(parsed.title, searchType, parsed.year, {
          toolName,
        });

        if (!Array.isArray(searchResults) || searchResults.length === 0) {
          await queue.markFailed(entry.id, 'No search results');
          failed++;
          results.push({ id: entry.id, status: 'failed', reason: 'No search results' });
          continue;
        }

        // Auto-select first result (simplified - full version would need disambiguation)
        const firstResult = searchResults[0];
        const content = searchType === 'show' ? firstResult.show : firstResult.movie;

        if (!content) {
          await queue.markFailed(entry.id, 'Missing content data');
          failed++;
          results.push({ id: entry.id, status: 'failed', reason: 'Missing content data' });
          continue;
        }

        // Log to Trakt
        let resolvedType: 'episode' | 'movie' | null = null;

        if (parsed.type === 'episode' && parsed.season && parsed.episode) {
          const historyData = {
            shows: [
              {
                watched_at: parsed.watchedAt || new Date().toISOString(),
                ids: { trakt: content.ids.trakt },
                seasons: [
                  {
                    number: parsed.season,
                    episodes: [{ number: parsed.episode }],
                  },
                ],
              },
            ],
          };
          await client.addToHistory(historyData, { toolName });
          resolvedType = 'episode';
        } else if (parsed.type === 'movie') {
          const historyData = {
            movies: [
              {
                watched_at: parsed.watchedAt || new Date().toISOString(),
                ids: { trakt: content.ids.trakt },
              },
            ],
          };
          await client.addToHistory(historyData, { toolName });
          resolvedType = 'movie';
        }

        // Mark as synced (only if we actually logged something)
        if (resolvedType) {
          await queue.markSynced(entry.id, {
            type: resolvedType,
            traktId: content.ids.trakt,
            title: content.title,
            year: content.year,
            season: parsed.season,
            episode: parsed.episode,
          });

          synced++;
          results.push({ id: entry.id, status: 'synced', title: content.title });
        } else {
          await queue.markFailed(entry.id, 'Could not determine content type');
          failed++;
          results.push({ id: entry.id, status: 'failed', reason: 'Unknown content type' });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await queue.markFailed(entry.id, errorMsg);
        failed++;
        results.push({ id: entry.id, status: 'failed', reason: errorMsg });
      }
    }

    // Archive queue
    const archivePath = await queue.archive();

    return createToolSuccess(
      {
        synced,
        failed,
        skipped,
        totalProcessed: parsedEntries.length,
        archivePath,
        results,
      },
      `Synced ${synced}/${parsedEntries.length} entries. Failed: ${failed}, Skipped: ${skipped}. Archived to ${archivePath}`
    );
  } catch (error) {
    const message = sanitizeError(error, 'syncLogwatchQueue');
    return createToolError('SYNC_ERROR', message);
  }
}

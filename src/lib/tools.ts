import { TraktClient } from './trakt-client.js';
import {
  parseNaturalDate,
  parseDateRange,
  parseEpisodeRange,
  validateEpisodeNumber,
  validateSeasonNumber,
  createToolError,
  createToolSuccess,
  validateNonEmptyString,
  handleSearchDisambiguation,
  ToolError,
  ToolSuccess,
} from './utils.js';
import {
  TraktEpisode,
  TraktShow,
  TraktWatchedItem,
  TraktHistoryAddResponse,
  TraktCalendarItem,
  TraktHistorySummary,
  DisambiguationResponse,
} from '../types/trakt.js';

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
    const searchResults = await client.search(showName, 'show');

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return createToolError(
        'NOT_FOUND',
        `No show found matching "${showName}". Try using search_show to find the correct show name.`
      );
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
    const episodeData = await client.searchEpisode(show.ids.slug, season, episode);

    return createToolSuccess<TraktEpisode>(episodeData as TraktEpisode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to search episode: ${message}`);
  }
}

/**
 * Log a single episode or movie as watched
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
  }
): Promise<ToolSuccess<TraktHistoryAddResponse> | ToolError | DisambiguationResponse> {
  try {
    const { type, showName, movieName, season, episode, watchedAt, year, traktId } = args;

    // Parse watched date if provided
    const watched_at = watchedAt ? parseNaturalDate(watchedAt) : new Date().toISOString();

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
      const searchResults = await client.search(showName, 'show');
      if (!Array.isArray(searchResults) || searchResults.length === 0) {
        return createToolError(
          'NOT_FOUND',
          `No show found matching "${showName}". Try using search_show first.`
        );
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

      // Get episode details to verify it exists
      try {
        await client.searchEpisode(show.ids.slug, season, episode);
      } catch {
        return createToolError(
          'NOT_FOUND',
          `Episode S${season}E${episode} not found for "${showName}"`
        );
      }

      // Add to history
      const historyData = {
        episodes: [
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

      const response = await client.addToHistory(historyData);
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    } else {
      // Movie
      if (!movieName) {
        return createToolError('VALIDATION_ERROR', 'For movies, movieName is required');
      }

      validateNonEmptyString(movieName, 'movieName');

      // Search for the movie
      const searchResults = await client.search(movieName, 'movie');
      if (!Array.isArray(searchResults) || searchResults.length === 0) {
        return createToolError(
          'NOT_FOUND',
          `No movie found matching "${movieName}". Try using search_show first.`
        );
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

      // Add to history
      const historyData = {
        movies: [
          {
            watched_at,
            ids: { trakt: movie.ids.trakt },
          },
        ],
      };

      const response = await client.addToHistory(historyData);
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to log watch: ${message}`);
  }
}

/**
 * Bulk log multiple episodes or movies at once
 * Supports episode ranges like "1-5" or "1,3,5"
 */
export async function bulkLog(
  client: TraktClient,
  args: {
    type: 'episodes' | 'movies';
    showName?: string;
    movieNames?: string[];
    season?: number;
    episodes?: string; // Can be "1-5" or "1,3,5" or "1-3,5,7-9"
    watchedAt?: string;
    year?: number;
    traktId?: number;
  }
): Promise<ToolSuccess<TraktHistoryAddResponse> | ToolError | DisambiguationResponse> {
  try {
    const { type, showName, movieNames, season, episodes, watchedAt, year, traktId } = args;

    const watched_at = watchedAt ? parseNaturalDate(watchedAt) : new Date().toISOString();

    if (type === 'episodes') {
      if (!showName || season === undefined || !episodes) {
        return createToolError(
          'VALIDATION_ERROR',
          'For episodes, showName, season, and episodes are required'
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
      const searchResults = await client.search(showName, 'show');
      if (!Array.isArray(searchResults) || searchResults.length === 0) {
        return createToolError(
          'NOT_FOUND',
          `No show found matching "${showName}". Try using search_show first.`
        );
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

      // Build history data
      const historyData = {
        episodes: [
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

      const response = await client.addToHistory(historyData);
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    } else {
      // Movies
      if (!movieNames || movieNames.length === 0) {
        return createToolError('VALIDATION_ERROR', 'For movies, movieNames is required');
      }

      const movieData: Array<{ watched_at: string; ids: { trakt: number } }> = [];

      // Search for each movie
      for (const movieName of movieNames) {
        validateNonEmptyString(movieName, 'movieName');

        const searchResults = await client.search(movieName, 'movie');
        if (!Array.isArray(searchResults) || searchResults.length === 0) {
          return createToolError('NOT_FOUND', `No movie found matching "${movieName}"`);
        }

        // Handle disambiguation - for bulk operations, we auto-select first result
        // to avoid complex multi-movie disambiguation flows
        const disambiguationResult = handleSearchDisambiguation(
          searchResults,
          movieName,
          'movie',
          year,
          traktId
        );

        if (disambiguationResult.needsDisambiguation) {
          // For bulk operations, return disambiguation for the problematic movie
          return {
            ...disambiguationResult.response,
            message: `${disambiguationResult.response.message} (This occurred while processing "${movieName}" in the bulk operation. Please use log_watch for individual movies if you need to disambiguate multiple titles.)`,
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

      const historyData = { movies: movieData };
      const response = await client.addToHistory(historyData);
      return createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to bulk log: ${message}`);
  }
}

/**
 * Get watch history with optional filters
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

    // Parse date range
    const { startAt, endAt } = parseDateRange(startDate, endDate);

    // Fetch history
    const history = await client.getHistory(type, startAt, endAt);

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
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to get history: ${message}`);
  }
}

/**
 * Summarize watch history with analytics
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

    // Parse date range
    const { startAt, endAt } = parseDateRange(startDate, endDate);

    // Fetch full history
    const history = await client.getHistory(undefined, startAt, endAt);

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
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to summarize history: ${message}`);
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

    if (days < 1 || days > 30) {
      return createToolError('VALIDATION_ERROR', 'Days must be between 1 and 30');
    }

    // Get calendar starting from today
    const today = new Date().toISOString().split('T')[0];
    const calendar = await client.getCalendar(today, days);

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
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to get upcoming: ${message}`);
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

    validateNonEmptyString(showName, 'showName');

    // Search for the show
    const searchResults = await client.search(showName, 'show');
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return createToolError(
        'NOT_FOUND',
        `No show found matching "${showName}". Try using search_show first.`
      );
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

    await client.addToWatchlist(watchlistData);

    return createToolSuccess({
      show,
      added: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to follow show: ${message}`);
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
): Promise<ToolSuccess<{ show: TraktShow; removed: boolean }> | ToolError | DisambiguationResponse> {
  try {
    const { showName, year, traktId } = args;

    validateNonEmptyString(showName, 'showName');

    // Search for the show
    const searchResults = await client.search(showName, 'show');
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return createToolError(
        'NOT_FOUND',
        `No show found matching "${showName}". Try using search_show first.`
      );
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

    await client.removeFromWatchlist(watchlistData);

    return createToolSuccess({
      show,
      removed: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolError('TRAKT_API_ERROR', `Failed to unfollow show: ${message}`);
  }
}

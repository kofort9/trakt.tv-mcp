import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../core/config.js';
import { TraktOAuth } from '../domain/trakt/oauth.js';
import { TraktClient } from '../domain/trakt/trakt-client.js';
import * as tools from '../domain/trakt/tools.js';
import { PROFILE_RESOURCE, getProfile } from '../domain/trakt/resources/profile.js';
import { WATCHLIST_RESOURCES, getWatchlist } from '../domain/trakt/resources/watchlist.js';
import { HISTORY_RESOURCES, getHistory } from '../domain/trakt/resources/history.js';
import { startTrace, traceToolCall, endTrace, shutdown } from '../core/langfuse.js';
import { sanitizeInputArgs } from '../core/sanitization.js';
import { logError, logInfo } from '../core/logging.js';

// Server configuration
const SERVER_NAME = 'trakt-mcp-server';
const SERVER_VERSION = '1.0.0';

// Load configuration and initialize clients
const config = loadConfig();
const oauth = new TraktOAuth(config);
const traktClient = new TraktClient(config, oauth);

// Create MCP server instance
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * Helper function to handle MCP resource read requests with optimized single-pass lookup.
 *
 * This function is exported primarily for testing purposes, allowing integration tests
 * to verify the single-pass optimization without requiring full server initialization.
 *
 * Performance: Uses a single find() call instead of some() + find() to reduce array
 * iterations. For small resource arrays (5-10 items), this provides negligible but
 * measurable improvement. Consider Map-based lookup if resources grow beyond 15 items.
 *
 * @param resources - Array of resource definitions with uri and mimeType
 * @param uri - The resource URI to look up (e.g., 'trakt://watchlist/shows')
 * @param handler - Async function that fetches the resource data from Trakt API
 * @param client - TraktClient instance for making API requests
 * @returns MCP resource contents if URI matches, null otherwise
 *
 * @example
 * ```typescript
 * const result = await handleResourceRead(
 *   WATCHLIST_RESOURCES,
 *   'trakt://watchlist/shows',
 *   getWatchlist,
 *   traktClient
 * );
 * ```
 */
export async function handleResourceRead(
  resources: Array<{ uri: string; mimeType: string }>,
  uri: string,
  handler: (client: TraktClient, uri: string) => Promise<string>,
  client: TraktClient
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | null> {
  const resource = resources.find((r) => r.uri === uri);
  if (!resource) {
    return null;
  }

  const text = await handler(client, uri);
  return {
    contents: [
      {
        uri,
        mimeType: resource.mimeType,
        text,
      },
    ],
  };
}

// Handle list_resources request
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [PROFILE_RESOURCE, ...WATCHLIST_RESOURCES, ...HISTORY_RESOURCES],
  };
});

// Handle read_resource request
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    if (uri === PROFILE_RESOURCE.uri) {
      const text = await getProfile(traktClient);
      return {
        contents: [
          {
            uri,
            mimeType: PROFILE_RESOURCE.mimeType,
            text,
          },
        ],
      };
    }

    const watchlistResult = await handleResourceRead(
      WATCHLIST_RESOURCES,
      uri,
      getWatchlist,
      traktClient
    );
    if (watchlistResult) {
      return watchlistResult;
    }

    const historyResult = await handleResourceRead(HISTORY_RESOURCES, uri, getHistory, traktClient);
    if (historyResult) {
      return historyResult;
    }

    throw new Error(`Resource not found: ${uri}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Error reading resource ${uri}:`, error);
    throw new Error(`Failed to read resource: ${errorMessage}`);
  }
});

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'authenticate',
        description:
          'Authenticate with Trakt.tv using OAuth device flow. Returns a verification URL and code for the user to authorize.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search_show',
        description:
          'Search for TV shows, movies, or anime by title. Returns matching content with IDs and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (title or keywords)',
            },
            type: {
              type: 'string',
              enum: ['show', 'movie'],
              description: 'Content type filter (optional)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_episode',
        description:
          'Find a specific episode by show name, season number, and episode number. Returns episode metadata including title and IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            showName: {
              type: 'string',
              description: 'Name of the TV show',
            },
            season: {
              type: 'number',
              description: 'Season number (0 for specials)',
            },
            episode: {
              type: 'number',
              description: 'Episode number within the season',
            },
            year: {
              type: 'number',
              description: 'Optional: Release year to disambiguate shows with the same name',
            },
            traktId: {
              type: 'number',
              description:
                'Optional: Trakt ID for exact show identification (obtained from search_show)',
            },
          },
          required: ['showName', 'season', 'episode'],
        },
      },
      {
        name: 'log_watch',
        description:
          'Log a single episode or movie as watched. Accepts ISO 8601 dates (YYYY-MM-DD or full timestamp). If no date provided, uses current time.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['episode', 'movie'],
              description: 'Content type',
            },
            showName: {
              type: 'string',
              description: 'Show name (required for episodes)',
            },
            movieName: {
              type: 'string',
              description: 'Movie name (required for movies)',
            },
            season: {
              type: 'number',
              description: 'Season number (required for episodes)',
            },
            episode: {
              type: 'number',
              description: 'Episode number (required for episodes)',
            },
            watchedAt: {
              type: 'string',
              description:
                'When it was watched. ISO 8601 format: "2025-12-08" (date only) or "2025-12-08T20:30:00.000Z" (full timestamp)',
            },
            year: {
              type: 'number',
              description: 'Optional: Release year to disambiguate shows/movies with the same name',
            },
            traktId: {
              type: 'number',
              description:
                'Optional: Trakt ID for exact identification (obtained from search_show)',
            },
            preview: {
              type: 'boolean',
              description:
                'Optional: Preview mode - performs all search/disambiguation and returns formatted preview without logging to Trakt',
            },
            allowDuplicates: {
              type: 'boolean',
              description:
                'Optional: Allow logging duplicate entries (for rewatches). Default: false - prevents duplicate logs within 48 hours',
            },
            rating: {
              type: 'number',
              description:
                'Optional: Rating 1-10 for the content. If provided, adds rating after logging watch (2 API calls).',
            },
          },
          required: ['type'],
        },
      },
      {
        name: 'bulk_log',
        description:
          'Log multiple episodes or movies at once. For episodes, supports ranges like "1-5" or "1,3,5,7-9". For movies, provide array of names.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['episodes', 'movies'],
              description: 'Content type',
            },
            showName: {
              type: 'string',
              description: 'Show name (required for episodes)',
            },
            season: {
              type: 'number',
              description: 'Season number (required for episodes)',
            },
            episodes: {
              type: 'string',
              description:
                'Episode range like "1-5" or "1,3,5" or "1-3,5,7-9" (required for episodes)',
            },
            movieNames: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of movie names (required for movies)',
            },
            watchedAt: {
              type: 'string',
              description:
                'When watched (applies to all items). ISO 8601 format: "2025-12-08" or full timestamp',
            },
            year: {
              type: 'number',
              description: 'Optional: Release year to disambiguate shows/movies with the same name',
            },
            traktId: {
              type: 'number',
              description:
                'Optional: Trakt ID for exact identification (obtained from search_show)',
            },
            preview: {
              type: 'boolean',
              description:
                'Optional: Preview mode - performs all search/disambiguation and returns formatted preview without logging to Trakt',
            },
          },
          required: ['type'],
        },
      },
      {
        name: 'get_history',
        description:
          'Retrieve watch history with optional filters. Supports date range filtering and content type filtering.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['shows', 'movies'],
              description: 'Filter by content type (optional)',
            },
            startDate: {
              type: 'string',
              description: 'Start date for history range. ISO 8601 format: "2025-12-08"',
            },
            endDate: {
              type: 'string',
              description: 'End date for history range. ISO 8601 format: "2025-12-08"',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of items to return',
            },
          },
        },
      },
      {
        name: 'undo_last_log',
        description:
          'Remove recent watch history entries. Supports preview mode and confirmation. Use to undo accidental logs.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of entries to remove (default: 1, max: 10)',
            },
            confirm: {
              type: 'boolean',
              description:
                'Must be true to actually remove. If false/undefined, returns preview only',
            },
          },
        },
      },
      {
        name: 'summarize_history',
        description:
          'Analyze and summarize watch history with statistics: total watched, unique shows/movies, most watched show, recent activity.',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date for analysis. ISO 8601 format: "2025-12-08"',
            },
            endDate: {
              type: 'string',
              description: 'End date for analysis. ISO 8601 format: "2025-12-08"',
            },
          },
        },
      },
      {
        name: 'get_upcoming',
        description:
          'Get upcoming episodes for shows in your watchlist/tracked shows. Shows what episodes are airing soon.',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to look ahead (1-30, default: 7)',
            },
          },
        },
      },
      {
        name: 'follow_show',
        description:
          'Add a show to your watchlist/tracking list to keep track of new episodes and get it in your calendar.',
        inputSchema: {
          type: 'object',
          properties: {
            showName: {
              type: 'string',
              description: 'Name of the show to follow',
            },
            year: {
              type: 'number',
              description: 'Optional: Release year to disambiguate shows with the same name',
            },
            traktId: {
              type: 'number',
              description:
                'Optional: Trakt ID for exact identification (obtained from search_show)',
            },
          },
          required: ['showName'],
        },
      },
      {
        name: 'unfollow_show',
        description:
          'Remove a show from your watchlist/tracking list. Stops tracking new episodes.',
        inputSchema: {
          type: 'object',
          properties: {
            showName: {
              type: 'string',
              description: 'Name of the show to unfollow',
            },
            year: {
              type: 'number',
              description: 'Optional: Release year to disambiguate shows with the same name',
            },
            traktId: {
              type: 'number',
              description:
                'Optional: Trakt ID for exact identification (obtained from search_show)',
            },
          },
          required: ['showName'],
        },
      },
      {
        name: 'rate_media',
        description:
          'Add a rating (1-10) to a movie, show, or episode. Use for rating already-watched content or when log_watch rating failed.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['episode', 'movie', 'show'],
              description: 'Content type to rate',
            },
            showName: {
              type: 'string',
              description: 'Show name (required for episodes and shows)',
            },
            movieName: {
              type: 'string',
              description: 'Movie name (required for movies)',
            },
            season: {
              type: 'number',
              description: 'Season number (required for episodes)',
            },
            episode: {
              type: 'number',
              description: 'Episode number (required for episodes)',
            },
            rating: {
              type: 'number',
              description: 'Rating from 1-10 (required)',
            },
            ratedAt: {
              type: 'string',
              description: 'When the rating was made. ISO 8601 format. Defaults to current time.',
            },
            year: {
              type: 'number',
              description: 'Optional: Release year to disambiguate content with the same name',
            },
            traktId: {
              type: 'number',
              description:
                'Optional: Trakt ID for exact identification (obtained from search_show)',
            },
          },
          required: ['type', 'rating'],
        },
      },
      {
        name: 'sync_logwatch_queue',
        description:
          'Sync offline watch queue to Trakt. Processes pending entries, searches for matches, and logs them. Supports dry-run, auto-confirm, and interactive modes.',
        inputSchema: {
          type: 'object',
          properties: {
            queuePath: {
              type: 'string',
              description: 'Custom path to queue file. Default: ~/.trakt-mcp/pending-logs.jsonl',
            },
            dryRun: {
              type: 'boolean',
              description:
                'Preview mode: returns summary table without syncing. Shows resolved/ambiguous/not-found counts.',
            },
            autoConfirm: {
              type: 'boolean',
              description:
                'Auto-process unambiguous entries without user confirmation. Skips ambiguous entries (multiple matches) and duplicates. Use for batch processing.',
            },
            showSummary: {
              type: 'boolean',
              description:
                'Returns pre-sync summary table showing status of all entries. Use before processing to review queue.',
            },
            minimalOutput: {
              type: 'boolean',
              description: 'Return compact response with counts only, no full entries or tables',
            },
            entryId: {
              type: 'string',
              description:
                'ID of specific entry to process. Use with action parameter for interactive workflow.',
            },
            action: {
              type: 'string',
              enum: ['confirm', 'skip', 'fail'],
              description:
                'Action for entry specified by entryId: "confirm" logs to Trakt (requires selectedTraktId and selectedType), "skip" marks as skipped, "fail" marks as failed.',
            },
            entryIndex: {
              type: 'number',
              description:
                'Zero-based index for interactive mode starting point. Use to resume processing or skip to specific entry. Default: 0.',
            },
            selectedTraktId: {
              type: 'number',
              description:
                'Trakt ID to log when action="confirm". Get from searchResults in previous response. Required for confirm action.',
            },
            selectedType: {
              type: 'string',
              enum: ['movie', 'episode'],
              description:
                'Content type when action="confirm": "movie" or "episode". Required for confirm action.',
            },
            allowDuplicates: {
              type: 'boolean',
              description:
                'Allow logging entries already in recent history (for rewatches). Default: false - skips duplicates within 48 hours.',
            },
          },
        },
      },
      {
        name: 'debug_last_request',
        description:
          'Debug tool: Get recent API request logs and performance metrics. Shows request/response details, timing, rate limits, and errors. Useful for debugging failed operations and performance analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of recent requests to retrieve (1-100, default: 10)',
            },
            toolName: {
              type: 'string',
              description: 'Optional: Filter by tool name (e.g., "log_watch", "search_show")',
            },
            method: {
              type: 'string',
              description: 'Optional: Filter by HTTP method (GET, POST, etc.)',
            },
            statusCode: {
              type: 'number',
              description: 'Optional: Filter by HTTP status code (200, 404, 500, etc.)',
            },
            includeMetrics: {
              type: 'boolean',
              description: 'Include performance metrics (default: true)',
            },
            errorsOnly: {
              type: 'boolean',
              description:
                'Filter to show only error responses (status code >= 400). Default: false',
            },
          },
        },
      },
      {
        name: 'queue_status',
        description: 'Get quick count of pending/synced/failed queue entries',
        inputSchema: {
          type: 'object',
          properties: {
            queuePath: {
              type: 'string',
              description: 'Custom path to queue file. Default: ~/.trakt-mcp/pending-logs.jsonl',
            },
          },
        },
      },
      {
        name: 'queue_preview',
        description: 'Preview queue with dry-run summary table. Shows what would be synced',
        inputSchema: {
          type: 'object',
          properties: {
            queuePath: {
              type: 'string',
              description: 'Custom path to queue file. Default: ~/.trakt-mcp/pending-logs.jsonl',
            },
            limit: {
              type: 'number',
              description: 'Max entries to preview. Default: all pending entries',
            },
          },
        },
      },
      {
        name: 'queue_auto_sync',
        description: 'Batch sync unambiguous entries, skip ambiguous/duplicates',
        inputSchema: {
          type: 'object',
          properties: {
            queuePath: {
              type: 'string',
              description: 'Custom path to queue file. Default: ~/.trakt-mcp/pending-logs.jsonl',
            },
            allowDuplicates: {
              type: 'boolean',
              description: 'Allow logging duplicates (for rewatches). Default: false',
            },
          },
        },
      },
      {
        name: 'queue_confirm',
        description: 'Confirm, skip, or fail a single queue entry',
        inputSchema: {
          type: 'object',
          properties: {
            entryId: {
              type: 'string',
              description: 'ID of entry to process',
            },
            action: {
              type: 'string',
              enum: ['confirm', 'skip', 'fail'],
              description: 'Action: confirm (log to Trakt), skip, or fail',
            },
            queuePath: {
              type: 'string',
              description: 'Custom path to queue file. Default: ~/.trakt-mcp/pending-logs.jsonl',
            },
            selectedTraktId: {
              type: 'number',
              description: 'Trakt ID when action=confirm. Required for confirm',
            },
            selectedType: {
              type: 'string',
              enum: ['movie', 'episode'],
              description: 'Content type when action=confirm. Required for confirm',
            },
            allowDuplicates: {
              type: 'boolean',
              description: 'Allow duplicates (for rewatches). Default: false',
            },
          },
          required: ['entryId', 'action'],
        },
      },
    ],
  };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Start a trace for this tool call (sanitize args to avoid logging full titles/queries/IDs)
  startTrace(`mcp.${name}`, {
    tool: name,
    args: sanitizeInputArgs(args as Record<string, unknown>),
  });

  try {
    if (name === 'authenticate') {
      // Check if already authenticated
      if (oauth.isAuthenticated()) {
        return {
          content: [
            {
              type: 'text',
              text: 'Already authenticated with Trakt.tv!',
            },
          ],
        };
      }

      // Initiate device flow
      const deviceCode = await oauth.initiateDeviceFlow();

      // Start polling in the background
      oauth.pollForToken(deviceCode.device_code, deviceCode.interval).catch((error) => {
        logError('Authentication failed:', error);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Please visit ${deviceCode.verification_url} and enter code: ${deviceCode.user_code}\n\nWaiting for authorization...`,
          },
        ],
      };
    }

    if (name === 'search_show') {
      return await traceToolCall('search_show', args || {}, async () => {
        const query = args?.query as string;
        const type = args?.type as 'show' | 'movie' | undefined;

        if (!query) {
          throw new Error('Query parameter is required');
        }

        const results = await traktClient.search(query, type, undefined, {
          toolName: 'search_show',
        });

        if (Array.isArray(results) && results.length === 0) {
          const response = {
            results: [],
            message: `No results found for "${query}". Try different search terms or check spelling.`,
          };
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      });
    }

    if (name === 'search_episode') {
      const result = await tools.searchEpisode(traktClient, {
        showName: args?.showName as string,
        season: args?.season as number,
        episode: args?.episode as number,
        year: args?.year as number | undefined,
        traktId: args?.traktId as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'log_watch') {
      const result = await tools.logWatch(traktClient, {
        type: args?.type as 'episode' | 'movie',
        showName: args?.showName as string | undefined,
        movieName: args?.movieName as string | undefined,
        season: args?.season as number | undefined,
        episode: args?.episode as number | undefined,
        watchedAt: args?.watchedAt as string | undefined,
        year: args?.year as number | undefined,
        traktId: args?.traktId as number | undefined,
        preview: args?.preview as boolean | undefined,
        allowDuplicates: args?.allowDuplicates as boolean | undefined,
        rating: args?.rating as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'bulk_log') {
      const result = await tools.bulkLog(traktClient, {
        type: args?.type as 'episodes' | 'movies',
        showName: args?.showName as string | undefined,
        movieNames: args?.movieNames as string[] | undefined,
        season: args?.season as number | undefined,
        episodes: args?.episodes as string | undefined,
        watchedAt: args?.watchedAt as string | undefined,
        year: args?.year as number | undefined,
        traktId: args?.traktId as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'get_history') {
      const result = await tools.getHistory(traktClient, {
        type: args?.type as 'shows' | 'movies' | undefined,
        startDate: args?.startDate as string | undefined,
        endDate: args?.endDate as string | undefined,
        limit: args?.limit as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'undo_last_log') {
      const result = await tools.undoLastLog(traktClient, {
        limit: args?.limit as number | undefined,
        confirm: args?.confirm as boolean | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'summarize_history') {
      const result = await tools.summarizeHistory(traktClient, {
        startDate: args?.startDate as string | undefined,
        endDate: args?.endDate as string | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'get_upcoming') {
      const result = await tools.getUpcoming(traktClient, {
        days: args?.days as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'follow_show') {
      const result = await tools.followShow(traktClient, {
        showName: args?.showName as string,
        year: args?.year as number | undefined,
        traktId: args?.traktId as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'unfollow_show') {
      const result = await tools.unfollowShow(traktClient, {
        showName: args?.showName as string,
        year: args?.year as number | undefined,
        traktId: args?.traktId as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'rate_media') {
      const result = await tools.rateMedia(traktClient, {
        type: args?.type as 'episode' | 'movie' | 'show',
        showName: args?.showName as string | undefined,
        movieName: args?.movieName as string | undefined,
        season: args?.season as number | undefined,
        episode: args?.episode as number | undefined,
        rating: args?.rating as number,
        ratedAt: args?.ratedAt as string | undefined,
        year: args?.year as number | undefined,
        traktId: args?.traktId as number | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'sync_logwatch_queue') {
      return await traceToolCall('sync_logwatch_queue', args || {}, async () => {
        const result = await tools.syncLogwatchQueue(traktClient, {
          queuePath: args?.queuePath as string | undefined,
          dryRun: args?.dryRun as boolean | undefined,
          autoConfirm: args?.autoConfirm as boolean | undefined,
          showSummary: args?.showSummary as boolean | undefined,
          minimalOutput: args?.minimalOutput as boolean | undefined,
          entryId: args?.entryId as string | undefined,
          action: args?.action as 'confirm' | 'skip' | 'fail' | undefined,
          entryIndex: args?.entryIndex as number | undefined,
          selectedTraktId: args?.selectedTraktId as number | undefined,
          selectedType: args?.selectedType as 'movie' | 'episode' | undefined,
          allowDuplicates: args?.allowDuplicates as boolean | undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      });
    }

    if (name === 'debug_last_request') {
      const result = await tools.debugLastRequest(traktClient, {
        limit: args?.limit as number | undefined,
        toolName: args?.toolName as string | undefined,
        method: args?.method as string | undefined,
        statusCode: args?.statusCode as number | undefined,
        includeMetrics: args?.includeMetrics as boolean | undefined,
        errorsOnly: args?.errorsOnly as boolean | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }

    if (name === 'queue_status') {
      return await traceToolCall('queue_status', args || {}, async () => {
        const result = await tools.queueStatus({
          queuePath: args?.queuePath as string | undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      });
    }

    if (name === 'queue_preview') {
      return await traceToolCall('queue_preview', args || {}, async () => {
        const result = await tools.queuePreview(traktClient, {
          queuePath: args?.queuePath as string | undefined,
          limit: args?.limit as number | undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      });
    }

    if (name === 'queue_auto_sync') {
      return await traceToolCall('queue_auto_sync', args || {}, async () => {
        const result = await tools.queueAutoSync(traktClient, {
          queuePath: args?.queuePath as string | undefined,
          allowDuplicates: args?.allowDuplicates as boolean | undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      });
    }

    if (name === 'queue_confirm') {
      return await traceToolCall('queue_confirm', args || {}, async () => {
        const result = await tools.queueConfirm(traktClient, {
          entryId: args?.entryId as string,
          action: args?.action as 'confirm' | 'skip' | 'fail',
          queuePath: args?.queuePath as string | undefined,
          selectedTraktId: args?.selectedTraktId as number | undefined,
          selectedType: args?.selectedType as 'movie' | 'episode' | undefined,
          allowDuplicates: args?.allowDuplicates as boolean | undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      });
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  } finally {
    // End trace and flush to Langfuse
    await endTrace({ awaitFlush: false });
  }
});

// Start server
type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logInfo(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

async function gracefulShutdown(signal: ShutdownSignal): Promise<void> {
  logInfo(`Received ${signal}, shutting down...`);
  await shutdown();
  process.exit(0);
}

// Graceful shutdown
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

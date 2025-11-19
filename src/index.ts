#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './lib/config.js';
import { TraktOAuth } from './lib/oauth.js';
import { TraktClient } from './lib/trakt-client.js';
import * as tools from './lib/tools.js';

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
    },
  }
);

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
          },
          required: ['showName', 'season', 'episode'],
        },
      },
      {
        name: 'log_watch',
        description:
          'Log a single episode or movie as watched. Supports natural language dates like "yesterday", "last week". If no date provided, uses current time.',
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
                'When it was watched. Supports: "today", "yesterday", "last week", or ISO date (YYYY-MM-DD)',
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
              description: 'When watched (applies to all items). Supports natural language.',
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
              description: 'Start date for history range (supports natural language)',
            },
            endDate: {
              type: 'string',
              description: 'End date for history range (supports natural language)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of items to return',
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
              description: 'Start date for analysis (supports natural language)',
            },
            endDate: {
              type: 'string',
              description: 'End date for analysis (supports natural language)',
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
          },
          required: ['showName'],
        },
      },
    ],
  };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
        console.error('Authentication failed:', error);
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
      const query = args?.query as string;
      const type = args?.type as 'show' | 'movie' | undefined;

      if (!query) {
        throw new Error('Query parameter is required');
      }

      const results = await traktClient.search(query, type);

      // Add helpful message for empty search results
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
    }

    if (name === 'search_episode') {
      const result = await tools.searchEpisode(traktClient, {
        showName: args?.showName as string,
        season: args?.season as number,
        episode: args?.episode as number,
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
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

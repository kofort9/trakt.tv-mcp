#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './lib/config.js';
import { TraktOAuth } from './lib/oauth.js';
import { TraktClient } from './lib/trakt-client.js';

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

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
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

#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Server configuration
const SERVER_NAME = 'trakt-mcp-server';
const SERVER_VERSION = '1.0.0';

// Validate required environment variables
const requiredEnvVars = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`Error: Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

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

  if (name === 'search_show') {
    // Placeholder implementation
    return {
      content: [
        {
          type: 'text',
          text: `Search tool called with query: ${args?.query}. (Implementation pending)`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
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

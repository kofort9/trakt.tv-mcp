#!/usr/bin/env node

/**
 * Test script for summarize_history MCP tool
 * Tests natural language query: "What did I watch in Jan. 2025"
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Test configuration
const TEST_CASES = [
  {
    name: 'January 2025 - Full Month',
    description: 'Natural language query: "What did I watch in Jan. 2025"',
    args: {
      startDate: '2025-01-01',
      endDate: '2025-01-31'
    }
  },
  {
    name: 'January 2025 - Without end date',
    description: 'Test if startDate alone works correctly',
    args: {
      startDate: '2025-01-01'
    }
  },
  {
    name: 'No date range',
    description: 'Test getting all-time summary',
    args: {}
  },
  {
    name: 'Natural language dates',
    description: 'Test "last week" and "today"',
    args: {
      startDate: 'last week',
      endDate: 'today'
    }
  }
];

async function runTests() {
  console.log('\n=== TESTING summarize_history MCP Tool ===\n');
  console.log('User Query: "What did I watch in Jan. 2025"\n');
  console.log('Expected behavior:');
  console.log('  - Parse date range: 2025-01-01 to 2025-01-31');
  console.log('  - Query Trakt.tv API for history in that range');
  console.log('  - Calculate and return statistics\n');
  console.log('===========================================\n');

  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['/Users/kofifort/Repos/trakt.tv-mcp/dist/index.js']
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  try {
    console.log('Connecting to MCP server...\n');
    await client.connect(transport);
    console.log('Connected successfully!\n');

    // List available tools
    const toolsResult = await client.listTools();
    const summarizeTool = toolsResult.tools.find(t => t.name === 'summarize_history');

    if (!summarizeTool) {
      console.error('ERROR: summarize_history tool not found!');
      process.exit(1);
    }

    console.log('Tool Schema:');
    console.log(JSON.stringify(summarizeTool, null, 2));
    console.log('\n===========================================\n');

    // Run test cases
    for (const testCase of TEST_CASES) {
      console.log(`\nTEST CASE: ${testCase.name}`);
      console.log(`Description: ${testCase.description}`);
      console.log(`Arguments: ${JSON.stringify(testCase.args, null, 2)}`);
      console.log('-------------------------------------------');

      try {
        const startTime = Date.now();
        const result = await client.callTool({
          name: 'summarize_history',
          arguments: testCase.args
        });
        const duration = Date.now() - startTime;

        console.log(`Status: ${result.isError ? 'FAILED' : 'SUCCESS'}`);
        console.log(`Duration: ${duration}ms`);

        if (result.content && result.content.length > 0) {
          const response = result.content[0];
          if (response.type === 'text') {
            const data = JSON.parse(response.text);

            console.log('\nResponse:');
            console.log(JSON.stringify(data, null, 2));

            // Validate response structure
            if (data.success) {
              console.log('\nValidation:');
              console.log(`  - Has total_watched: ${data.data.total_watched !== undefined ? 'YES' : 'NO'}`);
              console.log(`  - Has unique_shows: ${data.data.unique_shows !== undefined ? 'YES' : 'NO'}`);
              console.log(`  - Has unique_movies: ${data.data.unique_movies !== undefined ? 'YES' : 'NO'}`);
              console.log(`  - Has total_episodes: ${data.data.total_episodes !== undefined ? 'YES' : 'NO'}`);
              console.log(`  - Has most_watched_show: ${data.data.most_watched_show !== undefined ? 'YES' : 'NO'}`);
              console.log(`  - Has recent_activity: ${data.data.recent_activity !== undefined ? 'YES' : 'NO'}`);

              if (data.data.recent_activity) {
                console.log(`    - last_24h: ${data.data.recent_activity.last_24h}`);
                console.log(`    - last_week: ${data.data.recent_activity.last_week}`);
                console.log(`    - last_month: ${data.data.recent_activity.last_month}`);
              }

              console.log(`\nSummary:`);
              console.log(`  Total watched: ${data.data.total_watched}`);
              console.log(`  Unique shows: ${data.data.unique_shows}`);
              console.log(`  Unique movies: ${data.data.unique_movies}`);
              console.log(`  Total episodes: ${data.data.total_episodes}`);

              if (data.data.most_watched_show) {
                console.log(`  Most watched: ${data.data.most_watched_show.show.title} (${data.data.most_watched_show.episodes_watched} episodes)`);
              }
            } else {
              console.log('\nERROR Details:');
              console.log(`  Code: ${data.error.code}`);
              console.log(`  Message: ${data.error.message}`);
            }
          }
        }

        console.log('\n' + '='.repeat(50));
      } catch (error) {
        console.log(`Status: EXCEPTION`);
        console.log(`Error: ${error.message}`);
        console.log(`Stack: ${error.stack}`);
        console.log('\n' + '='.repeat(50));
      }
    }

    console.log('\n\nALL TESTS COMPLETED\n');
    await client.close();

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

runTests().catch(console.error);

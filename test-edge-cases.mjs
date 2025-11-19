#!/usr/bin/env node

/**
 * Edge case testing for summarize_history MCP tool
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EDGE_CASES = [
  {
    name: 'Invalid date format',
    description: 'Test with malformed date string',
    args: {
      startDate: 'invalid-date',
      endDate: '2025-01-31'
    },
    expectError: true
  },
  {
    name: 'Future date range',
    description: 'Test with dates in the far future (should return empty)',
    args: {
      startDate: '2030-01-01',
      endDate: '2030-12-31'
    },
    expectError: false,
    expectEmpty: true
  },
  {
    name: 'End before start',
    description: 'Test with end date before start date',
    args: {
      startDate: '2025-01-31',
      endDate: '2025-01-01'
    },
    expectError: false
  },
  {
    name: 'Very old date range',
    description: 'Test with dates from 1970',
    args: {
      startDate: '1970-01-01',
      endDate: '1970-12-31'
    },
    expectError: false,
    expectEmpty: true
  },
  {
    name: 'Single day range',
    description: 'Test with same start and end date',
    args: {
      startDate: '2025-01-15',
      endDate: '2025-01-15'
    },
    expectError: false
  },
  {
    name: 'Ambiguous natural language',
    description: 'Test with "yesterday"',
    args: {
      startDate: 'yesterday',
      endDate: 'yesterday'
    },
    expectError: false
  },
  {
    name: 'Mixed format dates',
    description: 'Natural language start, ISO end',
    args: {
      startDate: 'last month',
      endDate: '2025-11-18'
    },
    expectError: false
  },
  {
    name: 'Empty string dates',
    description: 'Test with empty strings (should be treated as no filter)',
    args: {
      startDate: '',
      endDate: ''
    },
    expectError: true
  }
];

async function runEdgeCaseTests() {
  console.log('\n=== EDGE CASE TESTING: summarize_history ===\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['/Users/kofifort/Repos/trakt.tv-mcp/dist/index.js']
  });

  const client = new Client(
    {
      name: 'edge-case-test-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  try {
    await client.connect(transport);

    for (const testCase of EDGE_CASES) {
      console.log(`\nEDGE CASE: ${testCase.name}`);
      console.log(`Description: ${testCase.description}`);
      console.log(`Arguments: ${JSON.stringify(testCase.args, null, 2)}`);
      console.log(`Expected Error: ${testCase.expectError ? 'YES' : 'NO'}`);
      console.log('-------------------------------------------');

      try {
        const result = await client.callTool({
          name: 'summarize_history',
          arguments: testCase.args
        });

        const response = result.content[0];
        const data = JSON.parse(response.text);

        console.log(`Status: ${result.isError ? 'ERROR' : 'SUCCESS'}`);

        if (data.success) {
          console.log(`Result: SUCCESS`);
          console.log(`  Total watched: ${data.data.total_watched}`);
          console.log(`  Unique shows: ${data.data.unique_shows}`);
          console.log(`  Unique movies: ${data.data.unique_movies}`);

          if (testCase.expectError) {
            console.log(`  UNEXPECTED: Expected error but got success!`);
          }

          if (testCase.expectEmpty && data.data.total_watched > 0) {
            console.log(`  UNEXPECTED: Expected empty result but got ${data.data.total_watched} items!`);
          }
        } else {
          console.log(`Result: ERROR`);
          console.log(`  Code: ${data.error.code}`);
          console.log(`  Message: ${data.error.message}`);

          if (!testCase.expectError) {
            console.log(`  UNEXPECTED: Got error but expected success!`);
          } else {
            console.log(`  EXPECTED: Error occurred as anticipated`);
          }
        }

        console.log('='.repeat(50));
      } catch (error) {
        console.log(`Status: EXCEPTION`);
        console.log(`Error: ${error.message}`);
        console.log('='.repeat(50));
      }
    }

    console.log('\n\nEDGE CASE TESTS COMPLETED\n');
    await client.close();

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

runEdgeCaseTests().catch(console.error);

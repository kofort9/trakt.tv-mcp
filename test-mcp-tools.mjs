#!/usr/bin/env node

/**
 * MCP Tools Integration Test
 * Tests the MCP server tools through stdio communication
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, 'dist/index.js');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: [],
};

let requestId = 1;

/**
 * Create JSON-RPC request
 */
function createRequest(method, params = {}) {
  return {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params,
  };
}

/**
 * Send request to MCP server
 */
function sendRequest(proc, method, params) {
  const request = createRequest(method, params);
  proc.stdin.write(JSON.stringify(request) + '\n');
  return request.id;
}

/**
 * Wait for response with specific ID
 */
function waitForResponse(proc, expectedId, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      reject(new Error('Response timeout'));
    }, timeoutMs);

    const onData = (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);

          if (message.id === expectedId) {
            clearTimeout(timeout);
            proc.stdout.off('data', onData);
            resolve(message);
            return;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    };

    proc.stdout.on('data', onData);
  });
}

/**
 * Run a test case
 */
async function runTest(testName, testFn) {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} ${testName}`);

  try {
    await testFn();
    console.log(`${colors.green}✓ PASS${colors.reset}`);
    results.passed.push(testName);
  } catch (error) {
    console.log(`${colors.red}✗ FAIL${colors.reset}: ${error.message}`);
    results.failed.push({ name: testName, error: error.message });
  }
}

/**
 * Main test suite
 */
async function main() {
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}  Trakt.tv MCP Tools Integration Tests${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);

  // Start MCP server
  const proc = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Initialize server
  await runTest('Initialize MCP server', async () => {
    const id = sendRequest(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });

    const response = await waitForResponse(proc, id);

    if (!response.result) {
      throw new Error('No result in initialize response');
    }

    console.log(`    Server: ${response.result.serverInfo?.name || 'Unknown'}`);
    console.log(`    Version: ${response.result.serverInfo?.version || 'Unknown'}`);
  });

  // List tools
  let tools = [];
  await runTest('List available tools', async () => {
    const id = sendRequest(proc, 'tools/list', {});
    const response = await waitForResponse(proc, id);

    if (!response.result?.tools) {
      throw new Error('No tools in response');
    }

    tools = response.result.tools;

    if (tools.length !== 2) {
      throw new Error(`Expected 2 tools, got ${tools.length}`);
    }

    const hasAuthenticate = tools.some(t => t.name === 'authenticate');
    const hasSearchShow = tools.some(t => t.name === 'search_show');

    if (!hasAuthenticate) {
      throw new Error('Missing authenticate tool');
    }

    if (!hasSearchShow) {
      throw new Error('Missing search_show tool');
    }

    console.log(`    Found ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`      - ${tool.name}: ${tool.description}`);
    });
  });

  // Test authenticate tool
  await runTest('Call authenticate tool (not authenticated)', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'authenticate',
      arguments: {},
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;

    if (!content.includes('https://trakt.tv/activate')) {
      throw new Error('Response does not contain verification URL');
    }

    if (!content.match(/[A-Z0-9]{8}/)) {
      throw new Error('Response does not contain user code');
    }

    console.log(`    Response contains verification URL and code`);

    // Extract and display the code
    const codeMatch = content.match(/code: ([A-Z0-9]{8})/);
    if (codeMatch) {
      console.log(`    ${colors.yellow}User Code: ${codeMatch[1]}${colors.reset}`);
    }
  });

  // Test search_show tool
  await runTest('Call search_show tool - Breaking Bad', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'Breaking Bad',
      },
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (!Array.isArray(results)) {
      throw new Error('Results are not an array');
    }

    if (results.length === 0) {
      throw new Error('No results returned');
    }

    console.log(`    Found ${results.length} results`);
    console.log(`    First result: ${results[0].show?.title} (${results[0].show?.year})`);
  });

  await runTest('Call search_show tool - Movie search', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'Inception',
        type: 'movie',
      },
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (!Array.isArray(results)) {
      throw new Error('Results are not an array');
    }

    if (results.length === 0) {
      throw new Error('No results returned');
    }

    // Verify it's a movie search
    if (results[0].type !== 'movie') {
      throw new Error('First result is not a movie');
    }

    console.log(`    Found ${results.length} movie results`);
    console.log(`    First result: ${results[0].movie?.title} (${results[0].movie?.year})`);
  });

  await runTest('Call search_show tool - Ambiguous title (Dune)', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'Dune',
      },
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (!Array.isArray(results)) {
      throw new Error('Results are not an array');
    }

    const shows = results.filter(r => r.type === 'show');
    const movies = results.filter(r => r.type === 'movie');

    console.log(`    Found ${results.length} total results`);
    console.log(`    Shows: ${shows.length}, Movies: ${movies.length}`);

    // Display first few
    results.slice(0, 3).forEach(r => {
      const item = r.show || r.movie;
      console.log(`      - [${r.type}] ${item?.title} (${item?.year})`);
    });
  });

  await runTest('Call search_show tool - Special characters', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: "It's Always Sunny in Philadelphia",
      },
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (!Array.isArray(results)) {
      throw new Error('Results are not an array');
    }

    if (results.length === 0) {
      throw new Error('No results for a popular show with special characters');
    }

    console.log(`    Found ${results.length} results`);
    console.log(`    First result: ${results[0].show?.title}`);
  });

  await runTest('Call search_show tool - No results', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'xyznotarealshow123abc',
      },
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (!Array.isArray(results)) {
      throw new Error('Results are not an array');
    }

    if (results.length !== 0) {
      throw new Error(`Expected 0 results, got ${results.length}`);
    }

    console.log(`    Correctly returned empty array`);
  });

  await runTest('Call search_show tool - Missing query parameter', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {},
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;

    if (!content.includes('Error') && !content.includes('required')) {
      throw new Error('Expected error message about missing query');
    }

    console.log(`    Correctly returned error: ${content.substring(0, 100)}`);
  });

  await runTest('Call unknown tool', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    });

    const response = await waitForResponse(proc, id, 10000);

    if (!response.result?.content) {
      throw new Error('No content in response');
    }

    const content = response.result.content[0].text;

    if (!content.includes('Unknown tool') && !content.includes('Error')) {
      throw new Error('Expected error message about unknown tool');
    }

    console.log(`    Correctly returned error`);
  });

  // Clean up
  proc.kill();

  // Print summary
  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}  Test Summary${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}Passed: ${results.passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);

  if (results.failed.length > 0) {
    console.log(`\n${colors.red}Failed tests:${colors.reset}`);
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}`);
      console.log(`    Error: ${error}`);
    });
  }

  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`${colors.red}Test runner error:${colors.reset}`, error);
  process.exit(1);
});

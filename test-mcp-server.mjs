#!/usr/bin/env node

/**
 * MCP Server Test Script
 * This script tests the Trakt.tv MCP server implementation
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, 'dist/index.js');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  errors: [],
};

/**
 * Send a JSON-RPC message to the MCP server
 */
function sendMessage(proc, method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const json = JSON.stringify(message);
  proc.stdin.write(json + '\n');

  return message.id;
}

/**
 * Run a test case
 */
async function runTest(testName, testFn) {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} ${testName}`);

  try {
    await testFn();
    console.log(`${colors.green}✓ PASS${colors.reset}`);
    testResults.passed.push(testName);
  } catch (error) {
    console.log(`${colors.red}✗ FAIL${colors.reset}: ${error.message}`);
    testResults.failed.push({ name: testName, error: error.message });
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}  Trakt.tv MCP Server Test Suite${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);

  // Test 1: Server starts successfully
  await runTest('Server starts and responds to initialization', async () => {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let timeout;

      proc.stderr.on('data', (data) => {
        output += data.toString();
        if (output.includes('trakt-mcp-server')) {
          clearTimeout(timeout);
          proc.kill();
          resolve();
        }
      });

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Server startup timeout'));
      }, 5000);

      // Send initialize request
      sendMessage(proc, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      });
    });
  });

  // Test 2: List tools
  await runTest('List available tools', async () => {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let receivedTools = false;
      let timeout;

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const message = JSON.parse(line);

            if (message.result && message.result.tools) {
              const tools = message.result.tools;

              if (tools.length === 2 &&
                  tools.some(t => t.name === 'authenticate') &&
                  tools.some(t => t.name === 'search_show')) {
                receivedTools = true;
                clearTimeout(timeout);
                proc.kill();
                resolve();
              } else {
                reject(new Error(`Expected 2 tools (authenticate, search_show), got ${tools.length}`));
              }
            }
          } catch (e) {
            // Ignore parse errors for stderr output
          }
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      timeout = setTimeout(() => {
        proc.kill();
        if (!receivedTools) {
          reject(new Error('Did not receive tools list'));
        }
      }, 5000);

      // Initialize first
      sendMessage(proc, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      // Wait a bit then request tools
      setTimeout(() => {
        sendMessage(proc, 'tools/list', {});
      }, 500);
    });
  });

  // Test 3: Test search_show tool (without auth, should still work for search)
  await runTest('Call search_show tool with query', async () => {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let receivedResponse = false;
      let timeout;

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const message = JSON.parse(line);

            // Check for the response to our tool call
            if (message.result && message.result.content) {
              receivedResponse = true;
              clearTimeout(timeout);
              proc.kill();

              const content = message.result.content[0].text;

              // Should contain JSON response (either results or an error about auth)
              if (content.includes('[') || content.includes('Error')) {
                resolve();
              } else {
                reject(new Error('Unexpected response format'));
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      timeout = setTimeout(() => {
        proc.kill();
        if (!receivedResponse) {
          reject(new Error('Did not receive tool response'));
        }
      }, 10000);

      // Initialize first
      sendMessage(proc, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      // Wait a bit then call the tool
      setTimeout(() => {
        sendMessage(proc, 'tools/call', {
          name: 'search_show',
          arguments: {
            query: 'Breaking Bad',
          },
        });
      }, 500);
    });
  });

  // Print summary
  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}  Test Summary${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}Passed: ${testResults.passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testResults.failed.length}${colors.reset}`);

  if (testResults.failed.length > 0) {
    console.log(`\n${colors.red}Failed tests:${colors.reset}`);
    testResults.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
  }

  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);

  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`${colors.red}Test runner error:${colors.reset}`, error);
  process.exit(1);
});

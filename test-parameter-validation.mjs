#!/usr/bin/env node

/**
 * Quick test to see what happens with missing parameters
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, 'dist/index.js');

let requestId = 1;

function createRequest(method, params = {}) {
  return { jsonrpc: '2.0', id: requestId++, method, params };
}

function sendRequest(proc, method, params) {
  const request = createRequest(method, params);
  proc.stdin.write(JSON.stringify(request) + '\n');
  return request.id;
}

function waitForResponse(proc, expectedId, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('Timeout')), timeoutMs);

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
        } catch (e) {}
      }
    };

    proc.stdout.on('data', onData);
  });
}

async function main() {
  const proc = spawn('node', [SERVER_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });

  // Initialize
  const initId = sendRequest(proc, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  });
  await waitForResponse(proc, initId);

  console.log('\n=== Test: Missing season and episode ===');
  const id1 = sendRequest(proc, 'tools/call', {
    name: 'search_episode',
    arguments: {
      showName: 'Breaking Bad',
      // Missing: season, episode
    },
  });

  const response1 = await waitForResponse(proc, id1);
  console.log('Response:', JSON.stringify(response1.result.content[0].text, null, 2));

  proc.kill();
  process.exit(0);
}

main().catch(console.error);

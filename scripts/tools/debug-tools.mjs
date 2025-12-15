#!/usr/bin/env node

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, 'dist/index.js');

let requestId = 1;

function sendRequest(proc, method, params) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params,
  };
  proc.stdin.write(JSON.stringify(request) + '\n');
  return request.id;
}

const proc = spawn('node', [SERVER_PATH], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';

proc.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      if (message.result?.tools) {
        console.log('Available tools:');
        message.result.tools.forEach((tool, idx) => {
          console.log(`${idx + 1}. ${tool.name}`);
          console.log(`   Description: ${tool.description}`);
          console.log('');
        });
        proc.kill();
        process.exit(0);
      }
    } catch (e) {
      // Ignore
    }
  }
});

proc.stderr.on('data', (data) => {
  console.error('Server stderr:', data.toString());
});

// Initialize
setTimeout(() => {
  sendRequest(proc, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'debug', version: '1.0.0' },
  });
}, 500);

// List tools
setTimeout(() => {
  sendRequest(proc, 'tools/list', {});
}, 1000);

// Timeout
setTimeout(() => {
  console.error('Timeout');
  proc.kill();
  process.exit(1);
}, 5000);

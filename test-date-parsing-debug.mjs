#!/usr/bin/env node

/**
 * Debug Date Parsing Issue
 *
 * User reported "yesterday" was parsed as "last Sunday" instead of actual yesterday.
 * This script investigates the date parsing behavior.
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

function waitForResponse(proc, expectedId, timeoutMs = 10000) {
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
    clientInfo: { name: 'date-debug', version: '1.0.0' },
  });
  await waitForResponse(proc, initId);

  console.log('=== DATE PARSING DEBUG ===\n');

  // Get current date
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayExpected = yesterday.toISOString().split('T')[0];

  console.log(`Current system time: ${now.toISOString()}`);
  console.log(`Today (expected): ${today}`);
  console.log(`Yesterday (expected): ${yesterdayExpected}`);
  console.log(`Day of week: ${now.toLocaleDateString('en-US', { weekday: 'long' })}`);
  console.log();

  // Check what was actually logged in history
  console.log('=== CHECKING HISTORY ===\n');

  const historyId = sendRequest(proc, 'tools/call', {
    name: 'get_history',
    arguments: {
      type: 'movies',
      limit: 5,
    },
  });

  const historyResponse = await waitForResponse(proc, historyId, 15000);
  const historyContent = historyResponse.result.content[0].text;
  const history = JSON.parse(historyContent);

  if (history.success && history.data.length > 0) {
    console.log('Recent watch history:\n');
    history.data.forEach((item, i) => {
      const watchedDate = new Date(item.watched_at);
      const dateOnly = item.watched_at.split('T')[0];
      const dayOfWeek = watchedDate.toLocaleDateString('en-US', { weekday: 'long' });

      console.log(`${i + 1}. ${item.movie?.title || item.show?.title}`);
      console.log(`   Watched at: ${item.watched_at}`);
      console.log(`   Date: ${dateOnly}`);
      console.log(`   Day of week: ${dayOfWeek}`);
      console.log(`   Expected yesterday: ${dateOnly === yesterdayExpected ? '✅ YES' : '❌ NO'}`);
      console.log();
    });

    // Find Princess Mononoke or Triangle
    const suspicious = history.data.find(item =>
      item.movie?.title?.includes('Princess Mononoke') ||
      item.movie?.title?.includes('Triangle')
    );

    if (suspicious) {
      console.log('=== FOUND SUSPICIOUS ENTRY ===\n');
      console.log(`Title: ${suspicious.movie.title}`);
      console.log(`Logged date: ${suspicious.watched_at}`);
      console.log(`Expected: ${yesterdayExpected}T00:00:00.000Z`);
      console.log(`Match: ${suspicious.watched_at.startsWith(yesterdayExpected) ? '✅' : '❌'}`);

      const watchedDate = new Date(suspicious.watched_at);
      const dayOfWeek = watchedDate.toLocaleDateString('en-US', { weekday: 'long' });
      console.log(`Day of week logged: ${dayOfWeek}`);
      console.log(`Is it Sunday?: ${dayOfWeek === 'Sunday' ? '🚨 YES - USER WAS RIGHT!' : 'No'}`);
    }
  }

  // Test current date parsing
  console.log('\n=== TESTING DATE PARSING NOW ===\n');

  // We can't directly test parseNaturalDate, but we can test via log_watch dry run
  // For now, just show what dates the system would use
  console.log('If we logged a test movie with "yesterday" right now:');
  console.log(`  Expected date: ${yesterdayExpected}T00:00:00.000Z`);
  console.log(`  Check history above to see if dates match`);

  proc.kill();
  process.exit(0);
}

main().catch(console.error);

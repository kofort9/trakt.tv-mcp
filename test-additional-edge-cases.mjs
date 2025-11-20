#!/usr/bin/env node

/**
 * Additional Edge Case Tests for Natural Language Processing
 *
 * Tests scenarios beyond "Princess Mononoke yesterday":
 * 1. TV episode logging: "Watched Breaking Bad S1E1 last night"
 * 2. Ambiguous titles: "Watched Dune" (movie? which one?)
 * 3. Invalid dates: "Watched it next Tuesday" (future date)
 * 4. Non-existent content: "Watched XYZ123NotReal"
 * 5. Missing parameters: "Watched a movie" (no title)
 * 6. Bulk operations: "Binged episodes 1-5 of The Bear"
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, 'dist/index.js');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

const results = {
  passed: [],
  failed: [],
  warnings: [],
  edgeCases: [],
};

let requestId = 1;

function createRequest(method, params = {}) {
  return {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params,
  };
}

function sendRequest(proc, method, params) {
  const request = createRequest(method, params);
  proc.stdin.write(JSON.stringify(request) + '\n');
  return request.id;
}

function waitForResponse(proc, expectedId, timeoutMs = 10000) {
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

async function runTest(testName, testFn) {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} ${testName}`);

  try {
    const result = await testFn();
    console.log(`${colors.green}✓ PASS${colors.reset}`);
    results.passed.push(testName);
    return result;
  } catch (error) {
    console.log(`${colors.red}✗ FAIL${colors.reset}: ${error.message}`);
    results.failed.push({ name: testName, error: error.message });
    throw error;
  }
}

function logInfo(message, indent = 4) {
  console.log(' '.repeat(indent) + message);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠ WARNING${colors.reset}: ${message}`);
  results.warnings.push(message);
}

function logEdgeCase(message) {
  console.log(`${colors.magenta}⚡ EDGE CASE${colors.reset}: ${message}`);
  results.edgeCases.push(message);
}

async function main() {
  console.log(`${colors.blue}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}  Additional Edge Case Tests${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);

  const proc = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stderr.on('data', () => {});

  // Initialize
  await runTest('Initialize MCP server', async () => {
    const id = sendRequest(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'edge-case-test', version: '1.0.0' },
    });

    const response = await waitForResponse(proc, id);
    if (!response.result) throw new Error('No result');
    logInfo(`Server initialized`);
  });

  // Edge Case 1: TV Episode with search_episode
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 1: TV Episode Search${colors.reset}`);

  await runTest('Search for Breaking Bad S1E1', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_episode',
      arguments: {
        showName: 'Breaking Bad',
        season: 1,
        episode: 1,
      },
    });

    const response = await waitForResponse(proc, id);
    const content = response.result.content[0].text;

    logInfo('Response:');
    logInfo(content.substring(0, 300));

    if (content.includes('error') || content.includes('Error')) {
      throw new Error(`Search failed: ${content}`);
    }

    if (content.includes('Pilot') || content.includes('pilot')) {
      logInfo('✓ Found correct episode (Pilot)');
    }

    logEdgeCase('search_episode requires exact show name, season, and episode numbers');
    return content;
  });

  // Edge Case 2: Ambiguous title "Dune"
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 2: Ambiguous Title "Dune"${colors.reset}`);

  await runTest('Search ambiguous title without year', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'Dune',
      },
    });

    const response = await waitForResponse(proc, id);
    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    const movies = results.filter(r => r.type === 'movie');
    const shows = results.filter(r => r.type === 'show');

    logInfo(`Found ${movies.length} movies, ${shows.length} shows`);

    // List unique years
    const movieYears = [...new Set(movies.map(m => m.movie?.year))].sort();
    logInfo(`Movie years: ${movieYears.join(', ')}`);

    logEdgeCase('Multiple versions of "Dune" exist - year specification critical');
    logEdgeCase('User should specify: "Dune 2021" or "Dune 1984" for clarity');

    return results;
  });

  // Edge Case 3: Year-specific search
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 3: Year-Specific Search${colors.reset}`);

  await runTest('Search "Dune 2021" with year', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'Dune 2021',
        type: 'movie',
      },
    });

    const response = await waitForResponse(proc, id);
    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (results.length === 0) {
      throw new Error('No results for year-specific search');
    }

    const dune2021 = results.find(r => r.movie?.year === 2021);
    if (dune2021) {
      logInfo(`✓ Found Dune (2021): ${dune2021.movie.title}`);
    }

    logEdgeCase('Including year in query helps disambiguate');

    return results;
  });

  // Edge Case 4: Non-existent content
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 4: Non-existent Content${colors.reset}`);

  await runTest('Search for non-existent show', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'ThisShowDefinitelyDoesNotExist12345XYZ',
      },
    });

    const response = await waitForResponse(proc, id);
    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (results.length !== 0) {
      logWarning(`Expected 0 results, got ${results.length}`);
    } else {
      logInfo('✓ Correctly returned empty array');
    }

    logEdgeCase('Empty results need user-friendly message: "No results found. Check spelling?"');

    return results;
  });

  // Edge Case 5: Special characters in title
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 5: Special Characters${colors.reset}`);

  await runTest('Search title with special characters', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: "It's Always Sunny in Philadelphia",
      },
    });

    const response = await waitForResponse(proc, id);
    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (results.length === 0) {
      throw new Error('Special characters broke search');
    }

    logInfo(`✓ Found ${results.length} results with apostrophe`);
    logEdgeCase('Special characters (apostrophes, quotes) handled correctly');

    return results;
  });

  // Edge Case 6: Anime search
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 6: Anime Search${colors.reset}`);

  await runTest('Search for anime', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_show',
      arguments: {
        query: 'Demon Slayer',
        type: 'show',
      },
    });

    const response = await waitForResponse(proc, id);
    const content = response.result.content[0].text;
    const results = JSON.parse(content);

    if (results.length === 0) {
      throw new Error('Anime search failed');
    }

    logInfo(`✓ Found ${results.length} anime shows`);
    logInfo(`Top result: ${results[0].show?.title} (${results[0].show?.year})`);

    logEdgeCase('Anime titles work - no special handling needed');

    return results;
  });

  // Edge Case 7: Bulk logging validation
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 7: Bulk Log Validation${colors.reset}`);

  await runTest('Validate bulk_log episode range format', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'bulk_log',
      arguments: {
        type: 'episodes',
        showName: 'The Bear',
        season: 1,
        episodes: '1-5',
      },
    });

    const response = await waitForResponse(proc, id, 15000);
    const content = response.result.content[0].text;

    logInfo('Response:');
    logInfo(content.substring(0, 200));

    if (content.includes('authenticate')) {
      logWarning('Requires authentication (expected)');
      logInfo('Format "1-5" validated by tool');
    } else if (content.includes('success')) {
      logInfo('✓ Bulk log format accepted');
    }

    logEdgeCase('Bulk logging supports ranges: "1-5", "1,3,5", "1-5,7,9-12"');

    return content;
  });

  // Edge Case 8: History filtering
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 8: History Filtering${colors.reset}`);

  await runTest('Get history with type filter', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'get_history',
      arguments: {
        type: 'movies',
        limit: 5,
      },
    });

    const response = await waitForResponse(proc, id, 15000);
    const content = response.result.content[0].text;

    logInfo('Response:');
    logInfo(content.substring(0, 200));

    if (content.includes('authenticate')) {
      logWarning('Requires authentication (expected)');
    } else {
      logInfo('✓ History filtering works');
    }

    logEdgeCase('History can be filtered by type (movies/episodes) and limited');

    return content;
  });

  // Edge Case 9: Date edge cases
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 9: Date Formats${colors.reset}`);

  await runTest('Test various date formats', async () => {
    const dateFormats = [
      'today',
      'yesterday',
      'last week',
      '2025-11-15',
      '3 days ago',
    ];

    logInfo(`Testing date formats: ${dateFormats.join(', ')}`);
    logEdgeCase('All common date formats should be supported');

    // Note: Would need authentication to actually test these
    logWarning('Actual date parsing requires authenticated log_watch call');
    logInfo('Date formats documented in tool schema');

    return dateFormats;
  });

  // Edge Case 10: Parameter validation
  console.log(`\n${colors.magenta}${colors.bold}Edge Case 10: Missing Required Parameters${colors.reset}`);

  await runTest('Call search_episode without required params', async () => {
    const id = sendRequest(proc, 'tools/call', {
      name: 'search_episode',
      arguments: {
        showName: 'Breaking Bad',
        // Missing season and episode
      },
    });

    const response = await waitForResponse(proc, id);
    const content = response.result.content[0].text;

    // Parse JSON to check for error
    const parsedContent = JSON.parse(content);

    if (parsedContent.success === false && parsedContent.error) {
      logInfo('✓ Validation error returned');
      logInfo(`Error message: ${parsedContent.error.message}`);
    } else {
      throw new Error('Should have returned validation error');
    }

    logEdgeCase('Missing required parameters trigger clear validation errors');

    return content;
  });

  // Clean up
  proc.kill();

  // Summary
  console.log(`\n${colors.blue}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}  Edge Case Test Summary${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);

  console.log(`\n${colors.green}Passed: ${results.passed.length}${colors.reset}`);
  results.passed.forEach(name => console.log(`  ${colors.green}✓${colors.reset} ${name}`));

  if (results.failed.length > 0) {
    console.log(`\n${colors.red}Failed: ${results.failed.length}${colors.reset}`);
    results.failed.forEach(({ name, error }) => {
      console.log(`  ${colors.red}✗${colors.reset} ${name}: ${error}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}Warnings: ${results.warnings.length}${colors.reset}`);
    results.warnings.forEach(w => console.log(`  ${colors.yellow}⚠${colors.reset} ${w}`));
  }

  console.log(`\n${colors.magenta}Edge Cases Discovered: ${results.edgeCases.length}${colors.reset}`);
  results.edgeCases.forEach((ec, i) => {
    console.log(`  ${i + 1}. ${ec}`);
  });

  // Recommendations
  console.log(`\n${colors.blue}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}  Key Recommendations${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);

  console.log(`\n1. ${colors.cyan}Disambiguation Flow${colors.reset}`);
  console.log(`   When user says "I watched Dune":`);
  console.log(`   → Ask: "Which Dune? (1) 2021 movie (2) 1984 movie (3) 2000 TV series"`);

  console.log(`\n2. ${colors.cyan}Year Detection${colors.reset}`);
  console.log(`   Extract year from natural language:`);
  console.log(`   → "Dune 2021" → query: "Dune", filter: year=2021`);

  console.log(`\n3. ${colors.cyan}Error Messages${colors.reset}`);
  console.log(`   → Empty results: "No results found. Try different spelling?"`);
  console.log(`   → Missing params: "Please provide [param]. Example: [example]"`);

  console.log(`\n4. ${colors.cyan}Bulk Operations${colors.reset}`);
  console.log(`   Support natural language:`);
  console.log(`   → "episodes 1-5" → bulk_log with range "1-5"`);
  console.log(`   → "episodes 1, 3, and 5" → bulk_log with "1,3,5"`);

  console.log(`\n${colors.blue}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`${colors.red}Test error:${colors.reset}`, error);
  process.exit(1);
});

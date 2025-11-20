#!/usr/bin/env node
/**
 * Automated test runner for Phase 3 MCP tools
 * Tests all 5 remaining tools systematically
 */

import { loadConfig } from './lib/config.js';
import { TraktOAuth } from './lib/oauth.js';
import { TraktClient } from './lib/trakt-client.js';
import * as tools from './lib/tools.js';

// Test results tracking
interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  input: unknown;
  expected: string;
  actual: string;
  error?: string;
  notes?: string;
}

const results: TestResult[] = [];

// Helper to record test result
function recordTest(
  name: string,
  status: 'PASS' | 'FAIL' | 'SKIP',
  input: unknown,
  expected: string,
  actual: string,
  error?: string,
  notes?: string
) {
  results.push({ name, status, input, expected, actual, error, notes });
  const statusSymbol = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`${statusSymbol} ${name}`);
  if (error) console.log(`  Error: ${error}`);
  if (notes) console.log(`  Notes: ${notes}`);
}

// Initialize
const config = loadConfig();
const oauth = new TraktOAuth(config);
const client = new TraktClient(config, oauth);

async function main() {
  console.log('='.repeat(80));
  console.log('Phase 3 MCP Tools - Automated Test Suite');
  console.log('='.repeat(80));
  console.log();

  // Check authentication
  if (!oauth.isAuthenticated()) {
    console.error('ERROR: Not authenticated with Trakt.tv');
    console.error('Please run the authenticate tool first via MCP Inspector');
    process.exit(1);
  }

  console.log('✓ Authenticated with Trakt.tv\n');

  // ========== Test 1: search_episode ==========
  console.log('\n--- Test Suite 1: search_episode ---\n');

  try {
    const result = await tools.searchEpisode(client, {
      showName: 'Breaking Bad',
      season: 1,
      episode: 1,
    });
    if (result.success && result.data) {
      recordTest(
        '1.1: Breaking Bad S1E1 (Happy Path)',
        'PASS',
        { showName: 'Breaking Bad', season: 1, episode: 1 },
        'Episode with title "Pilot"',
        JSON.stringify(result.data, null, 2)
      );
    } else {
      recordTest(
        '1.1: Breaking Bad S1E1 (Happy Path)',
        'FAIL',
        { showName: 'Breaking Bad', season: 1, episode: 1 },
        'Episode with title "Pilot"',
        JSON.stringify(result, null, 2),
        'Expected success but got error'
      );
    }
  } catch (error) {
    recordTest(
      '1.1: Breaking Bad S1E1 (Happy Path)',
      'FAIL',
      { showName: 'Breaking Bad', season: 1, episode: 1 },
      'Episode with title "Pilot"',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.searchEpisode(client, {
      showName: 'The Office',
      season: 2,
      episode: 5,
    });
    recordTest(
      '1.2: The Office S2E5',
      result.success ? 'PASS' : 'FAIL',
      { showName: 'The Office', season: 2, episode: 5 },
      'Episode metadata',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '1.2: The Office S2E5',
      'FAIL',
      { showName: 'The Office', season: 2, episode: 5 },
      'Episode metadata',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.searchEpisode(client, {
      showName: 'Breaking Bad',
      season: 0,
      episode: 1,
    });
    recordTest(
      '1.3: Season 0 (Specials)',
      result.success ? 'PASS' : 'FAIL',
      { showName: 'Breaking Bad', season: 0, episode: 1 },
      'Special episode or appropriate error',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '1.3: Season 0 (Specials)',
      'FAIL',
      { showName: 'Breaking Bad', season: 0, episode: 1 },
      'Special episode or appropriate error',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.searchEpisode(client, {
      showName: 'ThisShowDoesNotExist12345',
      season: 1,
      episode: 1,
    });
    const isExpectedError = !result.success && 'error' in result && result.error.code === 'NOT_FOUND';
    recordTest(
      '1.4: Invalid Show Name',
      isExpectedError ? 'PASS' : 'FAIL',
      { showName: 'ThisShowDoesNotExist12345', season: 1, episode: 1 },
      'NOT_FOUND error',
      JSON.stringify(result, null, 2),
      undefined,
      isExpectedError ? 'Correctly returned NOT_FOUND' : 'Error type mismatch'
    );
  } catch (error) {
    recordTest(
      '1.4: Invalid Show Name',
      'FAIL',
      { showName: 'ThisShowDoesNotExist12345', season: 1, episode: 1 },
      'NOT_FOUND error',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.searchEpisode(client, {
      showName: 'Breaking Bad',
      season: 1,
      episode: 999,
    });
    const isExpectedError = !result.success;
    recordTest(
      '1.5: Invalid Episode Number',
      isExpectedError ? 'PASS' : 'FAIL',
      { showName: 'Breaking Bad', season: 1, episode: 999 },
      'NOT_FOUND error',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '1.5: Invalid Episode Number',
      'FAIL',
      { showName: 'Breaking Bad', season: 1, episode: 999 },
      'NOT_FOUND error',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.searchEpisode(client, {
      showName: 'Breaking Bad',
      season: -1,
      episode: 1,
    });
    const isExpectedError =
      !result.success && 'error' in result && result.error.code === 'VALIDATION_ERROR';
    recordTest(
      '1.6: Negative Season',
      isExpectedError ? 'PASS' : 'FAIL',
      { showName: 'Breaking Bad', season: -1, episode: 1 },
      'VALIDATION_ERROR',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '1.6: Negative Season',
      'PASS',
      { showName: 'Breaking Bad', season: -1, episode: 1 },
      'VALIDATION_ERROR',
      '',
      String(error),
      'Threw error as expected'
    );
  }

  // ========== Test 2: bulk_log ==========
  console.log('\n--- Test Suite 2: bulk_log ---\n');

  try {
    const result = await tools.bulkLog(client, {
      type: 'episodes',
      showName: 'Breaking Bad',
      season: 1,
      episodes: '1-5',
      watchedAt: 'yesterday',
    });
    recordTest(
      '2.1: Episode Range "1-5"',
      result.success ? 'PASS' : 'FAIL',
      { type: 'episodes', showName: 'Breaking Bad', season: 1, episodes: '1-5' },
      '5 episodes added',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '2.1: Episode Range "1-5"',
      'FAIL',
      { type: 'episodes', showName: 'Breaking Bad', season: 1, episodes: '1-5' },
      '5 episodes added',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.bulkLog(client, {
      type: 'episodes',
      showName: 'The Office',
      season: 2,
      episodes: '1-3,5,7-9',
      watchedAt: 'last week',
    });
    recordTest(
      '2.2: Complex Range "1-3,5,7-9"',
      result.success ? 'PASS' : 'FAIL',
      { type: 'episodes', showName: 'The Office', season: 2, episodes: '1-3,5,7-9' },
      '7 episodes added',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '2.2: Complex Range "1-3,5,7-9"',
      'FAIL',
      { type: 'episodes', showName: 'The Office', season: 2, episodes: '1-3,5,7-9' },
      '7 episodes added',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.bulkLog(client, {
      type: 'episodes',
      showName: 'Breaking Bad',
      season: 1,
      episodes: '7',
      watchedAt: 'today',
    });
    recordTest(
      '2.3: Single Episode',
      result.success ? 'PASS' : 'FAIL',
      { type: 'episodes', showName: 'Breaking Bad', season: 1, episodes: '7' },
      '1 episode added',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '2.3: Single Episode',
      'FAIL',
      { type: 'episodes', showName: 'Breaking Bad', season: 1, episodes: '7' },
      '1 episode added',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.bulkLog(client, {
      type: 'movies',
      movieNames: ['Inception', 'Interstellar'],
      watchedAt: 'yesterday',
    });
    recordTest(
      '2.4: Multiple Movies',
      result.success ? 'PASS' : 'FAIL',
      { type: 'movies', movieNames: ['Inception', 'Interstellar'] },
      '2 movies added',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '2.4: Multiple Movies',
      'FAIL',
      { type: 'movies', movieNames: ['Inception', 'Interstellar'] },
      '2 movies added',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.bulkLog(client, {
      type: 'episodes',
      showName: 'Breaking Bad',
      season: 1,
      episodes: 'abc-xyz',
    });
    const isExpectedError =
      !result.success && 'error' in result && result.error.code === 'VALIDATION_ERROR';
    recordTest(
      '2.5: Invalid Range Format',
      isExpectedError ? 'PASS' : 'FAIL',
      { type: 'episodes', showName: 'Breaking Bad', season: 1, episodes: 'abc-xyz' },
      'VALIDATION_ERROR',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '2.5: Invalid Range Format',
      'FAIL',
      { type: 'episodes', showName: 'Breaking Bad', season: 1, episodes: 'abc-xyz' },
      'VALIDATION_ERROR',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.bulkLog(client, {
      type: 'episodes',
      showName: 'Breaking Bad',
      season: undefined as never,
      episodes: undefined as never,
    });
    const isExpectedError =
      !result.success && 'error' in result && result.error.code === 'VALIDATION_ERROR';
    recordTest(
      '2.6: Missing Required Fields',
      isExpectedError ? 'PASS' : 'FAIL',
      { type: 'episodes', showName: 'Breaking Bad' },
      'VALIDATION_ERROR',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '2.6: Missing Required Fields',
      'FAIL',
      { type: 'episodes', showName: 'Breaking Bad' },
      'VALIDATION_ERROR',
      '',
      String(error)
    );
  }

  // ========== Test 3: get_history ==========
  console.log('\n--- Test Suite 3: get_history ---\n');

  try {
    const result = await tools.getHistory(client, { limit: 10 });
    recordTest(
      '3.1: Last 10 Items',
      result.success ? 'PASS' : 'FAIL',
      { limit: 10 },
      'Up to 10 recent items',
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest(
      '3.1: Last 10 Items',
      'FAIL',
      { limit: 10 },
      'Up to 10 recent items',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.getHistory(client, { type: 'shows', limit: 10 });
    recordTest(
      '3.2: Shows Only',
      result.success ? 'PASS' : 'FAIL',
      { type: 'shows', limit: 10 },
      'Only TV episodes',
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest(
      '3.2: Shows Only',
      'FAIL',
      { type: 'shows', limit: 10 },
      'Only TV episodes',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.getHistory(client, { type: 'movies', limit: 10 });
    recordTest(
      '3.3: Movies Only',
      result.success ? 'PASS' : 'FAIL',
      { type: 'movies', limit: 10 },
      'Only movies',
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest(
      '3.3: Movies Only',
      'FAIL',
      { type: 'movies', limit: 10 },
      'Only movies',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.getHistory(client, {
      startDate: 'last week',
      endDate: 'today',
    });
    recordTest(
      '3.4: Date Range - Last Week',
      result.success ? 'PASS' : 'FAIL',
      { startDate: 'last week', endDate: 'today' },
      'Items from last week',
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest(
      '3.4: Date Range - Last Week',
      'FAIL',
      { startDate: 'last week', endDate: 'today' },
      'Items from last week',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.getHistory(client, {
      startDate: '2020-01-01',
      endDate: '2020-01-02',
    });
    recordTest(
      '3.5: Empty Date Range',
      result.success ? 'PASS' : 'FAIL',
      { startDate: '2020-01-01', endDate: '2020-01-02' },
      'Empty array',
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest(
      '3.5: Empty Date Range',
      'FAIL',
      { startDate: '2020-01-01', endDate: '2020-01-02' },
      'Empty array',
      '',
      String(error)
    );
  }

  // ========== Test 4: get_upcoming ==========
  console.log('\n--- Test Suite 4: get_upcoming ---\n');

  try {
    const result = await tools.getUpcoming(client, {});
    recordTest(
      '4.1: Default (7 days)',
      result.success ? 'PASS' : 'FAIL',
      {},
      'Upcoming episodes for next 7 days',
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest(
      '4.1: Default (7 days)',
      'FAIL',
      {},
      'Upcoming episodes for next 7 days',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.getUpcoming(client, { days: 30 });
    recordTest(
      '4.2: 30 Days',
      result.success ? 'PASS' : 'FAIL',
      { days: 30 },
      'Next 30 days of episodes',
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest('4.2: 30 Days', 'FAIL', { days: 30 }, 'Next 30 days of episodes', '', String(error));
  }

  try {
    const result = await tools.getUpcoming(client, { days: 1 });
    recordTest(
      '4.3: 1 Day',
      result.success ? 'PASS' : 'FAIL',
      { days: 1 },
      "Today's episodes",
      `Returned ${result.success && result.data ? result.data.length : 0} items`
    );
  } catch (error) {
    recordTest('4.3: 1 Day', 'FAIL', { days: 1 }, "Today's episodes", '', String(error));
  }

  try {
    const result = await tools.getUpcoming(client, { days: 0 });
    const isExpectedError =
      !result.success && 'error' in result && result.error.code === 'VALIDATION_ERROR';
    recordTest(
      '4.4: Invalid Days (0)',
      isExpectedError ? 'PASS' : 'FAIL',
      { days: 0 },
      'VALIDATION_ERROR',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest('4.4: Invalid Days (0)', 'FAIL', { days: 0 }, 'VALIDATION_ERROR', '', String(error));
  }

  try {
    const result = await tools.getUpcoming(client, { days: 31 });
    const isExpectedError =
      !result.success && 'error' in result && result.error.code === 'VALIDATION_ERROR';
    recordTest(
      '4.5: Invalid Days (31)',
      isExpectedError ? 'PASS' : 'FAIL',
      { days: 31 },
      'VALIDATION_ERROR',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '4.5: Invalid Days (31)',
      'FAIL',
      { days: 31 },
      'VALIDATION_ERROR',
      '',
      String(error)
    );
  }

  // ========== Test 5: follow_show & unfollow_show ==========
  console.log('\n--- Test Suite 5: follow_show & unfollow_show ---\n');

  try {
    const result = await tools.followShow(client, { showName: 'Stranger Things' });
    recordTest(
      '5.1: Follow Show',
      result.success ? 'PASS' : 'FAIL',
      { showName: 'Stranger Things' },
      'Show added to watchlist',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '5.1: Follow Show',
      'FAIL',
      { showName: 'Stranger Things' },
      'Show added to watchlist',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.followShow(client, { showName: 'Stranger Things' });
    recordTest(
      '5.2: Follow Same Show Again',
      result.success ? 'PASS' : 'FAIL',
      { showName: 'Stranger Things' },
      'Handled gracefully',
      JSON.stringify(result, null, 2),
      undefined,
      'Should not error on duplicate follow'
    );
  } catch (error) {
    recordTest(
      '5.2: Follow Same Show Again',
      'FAIL',
      { showName: 'Stranger Things' },
      'Handled gracefully',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.unfollowShow(client, { showName: 'Stranger Things' });
    recordTest(
      '5.3: Unfollow Show',
      result.success ? 'PASS' : 'FAIL',
      { showName: 'Stranger Things' },
      'Show removed from watchlist',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '5.3: Unfollow Show',
      'FAIL',
      { showName: 'Stranger Things' },
      'Show removed from watchlist',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.unfollowShow(client, { showName: 'Stranger Things' });
    recordTest(
      '5.4: Unfollow Again',
      result.success ? 'PASS' : 'FAIL',
      { showName: 'Stranger Things' },
      'Handled gracefully',
      JSON.stringify(result, null, 2),
      undefined,
      'Should not error when unfollowing already-unfollowed show'
    );
  } catch (error) {
    recordTest(
      '5.4: Unfollow Again',
      'FAIL',
      { showName: 'Stranger Things' },
      'Handled gracefully',
      '',
      String(error)
    );
  }

  try {
    const result = await tools.followShow(client, {
      showName: 'ThisShowDoesNotExist12345',
    });
    const isExpectedError = !result.success && 'error' in result && result.error.code === 'NOT_FOUND';
    recordTest(
      '5.5: Follow Non-Existent Show',
      isExpectedError ? 'PASS' : 'FAIL',
      { showName: 'ThisShowDoesNotExist12345' },
      'NOT_FOUND error',
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    recordTest(
      '5.5: Follow Non-Existent Show',
      'FAIL',
      { showName: 'ThisShowDoesNotExist12345' },
      'NOT_FOUND error',
      '',
      String(error)
    );
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`○ Skipped: ${skipped}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  // Print failed tests
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`  ✗ ${r.name}`);
        if (r.error) console.log(`    Error: ${r.error}`);
      });
  }

  console.log('\nTest results saved to test-results.json');

  // Save detailed results to file
  const fs = await import('fs');
  fs.writeFileSync('test-results.json', JSON.stringify(results, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});

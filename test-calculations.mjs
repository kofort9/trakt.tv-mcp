#!/usr/bin/env node

/**
 * Verify statistics calculations for summarize_history
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function verifyCalculations() {
  console.log('\n=== VERIFYING STATISTICS CALCULATIONS ===\n');
  console.log('This test compares summarize_history results with raw get_history data');
  console.log('to verify calculation accuracy.\n');
  console.log('===========================================\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['/Users/kofifort/Repos/trakt.tv-mcp/dist/index.js']
  });

  const client = new Client(
    {
      name: 'calculation-test-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  try {
    await client.connect(transport);

    // Test 1: Get raw history for January 2025
    console.log('TEST 1: January 2025 - Verifying calculations\n');

    const historyResult = await client.callTool({
      name: 'get_history',
      arguments: {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      }
    });

    const historyData = JSON.parse(historyResult.content[0].text);
    console.log('Raw history data retrieved:');
    console.log(`  Total items: ${historyData.data.length}`);

    // Count by type manually
    let episodeCount = 0;
    let movieCount = 0;
    const uniqueShows = new Set();
    const uniqueMovies = new Set();
    const showEpisodeCounts = new Map();

    for (const item of historyData.data) {
      if (item.type === 'episode') {
        episodeCount++;
        if (item.show) {
          uniqueShows.add(item.show.ids.trakt);
          const showId = item.show.ids.trakt;
          showEpisodeCounts.set(showId, (showEpisodeCounts.get(showId) || 0) + 1);
        }
      } else if (item.type === 'movie') {
        movieCount++;
        if (item.movie) {
          uniqueMovies.add(item.movie.ids.trakt);
        }
      }
    }

    // Find most watched show manually
    let maxCount = 0;
    let mostWatchedShowId = null;
    for (const [showId, count] of showEpisodeCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostWatchedShowId = showId;
      }
    }

    console.log('\nManual calculation results:');
    console.log(`  Total items: ${historyData.data.length}`);
    console.log(`  Episodes: ${episodeCount}`);
    console.log(`  Movies: ${movieCount}`);
    console.log(`  Unique shows: ${uniqueShows.size}`);
    console.log(`  Unique movies: ${uniqueMovies.size}`);
    console.log(`  Most watched show episodes: ${maxCount}`);

    // Now get summary and compare
    const summaryResult = await client.callTool({
      name: 'summarize_history',
      arguments: {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      }
    });

    const summaryData = JSON.parse(summaryResult.content[0].text);
    console.log('\nSummarize_history results:');
    console.log(`  Total watched: ${summaryData.data.total_watched}`);
    console.log(`  Total episodes: ${summaryData.data.total_episodes}`);
    console.log(`  Unique shows: ${summaryData.data.unique_shows}`);
    console.log(`  Unique movies: ${summaryData.data.unique_movies}`);
    if (summaryData.data.most_watched_show) {
      console.log(`  Most watched show: ${summaryData.data.most_watched_show.show.title}`);
      console.log(`  Episodes watched: ${summaryData.data.most_watched_show.episodes_watched}`);
    }

    console.log('\nVERIFICATION:');
    const totalMatch = summaryData.data.total_watched === historyData.data.length;
    const episodesMatch = summaryData.data.total_episodes === episodeCount;
    const showsMatch = summaryData.data.unique_shows === uniqueShows.size;
    const moviesMatch = summaryData.data.unique_movies === uniqueMovies.size;

    console.log(`  Total watched matches: ${totalMatch ? 'PASS' : 'FAIL'}`);
    console.log(`  Total episodes matches: ${episodesMatch ? 'PASS' : 'FAIL'}`);
    console.log(`  Unique shows matches: ${showsMatch ? 'PASS' : 'FAIL'}`);
    console.log(`  Unique movies matches: ${moviesMatch ? 'PASS' : 'FAIL'}`);

    if (summaryData.data.most_watched_show && maxCount > 0) {
      const mostWatchedMatch = summaryData.data.most_watched_show.episodes_watched === maxCount;
      console.log(`  Most watched count matches: ${mostWatchedMatch ? 'PASS' : 'FAIL'}`);
    }

    console.log('\n' + '='.repeat(50));

    // Test 2: Check recent_activity calculations
    console.log('\n\nTEST 2: Recent Activity Calculations\n');

    const allHistoryResult = await client.callTool({
      name: 'get_history',
      arguments: {}
    });

    const allHistory = JSON.parse(allHistoryResult.content[0].text);

    // Calculate manually
    const now = Date.now();
    const day24h = 24 * 60 * 60 * 1000;
    const week = 7 * day24h;
    const month = 30 * day24h;

    let manual24h = 0;
    let manualWeek = 0;
    let manualMonth = 0;

    for (const item of allHistory.data) {
      const watchedTime = new Date(item.watched_at).getTime();
      const age = now - watchedTime;

      if (age <= day24h) manual24h++;
      if (age <= week) manualWeek++;
      if (age <= month) manualMonth++;
    }

    console.log('Manual recent activity calculation:');
    console.log(`  Last 24h: ${manual24h}`);
    console.log(`  Last week: ${manualWeek}`);
    console.log(`  Last month: ${manualMonth}`);

    const allSummaryResult = await client.callTool({
      name: 'summarize_history',
      arguments: {}
    });

    const allSummary = JSON.parse(allSummaryResult.content[0].text);
    console.log('\nSummarize_history recent activity:');
    console.log(`  Last 24h: ${allSummary.data.recent_activity.last_24h}`);
    console.log(`  Last week: ${allSummary.data.recent_activity.last_week}`);
    console.log(`  Last month: ${allSummary.data.recent_activity.last_month}`);

    console.log('\nVERIFICATION:');
    console.log(`  Last 24h matches: ${allSummary.data.recent_activity.last_24h === manual24h ? 'PASS' : 'FAIL'}`);
    console.log(`  Last week matches: ${allSummary.data.recent_activity.last_week === manualWeek ? 'PASS' : 'FAIL'}`);
    console.log(`  Last month matches: ${allSummary.data.recent_activity.last_month === manualMonth ? 'PASS' : 'FAIL'}`);

    console.log('\n' + '='.repeat(50));
    console.log('\n\nCALCULATION VERIFICATION COMPLETE\n');

    await client.close();

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

verifyCalculations().catch(console.error);

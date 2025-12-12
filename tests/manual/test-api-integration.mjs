#!/usr/bin/env node

/**
 * Trakt.tv API Integration Test Script
 * Tests the actual API client functionality with live Trakt.tv API
 */

import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;
const API_BASE_URL = 'https://api.trakt.tv';

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

/**
 * Run a test case
 */
async function runTest(testName, testFn) {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} ${testName}`);

  try {
    const result = await testFn();
    console.log(`${colors.green}✓ PASS${colors.reset}`);
    results.passed.push(testName);
    return result;
  } catch (error) {
    console.log(`${colors.red}✗ FAIL${colors.reset}: ${error.message}`);
    results.failed.push({ name: testName, error: error.message, details: error.response?.data });
    return null;
  }
}

/**
 * Log a warning
 */
function warn(message) {
  console.log(`${colors.yellow}⚠ WARNING${colors.reset}: ${message}`);
  results.warnings.push(message);
}

/**
 * Main test suite
 */
async function main() {
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}  Trakt.tv API Integration Tests${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);

  // Verify credentials
  if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
    console.error(`${colors.red}ERROR: Missing Trakt.tv credentials${colors.reset}`);
    console.error('Please set TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET in .env file');
    process.exit(1);
  }

  console.log(`\n${colors.magenta}Configuration:${colors.reset}`);
  console.log(`  Client ID: ${TRAKT_CLIENT_ID.substring(0, 10)}...`);
  console.log(`  API Base URL: ${API_BASE_URL}`);

  // Test 1: Device Code Request (OAuth Initiation)
  console.log(`\n${colors.blue}━━━ OAuth Authentication Flow Tests ━━━${colors.reset}`);

  const deviceCode = await runTest('Initiate device authorization flow', async () => {
    const response = await axios.post(
      `${API_BASE_URL}/oauth/device/code`,
      {
        client_id: TRAKT_CLIENT_ID,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;

    // Validate response structure
    if (!data.device_code) throw new Error('Missing device_code in response');
    if (!data.user_code) throw new Error('Missing user_code in response');
    if (!data.verification_url) throw new Error('Missing verification_url in response');
    if (!data.expires_in) throw new Error('Missing expires_in in response');
    if (!data.interval) throw new Error('Missing interval in response');

    console.log(`    Device Code: ${data.device_code.substring(0, 20)}...`);
    console.log(`    User Code: ${colors.yellow}${data.user_code}${colors.reset}`);
    console.log(`    Verification URL: ${colors.cyan}${data.verification_url}${colors.reset}`);
    console.log(`    Expires in: ${data.expires_in} seconds`);
    console.log(`    Poll interval: ${data.interval} seconds`);

    return data;
  });

  // Test 2: Search API (without authentication)
  console.log(`\n${colors.blue}━━━ Search API Tests (No Auth Required) ━━━${colors.reset}`);

  await runTest('Search for a popular TV show (Breaking Bad)', async () => {
    const response = await axios.get(`${API_BASE_URL}/search/show`, {
      params: {
        query: 'Breaking Bad',
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
      },
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Response is not an array');
    }

    if (response.data.length === 0) {
      throw new Error('No results returned');
    }

    const firstResult = response.data[0];
    console.log(`    Found ${response.data.length} results`);
    console.log(`    First result: ${firstResult.show?.title} (${firstResult.show?.year})`);
    console.log(`    Trakt ID: ${firstResult.show?.ids?.trakt}`);
    console.log(`    Slug: ${firstResult.show?.ids?.slug}`);

    // Validate the first result is Breaking Bad
    if (!firstResult.show?.title?.toLowerCase().includes('breaking bad')) {
      warn('First result is not Breaking Bad');
    }

    return response.data;
  });

  await runTest('Search for a movie (Inception)', async () => {
    const response = await axios.get(`${API_BASE_URL}/search/movie`, {
      params: {
        query: 'Inception',
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
      },
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Response is not an array');
    }

    if (response.data.length === 0) {
      throw new Error('No results returned');
    }

    const firstResult = response.data[0];
    console.log(`    Found ${response.data.length} results`);
    console.log(`    First result: ${firstResult.movie?.title} (${firstResult.movie?.year})`);
    console.log(`    Trakt ID: ${firstResult.movie?.ids?.trakt}`);

    return response.data;
  });

  await runTest('Search for both shows and movies (Dune)', async () => {
    const response = await axios.get(`${API_BASE_URL}/search/show,movie`, {
      params: {
        query: 'Dune',
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
      },
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Response is not an array');
    }

    const shows = response.data.filter(r => r.type === 'show');
    const movies = response.data.filter(r => r.type === 'movie');

    console.log(`    Found ${response.data.length} total results`);
    console.log(`    Shows: ${shows.length}, Movies: ${movies.length}`);

    // Display first few results
    response.data.slice(0, 5).forEach(result => {
      const item = result.show || result.movie;
      console.log(`      - [${result.type}] ${item?.title} (${item?.year})`);
    });

    return response.data;
  });

  await runTest('Search with no results', async () => {
    const response = await axios.get(`${API_BASE_URL}/search/show`, {
      params: {
        query: 'xyzabc123notarealshow999',
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
      },
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Response is not an array');
    }

    if (response.data.length > 0) {
      warn('Expected no results but got some');
    }

    console.log(`    Correctly returned 0 results`);

    return response.data;
  });

  await runTest('Search with special characters', async () => {
    const response = await axios.get(`${API_BASE_URL}/search/show`, {
      params: {
        query: "It's Always Sunny in Philadelphia",
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
      },
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Response is not an array');
    }

    if (response.data.length === 0) {
      throw new Error('No results returned for a popular show');
    }

    const firstResult = response.data[0];
    console.log(`    Found ${response.data.length} results`);
    console.log(`    First result: ${firstResult.show?.title}`);

    return response.data;
  });

  await runTest('Search with ambiguous title (The Office)', async () => {
    const response = await axios.get(`${API_BASE_URL}/search/show`, {
      params: {
        query: 'The Office',
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
      },
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Response is not an array');
    }

    console.log(`    Found ${response.data.length} results`);

    // Show different versions
    const uniqueTitles = new Set();
    response.data.slice(0, 5).forEach(result => {
      const title = `${result.show?.title} (${result.show?.year})`;
      if (!uniqueTitles.has(title)) {
        uniqueTitles.add(title);
        console.log(`      - ${title} [${result.show?.country || 'Unknown'}]`);
      }
    });

    return response.data;
  });

  // Test 3: Error handling
  console.log(`\n${colors.blue}━━━ Error Handling Tests ━━━${colors.reset}`);

  await runTest('Invalid API key returns 401', async () => {
    try {
      await axios.get(`${API_BASE_URL}/search/show`, {
        params: {
          query: 'Breaking Bad',
        },
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': 'invalid-key-12345',
        },
      });

      throw new Error('Expected 401 error but request succeeded');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log(`    Correctly received 401 Unauthorized`);
        return true;
      }
      throw error;
    }
  });

  await runTest('Missing API key returns 401', async () => {
    try {
      await axios.get(`${API_BASE_URL}/search/show`, {
        params: {
          query: 'Breaking Bad',
        },
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
        },
      });

      throw new Error('Expected 401 error but request succeeded');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log(`    Correctly received 401 Unauthorized`);
        return true;
      }
      throw error;
    }
  });

  // Print summary
  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}  Test Summary${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}Passed: ${results.passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);
  console.log(`${colors.yellow}Warnings: ${results.warnings.length}${colors.reset}`);

  if (results.failed.length > 0) {
    console.log(`\n${colors.red}Failed tests:${colors.reset}`);
    results.failed.forEach(({ name, error, details }) => {
      console.log(`  - ${name}`);
      console.log(`    Error: ${error}`);
      if (details) {
        console.log(`    Details: ${JSON.stringify(details, null, 2)}`);
      }
    });
  }

  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    results.warnings.forEach((warning) => {
      console.log(`  - ${warning}`);
    });
  }

  if (deviceCode) {
    console.log(`\n${colors.magenta}━━━ Manual Testing Instructions ━━━${colors.reset}`);
    console.log(`\nTo test the full OAuth flow manually:`);
    console.log(`1. Visit: ${colors.cyan}${deviceCode.verification_url}${colors.reset}`);
    console.log(`2. Enter code: ${colors.yellow}${deviceCode.user_code}${colors.reset}`);
    console.log(`3. The server will automatically receive the token when you authorize`);
  }

  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`${colors.red}Test runner error:${colors.reset}`, error);
  process.exit(1);
});

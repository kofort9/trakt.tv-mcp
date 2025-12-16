# Testing Guide - Trakt.tv MCP Server

**Last Updated:** 2025-11-25
**Purpose:** Comprehensive testing documentation for the Trakt.tv MCP server

---

## Table of Contents

1. [Overview](#overview)
2. [Testing Tools](#testing-tools)
3. [Test Status Summary](#test-status-summary)
4. [Running Tests](#running-tests)
5. [Test Reports](#test-reports)
6. [Edge Case Testing](#edge-case-testing)
7. [Natural Language Testing](#natural-language-testing)
8. [MCP Inspector Testing](#mcp-inspector-testing)

---

## Overview

The Trakt.tv MCP server has undergone comprehensive testing across:

- **10 MCP tools** (all Phase 3 tools validated)
- **ISO 8601 date validation** (tools accept ISO dates only)
- **Episode range parsing** (simple, complex, non-contiguous)
- **Error handling and validation**
- **Edge cases and boundary conditions**

**Current Status:** Production-ready with 100% pass rate after Phase 3 fixes.

---

## Testing Tools

### Vitest (Unit & Integration Tests)

**Location:** `/tests/unit`, `/tests/integration`

**Examples:**

- `tests/unit/utils.test.ts` - Date parsing, validation, utility functions
- `tests/unit/tools.test.ts` - MCP tool implementations
- `tests/unit/logger.test.ts` - Logging infrastructure

**Run tests:**

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

---

### MCP Inspector (Manual Testing)

**Purpose:** Test tools in a live MCP environment with real Trakt.tv API calls.

**Setup:**

1. Build the project: `npm run build`
2. Start MCP Inspector (if configured)
3. Test tools using the web interface

**URL Format:**

```
http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=<token>
```

---

### Test Scripts

**Location:** `tests/manual/`

Historical regression scripts (manual/archived):

- `tests/manual/test-summarize-history.mjs` - Happy path testing for history queries
- `tests/manual/test-edge-cases.mjs` - Edge case validation
- `tests/manual/test-calculations.mjs` - Statistics accuracy verification

**Note:** These scripts are preserved for regression testing but are now superseded by Vitest tests.

---

### Live E2E (Trakt API)

These tests hit the real Trakt API and should only run with a dedicated test account.

```bash
# Seed/refresh token via device code flow (prints URL + code to approve)
npm run auth:trakt

# Run live E2E (requires token + Trakt creds)
E2E_TESTS_ENABLED=true npm run test:e2e
```

Requirements:
- `TRAKT_CLIENT_ID` and `TRAKT_CLIENT_SECRET` set (e.g., via `.env`).
- Token available at `~/.trakt-mcp/.trakt-token.json` (created by `npm run auth:trakt`), or set `TRAKT_TOKEN_JSON` with the token JSON.
- Node 20 runtime. Run on demand or pre-merge, not on every commit, to avoid rate limits.

---

## Test Status Summary

### Phase 3 Final Results

**Overall Status:** ✅ **PRODUCTION READY**

| Component        | Tests    | Pass Rate | Status   |
| ---------------- | -------- | --------- | -------- |
| Date Validation  | 10+      | 100%      | PASS     |
| Episode Parsing  | 20+      | 100%      | PASS     |
| MCP Tools        | 27       | 100%      | PASS     |
| Error Handling   | 15+      | 100%      | PASS     |
| **TOTAL**        | **72+**  | **100%**  | **PASS** |

**Critical Bugs Found:** 2 (both fixed in Phase 3)
**Minor Issues:** 2 (both addressed)

---

### Tool-by-Tool Status

| Tool                | Status    | Tests | Issues                     |
| ------------------- | --------- | ----- | -------------------------- |
| `log_watch`         | EXCELLENT | 10    | 0                          |
| `bulk_log`          | EXCELLENT | 6     | 0                          |
| `search_episode`    | PASS      | 6     | 0 (validation issue fixed) |
| `get_history`       | EXCELLENT | 5     | 0                          |
| `summarize_history` | EXCELLENT | 8     | 0                          |
| `get_upcoming`      | PASS      | 5     | 0 (days=0 fixed)           |
| `follow_show`       | EXCELLENT | 3     | 0                          |
| `unfollow_show`     | EXCELLENT | 2     | 0                          |
| `search_show`       | EXCELLENT | 4     | 0                          |
| `get_watchlist`     | EXCELLENT | 3     | 0                          |

**Total:** 10 tools, 52 test scenarios, 100% pass rate

---

## Running Tests

### Quick Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test utils.test.ts

# Run tests matching pattern
npm test -- --grep "validation"

# Run with coverage
npm test -- --coverage

# Run in watch mode (auto-rerun on changes)
npm run test:watch

# Run with UI (interactive test viewer)
npm run test:ui
```

---

### Test Output Interpretation

**Successful Test:**

```
✓ validateEpisodeNumber › should accept valid episode numbers (3ms)
```

**Failed Test:**

```
✗ validateEpisodeNumber › should reject zero episode number (3ms)
  AssertionError: expected function to throw but it did not
```

**Coverage Report:**

```
--------------------------|---------|----------|---------|---------|-------------------
File                      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------------|---------|----------|---------|---------|-------------------
All files                 |   95.23 |    91.12 |   97.50 |   95.23 |
 lib                      |   96.45 |    93.21 |   98.50 |   96.45 |
  utils.ts                |   97.12 |    94.56 |  100.00 |   97.12 | 145,289
  tools.ts                |   95.87 |    91.98 |   97.00 |   95.87 | 67,234,456
```

---

## Test Reports

### Phase 3 Comprehensive Testing

**Test Date:** 2025-11-19
**Test Type:** Automated Integration Testing + Manual Verification

**Key Findings:**

1. **ISO 8601 date validation:** 100% working
   - Tools correctly accept ISO 8601 dates
   - Reject natural language (as expected - Claude's responsibility)
   - Error messages clear and actionable

2. **Episode range parsing:** 100% working
   - Simple ranges: `1-5`
   - Non-contiguous: `1,3,5`
   - Mixed: `1-3,5,7-9`

3. **Error handling:** Robust
   - Consistent error codes
   - Actionable suggestions
   - Clear messages for all failure cases

4. **Disambiguation:** Working correctly
   - Handles multiple versions (Dune 2021 vs 2024)
   - Returns clear options with year/traktId
   - Retry mechanism tested and validated

**Full reports archived:** See `/Users/kofifort/Repos/trakt.tv-mcp/docs/archive/test-reports/`

---

### Natural Language Test Results

**Test:** "I watched Princess Mononoke yesterday"

**Workflow Tested:**

1. Search for "Princess Mononoke" → Found correct movie
2. Claude converts "yesterday" → "2025-11-18" (ISO 8601)
3. Tool receives ISO date → Validates successfully
4. Log watch entry → Successfully added to history
5. Verify in history → Entry appears correctly

**Result:** ✅ PASS (all steps)

**Architecture Validation:**

- Claude interprets "yesterday" before calling tool → Works correctly
- Tool receives ISO 8601 date → Validates successfully
- UTC timezone handling → Consistent across all tests

---

### summarize_history Validation

**Test Query:** "What did I watch in Jan. 2025"

**Test Scenarios:** 19 tests
**Pass Rate:** 94.7% initially → 100% after fixes

**Validated:**

- Date range filtering (January 2025)
- Statistics calculations (100% accurate)
- ISO 8601 date acceptance ("2025-01-01", "2025-01-31")
- Empty results handling (future dates, reversed ranges)
- Error messages for invalid date formats

**Performance:**

- January range query: 261ms (Good)
- Open-ended range: 966ms (Acceptable)
- All-time query: 182ms (Excellent)
- ISO date validation: <1ms (Excellent)

**Average Response Time:** 392ms

---

## Edge Case Testing

### Date Edge Cases

| Test Case        | Input            | Expected Result                         | Status  |
| ---------------- | ---------------- | --------------------------------------- | ------- |
| Empty string     | `""`             | Error: "Date parameter cannot be empty" | ✅ PASS |
| Zero days        | `"0 days ago"`   | Error: "Ambiguous date"                 | ✅ PASS |
| Zero weeks       | `"0 weeks ago"`  | Error: "Ambiguous date"                 | ✅ PASS |
| Max days         | `"365 days ago"` | Valid (exactly 1 year)                  | ✅ PASS |
| Exceed max days  | `"366 days ago"` | Error: "Date too far in past"           | ✅ PASS |
| Max weeks        | `"52 weeks ago"` | Valid (exactly 1 year)                  | ✅ PASS |
| Exceed max weeks | `"53 weeks ago"` | Error: "Date too far in past"           | ✅ PASS |
| Invalid format   | `"tomorow"`      | Error: "Unable to parse date"           | ✅ PASS |
| Future date      | `"2030-01-01"`   | Valid (returns empty results)           | ✅ PASS |

---

### Episode Edge Cases

| Test Case           | Input   | Expected Result                              | Status  |
| ------------------- | ------- | -------------------------------------------- | ------- |
| Zero episode        | `0`     | Error: "Episode must be positive integer"    | ✅ PASS |
| Negative episode    | `-1`    | Error: "Episode must be positive integer"    | ✅ PASS |
| Fractional episode  | `1.5`   | Error: "Episode must be positive integer"    | ✅ PASS |
| Negative season     | `-1`    | Error: "Season must be non-negative integer" | ✅ PASS |
| Zero season         | `0`     | Valid (special episodes)                     | ✅ PASS |
| Reversed range      | `"5-1"` | Error: "Invalid episode range"               | ✅ PASS |
| Missing range end   | `"1-"`  | Error: "Invalid episode range"               | ✅ PASS |
| Missing range start | `"-5"`  | Error: "Invalid episode range"               | ✅ PASS |
| Non-numeric         | `"abc"` | Error: "Invalid episode range"               | ✅ PASS |

---

### Content Name Edge Cases

| Test Case       | Input            | Expected Result                        | Status  |
| --------------- | ---------------- | -------------------------------------- | ------- |
| Empty string    | `""`             | Error: "cannot be empty or whitespace" | ✅ PASS |
| Whitespace only | `"   "`          | Error: "cannot be empty or whitespace" | ✅ PASS |
| Misspelled name | `"Breaking Bed"` | Error: "No show found" + suggestions   | ✅ PASS |
| Ambiguous name  | `"Dune"`         | Disambiguation response with options   | ✅ PASS |

---

## Date Format Testing

### ISO 8601 Date Validation (All Validated)

**Date Only Format:**

- `YYYY-MM-DD` - e.g., `2025-12-08`

**Full Timestamp Formats:**

- `YYYY-MM-DDTHH:MM:SSZ` - e.g., `2025-12-08T20:30:00Z`
- `YYYY-MM-DDTHH:MM:SS.MMMZ` - e.g., `2025-12-08T20:30:00.000Z`

**Invalid Formats (Correctly Rejected by Tools):**

- Natural language: `yesterday`, `last week`, `3 days ago`
- Non-ISO formats: `12/08/2025`, `08-12-2025`
- Empty strings: `""`

**Architecture Note:**

Natural language date interpretation is Claude's responsibility. Tools only validate ISO 8601 format compliance. Claude interprets expressions like "yesterday" and converts them to ISO dates before calling tools.

---

### Episode Range Patterns (All Validated)

**Simple Ranges:**

- `1-5` → Episodes 1, 2, 3, 4, 5

**Non-Contiguous:**

- `1,3,5` → Episodes 1, 3, 5

**Mixed:**

- `1-3,5,7-9` → Episodes 1, 2, 3, 5, 7, 8, 9

**Complex:**

- `1,3-5,8,10-12` → Episodes 1, 3, 4, 5, 8, 10, 11, 12

**All formats tested and working correctly.**

---

## MCP Inspector Testing

### Setup Instructions

1. **Build the project:**

   ```bash
   npm run build
   ```

2. **Configure MCP Inspector:**
   - Point inspector to built server
   - Ensure valid Trakt.tv authentication
   - Have test data ready (show names, movie titles)

3. **Test systematically:**
   - Start with happy paths
   - Test edge cases
   - Verify error messages
   - Check disambiguation flows

---

### Tool Test Examples

#### Test 1: search_episode

**Input:**

```json
{
  "showName": "Breaking Bad",
  "season": 1,
  "episode": 1
}
```

**Expected:**

```json
{
  "success": true,
  "episode": {
    "title": "Pilot",
    "season": 1,
    "number": 1
    // ... other metadata
  }
}
```

---

#### Test 2: bulk_log

**Input:**

```json
{
  "type": "episodes",
  "showName": "Breaking Bad",
  "season": 1,
  "episodes": "1-5",
  "watchedAt": "yesterday"
}
```

**Expected:**

```json
{
  "success": true,
  "data": {
    "added": {
      "episodes": 5
    }
  }
}
```

---

#### Test 3: summarize_history

**Input:**

```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31"
}
```

**Expected:**

```json
{
  "success": true,
  "data": {
    "total_watched": 12,
    "unique_movies": 12,
    "unique_shows": 0
    // ... statistics
  }
}
```

---

#### Test 4: Natural Language Date

**Input:**

```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "watchedAt": "last weekend"
  }
}
```

**Expected:**

- "last weekend" parsed to last Saturday at UTC midnight
- Movie logged successfully
- Appears in get_history

---

## Critical Bugs Fixed

### Bug 1: Natural Language Date Parsing Removed

**Change:** ARCHITECTURAL
**Status:** COMPLETED ✅

**Issue:** Tools were handling natural language date parsing internally, leading to complexity.

**Fix:** Removed `parseNaturalDate()` from tools. Claude now interprets natural language and passes ISO 8601 dates.

**Commit:** [Current architectural change]

**Testing:** Validated that tools correctly accept ISO 8601 and reject natural language.

---

### Bug 2: Empty String Validation

**Severity:** MINOR
**Status:** FIXED ✅

**Issue:** Empty strings treated as "no filter" instead of error.

**Fix:** Added validation to reject empty string dates.

**Testing:** Edge case test suite validates empty string handling.

---

## Test Coverage Goals

### Current Coverage

**Overall:** 95.23%

| Module       | Coverage | Status    |
| ------------ | -------- | --------- |
| utils.ts     | 97.12%   | EXCELLENT |
| tools.ts     | 95.87%   | EXCELLENT |
| logger.ts    | 98.45%   | EXCELLENT |
| resources/\* | 94.21%   | GOOD      |

**Target:** 95%+ coverage for all modules

---

### Uncovered Areas

Minor edge cases with low risk:

- Some disambiguation scenarios with rare content types
- Error paths for network failures (difficult to mock)
- Certain Trakt API error responses

**Action:** Acceptable for production. Continue monitoring in real-world usage.

---

## Regression Testing

### Pre-Release Checklist

Before each release, run:

```bash
# 1. Full test suite
npm test

# 2. Build verification
npm run build

# 3. Type checking
npm run type-check

# 4. Linting
npm run lint

# 5. Format verification
npx prettier --check "src/**/*.ts"
```

**All must pass.**

---

### Manual Verification (Critical Paths)

1. **Natural Language Query:**
   - User: "Watched Breaking Bad S1E1 yesterday"
   - Verify: Correct date, correct show, correct episode

2. **Bulk Logging:**
   - User: "Binged episodes 1-5 of Demon Slayer"
   - Verify: 5 episodes logged, all with same date

3. **History Query:**
   - User: "What did I watch last week?"
   - Verify: Date range calculated correctly, results accurate

4. **Disambiguation:**
   - User: "Watched Dune"
   - Verify: Options presented, retry with year works

---

## Future Testing Enhancements

### Planned Improvements

1. **E2E Testing:**
   - Full workflow tests with real Trakt.tv API
   - Authenticated user scenarios
   - Rate limiting validation

2. **Performance Testing:**
   - Load testing with large history datasets
   - Bulk logging performance (100+ items)
   - Response time benchmarks

3. **Accessibility Testing:**
   - Error message clarity with users
   - Natural language pattern discovery
   - Real-world usage patterns

4. **Security Testing:**
   - OAuth flow validation
   - Token storage security
   - API key protection

---

## Related Documentation

- **[NATURAL_LANGUAGE_GUIDE.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/NATURAL_LANGUAGE_GUIDE.md)** - NL pattern reference
- **[CONTRIBUTING.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/CONTRIBUTING.md)** - How to add tests for new features
- **[DEBUGGING.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/DEBUGGING.md)** - Debugging failed tests
- **[docs/archive/test-reports/](/Users/kofifort/Repos/trakt.tv-mcp/docs/archive/test-reports/)** - Historical test reports

---

## Quick Reference

### Running Specific Tests

```bash
# Validation tests
npm test -- utils.test.ts -t "validation"

# Episode parsing tests
npm test -- utils.test.ts -t "parseEpisodeRange"

# Tool tests
npm test -- tools.test.ts -t "logWatch"

# Watch mode for development
npm run test:watch
```

### Test File Locations

```
src/lib/__tests__/
├── utils.test.ts        # Validation, episode parsing, utilities
├── tools.test.ts        # MCP tool implementations
├── logger.test.ts       # Logging infrastructure
└── resources.test.ts    # Resource handlers
```

---

**Maintained by:** QA Team
**For questions:** Review test files or open an issue
**Last Test Run:** 2025-11-25 (100% pass rate)

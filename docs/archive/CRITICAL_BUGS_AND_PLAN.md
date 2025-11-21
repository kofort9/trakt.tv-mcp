# Critical Bugs Found & Remediation Plan

**Date:** November 18, 2025
**Severity:** HIGH - Production-blocking bugs discovered during testing
**Status:** REQUIRES IMMEDIATE ATTENTION

---

## Critical Bugs Discovered

### Bug #1: Wrong Content Logged ("Triangle" instead of "Princess Mononoke")
**Severity:** 🔴 CRITICAL
**Impact:** Data corruption - users get wrong content in watch history

**Issue:**
When logging "Princess Mononoke", the system logged a different movie called "Triangle" instead.

**Root Cause:**
The `logWatch` function blindly takes the **first search result** without verification:

```typescript
// Line 153-164 in src/lib/tools.ts
const searchResults = await client.search(movieName, 'movie');
const movie = searchResults[0].movie;  // ❌ BLINDLY TAKES FIRST RESULT

// Then logs it without confirming it's the right one
const historyData = {
  movies: [{ watched_at, ids: { trakt: movie.ids.trakt } }]
};
```

**Why This is Critical:**
- Corrupts user's watch history with wrong content
- User has no way to know it's wrong (silent failure)
- Breaks trust in the system
- Violates data integrity

**Evidence:**
User reported: "I see that some show called Triangle was added to my history" when testing Princess Mononoke logging.

---

### Bug #2: Date Parsing Issue ("yesterday" → wrong date)
**Severity:** 🔴 CRITICAL
**Impact:** Wrong dates in watch history

**Issue:**
User reports: "yesterday" was parsed as "last Sunday" instead of the actual previous day.

**Root Cause Investigation Needed:**
The code looks correct (using `date-fns` library):

```typescript
// Line 23-24 in src/lib/utils.ts
if (lowerInput === 'yesterday') {
  return format(startOfDay(subDays(now, 1)), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}
```

**Possible Causes:**
1. `date-fns` timezone issue (UTC vs local time)
2. Server running in different timezone
3. `startOfDay` behavior with timezone
4. `now` being calculated incorrectly

**Evidence:**
- User expected: November 17, 2025 (yesterday from Nov 18)
- System logged: Previous Sunday (need exact date to confirm)

---

### Bug #3: No Observability/Debugging Capability
**Severity:** 🟡 HIGH
**Impact:** Cannot debug issues, no audit trail

**Issue:**
No logging of MCP requests/responses makes debugging impossible.

**Evidence:**
- Cannot verify what was actually sent to Trakt API
- Cannot see which search result was selected
- Cannot trace why "Triangle" was logged instead of "Princess Mononoke"
- No audit trail for troubleshooting

---

## Immediate Action Plan

### Phase 1: Critical Bug Fixes (URGENT - Today)

#### Fix #1: Add Confirmation for Search Results
**Priority:** 🔴 CRITICAL
**Effort:** 2-4 hours
**Owner:** Backend team

**Implementation:**

```typescript
// NEW APPROACH: Don't blindly log first result
export async function logWatch(client, args) {
  // ... existing validation ...

  if (type === 'movie') {
    const searchResults = await client.search(movieName, 'movie');

    if (searchResults.length === 0) {
      return createToolError('NOT_FOUND', `No movie found: "${movieName}"`);
    }

    // 🔴 CRITICAL FIX: Don't blindly use first result
    // Option A: Require exact match
    const exactMatch = searchResults.find(r =>
      r.movie?.title.toLowerCase() === movieName.toLowerCase()
    );

    if (!exactMatch) {
      // Return search results for user confirmation
      return createToolError(
        'CONFIRMATION_NEEDED',
        `Found ${searchResults.length} movies. Please specify which one:`,
        {
          results: searchResults.slice(0, 5).map(r => ({
            title: r.movie.title,
            year: r.movie.year,
            trakt_id: r.movie.ids.trakt
          }))
        }
      );
    }

    // Use exact match
    const movie = exactMatch.movie;

    // Add logging for debugging
    console.error(`[LOG_WATCH] Logging movie: ${movie.title} (${movie.year}) - Trakt ID: ${movie.ids.trakt}`);

    // ... rest of logging ...
  }
}
```

**Alternative Approach (more user-friendly):**

```typescript
// Option B: Add trakt_id parameter to bypass search
export async function logWatch(client, args: {
  type: 'episode' | 'movie';
  movieName?: string;
  movieTraktId?: number;  // NEW: Direct ID specification
  year?: number;          // NEW: Year filter
  // ... other params
}) {
  if (type === 'movie') {
    let movie;

    if (movieTraktId) {
      // Direct ID provided - no search needed
      movie = await client.getMovie(movieTraktId);
    } else {
      // Search with optional year filter
      const searchResults = await client.search(movieName, 'movie');

      if (year) {
        // Filter by year
        const yearMatches = searchResults.filter(r => r.movie?.year === year);
        if (yearMatches.length === 1) {
          movie = yearMatches[0].movie;
        } else {
          return confirmationNeededError(yearMatches);
        }
      } else {
        // Exact title match required
        const exactMatches = searchResults.filter(r =>
          r.movie?.title.toLowerCase() === movieName.toLowerCase()
        );

        if (exactMatches.length === 1) {
          movie = exactMatches[0].movie;
        } else {
          return confirmationNeededError(searchResults);
        }
      }
    }

    // Log with confirmation
    console.error(`[LOG_WATCH] Confirmed: ${movie.title} (${movie.year}) ID:${movie.ids.trakt}`);
  }
}
```

#### Fix #2: Fix Date Parsing
**Priority:** 🔴 CRITICAL
**Effort:** 1-2 hours
**Owner:** Backend team

**Investigation Steps:**

1. Add debug logging to see actual dates
2. Test in different timezones
3. Verify `date-fns` configuration

**Proposed Fix:**

```typescript
export function parseNaturalDate(input: string): string {
  const now = new Date();
  const lowerInput = input.toLowerCase().trim();

  // DEBUG LOGGING
  console.error(`[DATE_PARSE] Input: "${input}"`);
  console.error(`[DATE_PARSE] Current time: ${now.toISOString()}`);
  console.error(`[DATE_PARSE] Timezone offset: ${now.getTimezoneOffset()}`);

  if (lowerInput === 'yesterday') {
    // Use explicit date math instead of date-fns
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const result = yesterday.toISOString();

    console.error(`[DATE_PARSE] Result: ${result}`);
    console.error(`[DATE_PARSE] Result (local): ${yesterday.toLocaleDateString()}`);

    return result;
  }

  // ... rest of function
}
```

**Alternative: Use UTC explicitly:**

```typescript
import { UTCDate } from '@date-fns/utc';

export function parseNaturalDate(input: string): string {
  const now = new UTCDate();  // Force UTC
  const lowerInput = input.toLowerCase().trim();

  if (lowerInput === 'yesterday') {
    const yesterday = new UTCDate(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    return yesterday.toISOString();
  }

  // ... rest
}
```

#### Fix #3: Add Request/Response Logging
**Priority:** 🔴 CRITICAL (for debugging)
**Effort:** 2-3 hours
**Owner:** Backend team

**Implementation:**

```typescript
// NEW FILE: src/lib/logger.ts
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

const LOG_DIR = join(os.homedir(), '.trakt-mcp', 'logs');
const LOG_FILE = join(LOG_DIR, 'mcp-requests.log');

export interface LogEntry {
  timestamp: string;
  type: 'request' | 'response' | 'error';
  tool: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export function logMCPRequest(tool: string, args: unknown) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: 'request',
    tool,
    data: args,
  };

  appendLog(entry);

  // Also log to stderr for immediate visibility
  console.error(`[MCP_REQUEST] ${tool}`, JSON.stringify(args));
}

export function logMCPResponse(tool: string, response: unknown, metadata?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: 'response',
    tool,
    data: response,
    metadata,
  };

  appendLog(entry);
  console.error(`[MCP_RESPONSE] ${tool}`, JSON.stringify({
    success: (response as any).success,
    metadata
  }));
}

export function logMCPError(tool: string, error: Error) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: 'error',
    tool,
    data: {
      message: error.message,
      stack: error.stack,
    },
  };

  appendLog(entry);
  console.error(`[MCP_ERROR] ${tool}`, error.message);
}

function appendLog(entry: LogEntry) {
  try {
    if (!existsSync(LOG_DIR)) {
      // Create log directory
      const fs = await import('fs/promises');
      await fs.mkdir(LOG_DIR, { recursive: true });
    }

    const line = JSON.stringify(entry) + '\n';
    appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    // Fail silently - don't break tool execution
    console.error('[LOGGER_ERROR]', err);
  }
}

// Utility to read logs
export function readRecentLogs(count = 100): LogEntry[] {
  try {
    if (!existsSync(LOG_FILE)) return [];

    const content = readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n');
    const recent = lines.slice(-count);

    return recent.map(line => JSON.parse(line));
  } catch {
    return [];
  }
}
```

**Usage in tools:**

```typescript
import { logMCPRequest, logMCPResponse, logMCPError } from './logger.js';

export async function logWatch(client, args) {
  logMCPRequest('log_watch', args);

  try {
    // ... implementation ...

    const result = createToolSuccess(response);

    logMCPResponse('log_watch', result, {
      movieTitle: movie.title,
      movieYear: movie.year,
      traktId: movie.ids.trakt,
      watchedAt: watched_at,
    });

    return result;
  } catch (error) {
    logMCPError('log_watch', error);
    throw error;
  }
}
```

---

### Phase 2: Add Explainability & Observability (This Week)

#### Enhancement #1: Add Debug Tool
**Priority:** 🟡 HIGH
**Effort:** 2-3 hours

**New Tool: `debug_last_request`**

```typescript
// Add to tools list
{
  name: 'debug_last_request',
  description: 'Get debug information about the last MCP request for troubleshooting',
  inputSchema: {
    type: 'object',
    properties: {
      tool: {
        type: 'string',
        description: 'Tool name to get debug info for (optional - defaults to last request)',
      },
      count: {
        type: 'number',
        description: 'Number of recent requests to show (default: 10)',
      },
    },
  },
}

// Implementation
export async function debugLastRequest(args: { tool?: string; count?: number }) {
  const logs = readRecentLogs(args.count || 10);

  const filtered = args.tool
    ? logs.filter(l => l.tool === args.tool)
    : logs;

  return createToolSuccess({
    count: filtered.length,
    requests: filtered,
  });
}
```

#### Enhancement #2: Add Dry-Run Mode
**Priority:** 🟡 HIGH
**Effort:** 1-2 hours

```typescript
// Add dryRun parameter to log_watch
export async function logWatch(client, args: {
  // ... existing params
  dryRun?: boolean;  // NEW: Preview what will be logged
}) {
  // ... search logic ...

  if (args.dryRun) {
    return createToolSuccess({
      dryRun: true,
      preview: {
        action: 'Would log to Trakt history',
        content: {
          type,
          title: movie?.title || show?.title,
          year: movie?.year || show?.year,
          traktId: movie?.ids.trakt || show?.ids.trakt,
          watchedAt: watched_at,
        },
        searchResults: searchResults.slice(0, 5).map(r => ({
          title: r.movie?.title || r.show?.title,
          year: r.movie?.year || r.show?.year,
          score: r.score,
        })),
      },
    });
  }

  // ... actual logging ...
}
```

#### Enhancement #3: Add Confirmation Mode
**Priority:** 🟡 HIGH
**Effort:** 3-4 hours

**Two-step logging process:**

1. User: "Log Princess Mononoke as watched yesterday"
2. System: Search + Preview
   ```json
   {
     "confirmation_required": true,
     "preview": {
       "title": "Princess Mononoke",
       "year": 1997,
       "trakt_id": 96,
       "watched_at": "2025-11-17T00:00:00.000Z"
     },
     "alternatives": [
       { "title": "Princess Mononoke", "year": 1997 },
       { "title": "Triangle", "year": 2009 }
     ]
   }
   ```
3. User confirms or selects alternative
4. System logs confirmed item

---

### Phase 3: Implement High-Priority Recommendations (Next Sprint)

#### Recommendation #1: Parameter Aliasing
**From Test Report - HIGH Priority**

```typescript
// Accept both 'title' and 'movieName'
export async function logWatch(client, args: {
  type: 'episode' | 'movie';
  title?: string;        // NEW: Natural language alias
  movieName?: string;
  showName?: string;
  // ...
}) {
  // Normalize parameters
  if (args.title && !args.movieName && type === 'movie') {
    args.movieName = args.title;
  }
  if (args.title && !args.showName && type === 'episode') {
    args.showName = args.title;
  }

  // ... rest of function
}
```

#### Recommendation #2: Year Filter Support

```typescript
// Add year parameter to search and log
{
  name: 'log_watch',
  inputSchema: {
    properties: {
      // ... existing
      year: {
        type: 'number',
        description: 'Year of release (helps disambiguate, e.g., Dune 1984 vs 2021)',
      },
    },
  },
}
```

#### Recommendation #3: Improved Error Messages

```typescript
// Before
return createToolError('NOT_FOUND', `No movie found matching "${movieName}"`);

// After
return createToolError(
  'NOT_FOUND',
  `No movie found matching "${movieName}". Try:\n` +
  `1. Check spelling\n` +
  `2. Use search_show to find correct title\n` +
  `3. Add year (e.g., "Dune 2021")`
);
```

---

## Testing Requirements

### Before Merging Fixes

1. **Unit Tests for Date Parsing**
   ```typescript
   describe('parseNaturalDate', () => {
     it('should parse "yesterday" as 1 day ago', () => {
       const result = parseNaturalDate('yesterday');
       const expected = new Date();
       expected.setDate(expected.getDate() - 1);
       expected.setHours(0, 0, 0, 0);

       expect(result).toBe(expected.toISOString());
     });
   });
   ```

2. **Integration Tests for Search Confirmation**
   ```typescript
   describe('logWatch', () => {
     it('should not log wrong movie when search returns multiple results', async () => {
       // Mock search returning [Triangle, Princess Mononoke]
       const result = await logWatch(client, {
         type: 'movie',
         movieName: 'Princess Mononoke',
       });

       // Should require confirmation, not blindly log first result
       expect(result.success).toBe(false);
       expect(result.error.code).toBe('CONFIRMATION_NEEDED');
     });
   });
   ```

3. **Logging Verification**
   ```typescript
   describe('logging', () => {
     it('should log all MCP requests', () => {
       logWatch(client, { type: 'movie', movieName: 'Test' });

       const logs = readRecentLogs(1);
       expect(logs[0].tool).toBe('log_watch');
       expect(logs[0].type).toBe('request');
     });
   });
   ```

---

## Rollout Plan

### Week 1 (This Week)
- Day 1: Fix critical bugs (#1, #2, #3)
- Day 2: Add logging and debug tools
- Day 3: Test fixes thoroughly
- Day 4: Add dry-run mode
- Day 5: Deploy to staging

### Week 2 (Next Week)
- Implement parameter aliasing
- Add year filter support
- Improve error messages
- Add confirmation flow
- Deploy to production

---

## Success Metrics

### Critical Bug Fixes
- ✅ No wrong content logged (0% error rate)
- ✅ Date parsing 100% accurate
- ✅ All requests logged for debugging

### Observability
- ✅ Can trace every MCP request
- ✅ Can debug issues from logs
- ✅ Users can verify what will be logged (dry-run)

### UX Improvements
- ✅ Parameter naming intuitive
- ✅ Disambiguation flow prevents errors
- ✅ Error messages actionable

---

## Risk Assessment

### High Risk (Without Fixes)
- Data corruption (wrong content in history)
- User trust loss
- Inability to debug issues
- Production incidents

### Low Risk (After Fixes)
- Slightly more complex logging flow
- Need user confirmation for ambiguous searches
- More verbose responses

---

## Conclusion

**Current Status:** 🔴 NOT PRODUCTION READY

The discovered bugs are **production-blocking** and must be fixed before any user-facing deployment.

**With Fixes Applied:** ✅ Production Ready

After implementing the critical fixes, the system will be:
- Reliable (no wrong content logged)
- Debuggable (full request/response logging)
- Transparent (users see what will be logged)
- Safe (confirmation for ambiguous searches)

**Estimated Time to Production Ready:** 3-5 days

---

**Document Owner:** QA Engineering Team
**Last Updated:** November 18, 2025
**Status:** ACTIVE - Requires immediate action

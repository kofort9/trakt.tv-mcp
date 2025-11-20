# Immediate Fixes Required - QA Report

**Date:** 2025-11-20
**Priority:** P1 (High) - Must fix before production deployment
**Estimated Total Effort:** 1-2 hours

---

## Issue #1: Parallel Test Assertions (BLOCKING)

**Priority:** P0 (Critical - Blocks CI/CD)
**File:** `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/__tests__/parallel.test.ts`
**Impact:** 4 test failures preventing clean test runs
**Effort:** 5 minutes

### Problem

JavaScript's `.sort()` method sorts lexicographically by default, not numerically:

```javascript
[10, 2, 4, 6, 8].sort()  // Returns: [10, 2, 4, 6, 8] (wrong)
[10, 2, 4, 6, 8].sort((a, b) => a - b)  // Returns: [2, 4, 6, 8, 10] (correct)
```

### Failed Tests

1. Line 31: `should execute operations in parallel`
2. Line 75: `should handle partial failures`
3. (2 more similar failures)

### Fix

Replace all instances of:
```typescript
expect(succeeded.sort()).toEqual([2, 4, 6, 8, 10])
```

With:
```typescript
expect(succeeded.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10])
```

### Verification

```bash
npm test -- parallel.test.ts
```

Should show 0 failures after fix.

---

## Issue #2: Debug Tool - Include Cache Metrics by Default

**Priority:** P1 (High - UX Improvement)
**File:** `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/tools.ts`
**Impact:** Users miss cache performance data when debugging
**Effort:** 10 minutes

### Problem

Cache metrics are excluded from debug tool responses unless explicitly requested via `includeMetrics: true`. This reduces debugging visibility for cache-related performance issues.

### Current Code (Line ~775)

```typescript
export async function debugLastRequest(
  _client: TraktClient,
  args: {
    limit?: number;
    toolName?: string;
    method?: string;
    statusCode?: number;
    includeMetrics?: boolean;  // ❌ Defaults to undefined (falsy)
  }
): Promise<ToolSuccess<{ logs: RequestLog[]; metrics?: ToolMetrics[] }> | ToolError> {
  const { limit = 10, toolName, method, statusCode, includeMetrics = true } = args;
  // ...
}
```

### Fix

**Option 1: Change default in function signature**
```typescript
includeMetrics?: boolean = true  // ✅ Default to true
```

**Option 2: Change destructuring default**
```typescript
const { limit = 10, toolName, method, statusCode, includeMetrics = true } = args;
// Already correct! ✅
```

**Verify:** Check line ~775 - the fix may already be in place. If `includeMetrics = true` in destructuring, this is already fixed.

### Also Update Schema Documentation

File: `/Users/kofifort/Repos/trakt.tv-mcp/src/index.ts` (around debug tool schema)

```typescript
includeMetrics: {
  type: 'boolean',
  description: 'Include performance metrics (default: true)',  // ✅ Update description
},
```

### Verification

```typescript
// Test that metrics are included by default
const result = await debugLastRequest(client, { limit: 5 });
expect(result.data.metrics).toBeDefined();
```

---

## Issue #3: Add Error-Only Filter

**Priority:** P1 (High - UX Improvement)
**Files:**
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/tools.ts`
- `/Users/kofifort/Repos/trakt.tv-mcp/src/index.ts`
**Impact:** Users need to know HTTP status codes to filter errors
**Effort:** 15 minutes

### Problem

To see only errors, users must manually specify `statusCode` parameters like:
```typescript
debug_last_request({ statusCode: 404 })  // Only 404s
debug_last_request({ statusCode: 500 })  // Only 500s
```

There's no easy "show me all errors" filter.

### Solution

Add `errorsOnly?: boolean` parameter that filters for all status codes >= 400.

### Implementation

**Step 1: Update `debugLastRequest` function signature**

File: `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/tools.ts` (line ~765)

```typescript
export async function debugLastRequest(
  _client: TraktClient,
  args: {
    limit?: number;
    toolName?: string;
    method?: string;
    statusCode?: number;
    includeMetrics?: boolean;
    errorsOnly?: boolean;  // ✅ NEW parameter
  }
): Promise<ToolSuccess<{ logs: RequestLog[]; metrics?: ToolMetrics[] }> | ToolError> {
  const {
    limit = 10,
    toolName,
    method,
    statusCode,
    includeMetrics = true,
    errorsOnly = false  // ✅ NEW
  } = args;

  // Get logs with filters
  const logs = logger.getRecentLogs(limit, {
    toolName,
    method,
    statusCode,
  });

  // ✅ NEW: Apply error filter if requested
  let filteredLogs = logs;
  if (errorsOnly) {
    filteredLogs = logs.filter(log => log.statusCode && log.statusCode >= 400);
  }

  // Use filteredLogs for rest of function...
```

**Step 2: Update MCP tool schema**

File: `/Users/kofifort/Repos/trakt.tv-mcp/src/index.ts` (debug tool definition)

```typescript
{
  name: 'debug_last_request',
  description: '...',
  inputSchema: {
    type: 'object',
    properties: {
      // ... existing properties ...
      errorsOnly: {  // ✅ NEW
        type: 'boolean',
        description: 'Filter to show only error responses (status code >= 400). Default: false',
      },
    },
  },
}
```

**Step 3: Update message formatting**

```typescript
// Format response with helpful message
let message: string;
if (filteredLogs.length === 0) {
  message = 'No request logs found matching the specified filters.';
} else {
  const parts = [`Found ${filteredLogs.length} request${filteredLogs.length === 1 ? '' : 's'}`];
  if (toolName) parts.push(`for tool "${toolName}"`);
  if (method) parts.push(`with method ${method}`);
  if (statusCode) parts.push(`with status ${statusCode}`);
  if (errorsOnly) parts.push(`(errors only)`);  // ✅ NEW
  message = parts.join(' ') + '.';
  // ...
}
```

### Tests

Add to `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/__tests__/tools.test.ts`:

```typescript
describe('debugLastRequest', () => {
  // ... existing tests ...

  it('should filter to errors only', async () => {
    // Create mix of success and error logs
    const requestId1 = logger.generateCorrelationId();
    const requestId2 = logger.generateCorrelationId();
    const requestId3 = logger.generateCorrelationId();

    logger.logRequest({
      correlationId: requestId1,
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://api.trakt.tv/shows/1',
      headers: {},
      statusCode: 200,
      durationMs: 100,
    });

    logger.logRequest({
      correlationId: requestId2,
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://api.trakt.tv/shows/2',
      headers: {},
      statusCode: 404,
      error: 'Not found',
      durationMs: 50,
    });

    logger.logRequest({
      correlationId: requestId3,
      timestamp: new Date().toISOString(),
      method: 'POST',
      url: 'https://api.trakt.tv/sync/history',
      headers: {},
      statusCode: 500,
      error: 'Internal server error',
      durationMs: 150,
    });

    const result = await debugLastRequest(client, { errorsOnly: true });

    expect(result.success).toBe(true);
    const logs = (result as ToolSuccess<{ logs: RequestLog[] }>).data.logs;

    expect(logs).toHaveLength(2);  // Only 404 and 500
    expect(logs.every(log => log.statusCode && log.statusCode >= 400)).toBe(true);
  });

  it('should combine errorsOnly with other filters', async () => {
    // Test that errorsOnly works with toolName filter
    const result = await debugLastRequest(client, {
      toolName: 'log_watch',
      errorsOnly: true
    });

    expect(result.success).toBe(true);
    const logs = (result as ToolSuccess<{ logs: RequestLog[] }>).data.logs;

    // All logs should be from log_watch AND have error status codes
    expect(logs.every(log =>
      log.toolName === 'log_watch' &&
      log.statusCode &&
      log.statusCode >= 400
    )).toBe(true);
  });
});
```

### Verification

```bash
npm test -- tools.test.ts
```

Manual test:
```bash
# Using MCP client
mcp-client call debug_last_request '{"errorsOnly": true, "limit": 10}'
```

---

## Issue #4: Fix File Logging Directory Creation Warning

**Priority:** P2 (Medium - Test Reliability)
**File:** `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/logger.ts`
**Impact:** Warning messages in test output, potential edge case failures
**Effort:** 30 minutes

### Problem

```
Failed to write to log file: Error: ENOENT: no such file or directory
```

Directory existence check in constructor may not be sufficient if filesystem operations are delayed or if directory is deleted during runtime.

### Current Code (Lines ~265-274)

```typescript
private ensureLogDirectory(): void {
  try {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create log directory:', error);
    this.enableFileLogging = false;
  }
}
```

### Fix

Add directory check directly in `writeToFile()` method:

```typescript
private writeToFile(log: RequestLog): void {
  try {
    // ✅ Ensure directory exists before every write (defensive)
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }

    const logLine = JSON.stringify(log) + '\n';
    const logSize = Buffer.byteLength(logLine);

    // Check if rotation needed
    if (this.currentFileSize + logSize > this.maxFileSize) {
      this.currentLogFile = this.getNewLogFileName();
      this.currentFileSize = 0;
    }

    fs.appendFileSync(this.currentLogFile, logLine);
    this.currentFileSize += logSize;
  } catch (error) {
    console.error('Failed to write to log file:', error);
    // Don't disable file logging permanently - just skip this write
    // The next write will try again
  }
}
```

### Alternative (More Performant)

Check directory only if write fails:

```typescript
private writeToFile(log: RequestLog): void {
  try {
    const logLine = JSON.stringify(log) + '\n';
    const logSize = Buffer.byteLength(logLine);

    // Check if rotation needed
    if (this.currentFileSize + logSize > this.maxFileSize) {
      this.currentLogFile = this.getNewLogFileName();
      this.currentFileSize = 0;
    }

    try {
      fs.appendFileSync(this.currentLogFile, logLine);
      this.currentFileSize += logSize;
    } catch (writeError) {
      // ✅ If write fails, try creating directory and retry once
      if ((writeError as NodeJS.ErrnoException).code === 'ENOENT') {
        this.ensureLogDirectory();
        fs.appendFileSync(this.currentLogFile, logLine);
        this.currentFileSize += logSize;
      } else {
        throw writeError;  // Re-throw other errors
      }
    }
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}
```

### Tests

Add to `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/__tests__/logger.test.ts`:

```typescript
it('should handle missing log directory gracefully', () => {
  const tempDir = path.join(os.tmpdir(), `test-missing-dir-${Date.now()}`);
  const testLogger = new Logger({
    logDirectory: tempDir,
    enableFileLogging: true,
  });

  // Delete directory after logger created
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir, { recursive: true });
  }

  // This should not throw
  expect(() => {
    testLogger.logRequest({
      correlationId: 'test-123',
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://test.com',
      headers: {},
      durationMs: 100,
    });
  }).not.toThrow();

  // Directory should be re-created
  expect(fs.existsSync(tempDir)).toBe(true);

  // Cleanup
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir, { recursive: true });
  }
});
```

---

## Testing Checklist

After applying all fixes, run:

```bash
# 1. Run full test suite
npm test

# Expected: 438/438 tests pass (0 failures)

# 2. Run parallel tests specifically
npm test -- parallel.test.ts

# Expected: 12/12 tests pass

# 3. Run logger tests specifically
npm test -- logger.test.ts

# Expected: 23/23 tests pass (no warnings)

# 4. Run tools tests (including new error filter tests)
npm test -- tools.test.ts

# Expected: All tests pass with new error filter tests

# 5. Check test coverage
npm run test:coverage

# Expected: >95% coverage maintained
```

---

## Implementation Priority

**Order of implementation:**

1. **Issue #1: Fix Parallel Tests** (5 min) - BLOCKING
2. **Issue #3: Add Error Filter** (15 min) - HIGH VALUE
3. **Issue #2: Verify Cache Metrics Default** (5 min) - LIKELY ALREADY FIXED
4. **Issue #4: Fix File Logging** (30 min) - OPTIONAL (TEST ONLY)

**Total Time: ~55 minutes for all P1 issues**

---

## Success Criteria

After fixes:
- ✅ 438/438 tests passing (100%)
- ✅ No warnings in test output
- ✅ Debug tool includes cache metrics by default
- ✅ Users can filter errors with `errorsOnly: true`
- ✅ File logging robust against directory deletion

---

**Prepared By:** QA Engineer
**Date:** 2025-11-20
**For:** Backend Implementation Team

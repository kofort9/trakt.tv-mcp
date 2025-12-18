# Test Scenarios: Sync Queue Improvements

**Branch:** `fix/sync-queue-improvements`
**Test Queue:** `/Users/kofifort/.trakt-mcp/pending-logs.jsonl` (20 entries)
**Date:** 2025-12-16

## Overview

This document provides comprehensive test scenarios for validating the sync queue improvements, including:
1. Interactive mode workflow (confirm/skip/next mechanism)
2. Auto-confirm ambiguity handling (skip vs pick first)
3. TraktClient `_retryCount` null safety
4. Langfuse tracing integration

---

## 1. Interactive Mode Tests

### Test 1.1: Step Through Multiple Entries Sequentially

**Objective:** Verify that interactive mode presents entries one at a time with proper workflow control.

**Preconditions:**
- Queue has at least 3 pending entries
- `autoConfirm: false` (default)

**Test Steps:**
1. Call `sync_logwatch_queue` with `autoConfirm: false`
2. Verify response structure:
   ```json
   {
     "success": true,
     "data": {
       "action_required": "confirm_entry",
       "currentEntry": {
         "id": "...",
         "rawText": "...",
         "capturedAt": "...",
         "parsed": { ... }
       },
       "remaining": 19,
       "totalEntries": 20,
       "message": "Ready to process 20 entries. First entry requires confirmation..."
     }
   }
   ```
3. Search for the content using parsed data
4. Log the entry using `log_watch` tool
5. Mark as synced using `queue.markSynced(id, resolvedContent)`
6. Call `sync_logwatch_queue` again
7. Verify it returns the next entry with `remaining: 18`

**Expected Results:**
- First call returns entry 1 of 20
- Subsequent calls return next entries sequentially
- `remaining` count decrements correctly
- Progress indicator shows "Entry X of Y"

**Test Data:**
```
Entry 1: "i watched columbus 2017 last week"
Entry 2: "i watched Paterson (2016)"
Entry 3: "I watched all of the pirates of the carrabien movies last month"
```

---

### Test 1.2: Confirm Entry and Verify Sync

**Objective:** Confirm an entry successfully syncs to Trakt and updates queue status.

**Test Steps:**
1. Get first entry via interactive mode
2. Parse: `"i watched columbus 2017 last week"`
3. Search: `client.search("columbus", "movie", 2017)`
4. Verify unique match found
5. Log to Trakt: `log_watch({ type: 'movie', movieName: 'Columbus', year: 2017, watchedAt: '...' })`
6. Mark synced: `queue.markSynced(entry.id, { type: 'movie', traktId: 123, title: 'Columbus', year: 2017 })`
7. Read queue file directly to verify status change

**Expected Results:**
- Entry status changes from `"pending"` to `"synced"`
- Entry includes `syncedAt` timestamp
- Entry includes `resolvedContent` with correct metadata
- Entry logged to Trakt watch history
- Next call to `sync_logwatch_queue` skips this entry

**Verification:**
```bash
grep "aa8caa52-d1bd-4c36-b521-262b8b462b98" /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

---

### Test 1.3: Skip Entry and Mark as Skipped

**Objective:** User chooses to skip an entry; verify it's marked correctly and excluded from future syncs.

**Test Steps:**
1. Get entry: `"I watched all of the pirates of the carrabien movies last month"`
2. User decides this is too vague (typo: "carrabien")
3. Mark skipped: `queue.markSkipped(entry.id)`
4. Verify queue file shows `status: "skipped"`
5. Call `sync_logwatch_queue` again
6. Verify skipped entry is not returned

**Expected Results:**
- Entry status changes to `"skipped"`
- Entry excluded from pending list
- Next entry presented instead
- Archive operation preserves skipped entries

---

### Test 1.4: Progress Indicator Accuracy

**Objective:** Verify progress indicator shows "Entry X of Y" correctly throughout the workflow.

**Test Steps:**
1. Start with 20 pending entries
2. Process first entry → "Entry 1 of 20, remaining: 19"
3. Process second entry → "Entry 2 of 20, remaining: 18"
4. Skip third entry → "Entry 3 of 20, remaining: 17"
5. Continue until completion

**Expected Results:**
- Total count stays constant (20)
- Current entry increments (1, 2, 3...)
- Remaining count decrements (19, 18, 17...)
- Math: `current + remaining = total`

---

### Test 1.5: Unknown Type Entries (Search Without Type Filter)

**Objective:** Verify entries with `type: 'unknown'` trigger search without type filter.

**Test Steps:**
1. Create entry: `"I've seen forest gump"` (ambiguous - could be movie or TV)
2. Parse result: `{ type: 'unknown', title: 'forest gump', ... }`
3. Verify search call: `client.search('forest gump', undefined)` (no type filter)
4. Verify search returns results from both movies and shows
5. Present disambiguation if needed

**Expected Results:**
- Parser returns `type: 'unknown'` for ambiguous entries
- Search executes without type filter
- User can manually disambiguate based on results

**Test Data:**
```
Unknown type entries:
- "I've seen forest gump" (movie, but parser may not infer)
- "I've seen pulp fiction" (movie)
- "I've seen titanic before" (movie)
```

---

## 2. Auto-Confirm Ambiguity Tests

### Test 2.1: Unique Match → Auto-Sync

**Objective:** Entry with unique match syncs automatically in auto-confirm mode.

**Test Steps:**
1. Entry: `"i watched Paterson (2016)"`
2. Call `sync_logwatch_queue({ autoConfirm: true })`
3. Search returns single result with high score
4. Verify entry syncs automatically
5. Check result: `{ synced: 1, failed: 0, skipped: 0 }`

**Expected Results:**
- Entry syncs without user intervention
- Status marked as `"synced"`
- Resolved content stored with metadata

**Test Data:**
```json
{
  "rawText": "i watched Paterson (2016)",
  "parsed": {
    "title": "Paterson",
    "year": 2016,
    "type": "movie",
    "confidence": "high"
  }
}
```

---

### Test 2.2: Multiple Matches → Skip with Reason

**Objective:** Entry with ambiguous matches skips in auto-confirm mode instead of auto-selecting first result.

**Test Steps:**
1. Entry: `"I just finished Chungking Express"` (no year)
2. Call `sync_logwatch_queue({ autoConfirm: true })`
3. Search returns multiple results (different years, remakes, etc.)
4. **OLD BEHAVIOR:** Auto-selects first result
5. **NEW BEHAVIOR:** Skips entry with reason "Multiple matches found"
6. Verify result: `{ synced: 0, failed: 0, skipped: 1 }`

**Expected Results:**
- Entry marked as `"skipped"`
- `failureReason` set to "Multiple matches found - requires manual disambiguation"
- Entry preserved for later manual review
- User notified in `ambiguousEntries` array

**Test Data:**
```json
{
  "rawText": "I just finished Chungking Express",
  "searchResults": [
    { "title": "Chungking Express", "year": 1994, "score": 95 },
    { "title": "Chungking Express", "year": 2020, "score": 85 }
  ]
}
```

---

### Test 2.3: Verify ambiguousEntries Array

**Objective:** Auto-confirm mode returns list of ambiguous entries for user review.

**Test Steps:**
1. Queue contains:
   - 5 unique matches
   - 3 ambiguous entries
   - 2 not found
2. Call `sync_logwatch_queue({ autoConfirm: true })`
3. Verify result structure:
   ```json
   {
     "synced": 5,
     "skipped": 3,
     "failed": 2,
     "ambiguousEntries": [
       { "id": "...", "rawText": "...", "matches": [...] }
     ]
   }
   ```

**Expected Results:**
- `ambiguousEntries` array populated with skipped entries
- Each entry includes match details for manual review
- Clear separation between failed (not found) and skipped (ambiguous)

---

### Test 2.4: Low Confidence Entries → Skip

**Objective:** Entries with `confidence: 'low'` or missing title skip automatically.

**Test Steps:**
1. Entry: `"I watched"` (no title)
2. Parse result: `{ title: '', confidence: 'low' }`
3. Call `sync_logwatch_queue({ autoConfirm: true })`
4. Verify skipped with reason: "Low confidence or missing title"

**Expected Results:**
- Skipped without attempting search
- Reason clearly stated
- No API calls made

**Test Data:**
```
Low confidence entries from queue:
- None in current queue (all have titles)
```

---

## 3. Error Handling Tests

### Test 3.1: Network Error Before Request Sent (No Config)

**Objective:** Verify system doesn't crash when TraktClient has no retry config.

**Preconditions:**
- TraktClient initialized with `_retryCount = undefined`
- Network error occurs before retry logic

**Test Steps:**
1. Mock network failure at initialization
2. Call `sync_logwatch_queue({ autoConfirm: true })`
3. Verify graceful error handling
4. Check error message and logging

**Expected Results:**
- No crash or unhandled exception
- Error message: "Failed to sync queue: [network error details]"
- Entry marked as `"failed"` with reason
- Queue file integrity maintained

**Null Safety Fix:**
```typescript
// OLD (crashes if _retryCount is null/undefined)
if (this._retryCount > 0) { ... }

// NEW (safe)
if (this._retryCount && this._retryCount > 0) { ... }
```

---

### Test 3.2: 429 Rate Limit → Retry

**Objective:** Verify 429 errors trigger retry mechanism.

**Test Steps:**
1. Mock API to return 429 on first request
2. Mock API to succeed on second request
3. Call `sync_logwatch_queue({ autoConfirm: true })`
4. Verify retry behavior
5. Check Langfuse trace for retry events

**Expected Results:**
- First request fails with 429
- System waits (exponential backoff)
- Second request succeeds
- Entry syncs successfully
- Langfuse trace shows retry metadata

**Verification:**
- Check Langfuse dashboard for `sync_logwatch_queue` trace
- Verify `retryCount` metadata
- Verify `rateLimitHit: true` flag

---

### Test 3.3: Invalid Queue Entry → Handle Gracefully

**Objective:** Verify malformed queue entries don't break sync process.

**Test Steps:**
1. Add invalid entry to queue:
   ```json
   {"id": "invalid", "incomplete": true}
   ```
2. Call `sync_logwatch_queue({ autoConfirm: true })`
3. Verify system skips invalid entry
4. Verify other entries process normally

**Expected Results:**
- Invalid entry skipped silently
- Other entries process without interruption
- Error logged but not thrown
- Queue file cleaned up during archive

---

### Test 3.4: Search Returns Empty Results

**Objective:** Entry not found on Trakt → marked as failed.

**Test Steps:**
1. Entry: `"I watched nonexistent movie 9999"`
2. Search returns empty array `[]`
3. Verify entry marked as failed
4. Reason: "No search results"

**Expected Results:**
- Status: `"failed"`
- `failureReason`: "No search results"
- Entry preserved for manual retry
- User can edit rawText and retry

---

### Test 3.5: API Timeout

**Objective:** API request times out → entry marked as failed.

**Test Steps:**
1. Mock API to timeout after 30s
2. Verify timeout handling
3. Check error message
4. Verify entry can be retried later

**Expected Results:**
- Entry marked as `"failed"`
- Reason: "Request timeout"
- No data corruption
- Retry possible after fixing network

---

## 4. Franchise Pattern Tests (Future Enhancement)

### Test 4.1: Detect Franchise Pattern

**Objective:** Identify when user requests logging multiple movies in a franchise.

**Test Steps:**
1. Entry: `"All the matrix movies"`
2. Parser detects franchise pattern
3. Flag: `isFranchisePattern: true`
4. Extract franchise name: `"matrix"`

**Expected Results:**
- Parser returns: `{ isFranchisePattern: true, franchiseName: 'matrix' }`
- Search executed for franchise collection
- Multiple results returned
- User presented with list to select from

**Test Data:**
```
Franchise patterns in queue:
- "I've seen all the matrix movies"
- "I've seen All the jurassic Park movies"
- "I've seen All the lion king movies"
- "I've seen all the toy story movies"
- "I've seen all the men in black movies"
- "I've seen all the bad boy's movies"
- "I've seen All the home alone movies"
- "I watched all of the pirates of the carrabien movies last month"
```

**Future Implementation:**
```typescript
interface ParsedWatchEntry {
  // ... existing fields
  isFranchisePattern?: boolean;
  franchiseName?: string;
  franchiseHint?: string; // "all the X movies"
}
```

---

### Test 4.2: Marvel Universe Pattern

**Objective:** Handle complex franchise requests with temporal context.

**Test Steps:**
1. Entry: `"I've seen all the marvel movies but I dont have a watch day you can use within a month of it coming out"`
2. Detect franchise: Marvel Cinematic Universe
3. Parse temporal hint: "within a month of release"
4. Suggest solution: bulk import with release dates

**Expected Results:**
- Franchise detected: MCU
- Temporal strategy: use release dates ± 1 month
- User presented with bulk import preview
- Option to adjust dates manually

---

## 5. Langfuse Tracing Tests

### Test 5.1: Trace Creation

**Objective:** Verify Langfuse trace created for `sync_logwatch_queue` operations.

**Test Steps:**
1. Call `sync_logwatch_queue({ autoConfirm: true })`
2. Check Langfuse dashboard for new trace
3. Verify trace includes:
   - Tool name: `sync_logwatch_queue`
   - Total entries count
   - Result counts (synced/failed/skipped)
   - Duration

**Expected Results:**
- Trace appears in Langfuse within 5 seconds
- Metadata correct
- Parent-child spans for search/log operations

---

### Test 5.2: Error Tracing

**Objective:** Verify errors captured in Langfuse traces.

**Test Steps:**
1. Trigger network error during sync
2. Check Langfuse trace
3. Verify error details captured

**Expected Results:**
- Error event logged
- Stack trace included
- Error message sanitized (no secrets)

---

## 6. End-to-End Integration Tests

### Test 6.1: Full Queue Sync (Auto-Confirm)

**Objective:** Process entire 20-entry queue in auto-confirm mode.

**Test Steps:**
1. Backup current queue file
2. Call `sync_logwatch_queue({ autoConfirm: true })`
3. Wait for completion
4. Verify results summary
5. Check archive file created
6. Verify failed/skipped entries preserved

**Expected Results:**
- All entries processed
- Archive created: `/Users/kofifort/.trakt-mcp/archive/pending-logs-[timestamp].jsonl`
- Queue file contains only failed/skipped entries
- Synced entries logged to Trakt
- Summary accurate

**Verification Commands:**
```bash
# Check archive
ls -la /Users/kofifort/.trakt-mcp/archive/

# Count entries by status
grep '"status":"synced"' /Users/kofifort/.trakt-mcp/archive/pending-logs-*.jsonl | wc -l
grep '"status":"failed"' /Users/kofifort/.trakt-mcp/pending-logs.jsonl | wc -l
grep '"status":"skipped"' /Users/kofifort/.trakt-mcp/pending-logs.jsonl | wc -l
```

---

### Test 6.2: Full Queue Sync (Interactive)

**Objective:** Process queue entry-by-entry in interactive mode.

**Test Steps:**
1. Backup queue
2. Loop:
   a. Call `sync_logwatch_queue()`
   b. Get current entry
   c. Search and log
   d. Mark synced/skipped
   e. Repeat until `remaining: 0`
3. Verify all entries processed

**Expected Results:**
- Each entry presented individually
- Progress visible throughout
- User has full control over decisions
- Final state same as auto-confirm (but with manual verification)

---

### Test 6.3: Dry Run Preview

**Objective:** Verify dry run shows summary without syncing.

**Test Steps:**
1. Call `sync_logwatch_queue({ dryRun: true })`
2. Verify response includes:
   - `formattedTable` with visual summary
   - Entry statuses (resolved/ambiguous/not found)
   - No actual syncing occurred
3. Verify queue file unchanged

**Expected Results:**
- Summary table displayed
- Counts accurate
- No Trakt API calls made (check Langfuse)
- Queue file unmodified

**Sample Output:**
```
╔══════════════════════════════════════════════════════════╗
║              BULK SYNC SUMMARY (20 entries)             ║
╠══════════════════════════════════════════════════════════╣
║ Status     │ Count │ %      │ Action Needed            ║
╟────────────┼───────┼────────┼──────────────────────────╢
║ Resolved   │  12   │  60%   │ Ready to sync            ║
║ Ambiguous  │   5   │  25%   │ Manual disambiguation    ║
║ Not Found  │   3   │  15%   │ Check spelling/year      ║
║ Errors     │   0   │   0%   │ -                        ║
╚══════════════════════════════════════════════════════════╝
```

---

## 7. Test Execution Plan

### Phase 1: Unit Tests (MCP Inspector)
1. Test each tool in isolation
2. Verify parameter validation
3. Check error handling
4. Validate response formats

### Phase 2: Integration Tests (Real MCP Server)
1. Test with actual queue file
2. Verify file I/O operations
3. Test Trakt API integration
4. Validate state changes

### Phase 3: Manual QA Testing
1. Test interactive workflow
2. Test edge cases
3. Verify UX (messages, progress, errors)
4. Check Langfuse traces

### Phase 4: Regression Testing
1. Verify existing tests still pass
2. Check for breaking changes
3. Validate backward compatibility

---

## 8. Test Data Reference

### Current Queue File Analysis

**Total Entries:** 20
**Status Distribution:**
- Pending: 20
- Synced: 0
- Failed: 0
- Skipped: 0

**Content Type Breakdown:**
- Movies (single): 10
- Movies (franchise): 8
- TV Shows: 0
- Unknown: 2

**Challenges:**
- Typos: "carrabien" (entry 3), "forest gump" (entry 9)
- Franchise patterns: 8 entries
- Missing years: Several entries
- Vague dates: "last week", "last month", "within a month of release"

**Easy Wins (High Confidence):**
1. `"i watched Paterson (2016)"` - Year specified
2. `"i watched columbus 2017 last week"` - Year specified
3. `"I just watched enemy (2013)"` - Year specified
4. `"I just finished Still walking (2009)"` - Year specified
5. `"I just finished in the mood for love (2000)"` - Year specified

**Ambiguous (Need Disambiguation):**
1. `"I just finished Chungking Express"` - No year
2. `"I just finished 2046"` - Title is a year!
3. `"last night i watched F1 the movie"` - Recent, may not be indexed
4. `"I've seen titanic before"` - Multiple versions?

**Franchise Patterns (Future Work):**
1. All Matrix movies
2. All Pirates of the Caribbean movies
3. All Marvel movies
4. All Home Alone movies
5. All Jurassic Park movies
6. All Lion King movies
7. All Toy Story movies
8. All Men in Black movies
9. All Bad Boys movies

---

## 9. Success Criteria

### Interactive Mode
- [ ] Entries presented one at a time
- [ ] Progress indicator accurate
- [ ] Confirm/skip workflow functional
- [ ] Unknown type entries search without filter

### Auto-Confirm Mode
- [ ] Unique matches sync automatically
- [ ] Ambiguous matches skip (not auto-select)
- [ ] `ambiguousEntries` array populated
- [ ] Low confidence entries skip

### Error Handling
- [ ] Null safety fix prevents crashes
- [ ] 429 errors trigger retry
- [ ] Invalid entries handled gracefully
- [ ] Network errors don't corrupt data

### Langfuse Tracing
- [ ] Traces created for all operations
- [ ] Metadata accurate
- [ ] Errors captured
- [ ] Performance metrics recorded

### Data Integrity
- [ ] Queue file never corrupted
- [ ] Archive preserves all entries
- [ ] Failed/skipped entries retained
- [ ] Synced entries removable

---

## 10. Manual Testing Checklist

```bash
# 1. Backup current queue
cp /Users/kofifort/.trakt-mcp/pending-logs.jsonl /Users/kofifort/.trakt-mcp/pending-logs.jsonl.backup

# 2. Test dry run
# (Via MCP tool)
sync_logwatch_queue({ dryRun: true })

# 3. Test showSummary
sync_logwatch_queue({ showSummary: true })

# 4. Test interactive mode
sync_logwatch_queue({ autoConfirm: false })
# Process one entry manually
sync_logwatch_queue({ autoConfirm: false })
# Verify next entry shown

# 5. Test auto-confirm
sync_logwatch_queue({ autoConfirm: true })

# 6. Verify archive created
ls -la /Users/kofifort/.trakt-mcp/archive/

# 7. Check Langfuse dashboard
# Open https://cloud.langfuse.com/
# Search for "sync_logwatch_queue" traces

# 8. Restore backup if needed
cp /Users/kofifort/.trakt-mcp/pending-logs.jsonl.backup /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

---

## 11. Automated Test Template

```typescript
describe('Sync Queue Improvements', () => {
  describe('Interactive Mode', () => {
    it('should present entries one at a time', async () => {
      // Setup
      const queue = new WatchLogQueue(testQueuePath);
      await queue.append('watched Dune 2021');
      await queue.append('watched Inception 2010');

      // Execute
      const result1 = await syncLogwatchQueue(mockClient, {
        queuePath: testQueuePath,
        autoConfirm: false
      });

      // Assert
      expect(result1.data.action_required).toBe('confirm_entry');
      expect(result1.data.totalEntries).toBe(2);
      expect(result1.data.remaining).toBe(1);
    });
  });

  describe('Auto-Confirm Ambiguity', () => {
    it('should skip ambiguous entries instead of auto-selecting', async () => {
      // Setup
      mockClient.search.mockResolvedValue([
        { movie: { title: 'Dune', year: 1984 } },
        { movie: { title: 'Dune', year: 2021 } }
      ]);

      // Execute
      const result = await syncLogwatchQueue(mockClient, {
        queuePath: testQueuePath,
        autoConfirm: true
      });

      // Assert
      expect(result.data.skipped).toBe(1);
      expect(result.data.ambiguousEntries).toHaveLength(1);
    });
  });
});
```

---

## Appendix: Queue Entry Examples

```jsonl
{"id":"aa8caa52-d1bd-4c36-b521-262b8b462b98","rawText":"i watched columbus 2017 last week","capturedAt":"2025-12-12T20:14:34.479Z","status":"pending","source":"cli"}
{"id":"b58893e5-4141-494e-87f2-6df029d7d162","rawText":"i watched Paterson (2016)","capturedAt":"2025-12-12T20:58:46.078Z","status":"pending","source":"cli"}
{"id":"41690ea7-eefb-41b9-bdc9-aff68c923365","rawText":"I watched all of the pirates of the carrabien movies last month","capturedAt":"2025-12-12T21:05:35.654Z","status":"pending","source":"cli"}
```

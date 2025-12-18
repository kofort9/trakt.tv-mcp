# Manual Testing Guide: Sync Queue Improvements

**Quick reference for testing the sync queue improvements manually**

---

## Prerequisites

1. **Queue File:** `/Users/kofifort/.trakt-mcp/pending-logs.jsonl` (20 entries)
2. **Backup:** Always backup before testing
3. **Auth:** Ensure Trakt.tv authentication is valid

```bash
# Backup queue
cp /Users/kofifort/.trakt-mcp/pending-logs.jsonl /Users/kofifort/.trakt-mcp/pending-logs.jsonl.backup

# Restore if needed
cp /Users/kofifort/.trakt-mcp/pending-logs.jsonl.backup /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

---

## Test Sequence

### 1. Dry Run (Preview Only)

**Purpose:** See what will happen without actually syncing

**MCP Tool Call:**
```typescript
mcp__trakt__sync_logwatch_queue({
  dryRun: true
})
```

**Expected Output:**
```
✓ Summary table showing all entries
✓ Status breakdown (resolved/ambiguous/not found)
✓ No changes to queue file
✓ No Trakt API calls made
```

**Validation:**
- Queue file unchanged: `diff /Users/kofifort/.trakt-mcp/pending-logs.jsonl{,.backup}`
- Check Langfuse: no `addToHistory` traces

---

### 2. Show Summary (With Search)

**Purpose:** Preview with actual search results

**MCP Tool Call:**
```typescript
mcp__trakt__sync_logwatch_queue({
  showSummary: true
})
```

**Expected Output:**
```
✓ Summary table with search results
✓ Resolved entries show matched titles
✓ Ambiguous entries flagged
✓ Not found entries identified
✓ Queue file still unchanged
```

**Validation:**
- Check summary counts match expectations
- Verify ambiguous entries include "Chungking Express", "2046"

---

### 3. Interactive Mode - Single Entry

**Purpose:** Test step-by-step workflow

**Step 3.1: Get First Entry**
```typescript
mcp__trakt__sync_logwatch_queue({
  autoConfirm: false
})
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "action_required": "confirm_entry",
    "currentEntry": {
      "id": "aa8caa52-d1bd-4c36-b521-262b8b462b98",
      "rawText": "i watched columbus 2017 last week",
      "parsed": {
        "title": "Columbus",
        "year": 2017,
        "type": "movie",
        "watchedAt": "2025-12-05"
      }
    },
    "remaining": 19,
    "totalEntries": 20
  }
}
```

**Step 3.2: Search for Content**
```typescript
mcp__trakt__search_show({
  query: "Columbus 2017 movie"
})
```

**Step 3.3: Log to Trakt**
```typescript
mcp__trakt__log_watch({
  type: "movie",
  movieName: "Columbus",
  year: 2017,
  watchedAt: "2025-12-05"
})
```

**Step 3.4: Verify Entry Synced**
```bash
# Check queue file
grep "aa8caa52-d1bd-4c36-b521-262b8b462b98" /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

**Expected in Queue:**
```json
{"id":"aa8caa52-d1bd-4c36-b521-262b8b462b98","rawText":"i watched columbus 2017 last week","status":"synced","syncedAt":"2025-12-16T...","resolvedContent":{"type":"movie","traktId":...}}
```

**Step 3.5: Get Next Entry**
```typescript
mcp__trakt__sync_logwatch_queue({
  autoConfirm: false
})
```

**Expected:**
- Returns entry 2: "i watched Paterson (2016)"
- `remaining: 18`
- `totalEntries: 20` (unchanged)

---

### 4. Skip Entry Test

**Purpose:** Test skip workflow

**Step 4.1: Get Entry with Typo**
```typescript
// Continue interactive mode until you reach:
// "I watched all of the pirates of the carrabien movies last month"
```

**Step 4.2: Mark as Skipped**
```bash
# In code or via direct queue manipulation:
# queue.markSkipped("41690ea7-eefb-41b9-bdc9-aff68c923365")
```

**Step 4.3: Verify Skip**
```bash
grep "41690ea7-eefb-41b9-bdc9-aff68c923365" /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

**Expected:**
```json
{"id":"41690ea7-eefb-41b9-bdc9-aff68c923365","status":"skipped",...}
```

**Step 4.4: Next Entry Skips This**
```typescript
mcp__trakt__sync_logwatch_queue({
  autoConfirm: false
})
```

**Expected:**
- Returns entry 4 (not the skipped entry 3)

---

### 5. Auto-Confirm Mode - Unique Matches

**Purpose:** Test auto-sync of unambiguous entries

**Setup:**
```bash
# Restore backup to reset queue
cp /Users/kofifort/.trakt-mcp/pending-logs.jsonl.backup /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

**Execute:**
```typescript
mcp__trakt__sync_logwatch_queue({
  autoConfirm: true
})
```

**Expected Behavior:**
- Processes all entries automatically
- Unique matches sync
- Ambiguous matches skip (NOT auto-select first)
- Low confidence skip
- Not found fail

**Expected Result:**
```json
{
  "success": true,
  "data": {
    "synced": 10,
    "skipped": 5,
    "failed": 5,
    "ambiguousEntries": [
      {
        "id": "...",
        "rawText": "I just finished Chungking Express",
        "reason": "Multiple matches found",
        "matches": [...]
      }
    ],
    "archivePath": "/Users/kofifort/.trakt-mcp/archive/pending-logs-2025-12-16T..."
  }
}
```

**Validation:**
1. Check archive created:
```bash
ls -la /Users/kofifort/.trakt-mcp/archive/
```

2. Check queue contains only failed/skipped:
```bash
grep '"status"' /Users/kofifort/.trakt-mcp/pending-logs.jsonl | sort | uniq -c
```

Expected output:
```
5 "status":"failed"
5 "status":"skipped"
```

3. Verify synced entries in Trakt history:
```typescript
mcp__trakt__get_history({
  startDate: "2025-12-16"
})
```

---

### 6. Ambiguity Handling Test

**Purpose:** Verify ambiguous entries skip instead of auto-selecting

**Test Entries:**
| Raw Text | Expected Behavior |
|----------|-------------------|
| "I just finished Chungking Express" | Skip (no year, multiple matches) |
| "I just finished 2046" | Skip (ambiguous title) |
| "last night i watched F1 the movie" | Skip or Fail (too recent, may not be indexed) |

**Execute:**
```typescript
// Start with fresh queue
mcp__trakt__sync_logwatch_queue({
  autoConfirm: true
})
```

**Check Result:**
```bash
# Should see skipped entries with reasons
grep '"status":"skipped"' /Users/kofifort/.trakt-mcp/pending-logs.jsonl | while read line; do
  echo "$line" | jq '.rawText, .failureReason'
done
```

**Expected Output:**
```
"I just finished Chungking Express"
"Multiple matches found - requires manual disambiguation"

"I just finished 2046"
"Multiple matches found - requires manual disambiguation"
```

---

### 7. Error Handling Tests

#### 7.1 Network Error Test

**Simulate:**
```bash
# Disconnect network temporarily
# Or modify ~/.trakt-mcp/.trakt-token.json to invalid token
```

**Execute:**
```typescript
mcp__trakt__sync_logwatch_queue({
  autoConfirm: true
})
```

**Expected:**
- Graceful error handling
- Entries marked as failed
- No crash
- Error logged to Langfuse

**Validation:**
```bash
grep '"status":"failed"' /Users/kofifort/.trakt-mcp/pending-logs.jsonl | head -1 | jq '.failureReason'
```

#### 7.2 Rate Limit Test

**Simulate:**
- Process large queue (100+ entries) to hit rate limits
- Or mock API to return 429

**Expected:**
- Retry mechanism activates
- Exponential backoff applied
- Eventually succeeds (or fails after max retries)
- Langfuse trace shows retry metadata

---

### 8. Franchise Pattern Detection (Future)

**Test Entries:**
```
"I've seen all the matrix movies"
"All the jurassic park movies"
"All the marvel movies"
```

**Current Behavior:**
- Parser may or may not detect franchise
- Auto-confirm likely skips due to ambiguity

**Future Behavior:**
- Parser sets `isFranchisePattern: true`
- System searches for franchise/collection
- Returns list of movies for bulk logging

**Manual Test:**
```typescript
// Parse one entry manually
const parsed = parseWatchNote("I've seen all the matrix movies", new Date().toISOString());
console.log(parsed);
```

**Expected (Future):**
```json
{
  "title": "matrix",
  "type": "unknown",
  "isFranchisePattern": true,
  "franchiseName": "matrix",
  "franchiseHint": "all the X movies"
}
```

---

## Langfuse Verification

### Check Trace Creation

1. Execute any test above
2. Open Langfuse dashboard: https://cloud.langfuse.com/
3. Search for traces with name: `sync_logwatch_queue`
4. Verify metadata:
   - Total entries
   - Synced/failed/skipped counts
   - Duration
   - Tool name

### Check Error Traces

1. Execute error handling test (7.1)
2. Find corresponding trace in Langfuse
3. Verify error details:
   - Error message captured
   - Stack trace present
   - Error level set
   - No sensitive data leaked

---

## Common Issues & Solutions

### Issue: "Queue file does not exist"
**Solution:**
```bash
touch /Users/kofifort/.trakt-mcp/pending-logs.jsonl
chmod 600 /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

### Issue: "Entry with id XXX not found"
**Solution:**
- Entry may have been processed already
- Check queue file manually:
```bash
grep "XXX" /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

### Issue: "No pending entries to sync"
**Solution:**
- All entries already processed
- Restore backup or add new entries
```bash
cp /Users/kofifort/.trakt-mcp/pending-logs.jsonl.backup /Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

### Issue: Auto-confirm auto-selects first result
**Solution:**
- This is the OLD behavior being fixed
- Ensure you're testing the fix/sync-queue-improvements branch
- Check implementation includes ambiguity detection

---

## Test Result Documentation

After each test, document:

1. **Test Name:** (e.g., "Interactive Mode - Single Entry")
2. **Status:** Pass / Fail / Blocked
3. **Observations:**
   - What worked as expected
   - What didn't work
   - Edge cases discovered
4. **Screenshots:** (if applicable, especially for UI/table output)
5. **Langfuse Trace ID:** (for debugging)
6. **Notes:** Any additional context

**Template:**
```markdown
### Test: Interactive Mode - Single Entry
**Date:** 2025-12-16
**Tester:** [Name]
**Status:** ✅ Pass

**Observations:**
- Entry presented correctly
- Search worked
- Log successful
- Next entry retrieved
- Progress indicator accurate

**Langfuse Trace:** trace_abc123
**Notes:** None
```

---

## Success Metrics

### Interactive Mode
- ✅ Entries presented one at a time
- ✅ Progress indicator shows "Entry X of Y"
- ✅ Can confirm entry (sync)
- ✅ Can skip entry
- ✅ Next entry loads correctly

### Auto-Confirm Mode
- ✅ Unique matches sync automatically
- ✅ Ambiguous matches SKIP (not auto-select)
- ✅ Low confidence entries skip
- ✅ Not found entries fail
- ✅ `ambiguousEntries` array populated

### Error Handling
- ✅ Network errors don't crash
- ✅ Invalid entries handled gracefully
- ✅ Queue file never corrupted
- ✅ Failed entries preserved for retry

### Data Integrity
- ✅ Archive created on completion
- ✅ Failed/skipped entries retained
- ✅ Synced entries have correct metadata
- ✅ No data loss

---

## Cleanup

```bash
# After testing, clean up
rm -f /Users/kofifort/.trakt-mcp/pending-logs.jsonl.backup

# Archive old archives (optional)
mkdir -p /Users/kofifort/.trakt-mcp/archive/old
mv /Users/kofifort/.trakt-mcp/archive/pending-logs-2025-* /Users/kofifort/.trakt-mcp/archive/old/
```

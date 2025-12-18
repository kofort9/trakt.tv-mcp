# sync_logwatch_queue Feature Test Report

**Test Date:** 2025-12-16
**Feature:** Offline Watch Log Queue Synchronization
**MCP Tool:** `sync_logwatch_queue`
**Status:** Ready for Testing

---

## Overview

The `sync_logwatch_queue` feature enables users to synchronize offline watch logs (stored in a local queue) to Trakt.tv. This addresses the use case where users capture natural language watch notes when AI/API is unavailable, then sync them later.

### Architecture Components

| Component | Location | Role |
|-----------|----------|------|
| **WatchLogQueue** | `/src/domain/trakt/watch-queue.ts` | Queue storage and lifecycle management (JSONL format) |
| **syncLogwatchQueue** | `/src/domain/trakt/tools.ts` (line 1108) | MCP tool that orchestrates the sync process |
| **parseWatchNote** | `/src/shared/nl-parser.ts` | Natural language parser for extracting structured data |
| **BulkSummaryBuilder** | `/src/domain/trakt/bulk-summary.ts` | Builds preview summaries with search classification |
| **Queue File** | `~/.trakt-mcp/pending-logs.jsonl` | Default storage location (owner-only 600 permissions) |

---

## Feature Capabilities

### 1. Queue Management
- **Append-only JSONL format** for durability
- **Duplicate detection** using normalized text comparison
- **Status tracking**: `pending`, `synced`, `failed`, `skipped`
- **Source attribution**: `cli`, `api`, `slack`, `system`
- **Automatic archiving** after sync (successful entries removed, failed/skipped retained)

### 2. Sync Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Dry Run** | `dryRun: true` | Parses all entries, searches Trakt, displays summary table. No writes. |
| **Summary Mode** | `showSummary: true` | Like dry run but explicitly focused on preview |
| **Interactive** | `autoConfirm: false` | Returns first entry for manual confirmation, Claude guides user through each |
| **Auto-Confirm** | `autoConfirm: true` | Processes all entries automatically (skips low confidence, logs rest) |

### 3. Natural Language Parsing

The parser (`parseWatchNote`) extracts:
- **Title**: Cleaned content title
- **Type**: `movie`, `episode`, or `unknown`
- **Confidence**: `high`, `medium`, `low`
- **Year**: Optional release year
- **Season/Episode**: Detected from patterns like "S2E5", "season 2 episode 5"
- **Watched Date**: From temporal expressions or `capturedAt` fallback
- **Date Source**: Tracks whether date came from text (`parsed`) or fallback
- **Recall Pattern**: Detects "I've seen" vs "I watched" (indefinite vs specific past)

#### Temporal Expression Support
- **Immediate**: "just", "just finished", "just now" → uses `capturedAt`
- **Relative**: "yesterday", "last night", "today" → calculates from `capturedAt`
- **Recall**: "I've seen", "seen" → no specific date, uses `capturedAt` as fallback
- **ISO Dates**: Explicit dates in ISO format

### 4. Search Classification

BulkSummaryBuilder performs concurrent searches (default 5 concurrent) and classifies entries:

| Status | Description | Next Action |
|--------|-------------|-------------|
| `resolved` | Exactly 1 match found | Auto-select for logging |
| `ambiguous` | Multiple matches found | Requires user disambiguation |
| `not_found` | No matches found | Mark failed or allow manual resolution |
| `error` | Search API failed | Mark failed, can retry later |

---

## Current Queue Contents

As of test date, **20 pending entries** in queue:

```
/Users/kofifort/.trakt-mcp/pending-logs.jsonl
```

Sample entries:
1. "i watched columbus 2017 last week" (2025-12-12)
2. "i watched Paterson (2016)" (2025-12-12)
3. "I watched all of the pirates of the carrabien movies last month" (2025-12-12)
4. "I've seen all the marvel movies but I dont have a watch day..." (2025-12-12)
5. "I just finished Still walking (2009)" (2025-12-14)
6. "I just finished in the mood for love (2000)" (2025-12-15)
7. "I just finished Chungking Express" (2025-12-15)
8. "I just finished 2046" (2025-12-16)

### Entry Complexity Patterns

- **Simple movie with year**: Entries 1, 2, 5, 6 (HIGH confidence expected)
- **Bulk franchise logs**: Entries 3, 4, and others with "all the" pattern (CHALLENGING - not bulk API supported)
- **Ambiguous dates**: Entry 4 - "within a month of it coming out" (REQUIRES MANUAL DATE)
- **Missing year**: Entry 7 (Chungking Express) - may have ambiguity
- **Typos**: Entry 3 - "carrabien" instead of "caribbean" (PARSER RESILIENCE TEST)

---

## Test Plan: Execution Flow

### Phase 1: Dry Run Analysis
**Goal**: Preview what would be synced without making changes

1. Call `sync_logwatch_queue` with `dryRun: true`
2. Observe summary table output
3. **Document**:
   - How many entries are resolved/ambiguous/not_found/error
   - Formatted table clarity (is it scannable?)
   - Whether parsed data looks accurate
   - Any unexpected classifications

**Expected Behavior**:
- Queue file remains unchanged
- No Trakt API write calls
- Returns `action_required: 'review'` with formatted table

### Phase 2: Interactive Sync (Single Entry)
**Goal**: Test manual confirmation workflow

1. Call `sync_logwatch_queue` with `autoConfirm: false`
2. Receive first entry for confirmation
3. Claude presents entry, searches, asks for confirmation
4. User approves/rejects/edits
5. Mark entry as synced/failed/skipped
6. Repeat for next entry

**Document**:
- UX friction: Is it clear what's happening?
- Confirmation prompts: Are they helpful?
- Error messages: Are failures actionable?
- Progress visibility: Can user see "3/20 complete"?

### Phase 3: Auto-Confirm Batch
**Goal**: Test fully automated sync

1. Call `sync_logwatch_queue` with `autoConfirm: true`
2. Let system process all entries
3. **Document**:
   - Success rate (synced vs failed vs skipped)
   - Low-confidence skips (are they appropriate?)
   - Failed entries (what went wrong?)
   - Archive creation (was it successful?)

**Expected Behavior**:
- Low confidence entries auto-skipped
- High/medium confidence entries searched and logged
- Failed entries marked with reason
- Queue archived to `~/.trakt-mcp/archive/pending-logs-{timestamp}.jsonl`
- Final queue contains only failed/skipped/pending

---

## Known Edge Cases & Test Coverage

### Date Handling (Integration Tests Cover This)

| Scenario | Test Coverage | File Location |
|----------|---------------|---------------|
| Parsed date from "yesterday" | ✅ Line 283-324 | `queue-sync.integration.test.ts` |
| Fallback to capturedAt when no date | ✅ Line 326-365 | `queue-sync.integration.test.ts` |
| Temporal modifiers ("just watched") | ✅ Line 367-407 | `queue-sync.integration.test.ts` |

### Bulk Operations

| Scenario | Current Limitation | Workaround |
|----------|-------------------|------------|
| "All the Marvel movies" | No bulk franchise API support | Falls back to individual searches (slow) |
| Missing release dates | Must search all years | May get ambiguous results |
| Typos in titles | Parser passes through | Depends on Trakt search fuzzy matching |

### Error Recovery

- **Network failures**: Mark failed, preserve in queue for retry ✅
- **Ambiguous results**: Currently auto-selects first result in auto mode ⚠️ [NEEDS VERIFICATION]
- **Rate limiting**: Controlled concurrency (5 concurrent searches) ✅
- **Partial success**: Continue processing after individual failures ✅

---

## UX Observations (To Document During Testing)

### Friction Points to Watch For:
1. **Disambiguation overload**: How many ambiguous entries cause user fatigue?
2. **Bulk operation confusion**: Is it clear that "all the X movies" won't use bulk API?
3. **Date ambiguity**: Does "within a month of it coming out" fail gracefully?
4. **Progress visibility**: Can user tell how far along sync is?
5. **Archive awareness**: Do users know where archived logs go?

### Questions to Answer:
1. How does the tool handle franchise searches (e.g., "all the marvel movies")?
2. What happens when multiple matches exist in auto-confirm mode?
3. Is the formatted summary table clear enough for decision-making?
4. Are error messages actionable (e.g., "No matches for 'Chungking Express' - try adding year")?
5. Does the parser correctly handle typos (e.g., "carrabien")?

---

## Potential Skill Conversion

This feature could become a reusable **"Offline Log Queue & Sync" skill** for other MCP servers:

### Skill Components:
1. **Queue abstraction**: JSONL storage with status tracking
2. **NL parser**: Pluggable parser for domain-specific entities
3. **Bulk classifier**: Concurrent search with status classification
4. **Sync orchestrator**: Dry-run → Interactive → Auto modes
5. **Archive pattern**: Clean up synced entries, preserve failures

### Generalization Requirements:
- Abstract away Trakt-specific search/logging
- Parameterize entity types (movie/episode → generic entities)
- Support custom parsers and validators
- Generic "resolution" workflow for ambiguities

---

## Test Execution Checklist

**Before Testing**:
- [ ] Backup current queue file: `cp ~/.trakt-mcp/pending-logs.jsonl ~/queue-backup.jsonl`
- [ ] Note current entry count: 20 entries
- [ ] Ensure Trakt authentication is valid

**During Testing**:
- [ ] Run dry-run and capture summary table
- [ ] Test interactive mode for 2-3 entries
- [ ] Note any confusing prompts or error messages
- [ ] Test auto-confirm on remaining entries
- [ ] Check archive file creation

**After Testing**:
- [ ] Document success/failure breakdown
- [ ] List any bugs or unexpected behaviors
- [ ] Note UX improvements needed
- [ ] Capture example error messages
- [ ] Assess skill conversion viability

---

## Test Results

[This section to be filled during actual testing]

### Summary Statistics
- Total entries processed: __/__
- Resolved automatically: __
- Required disambiguation: __
- Not found: __
- Errors: __
- Skipped (low confidence): __

### Notable Findings
1.
2.
3.

### Bugs/Issues Discovered
-

### UX Improvements Recommended
-

### Skill Conversion Readiness
- **Viability**: [ ] High / [ ] Medium / [ ] Low
- **Blockers**:
- **Required Abstractions**:

---

## References

- **Implementation**: `/src/domain/trakt/tools.ts:1108-1301`
- **Queue Storage**: `/src/domain/trakt/watch-queue.ts`
- **NL Parser**: `/src/shared/nl-parser.ts`
- **Bulk Summary**: `/src/domain/trakt/bulk-summary.ts`
- **Integration Tests**: `/tests/integration/queue-sync.integration.test.ts`
- **Original Concept**: `/docs/operations/manual-e2e-plan.md`
- **Queue File**: `~/.trakt-mcp/pending-logs.jsonl`
- **Archive Directory**: `~/.trakt-mcp/archive/`

---

## Appendix: Tool Schema

```typescript
interface SyncLogwatchQueueArgs {
  queuePath?: string;          // Override default queue location
  dryRun?: boolean;            // Preview without writing
  autoConfirm?: boolean;       // Skip manual confirmation
  showSummary?: boolean;       // Show summary table
}

interface SyncLogwatchQueueResult {
  // Dry-run/summary mode
  action_required?: 'review' | 'confirm_entry';
  summary?: BulkSummary;
  formattedTable?: string;
  totalEntries?: number;
  canProceed?: boolean;

  // Interactive mode
  currentEntry?: ParsedEntry;
  remaining?: number;

  // Auto-confirm completion
  synced?: number;
  failed?: number;
  skipped?: number;
  totalProcessed?: number;
  archivePath?: string;
  results?: Array<{
    id: string;
    status: 'synced' | 'failed' | 'skipped';
    title?: string;
    reason?: string;
  }>;

  message: string;
}
```

---

**End of Test Report**

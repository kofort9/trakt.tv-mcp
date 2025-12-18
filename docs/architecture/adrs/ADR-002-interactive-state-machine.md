# ADR-002: Interactive State Machine for Queue Sync

- Status: Accepted
- Date: 2025-12-17
- Owners: @kofifort
- Implementation Status: Core states (`pending`, `synced`, `failed`, `skipped`) are implemented in `WatchQueue`. The `awaiting_confirmation` state and full async confirmation workflow described below are planned for future implementation.

## Context

### The Problem

The current `sync_logwatch_queue` tool has an implicit state machine that causes issues:

1. **Stalled confirmation loops** — When the tool returns ambiguous entries, there's no clear contract for how the user should respond or what state the entry is in
2. **Lost progress** — If context runs out or user leaves mid-session, there's no way to resume
3. **Synchronous assumption** — The tool expects immediate user response, but users may want to revisit later
4. **Unclear entry lifecycle** — Entries can be in various states but the queue file only tracks basic status

### User Impact

- Users abandon disambiguation because the flow is confusing
- Ambiguous entries pile up with no clear path to resolution
- Failed entries have no retry mechanism
- No visibility into "what needs my attention?"

### Business Constraints

- Must work with existing queue file format (JSONL)
- Must support async workflows (revisit hours/days later)
- Must maintain backward compatibility with existing tools
- Should integrate with Langfuse observability

## Decision

Implement an explicit state machine for queue entries with persistent states in the queue file.

### Entry Lifecycle States

#### Persistent States (stored in queue file)

| State | Meaning | User Actions |
|-------|---------|--------------|
| `pending` | Raw entry, not yet processed | Sync will parse + search |
| `awaiting_confirmation` | Processed, needs user decision | Confirm, skip, edit, retry |
| `synced` | Successfully logged to Trakt | Undo (via undo_last_log) |
| `skipped` | User chose to skip | Restore to pending |
| `failed` | Error or user rejected | Retry, edit, delete |

#### Transient States (during sync execution)

| State | Meaning | Transitions To |
|-------|---------|---------------|
| `resolved` | 1 match found | `synced` (auto) or `awaiting_confirmation` |
| `ambiguous` | 2+ matches found | `awaiting_confirmation` |
| `not_found` | 0 matches | `awaiting_confirmation` |
| `error` | API/parse failure | `failed` |

### State Diagram

```
                              ┌─────────────────────────────────────┐
                              │              retry                  │
                              ▼                                     │
┌─────────┐    sync     ┌──────────┐                               │
│ PENDING │────────────▶│ PARSING  │ (transient)                   │
└─────────┘             └────┬─────┘                               │
     ▲                       │                                      │
     │ edit                  ▼                                      │
     │                 ┌───────────┐                               │
     │                 │ SEARCHING │ (transient)                   │
     │                 └─────┬─────┘                               │
     │                       │                                      │
     │     ┌─────────────────┼─────────────────┐                   │
     │     │                 │                 │                   │
     │     ▼                 ▼                 ▼                   │
     │ ┌──────────┐    ┌───────────┐     ┌───────────┐            │
     │ │ RESOLVED │    │ AMBIGUOUS │     │ NOT_FOUND │            │
     │ │ (1 match)│    │ (2+ match)│     │ (0 match) │            │
     │ └────┬─────┘    └─────┬─────┘     └─────┬─────┘            │
     │      │                │                 │                   │
     │      │ autoConfirm?   │                 │                   │
     │      │                │                 │                   │
     │ ┌────┴────┐           │                 │                   │
     │ │         │           │                 │                   │
     │ ▼         ▼           ▼                 ▼                   │
     │ ┌────┐  ┌─────────────────────────────────────┐            │
     │ │SYNC│  │       AWAITING_CONFIRMATION         │            │
     │ │ ED │  │  (persists until user revisits)     │            │
     │ └────┘  └──────────────────┬──────────────────┘            │
     │                            │                                │
     │           ┌────────────────┼────────────────┐              │
     │           │                │                │              │
     │           ▼                ▼                ▼              │
     │      ┌────────┐      ┌─────────┐      ┌────────┐          │
     └──────│ SYNCED │      │ SKIPPED │      │ FAILED │──────────┘
            └────────┘      └─────────┘      └────────┘
                 │                │                │
                 ▼                ▼                ▼
            (archived)       (archived)      (needs attention)
```

### Queue File Schema Changes

Extend the existing queue entry with state metadata:

```typescript
interface QueueEntry {
  // Existing fields
  id: string;
  rawText: string;
  capturedAt: string;
  status: 'pending' | 'awaiting_confirmation' | 'synced' | 'skipped' | 'failed';

  // New fields for state machine
  searchResults?: DisambiguationOption[];  // Cached search results
  selectedTraktId?: number;                 // User's selection (when confirmed)
  failureReason?: string;                   // Why it failed
  retryCount?: number;                      // Number of retry attempts
  lastProcessedAt?: string;                 // When last state transition occurred

  // Existing parsed data (populated after first sync attempt)
  parsed?: ParsedWatchEntry;
}
```

### "Needs Attention" Query

The `queue_status` tool should surface entries needing user action:

```typescript
interface QueueStatus {
  pending: number;
  needsAttention: {
    awaitingConfirmation: number;  // Ambiguous or not found
    failed: number;                 // Errors that can be retried/edited
  };
  synced: number;
  skipped: number;
}
```

Example response:
```
Queue Status:
  📥 3 pending (not yet processed)
  ⚠️  5 need your attention:
      - 3 awaiting confirmation (ambiguous matches)
      - 2 failed (can retry or edit)
  ✅ 42 synced
  ⏭️  2 skipped
```

### Async Workflow

**Session 1: Initial sync**
```
User: sync my queue
Tool: Processing 10 entries...

      ✅ 6 synced (auto-confirmed, 1 match each)
      ⚠️  4 need your attention:
         [abc123] "Dune" - 2 matches (2021 vs 1984)
         [def456] "Matrix trilogy" - franchise detected
         [ghi789] "Chungkign Express" - no matches (typo?)
         [jkl012] "The Bear S2E5" - API timeout
```

**Session 2: (hours/days later)**
```
User: what needs attention in my queue?
Tool: 4 entries need your attention:

      Awaiting Confirmation (3):
      [abc123] "Dune" - Pick: 1) Dune (2021) 2) Dune (1984)
      [def456] "Matrix trilogy" - Pick: 1) The Matrix 2) Reloaded 3) Revolutions
      [ghi789] "Chungkign Express" - No matches. Edit or skip?

      Failed (1):
      [jkl012] "The Bear S2E5" - API timeout. Retry?

User: confirm abc123 with option 1
Tool: ✅ Logged "Dune (2021)" to Trakt

User: edit ghi789 to "Chungking Express"
Tool: ✏️  Updated. Re-searching...
      Found 1 match: Chungking Express (1994)
      Confirm? [Y/n]

User: yes
Tool: ✅ Logged "Chungking Express (1994)" to Trakt

User: retry jkl012
Tool: ✅ Logged "The Bear S2E5" to Trakt

User: skip def456 for now
Tool: ⏭️  Skipped "Matrix trilogy"
```

### State Transitions

| Current State | Action | New State | Side Effects |
|--------------|--------|-----------|--------------|
| `pending` | sync | `awaiting_confirmation` | Parse + search, cache results |
| `pending` | sync (1 match + autoConfirm) | `synced` | Log to Trakt |
| `awaiting_confirmation` | confirm | `synced` | Log to Trakt with selected ID |
| `awaiting_confirmation` | skip | `skipped` | Move to archive |
| `awaiting_confirmation` | edit | `pending` | Update rawText, clear cached results |
| `awaiting_confirmation` | fail | `failed` | Mark as failed |
| `failed` | retry | `pending` | Increment retryCount |
| `failed` | edit | `pending` | Update rawText |
| `failed` | delete | (removed) | Remove from queue entirely |
| `skipped` | restore | `pending` | Move back to pending |

### Tool Changes

#### Existing Tools

1. **`sync_logwatch_queue`** — Add state persistence
   - After processing, update queue file with new states
   - Cache search results in entry for later disambiguation
   - Return summary grouped by state

2. **`queue_status`** — Add "needs attention" breakdown
   - Show `awaiting_confirmation` + `failed` counts
   - Quick visibility into what requires user action

3. **`queue_confirm`** — Support new actions
   - `action: 'confirm' | 'skip' | 'fail' | 'edit' | 'retry' | 'delete'`
   - For `edit`: accept new rawText, transition to `pending`
   - For `retry`: increment retryCount, transition to `pending`

#### New Tool (Optional)

**`queue_attention`** — Focused view of entries needing action
- Filters to only `awaiting_confirmation` and `failed` entries
- Returns cached search results for quick disambiguation
- Lower token cost than full `queue_preview`

## Consequences

### Positive Outcomes

1. **Async-friendly** — Users can revisit queue days later without losing progress
2. **Clear lifecycle** — Every entry has an explicit state with defined transitions
3. **Recoverable failures** — Failed entries can be retried or edited
4. **Visibility** — "Needs attention" view shows exactly what requires user action
5. **Cached results** — Search results stored in entry, no re-search needed for disambiguation

### Risks and Mitigations

**Risk**: Queue file grows with cached search results
- **Mitigation**: Only cache top 3 matches (already implemented in BulkSummaryBuilder)
- **Mitigation**: Clear cache when entry transitions to terminal state (synced/skipped)

**Risk**: State transitions become complex
- **Mitigation**: Clear state diagram and transition table
- **Mitigation**: Single source of truth (queue file)
- **Mitigation**: Validate transitions in code

**Risk**: Backward compatibility with existing queue files
- **Mitigation**: Treat missing `status` as `pending` (current default)
- **Mitigation**: New fields are optional, old entries still work

### Trade-offs

**What we optimized for**: Async workflows, user control, failure recovery

**What we sacrificed**:
- Slightly larger queue file (cached search results)
- More complex state management

**What we preserved**:
- Backward compatibility
- Simple JSONL format
- Existing tool interfaces

## Implementation Plan

### Phase 1: State Persistence (Current Branch)
- [ ] Update `WatchQueue` to handle new states
- [ ] Modify `sync_logwatch_queue` to persist state after processing
- [ ] Update `queue_status` with "needs attention" breakdown

### Phase 2: Async Confirmation
- [ ] Extend `queue_confirm` with edit/retry/delete actions
- [ ] Cache search results in queue entries
- [ ] Add `queue_attention` tool (optional)

### Phase 3: Observability
- [ ] Wrap state transitions with Langfuse traces
- [ ] Add structured logging for debugging
- [ ] Create dashboard for queue health

## Alternatives Considered

### Option A: In-Memory State Only

Keep state in memory during sync, don't persist to file.

**Pros**: Simpler, no file format changes
**Cons**: Lost on context switch, can't resume later

**Why rejected**: Doesn't support async workflows.

### Option B: Separate State File

Store state in a separate JSON file, keep queue file unchanged.

**Pros**: Clean separation, no format migration
**Cons**: Two files to manage, sync issues possible

**Why rejected**: Added complexity, single file is simpler.

### Option C: Database Instead of JSONL

Use SQLite for queue storage with proper state columns.

**Pros**: Better querying, atomic updates, proper schema
**Cons**: More complex setup, overkill for small queues

**Why rejected**: Premature optimization. JSONL works for expected scale (<1000 entries). Can migrate later if needed.

## References

- [ADR-001: Token Cost Optimization](./ADR-001-queue-sync-token-optimization.md)
- [Queue Tools Guide](../../guides/QUEUE_TOOLS.md)
- [Future Work](../future-work.md)

---

## Revision History

- 2025-12-17: Initial proposal

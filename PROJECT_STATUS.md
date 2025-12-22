# Trakt.tv MCP Server - Project Status

**Last Updated:** 2025-12-22
**Current Phase:** Phase 0 - Stabilization (Complete)
**Next Session Focus:** Merge PRs #27 & #28, begin Phase 1

---

## Quick Status

| Area | Status | Blocking? |
|------|--------|-----------|
| Core MCP tools (log_watch, bulk_log, etc.) | ✅ Stable | No |
| sync_logwatch_queue | ✅ Fixed (PR #27, #28) | No |
| Observability (Langfuse) | ✅ Internal spans added | No |
| Obsidian integration | 📋 Planned (Phase 1) | No |
| Ratings/reviews | 📋 Planned (Phase 2) | No |

---

## Phase Overview

```
Phase 0: Stabilization (CURRENT)
├── 0.1 Add observability to sync_logwatch_queue
├── 0.2 Fix _retryCount crash in TraktClient
├── 0.3 Implement search-first type inference
├── 0.4 Smart auto-confirm behavior
└── 0.5 Process existing 20-entry queue

Phase 1: Obsidian Dual-Write
├── 1.1 Create ObsidianWriter module
├── 1.2 Integrate into log_watch/bulk_log
├── 1.3 Create watchlog.md format
└── 1.4 Update log-media skill

Phase 2: Ratings & Reviews
├── 2.1 Add rating param to log_watch (1-10)
├── 2.2 Add review param (short text)
├── 2.3 Flow to both Trakt AND Obsidian
└── 2.4 Update NL parser for ratings

Phase 3: Advanced Features (Future)
├── 3.1 Interactive state machine (ADR-002)
├── 3.2 Franchise expansion workflow
├── 3.3 Month-level date granularity
└── 3.4 Local SQLite analytics store
```

---

## Phase 0: Stabilization (Complete)

### 0.1 Add Observability to sync_logwatch_queue

**Status:** ✅ Complete (PR #27)
**Priority:** Critical
**Branch:** `fix/sync-stabilization`

**Solution:** Added `createChildSpan()` method to LangfuseTracer for internal spans. Entry processing now traced with metadata.

**Files modified:**
- `src/core/langfuse.ts` - Added createChildSpan method
- `src/domain/trakt/tools.ts` - Added entry processing spans
- `tests/unit/langfuse-spans.test.ts` - 8 new tests

**Acceptance Criteria:**
- [x] sync_logwatch_queue calls appear in Langfuse
- [x] Trace includes: entry processing, search calls, sync results
- [x] Errors are captured with full context

---

### 0.2 Fix _retryCount Crash

**Status:** ✅ Complete (PR #27)
**Priority:** Critical
**Branch:** `fix/sync-stabilization`

**Solution:** Defensive initialization already existed at trakt-client.ts:111-112. Added comprehensive tests to verify behavior.

**Files modified:**
- `src/domain/trakt/trakt-client.ts` - Verified defensive init
- `tests/unit/trakt-client-retry.test.ts` - 15 new tests

**Acceptance Criteria:**
- [x] No crashes on any queue entry
- [x] Retry logic works correctly
- [x] Unit test covers edge case

---

### 0.3 Search-First Type Inference

**Status:** ✅ Complete (PR #28)
**Priority:** High
**Branch:** `feat/smart-type-inference`

**Solution:** Parser already defaults to `infer_from_search` (nl-parser.ts:42). Added comprehensive regression tests for case study entries.

**Behavior:**
```
"i watched columbus 2017" → type: infer_from_search → search Trakt → SUCCESS
```

**Files modified:**
- `src/domain/trakt/tools.ts` - Type inference from search results
- `tests/integration/type-inference.test.ts` - 19 new regression tests

**Acceptance Criteria:**
- [x] Entries without type hints are searchable
- [x] Single-match entries auto-resolve type
- [x] Multi-match entries marked ambiguous

---

### 0.4 Smart Auto-Confirm Behavior

**Status:** ✅ Complete (PR #28)
**Priority:** High
**Branch:** `feat/smart-type-inference`

**Solution:** Skip logic already existed at tools.ts:1563-1604. Added mixed-type ambiguity detection (e.g., Fargo movie vs show).

**Behavior:**
- ✅ Process entries with exactly 1 search result
- ⏭️ Skip entries with 0, 2+, or mixed-type results
- ⚠️ Mark skipped entries with hints (year range, match count)

**Files modified:**
- `src/domain/trakt/tools.ts` - Mixed-type detection
- `src/core/langfuse.ts` - Added `mixed_types` to matchType union
- `tests/integration/type-inference.test.ts` - 7 edge case tests

**Acceptance Criteria:**
- [x] Only 1-match entries are auto-confirmed
- [x] 0-match and multi-match are skipped
- [x] Summary shows skipped count

---

### 0.5 Process Existing Queue

**Status:** 🟡 Ready (after PR merge)
**Priority:** Medium

**Context:** 20 entries in `~/.trakt-mcp/pending-logs.jsonl` from Dec 12-16.

**After merge:**
1. Run `sync_logwatch_queue({ dryRun: true })` - verify parsing
2. Run `sync_logwatch_queue({ autoConfirm: true })` - process unambiguous
3. Manually resolve remaining entries

---

## Phase 1: Obsidian Dual-Write

### 1.1 Create ObsidianWriter Module

**Status:** 📋 Planned
**Branch:** `feat/obsidian-writer`

**Purpose:** Write watch logs to Obsidian vault in addition to Trakt.

**Location:** `src/domain/obsidian/obsidian-writer.ts`

**Interface:**
```typescript
interface WatchLogEntry {
  type: 'movie' | 'episode';
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  traktSlug?: string;
  watchedAt: string;
  rating?: number;      // Phase 2
  review?: string;      // Phase 2
}

class ObsidianWriter {
  constructor(vaultPath?: string);
  appendWatchLog(entry: WatchLogEntry): Promise<void>;
  appendBulkWatchLog(entries: WatchLogEntry[]): Promise<void>;
}
```

**Configuration:**
```env
OBSIDIAN_VAULT_PATH=~/Documents/Obsidian
OBSIDIAN_WATCHLOG_ENABLED=true
```

---

### 1.2 Watchlog Format

**File:** `~/Documents/Obsidian/sources/media/watchlog.md`

**Format:**
```markdown
---
type: media-log
updated: 2025-12-21T14:30:00Z
---

# Media Watch Log

## 2025-12-21

- 14:30 | movie | **Dune** (2021) | [trakt](https://trakt.tv/movies/dune-2021)
- 15:45 | episode | **Breaking Bad** S1E1 | [trakt](https://trakt.tv/...)

## 2025-12-20

- 20:00 | episode | **Stranger Things** S4E1-5 | bulk logged
```

**Design Decisions:**
- Date headers group by day
- Pipe-separated for easy parsing
- Trakt links for cross-reference
- Append-only (no per-movie notes initially)

---

### 1.3 Integrate into log_watch/bulk_log

**Pattern:**
```typescript
// After successful Trakt API call
if (config.obsidian.enabled) {
  try {
    await obsidianWriter.appendWatchLog(entry);
  } catch (error) {
    logger.warn('Obsidian dual-write failed', { error });
    // Don't fail the tool - Trakt write succeeded
  }
}
```

**Key Principle:** Obsidian is best-effort. Trakt success is primary.

---

## Phase 2: Ratings & Reviews

### 2.1 Add Rating Parameter

**Trakt API Support:** Yes (1-10 scale)

**Tool Change:**
```typescript
log_watch({
  type: 'movie',
  movieName: 'Dune',
  watchedAt: '2025-12-21',
  rating: 8  // NEW: optional 1-10
});
```

### 2.2 Add Review Parameter

**Trakt API Support:** Yes (short text reviews)

**Tool Change:**
```typescript
log_watch({
  ...
  review: 'Stunning visuals, faithful adaptation'  // NEW: optional
});
```

### 2.3 NL Support

**Goal:** Parse ratings from natural language.

```
"watched Dune, solid 8/10" → rating: 8
"finished Breaking Bad S5 - incredible finale" → review: "incredible finale"
```

---

## Design Decisions Record

### DD-001: Search-First Type Inference
**Date:** 2025-12-16
**Decision:** Don't default to "movie" when type unknown. Search Trakt first, let user confirm if ambiguous.
**Rationale:** Natural language rarely specifies type. User confirmation is better than wrong defaults.

### DD-002: Auto-Confirm Behavior
**Date:** 2025-12-16
**Decision:** Auto-confirm should only process entries with exactly 1 search result. Skip (not guess) on 0 or 2+ results.
**Rationale:** Ambiguity requires human judgment.

### DD-003: Vague Date Fallback
**Date:** 2025-12-16
**Decision:** "Last month" → capture date - 15 days. "I've seen" → use capture date.
**Rationale:** Some date is better than no date. Users can correct later.

### DD-004: Obsidian Dual-Write Strategy
**Date:** 2025-12-21
**Decision:** Best-effort write to Obsidian. Trakt success is primary. Obsidian failure logs warning but doesn't fail tool.
**Rationale:** Redundancy/decentralization goal shouldn't break primary logging.

### DD-005: Watchlog Format
**Date:** 2025-12-21
**Decision:** Append-only markdown file with date headers. No per-movie notes initially.
**Rationale:** Start simple, let structure emerge from usage.

### DD-006: Document-as-Coordinator Pattern
**Date:** 2025-12-21
**Decision:** Use PROJECT_STATUS.md as the coordination mechanism between agents instead of a separate coordinator agent.
**Rationale:** Simpler architecture. Each agent reads status before work, updates after work, and passes scoped context to next agent. Document is the single source of truth.

### DD-007: Lean Multi-Agent Orchestration Pattern
**Date:** 2025-12-21
**Decision:** Adopt a lean orchestration pattern with explicit checkpoints, scoped handoffs, and compaction recovery.

**Key Principles:**
1. **PR Sizing**: 4-5k lines max, independently mergeable
2. **Clean History**: One branch per logical task, squash merge
3. **Feedback Loop**: Backend ↔ Code-Reviewer tight iteration (max 3 rounds)
4. **Test-Inclusive**: Tests written as part of implementation, not separate phase
5. **Checkpointing**: Write recovery state after each task completion
6. **Context Scoping**: Detailed handoffs prevent intent drift (per Anthropic research)

**Workflow:**
```
Orientation → PR Scoping → Branch → Implement+Test → Review Loop → QA → PR → Checkpoint
```

**Skills Created:**
- `pr-scoper`: Analyze scope, recommend PR boundaries
- `checkpoint`: Write recovery-friendly state for continuity

**Agents (7 max active):**
- Main conversation (orchestrator)
- trakt-mcp-backend (implementation)
- code-reviewer (from pr-review-toolkit)
- watch-tracker-qa-ux (testing)
- gitops-devex (git operations)
- Specialized reviewers (silent-failure-hunter, pr-test-analyzer - as needed)

**Compaction Recovery:**
If context is compacted mid-task:
1. Read PROJECT_STATUS.md → current task
2. Read latest session log checkpoint → loop state, decisions
3. Check git status → branch, uncommitted changes
4. Resume from "Next action"

**Anti-Patterns Avoided:**
- No separate observer agent (checkpoints are sufficient)
- No more than 7 agents active (context overhead)
- No vague handoffs (detailed task descriptions prevent drift)

**Sources:**
- [Anthropic Multi-Agent Research](https://www.anthropic.com/engineering/multi-agent-research-system)
- [LangChain Multi-Agent Guidance](https://blog.langchain.com/how-and-when-to-build-multi-agent-systems/)
- [IBM LLM Orchestration](https://www.ibm.com/think/tutorials/llm-agent-orchestration-with-langchain-and-granite)

### DD-008: Greptile Review Comment Triage
**Date:** 2025-12-21
**Decision:** Triage Greptile auto-review comments to prevent scope creep.

**In-Scope (fix immediately):**
- Bugs in code we wrote this PR
- Type/lint errors in changed files
- Missing error handling for our changes
- Test gaps for our feature

**Out-of-Scope (log, don't implement):**
- "While you're here, also fix..."
- Refactoring unrelated code
- "Consider adding feature X..."
- Performance optimizations not in acceptance criteria

**Action for out-of-scope:**
- Log to TECHNICAL_DEBT.md
- Reply to comment: "Noted for future work - out of scope for this PR"
- Stay focused on task

**Rationale:** Review comments can derail long-running tasks. Staying focused preserves context and intent.

### DD-009: Autonomy and Escalation Policy
**Date:** 2025-12-21
**Decision:** High autonomy with escalation for design decisions and trade-offs.

**Autonomous (no escalation):**
- Implementation per DD-001 through DD-008
- Fixing clear bugs/errors
- In-scope Greptile comments
- Documentation updates

**Escalate to human (AskUserQuestion):**
- New design decisions not covered by existing DDs
- Meaningful implementation trade-offs
- Architectural changes
- Security-sensitive changes
- Scope significantly larger than estimated

**Check-in points:**
- PR-ready: Summary before creating PR
- Merge-ready: Final confirmation before merge

---

## Technical Debt

### Active (from TECHNICAL_DEBT.md)

| Item | Priority |
|------|----------|
| Interactive CLI for logwatch sync | Should Consider |
| Enhanced disambiguation UX (posters) | Should Consider |
| Typo/fuzzy matching tests | Should Consider |
| Rate limiting edge case tests | Should Consider |
| Concurrent queue file access tests | Should Consider |

### Resolved Recently
- Episode duplicate detection (2025-12-16)
- Performance benchmarks for bulk ops (2025-12-16)
- Node.js 20 enforcement (2025-12-11)
- Security audit refresh (2025-12-11)

---

## Agent Roster

Agents available for this project (in `.claude/agents/`):

| Agent | Purpose | Use When |
|-------|---------|----------|
| **trakt-mcp-backend** | Core MCP development | Writing tools, fixing bugs |
| **trakt-watch-companion** | NL interaction testing | Testing user flows |
| **watch-tracker-qa-ux** | QA and UX testing | Validating UX, edge cases |
| **git-workflow-guardian** | Branch health | Before commits/PRs |

---

## Test Data

**Pending Queue:** `~/.trakt-mcp/pending-logs.jsonl`
- 20 entries from Dec 12-16
- All currently fail (type inference needed)
- Includes: simple movies, franchises, typos, vague dates

---

## References

| Document | Purpose |
|----------|---------|
| `docs/architecture/future-work.md` | Feature roadmap |
| `docs/case-studies/2025-12-16-sync-queue-first-test.md` | First test analysis |
| `docs/test-plans/phase-0-test-plan.md` | **Phase 0 test plan (NEW)** |
| `docs/architecture/adrs/ADR-002-interactive-state-machine.md` | Interactive mode design |
| `TECHNICAL_DEBT.md` | Tech debt tracking |
| `CLAUDE.md` | AI assistant guidelines |

---

## Session Log

### 2025-12-22 (Session 5)
- **PR-1 (fix/sync-stabilization)** complete and ready to merge
  - 8 Langfuse observability tests
  - 15 retry logic tests
  - Build ✅, Test ✅, Style ✅ (Docs ❌ non-blocking)
- **PR-2 (feat/smart-type-inference)** complete and ready to merge
  - Fixed `mixed_types` TypeScript error in langfuse.ts
  - 19 type inference tests, 7 auto-confirm edge case tests
  - Build ✅, Test ✅, Style ✅ (Docs ❌ non-blocking)
- Created Claude Code skills for PR workflow:
  - `/landscape` - quick situational awareness
  - `/latest-comment` - fetch only most recent review comment
  - `/review-loop` - iterate one comment at a time
- Tested review loop: PR #28 comment was already addressed (randomUUID fix)
- Updated PROJECT_STATUS.md to reflect Phase 0 completion
- **Both PRs are MERGEABLE** - ready for final merge

### 2025-12-22 (Session 4)
- **KEY DISCOVERY**: Phase 0 fixes are mostly already implemented!
  - 0.2 (_retryCount): Defensive init exists at trakt-client.ts:111-112
  - 0.3 (search-first): Parser defaults to 'infer_from_search' at nl-parser.ts:42
  - 0.4 (smart auto-confirm): Skip logic exists at tools.ts:1563-1604
  - 0.1 (observability): Outer traceToolCall exists, needs internal spans
- Created detailed test plan: `docs/test-plans/phase-0-test-plan.md`
- Analyzed existing test coverage (26 tests in sync-queue-improvements.test.ts)
- Identified gaps: internal Langfuse spans, case study regression tests
- **Revised scope**: PRs are primarily about adding tests + observability, not new code
- Test plan includes ~28 new tests across 4 files
- Next: Create fix/sync-stabilization branch, implement PR-1

### 2025-12-21 (Session 3)
- Researched industry best practices for multi-agent orchestration
- Created `pr-scoper` skill for PR sizing analysis
- Created `checkpoint` skill for compaction recovery
- Created `pr-feedback-loop` skill for Greptile comment handling
- Updated `trakt-mcp-backend` with explicit test-writing and review loop
- Documented DD-007 (orchestration), DD-008 (comment triage), DD-009 (autonomy policy)
- Key insight: "Latest comment only - old context lives in checkpoints, not working memory"
- PR strategy decided: Two PRs (PR-1: 0.1+0.2 infra, PR-2: 0.3+0.4 features)
- Next: Begin PR-1 implementation (fix/sync-stabilization branch)

### 2025-12-21 (Session 2)
- Updated `trakt-mcp-backend` agent with PROJECT_STATUS.md awareness
- Updated `watch-tracker-qa-ux` agent with PROJECT_STATUS.md awareness
- Added code-review integration pattern to backend agent
- Decision: No separate coordinator agent needed - PROJECT_STATUS.md serves as coordination layer

### 2025-12-21 (Session 1)
- Discovered Phase 0 blockers during planning
- Created PROJECT_STATUS.md for coordination
- Decided to fix sync issues before adding Obsidian

---

**Next Session Checklist:**
1. Read this file first
2. Check pending queue status
3. Start with highest priority incomplete item
4. Update this file before ending session

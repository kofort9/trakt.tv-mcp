# Future Work & UX Improvements

**Last Updated:** 2025-12-22

This document captures forward-looking feature and UX tasks that are out of scope for the current cycle but should be prioritized next.

---

## 🔥 Active Priority Queue

Items from sync queue experimentation and PR reviews. Ordered by priority.

### Critical (Blocks Core Functionality)

| # | Item | Branch | Status | Notes |
|---|------|--------|--------|-------|
| 1 | Search-first type inference | PR #28 | ✅ Done | Parser extracts, search determines type |
| 2 | Interactive state machine | `feat/interactive-state-machine` | 📋 ADR-002 | Explicit states, async confirmation |

### High Priority (Enables Debugging & Reliability)

| # | Item | Branch | Status | Notes |
|---|------|--------|--------|-------|
| 3 | Observability for `sync_logwatch_queue` | PR #27 | ✅ Done | Internal spans via `createChildSpan()` |
| 4 | Fix `_retryCount` crash | PR #27 | ✅ Done | Defensive init in TraktClient |

### Medium Priority (Improves UX for Common Patterns)

| # | Item | Branch | Status | Notes |
|---|------|--------|--------|-------|
| 5 | Franchise expansion workflow | `feat/franchise-detection` | 📝 Planned | "all the X movies" → collection search |
| 6 | Month-level date granularity | `feat/date-parser-enhancements` | 📝 Planned | "last month" → capture date - 15 days |
| 7 | Smart auto-confirm behavior | PR #28 | ✅ Done | Skip (not guess) on 0 or 2+ results |

### Low Priority (Nice to Have)

| # | Item | Branch | Status | Notes |
|---|------|--------|--------|-------|
| 8 | Validate Trakt typo tolerance | N/A | 📝 Research | Test "carrabien" → "caribbean" |

### Suggested Order of Attack

```
1 ✅ → 3 ✅ → 4 ✅ → 7 ✅ → 2 → 5 → 6 → 8
```

**Rationale**: Phase 0 complete (1, 3, 4, 7). Next: implement state machine (#2), then polish UX patterns.

---

## 📥 Backlog (From PR Reviews)

Ideas surfaced from automated code reviews worth revisiting.

### Observability Enhancements

| Item | Source | Priority | Notes |
|------|--------|----------|-------|
| Type inference result logging | PR #28 review | Medium | Log inferred type + confidence for debugging |
| Error categorization taxonomy | PR #28 review | Low | Classify errors (network/validation/auth) for metrics |

### Tooling & Skills

| Item | Source | Priority | Status | Notes |
|------|--------|----------|--------|-------|
| `/review-pipeline` skill | PR #29 discussion | Medium | 📋 Spec drafted | Orchestrate comment-validate → error-classify → code-reviewer with feedback loops. See [spec](../../.claude/skills/review-pipeline.md) |
| `/error-classify` skill | PR #28 review | Low | 📋 Spec drafted | Categorize errors before review. See [spec](../../.claude/skills/error-classify.md) |
| `/comment-validate` skill | PR #27 false positive | Low | 📋 Spec drafted | Pre-validate comment syntax to reduce review noise. See [spec](../../.claude/skills/comment-validate.md) |

### Test Improvements

| Item | Source | Priority | Notes |
|------|--------|----------|-------|
| Test isolation audit | PR #28 review | Low | Verify no shared state between vitest tests |

---

## ✅ Completed (v0.4.0)

### Logging UX & Disambiguation
- ✅ Show top 3 matches with title/year/genre on ambiguous searches
- ✅ Add "preview before logging" with confirmation support
- ✅ Improved disambiguation messages with actionable guidance

### Bulk Logging & Undo
- ✅ Idempotent logging: check recent history to avoid duplicates with opt-in rewatches
- ✅ Add undo support via `undo_last_log` tool with preview and confirmation
- ✅ Bulk confirmation summary table highlighting unresolved/ambiguous items

### Logwatch (Offline) Core
- ✅ Enhanced queue with status tracking (pending/synced/failed/skipped)
- ✅ Parse-on-sync with NL parser for date/type/episode extraction
- ✅ Sync tool with dry-run and auto-confirm modes
- ✅ Archive completed syncs with timestamped files

## Remaining Priority Items

### Logging UX & Disambiguation
- Return clear failure reasons with refinement tips (add year/season/episode, check spelling)
- Display interpreted timezone for date parsing
- Support optional ratings/moods on log entries for future analytics
- Add poster/tagline to disambiguation (requires additional API calls)

### Bulk Logging & Undo
- Allow proceed-with-valid-subset for partially resolved bulk operations

### Logwatch (Offline) Enhancements
- Interactive CLI for `logwatch sync` with per-entry prompts and date correction
- Pre-validation with cached search results when offline
- Add `fix <id>`, `drop <id>`, `export` commands for queue management
- `--json` output format for programmatic access
- Parse note on capture (immediate preview/edit before queueing)

## Additional Input Patterns
- Season/series-level logging ("finished season 2 of X", "watched The Bear S1") → expanded episode logs.
- Accept natural range phrasing ("episodes 1 through 5 of season 2") and document in quick start.
- Add voice/chat capture integrations (e.g., Slack or voice assistant) for quick note intake.

## Onboarding & Docs
- Expand README examples: ambiguity, partial seasons, rewatches, ratings/moods; use tables for supported commands.
- Add an onboarding walkthrough: connect Trakt, practice commands, error-handling guidance.

## Local Analytics & Recommendations
- Add local SQLite store (`watch_history`: source/title/year/type/season/episode/watched_at/rating/tags/synced).
- Backfill via `get_history`/bulk_log; update on `log_watch` and logwatch sync.
- Optional recs: simple collaborative/content-based model; expose `recommend_media` tool; keep data local (consider SQLCipher).

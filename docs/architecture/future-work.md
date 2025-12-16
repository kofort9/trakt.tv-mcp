# Future Work & UX Improvements

**Last Updated:** 2025-12-16

This document captures forward-looking feature and UX tasks that are out of scope for the current cycle but should be prioritized next.

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

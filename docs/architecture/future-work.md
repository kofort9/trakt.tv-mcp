# Future Work & UX Improvements

**Last Updated:** 2025-12-14

This document captures forward-looking feature and UX tasks that are out of scope for the current cycle but should be prioritized next.

## Logging UX & Disambiguation
- Show top 3 matches with title/year/genre/poster/tagline on ambiguous searches; require explicit user choice.
- Return clear failure reasons with refinement tips (add year/season/episode, check spelling).
- Add “preview before logging” (title/season/episode/date) and confirmation prior to submit.
- Expand date parsing synonyms (“last night”, “two days ago”) and display interpreted timezone.
- Support optional ratings/moods on log entries for future analytics.

## Bulk Logging & Undo
- Bulk confirmation summary table highlighting unresolved/ambiguous items; allow proceed-with-valid-subset.
- Idempotent logging: check recent history/cache to avoid duplicates; allow opt-in rewatches.
- Add undo/remove support (e.g., `undo_last_log` / targeted delete via Trakt history API).

## Logwatch (Offline) Enhancements
- Parse note on capture (title/type/date guess + confidence) with immediate preview/edit.
- Enrich queue entries (capturedAt, titleGuess, dateGuess, status, source); add `fix <id>`, `drop <id>`, `sync`, `export`, `--json` list.
- Add `logwatch sync` using `log_watch`/`bulk_log` with dry-run and per-entry status; pre-validate with cached search when offline.

## Additional Input Patterns
- Season/series-level logging (“finished season 2 of X”, “watched The Bear S1”) → expanded episode logs.
- Accept natural range phrasing (“episodes 1 through 5 of season 2”) and document in quick start.
- Add voice/chat capture integrations (e.g., Slack or voice assistant) for quick note intake.

## Onboarding & Docs
- Expand README examples: ambiguity, partial seasons, rewatches, ratings/moods; use tables for supported commands.
- Add an onboarding walkthrough: connect Trakt, practice commands, error-handling guidance.

## Local Analytics & Recommendations
- Add local SQLite store (`watch_history`: source/title/year/type/season/episode/watched_at/rating/tags/synced).
- Backfill via `get_history`/bulk_log; update on `log_watch` and logwatch sync.
- Optional recs: simple collaborative/content-based model; expose `recommend_media` tool; keep data local (consider SQLCipher).

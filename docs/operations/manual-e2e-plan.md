# Manual E2E Logging (No AI) – NL Queue Concept

## Problem
- When Claude/AI is unavailable, logging watches still needs to be fast and low-friction.
- Users prefer natural language (“today I finished Tenet”) over flag-heavy CLI commands.
- Ambiguities (title/year/episode) should be handled later, not block capture.

## Goals
- One-shot NL input: `logwatch "today I finished Tenet"` or `logwatch "yesterday watched The Bear S2E5"`.
- Always capture immediately to a local queue; never lose an entry if offline or unauthenticated.
- Resolve ambiguity later (manually or when MCP/Claude is available), then sync to Trakt via existing tools.
- Keep the queue inspectable/editable; provide dry-run and export options.

## Concept Overview
1. **NL Capture → Local Queue**  
   - Parse lightweight signals: date phrases (today/yesterday/ISO), season/episode patterns (S2E5, “season 2 episode 5”), inferred type (movie vs episode), title text remainder.  
   - Store raw text, parsed guess, confidence, and derived fields in `~/.trakt-mcp/pending-logs.json` (or SQLite).  
   - No immediate network calls required.

2. **Resolve Phase (optional, when online or with user input)**  
   - If confidence is low or multiple candidates exist, mark `needs_disambiguation` with a candidate list.  
   - Commands like `logwatch resolve <id> --title "Tenet (2020)" --type movie` (or interactive mode) set the final payload.  
   - When MCP/Trakt is reachable, use `search_show`/`search_episode` to auto-resolve high-confidence entries.

3. **Sync Phase**  
   - `logwatch sync` pushes resolved items via `log_watch`/`bulk_log` and reports per-entry status.  
   - Respects rate limits; supports `--dry-run` to preview.  
   - Leaves ambiguous or failed items in the queue with a clear reason.

4. **Review & Edit**  
   - `logwatch list --status pending|error` to inspect the queue.  
   - `logwatch edit <id> --title "..."/--watchedAt .../--season ...` to fix details.  
   - `logwatch drop <id>` to discard mistakes; `logwatch export` for CSV/JSON backup.

## UX Principles
- NL-first: no required flags for the common case; flags are only for fixes/edits.  
- Capture now, resolve later: never block on ambiguity at capture time.  
- Safety: dry-run before sync; no auto-logging without confirmation or explicit sync.  
- Transparency: every entry shows raw text, parsed fields, confidence, and status.

## UX Enhancements (recommended)
- **Instant feedback:** After `logwatch "..."`, show parsed guess (type/title/date/S/E/confidence) and queue ID. Offer a quick prompt: “Looks right? (Y/n/edit)” to fix obvious errors immediately.
- **Fast fixes in NL:** Support `logwatch fix <id> "<new nl text>"` to re-parse, not just field-by-field edits.
- **Handle ambiguity inline:** When multiple candidates exist, show the top 3 and let the user pick or “defer” on the spot. Only defer if they choose to.
- **Readable list view:** `logwatch list` should be single-line per entry: ID, status, parsed title, watchedAt, confidence (color/emoji for scanability).
- **Safe defaults:** Default sync to dry-run/queue unless `--apply` is passed; make accidental logging unlikely.
- **Clear error copy:** On sync errors, show action guidance: “3 matches, pick one: logwatch resolve <id> --pick 2”.
- **Timezone clarity:** Store raw text + parsed ISO; display assumed timezone in feedback.
- **Undo:** `logwatch drop <id>` plus a small recycle bin to restore if dropped by mistake.
- **Batch input:** If multiple NL lines are captured at once, return a concise summary and highlight items needing resolution.
- **Discoverability:** `logwatch help` with practical examples (movie, episode, date phrases, fix, resolve, sync).
- **Slack capture option:** Allow a Slack slash command/webhook to append raw NL text to an append-only queue file (e.g., `data/pending-logs.jsonl`) with auto `capturedAt` and `source: "slack"`. A GitHub Action can handle `repository_dispatch` to append/commit the entry without exposing secrets. Slack reply should echo the queued ID and raw text.

## What This Solves
- Fast capture when AI/agent is unavailable.  
- Ambiguity handled later without losing data.  
- Keeps logs accurate by requiring sync/confirmation before writing to Trakt.

## Next Steps (implementation sketch)
- CLI: `logwatch <nl-text>`, `logwatch list`, `logwatch resolve`, `logwatch edit`, `logwatch sync`, `logwatch drop`, `logwatch export`, `logwatch --dry-run`.  
- UX: implement quick confirm, `fix <id> "<nl>"`, inline ambiguity pick/defer, readable list, safe sync defaults, clear error guidance, recycle bin.  
- Storage: simple JSON file with locking; optional SQLite later.  
- Parser: date phrases, S/E patterns, type inference, confidence scoring.  
- Resolver: reuse MCP tools to pick the right title/episode when online; otherwise manual resolve.  
- Docs: quickstart + examples; mention queue location and dry-run guidance.  

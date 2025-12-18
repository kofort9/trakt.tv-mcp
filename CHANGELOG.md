# Changelog

All notable changes to the Trakt.tv MCP server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **ADR-002**: Interactive state machine design for async queue confirmation workflow
- **Observability for Queue Tools**: All queue tools now wrapped with `traceToolCall()` for Langfuse visibility
- **Defensive Retry Initialization**: `_retryCount` now initialized in request interceptor to prevent edge-case crashes
- **Smart Auto-Confirm**: Entries with 0 search results now skipped (not failed) for manual review
- **Search-First Parser Philosophy**: NL parser now uses `infer_from_search` type, letting Trakt API determine content type
- **Title Cleanup Logic**: Parser handles edge cases like "I Am Legend", numeric titles ("2046"), and parsing artifacts
- **Optimized Queue Tools**: New focused tools for efficient queue management with 50-70% token cost reduction
  - `queue_status`: Quick count of pending/synced/failed entries (~200 tokens)
  - `queue_preview`: Dry-run summary with pagination support (~300 tokens)
  - `queue_auto_sync`: Batch sync unambiguous entries (~250 tokens)
  - `queue_confirm`: Single entry action for interactive disambiguation (~350 tokens)
- **Token Cost Optimizations**: Compressed response payloads across all queue tools
  - Search results limited to top 3 matches (down from 10)
  - Verbose fields removed (genres, overview, score) from disambiguation
  - Franchise hints only included when detected (not empty by default)
  - New `minimalOutput` flag for `sync_logwatch_queue` (counts only, no tables)
- **Queue Tools Documentation**: Comprehensive guide with recommended workflows, examples, and migration path ([docs/guides/QUEUE_TOOLS.md](docs/guides/QUEUE_TOOLS.md))
- **ADR-001**: Architecture decision record documenting token optimization rationale and design decisions
- **Enhanced Disambiguation**: Top 3 matches with genres, overview, and relevance scores for better content identification
- **Preview Mode**: `preview` parameter for `log_watch` and `bulk_log` to review before syncing to Trakt
- **Duplicate Detection**: Automatic check for recent logs (48-hour window) with `allowDuplicates` override for rewatches
- **Undo Support**: `undo_last_log` tool to remove recent watch history entries with preview and confirmation
- **Natural Language Parser**: Comprehensive parser for offline watch notes supporting temporal modifiers, recall patterns, and date expressions
- **Enhanced Queue Model**: Extended status tracking (pending/synced/failed/skipped), resolved content caching, and archive support
- **Queue Sync Tool**: `sync_logwatch_queue` MCP tool to process offline watch logs with auto-confirm and dry-run modes
- Public-facing docs: SECURITY, plus issue/PR templates
- Manual E2E NL queue plan (offline capture → resolve/sync) with optional Slack append-to-queue flow
- Node version enforcement helpers: `.nvmrc`, `engine-strict` (`.npmrc`), and preinstall version guard
- Comprehensive natural language date parsing support
- Langfuse observability integration (replacing OpenTelemetry/Honeycomb)
- Cache telemetry with hit/miss tracking via Langfuse events
- Langfuse startup health check to surface bad keys or network issues early
- Langfuse trace flushing moved off request path with latency measurement
- Async-local trace context to keep spans isolated when tool calls overlap
- Shared input/output sanitization helpers to align redaction across tracing
- Langfuse quickstart snippet for copy/paste setup (docs/operations/observability.md)
- Langfuse integration test with stub transport covering trace → span → flush
- OAuth polling race condition guards with `isPollingInProgress()` and `cancelPolling()`
- Time-of-day expressions ("tonight", "this morning", "this evening")
- Relative date patterns ("N days ago", "N weeks ago", "last night")
- Weekday references ("last Monday", "last Friday")
- Month-based queries ("January 2025", "this month")
- Parameter aliases: `title` can be used instead of `movieName`/`showName`
- Date validation with helpful error messages
- Zero-value rejection for ambiguous dates ("0 days ago")
- Maximum bounds validation (365 days, 52 weeks)
- Empty string validation for date parameters
- Repo reorg with clearer layering: `src/server`, `src/domain/trakt`, `src/core`, `src/shared`, `src/cli`, `src/bin`; tests under `tests/unit|integration|e2e`; scripts grouped under `scripts/dev|data|ops|tools`.
- Future work plan (`docs/architecture/future-work.md`) capturing UX/feature roadmap.
- Opt-in Trakt E2E suite (`tests/e2e`) plus `npm run auth:trakt` helper to seed tokens; GitHub Action (`e2e.yml`) for manual/scheduled live runs.

### Changed
- **README Cleanup**: Streamlined for personal project - removed CODE_OF_CONDUCT/SUPPORT, fixed GitHub username, emphasized AI integration
- **Disambiguation responses**: Now limited to top 3 matches with rich metadata (genres, overview, scores) for clearer selection
- **Search API**: Now requests extended data by default for better disambiguation
- **Watch queue**: Expanded from append-only to full lifecycle management with status tracking and archiving
- README refreshed with public repo links, support/security references, and Node 20 guidance; package metadata now includes repository, bugs, and homepage URLs
- Refactored Langfuse from singleton to class-based dependency injection pattern
- Improved ISO 8601 date validation with strict month/day range checks
- Improved Husky hooks with Node version validation and guidance for nvm/fnm/asdf/volta
- Improved error messages with actionable suggestions
- Enhanced disambiguation responses for ambiguous content
- Standardized error response format across all tools
- Updated documentation structure with organized subdirectories
- Updated docs/guides/testing/observability to new paths; archived GPT-5 repo review (dated) and linked future-work; changelog version info bumped.
- `npm run format` now covers `src`, `tests`, and `scripts`; `npm run verify` runs a Prettier check before build/lint/test.

### Fixed
- "tonight" now correctly maps to current date (not next day)
- "last night" now correctly maps to previous date
- Time-of-day expressions no longer cause parsing errors
- Empty date strings now trigger validation errors instead of silent failures
- Episode and season number validation now enforces correct bounds

## [0.3.0] - 2025-11-19

### Added
- `bulk_log` tool for logging multiple episodes or movies at once
- Episode range parsing (e.g., "1-5", "1,3,5", "1-3,5,7-9")
- `summarize_history` tool for viewing watch statistics
- Date range queries for history summarization
- Natural language date parsing for common expressions

### Changed
- Refactored authentication flow for better token management
- Improved search result formatting and presentation

### Fixed
- OAuth token refresh timing issues
- Rate limiting edge cases with Trakt.tv API

## [0.2.0] - 2025-11-10

### Added
- `log_watch` tool for single episode/movie logging
- `search_show` and `search_movie` tools
- Disambiguation support for multiple content matches
- Year-based filtering for search results

### Changed
- Migrated from stdio to SSE transport for better streaming support
- Enhanced error handling with structured error codes

### Fixed
- Content ID resolution for shows with special characters
- Episode number validation edge cases

## [0.1.0] - 2025-11-01

### Added
- Initial MCP server implementation
- OAuth 2.0 device flow authentication
- Basic Trakt.tv API integration
- `add_to_watchlist` and `remove_from_watchlist` tools
- `get_watchlist` resource for viewing saved content
- Configuration management for client credentials
- TypeScript strict mode and ESLint setup

### Infrastructure
- GitHub Actions CI/CD pipeline
- Security audit workflow
- Prettier code formatting
- Vitest testing framework

---

## Version History Summary

- **Phase 3** (v0.3.x): Advanced natural language support and date parsing
- **Phase 2** (v0.2.x): Enhanced search, disambiguation, and transport improvements
- **Phase 1** (v0.1.x): Initial server implementation and authentication

## Links

- [GitHub Repository](https://github.com/kofort9/trakt.tv-mcp)
- [Trakt.tv API Documentation](https://trakt.docs.apiary.io/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

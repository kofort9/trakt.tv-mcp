# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Table of Contents
- [Project Overview](#project-overview)
- [MCP Server Architecture](#mcp-server-architecture)
- [Available Tools](#available-tools)
- [AI Assistant Responsibilities](#ai-assistant-responsibilities)
- [Natural Language Support](#natural-language-support)
- [Error Handling](#error-handling)
- [Development Workflow](#development-workflow)
- [Key Files & Directories](#key-files--directories)
- [Testing](#testing)
- [Observability & Debugging](#observability--debugging)
- [Related Documentation](#related-documentation)

---

## Project Overview

**What:** MCP (Model Context Protocol) server wrapping the Trakt.tv API for tracking watched shows, movies, and anime.

**Purpose:** Enable AI assistants like Claude to interact with a user's Trakt.tv profile using natural language.

**Key Features:**
- Natural language date interpretation ("yesterday", "last week")
- Bulk episode logging with range support ("1-5", "1-3,5,7-9")
- Smart disambiguation for content with multiple versions
- OAuth 2.0 authentication with token management
- Offline queue management (`logwatch` CLI)
- Optional Langfuse observability

---

## MCP Server Architecture

### Core Concepts

MCP servers expose **tools** and **resources** to AI assistants:

- **Tools**: Actions like logging watches, searching content, managing watchlists
- **Resources**: Data like watch history, upcoming episodes, user profile
- **Authentication**: OAuth 2.0 (device flow)
- **Transport**: stdio for MCP clients

### Separation of Concerns

**Claude's Role:**
- Interpret natural language dates → ISO 8601 format
- Extract structured data from conversational input
- Handle disambiguation when multiple matches exist
- Provide helpful, conversational responses

**Tool's Role:**
- Validate ISO 8601 dates (not natural language)
- Parse episode ranges (`1-5`, `1,3,5`)
- Execute Trakt API calls
- Return structured success/error responses

**Example Flow:**
```
User: "Watched Breaking Bad S1E1 yesterday"
     ↓
Claude interprets:
  - "Breaking Bad" → showName
  - "S1E1" → season: 1, episode: 1
  - "yesterday" → "2025-12-18" (ISO 8601)
     ↓
Tool receives: { type: "episode", showName: "Breaking Bad", season: 1, episode: 1, watchedAt: "2025-12-18" }
     ↓
Tool validates → Trakt API call → Success
```

---

## Available Tools

### Authentication & Search

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `authenticate` | OAuth device flow for Trakt.tv | None |
| `search_show` | Find TV shows, movies, anime by title | `query`, `type` (show\|movie) |
| `search_episode` | Find specific episode by show/season/episode | `showName`, `season`, `episode`, `year`, `traktId` |

### Watch Logging

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `log_watch` | Log single episode or movie as watched | `type`, `showName`/`movieName`, `season`, `episode`, `watchedAt`, `preview`, `allowDuplicates` |
| `bulk_log` | Log multiple episodes/movies at once | `type`, `showName`, `season`, `episodes` (range string), `movieNames` (array) |
| `undo_last_log` | Remove recent watch history entries | `limit` (1-10), `confirm` |

### History & Analytics

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `get_history` | Retrieve watch history with filters | `type`, `startDate`, `endDate`, `limit` |
| `summarize_history` | Analyze history with statistics | `startDate`, `endDate` |
| `get_upcoming` | Get upcoming episodes for tracked shows | `days` (1-30) |

### Watchlist Management

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `follow_show` | Add show to watchlist/tracking | `showName`, `year`, `traktId` |
| `unfollow_show` | Remove show from watchlist | `showName`, `year`, `traktId` |

### Offline Queue Management

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `sync_logwatch_queue` | Sync offline queue to Trakt | `dryRun`, `autoConfirm`, `entryId`, `action` |
| `queue_status` | Quick count of queue entries by status | `queuePath` |
| `queue_preview` | Preview queue with dry-run summary | `queuePath`, `limit` |
| `queue_auto_sync` | Batch sync unambiguous entries | `queuePath`, `allowDuplicates` |
| `queue_confirm` | Confirm, skip, or fail single queue entry | `entryId`, `action`, `selectedTraktId`, `selectedType` |

### Debugging

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `debug_last_request` | Get recent API request logs and metrics | `limit`, `toolName`, `errorsOnly` |

**Most common tools:** `log_watch`, `bulk_log`, `summarize_history`, `search_show`

---

## AI Assistant Responsibilities

### 1. Convert Dates to ISO 8601

**ALWAYS convert natural language dates before calling tools:**

| User Input | Claude Converts To |
|------------|-------------------|
| "yesterday" | `"2025-12-18"` |
| "last Friday" | `"2025-12-13"` |
| "3 days ago" | `"2025-12-16"` |
| "tonight" | `"2025-12-19"` |

**Never pass natural language to tools** - they expect ISO 8601 only.

### 2. Confirm Ambiguous Queries

**Bad:** User says "Watched some episodes" → Claude logs all 62 episodes
**Good:** User says "Watched some episodes" → Claude asks "Which episodes? S1E1, episodes 1-5?"

### 3. Handle Disambiguation

When tools return `needs_disambiguation: true`, present options to user:

```
I found multiple matches for "Dune":
1. Dune (2021) - Movie
2. Dune: Prophecy (2024) - TV Show

Which one did you watch? (Tell me by year)
```

### 4. Default Sensibly

- **Date:** Default to today if not specified
- **Episode/Season:** NEVER default - always require explicit specification

### 5. Confirm Bulk Actions

| Range Size | Action |
|------------|--------|
| 1-3 episodes | Proceed without confirmation |
| 4-10 episodes | Confirm with count |
| 11+ episodes | Confirm and suggest date range option |

---

## Natural Language Support

### Episode Range Formats

Tools parse episode range strings:

| Format | Example | Result |
|--------|---------|--------|
| Simple range | `"1-5"` | Episodes 1, 2, 3, 4, 5 |
| Non-contiguous | `"1,3,5"` | Episodes 1, 3, 5 |
| Mixed | `"1-3,5,7-9"` | Episodes 1, 2, 3, 5, 7, 8, 9 |

### Common Patterns

**Single Episode:**
```
User: "Watched Breaking Bad S1E1 yesterday"
Tool: log_watch
Args: { type: "episode", showName: "Breaking Bad", season: 1, episode: 1, watchedAt: "2025-12-18" }
```

**Movie:**
```
User: "Saw Dune last Friday"
Tool: log_watch
Args: { type: "movie", movieName: "Dune", watchedAt: "2025-12-13" }
```

**Bulk Episodes:**
```
User: "Binged Breaking Bad S1E1-5"
Tool: bulk_log
Args: { type: "episodes", showName: "Breaking Bad", season: 1, episodes: "1-5" }
```

**History Query:**
```
User: "What did I watch last week?"
Tool: summarize_history
Args: { startDate: "2025-12-12", endDate: "2025-12-18" }
```

**For complete pattern reference:** See [docs/guides/NATURAL_LANGUAGE_GUIDE.md](docs/guides/NATURAL_LANGUAGE_GUIDE.md)

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "suggestions": ["Actionable suggestion 1", "Actionable suggestion 2"]
  }
}
```

### Common Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| `VALIDATION_ERROR` | Input validation failed | Missing required parameter |
| `NOT_FOUND` | Content not found on Trakt | Misspelled show name |
| `TRAKT_API_ERROR` | Trakt.tv API issue | Network error, rate limit |
| `DUPLICATE_ENTRY` | Already logged recently | Within 48-hour window |

### Presenting Errors

**Example:**
```
Tool returns: { "code": "NOT_FOUND", "suggestions": ["Check spelling", "Try search tool"] }

Claude responds:
I couldn't find "Breaking Bed" on Trakt.tv.
• Check the spelling - did you mean "Breaking Bad"?
• Would you like me to search for similar titles?
```

**For detailed error handling:** See [docs/guides/CONTRIBUTING.md#for-ai-assistants-integration-guidelines](docs/guides/CONTRIBUTING.md)

---

## Development Workflow

### Prerequisites
- Node.js 20.x or later (`.nvmrc` provided)
- npm
- Trakt.tv API credentials

### Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Add TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET to .env

# Build
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

### Code Quality

```bash
npm run lint          # ESLint
npm run format        # Prettier
npm run build         # TypeScript compilation
npm test              # All tests
npm run verify        # Lint + format check + tests
```

### CI/CD

GitHub Actions runs on every push:
- TypeScript compilation
- ESLint validation
- Prettier formatting
- Full test suite
- Security audits

---

## Key Files & Directories

### Source Code

```
src/
├── server/
│   └── index.ts              # MCP server entry point
├── domain/trakt/
│   ├── tools.ts              # MCP tool implementations (15 tools)
│   ├── trakt-client.ts       # Trakt API client with rate limiting
│   ├── oauth.ts              # OAuth 2.0 device flow
│   ├── cache.ts              # LRU cache for search results
│   ├── duplicate-detector.ts # 48-hour duplicate prevention
│   ├── watch-queue.ts        # JSONL offline queue
│   └── bulk-summary.ts       # Parallel search for batch ops
├── shared/
│   ├── utils.ts              # Validation, episode parsing, errors
│   └── nl-parser.ts          # Natural language queue parser
└── core/
    ├── logger.ts             # Request/response logging
    └── langfuse.ts           # Observability integration
```

### Configuration

| File | Purpose |
|------|---------|
| `.env` | Trakt credentials, Langfuse keys |
| `tsconfig.json` | TypeScript strict mode |
| `.nvmrc` | Node.js version (20.x) |

### User Data

| Path | Purpose | Permissions |
|------|---------|-------------|
| `~/.trakt-mcp/.trakt-token.json` | OAuth tokens | `0o600` |
| `~/.trakt-mcp/logs/` | Request logs | `0o700`/`0o600` |
| `~/.trakt-mcp/pending-logs.jsonl` | Offline queue | `0o600` |

---

## Testing

### Test Structure

```
src/__tests__/               # Unit tests (Vitest)
docs/test-reports/           # Manual test reports
docs/case-studies/           # Notable experiments
```

### Commands

```bash
npm test                     # All tests
npm run test:watch           # Watch mode
npm run test:ui              # UI mode
npm run test:coverage        # Coverage report
```

### Philosophy

- **Unit tests:** Fast, isolated, mocked dependencies
- **Integration tests:** Tools with mocked Trakt client
- **E2E tests:** Opt-in live API tests

**For testing guide:** See [docs/testing/TESTING_GUIDE.md](docs/testing/TESTING_GUIDE.md)

---

## Observability & Debugging

### Langfuse Tracing (Optional)

Traces MCP tool calls, Trakt API requests, cache events, and disambiguation.

```bash
# Enable (optional)
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
```

**Graceful degradation:** Works identically without keys, zero performance impact.

### Debugging Tools

- **`debug_last_request` tool:** Shows recent API calls with timing
- **Logs:** `~/.trakt-mcp/logs/` with automatic rotation

**For observability setup:** See [docs/operations/observability.md](docs/operations/observability.md)

---

## Related Documentation

**For AI Assistants:**
- [Natural Language Guide](docs/guides/NATURAL_LANGUAGE_GUIDE.md) - Complete pattern reference
- [Contributing Guide - AI Section](docs/guides/CONTRIBUTING.md#for-ai-assistants-integration-guidelines) - Integration patterns

**For Developers:**
- [Testing Guide](docs/testing/TESTING_GUIDE.md) - Test infrastructure
- [Debugging Guide](docs/operations/DEBUGGING.md) - Troubleshooting

**For Operations:**
- [Observability](docs/operations/observability.md) - Langfuse setup
- [Cache Tuning](docs/operations/CACHE.md) - Performance optimization

**Project:**
- [README.md](README.md) - Project overview
- [Documentation Index](docs/README.md) - All documentation
- [CHANGELOG.md](CHANGELOG.md) - Version history

---

**Last Updated:** 2025-12-19
**Documentation Version:** 2.0.0

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
- [Maintenance Notes](#maintenance-notes)
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

**Core Tools:**
- `log_watch` - Log single episode/movie (supports optional `rating` 1-10)
- `bulk_log` - Log multiple episodes/movies with range strings (`"1-5"`, `"1,3,5"`)
- `rate_media` - Rate already-watched content (1-10 scale)
- `search_show` - Find shows/movies by title
- `search_episode` - Find specific episode by show/season/episode
- `get_history` / `summarize_history` - Query watch history

**Other Tools:**
- `authenticate` - OAuth device flow
- `undo_last_log` - Remove recent history entries
- `get_upcoming` - Upcoming episodes for tracked shows
- `follow_show` / `unfollow_show` - Watchlist management
- `queue_*` tools - Offline queue management
- `debug_last_request` - API request logs

**For full parameter reference:** See [Natural Language Guide](docs/guides/NATURAL_LANGUAGE_GUIDE.md#tool-reference)

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

### Episode Ranges

Tools parse range strings: `"1-5"` → [1,2,3,4,5], `"1,3,5"` → [1,3,5], `"1-3,5,7-9"` → [1,2,3,5,7,8,9]

### Rating Patterns

NL parser extracts ratings: `"8/10"` → 8, `"4 stars"` → 8, `"loved it"` → 10

### Quick Examples

| User Says | Tool | Key Args |
|-----------|------|----------|
| "Watched Breaking Bad S1E1 yesterday" | `log_watch` | `season:1, episode:1, watchedAt:"2025-12-21"` |
| "Binged S1E1-5 of The Office, 8/10" | `bulk_log` | `episodes:"1-5"` + use `rate_media` after |
| "Rate Dune 9 out of 10" | `rate_media` | `movieName:"Dune", rating:9` |

**For complete patterns:** See [Natural Language Guide](docs/guides/NATURAL_LANGUAGE_GUIDE.md)

---

## Error Handling

**Error Codes:** `VALIDATION_ERROR` | `NOT_FOUND` | `TRAKT_API_ERROR` | `DUPLICATE_ENTRY`

**Response format:** `{ success: false, error: { code, message, suggestions[] } }`

**Key behavior:** When tools return `suggestions`, present them to the user as actionable next steps.

**For detailed handling:** See [Contributing Guide](docs/guides/CONTRIBUTING.md#for-ai-assistants-integration-guidelines)

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

## Maintenance Notes

### Documentation Strategy

CLAUDE.md is intentionally lean - it provides **essential context** while linking to detailed references:

| Topic | Source of Truth |
|-------|-----------------|
| Tool parameters & patterns | `docs/guides/NATURAL_LANGUAGE_GUIDE.md` |
| Error handling details | `docs/guides/CONTRIBUTING.md` |
| Build/test commands | `README.md` |
| Testing patterns | `docs/testing/TESTING_GUIDE.md` |

**When updating tools:** Update the Natural Language Guide with full parameters. CLAUDE.md only needs tool name + one-line purpose.

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

**Last Updated:** 2025-12-22
**Documentation Version:** 2.2.0

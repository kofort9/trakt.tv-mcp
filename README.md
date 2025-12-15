# trakt.tv-mcp

[![CI](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/ci.yml)
[![Security Audit](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/security.yml/badge.svg)](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/security.yml)

MCP server for Trakt.tv API - enables AI assistants to track watched shows, movies, and anime using natural language

## Project Links
- Repository: https://github.com/kofifort/trakt.tv-mcp
- Issues: https://github.com/kofifort/trakt.tv-mcp/issues
- Security: see [SECURITY.md](SECURITY.md)
- Code of Conduct: see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Features

- **Natural Language Support**: Use conversational phrases like "watched yesterday", "tonight", "3 days ago", "last Monday"
- **Track Watched Content**: Log movies and TV episodes with flexible date expressions
- **Bulk Logging**: Record multiple episodes or movies at once with range support ("episodes 1-5")
- **Bulk Import Script**: Import 100+ historical entries from CSV files ([see guide](scripts/README.md))
- **Watch History**: Query and summarize your viewing history by date range
- **Search**: Find movies, TV shows, and anime on Trakt.tv
- **Smart Disambiguation**: Automatically handles content with multiple versions or years
- **OAuth 2.0 Authentication**: Secure integration with your Trakt.tv account
- **Langfuse Observability**: Comprehensive AI-native tracing and monitoring ([see docs](docs/operations/observability.md))

## Quick Start

### For Users

**Natural Language Examples:**
```
"Watched Breaking Bad S1E1 yesterday"
"Binged episodes 1-5 of Demon Slayer tonight"
"What did I watch last week?"
"Watched Dune 2021 last Friday"
```

See [Natural Language Guide](docs/guides/NATURAL_LANGUAGE_GUIDE.md) for complete usage documentation.

### Offline capture with `logwatch`

When Claude/AI isn't reachable, queue the note locally and reconcile later. We store only the raw text you provide-no parsing or summaries.

- `logwatch "yesterday watched The Bear S2E5"` - appends the raw note to `~/.trakt-mcp/pending-logs.jsonl`
- `logwatch list` - inspect the queue
- Duplicate raw notes are skipped automatically; rerunning the same input will point you to the already queued entry.

Install the CLI globally with `npm install -g` in this repo or run `npm link` while developing. The queue uses owner-only permissions (600) and follows the [manual E2E plan](docs/operations/manual-e2e-plan.md) for offline capture.

### For AI Assistants (Claude)

This server is designed for AI assistant integration. See [Contributing Guide - AI Assistants Section](docs/guides/CONTRIBUTING.md#for-ai-assistants-integration-guidelines) for:
- How to interpret user queries
- Natural language pattern mapping
- Error handling and disambiguation
- Best practices for conversational interactions

## Documentation

📚 **[Complete Documentation Index](docs/README.md)**

**Quick Links:**
- [Setup Instructions](#setup) (below)
- [Natural Language Guide](docs/guides/NATURAL_LANGUAGE_GUIDE.md) - Complete guide to natural language patterns
- [Observability Guide](docs/operations/observability.md) - OpenTelemetry instrumentation and Honeycomb integration
- [Contributing Guide](docs/guides/CONTRIBUTING.md) - For developers and AI assistants
- [Testing Guide](docs/testing/TESTING_GUIDE.md) - Comprehensive testing documentation
- [E2E Runs](docs/testing/TESTING_GUIDE.md#live-e2e-trakt-api) - Live Trakt API tests (opt-in) and GitHub Action workflow
- [CHANGELOG](CHANGELOG.md) - Version history and release notes
- [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) - Dependency pins and technical debt tracking

## Security

### Logs and Data Privacy

- **Log Directory**: Logs are stored in `~/.trakt-mcp/logs` (user home directory).
- **Permissions**:
  - Directory permissions are restricted to `0o700` (owner read/write/execute only).
  - Log files are restricted to `0o600` (owner read/write only).
- **Retention**:
  - Logs are automatically rotated when they reach 10MB.
  - Maximum of 10 log files are kept (configurable via `maxLogFiles`).
  - Logs older than 7 days are automatically deleted (configurable via `maxLogAge`).
- **Redaction**: Sensitive headers like `Authorization` are redacted from all logs.
- **Platform Notes**:
  - Permission enforcement is active on Linux and macOS (POSIX).
  - On Windows, file permissions are not strictly enforced by `chmod`. Ensure the log directory is in a secure, user-specific location.

### Token Storage

- **Location**: OAuth tokens are stored in `~/.trakt-mcp/.trakt-token.json`
- **Permissions**: Token file is created with `0o600` (owner read/write only)
- **Directory**: Parent directory created with `0o700` (owner only)

### OAuth Authentication

The OAuth device flow includes safeguards against race conditions:

- **Concurrent Polling Prevention**: Only one polling operation can run at a time
- **Cancellation Support**: Use `cancelPolling()` to abort an in-flight authentication
- **State Inspection**: Check `isPollingInProgress()` before starting new polls
- **Automatic Cleanup**: Polling state is always reset after completion or error

## Development

### Prerequisites

- Node.js 20.x or later
- npm
- Trakt.tv account and API credentials

> The repo includes `.nvmrc` (20.19.6) and a `preinstall` guard that fails fast on Node <20. Use `nvm use` or `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"` if you're on Homebrew.

> The repo includes `.nvmrc` (20.19.6) and a `preinstall` guard that fails fast on Node <20. Use `nvm use` or `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"` if you're on Homebrew.

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your Trakt.tv credentials to .env
# TRAKT_CLIENT_ID=your_client_id
# TRAKT_CLIENT_SECRET=your_client_secret
```

### Available Scripts

```bash
# Build the project
npm run build

# Run in development mode with auto-reload
npm run dev

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Check code formatting
npx prettier --check "src/**/*.ts"

# Format code
npm run format

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Bulk import historical data from CSV
npm run bulk-import -- --help
```

### Code Quality

This project uses:
- **TypeScript** with strict mode for type safety
- **ESLint** for code linting
- **Prettier** for code formatting
- **Vitest** for testing

All code changes must pass:
- TypeScript compilation
- ESLint checks
- Prettier formatting checks
- All unit tests

### Continuous Integration

GitHub Actions automatically runs quality checks on every push and pull request:
- TypeScript compilation
- ESLint validation
- Prettier format verification
- Full test suite
- Security audits

See [Branch Protection Recommendations](.github/BRANCH_PROTECTION.md) for setting up branch protection rules.

## Contributing

We welcome contributions! Before submitting changes:

1. Read [CLAUDE.md](CLAUDE.md) for project architecture and guidelines
2. Review [Natural Language Guide](docs/guides/NATURAL_LANGUAGE_GUIDE.md) if adding date/time features
3. See [Contributing Guide](docs/guides/CONTRIBUTING.md) for extending natural language support
4. Ensure all tests pass and code quality checks succeed

## Support

- Usage questions and bugs: open an issue via the templates.
- Security issues: follow [SECURITY.md](SECURITY.md).
- See [SUPPORT.md](SUPPORT.md) for a quick summary.

## License

MIT

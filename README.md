# trakt.tv-mcp

[![CI](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/ci.yml)
[![Security Audit](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/security.yml/badge.svg)](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/security.yml)

MCP server for Trakt.tv API - enables AI assistants to track watched shows, movies, and anime using natural language

## Features

- **Natural Language Support**: Use conversational phrases like "watched yesterday", "tonight", "3 days ago", "last Monday"
- **Track Watched Content**: Log movies and TV episodes with flexible date expressions
- **Bulk Logging**: Record multiple episodes or movies at once with range support ("episodes 1-5")
- **Bulk Import Script**: Import 100+ historical entries from CSV files ([see guide](scripts/README.md))
- **Watch History**: Query and summarize your viewing history by date range
- **Search**: Find movies, TV shows, and anime on Trakt.tv
- **Smart Disambiguation**: Automatically handles content with multiple versions or years
- **OAuth 2.0 Authentication**: Secure integration with your Trakt.tv account

## MCP Resources

The server exposes the following data as read-only resources for AI assistants:

- `trakt://profile` - User profile information (JSON)
- `trakt://watchlist/shows` - TV shows in watchlist (JSON)
- `trakt://watchlist/movies` - Movies in watchlist (JSON)
- `trakt://history/shows/recent` - Recently watched TV shows (last 50 items) (JSON)
- `trakt://history/movies/recent` - Recently watched movies (last 50 items) (JSON)

## Quick Start

### For Users

**Natural Language Examples:**
```
"Watched Breaking Bad S1E1 yesterday"
"Binged episodes 1-5 of Demon Slayer tonight"
"What did I watch last week?"
"Watched Dune 2021 last Friday"
```

See [Natural Language Patterns Guide](docs/guides/NATURAL_LANGUAGE_PATTERNS.md) for complete usage documentation.

### For AI Assistants (Claude)

This server is designed for AI assistant integration. See [Claude Prompt Guidelines](docs/guides/CLAUDE_PROMPT_GUIDELINES.md) for:
- How to interpret user queries
- Natural language pattern mapping
- Error handling and disambiguation
- Best practices for conversational interactions

## Documentation

📚 **[Complete Documentation Index](docs/README.md)**

**Quick Links:**
- [Setup Instructions](#setup) (below)
- [Natural Language Patterns](docs/guides/NATURAL_LANGUAGE_PATTERNS.md) - How to use conversational date/time expressions
- [NL Patterns Quick Reference](docs/guides/NL_PATTERNS_REFERENCE.md) - Cheat sheet
- [Claude Integration Guide](docs/guides/CLAUDE_PROMPT_GUIDELINES.md) - For AI assistants
- [Testing Documentation](docs/testing/) - Test reports and quality assurance
- [CHANGELOG](CHANGELOG.md) - Version history and release notes

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

## Development

### Prerequisites

- Node.js 20.x or later
- npm
- Trakt.tv account and API credentials

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
2. Review [Natural Language Patterns Guide](docs/guides/NATURAL_LANGUAGE_PATTERNS.md) if adding date/time features
3. See [Contributing NL Patterns](docs/guides/CONTRIBUTING_NL.md) for extending natural language support
4. Ensure all tests pass and code quality checks succeed

## License

MIT

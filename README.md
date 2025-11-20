# trakt.tv-mcp

[![CI](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/ci.yml)
[![Security Audit](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/security.yml/badge.svg)](https://github.com/kofifort/trakt.tv-mcp/actions/workflows/security.yml)

MCP server for Trakt.tv API - enables AI assistants to track watched shows, movies, and anime

## Features

- Track watched content on Trakt.tv via AI assistants like Claude
- Search for movies, TV shows, and anime
- Log individual episodes or entire seasons
- View watch history and statistics
- Full OAuth 2.0 authentication support

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

## License

MIT

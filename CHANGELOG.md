# Changelog

All notable changes to the Trakt.tv MCP server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MCP Resources for read-only access:
  - `trakt://profile`: User profile information
  - `trakt://watchlist/shows`: TV shows watchlist
  - `trakt://watchlist/movies`: Movies watchlist
  - `trakt://history/shows/recent`: Recent TV show history
  - `trakt://history/movies/recent`: Recent movie history
- Comprehensive natural language date parsing support
- Time-of-day expressions ("tonight", "this morning", "this evening")
- Relative date patterns ("N days ago", "N weeks ago", "last night")
- Weekday references ("last Monday", "last Friday")
- Month-based queries ("January 2025", "this month")
- Parameter aliases: `title` can be used instead of `movieName`/`showName`
- Date validation with helpful error messages
- Zero-value rejection for ambiguous dates ("0 days ago")
- Maximum bounds validation (365 days, 52 weeks)
- Empty string validation for date parameters

### Changed
- Improved error messages with actionable suggestions
- Enhanced disambiguation responses for ambiguous content
- Standardized error response format across all tools
- Updated documentation structure with organized subdirectories

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

- [GitHub Repository](https://github.com/kofifort/trakt.tv-mcp)
- [Trakt.tv API Documentation](https://trakt.docs.apiary.io/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

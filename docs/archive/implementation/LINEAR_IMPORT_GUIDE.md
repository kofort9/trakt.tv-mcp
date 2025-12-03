---
**⚠️ ARCHIVED DOCUMENT**

This document is historical and may contain outdated information.

**Archived:** November 2025
**Reason:** Linear integration guide for historical reference
**For current information, see:** [docs/README.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/README.md)

---

# Linear Issues Import Guide - Trakt.tv MCP Server

**Project:** KHQ/trakttv-mcp
**Team:** KHQ
**Total Issues:** 18 (3 P1 High Priority, 15 P2 Medium Priority)
**Import Date:** 2025-11-21

---

## How to Use This Guide

This document contains all 18 issues formatted for import into Linear. You can:

1. Copy-paste each issue description into Linear's web interface
2. Use Linear's API to programmatically import these issues
3. Reference this guide when creating issues manually

Each issue includes:

- Title (max 80 characters, action-oriented)
- Priority level
- Labels (tags)
- Complete description with context, requirements, and acceptance criteria
- Related/blocking issues
- Affected files

---

## P1 Issues (High Priority) - 3 Issues

### Issue 1: Cache Memory Tracking Implementation

**Priority:** High
**Labels:** Enhancement, Performance, Tech Debt
**Team:** KHQ

**Description:**

Add memory usage tracking and metrics to LRU cache to prevent unbounded memory growth and provide visibility into cache effectiveness.

## Context

The current LRU cache implementation (`src/utils/cache.ts`) doesn't provide visibility into memory usage. As the cache grows, it could consume unbounded memory without any warnings or metrics. This issue addresses the need for memory tracking and proactive management.

## Requirements

- Track total memory size of all cached entries
- Implement a `getCurrentMemoryUsage()` method that returns memory metrics
- Warn when memory usage approaches configured limits
- Export memory metrics as part of cache statistics
- Ensure accurate memory calculations for different data types
- Document memory behavior and tracking methodology

## Affected Files

- `src/utils/cache.ts` (lines 1-50)

## Related Issues

- #12 (Cache Invalidation on Write)
- #13 (Periodic Background Cache Pruning)
- #14 (Configurable Cache Parameters)

## Acceptance Criteria

- [ ] Memory size tracking implemented for all cached entries
- [ ] `getCurrentMemoryUsage()` method returns accurate memory statistics
- [ ] Memory threshold warnings triggered at 80% and 95% capacity
- [ ] Memory metrics included in cache.getStatistics() output
- [ ] Comprehensive tests for memory tracking accuracy
- [ ] Documentation updated with memory behavior details

---

### Issue 2: Log Directory Security Hardening

**Priority:** High
**Labels:** Security, Bug, Tech Debt
**Team:** KHQ

**Description:**

Move log directory from project root to user-specific directory with restricted permissions and implement automatic cleanup to prevent sensitive data exposure.

## Context

Currently, logs are written to the project directory which may contain sensitive information (OAuth tokens, user data, API responses). This poses a security risk, especially in shared or production environments. Logs should be stored in a user-specific location with restricted permissions and automatic cleanup policies.

## Requirements

- Move log directory from project root to `~/.trakt-mcp/logs/`
- Set file permissions to 600 (owner read/write only)
- Implement automatic log rotation after 7 days
- Add mechanism to cleanup expired log files
- Update all documentation with new log location
- Add tests to verify permission settings

## Affected Files

- `src/utils/logger.ts` (lines 20-40)
- `src/utils/debug.ts` (lines 10-30)

## Related Issues

- #4 (File Logging Directory Robustness)

## Acceptance Criteria

- [ ] Log directory created at `~/.trakt-mcp/logs/` on first run
- [ ] Files created with 600 permissions (owner read/write only)
- [ ] Automatic log rotation triggered after 7 days
- [ ] Old log files cleaned up automatically
- [ ] Documentation updated with new log location and security notes
- [ ] Permission tests verify correct access restrictions

---

### Issue 3: Debug Tool Usage Documentation

**Priority:** High
**Labels:** Documentation
**Team:** KHQ

**Description:**

Create comprehensive debugging guide with examples for common troubleshooting scenarios using the debug tool and log analysis.

## Context

The debug tool provides powerful capabilities for troubleshooting, but users need clear guidance on how to use it effectively. This documentation should cover common scenarios, log analysis techniques, and debugging patterns.

## Requirements

- Document all debug tool commands and available flags
- Provide practical examples for common debugging scenarios
- Create guide for analyzing and resolving rate limit issues
- Add troubleshooting section for authentication failures
- Document log file locations, formats, and rotation policies
- Explain correlation ID usage and how to track related requests
- Include performance profiling examples and best practices

## Affected Files

- Create new file: `docs/DEBUGGING.md`
- Reference: `src/utils/debug.ts`

## Related Issues

- #5 (Time-Based Log Filtering)
- #6 (Request Replay Capability)
- #7 (Performance Profiling by Endpoint)
- #9 (Correlation ID Auto-Extraction)

## Acceptance Criteria

- [ ] All debug tool commands documented with examples
- [ ] At least 5 common debugging scenarios covered
- [ ] Rate limit troubleshooting guide included
- [ ] Authentication failure troubleshooting section added
- [ ] Log file locations and formats documented
- [ ] Correlation ID usage guide with examples
- [ ] Performance profiling examples and best practices included

---

## P2 Issues (Medium Priority) - 15 Issues

### Issue 4: File Logging Directory Robustness

**Priority:** Medium
**Labels:** Enhancement, Bug
**Team:** KHQ

**Description:**

Add retry logic and fallback mechanisms for log directory creation to handle filesystem errors gracefully.

## Context

Log directory creation can fail due to permission issues, disk full, or filesystem problems. The system should handle these gracefully with retry logic and fallback to temporary directories rather than failing completely.

## Requirements

- Implement retry logic with exponential backoff (up to 3 attempts)
- Add fallback to system temp directory if primary location fails
- Log warnings when fallback directory is used
- Handle permission errors gracefully with informative error messages
- Add comprehensive tests for various failure scenarios
- Document fallback behavior in configuration docs

## Affected Files

- `src/utils/logger.ts` (lines 20-40)

## Related Issues

- #2 (Log Directory Security Hardening)

## Acceptance Criteria

- [ ] Retry logic implements exponential backoff (1s, 2s, 4s)
- [ ] Fallback to temp directory on all failures
- [ ] Warnings logged when using fallback directory
- [ ] Permission errors handled gracefully
- [ ] Tests cover permission denied, disk full, and race conditions
- [ ] Fallback behavior documented in configuration guide

---

### Issue 5: Time-Based Log Filtering

**Priority:** Medium
**Labels:** Enhancement, Feature
**Team:** KHQ

**Description:**

Add date range filtering to debug tool to enable targeted analysis of logs from specific time periods.

## Context

When debugging, users need to focus on specific time windows. Adding time-based filtering to the debug tool makes it easier to analyze relevant logs without being overwhelmed by unrelated entries.

## Requirements

- Add `--start-date` and `--end-date` CLI flags
- Support multiple date formats (ISO 8601, relative like "1h ago", "2h ago")
- Filter logs by timestamp within the specified range
- Validate date range inputs and provide helpful error messages
- Include usage examples in help text and documentation
- Add tests for date parsing and filter accuracy

## Affected Files

- `src/utils/debug.ts` (lines 50-100)

## Related Issues

- #3 (Debug Tool Usage Documentation)
- #6 (Request Replay Capability)

## Acceptance Criteria

- [ ] `--start-date` and `--end-date` flags implemented
- [ ] ISO 8601 and relative date formats supported
- [ ] Logs filtered correctly within specified time range
- [ ] Invalid date inputs produce helpful error messages
- [ ] Examples provided in help text
- [ ] Tests verify date parsing and filtering accuracy

---

### Issue 6: Request Replay Capability

**Priority:** Medium
**Labels:** Feature, Enhancement
**Team:** KHQ

**Description:**

Implement request replay functionality in debug tool to re-execute failed API requests for troubleshooting.

## Context

When requests fail, users need to understand what went wrong and potentially retry with different parameters. A replay capability allows users to re-execute the same request and compare responses, which is crucial for debugging API issues.

## Requirements

- Add `--replay` flag with request ID parameter
- Store original request details in logs (method, URL, headers, body)
- Implement replay execution that uses the original parameters
- Display side-by-side comparison of original and replayed responses
- Add dry-run mode (`--dry-run`) to preview replay without execution
- Document replay limitations and best practices

## Affected Files

- `src/utils/debug.ts` (lines 100-150)
- `src/api/client.ts` (lines 50-100)

## Related Issues

- #3 (Debug Tool Usage Documentation)
- #5 (Time-Based Log Filtering)
- #7 (Performance Profiling by Endpoint)

## Acceptance Criteria

- [ ] `--replay` flag accepts request ID and re-executes original request
- [ ] Original request details (method, URL, headers, body) stored in logs
- [ ] Replay execution uses original parameters correctly
- [ ] Original and replayed responses displayed side-by-side
- [ ] `--dry-run` mode previews replay without execution
- [ ] Replay limitations and usage documented

---

### Issue 7: Performance Profiling by Endpoint

**Priority:** Medium
**Labels:** Enhancement, Performance
**Team:** KHQ

**Description:**

Aggregate and display performance metrics grouped by API endpoint to identify bottlenecks.

## Context

Understanding which endpoints are slowest helps identify performance bottlenecks. The debug tool should provide aggregated performance metrics organized by endpoint, making it easy to spot problem areas.

## Requirements

- Track response times for each API endpoint
- Calculate min, max, average, and p95 latencies by endpoint
- Display top 10 slowest endpoints in debug output
- Add `--endpoint` flag to filter metrics by specific endpoint
- Include request count per endpoint
- Export metrics in JSON format for further analysis

## Affected Files

- `src/utils/debug.ts` (lines 150-200)
- `src/api/client.ts` (lines 100-150)

## Related Issues

- #3 (Debug Tool Usage Documentation)
- #6 (Request Replay Capability)

## Acceptance Criteria

- [ ] Response times tracked per API endpoint
- [ ] Min/max/avg/p95 latencies calculated and displayed
- [ ] Top 10 slowest endpoints shown in debug output
- [ ] `--endpoint` flag filters metrics by specific endpoint
- [ ] Request count per endpoint included
- [ ] JSON export format for analysis and reporting

---

### Issue 8: Rate Limit Warning Threshold

**Priority:** Medium
**Labels:** Enhancement, UX
**Team:** KHQ

**Description:**

Implement proactive warnings when approaching rate limits to prevent request failures.

## Context

Trakt.tv API enforces rate limits (1000 requests per 5 minutes). Users need proactive warnings when approaching these limits so they can slow down requests before hitting the limit and getting errors.

## Requirements

- Track remaining rate limit from API response headers
- Warn when remaining requests drop below 20% of limit
- Log warning messages with reset time information
- Add optional callback for custom warning handling
- Include rate limit status in debug tool output
- Add tests for threshold detection

## Affected Files

- `src/api/client.ts` (lines 150-200)
- `src/utils/logger.ts` (lines 40-60)

## Related Issues

None

## Acceptance Criteria

- [ ] Remaining rate limit tracked from API headers
- [ ] Warnings triggered when remaining < 20% of limit
- [ ] Warning messages include reset time
- [ ] Optional callback support for custom handling
- [ ] Rate limit status displayed in debug tool
- [ ] Tests verify threshold detection and warnings

---

### Issue 9: Correlation ID Auto-Extraction

**Priority:** Medium
**Labels:** Enhancement, UX
**Team:** KHQ

**Description:**

Automatically extract and display correlation IDs from error messages to simplify debugging.

## Context

API responses and logs contain correlation IDs that help track related requests. Automatically extracting and highlighting these IDs makes it easier for users to trace requests through logs without manual parsing.

## Requirements

- Parse correlation IDs from error messages and logs
- Support multiple ID formats (UUID, numeric IDs, custom formats)
- Add `--correlation-id` flag to filter logs by ID
- Display all logs with the same correlation ID grouped together
- Highlight correlation IDs in debug tool output
- Add tests for ID extraction patterns

## Affected Files

- `src/utils/debug.ts` (lines 30-50)
- `src/utils/logger.ts` (lines 60-80)

## Related Issues

- #3 (Debug Tool Usage Documentation)

## Acceptance Criteria

- [ ] Correlation IDs extracted from error messages and logs
- [ ] Support for UUID, numeric, and custom ID formats
- [ ] `--correlation-id` flag filters logs by ID
- [ ] All logs with same correlation ID displayed together
- [ ] Correlation IDs highlighted in debug output
- [ ] Tests for ID extraction patterns

---

### Issue 10: Archive Historical Test Reports

**Priority:** Medium
**Labels:** Tech Debt, Test
**Team:** KHQ

**Description:**

Move historical test reports to archive/ subdirectory to reduce clutter in reports/ folder.

## Context

The reports/ folder accumulates historical test reports that are no longer actively used. Archiving old reports keeps the repository clean and makes it easier to find current reports.

## Requirements

- Create `reports/archive/` directory
- Move all reports older than current sprint to archive/
- Keep only the latest 3 reports in reports/ root
- Update .gitignore if needed
- Document archival policy in README or contributing guide
- Add npm script for automatic archival

## Affected Files

- `reports/nlp-test-report-*.txt` (all historical files)
- Create: `reports/archive/` directory

## Related Issues

None

## Acceptance Criteria

- [ ] `reports/archive/` directory created
- [ ] All reports older than current sprint moved to archive/
- [ ] Only latest 3 reports remain in reports/ root
- [ ] .gitignore updated if necessary
- [ ] Archival policy documented
- [ ] npm script created for automatic archival

---

### Issue 11: Integration Testing Framework Setup

**Priority:** Medium
**Labels:** Test, Tech Debt
**Team:** KHQ

**Description:**

Implement deferred Phase 4 integration testing framework with mocked Trakt API responses.

## Context

Phase 4 of the roadmap includes comprehensive integration testing. This issue sets up the testing framework with mocked Trakt API responses to enable testing of complete workflows without hitting the real API.

## Requirements

- Set up directory structure for integration tests (`src/__tests__/integration/`)
- Implement Trakt API mock server using nock or similar
- Create tests for OAuth authentication flow
- Create tests for search operations
- Create tests for history sync operations
- Integrate tests into CI pipeline
- Document integration test patterns and best practices

## Affected Files

- Create: `src/__tests__/integration/` directory
- Reference: `docs/ROADMAP.md` (Phase 4)

## Related Issues

None

## Acceptance Criteria

- [ ] Integration test directory structure created
- [ ] Trakt API mock server implemented
- [ ] Auth flow tests implemented
- [ ] Search operation tests implemented
- [ ] History sync tests implemented
- [ ] Tests integrated into CI pipeline
- [ ] Integration test patterns documented

---

### Issue 12: Cache Invalidation on Write

**Priority:** Medium
**Labels:** Enhancement, Bug
**Team:** KHQ

**Description:**

Clear relevant cache entries when history modifications occur to prevent stale data issues.

## Context

The cache can become stale when users modify their watch history outside of the current session. Cache entries must be invalidated when write operations occur to ensure consistency between the server and Trakt API.

## Requirements

- Implement `cache.invalidate(key)` method
- Invalidate user history cache when mark-watched operations occur
- Invalidate watchlist cache when add/remove operations occur
- Support pattern-based invalidation (e.g., "user:\*" to invalidate all user entries)
- Add comprehensive tests for various invalidation scenarios
- Document cache invalidation strategy

## Affected Files

- `src/utils/cache.ts` (lines 50-100)
- `src/api/history.ts` (all write methods)

## Related Issues

- #1 (Cache Memory Tracking Implementation)
- #13 (Periodic Background Cache Pruning)
- #14 (Configurable Cache Parameters)

## Acceptance Criteria

- [ ] `cache.invalidate(key)` method implemented
- [ ] History cache invalidated on mark-watched operations
- [ ] Watchlist cache invalidated on add/remove operations
- [ ] Pattern-based invalidation (e.g., "user:\*") supported
- [ ] Tests verify invalidation scenarios
- [ ] Cache invalidation strategy documented

---

### Issue 13: Periodic Background Cache Pruning

**Priority:** Medium
**Labels:** Enhancement, Performance
**Team:** KHQ

**Description:**

Implement 15-minute background timer to prune expired cache entries proactively.

## Context

Cache entries expire, but they remain in memory until the next access. A background pruning mechanism removes expired entries proactively, freeing memory and keeping the cache efficient.

## Requirements

- Add `startPeriodicPruning()` method with 15-minute interval
- Implement `stopPeriodicPruning()` for cleanup on shutdown
- Remove expired entries during each pruning cycle
- Log pruning statistics (entries removed, memory freed)
- Ensure timer is properly cleaned up on server shutdown
- Add tests for pruning behavior

## Affected Files

- `src/utils/cache.ts` (lines 100-150)

## Related Issues

- #1 (Cache Memory Tracking Implementation)
- #12 (Cache Invalidation on Write)
- #14 (Configurable Cache Parameters)

## Acceptance Criteria

- [ ] `startPeriodicPruning()` method with 15-min interval
- [ ] `stopPeriodicPruning()` properly cleans up timer
- [ ] Expired entries removed during pruning cycles
- [ ] Pruning statistics logged (entries removed, memory freed)
- [ ] Timer cleanup verified on server shutdown
- [ ] Tests verify pruning behavior

---

### Issue 14: Configurable Cache Parameters

**Priority:** Medium
**Labels:** Enhancement, UX
**Team:** KHQ

**Description:**

Accept cache size and TTL as constructor parameters to allow runtime configuration.

## Context

Different deployments may have different memory constraints and caching needs. Making cache parameters configurable allows each deployment to optimize cache behavior for their specific environment.

## Requirements

- Add constructor parameters for `maxSize` and `defaultTTL`
- Validate parameter ranges (size > 0, TTL > 0)
- Support environment variable overrides
- Update cache initialization in server startup code
- Document all configuration options
- Add tests for various configurations

## Affected Files

- `src/utils/cache.ts` (lines 1-30)
- `src/index.ts` (cache initialization)

## Related Issues

- #1 (Cache Memory Tracking Implementation)
- #12 (Cache Invalidation on Write)
- #13 (Periodic Background Cache Pruning)

## Acceptance Criteria

- [ ] Constructor parameters `maxSize` and `defaultTTL` implemented
- [ ] Parameter validation (size > 0, TTL > 0)
- [ ] Environment variable overrides supported
- [ ] Server startup updated with new parameters
- [ ] Configuration options documented
- [ ] Tests for various configurations

---

### Issue 15: Persistent Cache Storage Implementation

**Priority:** Medium
**Labels:** Feature, Enhancement
**Team:** KHQ

**Description:**

Implement disk-based or Redis cache persistence to maintain cache across server restarts.

## Context

The current in-memory cache is lost when the server restarts, requiring all data to be fetched again from the Trakt API. Persistent cache storage maintains cached data across restarts, improving startup performance and reducing API calls.

## Requirements

- Design cache serialization format (JSON or binary)
- Implement disk-based persistence using JSON or SQLite
- Add cache rehydration on server startup
- Handle corrupted cache files gracefully with warnings
- Add configuration option for persistence backend (memory/disk/redis)
- Include performance benchmarks comparing persistence methods
- Add comprehensive tests for persistence and rehydration

## Affected Files

- `src/utils/cache.ts` (lines 150-250)
- Create: `src/utils/cache-persistence.ts`

## Related Issues

- #1 (Cache Memory Tracking Implementation)
- #12 (Cache Invalidation on Write)
- #13 (Periodic Background Cache Pruning)
- #14 (Configurable Cache Parameters)

## Acceptance Criteria

- [ ] Serialization format designed (JSON or binary)
- [ ] Disk persistence implemented (JSON or SQLite)
- [ ] Cache rehydrated on server startup
- [ ] Corrupted cache files handled gracefully
- [ ] Backend configuration option (memory/disk/redis)
- [ ] Performance benchmarks included
- [ ] Persistence and rehydration tests

---

### Issue 16: GitHub Repository Templates

**Priority:** Medium
**Labels:** Documentation, Tech Debt
**Team:** KHQ

**Description:**

Create PR and issue templates plus CODEOWNERS file to standardize contributions.

## Context

Standardized templates help contributors follow best practices and provide maintainers with necessary information. Templates and CODEOWNERS file improve the quality and consistency of contributions.

## Requirements

- Create PR template with checklist (tests, docs, changelog)
- Create bug report template with reproduction steps section
- Create feature request template with use case section
- Define CODEOWNERS for critical paths (authentication, API client, cache)
- Add reference to contributing guidelines in templates
- Test templates by creating sample PR/issue

## Affected Files

- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/CODEOWNERS`

## Related Issues

- #17 (Security Policy Documentation)

## Acceptance Criteria

- [ ] PR template created with test/doc/changelog checklist
- [ ] Bug report template with reproduction steps
- [ ] Feature request template with use case section
- [ ] CODEOWNERS defined for critical paths
- [ ] Contributing guidelines referenced in templates
- [ ] Sample PR/issue created to test templates

---

### Issue 17: Security Policy Documentation

**Priority:** Medium
**Labels:** Security, Documentation
**Team:** KHQ

**Description:**

Create SECURITY.md with vulnerability reporting process and security best practices.

## Context

A clear security policy helps users and security researchers report vulnerabilities responsibly. The policy should document the vulnerability reporting process, supported versions, and security best practices specific to this project.

## Requirements

- Document vulnerability reporting process and timeline
- Provide secure contact method (email address or form)
- List supported versions eligible for security updates
- Document OAuth token security practices
- Include log security considerations (permissions, sensitive data)
- Add expected response timeline for vulnerability reports
- Reference relevant security features (log permissions, encryption)

## Affected Files

- Create: `SECURITY.md`

## Related Issues

- #2 (Log Directory Security Hardening)
- #16 (GitHub Repository Templates)

## Acceptance Criteria

- [ ] Vulnerability reporting process documented
- [ ] Secure contact method provided
- [ ] Supported versions listed
- [ ] OAuth token security practices documented
- [ ] Log security considerations included
- [ ] Response timeline specified
- [ ] Security features referenced

---

### Issue 18: MCP Resources Implementation

**Priority:** Medium
**Labels:** Feature, Enhancement
**Team:** KHQ

**Description:**

Expose user data as MCP resources (watched history, watchlist, profile) for read-only access by AI assistants.

## Context

The MCP standard includes resource handlers that expose data for read-only access. Implementing resource handlers allows AI assistants to query user's watched history, watchlist, and profile information directly through the MCP interface, enabling more intelligent interactions.

## Requirements

- Implement MCP resource handlers for history, watchlist, and profile
- Define resource URIs (e.g., `trakt://history`, `trakt://watchlist`, `trakt://profile`)
- Add pagination support for large datasets
- Include metadata (last updated timestamp, item count)
- Register resources in MCP server setup
- Add tests for resource handlers
- Document resource usage and format in README

## Affected Files

- `src/index.ts` (server setup)
- Create: `src/resources/` directory
- Create: `src/resources/history.ts`
- Create: `src/resources/watchlist.ts`
- Create: `src/resources/profile.ts`

## Related Issues

None

## Acceptance Criteria

- [ ] MCP resource handlers implemented for history, watchlist, profile
- [ ] Resource URIs defined (trakt://history, trakt://watchlist, trakt://profile)
- [ ] Pagination support for large datasets
- [ ] Metadata included (last updated, item count)
- [ ] Resources registered in MCP server
- [ ] Tests for resource handlers
- [ ] Resource usage documented in README

---

## Issue Relationships & Dependencies

### Related Issue Groups

**Cache-Related Issues (Interconnected):**

- #1 Cache Memory Tracking Implementation
- #12 Cache Invalidation on Write
- #13 Periodic Background Cache Pruning
- #14 Configurable Cache Parameters
- #15 Persistent Cache Storage Implementation

**Logging & Security Issues:**

- #2 Log Directory Security Hardening
- #4 File Logging Directory Robustness
- #17 Security Policy Documentation

**Debug & Troubleshooting Issues:**

- #3 Debug Tool Usage Documentation
- #5 Time-Based Log Filtering
- #6 Request Replay Capability
- #7 Performance Profiling by Endpoint
- #9 Correlation ID Auto-Extraction

**Documentation & Standards:**

- #16 GitHub Repository Templates
- #17 Security Policy Documentation
- #18 MCP Resources Implementation

---

## Priority & Effort Summary

| Issue # | Title                         | Priority | Labels                              | Est. Effort |
| ------- | ----------------------------- | -------- | ----------------------------------- | ----------- |
| 1       | Cache Memory Tracking         | High     | Enhancement, Performance, Tech Debt | Medium      |
| 2       | Log Directory Security        | High     | Security, Bug, Tech Debt            | Medium      |
| 3       | Debug Tool Documentation      | High     | Documentation                       | Medium      |
| 4       | File Logging Robustness       | Medium   | Enhancement, Bug                    | Small       |
| 5       | Time-Based Log Filtering      | Medium   | Enhancement, Feature                | Small       |
| 6       | Request Replay Capability     | Medium   | Feature, Enhancement                | Medium      |
| 7       | Performance Profiling         | Medium   | Enhancement, Performance            | Medium      |
| 8       | Rate Limit Warning            | Medium   | Enhancement, UX                     | Small       |
| 9       | Correlation ID Extraction     | Medium   | Enhancement, UX                     | Small       |
| 10      | Archive Test Reports          | Medium   | Tech Debt, Test                     | Trivial     |
| 11      | Integration Testing Framework | Medium   | Test, Tech Debt                     | Large       |
| 12      | Cache Invalidation            | Medium   | Enhancement, Bug                    | Medium      |
| 13      | Background Cache Pruning      | Medium   | Enhancement, Performance            | Small       |
| 14      | Configurable Cache Parameters | Medium   | Enhancement, UX                     | Small       |
| 15      | Persistent Cache Storage      | Medium   | Feature, Enhancement                | Large       |
| 16      | GitHub Templates              | Medium   | Documentation, Tech Debt            | Small       |
| 17      | Security Policy Documentation | Medium   | Security, Documentation             | Small       |
| 18      | MCP Resources Implementation  | Medium   | Feature, Enhancement                | Large       |

---

## Next Steps

1. **Review All Issues**: Verify titles, descriptions, and acceptance criteria
2. **Adjust Labels**: Confirm labels match Linear project configuration
3. **Set Relationships**: After creation, link related issues to establish dependencies
4. **Assign Issues**: Distribute issues to team members based on effort estimation
5. **Create Milestones**: Group issues into sprints or phases for tracking

---

## Notes

- All file paths are relative to repository root: `/Users/kofifort/Repos/trakt.tv-mcp`
- Line numbers in "Affected Files" are approximate and should be verified during implementation
- Priority mapping: P1 → High, P2 → Medium
- Labels can be customized based on Linear project configuration
- Related issue references (e.g., #12, #13) should be updated after creation with actual Linear issue IDs

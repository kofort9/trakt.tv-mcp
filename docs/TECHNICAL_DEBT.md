# Technical Debt & Future Improvements

This document tracks technical debt, deferred improvements, and enhancement opportunities for the Trakt.tv MCP server project.

**Last Updated:** 2025-11-20
**Document Version:** 1.0.0

---

## Table of Contents

- [Overview](#overview)
- [Priority Levels](#priority-levels)
- [Performance & Optimization](#performance--optimization)
- [Security & Infrastructure](#security--infrastructure)
- [Documentation & Organization](#documentation--organization)
- [Testing & Quality](#testing--quality)
- [Feature Enhancements](#feature-enhancements)

---

## Overview

This document serves as a centralized registry for:

1. **Technical Debt**: Code or architecture that needs refactoring or improvement
2. **Deferred Features**: Planned enhancements not yet implemented
3. **Infrastructure Improvements**: Operational and deployment optimizations
4. **Security Hardening**: Security enhancements to consider
5. **Documentation Gaps**: Missing or incomplete documentation

Items are categorized by area and tagged with priority levels (P0-P2).

---

## Priority Levels

| Priority | Description | Timeline |
|----------|-------------|----------|
| **P0** | Critical - Blocks production use or major security risk | Immediate |
| **P1** | High - Significant impact on performance or UX | Next sprint |
| **P2** | Medium - Nice to have, improves quality | Backlog |

---

## Performance & Optimization

### Memory Tracking for Cache Metrics

**Priority:** P1
**Area:** Performance Monitoring
**Added:** 2025-11-20

**Current State:**
- LRU cache (`/Users/kofifort/Repos/trakt.tv-mcp/src/lib/cache.ts`) tracks operational metrics:
  - Hit/miss counts
  - Eviction counts
  - Hit rate percentage
  - Entry count (size)
- Memory consumption is not tracked

**Problem:**
The cache configuration uses `maxSize` to limit entries (default: 500), but actual memory usage is unknown. Large cached values (e.g., search results with extensive metadata) could consume significant memory without visibility.

**Proposed Solution:**
Add memory tracking to `CacheMetrics` interface and `LRUCache` class:

```typescript
export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  // Add these:
  memoryBytesUsed: number;      // Approximate memory usage
  avgEntrySize: number;          // Average entry size in bytes
  maxMemoryBytes?: number;       // Optional memory limit
}
```

**Implementation Notes:**
- Calculate approximate memory using `Buffer.byteLength(JSON.stringify(entry))`
- Track per-entry memory on `set()` and update on `delete()`/`prune()`
- Consider adding memory-based eviction as alternative to count-based eviction
- Add warning logs when memory usage exceeds thresholds

**Affected Files:**
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/cache.ts` (lines 18-24, 36-228)
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/__tests__/cache.test.ts`
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/__tests__/cache-performance.test.ts`

**Estimated Effort:** 4-6 hours

---

## Security & Infrastructure

### Log Directory Security Hardening

**Priority:** P1
**Area:** Security, Infrastructure
**Added:** 2025-11-20

**Current State:**
- Logger writes to `os.tmpdir()/trakt-mcp-logs` by default (`/Users/kofifort/Repos/trakt.tv-mcp/src/lib/logger.ts`, line 100)
- Log files contain sensitive data:
  - Request/response bodies (truncated to 5KB)
  - Redacted auth headers
  - User activity patterns
  - Rate limit information
- Directory created with default permissions via `fs.mkdirSync(path, { recursive: true })` (line 268)
- No explicit permission restrictions

**Security Concerns:**

1. **Shared Temp Directory Risk:**
   - `os.tmpdir()` is world-readable on many systems
   - Other users/processes can potentially access logs
   - Temp directories may not be automatically cleaned up

2. **Missing Access Controls:**
   - No explicit file permissions set during directory/file creation
   - Could expose user viewing history and API tokens (even redacted, patterns may leak info)

3. **Log Retention:**
   - No automatic cleanup mechanism for old rotated log files
   - Disk space could grow unbounded

**Proposed Solutions:**

#### 1. Restrict Directory Permissions
```typescript
private ensureLogDirectory(): void {
  try {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, {
        recursive: true,
        mode: 0o700  // Owner read/write/execute only
      });
    } else {
      // Ensure existing directory has correct permissions
      fs.chmodSync(this.logDirectory, 0o700);
    }
  } catch (error) {
    console.error('Failed to create log directory:', error);
    this.enableFileLogging = false;
  }
}
```

#### 2. Use User-Specific Directory
Change default from shared temp to user-specific:
```typescript
// Current:
this.logDirectory = config.logDirectory || path.join(os.tmpdir(), 'trakt-mcp-logs');

// Proposed:
this.logDirectory = config.logDirectory || path.join(
  os.homedir(),
  '.trakt-mcp',
  'logs'
);
```

#### 3. Implement Log Cleanup
Add configuration and cleanup mechanism:
```typescript
export interface LoggerConfig {
  maxBufferSize?: number;
  maxFileSize?: number;
  logDirectory?: string;
  enableFileLogging?: boolean;
  // Add these:
  maxLogAge?: number;        // Max age in days (default: 7)
  maxLogFiles?: number;      // Max number of rotated files (default: 10)
}
```

#### 4. Set File Permissions on Write
Ensure individual log files are also restricted:
```typescript
private writeToFile(log: RequestLog): void {
  try {
    this.ensureLogDirectory();

    const logLine = JSON.stringify(log) + '\n';
    const logSize = Buffer.byteLength(logLine);

    if (this.currentFileSize + logSize > this.maxFileSize) {
      this.currentLogFile = this.getNewLogFileName();
      this.currentFileSize = 0;
    }

    fs.appendFileSync(this.currentLogFile, logLine);
    // Add permission restriction
    fs.chmodSync(this.currentLogFile, 0o600); // Owner read/write only
    this.currentFileSize += logSize;
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}
```

**Affected Files:**
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/logger.ts` (lines 86-402)
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/__tests__/logger.test.ts`
- Configuration documentation (if exists)
- README.md (update security section if present)

**Rollout Considerations:**
- Users with existing logs in `tmpdir` won't be automatically migrated
- Consider migration path or documentation for existing users
- Test on macOS, Linux, and Windows (permission models differ)
- Ensure graceful degradation if permission changes fail

**Estimated Effort:** 6-8 hours (including testing across platforms)

---

## Documentation & Organization

### Move Completion Reports to Archive

**Priority:** P2
**Area:** Documentation Organization
**Added:** 2025-11-20

**Current State:**
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/` contains multiple test reports from various phases
- Some reports are historical snapshots (e.g., `PHASE3_TEST_SUMMARY.md`, `FINAL_TEST_REPORT_WITH_BUGS.md`)
- Archive directory exists at `/Users/kofifort/Repos/trakt.tv-mcp/docs/archive/` with bug reports

**Problem:**
- Testing directory is cluttered with historical completion reports
- Difficult to distinguish active test documentation from historical records
- New contributors may be confused about which reports are current

**Proposed Solution:**

#### Create Organized Archive Structure
```
docs/
├── archive/
│   ├── bug-reports/              # Bug tracking history
│   │   ├── BUG_FIX_REPORT.md
│   │   └── CRITICAL_BUGS_AND_PLAN.md
│   ├── completion-reports/        # NEW: Phase completion snapshots
│   │   ├── PHASE3_TEST_SUMMARY.md
│   │   ├── PHASE3_TEST_RESULTS.md
│   │   ├── PHASE3_TESTING_SUMMARY.md
│   │   └── FINAL_TEST_REPORT_WITH_BUGS.md
│   └── README.md                  # Archive index
├── testing/                       # Active test docs only
│   ├── PHASE3_COMPREHENSIVE_TEST_REPORT.md  # Keep: current reference
│   ├── PHASE3_RETEST_EXECUTIVE_SUMMARY.md   # Keep: latest results
│   ├── PHASE3_RETEST_RESULTS.md             # Keep: latest results
│   ├── NATURAL_LANGUAGE_TEST_REPORT.md      # Keep: current feature
│   ├── SUMMARIZE_HISTORY_TEST_SUMMARY.md    # Keep: current feature
│   ├── TEST_REPORT_summarize_history.md     # Keep: current feature
│   └── TEST_QUICK_REFERENCE.md              # Keep: active reference
```

#### Determine Which Reports to Archive

**Archive Candidates (Completion Snapshots):**
- `PHASE3_TEST_SUMMARY.md` - Superseded by comprehensive report
- `PHASE3_TEST_RESULTS.md` - Intermediate results, now historical
- `PHASE3_TESTING_SUMMARY.md` - Duplicate summary information
- `FINAL_TEST_REPORT_WITH_BUGS.md` - Pre-fix snapshot, bugs resolved

**Keep in Testing (Active/Reference):**
- `PHASE3_COMPREHENSIVE_TEST_REPORT.md` - Comprehensive current reference
- `PHASE3_RETEST_EXECUTIVE_SUMMARY.md` - Latest verification results
- `PHASE3_RETEST_RESULTS.md` - Latest test outcomes
- `NATURAL_LANGUAGE_TEST_REPORT.md` - Current feature documentation
- `SUMMARIZE_HISTORY_TEST_SUMMARY.md` - Current feature test results
- `TEST_REPORT_summarize_history.md` - Detailed feature test report
- `TEST_QUICK_REFERENCE.md` - Active quick reference guide

#### Update Documentation Index
Update `/Users/kofifort/Repos/trakt.tv-mcp/docs/README.md` to reflect new structure:

```markdown
### For Contributors

- **[Testing Documentation](testing/)** - Current test reports and guidelines
- **[Archive](archive/)** - Historical reports and resolved issues
  - [Bug Reports](archive/bug-reports/) - Resolved bug tracking
  - [Completion Reports](archive/completion-reports/) - Historical test snapshots
```

#### Create Archive README
New file: `/Users/kofifort/Repos/trakt.tv-mcp/docs/archive/README.md`

```markdown
# Documentation Archive

Historical documents preserved for reference. These are snapshots from specific
points in the project timeline and may not reflect current behavior.

## Bug Reports
Historical bug tracking and resolution documentation.

## Completion Reports
Test completion snapshots from development phases. For current test documentation,
see [/docs/testing/](/docs/testing/).
```

**Migration Checklist:**
- [ ] Create `docs/archive/completion-reports/` directory
- [ ] Move historical test reports to archive
- [ ] Create `docs/archive/README.md` with index
- [ ] Update `docs/README.md` to reference new structure
- [ ] Update any cross-references in other documents
- [ ] Add note at top of archived files: "ARCHIVED: This is a historical snapshot..."
- [ ] Verify all relative links still work

**Affected Files:**
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/README.md`
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/PHASE3_TEST_SUMMARY.md` (move)
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/PHASE3_TEST_RESULTS.md` (move)
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/PHASE3_TESTING_SUMMARY.md` (move)
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/FINAL_TEST_REPORT_WITH_BUGS.md` (move)

**Estimated Effort:** 1-2 hours

---

## Testing & Quality

### [Placeholder for Future Testing Improvements]

This section will track:
- Test coverage gaps
- Integration test needs
- Performance test requirements
- CI/CD improvements

---

## Feature Enhancements

### [Placeholder for Future Feature Requests]

This section will track:
- User-requested features
- API enhancement opportunities
- UX improvements
- Tool additions

---

## How to Use This Document

### Adding New Items

When identifying technical debt or improvement opportunities:

1. **Create a new section** under the appropriate category
2. **Include all required fields:**
   - Priority (P0/P1/P2)
   - Area (component or domain)
   - Added date
   - Current state description
   - Problem statement
   - Proposed solution with code examples
   - Affected files with absolute paths
   - Estimated effort

3. **Use specific file references:**
   ```markdown
   **Affected Files:**
   - `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/cache.ts` (lines 18-24)
   ```

4. **Include implementation guidance:**
   - Code snippets showing proposed changes
   - Migration considerations
   - Rollback procedures if applicable
   - Testing requirements

### Resolving Items

When an item is completed:

1. **Update the item** with resolution details
2. **Add "Resolved" section** with:
   - Resolution date
   - Commit SHA or PR number
   - Any deviations from proposed solution
   - Lessons learned

3. **Move to appropriate archive** after 30 days:
   - Create dated archive file: `TECHNICAL_DEBT_2025_Q1.md`
   - Move resolved items preserving full context

### Review Cadence

- **Weekly:** Triage new items, update priorities
- **Monthly:** Review P1/P2 items for promotion or removal
- **Quarterly:** Archive resolved items, assess overall debt health

---

## Related Documents

- [/Users/kofifort/Repos/trakt.tv-mcp/CLAUDE.md](../CLAUDE.md) - Project instructions and architecture
- [/Users/kofifort/Repos/trakt.tv-mcp/docs/README.md](README.md) - Documentation index
- [/Users/kofifort/Repos/trakt.tv-mcp/docs/archive/](archive/) - Historical bug reports
- [/Users/kofifort/Repos/trakt.tv-mcp/CHANGELOG.md](../CHANGELOG.md) - Version history

---

**Maintained by:** Development Team
**Review Frequency:** Weekly
**Next Review:** 2025-11-27

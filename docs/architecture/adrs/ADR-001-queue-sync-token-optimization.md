# ADR-001: Token Cost Optimization for Queue Sync Tools

- Status: Accepted
- Date: 2024-12-17
- Owners: @kofifort

## Context

### The Problem

MCP tools contribute significantly to token costs in AI assistant interactions. During real-world testing with 20 queue entries, we observed:

- **Context overflow**: 224k/200k tokens (112% of limit)
- **MCP tools overhead**: 54.2k tokens (27.1% of total context)
- **Single tool cost**: `sync_logwatch_queue` alone costs ~1.0k tokens per schema definition
- **Multiplicative cost**: Interactive mode requires N+1 tool calls (summary + 1 per entry)
- **Verbose responses**: Each call returns full entries, search results (up to 10 items), franchise hints, and formatted tables

### User Impact

The high token costs created several problems:

1. **Context exhaustion**: Large queues (20+ entries) could overflow context windows
2. **Slow interactions**: Verbose responses increased latency and parsing overhead
3. **Inefficient workflows**: Users had to choose between batch mode (all-or-nothing) and interactive mode (expensive N+1 calls)
4. **Poor cost visibility**: No way to opt into compact responses for known-good operations

### Business Constraints

- Must maintain backward compatibility (existing integrations depend on `sync_logwatch_queue`)
- Cannot break existing workflows or user scripts
- Need to support both automated batch processing and interactive disambiguation
- Must preserve observability and error handling quality

## Decision

We implemented a multi-faceted optimization strategy:

### 1. Tool Decomposition

Split the monolithic `sync_logwatch_queue` (1.0k tokens) into focused sub-tools:

| Tool | Schema Cost | Purpose |
|------|-------------|---------|
| `queue_status` | ~200 tokens | Quick count of pending/synced/failed entries |
| `queue_preview` | ~300 tokens | Dry-run summary with pagination |
| `queue_auto_sync` | ~250 tokens | Batch sync unambiguous entries |
| `queue_confirm` | ~350 tokens | Single entry action (confirm/skip/fail) |

**Rationale**: Users load only the schema they need for each operation, reducing baseline cost by 50-80%.

### 2. Response Payload Compression

Reduced verbosity across all queue tools:

- **Search results**: Limited to top 3 matches (down from 10)
- **Field stripping**: Removed `genres`, `overview`, `score` from disambiguation options
- **Conditional inclusion**: Only include `franchiseHint` when multiple franchise items detected (not empty by default)
- **Deduplication**: Don't return both `summary` structure AND `formattedTable` when one suffices

**Rationale**: 
- Top 3 matches are usually sufficient for disambiguation
- Genres and overview are nice-to-have but not essential for ID selection
- Empty objects waste tokens without adding value

### 3. Minimal Output Mode

Added `minimalOutput: boolean` flag to `sync_logwatch_queue`:

```typescript
// When minimalOutput: true
{
  totalEntries: 20,
  resolved: 15,
  ambiguous: 3,
  notFound: 1,
  errors: 1,
  message: "Summary: 15 resolved, 3 ambiguous, 1 not found, 1 errors"
}

// Instead of full summary + formattedTable (~2k tokens)
```

**Rationale**: Users who just need counts shouldn't pay for full entries and tables.

### 4. Backward Compatibility

Preserved the original `sync_logwatch_queue` tool:

- All existing parameters and behavior unchanged
- New `minimalOutput` parameter is optional (defaults to false)
- Existing integrations continue to work without modification

**Rationale**: Breaking changes would disrupt user workflows and require migration coordination.

## Consequences

### Positive Outcomes

1. **50-70% token reduction** for typical workflows:
   - Quick status check: 200 tokens (vs 1000)
   - Preview queue: 300 tokens (vs 1000+)
   - Batch sync: 250 tokens (vs 1000+)

2. **User choice**: Users can choose tool granularity based on needs
   - Need counts? Use `queue_status`
   - Need to preview? Use `queue_preview`
   - Need to sync? Use `queue_auto_sync`
   - Need interactive mode? Use `queue_confirm` in a loop

3. **Better workflows**: Recommended workflow costs ~800 tokens total:
   ```
   queue_status (200) → queue_auto_sync (250) → queue_confirm (350 per ambiguous)
   ```
   vs old workflow: `sync_logwatch_queue` (1000+) for each interaction

4. **Scalability**: Large queues (50+ entries) can use pagination in `queue_preview` to avoid context overflow

### Risks and Mitigations

**Risk**: More tools to maintain
- **Mitigation**: All tools share common implementation logic in `tools.ts` (e.g., `queueAutoSync` reuses logic from `syncLogwatchQueue`)
- **Mitigation**: Comprehensive test coverage and documentation

**Risk**: User confusion about which tool to use
- **Mitigation**: Created detailed guide with recommended workflows ([docs/guides/QUEUE_TOOLS.md](../../guides/QUEUE_TOOLS.md))
- **Mitigation**: Clear tool descriptions in schema definitions

**Risk**: Fragmentation of functionality
- **Mitigation**: Original `sync_logwatch_queue` remains available for users who prefer all-in-one tool
- **Mitigation**: New tools follow consistent naming and parameter conventions

### Trade-offs

**What we optimized for**: Token efficiency, workflow flexibility, user choice

**What we sacrificed**: 
- Slight increase in codebase complexity (more tools)
- Need to maintain multiple APIs (though implementation is shared)

**What we preserved**:
- Backward compatibility
- Error handling quality
- Observability and tracing
- User experience for existing integrations

## Alternatives Considered

### Option A: Single Tool with Modes

Keep `sync_logwatch_queue` but add mode flags:
```typescript
sync_logwatch_queue({ mode: 'status' | 'preview' | 'sync' | 'confirm' })
```

**Pros**:
- Single tool to maintain
- Familiar API

**Cons**:
- Still pays 1.0k token schema cost even for simple status check
- Mode flags add complexity to schema
- Doesn't reduce schema overhead

**Why rejected**: Doesn't solve the core problem of high baseline schema cost.

### Option B: Remove Fields from Existing Tool

Strip verbose fields from `sync_logwatch_queue` responses directly.

**Pros**:
- Simplest change
- No new tools

**Cons**:
- Breaking change for existing users
- No flexibility for users who want verbose output
- Doesn't solve schema overhead (still 1.0k tokens)

**Why rejected**: Breaking changes violate backward compatibility constraint.

### Option C: Create Only Auto-Sync Tool

Add just `queue_auto_sync` as a lightweight alternative, keep `sync_logwatch_queue` for interactive mode.

**Pros**:
- Minimal change
- Covers most common use case

**Cons**:
- Doesn't help users who just want status check
- No solution for preview-before-sync workflow
- Doesn't provide full optimization benefit

**Why rejected**: Leaves common workflows unoptimized (status check, preview).

## Implementation Notes

### Code Structure

All new tools are implemented in:
- Tool definitions: `src/server/index.ts` (schema definitions and handlers)
- Implementation: `src/domain/trakt/tools.ts` (business logic)
- Supporting classes: `src/domain/trakt/watch-queue.ts`, `src/domain/trakt/bulk-summary.ts`

### Shared Logic

The new tools share implementation with the existing `syncLogwatchQueue`:
- `queueAutoSync` contains the core auto-confirm logic
- `queuePreview` uses the same `BulkSummaryBuilder`
- `queueConfirm` reuses duplicate detection and sync logic

This reduces maintenance burden and ensures consistent behavior.

### Breaking Change Analysis

**API Surface**:
- ✅ No breaking changes to existing tools
- ✅ All new tools are additive
- ✅ New parameter (`minimalOutput`) is optional with safe default

**Response Structure**:
- ✅ Existing response structures unchanged
- ✅ New tools use new response formats (no conflict)
- ⚠️ `BulkSummary` disambiguation options no longer include `genres`, `overview`, `score`
  - Impact: Only affects new tools, existing `syncLogwatchQueue` responses unchanged when `minimalOutput: false`

## Success Metrics

We will measure success by:

1. **Token usage reduction**: Monitor Langfuse traces for avg tokens per queue sync workflow
   - Target: 50% reduction for status+sync workflows
   - Target: 70% reduction for status-only checks

2. **User adoption**: Track usage of new tools vs `sync_logwatch_queue`
   - Goal: 60% of workflows using new tools within 1 month

3. **Context overflow incidents**: Monitor for 224k+ token sessions
   - Target: Zero context overflow incidents for queues <50 entries

4. **Error rates**: Ensure new tools don't introduce regressions
   - Target: <1% error rate (same as existing tools)

## References

- [Queue Tools Guide](../../guides/QUEUE_TOOLS.md) - User-facing documentation
- [Sync Queue Test Report](../../../SYNC_QUEUE_TEST_REPORT.md) - Original testing that identified the problem
- [Case Study: First Production Test](../../case-studies/2025-12-16-sync-queue-first-test.md) - Real-world usage scenario
- [Implementation PR](https://github.com/kofifort/trakt.tv-mcp/pull/XXX) - Code changes (TODO: update with PR number)

## Future Considerations

### Deprecation Path (Optional)

If new tools prove successful, we could consider deprecating `sync_logwatch_queue` in a future major version:

1. v1.x: Add new tools, maintain both (current state)
2. v2.0: Mark `sync_logwatch_queue` as deprecated, encourage migration
3. v3.0: Remove deprecated tool (breaking change, requires major version bump)

**Decision**: Not planning deprecation at this time. Both approaches serve valid use cases.

### Additional Optimizations

Future optimization opportunities:

1. **Response caching**: Cache search results for common queries (e.g., "Matrix 1999")
2. **Batch search API**: Request multiple searches in single API call
3. **Client-side pagination**: Stream results instead of loading all at once
4. **Smart prefetch**: Preload likely disambiguation candidates

These are out of scope for this ADR but may be considered in future work.

## Appendix: Token Cost Breakdown

### Before Optimization

```
sync_logwatch_queue call with 20 entries:
  Schema:              1,000 tokens
  Response:
    Summary structure:   500 tokens
    Formatted table:     800 tokens
    Search results:    2,000 tokens (10 items × 10 entries × 20 tokens)
    Franchise hints:     400 tokens
  Total:              4,700 tokens per call

Interactive mode (20 entries):
  Initial call:        4,700 tokens
  Per-entry calls:       200 tokens × 20 = 4,000 tokens
  Total:              8,700 tokens
```

### After Optimization

```
Recommended workflow (20 entries, 3 ambiguous):
  queue_status:          200 tokens
  queue_auto_sync:
    Schema:              250 tokens
    Response:            300 tokens (compact)
  queue_confirm × 3:
    Schema:              350 tokens × 3 = 1,050 tokens
    Responses:           100 tokens × 3 = 300 tokens
  Total:              2,100 tokens (76% reduction)

Status-only check:
  queue_status:          200 tokens
  Total:                200 tokens (96% reduction)
```

---

## Revision History

- 2024-12-17: Initial version (Accepted)

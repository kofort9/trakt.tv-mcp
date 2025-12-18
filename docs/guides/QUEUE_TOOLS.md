# Queue Tools - Optimized Workflow Guide

> **TLDR:** Use `queue_status` for counts, `queue_auto_sync` for batch processing, `queue_confirm` for disambiguation. Typical workflow: status -> auto_sync -> confirm remaining ambiguous entries.

This guide documents the optimized queue tools for syncing offline watch logs to Trakt.tv. These tools are designed to minimize token costs while providing efficient batch processing and interactive workflows.

## Tool Overview

The queue sync functionality is split into focused tools, each optimized for a specific use case:

| Tool | Purpose | Token Cost | Use When |
|------|---------|------------|----------|
| `queue_status` | Quick count of pending/synced/failed entries | ~200 tokens | Check queue status at a glance |
| `queue_preview` | Dry-run summary with search results | ~300 tokens | Review entries before syncing |
| `queue_auto_sync` | Batch sync unambiguous entries | ~250 tokens | Auto-process clear matches |
| `queue_confirm` | Single entry action (confirm/skip/fail) | ~350 tokens | Interactive disambiguation |
| `sync_logwatch_queue` | Legacy full-featured tool | ~1000 tokens | Backward compatibility |

## Recommended Workflows

### Workflow 1: Quick Status Check

**Goal**: Check if there are pending entries without loading full details.

```typescript
// Step 1: Check status
queue_status()

// Response:
{
  total: 20,
  pending: 15,
  synced: 3,
  failed: 1,
  skipped: 1,
  queuePath: "~/.trakt-mcp/pending-logs.jsonl"
}
```

### Workflow 2: Batch Sync (Recommended)

**Goal**: Auto-sync entries with unambiguous matches, skip complex cases for manual review.

```typescript
// Step 1: Preview what would be synced (optional)
queue_preview({ limit: 10 })

// Step 2: Auto-sync unambiguous entries
queue_auto_sync()

// Response:
{
  synced: 12,
  failed: 1,
  skipped: 2,
  totalProcessed: 15,
  ambiguousEntries: [
    {
      id: "abc123",
      rawText: "watched Matrix",
      matchCount: 3,
      yearRange: "1999-2021",
      matches: [
        { title: "The Matrix", year: 1999, traktId: 603 },
        { title: "The Matrix Reloaded", year: 2003, traktId: 604 },
        { title: "The Matrix Resurrections", year: 2021, traktId: 524375 }
      ]
    }
  ]
}
```

### Workflow 3: Interactive Disambiguation

**Goal**: Manually resolve ambiguous entries that `queue_auto_sync` skipped.

```typescript
// Step 1: Auto-sync handled the clear cases
queue_auto_sync()
// Returns: { synced: 12, skipped: 3, ambiguousEntries: [...] }

// Step 2: Confirm ambiguous entries one by one
queue_confirm({
  entryId: "abc123",
  action: "confirm",
  selectedTraktId: 603,
  selectedType: "movie"
})

// Or skip entries you don't want to sync
queue_confirm({
  entryId: "def456",
  action: "skip"
})

// Or mark as failed if they're invalid
queue_confirm({
  entryId: "ghi789",
  action: "fail"
})
```

### Workflow 4: Preview Before Syncing

**Goal**: Review all entries with search results before making changes.

```typescript
// Step 1: Preview first batch
queue_preview({ limit: 10 })

// Response shows summary table with search results
{
  summary: {
    totalEntries: 20,
    resolved: 15,    // Exact 1 match found
    ambiguous: 3,    // Multiple matches
    notFound: 1,     // No matches
    errors: 1        // Search failed
  },
  showing: 10,
  hasMore: true,
  formattedTable: "..." // ASCII table showing all entries
}

// Step 2: If satisfied, batch sync
queue_auto_sync()
```

## Tool Details

### queue_status

**Purpose**: Get quick counts without loading full entries.

**Parameters**:
- `queuePath` (optional): Custom queue file path

**Returns**:
```typescript
{
  total: number,
  pending: number,
  synced: number,
  failed: number,
  skipped: number,
  queuePath: string
}
```

**Token Cost**: ~200 tokens (schema + response)

---

### queue_preview

**Purpose**: Dry-run preview with search results and summary table.

**Parameters**:
- `queuePath` (optional): Custom queue file path
- `limit` (optional): Max entries to preview (default: all pending)

**Returns**:
```typescript
{
  summary: {
    totalEntries: number,
    resolved: number,    // Entries with exactly 1 match
    ambiguous: number,   // Entries with multiple matches
    notFound: number,    // Entries with no matches
    errors: number       // Entries where search failed
  },
  formattedTable: string,  // ASCII table visualization
  totalPending: number,
  showing: number,
  hasMore: boolean,
  canProceed: boolean      // false if errors > 0
}
```

**Token Cost**: ~300 tokens (schema) + variable (response size depends on entry count)

**Best Practice**: Use `limit` for large queues to paginate results.

---

### queue_auto_sync

**Purpose**: Batch sync unambiguous entries automatically.

**Parameters**:
- `queuePath` (optional): Custom queue file path
- `allowDuplicates` (optional): Allow logging duplicates for rewatches (default: false)

**Behavior**:
- ✅ **Auto-syncs**: Entries with exactly 1 search result match
- ⏭️ **Auto-skips**: 
  - Ambiguous entries (multiple matches)
  - Low confidence parses
  - Duplicates (already in history within 48 hours)
  - Shows without episode info
- ❌ **Fails**: Entries with search errors or API failures

**Returns**:
```typescript
{
  synced: number,
  failed: number,
  skipped: number,
  totalProcessed: number,
  ambiguousEntries?: [     // Only included if ambiguous entries exist
    {
      id: string,
      rawText: string,
      matchCount: number,
      yearRange?: string,
      matches: [
        { title: string, year: number, traktId: number }
      ]
    }
  ]
}
```

**Token Cost**: ~250 tokens (schema) + variable (depends on ambiguous entries returned)

**Recommended For**: First pass on queue - handles 80%+ of entries automatically.

---

### queue_confirm

**Purpose**: Confirm, skip, or fail a single queue entry.

**Parameters**:
- `entryId` (required): ID of entry to process
- `action` (required): `"confirm"`, `"skip"`, or `"fail"`
- `queuePath` (optional): Custom queue file path
- `selectedTraktId` (required for confirm): Trakt ID to log
- `selectedType` (required for confirm): `"movie"` or `"episode"`
- `allowDuplicates` (optional): Allow duplicates (default: false)

**Returns**:
```typescript
{
  action: "confirmed" | "skipped" | "failed",
  entryId: string,
  message: string
}
```

**Token Cost**: ~350 tokens (schema + response)

**Use After**: `queue_auto_sync` to handle ambiguous entries it skipped.

---

### sync_logwatch_queue (Legacy)

**Purpose**: Original full-featured tool with all modes (dry-run, auto-confirm, interactive).

**Why Use**: Backward compatibility, or when you need advanced features like:
- Interactive mode with entry-by-entry confirmation
- Franchise detection hints
- `minimalOutput` flag for compact responses

**Token Cost**: ~1000 tokens (large schema)

**Migration**: Prefer the focused tools above for better token efficiency.

**New Parameter**: `minimalOutput` (boolean) - Returns compact response with counts only, no full entries or tables.

## Token Optimization Tips

1. **Use focused tools**: `queue_status` + `queue_auto_sync` costs 450 tokens vs 1000+ for `sync_logwatch_queue`

2. **Leverage auto-sync**: Let `queue_auto_sync` handle the majority of entries automatically, then use `queue_confirm` only for the few ambiguous cases

3. **Paginate previews**: Use `queue_preview({ limit: 10 })` for large queues instead of loading all entries

4. **Compress responses**: The new tools return only essential fields:
   - Search results limited to top 3 matches
   - No verbose fields (genres, overview, score)
   - Compact disambiguation hints

## Migration from sync_logwatch_queue

If you're currently using `sync_logwatch_queue`, here's how to migrate:

### Before (Old Workflow)
```typescript
// 1 call, ~1000 tokens
sync_logwatch_queue({ autoConfirm: true })
```

### After (New Workflow)
```typescript
// Step 1: Quick check (200 tokens)
queue_status()

// Step 2: Batch sync (250 tokens)
queue_auto_sync()

// Step 3: Handle ambiguous (350 tokens per entry)
queue_confirm({
  entryId: "abc123",
  action: "confirm",
  selectedTraktId: 603,
  selectedType: "movie"
})

// Total: ~800 tokens for typical workflow
```

## Error Handling

All tools return structured errors:

```typescript
{
  success: false,
  errorCode: "QUEUE_ERROR" | "VALIDATION_ERROR" | "SYNC_ERROR" | "DUPLICATE_ENTRY",
  message: "Human-readable error message"
}
```

Common errors:
- `ENTRY_NOT_FOUND`: Invalid entry ID
- `VALIDATION_ERROR`: Missing required parameters
- `DUPLICATE_ENTRY`: Content already in history (use `allowDuplicates: true`)
- `SYNC_ERROR`: API call failed

## Examples

### Example 1: Daily sync routine

```typescript
// Morning: Check what's pending
const status = await queue_status();
console.log(`${status.pending} entries pending`);

// Afternoon: Batch sync
const result = await queue_auto_sync();
console.log(`Synced ${result.synced}, skipped ${result.skipped}`);

// Evening: Resolve ambiguous cases
if (result.ambiguousEntries?.length > 0) {
  for (const entry of result.ambiguousEntries) {
    // Present matches to user, get selection
    const selection = await getUserSelection(entry.matches);
    await queue_confirm({
      entryId: entry.id,
      action: "confirm",
      selectedTraktId: selection.traktId,
      selectedType: selection.type
    });
  }
}
```

### Example 2: Preview then decide

```typescript
// Preview first 20 entries
const preview = await queue_preview({ limit: 20 });

if (preview.canProceed) {
  // No errors, safe to auto-sync
  await queue_auto_sync();
} else {
  // Review errors first
  console.log(preview.formattedTable);
}
```

### Example 3: Rewatching content

```typescript
// Allow duplicates for rewatch
await queue_auto_sync({ allowDuplicates: true });

// Or for single entry
await queue_confirm({
  entryId: "xyz789",
  action: "confirm",
  selectedTraktId: 603,
  selectedType: "movie",
  allowDuplicates: true
});
```

## Performance Notes

- **Concurrency**: Tools use controlled concurrency (5 parallel searches) to respect API rate limits
- **Batching**: `queue_auto_sync` processes all entries in one call
- **Pagination**: `queue_preview` supports `limit` parameter for large queues
- **Caching**: Search results are not cached between calls (stateless design)

## Related Documentation

- [Natural Language Guide](NATURAL_LANGUAGE_GUIDE.md) - How to format watch notes
- [Observability Guide](../operations/observability.md) - Monitoring queue operations
- [ADR-001: Token Cost Optimization](../architecture/adrs/ADR-001-queue-sync-token-optimization.md) - Design rationale

## Troubleshooting

**Q: Why are entries skipped as "ambiguous"?**

A: Multiple search results matched your query. Add a year to disambiguate:
- ❌ "watched Matrix" (ambiguous - 3 movies found)
- ✅ "watched Matrix 1999" (resolved - exact match)

**Q: Why are entries skipped as "duplicate"?**

A: Content already logged within 48 hours. Use `allowDuplicates: true` for rewatches.

**Q: What if `queue_auto_sync` fails midway?**

A: Already-synced entries are marked as synced. Re-running will only process remaining pending entries.

**Q: Can I use custom queue paths?**

A: Yes, all tools accept `queuePath` parameter. Default: `~/.trakt-mcp/pending-logs.jsonl`


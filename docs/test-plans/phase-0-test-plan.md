# Phase 0 Test Plan: sync_logwatch_queue Stabilization

**Created:** 2025-12-22
**Status:** ✅ Implemented - PRs Ready to Merge
**PR Strategy:** PR-1 (0.1 + 0.2), PR-2 (0.3 + 0.4)

## Implementation Status

| PR | Branch | Status | Tests Added |
|----|--------|--------|-------------|
| #27 | `fix/sync-stabilization` | ✅ Ready | 23 tests (8 observability + 15 retry) |
| #28 | `feat/smart-type-inference` | ✅ Ready | 26 tests (19 type inference + 7 auto-confirm) |

---

## Executive Summary

This test plan addresses the 100% failure rate documented in the [2025-12-16 case study](../case-studies/2025-12-16-sync-queue-first-test.md). Analysis of the existing codebase reveals that **most Phase 0 fixes are already implemented** - the primary work is adding tests to validate behavior and filling observability gaps.

### Current State

| Task | Code Status | Test Status |
|------|-------------|-------------|
| 0.1 Observability | ✅ createChildSpan added (langfuse.ts) | ✅ 8 tests (langfuse-spans.test.ts) |
| 0.2 _retryCount fix | ✅ Verified (trakt-client.ts:111-112) | ✅ 15 tests (trakt-client-retry.test.ts) |
| 0.3 Search-first type | ✅ Implemented (tools.ts:1529-1550) | ✅ 19 tests (type-inference.test.ts) |
| 0.4 Smart auto-confirm | ✅ Mixed-type detection added | ✅ 7 edge case tests |

---

## PR-1: Observability & Retry Stability (fix/sync-stabilization)

### 0.1 Internal Observability Spans

**Goal:** Add internal Langfuse spans within `syncLogwatchQueue` for debugging.

#### Test Cases: `tests/unit/langfuse-spans.test.ts` (NEW FILE)

```typescript
describe('syncLogwatchQueue Observability', () => {
  describe('Internal Span Creation', () => {
    it('should create span for each entry processing step', async () => {
      // Test that processing each entry creates a child span
      // Mock Langfuse client to verify span creation
    });

    it('should include entry metadata in span context', async () => {
      // Verify span includes: entryId, rawText, parsedType, searchResultCount
    });

    it('should capture search duration in span', async () => {
      // Verify search API call timing is recorded
    });

    it('should record error details in span when search fails', async () => {
      // Verify error info captured: error message, entry context
    });

    it('should gracefully degrade when Langfuse unavailable', async () => {
      // Test that sync works normally without Langfuse
      // No crash, no performance impact
    });
  });
});
```

**Acceptance Criteria:**
- [ ] Internal spans appear nested under `sync_logwatch_queue` in Langfuse
- [ ] Each entry has its own span with processing outcome
- [ ] Search API calls are timed and recorded
- [ ] Errors include full context (entry text, parsed result, error)
- [ ] Zero performance impact when Langfuse disabled

---

### 0.2 _retryCount Defensive Initialization

**Current State:** Defensive init exists at `trakt-client.ts:111-112`:
```typescript
enhancedConfig._retryCount = enhancedConfig._retryCount ?? 0;
```

**Gap:** Test at line 404-436 in `sync-queue-improvements.test.ts` mocks at client level, bypassing actual axios interceptor.

#### Test Cases: `tests/unit/trakt-client-retry.test.ts` (NEW FILE)

```typescript
describe('TraktClient Retry Logic', () => {
  describe('_retryCount Initialization', () => {
    it('should initialize _retryCount to 0 on first request', async () => {
      // Create real TraktClient with axios instance
      // Intercept request to verify _retryCount is set
      // This tests the actual interceptor, not a mock
    });

    it('should increment _retryCount on 429 retry', async () => {
      // Setup axios mock adapter to return 429 then 200
      // Verify _retryCount increments
    });

    it('should not crash with undefined config._retryCount', async () => {
      // Regression test for case study entry #16
      // Simulate scenario where config object has no _retryCount
    });

    it('should reset _retryCount on successful response', async () => {
      // After 429 -> 200, verify _retryCount doesn't persist
    });
  });

  describe('Retry Behavior', () => {
    it('should retry up to 3 times on 429', async () => {
      // Mock 3x 429 then 200
      // Verify 4 total requests made
    });

    it('should fail after max retries exceeded', async () => {
      // Mock 4x 429 (exceeds max)
      // Verify appropriate error thrown
    });

    it('should apply exponential backoff between retries', async () => {
      // Verify delay between retries increases
      // May need to mock timers
    });
  });
});
```

**Acceptance Criteria:**
- [ ] No crash on any queue entry (including case study entry #16)
- [ ] Retry logic increments count correctly
- [ ] Max retries enforced
- [ ] Unit test reproduces exact crash scenario from case study

---

## PR-2: Search-First Type Inference (feat/smart-type-inference)

### 0.3 Search-First Type Inference

**Current State:** Parser defaults to `'infer_from_search'` (nl-parser.ts:42). Auto-confirm infers type from search results (tools.ts:1529-1550).

**Gap:** Need regression tests for case study entries that failed.

#### Test Cases: `tests/integration/type-inference.test.ts` (NEW FILE)

```typescript
describe('Search-First Type Inference', () => {
  describe('Case Study Regression Tests', () => {
    it('should infer movie type for "i watched columbus 2017"', async () => {
      // Case study entry #1 - no "movie" keyword
      // Parser returns type: 'infer_from_search'
      // Auto-confirm searches Trakt, finds movie, infers type
      const entry = 'i watched columbus 2017';

      mockClient.search.mockResolvedValue([
        { score: 100, movie: { title: 'Columbus', year: 2017, ids: { trakt: 12345 } } }
      ]);

      // Should sync successfully
      expect(result.data.synced).toBe(1);
    });

    it('should infer movie type for "I just finished Still walking (2009)"', async () => {
      // Case study entry - "just finished" with year but no type
      const entry = 'I just finished Still walking (2009)';

      mockClient.search.mockResolvedValue([
        { score: 100, movie: { title: 'Still Walking', year: 2008, ids: { trakt: 67890 } } }
      ]);

      expect(result.data.synced).toBe(1);
    });

    it('should infer movie type for "I just finished in the mood for love (2000)"', async () => {
      // Case study entry - Wong Kar-wai film
      const entry = 'I just finished in the mood for love (2000)';

      mockClient.search.mockResolvedValue([
        { score: 100, movie: { title: 'In the Mood for Love', year: 2000, ids: { trakt: 11111 } } }
      ]);

      expect(result.data.synced).toBe(1);
    });
  });

  describe('Type Inference from Search Results', () => {
    it('should infer "movie" when search returns only movies', async () => {
      await queue.append('watched Paterson');

      mockClient.search.mockResolvedValue([
        { score: 100, movie: { title: 'Paterson', year: 2016, ids: { trakt: 12345 } } }
      ]);

      const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });
      expect(result.data.synced).toBe(1);
    });

    it('should infer "show" when search returns only shows', async () => {
      await queue.append('watched The Bear S2E5');

      mockClient.search.mockResolvedValue([
        { score: 100, show: { title: 'The Bear', year: 2022, ids: { trakt: 67890 } } }
      ]);

      const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });
      expect(result.data.synced).toBe(1);
    });

    it('should skip show result when no episode info provided', async () => {
      // Entry has no S#E# but search returns a show
      await queue.append('watched The Bear');

      mockClient.search.mockResolvedValue([
        { score: 100, show: { title: 'The Bear', year: 2022, ids: { trakt: 67890 } } }
      ]);

      const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });
      expect(result.data.skipped).toBe(1);
      expect(result.data.results[0].reason).toContain('no episode info');
    });
  });

  describe('Parser Type Detection', () => {
    it('should return infer_from_search for entry without type keywords', () => {
      const result = parseWatchNote('watched columbus 2017', capturedAt);
      expect(result.type).toBe('infer_from_search');
      expect(result.title).toBe('columbus');
      expect(result.year).toBe(2017);
    });

    it('should return movie when explicit "movie" keyword present', () => {
      const result = parseWatchNote('watched columbus 2017 movie', capturedAt);
      expect(result.type).toBe('movie');
    });

    it('should return episode when S#E# pattern present', () => {
      const result = parseWatchNote('watched The Bear S2E5', capturedAt);
      expect(result.type).toBe('episode');
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });
  });
});
```

**Acceptance Criteria:**
- [ ] All 20 case study entries parse successfully (type = 'infer_from_search' or detected)
- [ ] Single-match entries auto-resolve type from search
- [ ] Multi-match entries marked ambiguous (not guessed)
- [ ] Show results without episode info are skipped appropriately

---

### 0.4 Smart Auto-Confirm Behavior

**Current State:** Already implemented at tools.ts:1563-1604. Tests exist in sync-queue-improvements.test.ts.

**Gap:** Add edge case tests from case study.

#### Test Cases: Add to `tests/integration/sync-queue-improvements.test.ts`

```typescript
describe('Smart Auto-Confirm Edge Cases', () => {
  it('should skip entries with 0 search results', async () => {
    await queue.append('watched nonexistent movie xyzzy 9999');

    mockClient.search.mockResolvedValue([]);

    const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });

    expect(result.data.synced).toBe(0);
    expect(result.data.skipped).toBe(1);
    expect(result.data.results[0].reason).toContain('No search results');
  });

  it('should skip entries with 2+ different search results', async () => {
    await queue.append('watched Dune'); // No year - ambiguous

    mockClient.search.mockResolvedValue([
      { score: 100, movie: { title: 'Dune', year: 1984, ids: { trakt: 111 } } },
      { score: 95, movie: { title: 'Dune', year: 2021, ids: { trakt: 222 } } },
    ]);

    const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });

    expect(result.data.synced).toBe(0);
    expect(result.data.skipped).toBe(1);
    expect(result.data.ambiguousEntries).toHaveLength(1);
    expect(result.data.ambiguousEntries[0].matchCount).toBe(2);
  });

  it('should process entry with exactly 1 search result', async () => {
    await queue.append('watched Paterson (2016)'); // Year disambiguates

    mockClient.search.mockResolvedValue([
      { score: 100, movie: { title: 'Paterson', year: 2016, ids: { trakt: 333 } } },
    ]);

    mockClient.getHistory.mockResolvedValue([]);
    mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

    const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });

    expect(result.data.synced).toBe(1);
    expect(result.data.skipped).toBe(0);
  });

  it('should include year range hint for ambiguous entries', async () => {
    await queue.append('watched Dune');

    mockClient.search.mockResolvedValue([
      { score: 100, movie: { title: 'Dune', year: 1984, ids: { trakt: 111 } } },
      { score: 95, movie: { title: 'Dune', year: 2021, ids: { trakt: 222 } } },
    ]);

    const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });

    expect(result.data.ambiguousEntries[0].yearRange).toBe('1984-2021');
    expect(result.data.ambiguousEntries[0].hint).toContain('Add year to disambiguate');
  });

  it('should handle mixed batch: some sync, some skip', async () => {
    await queue.append('watched Paterson (2016)'); // Unique - will sync
    await queue.append('watched Dune'); // Ambiguous - will skip
    await queue.append('watched nonexistent 9999'); // Not found - will skip

    mockClient.search
      .mockResolvedValueOnce([{ score: 100, movie: { title: 'Paterson', year: 2016, ids: { trakt: 333 } } }])
      .mockResolvedValueOnce([
        { score: 100, movie: { title: 'Dune', year: 1984, ids: { trakt: 111 } } },
        { score: 95, movie: { title: 'Dune', year: 2021, ids: { trakt: 222 } } },
      ])
      .mockResolvedValueOnce([]);

    mockClient.getHistory.mockResolvedValue([]);
    mockClient.addToHistory.mockResolvedValue({ added: { movies: 1 } });

    const result = await syncLogwatchQueue(client, { queuePath, autoConfirm: true });

    expect(result.data.synced).toBe(1);
    expect(result.data.skipped).toBe(2);
    expect(result.data.ambiguousEntries).toHaveLength(1);
  });
});
```

**Acceptance Criteria:**
- [ ] Only 1-match entries are auto-confirmed
- [ ] 0-match and multi-match entries are skipped (not failed)
- [ ] Summary shows skipped count
- [ ] Ambiguous entries include helpful hints (year range, match count)

---

## Test File Summary

| File | New/Modify | Test Count | Purpose |
|------|------------|------------|---------|
| `tests/unit/langfuse-spans.test.ts` | NEW | ~5 | Observability spans |
| `tests/unit/trakt-client-retry.test.ts` | NEW | ~7 | Retry logic & _retryCount |
| `tests/integration/type-inference.test.ts` | NEW | ~10 | Search-first type inference |
| `tests/integration/sync-queue-improvements.test.ts` | MODIFY | +6 | Smart auto-confirm edge cases |

**Total new tests:** ~28

---

## Test Data: Case Study Entries

From the case study, use these real-world entries for regression testing:

```typescript
const caseStudyEntries = [
  // Simple movies without type keywords
  { text: 'i watched columbus 2017', expected: { type: 'infer', syncs: true } },
  { text: 'I just finished Still walking (2009)', expected: { type: 'infer', syncs: true } },
  { text: 'I just finished in the mood for love (2000)', expected: { type: 'infer', syncs: true } },

  // Ambiguous (no year)
  { text: 'watched Dune', expected: { type: 'infer', skipped: true, reason: 'ambiguous' } },

  // Episodes
  { text: 'watched The Bear S2E5', expected: { type: 'episode', syncs: true } },

  // Franchise patterns (out of scope for Phase 0)
  { text: 'I watched all of the pirates of the caribbean movies last month', expected: { skipped: true } },

  // Vague dates with recall pattern
  { text: "I've seen all the marvel movies but I dont have a watch day...", expected: { skipped: true } },
];
```

---

## Pre-Implementation Checklist

Before starting PR-1:
- [ ] Run existing tests to confirm baseline: `npm test`
- [ ] Check current test coverage: `npm run test:coverage`
- [ ] Create branch: `git checkout -b fix/sync-stabilization`

Before starting PR-2:
- [ ] PR-1 merged or branch based on PR-1
- [ ] Create branch: `git checkout -b feat/smart-type-inference`

---

## Definition of Done

### PR-1 (0.1 + 0.2)
- [ ] All new tests pass
- [ ] Coverage doesn't decrease
- [ ] Langfuse spans visible in dashboard
- [ ] No crashes with case study entry #16

### PR-2 (0.3 + 0.4)
- [ ] All case study entries have test coverage
- [ ] Type inference works without explicit keywords
- [ ] Smart auto-confirm skips ambiguous entries
- [ ] Helpful hints provided for manual review

---

## References

- [Case Study: 2025-12-16-sync-queue-first-test.md](../case-studies/2025-12-16-sync-queue-first-test.md)
- [PROJECT_STATUS.md](../../PROJECT_STATUS.md)
- [Existing tests: sync-queue-improvements.test.ts](../../tests/integration/sync-queue-improvements.test.ts)
- [Implementation: tools.ts](../../src/domain/trakt/tools.ts)

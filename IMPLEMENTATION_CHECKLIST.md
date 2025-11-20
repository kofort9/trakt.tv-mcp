# Technical Improvements - Implementation Checklist

**Sprint:** Phase 4 Post-PR#2 Enhancements
**Total Estimated Days:** 5-7 days
**Status:** Ready to Start

---

## Phase 1: Observability & Debug Tool (Day 1)

### Morning (4 hours)

- [ ] **Create logger infrastructure**
  ```bash
  touch src/lib/logger.ts
  touch src/lib/__tests__/logger.test.ts
  ```

- [ ] **Implement core logger functions**
  - [ ] `generateRequestId()` - Unique ID generation
  - [ ] `logMCPRequest()` - Log incoming requests
  - [ ] `logMCPResponse()` - Log outgoing responses
  - [ ] `logMCPError()` - Log errors with stack traces
  - [ ] `initLogger()` - Initialize on server start

- [ ] **Implement log management**
  - [ ] In-memory buffer with 1000 entry limit
  - [ ] File append with rotation at 10MB
  - [ ] `readRecentLogs()` - Get last N entries
  - [ ] `readRequestLogs()` - Correlation by request ID
  - [ ] `readToolLogs()` - Filter by tool name

- [ ] **Write logger tests** (Target: 95%+ coverage)
  - [ ] Test request logging
  - [ ] Test response logging with metadata
  - [ ] Test error logging
  - [ ] Test request/response correlation
  - [ ] Test buffer size limits
  - [ ] Test file rotation logic
  - [ ] Run: `npm test -- logger.test.ts`

### Afternoon (4 hours)

- [ ] **Implement debug tool function**
  ```typescript
  // In src/lib/tools.ts
  export async function debugLastRequest(args) { ... }
  ```

- [ ] **Add performance metrics**
  - [ ] `getToolMetrics()` - Calculate avg/min/max duration
  - [ ] `getAllMetrics()` - All tools summary
  - [ ] Include cache metrics (placeholder for Phase 2)

- [ ] **Add MCP tool schema**
  ```typescript
  // In src/index.ts
  {
    name: 'debug_last_request',
    description: '...',
    inputSchema: zodToJsonSchema(...)
  }
  ```

- [ ] **Integrate logging into existing tools**
  - [ ] Update `logWatch()` - Add requestId, start/end logging
  - [ ] Update `bulkLog()` - Track duration, API calls
  - [ ] Update `searchEpisode()` - Log search selection
  - [ ] Update `getHistory()` - Log filters used
  - [ ] Update `summarizeHistory()` - Log stats
  - [ ] Update `getUpcoming()` - Log days parameter
  - [ ] Update `followShow()` / `unfollowShow()` - Log show info

- [ ] **Initialize logger in server**
  ```typescript
  // In src/index.ts - at server start
  import { initLogger } from './lib/logger.js';
  initLogger();
  ```

- [ ] **Write debug tool tests**
  - [ ] Test retrieving recent logs
  - [ ] Test filtering by tool name
  - [ ] Test filtering by request ID
  - [ ] Test metrics inclusion
  - [ ] Test count parameter validation
  - [ ] Run: `npm test -- tools.test.ts`

### End of Day Validation

- [ ] All tests pass: `npm test`
- [ ] Test coverage ≥95% for logger module
- [ ] Debug tool returns accurate data
- [ ] Can trace request/response for any tool call
- [ ] Commit: `git commit -m "feat: Add observability and debug tool"`

---

## Phase 2: Search Result Caching (Days 2-3)

### Day 2 Morning (4 hours)

- [ ] **Create cache infrastructure**
  ```bash
  touch src/lib/cache.ts
  touch src/lib/__tests__/cache.test.ts
  ```

- [ ] **Implement LRU Cache class**
  - [ ] `constructor()` - Accept config (maxSize, ttlMs)
  - [ ] `get()` - Retrieve with expiry check, update LRU order
  - [ ] `set()` - Add with LRU eviction if at capacity
  - [ ] `has()` - Check existence (non-expired)
  - [ ] `delete()` - Remove single entry
  - [ ] `clear()` - Remove all entries
  - [ ] `prune()` - Remove expired entries

- [ ] **Implement cache metrics**
  - [ ] Track hits, misses, evictions
  - [ ] Calculate hit rate
  - [ ] `getMetrics()` - Return metrics object
  - [ ] `resetMetrics()` - Clear metrics

- [ ] **Implement cache key generation**
  ```typescript
  export function generateSearchCacheKey(
    query: string,
    type?: 'show' | 'movie',
    year?: number
  ): string
  ```

### Day 2 Afternoon (4 hours)

- [ ] **Write comprehensive cache tests**
  - [ ] Test basic get/set operations
  - [ ] Test LRU eviction (add 4th item to 3-item cache)
  - [ ] Test access order update (get makes item most recent)
  - [ ] Test TTL expiry (use 1s TTL in tests)
  - [ ] Test metrics tracking (hits, misses, hit rate)
  - [ ] Test pruning expired entries
  - [ ] Test bounded size (never exceeds maxSize)
  - [ ] Run: `npm test -- cache.test.ts`

- [ ] **Coverage check**
  - [ ] Run: `npm run test:coverage -- cache.test.ts`
  - [ ] Target: 95%+ coverage
  - [ ] Add missing test cases if needed

### Day 3 Morning (4 hours)

- [ ] **Integrate cache into TraktClient**
  ```typescript
  // In src/lib/trakt-client.ts
  private searchCache: LRUCache<string, unknown>;

  constructor() {
    this.searchCache = new LRUCache({
      maxSize: 500,
      ttlMs: 3600000, // 1 hour
    });
  }
  ```

- [ ] **Update search method**
  ```typescript
  async search(query, type?, year?) {
    const cacheKey = generateSearchCacheKey(query, type, year);
    const cached = this.searchCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.get(...);
    this.searchCache.set(cacheKey, result);
    return result;
  }
  ```

- [ ] **Add cache management methods**
  - [ ] `getCacheMetrics()` - Expose cache metrics
  - [ ] `clearSearchCache()` - Manual cache clear
  - [ ] Add periodic pruning (every 15 minutes)

- [ ] **Update debug tool**
  ```typescript
  // In debugLastRequest response
  cache: client.getCacheMetrics()
  ```

- [ ] **Add cache tests to TraktClient**
  - [ ] Test cache hit on repeated search
  - [ ] Test different cache keys (query + type + year)
  - [ ] Test metrics tracking
  - [ ] Run: `npm test -- trakt-client.test.ts`

### Day 3 Afternoon (4 hours)

- [ ] **Performance testing**
  - [ ] Create test script: `scripts/test-cache-performance.ts`
  - [ ] Simulate 100 searches (50 unique, 50 duplicates)
  - [ ] Measure cache hit rate
  - [ ] Verify hit rate ≥30%

- [ ] **Tune cache configuration**
  - [ ] Experiment with TTL values (30m, 1h, 2h)
  - [ ] Experiment with max size (250, 500, 1000)
  - [ ] Choose optimal values based on metrics

- [ ] **Documentation**
  - [ ] Add cache section to README
  - [ ] Document cache configuration options
  - [ ] Add examples of cache metrics

### End of Day 3 Validation

- [ ] All tests pass: `npm test`
- [ ] Cache hit rate >30% in test scenarios
- [ ] No memory leaks (bounded cache size verified)
- [ ] Debug tool shows cache metrics
- [ ] Commit: `git commit -m "feat: Add search result caching with LRU eviction"`

---

## Phase 3: Parallel Bulk Operations (Days 4-5)

### Day 4 Morning (4 hours)

- [ ] **Create parallel utilities**
  ```bash
  touch src/lib/parallel.ts
  touch src/lib/__tests__/parallel.test.ts
  ```

- [ ] **Implement parallel utilities**
  - [ ] `parallelMap()` - Execute operations with controlled concurrency
  - [ ] `chunkArray()` - Split array into chunks
  - [ ] `delay()` - Promise-based sleep
  - [ ] Define `ParallelConfig` and `ParallelResult` types

- [ ] **Implement parallel search function**
  ```typescript
  export async function parallelSearchMovies(
    client: TraktClient,
    movieNames: string[],
    year?: number
  ): Promise<{
    results: Map<string, TraktSearchResult[]>;
    errors: Map<string, string>;
  }>
  ```

- [ ] **Write parallel tests**
  - [ ] Test parallel execution (measure timing)
  - [ ] Test concurrency limiting (max concurrent)
  - [ ] Test partial failures (some succeed, some fail)
  - [ ] Test batching with delays
  - [ ] Test deduplication (same movie name twice)
  - [ ] Run: `npm test -- parallel.test.ts`

### Day 4 Afternoon (4 hours)

- [ ] **Update bulkLog for movies**
  - [ ] Replace sequential loop with `parallelSearchMovies()`
  - [ ] Handle search errors map
  - [ ] Collect disambiguation needs for multiple movies
  - [ ] Return combined disambiguation response if needed
  - [ ] Add performance logging (duration, API calls)

- [ ] **Update disambiguation handling**
  ```typescript
  // For bulk operations, collect all disambiguation requests
  const disambiguationNeeded = [];
  // ... process all movies ...
  if (disambiguationNeeded.length > 0) {
    return {
      needs_disambiguation: true,
      movies: disambiguationNeeded,
      message: "Multiple movies need disambiguation..."
    };
  }
  ```

- [ ] **Add bulk operation tests**
  - [ ] Test parallel movie search (10 movies)
  - [ ] Test disambiguation for multiple movies
  - [ ] Test partial failures (some movies not found)
  - [ ] Test rate limiting compliance
  - [ ] Run: `npm test -- tools.test.ts`

### Day 5 Morning (4 hours)

- [ ] **Performance testing**
  - [ ] Create benchmark script: `scripts/benchmark-bulk.ts`
  - [ ] Test sequential vs parallel (10 movies)
  - [ ] Measure speedup (target: 2-3x)
  - [ ] Test different concurrency values (3, 5, 8)
  - [ ] Choose optimal concurrency

- [ ] **Tune parallel configuration**
  ```typescript
  const config = {
    maxConcurrency: 5,     // Tune this
    batchSize: 10,         // Tune this
    delayBetweenBatches: 100, // Tune this
  };
  ```

- [ ] **Rate limit compliance testing**
  - [ ] Test 100 movie bulk log (worst case)
  - [ ] Verify no 429 errors
  - [ ] Check rate limiter is working
  - [ ] Verify exponential backoff on 429

### Day 5 Afternoon (4 hours)

- [ ] **Error handling refinements**
  - [ ] Better error messages for partial failures
  - [ ] Show which movies succeeded vs failed
  - [ ] Add suggestions for common errors
  - [ ] Test all error scenarios

- [ ] **Integration with logging**
  - [ ] Log parallel batch processing
  - [ ] Track individual movie search times
  - [ ] Log selected results for each movie
  - [ ] Verify debug tool shows accurate metrics

- [ ] **Documentation**
  - [ ] Update bulkLog tool description
  - [ ] Document parallel behavior
  - [ ] Add performance characteristics
  - [ ] Document error handling for bulk ops

### End of Day 5 Validation

- [ ] All tests pass: `npm test`
- [ ] Bulk log 10 movies <2 seconds
- [ ] No rate limit errors (429)
- [ ] Partial failures handled gracefully
- [ ] Debug tool shows parallel metrics
- [ ] Commit: `git commit -m "feat: Add parallel bulk operations for movies"`

---

## Phase 4: Integration Tests (Days 6-7) - OPTIONAL

### Day 6 Morning (4 hours)

- [ ] **Test account setup**
  - [ ] Create new Trakt.tv account: `trakt-mcp-test-{yourname}`
  - [ ] Create API application on Trakt
  - [ ] Note Client ID and Client Secret
  - [ ] Run OAuth flow to get access token
  - [ ] Create `.env.test` file (DO NOT commit)

- [ ] **Create integration test infrastructure**
  ```bash
  mkdir -p src/lib/__tests__/integration
  touch src/lib/__tests__/integration/setup.ts
  touch .env.test.example
  ```

- [ ] **Implement test setup/teardown**
  - [ ] `shouldRunIntegrationTests()` - Check env vars
  - [ ] `setupIntegrationTests()` - Initialize client
  - [ ] `cleanupTestData()` - Remove test data after tests

- [ ] **Create integration test config**
  ```bash
  touch vitest.integration.config.ts
  ```

### Day 6 Afternoon (4 hours)

- [ ] **Write search integration tests**
  ```bash
  touch src/lib/__tests__/integration/search.integration.test.ts
  ```
  - [ ] Test search for known movie ("The Matrix")
  - [ ] Test search for known show ("Breaking Bad")
  - [ ] Test year filter (Dune 2021)
  - [ ] Test no results case
  - [ ] Run: `npm run test:integration`

- [ ] **Write history integration tests**
  ```bash
  touch src/lib/__tests__/integration/history.integration.test.ts
  ```
  - [ ] Test add movie to history
  - [ ] Test retrieve history
  - [ ] Test history filtering
  - [ ] Test duplicate additions

- [ ] **Verify cleanup**
  - [ ] Run tests multiple times
  - [ ] Check test account on Trakt.tv
  - [ ] Verify no test data remains
  - [ ] Fix cleanup if needed

### Day 7 Morning (4 hours)

- [ ] **Write watchlist integration tests**
  ```bash
  touch src/lib/__tests__/integration/watchlist.integration.test.ts
  ```
  - [ ] Test add to watchlist
  - [ ] Test remove from watchlist
  - [ ] Test get watchlist

- [ ] **Write calendar integration tests**
  ```bash
  touch src/lib/__tests__/integration/calendar.integration.test.ts
  ```
  - [ ] Test get upcoming episodes
  - [ ] Test date filtering

- [ ] **Integration test documentation**
  ```bash
  touch docs/INTEGRATION_TESTS.md
  ```
  - [ ] Setup instructions
  - [ ] Environment variables required
  - [ ] Running tests locally
  - [ ] CI/CD integration (optional)
  - [ ] Security guidelines

### Day 7 Afternoon (4 hours)

- [ ] **CI/CD integration (optional)**
  ```bash
  touch .github/workflows/integration.yml
  ```
  - [ ] Weekly scheduled run
  - [ ] Manual trigger option
  - [ ] Store secrets in GitHub

- [ ] **Final validation**
  - [ ] Run full integration suite
  - [ ] Verify all tests pass
  - [ ] Check test account is clean
  - [ ] Document any known issues

- [ ] **Cleanup script**
  ```bash
  touch scripts/cleanup-test-account.ts
  ```
  - [ ] Manual cleanup utility
  - [ ] Remove all test data
  - [ ] Reset account state

### End of Day 7 Validation

- [ ] Integration tests run successfully
- [ ] Test account setup documented
- [ ] Cleanup verified to work
- [ ] Optional: CI/CD pipeline configured
- [ ] Commit: `git commit -m "feat: Add integration test framework"`

---

## Final Sprint Validation

### Test Coverage

- [ ] Run full test suite: `npm test`
- [ ] Run coverage report: `npm run test:coverage`
- [ ] Verify coverage ≥95% for new modules
- [ ] Overall project coverage ≥90%

### Performance Metrics

- [ ] Cache hit rate ≥30% (run representative workload)
- [ ] Bulk log 10 movies <2 seconds
- [ ] Debug tool response time <100ms
- [ ] No memory leaks detected

### Functionality Checks

- [ ] Debug tool shows accurate metrics
- [ ] Cache reduces API calls (verify in logs)
- [ ] Parallel bulk operations work correctly
- [ ] Integration tests pass (if implemented)

### Code Quality

- [ ] All ESLint checks pass: `npm run lint`
- [ ] All Prettier checks pass: `npx prettier --check "src/**/*.ts"`
- [ ] No TypeScript errors: `npm run build`
- [ ] All tests pass: `npm test`

### Documentation

- [ ] Update CHANGELOG.md
- [ ] Update README.md if needed
- [ ] All new modules have JSDoc comments
- [ ] Integration test docs complete (if applicable)

### Git Hygiene

- [ ] Squash commits if needed
- [ ] Clear commit messages
- [ ] No debug code or console.logs (except logger)
- [ ] No commented-out code

---

## Post-Implementation Tasks

### Create PR

- [ ] Branch name: `phase-4-technical-improvements`
- [ ] PR title: "Phase 4: Technical Improvements (Observability, Caching, Parallelization)"
- [ ] PR description includes:
  - Summary of enhancements
  - Performance improvements (numbers)
  - Test coverage changes
  - Breaking changes (none expected)
  - Screenshots/metrics if applicable

### PR Checklist

- [ ] All tests pass (227+ tests)
- [ ] Coverage maintained/improved
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Ready for review

### Code Review Focus Areas

- [ ] Logger performance (ensure <5ms overhead)
- [ ] Cache eviction logic (LRU correct)
- [ ] Rate limiting compliance (parallel operations)
- [ ] Error handling (partial failures)
- [ ] Memory management (bounded structures)

---

## Emergency Rollback Plan

If issues are discovered after merge:

### Rollback Observability
```bash
# Disable logging
export LOGGING_ENABLED=false
```

### Rollback Caching
```bash
# Disable cache
export CACHE_ENABLED=false
```

### Rollback Parallelization
```bash
# Use sequential bulk log (old implementation)
git revert <commit-hash>
```

---

## Success Criteria Summary

At the end of this sprint, we should have:

✅ **Observability:**
- Request/response logs for all tools
- Debug tool with metrics
- Request correlation with IDs

✅ **Performance:**
- >30% cache hit rate
- 2-3x speedup for bulk operations
- <400ms average tool response time

✅ **Quality:**
- 95%+ test coverage for new modules
- Integration tests (optional)
- No breaking changes

✅ **Documentation:**
- Complete implementation docs
- API documentation for new tools
- Integration test guide (if applicable)

---

**Total Checklist Items:** ~150+
**Estimated Days:** 5-7 days
**Risk:** Low (all additive changes)

**Ready to start!** 🚀

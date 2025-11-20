# Technical Improvements Implementation Plan
**Phase 4: Post-PR#2 Enhancement Roadmap**

**Version:** 1.0
**Date:** 2025-11-20
**Status:** Ready for Implementation
**PR Context:** [PR #2](https://github.com/kofifort/trakt.tv-mcp/pull/2) - Phase 3 MCP Tools (227 tests passing, 8 tools implemented)

---

## Executive Summary

This document provides a comprehensive implementation plan for the technical improvements recommended in PR #2's review feedback. While PR #2 successfully implemented core functionality with excellent test coverage and type safety, several optimization opportunities were identified for future iterations.

**Current State:**
- ✅ 227 passing tests with comprehensive coverage
- ✅ 8 fully functional MCP tools
- ✅ Robust error handling and disambiguation
- ✅ Type-safe implementation throughout
- ✅ Rate limiting with exponential backoff
- ⚠️ Sequential bulk operations (optimization opportunity)
- ⚠️ No search result caching (API efficiency opportunity)
- ⚠️ Limited observability for debugging (Bug #3 from CRITICAL_BUGS_AND_PLAN.md)

**Target State:**
- ✅ All current functionality maintained
- ✅ Parallel bulk operations for improved performance
- ✅ LRU cache with TTL for frequent searches
- ✅ Debug/observability tool for troubleshooting
- ✅ Integration test framework with test account
- ✅ Enhanced performance metrics and monitoring

**Estimated Total Effort:** 5-7 days (1 sprint)
**Risk Level:** Low (all enhancements are additive, no breaking changes)

---

## Table of Contents

1. [Prioritized Roadmap](#prioritized-roadmap)
2. [Enhancement #1: Observability & Debug Tool](#enhancement-1-observability--debug-tool)
3. [Enhancement #2: Search Result Caching](#enhancement-2-search-result-caching)
4. [Enhancement #3: Parallel Bulk Operations](#enhancement-3-parallel-bulk-operations)
5. [Enhancement #4: Integration Testing Framework](#enhancement-4-integration-testing-framework)
6. [Architecture Recommendations](#architecture-recommendations)
7. [Testing Strategy](#testing-strategy)
8. [Risk Assessment & Mitigation](#risk-assessment--mitigation)
9. [Success Metrics](#success-metrics)

---

## Prioritized Roadmap

### Priority Matrix

| Enhancement | Priority | Complexity | Impact | Effort | Dependencies |
|------------|----------|------------|--------|--------|--------------|
| Observability Tool | **P0 (Critical)** | Low | High | 1 day | None |
| Search Caching | **P1 (High)** | Medium | Medium | 1.5 days | None |
| Parallel Bulk Ops | **P1 (High)** | Medium | Medium | 2 days | None |
| Integration Tests | **P2 (Medium)** | Medium | Low | 1.5 days | Test account setup |

### Recommended Implementation Sequence

**Sprint 1 (5-7 days total)**

**Week 1:**
- **Day 1:** Enhancement #1 - Observability Tool (addresses Bug #3)
- **Day 2:** Enhancement #2 - Search Caching (Part 1: Infrastructure)
- **Day 3:** Enhancement #2 - Search Caching (Part 2: Integration & Testing)
- **Day 4:** Enhancement #3 - Parallel Bulk Operations (Part 1: Implementation)
- **Day 5:** Enhancement #3 - Parallel Bulk Operations (Part 2: Testing & Optimization)

**Week 2 (Optional - can be deferred to Sprint 2):**
- **Day 6-7:** Enhancement #4 - Integration Testing Framework

**Rationale:**
1. **Observability first** - Critical for debugging and monitoring (addresses known Bug #3)
2. **Caching second** - Reduces API load before we increase parallelism
3. **Parallelization third** - Benefits from observability and caching infrastructure
4. **Integration tests last** - Requires external dependencies (test account), can be deferred

---

## Enhancement #1: Observability & Debug Tool

**Priority:** P0 (Critical)
**Complexity:** Low
**Effort:** 1 day
**Bug Reference:** CRITICAL_BUGS_AND_PLAN.md - Bug #3

### Problem Statement

Currently, there is no mechanism to:
- View what parameters were sent to MCP tools
- See which search results were selected during disambiguation
- Audit API requests sent to Trakt
- Debug issues reported by users
- Monitor performance metrics

This was identified as Bug #3 in the critical bugs document.

### Solution Design

Implement a structured logging system with:
1. **Request/Response Logger** - Captures all MCP tool invocations
2. **Debug Tool** - MCP tool to retrieve recent request logs
3. **Performance Metrics** - Track timing and API usage

#### Architecture

```typescript
// New file: src/lib/logger.ts

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

// Configuration
const LOG_DIR = join(os.homedir(), '.trakt-mcp', 'logs');
const LOG_FILE = join(LOG_DIR, 'mcp-requests.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_ENTRIES = 1000; // Keep last 1000 entries in memory

// Types
export interface LogEntry {
  timestamp: string;
  requestId: string; // Unique ID for correlating request/response
  type: 'request' | 'response' | 'error';
  tool: string;
  data: unknown;
  metadata?: {
    traktId?: number;
    title?: string;
    year?: number;
    searchQuery?: string;
    selectedFromResults?: number; // Index of selected search result
    duration?: number; // Request duration in ms
    apiCalls?: number; // Number of API calls made
  };
}

export interface PerformanceMetrics {
  tool: string;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  totalCalls: number;
  errorCount: number;
  avgApiCalls: number;
}

// In-memory log buffer for quick access
let logBuffer: LogEntry[] = [];

/**
 * Initialize logger - create log directory if needed
 */
export function initLogger(): void {
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('[LOGGER_INIT_ERROR]', error);
  }
}

/**
 * Generate unique request ID for correlation
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Log an MCP request
 */
export function logMCPRequest(
  tool: string,
  args: unknown,
  requestId: string
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    type: 'request',
    tool,
    data: args,
  };

  appendLog(entry);
  console.error(`[MCP_REQUEST] ${tool} (${requestId})`, JSON.stringify(args, null, 2));
}

/**
 * Log an MCP response
 */
export function logMCPResponse(
  tool: string,
  response: unknown,
  requestId: string,
  metadata?: LogEntry['metadata']
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    type: 'response',
    tool,
    data: response,
    metadata,
  };

  appendLog(entry);

  const summary = {
    success: (response as { success?: boolean }).success,
    duration: metadata?.duration,
    apiCalls: metadata?.apiCalls,
    selected: metadata?.title,
  };

  console.error(`[MCP_RESPONSE] ${tool} (${requestId})`, JSON.stringify(summary, null, 2));
}

/**
 * Log an MCP error
 */
export function logMCPError(
  tool: string,
  error: Error,
  requestId: string
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    type: 'error',
    tool,
    data: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
  };

  appendLog(entry);
  console.error(`[MCP_ERROR] ${tool} (${requestId})`, error.message, error.stack);
}

/**
 * Append log entry to file and memory buffer
 */
function appendLog(entry: LogEntry): void {
  try {
    // Add to in-memory buffer (with size limit)
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_ENTRIES) {
      logBuffer = logBuffer.slice(-MAX_LOG_ENTRIES); // Keep last N entries
    }

    // Append to file
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(LOG_FILE, line, 'utf8');

    // Check file size and rotate if needed
    rotateLogIfNeeded();
  } catch (error) {
    // Fail silently - don't break tool execution
    console.error('[LOGGER_WRITE_ERROR]', error);
  }
}

/**
 * Rotate log file if it exceeds max size
 */
function rotateLogIfNeeded(): void {
  try {
    if (!existsSync(LOG_FILE)) return;

    const stats = require('fs').statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const archivePath = `${LOG_FILE}.${Date.now()}.archive`;
      require('fs').renameSync(LOG_FILE, archivePath);
      console.error(`[LOGGER] Rotated log file to ${archivePath}`);
    }
  } catch (error) {
    console.error('[LOGGER_ROTATE_ERROR]', error);
  }
}

/**
 * Read recent logs from memory buffer
 */
export function readRecentLogs(count = 100): LogEntry[] {
  return logBuffer.slice(-count);
}

/**
 * Read logs for a specific request ID (correlation)
 */
export function readRequestLogs(requestId: string): LogEntry[] {
  return logBuffer.filter(entry => entry.requestId === requestId);
}

/**
 * Read logs for a specific tool
 */
export function readToolLogs(toolName: string, count = 50): LogEntry[] {
  return logBuffer
    .filter(entry => entry.tool === toolName)
    .slice(-count);
}

/**
 * Calculate performance metrics for a tool
 */
export function getToolMetrics(toolName: string): PerformanceMetrics | null {
  const logs = logBuffer.filter(
    entry => entry.tool === toolName && entry.type === 'response'
  );

  if (logs.length === 0) return null;

  const durations = logs
    .map(l => l.metadata?.duration)
    .filter((d): d is number => d !== undefined);

  const apiCalls = logs
    .map(l => l.metadata?.apiCalls)
    .filter((a): a is number => a !== undefined);

  const errors = logBuffer.filter(
    entry => entry.tool === toolName && entry.type === 'error'
  ).length;

  return {
    tool: toolName,
    avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length || 0,
    minDuration: Math.min(...durations) || 0,
    maxDuration: Math.max(...durations) || 0,
    totalCalls: logs.length,
    errorCount: errors,
    avgApiCalls: apiCalls.reduce((a, b) => a + b, 0) / apiCalls.length || 0,
  };
}

/**
 * Get all available metrics
 */
export function getAllMetrics(): PerformanceMetrics[] {
  const tools = new Set(logBuffer.map(entry => entry.tool));
  return Array.from(tools)
    .map(tool => getToolMetrics(tool))
    .filter((m): m is PerformanceMetrics => m !== null);
}

/**
 * Clear logs (for testing or privacy)
 */
export function clearLogs(): void {
  logBuffer = [];
  try {
    if (existsSync(LOG_FILE)) {
      require('fs').unlinkSync(LOG_FILE);
    }
  } catch (error) {
    console.error('[LOGGER_CLEAR_ERROR]', error);
  }
}
```

#### Debug Tool Implementation

```typescript
// In src/lib/tools.ts - Add new debug tool

/**
 * Get debug information about recent MCP requests
 * Useful for troubleshooting issues and auditing API usage
 */
export async function debugLastRequest(
  args: {
    tool?: string;
    count?: number;
    requestId?: string;
    includeMetrics?: boolean;
  }
): Promise<ToolSuccess<unknown> | ToolError> {
  try {
    const { tool, count = 20, requestId, includeMetrics = false } = args;

    // Validate count
    if (count < 1 || count > 500) {
      return createToolError(
        'VALIDATION_ERROR',
        'Count must be between 1 and 500'
      );
    }

    let logs: LogEntry[];
    let metrics: PerformanceMetrics[] | undefined;

    if (requestId) {
      // Get logs for specific request (correlation)
      logs = readRequestLogs(requestId);

      if (logs.length === 0) {
        return createToolError(
          'NOT_FOUND',
          `No logs found for request ID: ${requestId}`
        );
      }
    } else if (tool) {
      // Get logs for specific tool
      logs = readToolLogs(tool, count);

      if (includeMetrics) {
        const toolMetrics = getToolMetrics(tool);
        metrics = toolMetrics ? [toolMetrics] : undefined;
      }
    } else {
      // Get recent logs across all tools
      logs = readRecentLogs(count);

      if (includeMetrics) {
        metrics = getAllMetrics();
      }
    }

    // Format response
    const response: {
      count: number;
      logs: LogEntry[];
      metrics?: PerformanceMetrics[];
      summary?: {
        totalRequests: number;
        totalErrors: number;
        uniqueTools: number;
        timeRange: { first: string; last: string };
      };
    } = {
      count: logs.length,
      logs,
    };

    if (includeMetrics) {
      response.metrics = metrics;
    }

    // Add summary if multiple logs
    if (logs.length > 1) {
      const requests = logs.filter(l => l.type === 'request');
      const errors = logs.filter(l => l.type === 'error');
      const tools = new Set(logs.map(l => l.tool));

      response.summary = {
        totalRequests: requests.length,
        totalErrors: errors.length,
        uniqueTools: tools.size,
        timeRange: {
          first: logs[0].timestamp,
          last: logs[logs.length - 1].timestamp,
        },
      };
    }

    return createToolSuccess(response);
  } catch (error) {
    const message = sanitizeError(error, 'debugLastRequest');
    return createToolError('TRAKT_API_ERROR', message);
  }
}
```

#### Integration into Existing Tools

```typescript
// Example: Update logWatch to use logging

export async function logWatch(
  client: TraktClient,
  args: { /* ... */ }
): Promise<ToolSuccess<TraktHistoryAddResponse> | ToolError | DisambiguationResponse> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  let apiCallCount = 0;

  logMCPRequest('log_watch', args, requestId);

  try {
    // Existing implementation...
    const searchResults = await client.search(movieName, 'movie');
    apiCallCount++;

    // ... disambiguation logic ...

    const response = await client.addToHistory(historyData);
    apiCallCount++;

    const duration = Date.now() - startTime;
    const result = createToolSuccess<TraktHistoryAddResponse>(response as TraktHistoryAddResponse);

    logMCPResponse('log_watch', result, requestId, {
      traktId: movie.ids.trakt,
      title: movie.title,
      year: movie.year,
      duration,
      apiCalls: apiCallCount,
      searchQuery: movieName,
      selectedFromResults: searchResults.findIndex(r => r.movie?.ids.trakt === movie.ids.trakt),
    });

    return result;
  } catch (error) {
    logMCPError('log_watch', error as Error, requestId);
    const message = sanitizeError(error, 'logWatch');
    return createToolError('TRAKT_API_ERROR', message);
  }
}
```

#### Tool Schema Definition

```typescript
// In src/index.ts - Add debug tool to MCP server

{
  name: 'debug_last_request',
  description: 'Get debug information about recent MCP tool calls for troubleshooting. ' +
               'Returns request/response logs, performance metrics, and audit trail. ' +
               'Useful for understanding what was sent to Trakt API and which search results were selected.',
  inputSchema: zodToJsonSchema(
    z.object({
      tool: z.string().optional().describe(
        'Filter logs by tool name (e.g., "log_watch", "bulk_log"). ' +
        'If omitted, returns logs for all tools.'
      ),
      count: z.number().min(1).max(500).optional().default(20).describe(
        'Number of recent log entries to return (default: 20, max: 500)'
      ),
      requestId: z.string().optional().describe(
        'Get logs for a specific request ID to trace the full request/response cycle'
      ),
      includeMetrics: z.boolean().optional().default(false).describe(
        'Include performance metrics (avg duration, API calls, error rates) in the response'
      ),
    })
  ),
}
```

### Implementation Steps

1. **Day 1 - Part 1 (4 hours):**
   - Create `src/lib/logger.ts` with all logging functions
   - Add unit tests for logger (log rotation, buffer management, etc.)
   - Initialize logger in `src/index.ts` on server startup

2. **Day 1 - Part 2 (4 hours):**
   - Implement `debugLastRequest` tool function
   - Add tool schema to MCP server
   - Integrate logging into existing tools (logWatch, bulkLog, etc.)
   - Add unit tests for debug tool

### Testing Strategy

```typescript
// src/lib/__tests__/logger.test.ts

describe('logger', () => {
  beforeEach(() => {
    clearLogs();
  });

  it('should log MCP requests', () => {
    const requestId = generateRequestId();
    logMCPRequest('log_watch', { movieName: 'Test' }, requestId);

    const logs = readRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('request');
    expect(logs[0].tool).toBe('log_watch');
    expect(logs[0].requestId).toBe(requestId);
  });

  it('should correlate request and response logs', () => {
    const requestId = generateRequestId();
    logMCPRequest('log_watch', { movieName: 'Test' }, requestId);
    logMCPResponse('log_watch', { success: true }, requestId, {
      duration: 150,
      apiCalls: 2,
    });

    const logs = readRequestLogs(requestId);
    expect(logs).toHaveLength(2);
    expect(logs[0].type).toBe('request');
    expect(logs[1].type).toBe('response');
    expect(logs[1].metadata?.duration).toBe(150);
  });

  it('should calculate performance metrics', () => {
    const requestId1 = generateRequestId();
    const requestId2 = generateRequestId();

    logMCPResponse('log_watch', { success: true }, requestId1, {
      duration: 100,
      apiCalls: 2,
    });
    logMCPResponse('log_watch', { success: true }, requestId2, {
      duration: 200,
      apiCalls: 3,
    });

    const metrics = getToolMetrics('log_watch');
    expect(metrics?.avgDuration).toBe(150);
    expect(metrics?.minDuration).toBe(100);
    expect(metrics?.maxDuration).toBe(200);
    expect(metrics?.avgApiCalls).toBe(2.5);
  });

  it('should maintain buffer size limit', () => {
    // Log more than MAX_LOG_ENTRIES
    for (let i = 0; i < 1100; i++) {
      logMCPRequest('test', {}, generateRequestId());
    }

    const logs = readRecentLogs(10000);
    expect(logs.length).toBeLessThanOrEqual(1000);
  });

  it('should handle file rotation', () => {
    // Test implemented by mocking fs.statSync
    // Details omitted for brevity
  });
});

// src/lib/__tests__/tools.test.ts - Add debug tool tests

describe('debugLastRequest', () => {
  it('should return recent logs', async () => {
    // Generate some test logs
    const requestId = generateRequestId();
    logMCPRequest('log_watch', { movieName: 'Test' }, requestId);
    logMCPResponse('log_watch', { success: true }, requestId);

    const result = await debugLastRequest({ count: 10 });

    expect(result.success).toBe(true);
    expect((result as ToolSuccess<unknown>).data).toHaveProperty('logs');
    expect((result as ToolSuccess<unknown>).data).toHaveProperty('count');
  });

  it('should filter logs by tool name', async () => {
    logMCPRequest('log_watch', {}, generateRequestId());
    logMCPRequest('bulk_log', {}, generateRequestId());

    const result = await debugLastRequest({ tool: 'log_watch', count: 10 });

    expect(result.success).toBe(true);
    const logs = (result as ToolSuccess<{ logs: LogEntry[] }>).data.logs;
    expect(logs.every(l => l.tool === 'log_watch')).toBe(true);
  });

  it('should include metrics when requested', async () => {
    logMCPResponse('log_watch', { success: true }, generateRequestId(), {
      duration: 100,
    });

    const result = await debugLastRequest({
      tool: 'log_watch',
      includeMetrics: true,
    });

    expect(result.success).toBe(true);
    expect((result as ToolSuccess<unknown>).data).toHaveProperty('metrics');
  });

  it('should validate count parameter', async () => {
    const result = await debugLastRequest({ count: 1000 });
    expect(result.success).toBe(false);
    expect((result as ToolError).error.code).toBe('VALIDATION_ERROR');
  });
});
```

### Success Criteria

- ✅ All MCP tool calls are logged with request/response pairs
- ✅ Debug tool returns accurate logs and metrics
- ✅ Request IDs enable correlation of request/response
- ✅ Performance metrics are calculated correctly
- ✅ Log rotation prevents unbounded disk usage
- ✅ No performance impact on tool execution (<5ms overhead)
- ✅ All tests pass (target: 100% coverage for logger)

---

## Enhancement #2: Search Result Caching

**Priority:** P1 (High)
**Complexity:** Medium
**Effort:** 1.5 days

### Problem Statement

Currently, every search for shows/movies hits the Trakt API, even for frequent searches like:
- Popular shows: "Breaking Bad", "Game of Thrones"
- Recently searched content (user searches same title multiple times)
- Disambiguation flows (same search repeated during confirmation)

This leads to:
- Unnecessary API calls (reduces available rate limit budget)
- Slower response times for repeat searches
- Higher latency for users

### Solution Design

Implement an LRU (Least Recently Used) cache with TTL (Time To Live) for search results.

#### Architecture

```typescript
// New file: src/lib/cache.ts

/**
 * LRU Cache with TTL for search results
 * Reduces API calls for frequently searched content
 */

export interface CacheEntry<T> {
  value: T;
  expiry: number; // Unix timestamp
  hits: number; // Track cache hits for metrics
}

export interface CacheConfig {
  maxSize: number; // Maximum number of entries
  ttlMs: number; // Time to live in milliseconds
  enableMetrics: boolean; // Track cache performance
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private readonly config: CacheConfig;
  private metrics: CacheMetrics;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 500, // Default: cache 500 search results
      ttlMs: config.ttlMs || 3600000, // Default: 1 hour TTL
      enableMetrics: config.enableMetrics ?? true,
    };

    this.cache = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    };
  }

  /**
   * Get value from cache
   * Returns undefined if not found or expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.recordMiss();
      return undefined;
    }

    // Check expiry
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.recordMiss();
      return undefined;
    }

    // Update access order (LRU)
    this.cache.delete(key);
    this.cache.set(key, {
      ...entry,
      hits: entry.hits + 1,
    });

    this.recordHit();
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.metrics.evictions++;
    }

    // Add new entry
    const entry: CacheEntry<V> = {
      value,
      expiry: Date.now() + this.config.ttlMs,
      hits: 0,
    };

    this.cache.set(key, entry);
    this.metrics.size = this.cache.size;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    this.metrics.size = this.cache.size;
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.metrics.size = 0;
  }

  /**
   * Remove expired entries (cleanup)
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.metrics.size = this.cache.size;
    return removed;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: this.cache.size,
      hitRate: 0,
    };
  }

  private recordHit(): void {
    if (!this.config.enableMetrics) return;
    this.metrics.hits++;
    this.updateHitRate();
  }

  private recordMiss(): void {
    if (!this.config.enableMetrics) return;
    this.metrics.misses++;
    this.updateHitRate();
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }
}

/**
 * Generate cache key for search queries
 */
export function generateSearchCacheKey(
  query: string,
  type?: 'show' | 'movie',
  year?: number
): string {
  const normalizedQuery = query.toLowerCase().trim();
  const typeStr = type || 'all';
  const yearStr = year ? `_${year}` : '';
  return `search:${typeStr}:${normalizedQuery}${yearStr}`;
}
```

#### Integration with TraktClient

```typescript
// Update src/lib/trakt-client.ts

import { LRUCache, generateSearchCacheKey } from './cache.js';

export class TraktClient {
  private oauth: TraktOAuth;
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private searchCache: LRUCache<string, unknown>; // NEW

  constructor(config: TraktConfig, oauth: TraktOAuth) {
    this.oauth = oauth;
    this.rateLimiter = new RateLimiter();

    // Initialize search cache
    this.searchCache = new LRUCache({
      maxSize: 500, // Cache up to 500 unique searches
      ttlMs: 3600000, // 1 hour TTL
      enableMetrics: true,
    });

    // ... existing axios setup ...

    // Optional: Periodic cache cleanup (every 15 minutes)
    setInterval(() => {
      const pruned = this.searchCache.prune();
      if (pruned > 0) {
        console.error(`[CACHE] Pruned ${pruned} expired entries`);
      }
    }, 900000); // 15 minutes
  }

  /**
   * Search for shows and movies (with caching)
   */
  async search(query: string, type?: 'show' | 'movie', year?: number) {
    const cacheKey = generateSearchCacheKey(query, type, year);

    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached !== undefined) {
      console.error(`[CACHE_HIT] Search: "${query}" (${type || 'all'})`);
      return cached;
    }

    // Cache miss - fetch from API
    console.error(`[CACHE_MISS] Search: "${query}" (${type || 'all'})`);

    const params: Record<string, string | number> = { query };
    if (type) params.type = type;
    if (year) params.years = year;

    const result = await this.get(`/search/${type || 'show,movie'}`, { params });

    // Store in cache
    this.searchCache.set(cacheKey, result);

    return result;
  }

  /**
   * Get cache metrics (for debugging/monitoring)
   */
  getCacheMetrics() {
    return this.searchCache.getMetrics();
  }

  /**
   * Clear search cache (for testing or manual refresh)
   */
  clearSearchCache(): void {
    this.searchCache.clear();
    console.error('[CACHE] Search cache cleared');
  }
}
```

#### Cache Invalidation Strategy

**When to invalidate:**
1. **Time-based (TTL):** Automatic expiry after 1 hour
2. **Manual refresh:** User can clear cache via debug tool
3. **Server restart:** Cache is in-memory, cleared on restart

**What NOT to cache:**
- User-specific data (watch history, watchlist)
- Write operations (addToHistory, addToWatchlist)
- Real-time data (calendar, upcoming episodes)

**TTL Configuration:**
- **Search results:** 1 hour (shows/movies metadata rarely changes)
- **Show metadata:** 24 hours (could be added in future enhancement)
- **User data:** Never cached (always fresh)

### Implementation Steps

**Day 2 (8 hours):**
1. **Part 1 (4 hours):**
   - Create `src/lib/cache.ts` with LRUCache implementation
   - Add comprehensive unit tests for cache behavior
   - Test LRU eviction, TTL expiry, metrics tracking

2. **Part 2 (4 hours):**
   - Integrate cache into TraktClient.search()
   - Update debug tool to include cache metrics
   - Add cache control to debug tool (clear cache option)
   - Add integration tests with real API calls

**Day 3 (4 hours):**
   - Performance testing (measure cache hit rates)
   - Tune cache size and TTL based on usage patterns
   - Add cache metrics to observability dashboard
   - Documentation and code review

### Testing Strategy

```typescript
// src/lib/__tests__/cache.test.ts

describe('LRUCache', () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    cache = new LRUCache({
      maxSize: 3,
      ttlMs: 1000, // 1 second for testing
    });
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should evict LRU item when at capacity', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4'); // Should evict key1

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key4')).toBe('value4');
  });

  it('should update access order on get', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Access key1, making it most recent
    cache.get('key1');

    // Add key4, should evict key2 (not key1)
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBeUndefined();
  });

  it('should expire entries after TTL', async () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(cache.get('key1')).toBeUndefined();
  });

  it('should track cache metrics', () => {
    cache.set('key1', 'value1');
    cache.get('key1'); // Hit
    cache.get('key2'); // Miss

    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(1);
    expect(metrics.hitRate).toBeCloseTo(0.5);
  });

  it('should prune expired entries', async () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    await new Promise(resolve => setTimeout(resolve, 1100));

    const pruned = cache.prune();
    expect(pruned).toBe(2);
    expect(cache.getMetrics().size).toBe(0);
  });
});

// src/lib/__tests__/trakt-client.test.ts - Add cache tests

describe('TraktClient - Search Caching', () => {
  it('should cache search results', async () => {
    const client = new TraktClient(config, oauth);

    // First call - cache miss
    const result1 = await client.search('Breaking Bad', 'show');

    // Second call - should be cache hit (no API call)
    const result2 = await client.search('Breaking Bad', 'show');

    expect(result1).toEqual(result2);

    const metrics = client.getCacheMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(1);
  });

  it('should generate different cache keys for different search params', async () => {
    const client = new TraktClient(config, oauth);

    await client.search('Dune', 'movie');
    await client.search('Dune', 'movie', 2021); // Different cache key (includes year)

    const metrics = client.getCacheMetrics();
    expect(metrics.misses).toBe(2); // Both are cache misses
  });

  it('should respect TTL for cached entries', async () => {
    const client = new TraktClient(config, oauth);
    // Test with very short TTL for testing
    // Implementation details omitted for brevity
  });
});
```

### Success Criteria

- ✅ Search results are cached with LRU eviction
- ✅ Cache hit rate > 30% in normal usage (measured over 1000 requests)
- ✅ No stale data returned (TTL enforced correctly)
- ✅ Cache size bounded to configured maximum
- ✅ Metrics accurately track hits, misses, evictions
- ✅ No performance regression (cache lookup < 1ms)
- ✅ All tests pass (100% coverage for cache module)

---

## Enhancement #3: Parallel Bulk Operations

**Priority:** P1 (High)
**Complexity:** Medium
**Effort:** 2 days

### Problem Statement

Current `bulkLog` implementation for movies processes searches **sequentially**:

```typescript
// Current implementation (lines 376-420 in tools.ts)
for (const movieName of movieNames) {
  const searchResults = await client.search(movieName, 'movie'); // ❌ Sequential
  // ... rest of logic
}
```

**Impact:**
- Logging 10 movies = 10 sequential API calls
- Each call takes ~200-500ms → Total: 2-5 seconds
- Poor user experience for bulk operations
- Underutilizes available rate limit budget

**Current Rate Limit:** 1000 requests per 5 minutes = ~3.3 req/sec sustained

### Solution Design

Parallelize movie searches while respecting:
1. **Rate limiting** - Don't exceed Trakt's limits
2. **Error handling** - Handle partial failures gracefully
3. **Disambiguation** - Return clear errors for ambiguous results

#### Architecture

```typescript
// New file: src/lib/parallel.ts

/**
 * Utilities for parallel API operations with rate limiting
 */

export interface ParallelConfig {
  maxConcurrency: number; // Max concurrent requests
  batchSize: number; // Process in batches
  delayBetweenBatches?: number; // Delay between batches (ms)
}

export interface ParallelResult<T> {
  succeeded: T[];
  failed: Array<{
    item: unknown;
    error: string;
  }>;
}

/**
 * Execute async operations in parallel with controlled concurrency
 * Respects rate limiting by batching requests
 */
export async function parallelMap<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  config: Partial<ParallelConfig> = {}
): Promise<ParallelResult<R>> {
  const {
    maxConcurrency = 5,
    batchSize = 10,
    delayBetweenBatches = 0,
  } = config;

  const succeeded: R[] = [];
  const failed: Array<{ item: T; error: string }> = [];

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // Limit concurrency within each batch
    const chunks = chunkArray(batch, maxConcurrency);

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(item => operation(item))
      );

      // Process results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          succeeded.push(result.value);
        } else {
          failed.push({
            item: chunk[index],
            error: result.reason?.message || 'Unknown error',
          });
        }
      });
    }

    // Delay between batches to respect rate limits
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await delay(delayBetweenBatches);
    }
  }

  return { succeeded, failed };
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Promise-based delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parallel search with deduplication
 * If the same movie is searched multiple times, only make one API call
 */
export async function parallelSearchMovies(
  client: TraktClient,
  movieNames: string[],
  year?: number
): Promise<{
  results: Map<string, TraktSearchResult[]>;
  errors: Map<string, string>;
}> {
  // Deduplicate movie names (case-insensitive)
  const uniqueMovies = Array.from(
    new Set(movieNames.map(name => name.toLowerCase().trim()))
  );

  const results = new Map<string, TraktSearchResult[]>();
  const errors = new Map<string, string>();

  // Parallel search with controlled concurrency
  const { succeeded, failed } = await parallelMap(
    uniqueMovies,
    async (movieName) => {
      try {
        const searchResults = await client.search(movieName, 'movie', year);
        return { movieName, searchResults };
      } catch (error) {
        throw new Error(
          `Failed to search for "${movieName}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
    {
      maxConcurrency: 5, // Max 5 concurrent searches
      batchSize: 10, // Process 10 at a time
      delayBetweenBatches: 100, // 100ms between batches
    }
  );

  // Process successful results
  succeeded.forEach(({ movieName, searchResults }) => {
    results.set(movieName, searchResults);
  });

  // Process failures
  failed.forEach(({ item, error }) => {
    errors.set(item as string, error);
  });

  return { results, errors };
}
```

#### Updated bulkLog Implementation

```typescript
// Update src/lib/tools.ts - bulkLog function

export async function bulkLog(
  client: TraktClient,
  args: {
    type: 'episodes' | 'movies';
    showName?: string;
    movieNames?: string[];
    season?: number;
    episodes?: string;
    watchedAt?: string;
    year?: number;
    traktId?: number;
  }
): Promise<ToolSuccess<TraktHistoryAddResponse> | ToolError | DisambiguationResponse> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  logMCPRequest('bulk_log', args, requestId);

  try {
    const { type, showName, movieNames, season, episodes, watchedAt, year, traktId } = args;
    const watched_at = watchedAt ? parseNaturalDate(watchedAt) : new Date().toISOString();

    if (type === 'episodes') {
      // Episodes logic remains sequential (already efficient)
      // ... existing implementation ...
    } else {
      // Movies - NOW PARALLEL
      if (!movieNames || movieNames.length === 0) {
        return createToolError('VALIDATION_ERROR', 'For movies, movieNames is required');
      }

      console.error(`[BULK_LOG] Processing ${movieNames.length} movies in parallel`);

      // Parallel search for all movies
      const { results: searchResults, errors: searchErrors } = await parallelSearchMovies(
        client,
        movieNames,
        year
      );

      // Handle search errors
      if (searchErrors.size > 0) {
        const errorList = Array.from(searchErrors.entries())
          .map(([movie, error]) => `  - ${movie}: ${error}`)
          .join('\n');

        return createToolError(
          'SEARCH_FAILED',
          `Failed to search for ${searchErrors.size} movie(s):\n${errorList}`,
          { failedMovies: Array.from(searchErrors.keys()) }
        );
      }

      // Process search results and handle disambiguation
      const movieData: Array<{ watched_at: string; ids: { trakt: number } }> = [];
      const disambiguationNeeded: Array<{ movie: string; options: DisambiguationOption[] }> = [];

      for (const movieName of movieNames) {
        const normalizedName = movieName.toLowerCase().trim();
        const results = searchResults.get(normalizedName);

        if (!results || results.length === 0) {
          return createToolError(
            'NOT_FOUND',
            `No movie found matching "${movieName}"`,
            undefined,
            [
              'Check the spelling of the movie name',
              'Try using search_show with type filter to browse available movies',
              'Include the release year if known',
            ]
          );
        }

        // Handle disambiguation
        const disambiguationResult = handleSearchDisambiguation(
          results,
          movieName,
          'movie',
          year,
          traktId
        );

        if (disambiguationResult.needsDisambiguation) {
          // For bulk operations, collect all disambiguation requests
          disambiguationNeeded.push({
            movie: movieName,
            options: disambiguationResult.response.options,
          });
          continue;
        }

        const movie = disambiguationResult.selected.movie;
        if (!movie) {
          return createToolError('NOT_FOUND', `Movie data not found for "${movieName}"`);
        }

        movieData.push({
          watched_at,
          ids: { trakt: movie.ids.trakt },
        });
      }

      // If any movies need disambiguation, return them all at once
      if (disambiguationNeeded.length > 0) {
        return {
          success: false,
          needs_disambiguation: true,
          message: `Multiple movies require disambiguation. Please provide year or traktId for: ${disambiguationNeeded.map(d => d.movie).join(', ')}`,
          movies: disambiguationNeeded,
        } as DisambiguationResponse;
      }

      // All movies resolved - log to history
      const historyData = { movies: movieData };
      const response = await client.addToHistory(historyData);

      const duration = Date.now() - startTime;
      const result = createToolSuccess<TraktHistoryAddResponse>(
        response as TraktHistoryAddResponse,
        `Successfully logged ${movieData.length} movies in ${duration}ms`
      );

      logMCPResponse('bulk_log', result, requestId, {
        duration,
        apiCalls: movieNames.length + 1, // N searches + 1 addToHistory
        searchQuery: `bulk: ${movieNames.length} movies`,
      });

      return result;
    }
  } catch (error) {
    logMCPError('bulk_log', error as Error, requestId);
    const message = sanitizeError(error, 'bulkLog');
    return createToolError('TRAKT_API_ERROR', message);
  }
}
```

### Rate Limiting Considerations

**Current Rate Limit:** 1000 requests per 5 minutes

**Parallel Configuration:**
- **Max Concurrency:** 5 (conservative, can be tuned)
- **Batch Size:** 10 movies per batch
- **Delay Between Batches:** 100ms

**Example Scenario:**
- User logs 20 movies
- Batch 1: 10 movies → 5 parallel + 5 sequential = ~1 second
- 100ms delay
- Batch 2: 10 movies → 5 parallel + 5 sequential = ~1 second
- **Total:** ~2.1 seconds (vs. ~4-10 seconds sequential)

**Worst Case (100 movies):**
- 10 batches of 10 movies
- Each batch: ~1 second
- Delays: 9 × 100ms = 900ms
- **Total:** ~10.9 seconds (vs. ~20-50 seconds sequential)

### Implementation Steps

**Day 4 (8 hours):**
1. **Part 1 (4 hours):**
   - Create `src/lib/parallel.ts` with parallel utilities
   - Implement `parallelMap` and `parallelSearchMovies`
   - Add comprehensive unit tests

2. **Part 2 (4 hours):**
   - Update `bulkLog` to use parallel search
   - Handle disambiguation for multiple movies
   - Add integration tests with mock API

**Day 5 (8 hours):**
1. **Part 1 (4 hours):**
   - Performance testing (measure speedup)
   - Tune concurrency parameters
   - Test rate limit compliance

2. **Part 2 (4 hours):**
   - Error handling for partial failures
   - Add metrics to debug tool
   - Documentation and code review

### Testing Strategy

```typescript
// src/lib/__tests__/parallel.test.ts

describe('parallelMap', () => {
  it('should execute operations in parallel', async () => {
    const items = [1, 2, 3, 4, 5];
    const startTime = Date.now();

    const { succeeded } = await parallelMap(
      items,
      async (item) => {
        await delay(100); // Simulate async work
        return item * 2;
      },
      { maxConcurrency: 5 }
    );

    const duration = Date.now() - startTime;

    expect(succeeded).toEqual([2, 4, 6, 8, 10]);
    // Should take ~100ms (parallel) not ~500ms (sequential)
    expect(duration).toBeLessThan(200);
  });

  it('should limit concurrency', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);

    await parallelMap(
      items,
      async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(50);
        concurrent--;
      },
      { maxConcurrency: 3 }
    );

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('should handle partial failures', async () => {
    const items = [1, 2, 3, 4, 5];

    const { succeeded, failed } = await parallelMap(
      items,
      async (item) => {
        if (item === 3) {
          throw new Error('Failure');
        }
        return item * 2;
      }
    );

    expect(succeeded).toEqual([2, 4, 8, 10]);
    expect(failed).toHaveLength(1);
    expect(failed[0].item).toBe(3);
    expect(failed[0].error).toContain('Failure');
  });

  it('should process in batches with delay', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const startTime = Date.now();

    await parallelMap(
      items,
      async (item) => item,
      {
        batchSize: 10,
        delayBetweenBatches: 100,
        maxConcurrency: 10,
      }
    );

    const duration = Date.now() - startTime;
    // Should have 2 delays (3 batches) = ~200ms minimum
    expect(duration).toBeGreaterThanOrEqual(200);
  });
});

// src/lib/__tests__/tools.test.ts - Add parallel bulk tests

describe('bulkLog - Parallel Operations', () => {
  it('should search movies in parallel', async () => {
    const movieNames = [
      'The Matrix',
      'Inception',
      'Interstellar',
      'The Dark Knight',
      'Fight Club',
    ];

    const startTime = Date.now();
    const result = await bulkLog(mockClient, {
      type: 'movies',
      movieNames,
    });
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    // Should be faster than sequential (would be ~1000-2500ms)
    expect(duration).toBeLessThan(1000);
  });

  it('should handle disambiguation in bulk', async () => {
    // Mock returning multiple results for each movie
    const result = await bulkLog(mockClient, {
      type: 'movies',
      movieNames: ['Dune', 'Avatar'], // Both have multiple versions
    });

    expect(result.success).toBe(false);
    expect((result as DisambiguationResponse).needs_disambiguation).toBe(true);
    expect((result as DisambiguationResponse).movies).toHaveLength(2);
  });

  it('should handle partial failures gracefully', async () => {
    // Mock: 'Exists' succeeds, 'NotFound' fails
    const result = await bulkLog(mockClient, {
      type: 'movies',
      movieNames: ['The Matrix', 'NonexistentMovie12345'],
    });

    expect(result.success).toBe(false);
    expect((result as ToolError).error.code).toBe('NOT_FOUND');
    expect((result as ToolError).error.message).toContain('NonexistentMovie12345');
  });
});
```

### Success Criteria

- ✅ Bulk movie logging is 2-3x faster than sequential
- ✅ Rate limiting is respected (no 429 errors)
- ✅ Partial failures are handled gracefully
- ✅ Disambiguation works for multiple movies
- ✅ Concurrency is bounded to configured limit
- ✅ All tests pass (100% coverage for parallel module)

---

## Enhancement #4: Integration Testing Framework

**Priority:** P2 (Medium)
**Complexity:** Medium
**Effort:** 1.5 days
**Dependencies:** Test account credentials

### Problem Statement

Current test suite uses **mocked Trakt API** exclusively:
- ✅ Fast and deterministic
- ✅ No external dependencies
- ❌ Doesn't validate real API behavior
- ❌ Can't catch API contract changes
- ❌ Doesn't verify OAuth flow end-to-end

### Solution Design

Add **integration tests** that run against real Trakt API with a dedicated test account.

**Approach:**
- Separate test suite (not run in CI by default)
- Manual execution for pre-release validation
- Test account with known data state
- Cleanup after each test run

#### Architecture

```typescript
// New file: src/lib/__tests__/integration/setup.ts

/**
 * Integration test setup
 * Requires TRAKT_TEST_* environment variables
 */

import { TraktClient } from '../../trakt-client.js';
import { TraktOAuth } from '../../oauth.js';
import { loadConfig } from '../../config.js';

export interface IntegrationTestContext {
  client: TraktClient;
  oauth: TraktOAuth;
  testUserId: string;
}

/**
 * Check if integration tests should run
 */
export function shouldRunIntegrationTests(): boolean {
  return !!(
    process.env.TRAKT_TEST_CLIENT_ID &&
    process.env.TRAKT_TEST_CLIENT_SECRET &&
    process.env.TRAKT_TEST_ACCESS_TOKEN
  );
}

/**
 * Setup integration test context
 */
export async function setupIntegrationTests(): Promise<IntegrationTestContext> {
  if (!shouldRunIntegrationTests()) {
    throw new Error(
      'Integration tests require TRAKT_TEST_* environment variables. ' +
      'See docs/INTEGRATION_TESTS.md for setup instructions.'
    );
  }

  const config = loadConfig();
  const oauth = new TraktOAuth(config);

  // Use test account token (pre-authorized)
  const testToken = {
    access_token: process.env.TRAKT_TEST_ACCESS_TOKEN!,
    token_type: 'Bearer',
    expires_in: 7776000, // 90 days
    refresh_token: process.env.TRAKT_TEST_REFRESH_TOKEN || '',
    scope: 'public',
    created_at: Date.now() / 1000,
  };

  // Mock token storage for tests
  oauth['token'] = {
    ...testToken,
    expires_at: Date.now() + testToken.expires_in * 1000,
  };

  const client = new TraktClient(config, oauth);

  return {
    client,
    oauth,
    testUserId: process.env.TRAKT_TEST_USER_ID || 'trakt-mcp-test',
  };
}

/**
 * Cleanup test data after tests
 */
export async function cleanupTestData(client: TraktClient): Promise<void> {
  console.log('[INTEGRATION_CLEANUP] Removing test data...');

  // Remove test movies from history
  const history = await client.getHistory('movies');

  if (Array.isArray(history) && history.length > 0) {
    const testMovies = history.filter(item =>
      item.movie?.title.startsWith('[TEST]')
    );

    if (testMovies.length > 0) {
      await client.removeFromHistory({
        movies: testMovies.map(item => ({
          ids: { trakt: item.movie!.ids.trakt },
        })),
      });
      console.log(`[INTEGRATION_CLEANUP] Removed ${testMovies.length} test movies`);
    }
  }

  // Clear watchlist
  const watchlist = await client.getWatchlist();
  if (Array.isArray(watchlist) && watchlist.length > 0) {
    await client.removeFromWatchlist({
      movies: watchlist
        .filter(item => item.type === 'movie')
        .map(item => ({ ids: { trakt: item.movie!.ids.trakt } })),
      shows: watchlist
        .filter(item => item.type === 'show')
        .map(item => ({ ids: { trakt: item.show!.ids.trakt } })),
    });
    console.log(`[INTEGRATION_CLEANUP] Cleared watchlist`);
  }
}
```

#### Sample Integration Tests

```typescript
// New file: src/lib/__tests__/integration/search.integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupIntegrationTests, cleanupTestData, shouldRunIntegrationTests } from './setup.js';
import type { IntegrationTestContext } from './setup.js';

// Only run if integration test env vars are set
describe.skipIf(!shouldRunIntegrationTests())('Integration: Search', () => {
  let context: IntegrationTestContext;

  beforeAll(async () => {
    context = await setupIntegrationTests();
  });

  afterAll(async () => {
    await cleanupTestData(context.client);
  });

  it('should search for a known movie', async () => {
    const results = await context.client.search('The Matrix', 'movie');

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const firstResult = results[0];
    expect(firstResult.type).toBe('movie');
    expect(firstResult.movie?.title).toBe('The Matrix');
    expect(firstResult.movie?.year).toBe(1999);
    expect(firstResult.movie?.ids.trakt).toBeDefined();
  });

  it('should search for a known TV show', async () => {
    const results = await context.client.search('Breaking Bad', 'show');

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const firstResult = results[0];
    expect(firstResult.type).toBe('show');
    expect(firstResult.show?.title).toBe('Breaking Bad');
    expect(firstResult.show?.ids.trakt).toBeDefined();
  });

  it('should handle no results gracefully', async () => {
    const results = await context.client.search('NonexistentMovie12345XYZ', 'movie');

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('should respect year filter', async () => {
    const results = await context.client.search('Dune', 'movie', 2021);

    expect(Array.isArray(results)).toBe(true);
    const dune2021 = results.find(r => r.movie?.year === 2021);
    expect(dune2021).toBeDefined();
    expect(dune2021?.movie?.title).toContain('Dune');
  });
});

// New file: src/lib/__tests__/integration/history.integration.test.ts

describe.skipIf(!shouldRunIntegrationTests())('Integration: Watch History', () => {
  let context: IntegrationTestContext;

  beforeAll(async () => {
    context = await setupIntegrationTests();
  });

  afterAll(async () => {
    await cleanupTestData(context.client);
  });

  it('should add and retrieve movie from history', async () => {
    // Search for a test movie
    const searchResults = await context.client.search('The Matrix', 'movie');
    const movie = searchResults[0].movie!;

    // Add to history
    const addResponse = await context.client.addToHistory({
      movies: [{
        watched_at: new Date().toISOString(),
        ids: { trakt: movie.ids.trakt },
      }],
    });

    expect(addResponse.added.movies).toBe(1);

    // Retrieve history
    const history = await context.client.getHistory('movies');

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);

    const addedMovie = history.find(
      item => item.movie?.ids.trakt === movie.ids.trakt
    );
    expect(addedMovie).toBeDefined();
    expect(addedMovie?.movie?.title).toBe('The Matrix');
  });

  it('should handle duplicate additions gracefully', async () => {
    const searchResults = await context.client.search('Inception', 'movie');
    const movie = searchResults[0].movie!;

    // Add twice
    await context.client.addToHistory({
      movies: [{
        watched_at: new Date().toISOString(),
        ids: { trakt: movie.ids.trakt },
      }],
    });

    const response2 = await context.client.addToHistory({
      movies: [{
        watched_at: new Date().toISOString(),
        ids: { trakt: movie.ids.trakt },
      }],
    });

    // Should still succeed (Trakt allows duplicate watch entries)
    expect(response2.added.movies).toBe(1);
  });
});
```

#### Test Account Setup Documentation

```markdown
// New file: docs/INTEGRATION_TESTS.md

# Integration Testing Guide

## Overview

Integration tests validate real API behavior against a live Trakt.tv test account. These tests are **not run in CI** by default to avoid rate limiting and external dependencies.

## Prerequisites

1. **Test Trakt Account**
   - Create a dedicated Trakt.tv account for testing
   - Username suggestion: `trakt-mcp-test-{yourname}`
   - DO NOT use your personal account

2. **Trakt API Application**
   - Create a Trakt API app at https://trakt.tv/oauth/applications
   - Name: "Trakt MCP Integration Tests"
   - Redirect URI: `urn:ietf:wg:oauth:2.0:oob`
   - Note your Client ID and Client Secret

3. **OAuth Token**
   - Run the OAuth flow once to get an access token
   - Use the `scripts/get-test-token.ts` helper (create this)
   - Store the token securely (DO NOT commit to git)

## Environment Setup

Create a `.env.test` file (gitignored):

```bash
# Trakt Test Account Credentials
TRAKT_TEST_CLIENT_ID=your_test_client_id
TRAKT_TEST_CLIENT_SECRET=your_test_client_secret
TRAKT_TEST_ACCESS_TOKEN=your_test_access_token
TRAKT_TEST_REFRESH_TOKEN=your_test_refresh_token
TRAKT_TEST_USER_ID=trakt-mcp-test-username
```

## Running Integration Tests

```bash
# Load test environment variables
source .env.test

# Run integration tests only
npm run test:integration

# Run specific integration test file
npm run test:integration -- search.integration.test.ts

# Run with coverage
npm run test:integration -- --coverage
```

## Test Data Management

**Before Tests:**
- Tests assume a clean account state
- Run `npm run test:cleanup` to reset test account

**After Tests:**
- Cleanup is automatic via `afterAll()` hooks
- Removes all test movies (prefixed with `[TEST]`)
- Clears watchlist

**Manual Cleanup:**
```bash
npm run test:cleanup
```

## Rate Limiting

- Integration tests make **real API calls**
- Respect Trakt's rate limit: 1000 req / 5 minutes
- Tests are designed to stay under limits
- If you hit 429 errors, wait 5 minutes

## CI/CD Integration (Optional)

To run in CI (e.g., nightly builds):

1. Store test credentials in GitHub Secrets
2. Add integration test job to `.github/workflows/integration.yml`
3. Run on schedule (daily/weekly) not on every push

```yaml
# .github/workflows/integration.yml
name: Integration Tests

on:
  schedule:
    - cron: '0 0 * * 0' # Weekly on Sunday
  workflow_dispatch: # Manual trigger

jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
        env:
          TRAKT_TEST_CLIENT_ID: ${{ secrets.TRAKT_TEST_CLIENT_ID }}
          TRAKT_TEST_CLIENT_SECRET: ${{ secrets.TRAKT_TEST_CLIENT_SECRET }}
          TRAKT_TEST_ACCESS_TOKEN: ${{ secrets.TRAKT_TEST_ACCESS_TOKEN }}
```

## Security

- **NEVER** commit test credentials to git
- Use `.env.test` (gitignored)
- Rotate test tokens quarterly
- Use least-privilege API scopes

## Troubleshooting

**"Integration tests require TRAKT_TEST_* environment variables"**
- Ensure `.env.test` exists and is loaded
- Check variable names match exactly

**429 Rate Limit Errors**
- Wait 5 minutes before retrying
- Reduce test concurrency
- Check if other processes are using test account

**Authentication Errors**
- Token may have expired (refresh needed)
- Re-run OAuth flow to get new token
- Check client ID/secret are correct
```

### Implementation Steps

**Day 6-7 (12 hours total, can be split across multiple days):**

1. **Day 6 - Part 1 (4 hours):**
   - Create integration test infrastructure
   - Implement setup/teardown helpers
   - Create test account and get OAuth token
   - Write documentation (INTEGRATION_TESTS.md)

2. **Day 6 - Part 2 (4 hours):**
   - Write search integration tests
   - Write history integration tests
   - Test cleanup functionality

3. **Day 7 (4 hours):**
   - Add watchlist integration tests
   - Add calendar integration tests
   - Document CI/CD integration (optional)
   - Run full integration suite and verify

### Testing Strategy

**Manual Verification:**
1. Create test account on Trakt.tv
2. Run OAuth flow to get token
3. Execute integration tests: `npm run test:integration`
4. Verify test data is cleaned up
5. Check Trakt account manually to confirm cleanup

**CI/CD (Optional):**
- Weekly scheduled run
- Manual trigger for pre-release validation
- Fail build if integration tests fail

### Success Criteria

- ✅ Integration tests can run against real Trakt API
- ✅ Test account setup is documented
- ✅ Cleanup removes all test data
- ✅ Tests validate real API behavior
- ✅ No side effects on test account state
- ✅ Optional: CI/CD integration for scheduled runs

---

## Architecture Recommendations

### File Structure

```
src/
├── lib/
│   ├── cache.ts                 # NEW: LRU cache implementation
│   ├── logger.ts                # NEW: Request/response logging
│   ├── parallel.ts              # NEW: Parallel operation utilities
│   ├── trakt-client.ts          # UPDATED: Add cache integration
│   ├── tools.ts                 # UPDATED: Add logging, parallel bulk
│   ├── utils.ts                 # Existing
│   ├── oauth.ts                 # Existing
│   └── __tests__/
│       ├── cache.test.ts        # NEW
│       ├── logger.test.ts       # NEW
│       ├── parallel.test.ts     # NEW
│       ├── integration/         # NEW: Integration test suite
│       │   ├── setup.ts
│       │   ├── search.integration.test.ts
│       │   ├── history.integration.test.ts
│       │   └── watchlist.integration.test.ts
│       ├── trakt-client.test.ts # UPDATED
│       └── tools.test.ts        # UPDATED
├── types/
│   └── trakt.ts                 # UPDATED: Add cache/logger types
└── index.ts                     # UPDATED: Add debug tool, init logger
```

### Type Definitions

```typescript
// Add to src/types/trakt.ts

// Logger types
export interface LogEntry {
  timestamp: string;
  requestId: string;
  type: 'request' | 'response' | 'error';
  tool: string;
  data: unknown;
  metadata?: LogMetadata;
}

export interface LogMetadata {
  traktId?: number;
  title?: string;
  year?: number;
  searchQuery?: string;
  selectedFromResults?: number;
  duration?: number;
  apiCalls?: number;
}

// Cache types
export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

// Parallel operation types
export interface ParallelResult<T> {
  succeeded: T[];
  failed: Array<{
    item: unknown;
    error: string;
  }>;
}
```

### Configuration

```typescript
// Add to src/lib/config.ts or create new config

export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttlMs: number;
}

export interface LoggingConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'error';
  maxLogSize: number;
}

export interface ParallelConfig {
  maxConcurrency: number;
  batchSize: number;
  delayBetweenBatches: number;
}

export interface PerformanceConfig {
  cache: CacheConfig;
  logging: LoggingConfig;
  parallel: ParallelConfig;
}

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  cache: {
    enabled: true,
    maxSize: 500,
    ttlMs: 3600000, // 1 hour
  },
  logging: {
    enabled: true,
    logLevel: 'info',
    maxLogSize: 10 * 1024 * 1024, // 10MB
  },
  parallel: {
    maxConcurrency: 5,
    batchSize: 10,
    delayBetweenBatches: 100,
  },
};
```

---

## Testing Strategy

### Unit Test Coverage Goals

| Module | Current Coverage | Target Coverage |
|--------|-----------------|-----------------|
| trakt-client.ts | ~85% | 90%+ |
| tools.ts | ~90% | 95%+ |
| utils.ts | ~95% | 95%+ |
| **cache.ts** | **NEW** | **95%+** |
| **logger.ts** | **NEW** | **95%+** |
| **parallel.ts** | **NEW** | **95%+** |

### Test Categories

1. **Unit Tests** (existing + new)
   - Run on every commit
   - Fast (<1s per test file)
   - Mocked external dependencies
   - 95%+ coverage target

2. **Integration Tests** (new)
   - Run manually or scheduled
   - Real Trakt API calls
   - Test account required
   - Validate API contracts

3. **Performance Tests** (new)
   - Benchmark cache hit rates
   - Measure parallelization speedup
   - Validate rate limiting compliance
   - Run before releases

### Test Commands

```json
// Update package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:performance": "vitest run --config vitest.performance.config.ts",
    "test:all": "npm run test && npm run test:integration"
  }
}
```

---

## Risk Assessment & Mitigation

### Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Cache Stale Data** | Medium | Low | TTL enforcement, manual clear option |
| **Rate Limit Exceeded** | High | Low | Conservative concurrency, backoff retry |
| **Memory Leak (Cache)** | Medium | Low | Bounded cache size, periodic pruning |
| **Integration Test Flakiness** | Low | Medium | Cleanup hooks, isolated test data |
| **Breaking API Changes** | High | Very Low | Integration tests catch contract changes |

### Detailed Risk Analysis

#### Risk #1: Cache Returns Stale Data

**Scenario:** User searches for a show, metadata changes on Trakt, cache returns old data

**Impact:** User sees outdated information (e.g., wrong episode count, old description)

**Mitigation:**
- ✅ **TTL:** 1 hour expiry for search results
- ✅ **Manual Clear:** Debug tool provides cache clear option
- ✅ **Selective Caching:** Only cache search results, not user data
- ✅ **Monitoring:** Cache metrics in debug tool

**Residual Risk:** Low (metadata rarely changes within 1 hour)

#### Risk #2: Rate Limiting Exceeded with Parallelization

**Scenario:** Parallel bulk operations exceed 1000 req/5min limit

**Impact:** 429 errors, failed user requests

**Mitigation:**
- ✅ **Conservative Concurrency:** Max 5 parallel (vs. theoretical 16+)
- ✅ **Batching:** Process in batches with delays
- ✅ **Existing Rate Limiter:** TraktClient already has rate limiting
- ✅ **Exponential Backoff:** Existing retry logic handles 429s
- ✅ **Monitoring:** Track API calls in logs

**Residual Risk:** Very Low (multiple layers of protection)

#### Risk #3: Memory Leak from Unbounded Logging

**Scenario:** Long-running server accumulates logs in memory

**Impact:** Out of memory error, server crash

**Mitigation:**
- ✅ **Bounded Buffer:** Max 1000 entries in memory
- ✅ **File Rotation:** Rotate when log file exceeds 10MB
- ✅ **Periodic Pruning:** Remove expired cache entries
- ✅ **Monitoring:** Track memory usage in production

**Residual Risk:** Low (bounded data structures)

#### Risk #4: Integration Tests Fail in CI

**Scenario:** Network issues, test account state corruption, API downtime

**Impact:** False negative test results

**Mitigation:**
- ✅ **Optional in CI:** Integration tests not required for PRs
- ✅ **Cleanup Hooks:** Automatic test data removal
- ✅ **Retry Logic:** Tests retry on transient failures
- ✅ **Manual Trigger:** Can skip if Trakt is down

**Residual Risk:** Low (optional, well-isolated)

---

## Success Metrics

### Performance Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| **Cache Hit Rate** | 0% (no cache) | >30% | Debug tool metrics |
| **Bulk Log Speed (10 movies)** | ~5s (sequential) | <2s | Performance tests |
| **API Calls per Bulk Log** | N searches + 1 | Same (cached) | Logger metrics |
| **Average Tool Response Time** | ~500ms | <400ms | Logger duration tracking |

### Observability Metrics

| Metric | Current | Target |
|--------|---------|--------|
| **Request Traceability** | None | 100% (all requests logged) |
| **Error Debugging Capability** | Limited | Full (logs + stack traces) |
| **Performance Visibility** | None | Per-tool metrics available |

### Quality Metrics

| Metric | Current | Target |
|--------|---------|--------|
| **Unit Test Coverage** | ~90% | 95%+ |
| **Integration Test Coverage** | 0% | Core flows covered |
| **Bug Resolution Time** | Unknown | <1 day (with observability) |

---

## Implementation Checklist

### Phase 1: Observability (Day 1)

- [ ] Create `src/lib/logger.ts`
  - [ ] Implement `logMCPRequest`
  - [ ] Implement `logMCPResponse`
  - [ ] Implement `logMCPError`
  - [ ] Implement request ID generation
  - [ ] Implement log rotation
  - [ ] Implement metrics calculation
- [ ] Create `src/lib/__tests__/logger.test.ts`
  - [ ] Test logging functions
  - [ ] Test correlation by request ID
  - [ ] Test metrics calculation
  - [ ] Test buffer size limits
  - [ ] Test log rotation
- [ ] Implement `debugLastRequest` tool
  - [ ] Add tool function in `tools.ts`
  - [ ] Add tool schema in `index.ts`
  - [ ] Add tests in `tools.test.ts`
- [ ] Integrate logging into existing tools
  - [ ] Update `logWatch`
  - [ ] Update `bulkLog`
  - [ ] Update `searchEpisode`
  - [ ] Update other tools
- [ ] Initialize logger in `index.ts`
- [ ] **Verify:** All tools log requests/responses

### Phase 2: Caching (Days 2-3)

- [ ] Create `src/lib/cache.ts`
  - [ ] Implement `LRUCache` class
  - [ ] Implement `get` with TTL check
  - [ ] Implement `set` with LRU eviction
  - [ ] Implement `prune` for cleanup
  - [ ] Implement metrics tracking
  - [ ] Implement `generateSearchCacheKey`
- [ ] Create `src/lib/__tests__/cache.test.ts`
  - [ ] Test LRU eviction
  - [ ] Test TTL expiry
  - [ ] Test metrics
  - [ ] Test pruning
  - [ ] Test cache key generation
- [ ] Update `TraktClient`
  - [ ] Add `searchCache` field
  - [ ] Update `search` method to use cache
  - [ ] Add `getCacheMetrics` method
  - [ ] Add `clearSearchCache` method
- [ ] Update `debugLastRequest` tool
  - [ ] Add cache metrics to response
  - [ ] Add cache clear option
- [ ] Performance testing
  - [ ] Measure cache hit rate with realistic data
  - [ ] Tune TTL and max size
- [ ] **Verify:** Cache hit rate >30% in test scenarios

### Phase 3: Parallelization (Days 4-5)

- [ ] Create `src/lib/parallel.ts`
  - [ ] Implement `parallelMap`
  - [ ] Implement `chunkArray`
  - [ ] Implement `delay`
  - [ ] Implement `parallelSearchMovies`
- [ ] Create `src/lib/__tests__/parallel.test.ts`
  - [ ] Test parallel execution
  - [ ] Test concurrency limiting
  - [ ] Test partial failures
  - [ ] Test batching with delays
- [ ] Update `bulkLog` for movies
  - [ ] Use `parallelSearchMovies`
  - [ ] Handle disambiguation for multiple movies
  - [ ] Update error handling
  - [ ] Add performance logging
- [ ] Update tests
  - [ ] Add parallel bulk log tests
  - [ ] Test disambiguation in bulk
  - [ ] Test partial failure handling
- [ ] Performance testing
  - [ ] Measure speedup vs. sequential
  - [ ] Verify rate limit compliance
  - [ ] Tune concurrency parameters
- [ ] **Verify:** 2-3x speedup for bulk operations

### Phase 4: Integration Tests (Days 6-7, Optional)

- [ ] Create test account
  - [ ] Register Trakt account
  - [ ] Create API application
  - [ ] Run OAuth flow for token
- [ ] Create integration test infrastructure
  - [ ] Create `src/lib/__tests__/integration/setup.ts`
  - [ ] Implement `setupIntegrationTests`
  - [ ] Implement `cleanupTestData`
- [ ] Write integration tests
  - [ ] `search.integration.test.ts`
  - [ ] `history.integration.test.ts`
  - [ ] `watchlist.integration.test.ts`
- [ ] Create documentation
  - [ ] `docs/INTEGRATION_TESTS.md`
  - [ ] Setup instructions
  - [ ] Security guidelines
  - [ ] CI/CD integration guide
- [ ] Create `.env.test.example`
- [ ] Update `.gitignore` to exclude `.env.test`
- [ ] **Verify:** Integration tests run successfully

### Final Validation

- [ ] All unit tests pass (target: 240+ tests)
- [ ] All integration tests pass (if configured)
- [ ] Cache hit rate >30% in representative workload
- [ ] Bulk log 10 movies <2 seconds
- [ ] Debug tool returns accurate metrics
- [ ] Code review completed
- [ ] Documentation updated
- [ ] CHANGELOG.md updated

---

## Appendix: Code Snippets

### Example: Using Debug Tool

```bash
# Get last 20 requests across all tools
mcp-client call debug_last_request '{"count": 20}'

# Get requests for specific tool
mcp-client call debug_last_request '{"tool": "log_watch", "count": 50}'

# Get full request/response for specific request ID
mcp-client call debug_last_request '{"requestId": "req_1731974400000_a1b2c3"}'

# Get performance metrics
mcp-client call debug_last_request '{"tool": "bulk_log", "includeMetrics": true}'
```

### Example: Cache Metrics Output

```json
{
  "success": true,
  "data": {
    "count": 15,
    "logs": [...],
    "metrics": [
      {
        "tool": "log_watch",
        "avgDuration": 287,
        "minDuration": 150,
        "maxDuration": 520,
        "totalCalls": 42,
        "errorCount": 2,
        "avgApiCalls": 2.1
      }
    ],
    "cache": {
      "hits": 18,
      "misses": 42,
      "evictions": 3,
      "size": 156,
      "hitRate": 0.30
    }
  }
}
```

### Example: Parallel Bulk Log Performance

```typescript
// Before (Sequential)
const startTime = Date.now();
await bulkLog(client, {
  type: 'movies',
  movieNames: [
    'The Matrix', 'Inception', 'Interstellar',
    'The Dark Knight', 'Fight Club', 'The Prestige',
    'Shutter Island', 'The Departed', 'The Wolf of Wall Street',
    'Django Unchained'
  ]
});
console.log(`Sequential: ${Date.now() - startTime}ms`);
// Output: Sequential: 4872ms

// After (Parallel)
const startTime = Date.now();
await bulkLog(client, {
  type: 'movies',
  movieNames: [
    'The Matrix', 'Inception', 'Interstellar',
    'The Dark Knight', 'Fight Club', 'The Prestige',
    'Shutter Island', 'The Departed', 'The Wolf of Wall Street',
    'Django Unchained'
  ]
});
console.log(`Parallel: ${Date.now() - startTime}ms`);
// Output: Parallel: 1543ms (3.2x speedup)
```

---

## Conclusion

This implementation plan provides a comprehensive roadmap for enhancing the Trakt MCP server with:

1. **Observability** - Full request/response logging and debug tooling
2. **Performance** - Search caching and parallel bulk operations
3. **Quality** - Integration test framework for API validation

**Total Estimated Effort:** 5-7 days (1 sprint)

**Recommended Approach:**
- Implement in order: Observability → Caching → Parallelization → Integration Tests
- Each enhancement is independently valuable
- Low risk (all additive, no breaking changes)
- High impact (better debugging, faster operations, validated behavior)

**Next Steps:**
1. Review and approve this plan
2. Create GitHub issues for each enhancement
3. Assign to sprint/milestone
4. Begin implementation with Phase 1 (Observability)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Status:** Ready for Review
**Approvers:** Engineering Lead, Product Owner

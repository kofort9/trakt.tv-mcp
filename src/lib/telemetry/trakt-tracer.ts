/**
 * Trakt API Client Tracer
 *
 * Provides instrumentation for Trakt API client operations.
 * Tracks API calls, rate limiting, caching, and errors.
 *
 * This module wraps the TraktClient class to add tracing without
 * modifying the core client implementation.
 */

import { Span } from '@opentelemetry/api';
import { traceOperation } from './mcp-tracer.js';
import { isTelemetryEnabled } from './config.js';

/**
 * Trace a Trakt API request
 *
 * Creates a span for API requests with comprehensive metadata:
 * - HTTP method and endpoint
 * - Response status code and latency
 * - Rate limit information from headers
 * - Retry attempts (if any)
 * - Cache hit/miss indicators
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param endpoint - API endpoint path
 * @param operation - Async function that makes the API call
 * @returns Result of the API call
 *
 * @example
 * ```typescript
 * const result = await traceTraktApiCall('GET', '/search/show', async (span) => {
 *   span.setAttribute('trakt.query', 'Breaking Bad');
 *   return await axios.get('/search/show?query=Breaking+Bad');
 * });
 * ```
 */
export async function traceTraktApiCall<T>(
  method: string,
  endpoint: string,
  operation: (span: Span) => Promise<T>
): Promise<T> {
  if (!isTelemetryEnabled()) {
    // Create no-op span for operation
    const { trace } = await import('@opentelemetry/api');
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    try {
      return await operation(noopSpan);
    } finally {
      noopSpan.end();
    }
  }

  const spanName = `trakt.api.${method.toLowerCase()}.${sanitizeEndpoint(endpoint)}`;

  return await traceOperation(
    spanName,
    async (span) => {
      // Add API request attributes
      span.setAttribute('http.method', method);
      span.setAttribute('http.url', endpoint);
      span.setAttribute('trakt.api_version', '2');

      // Execute the API call
      const result = await operation(span);

      return result;
    },
    {
      'span.kind': 'client',
      'component': 'trakt-api',
    }
  );
}

/**
 * Add rate limit information to span from response headers
 *
 * Trakt API returns rate limit info in headers:
 * - X-RateLimit-Limit: Maximum requests allowed
 * - X-RateLimit-Remaining: Requests remaining
 * - X-RateLimit-Reset: Unix timestamp when limit resets
 *
 * @param span - The active span
 * @param headers - Response headers object
 */
export function addRateLimitInfo(span: Span, headers: Record<string, string | number>): void {
  if (!isTelemetryEnabled()) return;

  const limit = headers['x-ratelimit-limit'];
  const remaining = headers['x-ratelimit-remaining'];
  const reset = headers['x-ratelimit-reset'];

  if (limit !== undefined) {
    span.setAttribute('trakt.rate_limit.limit', Number(limit));
  }
  if (remaining !== undefined) {
    span.setAttribute('trakt.rate_limit.remaining', Number(remaining));
  }
  if (reset !== undefined) {
    span.setAttribute('trakt.rate_limit.reset', Number(reset));
  }

  // Calculate rate limit usage percentage
  if (limit !== undefined && remaining !== undefined) {
    const used = Number(limit) - Number(remaining);
    const usagePercent = (used / Number(limit)) * 100;
    span.setAttribute('trakt.rate_limit.usage_percent', Math.round(usagePercent));

    // Warn if approaching limit
    if (usagePercent > 90) {
      span.setAttribute('trakt.rate_limit.warning', 'approaching_limit');
    }
  }
}

/**
 * Add retry information to span
 *
 * Tracks retry attempts when rate limiting or transient errors occur.
 *
 * @param span - The active span
 * @param attempt - Current retry attempt number
 * @param maxRetries - Maximum retry attempts allowed
 * @param backoffMs - Backoff delay in milliseconds
 */
export function addRetryInfo(
  span: Span,
  attempt: number,
  maxRetries: number,
  backoffMs: number
): void {
  if (!isTelemetryEnabled()) return;

  span.setAttribute('trakt.retry.attempt', attempt);
  span.setAttribute('trakt.retry.max_attempts', maxRetries);
  span.setAttribute('trakt.retry.backoff_ms', backoffMs);

  // Add event to track retry
  span.addEvent('retry_attempt', {
    attempt,
    backoffMs,
  });
}

/**
 * Add cache hit/miss information to span
 *
 * @param span - The active span
 * @param cacheHit - Whether the request was served from cache
 * @param cacheKey - Cache key used (optional)
 */
export function addCacheInfo(span: Span, cacheHit: boolean, cacheKey?: string): void {
  if (!isTelemetryEnabled()) return;

  span.setAttribute('cache.hit', cacheHit);
  if (cacheKey) {
    // Only include cache key prefix to avoid excessive data
    const keyPrefix = cacheKey.substring(0, 50);
    span.setAttribute('cache.key_prefix', keyPrefix);
  }

  // Add event for cache operations
  span.addEvent(cacheHit ? 'cache_hit' : 'cache_miss', {
    cacheKey: cacheKey ? cacheKey.substring(0, 50) : undefined,
  });
}

/**
 * Sanitize endpoint path for span name
 *
 * Converts dynamic path segments to generic placeholders
 * to reduce cardinality in telemetry data.
 *
 * Examples:
 * - /shows/breaking-bad -> /shows/{slug}
 * - /shows/123/seasons/1/episodes/1 -> /shows/{id}/seasons/{season}/episodes/{episode}
 *
 * @param endpoint - Raw endpoint path
 * @returns Sanitized endpoint path
 */
function sanitizeEndpoint(endpoint: string): string {
  return endpoint
    .replace(/\/shows\/[^/]+/, '/shows/{slug}')
    .replace(/\/seasons\/\d+/, '/seasons/{season}')
    .replace(/\/episodes\/\d+/, '/episodes/{episode}')
    .replace(/\/movies\/[^/]+/, '/movies/{slug}')
    .replace(/\/users\/[^/]+/, '/users/{username}')
    .replace(/\/sync\/[^/]+/, '/sync/{resource}')
    .replace(/\/calendars\/[^/]+/, '/calendars/{type}')
    .replace(/\/\d{4}-\d{2}-\d{2}/, '/{date}')
    .replace(/\/\d+/, '/{id}');
}

/**
 * Trace cache operation
 *
 * Creates a span for cache operations (get, set, prune, clear).
 *
 * @param operation - Cache operation name ('get', 'set', 'prune', 'clear')
 * @param action - Async function performing the operation
 * @param attributes - Additional attributes (e.g., cache key, entry count)
 * @returns Result of the cache operation
 */
export async function traceCacheOperation<T>(
  operation: 'get' | 'set' | 'prune' | 'clear',
  action: (span: Span) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  if (!isTelemetryEnabled()) {
    const result = action(null as unknown as Span);
    return result instanceof Promise ? await result : result;
  }

  const spanName = `cache.${operation}`;

  return await traceOperation(
    spanName,
    async (span) => {
      span.setAttribute('cache.operation', operation);

      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          if (value !== undefined && value !== null) {
            span.setAttribute(key, value);
          }
        }
      }

      const result = action(span);
      return result instanceof Promise ? await result : result;
    },
    {
      'component': 'cache',
    }
  );
}

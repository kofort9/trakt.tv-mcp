/**
 * Langfuse Tracing Integration
 *
 * Provides observability for the Trakt MCP server using Langfuse.
 * Tracks tool calls, API requests, and NLP/ambiguity events.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Langfuse } from 'langfuse';
import type { LangfuseTraceClient } from 'langfuse';
import { sanitizeOutput } from './sanitization.js';
import { logError as baseLogError } from './logging.js';

// Debug mode - set to true to see Langfuse logging
const DEBUG = process.env.LANGFUSE_DEBUG === 'true';

// Flush resilience thresholds
const MAX_CONSECUTIVE_FLUSH_FAILURES = 3;
const SLOW_FLUSH_THRESHOLD_MS = 5000;

/**
 * Log to stderr (MCP servers must use stderr for logs, stdout is for protocol)
 */
function log(message: string, ...args: unknown[]) {
  baseLogError(`[LANGFUSE] ${message}`, ...args);
}

function debugLog(message: string, ...args: unknown[]) {
  if (DEBUG) {
    log(message, ...args);
  }
}

function shouldSkipHealthCheck(): boolean {
  const override = process.env.LANGFUSE_HEALTH_CHECK; // 'force' | 'skip' | undefined
  if (override === 'force') return false;
  if (override === 'skip') return true;
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/**
 * Configuration for LangfuseTracer
 */
export interface LangfuseTracerConfig {
  secretKey?: string;
  publicKey?: string;
  baseUrl?: string;
}

/**
 * Class-based Langfuse tracer that encapsulates all tracing state
 * This approach enables dependency injection and better test isolation
 */
export class LangfuseTracer {
  private langfuse: Langfuse | null = null;
  private currentTrace: LangfuseTraceClient | null = null;
  private activeTraces = new Set<LangfuseTraceClient>();
  private endedTraces = new WeakSet<LangfuseTraceClient>();
  private healthCheckPromise: Promise<void> = Promise.resolve();
  private traceContext = new AsyncLocalStorage<LangfuseTraceClient | null>();
  private lastFlushDurationMs: number | null = null;
  private consecutiveFlushFailures: number = 0;

  constructor(config?: LangfuseTracerConfig) {
    this.initializeLangfuse(config);
  }

  /**
   * Initialize the Langfuse instance
   */
  private initializeLangfuse(config?: LangfuseTracerConfig): void {
    const secretKey = config?.secretKey ?? process.env.LANGFUSE_SECRET_KEY;
    const publicKey = config?.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
    // Support both LANGFUSE_BASE_URL (new) and LANGFUSE_BASEURL (old) for compatibility
    const baseUrl =
      config?.baseUrl ?? process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_BASEURL;

    debugLog('Initializing Langfuse...', {
      hasSecretKey: !!secretKey,
      hasPublicKey: !!publicKey,
      baseUrl,
    });

    if (!secretKey || !publicKey) {
      log('Not configured - missing LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY');
      this.healthCheckPromise = Promise.resolve();
      return;
    }

    try {
      this.langfuse = new Langfuse({
        secretKey,
        publicKey,
        baseUrl,
      });
      this.healthCheckPromise = this.runHealthCheck();
    } catch (error) {
      log('Failed to initialize:', error);
      this.healthCheckPromise = Promise.resolve();
    }
  }

  /**
   * Run an initialization-time health check so credential or network issues surface early
   */
  private async runHealthCheck(): Promise<void> {
    if (!this.langfuse) return;

    // Skip network calls in test environments to avoid flakiness
    if (shouldSkipHealthCheck()) {
      debugLog('Skipping Langfuse health check (test env or override)');
      log('Initialized successfully (health check skipped in test environment)');
      return;
    }

    try {
      debugLog('Running Langfuse health check...');

      // Use authenticated request so bad keys or unreachable hosts fail fast
      await this.langfuse.api.healthHealth({ secure: true });
      await this.langfuse.api.traceList({ limit: 1 });

      debugLog('Langfuse health check passed');
      log('Initialized successfully (health check passed)');
    } catch (error) {
      log(
        'Langfuse health check failed - tracing disabled. Verify LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL, and network connectivity.',
        error
      );
      this.langfuse = null;
      this.activeTraces.clear();
      this.currentTrace = null;
    }
  }

  /**
   * Check if Langfuse is enabled
   */
  isEnabled(): boolean {
    return this.langfuse !== null;
  }

  /**
   * Get the last measured flush duration in milliseconds (if recorded)
   */
  getLastFlushDurationMs(): number | null {
    return this.lastFlushDurationMs;
  }

  /**
   * Get the current count of consecutive flush failures
   */
  getConsecutiveFlushFailures(): number {
    return this.consecutiveFlushFailures;
  }

  /**
   * Resolve active trace using async context to avoid cross-request mixing
   */
  private getActiveTrace(): LangfuseTraceClient | null {
    // Prefer async context (AsyncLocalStorage) so concurrent traces remain isolated
    const asyncTrace = this.traceContext.getStore();
    if (asyncTrace !== undefined && asyncTrace !== null) {
      return asyncTrace;
    }

    // If only one trace is active, use it as a safe fallback for orphaned contexts
    if (this.activeTraces.size === 1) {
      return [...this.activeTraces][0];
    }

    // Fall back to instance-level trace only if it is still active
    if (this.currentTrace && this.activeTraces.has(this.currentTrace)) {
      return this.currentTrace;
    }

    return null;
  }

  /**
   * Start a new trace for an MCP session
   */
  startTrace(name: string, metadata?: Record<string, unknown>): LangfuseTraceClient | null {
    if (!this.langfuse) {
      debugLog('startTrace skipped - Langfuse not available');
      return null;
    }

    this.currentTrace = this.langfuse.trace({
      name,
      metadata,
    });
    this.activeTraces.add(this.currentTrace);
    this.traceContext.enterWith(this.currentTrace);

    log(`Started trace: ${name}`);
    return this.currentTrace;
  }

  /**
   * Get the current active trace
   */
  getCurrentTrace(): LangfuseTraceClient | null {
    // This reflects the instance state only (not async context)
    return this.currentTrace;
  }

  /**
   * Trace an MCP tool call
   */
  async traceToolCall<T>(
    toolName: string,
    params: Record<string, unknown>,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!this.langfuse) {
      return operation();
    }

    const activeTrace = this.getActiveTrace();

    const startTime = Date.now();

    const runWithContext = async () => {
      // Get trace from context (may differ from outer scope in concurrent scenarios)
      const contextTrace = this.getActiveTrace();
      const span = contextTrace
        ? contextTrace.span({
            name: `mcp.tool.${toolName}`,
            input: params,
          })
        : this.langfuse!.span({
            name: `mcp.tool.${toolName}`,
            input: params,
          });
      try {
        const result = await operation();
        const durationMs = Date.now() - startTime;

        span.update({
          output: sanitizeOutput(result),
          metadata: {
            duration_ms: durationMs,
            success: true,
          },
        });
        span.end();

        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;

        span.update({
          output: {
            error: error instanceof Error ? error.message : String(error),
          },
          metadata: {
            duration_ms: durationMs,
            success: false,
            error_type: error instanceof Error ? error.name : 'UnknownError',
          },
          level: 'ERROR',
        });
        span.end();

        throw error;
      }
    };

    if (activeTrace) {
      return await this.traceContext.run(activeTrace, runWithContext);
    }

    return await runWithContext();
  }

  /**
   * Trace an API call to Trakt
   */
  async traceApiCall<T>(method: string, endpoint: string, operation: () => Promise<T>): Promise<T> {
    if (!this.langfuse) {
      return operation();
    }

    const activeTrace = this.getActiveTrace();

    const startTime = Date.now();

    const runWithContext = async () => {
      // Get trace from context (may differ from outer scope in concurrent scenarios)
      const contextTrace = this.getActiveTrace();
      const span = contextTrace
        ? contextTrace.span({
            name: 'trakt.api',
            input: { method, endpoint },
          })
        : this.langfuse!.span({
            name: 'trakt.api',
            input: { method, endpoint },
          });

      try {
        const result = await operation();
        const durationMs = Date.now() - startTime;

        span.update({
          output: sanitizeOutput(result),
          metadata: {
            duration_ms: durationMs,
            http_method: method,
            http_endpoint: endpoint,
            success: true,
          },
        });
        span.end();

        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;

        span.update({
          output: {
            error: error instanceof Error ? error.message : String(error),
          },
          metadata: {
            duration_ms: durationMs,
            http_method: method,
            http_endpoint: endpoint,
            success: false,
          },
          level: 'ERROR',
        });
        span.end();

        throw error;
      }
    };

    if (activeTrace) {
      return await this.traceContext.run(activeTrace, runWithContext);
    }

    return await runWithContext();
  }

  /**
   * Log an NLP ambiguity event
   */
  logAmbiguity(
    query: string,
    matchCount: number,
    needsClarification: boolean,
    matchType: 'exact' | 'fuzzy' | 'partial' | 'none'
  ): void {
    if (!this.langfuse) return;

    const activeTrace = this.getActiveTrace();
    const metadata = {
      match_count: matchCount,
      needs_clarification: needsClarification,
      match_type: matchType,
      ambiguity_level:
        matchCount === 0 ? 'none' : matchCount === 1 ? 'low' : matchCount <= 5 ? 'medium' : 'high',
    };

    if (activeTrace) {
      activeTrace.event({
        name: 'nlp.ambiguity',
        input: { query },
        metadata,
      });
    } else {
      this.langfuse.event({
        name: 'nlp.ambiguity',
        input: { query },
        metadata,
      });
    }
  }

  /**
   * Log a cache operation
   */
  logCacheEvent(operation: 'hit' | 'miss', key: string, toolName?: string): void {
    if (!this.langfuse) return;

    const activeTrace = this.getActiveTrace();
    if (activeTrace) {
      activeTrace.event({
        name: `cache.${operation}`,
        metadata: {
          cache_key: key.length > 50 ? key.substring(0, 50) + '...' : key,
          tool_name: toolName,
        },
      });
    }
  }

  /**
   * End the current trace
   */
  async endTrace(options?: { awaitFlush?: boolean }): Promise<void> {
    if (!this.langfuse) {
      debugLog('endTrace skipped - Langfuse not available');
      return;
    }

    const activeTrace = this.getActiveTrace();
    // Guard against repeated endTrace calls on the same trace
    if (activeTrace && !this.endedTraces.has(activeTrace)) {
      activeTrace.update({
        metadata: {
          ended_at: new Date().toISOString(),
        },
      });
      this.endedTraces.add(activeTrace);
    }

    // Flush events to Langfuse
    const flushPromise = this.flushAndMeasure(options?.awaitFlush ?? true);
    if (options?.awaitFlush === false) {
      flushPromise.catch((error) => log('Failed to flush trace (background):', error));
    } else {
      await flushPromise;
    }
    // Clear trace state for this trace without clobbering other concurrent traces
    const traceToClear = activeTrace ?? this.currentTrace;
    if (traceToClear) {
      this.activeTraces.delete(traceToClear);
      if (traceToClear === this.currentTrace) {
        this.currentTrace = null;
      }
    }
    // Always clear instance-visible trace pointer after endTrace is invoked
    this.currentTrace = null;
    this.traceContext.enterWith(null);
  }

  private async flushAndMeasure(awaited: boolean): Promise<void> {
    if (!this.langfuse) return;

    const start = Date.now();
    log(`Flushing trace to Langfuse...${awaited ? '' : ' (background)'}`);
    try {
      await this.langfuse.flushAsync();
      this.lastFlushDurationMs = Date.now() - start;

      // Reset consecutive failure counter on success
      this.consecutiveFlushFailures = 0;

      // Check for slow flush and warn if threshold exceeded
      if (this.lastFlushDurationMs >= SLOW_FLUSH_THRESHOLD_MS) {
        log(
          `WARNING: Slow flush detected - took ${this.lastFlushDurationMs}ms (threshold: ${SLOW_FLUSH_THRESHOLD_MS}ms)`
        );
      } else {
        debugLog(
          `Trace flushed successfully in ${this.lastFlushDurationMs}ms${awaited ? '' : ' (background)'}`
        );
      }
    } catch (error) {
      this.lastFlushDurationMs = Date.now() - start;
      this.consecutiveFlushFailures++;

      log(
        `Failed to flush trace after ${this.lastFlushDurationMs}ms (consecutive failures: ${this.consecutiveFlushFailures}):`,
        error
      );

      // Disable tracer after repeated failures to prevent silent error accumulation
      if (this.consecutiveFlushFailures >= MAX_CONSECUTIVE_FLUSH_FAILURES) {
        log(
          `CRITICAL: Disabling Langfuse tracer after ${this.consecutiveFlushFailures} consecutive flush failures. Tracing will be disabled until server restart.`
        );
        this.langfuse = null;
        this.activeTraces.clear();
        this.currentTrace = null;
      }

      if (awaited) {
        throw error;
      }
    }
  }

  /**
   * Shutdown Langfuse gracefully
   */
  async shutdown(): Promise<void> {
    if (this.langfuse) {
      await this.langfuse.shutdownAsync();
      this.langfuse = null;
    }
    this.activeTraces.clear();
    this.currentTrace = null;
  }

  /**
   * Await the initialization-time health check; helpful for startup readiness gates
   */
  async waitForHealthCheck(): Promise<void> {
    await this.healthCheckPromise;
  }
}

/**
 * Factory function to create a new LangfuseTracer instance
 */
export function createLangfuseTracer(config?: LangfuseTracerConfig): LangfuseTracer {
  return new LangfuseTracer(config);
}

/**
 * Default tracer instance for convenience (backward compatible)
 * This allows existing code to work without changes while enabling
 * dependency injection for tests
 */
export const defaultTracer = createLangfuseTracer();

/**
 * Re-export methods from default instance for backward compatibility
 * This ensures existing code that imports these functions continues to work
 */
export const isLangfuseEnabled = (): boolean => defaultTracer.isEnabled();
export const startTrace = (name: string, metadata?: Record<string, unknown>) =>
  defaultTracer.startTrace(name, metadata);
export const getCurrentTrace = () => defaultTracer.getCurrentTrace();
export const traceToolCall = <T>(
  toolName: string,
  params: Record<string, unknown>,
  operation: () => Promise<T>
) => defaultTracer.traceToolCall(toolName, params, operation);
export const traceApiCall = <T>(method: string, endpoint: string, operation: () => Promise<T>) =>
  defaultTracer.traceApiCall(method, endpoint, operation);
export const logAmbiguity = (
  query: string,
  matchCount: number,
  needsClarification: boolean,
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none'
) => defaultTracer.logAmbiguity(query, matchCount, needsClarification, matchType);
export const logCacheEvent = (operation: 'hit' | 'miss', key: string, toolName?: string) =>
  defaultTracer.logCacheEvent(operation, key, toolName);
export const endTrace = (options?: { awaitFlush?: boolean }) => defaultTracer.endTrace(options);
export const shutdown = () => defaultTracer.shutdown();

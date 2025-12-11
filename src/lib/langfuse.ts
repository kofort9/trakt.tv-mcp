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

// Debug mode - set to true to see Langfuse logging
const DEBUG = process.env.LANGFUSE_DEBUG === 'true';

/**
 * Log to stderr (MCP servers must use stderr for logs, stdout is for protocol)
 */
function log(message: string, ...args: unknown[]) {
  console.error(`[LANGFUSE] ${message}`, ...args);
}

function debugLog(message: string, ...args: unknown[]) {
  if (DEBUG) {
    log(message, ...args);
  }
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
  private healthCheckPromise: Promise<void> | null = null;
  private traceContext = new AsyncLocalStorage<LangfuseTraceClient | null>();
  private lastFlushDurationMs: number | null = null;

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
      return;
    }

    try {
      this.langfuse = new Langfuse({
        secretKey,
        publicKey,
        baseUrl,
      });
      log(`Initialized successfully (baseUrl: ${baseUrl})`);
      this.healthCheckPromise = this.runHealthCheck();
    } catch (error) {
      log('Failed to initialize:', error);
    }
  }

  /**
   * Run an initialization-time health check so credential or network issues surface early
   */
  private async runHealthCheck(): Promise<void> {
    if (!this.langfuse) return;

    try {
      debugLog('Running Langfuse health check...');

      // Use authenticated request so bad keys or unreachable hosts fail fast
      await this.langfuse.api.healthHealth({ secure: true });
      await this.langfuse.api.traceList({ limit: 1 });

      debugLog('Langfuse health check passed');
    } catch (error) {
      log(
        'Langfuse health check failed - tracing disabled. Verify LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL, and network connectivity.',
        error
      );
      this.langfuse = null;
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
   * Resolve active trace using async context to avoid cross-request mixing
   */
  private getActiveTrace(): LangfuseTraceClient | null {
    // If currentTrace is explicitly null, that takes precedence (trace was ended)
    // Otherwise, check the async context for trace propagation
    if (this.currentTrace === null) {
      return null;
    }
    return this.traceContext.getStore() ?? this.currentTrace;
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
    this.traceContext.enterWith(this.currentTrace);

    log(`Started trace: ${name}`);
    return this.currentTrace;
  }

  /**
   * Get the current active trace
   */
  getCurrentTrace(): LangfuseTraceClient | null {
    return this.getActiveTrace();
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

    // Create a span for this tool call
    const activeTrace = this.getActiveTrace();
    const span = activeTrace
      ? activeTrace.span({
          name: `mcp.tool.${toolName}`,
          input: params,
        })
      : this.langfuse.span({
          name: `mcp.tool.${toolName}`,
          input: params,
        });

    const startTime = Date.now();

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
  }

  /**
   * Trace an API call to Trakt
   */
  async traceApiCall<T>(method: string, endpoint: string, operation: () => Promise<T>): Promise<T> {
    if (!this.langfuse) {
      return operation();
    }

    const activeTrace = this.getActiveTrace();
    const span = activeTrace
      ? activeTrace.span({
          name: 'trakt.api',
          input: { method, endpoint },
        })
      : this.langfuse.span({
          name: 'trakt.api',
          input: { method, endpoint },
        });

    const startTime = Date.now();

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
    if (activeTrace) {
      activeTrace.update({
        metadata: {
          ended_at: new Date().toISOString(),
        },
      });
    }

    // Flush events to Langfuse
    const flushPromise = this.flushAndMeasure(options?.awaitFlush ?? true);
    if (options?.awaitFlush === false) {
      flushPromise.catch((error) => log('Failed to flush trace (background):', error));
    } else {
      await flushPromise;
    }
    // Clear trace state - clear currentTrace first, then context
    // This ensures getActiveTrace() returns null after endTrace()
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
      debugLog(
        `Trace flushed successfully in ${this.lastFlushDurationMs}ms${awaited ? '' : ' (background)'}`
      );
    } catch (error) {
      this.lastFlushDurationMs = Date.now() - start;
      log(`Failed to flush trace after ${this.lastFlushDurationMs}ms:`, error);
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

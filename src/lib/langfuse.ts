/**
 * Langfuse Tracing Integration
 *
 * Provides observability for the Trakt MCP server using Langfuse.
 * Tracks tool calls, API requests, and NLP/ambiguity events.
 */

import { Langfuse } from 'langfuse';
import type { LangfuseTraceClient } from 'langfuse';

// Debug mode - set to true to see Langfuse logging
const DEBUG = process.env.LANGFUSE_DEBUG === 'true';

// Maximum length for string values in traces before truncation
const MAX_TRACE_STRING_LENGTH = 500;

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
    } catch (error) {
      log('Failed to initialize:', error);
    }
  }

  /**
   * Check if Langfuse is enabled
   */
  isEnabled(): boolean {
    return this.langfuse !== null;
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

    log(`Started trace: ${name}`);
    return this.currentTrace;
  }

  /**
   * Get the current active trace
   */
  getCurrentTrace(): LangfuseTraceClient | null {
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

    // Create a span for this tool call
    const span = this.currentTrace
      ? this.currentTrace.span({
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
        output: summarizeResult(result),
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

    const span = this.currentTrace
      ? this.currentTrace.span({
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
        output: summarizeResult(result),
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

    const metadata = {
      match_count: matchCount,
      needs_clarification: needsClarification,
      match_type: matchType,
      ambiguity_level:
        matchCount === 0 ? 'none' : matchCount === 1 ? 'low' : matchCount <= 5 ? 'medium' : 'high',
    };

    if (this.currentTrace) {
      this.currentTrace.event({
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

    if (this.currentTrace) {
      this.currentTrace.event({
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
  async endTrace(): Promise<void> {
    if (!this.langfuse) {
      debugLog('endTrace skipped - Langfuse not available');
      return;
    }

    if (this.currentTrace) {
      this.currentTrace.update({
        metadata: {
          ended_at: new Date().toISOString(),
        },
      });
    }

    // Flush events to Langfuse
    log('Flushing trace to Langfuse...');
    try {
      await this.langfuse.flushAsync();
      log('Trace flushed successfully');
    } catch (error) {
      log('Failed to flush trace:', error);
    }
    this.currentTrace = null;
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
 * Summarize a result for logging (truncate large objects)
 */
function summarizeResult(result: unknown): unknown {
  if (result === null || result === undefined) return result;

  if (typeof result === 'string') {
    return result.length > MAX_TRACE_STRING_LENGTH
      ? result.substring(0, MAX_TRACE_STRING_LENGTH) + '...[truncated]'
      : result;
  }

  if (Array.isArray(result)) {
    return {
      type: 'array',
      length: result.length,
      sample: result.slice(0, 3),
    };
  }

  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    if ('success' in obj) {
      return {
        success: obj.success,
        has_data: 'data' in obj,
        message: obj.message,
      };
    }
    if ('content' in obj && Array.isArray(obj.content)) {
      return {
        type: 'mcp_response',
        content_count: obj.content.length,
      };
    }
  }

  return result;
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
export const endTrace = () => defaultTracer.endTrace();
export const shutdown = () => defaultTracer.shutdown();

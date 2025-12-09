/**
 * Langfuse Tracing Integration
 *
 * Provides observability for the Trakt MCP server using Langfuse.
 * Tracks tool calls, API requests, and NLP/ambiguity events.
 */

import { Langfuse } from 'langfuse';

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

// Initialize Langfuse client (reads from env vars)
let langfuseInstance: Langfuse | null = null;

/**
 * Get or create the Langfuse instance
 */
function getLangfuse(): Langfuse | null {
  if (langfuseInstance) return langfuseInstance;

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  // Support both LANGFUSE_BASE_URL (new) and LANGFUSE_BASEURL (old) for compatibility
  const baseUrl = process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_BASEURL;

  debugLog('Initializing Langfuse...', {
    hasSecretKey: !!secretKey,
    hasPublicKey: !!publicKey,
    baseUrl,
  });

  if (!secretKey || !publicKey) {
    log('Not configured - missing LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY');
    return null;
  }

  try {
    langfuseInstance = new Langfuse({
      secretKey,
      publicKey,
      baseUrl,
    });
    log(`Initialized successfully (baseUrl: ${baseUrl})`);
  } catch (error) {
    log('Failed to initialize:', error);
    return null;
  }

  return langfuseInstance;
}

/**
 * Check if Langfuse is enabled
 */
export function isLangfuseEnabled(): boolean {
  return getLangfuse() !== null;
}

/**
 * Active trace for the current session
 */
let currentTrace: ReturnType<Langfuse['trace']> | null = null;

/**
 * Start a new trace for an MCP session
 */
export function startTrace(name: string, metadata?: Record<string, unknown>) {
  const langfuse = getLangfuse();
  if (!langfuse) {
    debugLog('startTrace skipped - Langfuse not available');
    return null;
  }

  currentTrace = langfuse.trace({
    name,
    metadata,
  });

  log(`Started trace: ${name}`);
  return currentTrace;
}

/**
 * Get the current active trace
 */
export function getCurrentTrace() {
  return currentTrace;
}

/**
 * Trace an MCP tool call
 */
export async function traceToolCall<T>(
  toolName: string,
  params: Record<string, unknown>,
  operation: () => Promise<T>
): Promise<T> {
  const langfuse = getLangfuse();
  if (!langfuse) {
    return operation();
  }

  // Create a span for this tool call
  const span = currentTrace
    ? currentTrace.span({
        name: `mcp.tool.${toolName}`,
        input: params,
      })
    : langfuse.span({
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
export async function traceApiCall<T>(
  method: string,
  endpoint: string,
  operation: () => Promise<T>
): Promise<T> {
  const langfuse = getLangfuse();
  if (!langfuse) {
    return operation();
  }

  const span = currentTrace
    ? currentTrace.span({
        name: 'trakt.api',
        input: { method, endpoint },
      })
    : langfuse.span({
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
export function logAmbiguity(
  query: string,
  matchCount: number,
  needsClarification: boolean,
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none'
) {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  const event = currentTrace
    ? currentTrace.event({
        name: 'nlp.ambiguity',
        input: { query },
        metadata: {
          match_count: matchCount,
          needs_clarification: needsClarification,
          match_type: matchType,
          ambiguity_level:
            matchCount === 0
              ? 'none'
              : matchCount === 1
                ? 'low'
                : matchCount <= 5
                  ? 'medium'
                  : 'high',
        },
      })
    : langfuse.event({
        name: 'nlp.ambiguity',
        input: { query },
        metadata: {
          match_count: matchCount,
          needs_clarification: needsClarification,
          match_type: matchType,
        },
      });

  return event;
}

/**
 * Log a cache operation
 */
export function logCacheEvent(operation: 'hit' | 'miss', key: string, toolName?: string) {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  if (currentTrace) {
    currentTrace.event({
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
export async function endTrace() {
  const langfuse = getLangfuse();
  if (!langfuse) {
    debugLog('endTrace skipped - Langfuse not available');
    return;
  }

  if (currentTrace) {
    currentTrace.update({
      metadata: {
        ended_at: new Date().toISOString(),
      },
    });
  }

  // Flush events to Langfuse
  log('Flushing trace to Langfuse...');
  try {
    await langfuse.flushAsync();
    log('Trace flushed successfully');
  } catch (error) {
    log('Failed to flush trace:', error);
  }
  currentTrace = null;
}

/**
 * Shutdown Langfuse gracefully
 */
export async function shutdown() {
  const langfuse = getLangfuse();
  if (langfuse) {
    await langfuse.shutdownAsync();
    langfuseInstance = null;
  }
}

/**
 * Summarize a result for logging (truncate large objects)
 */
function summarizeResult(result: unknown): unknown {
  if (result === null || result === undefined) return result;

  if (typeof result === 'string') {
    return result.length > 500 ? result.substring(0, 500) + '...[truncated]' : result;
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

/**
 * MCP Tool Tracer
 *
 * Provides instrumentation for MCP tools with OpenTelemetry spans.
 * Tracks tool invocations, parameters, results, and errors.
 *
 * Key features:
 * - Automatic span creation for tool calls
 * - Parameter sanitization (removes sensitive data)
 * - Error tracking with stack traces
 * - Success/failure tracking
 * - Duration measurement
 */

import { trace, SpanStatusCode, Span, Attributes } from '@opentelemetry/api';
import { isTelemetryEnabled } from './config.js';

const tracer = trace.getTracer('trakt-mcp-server', '1.0.0');

/**
 * Sensitive parameter names to sanitize from traces
 *
 * These parameters will be replaced with '[REDACTED]' in span attributes
 * to prevent leaking sensitive information to telemetry.
 */
const SENSITIVE_PARAMS = new Set([
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'clientSecret',
  'password',
  'secret',
]);

/**
 * Sanitize parameters before adding to span attributes
 *
 * Replaces sensitive values with '[REDACTED]' and limits string length
 * to prevent excessive data in traces.
 *
 * @param params - Raw parameters object
 * @returns Sanitized parameters safe for telemetry
 */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // Redact sensitive parameters
    if (SENSITIVE_PARAMS.has(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Truncate long strings (max 500 chars)
    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + '... (truncated)';
      continue;
    }

    // Recursively sanitize nested objects (one level deep)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => {
          if (SENSITIVE_PARAMS.has(k)) {
            return [k, '[REDACTED]'];
          }
          return [k, v];
        })
      );
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Create a span for an MCP tool operation
 *
 * Wraps an async operation in a traced span. The span will automatically:
 * - Record the tool name and operation type
 * - Add sanitized parameters as attributes
 * - Track success/failure status
 * - Record error details if the operation fails
 * - Measure operation duration
 *
 * @param toolName - Name of the MCP tool (e.g., "search_show", "log_watch")
 * @param operation - Async function to trace
 * @param attributes - Additional span attributes (optional)
 * @returns Result of the operation
 *
 * @example
 * ```typescript
 * const result = await traceMcpTool(
 *   'search_show',
 *   async (span) => {
 *     span.setAttribute('query', params.query);
 *     return await client.search(params.query);
 *   },
 *   { 'tool.type': 'search' }
 * );
 * ```
 */
export async function traceMcpTool<T>(
  toolName: string,
  operation: (span: Span) => Promise<T>,
  attributes?: Attributes
): Promise<T> {
  // Skip tracing if telemetry is disabled
  if (!isTelemetryEnabled()) {
    // Create a no-op span for the operation to use
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    try {
      return await operation(noopSpan);
    } finally {
      noopSpan.end();
    }
  }

  const spanName = `mcp.tool.${toolName}`;
  return await tracer.startActiveSpan(spanName, async (span) => {
    try {
      // Add standard attributes
      span.setAttribute('mcp.tool.name', toolName);
      span.setAttribute('mcp.tool.version', '1.0.0');

      // Add custom attributes
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          if (value !== undefined && value !== null) {
            span.setAttribute(key, value as string | number | boolean);
          }
        }
      }

      // Execute operation
      const result = await operation(span);

      // Mark as successful
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      // Record error details
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error) {
        span.setAttribute('error.type', error.name);
        span.setAttribute('error.message', error.message);
        if (error.stack) {
          span.setAttribute('error.stack', error.stack);
        }
      }

      // Re-throw to preserve error handling
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add sanitized tool parameters to a span
 *
 * Helper function to safely add tool parameters as span attributes.
 * Automatically sanitizes sensitive data and converts complex objects to JSON.
 *
 * @param span - The active span
 * @param params - Tool parameters to add
 */
export function addToolParams(span: Span, params: Record<string, unknown>): void {
  const sanitized = sanitizeParams(params);

  for (const [key, value] of Object.entries(sanitized)) {
    const attrKey = `mcp.tool.param.${key}`;

    if (value === null || value === undefined) {
      continue;
    }

    // Handle primitive types directly
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      span.setAttribute(attrKey, value);
      continue;
    }

    // Convert complex types to JSON
    try {
      span.setAttribute(attrKey, JSON.stringify(value));
    } catch (error) {
      span.setAttribute(attrKey, '[Unable to serialize]');
    }
  }
}

/**
 * Record a tool result in a span
 *
 * Adds result metadata to the span without including full response data
 * (to avoid excessive trace size). Useful for tracking result counts,
 * types, and success indicators.
 *
 * @param span - The active span
 * @param result - Tool result object
 */
export function addToolResult(
  span: Span,
  result: { success?: boolean; [key: string]: unknown }
): void {
  // Track success/failure
  if (typeof result.success === 'boolean') {
    span.setAttribute('mcp.tool.result.success', result.success);
  }

  // Track result count if it's an array or has a count property
  if (Array.isArray(result)) {
    span.setAttribute('mcp.tool.result.count', result.length);
  } else if (typeof result === 'object' && result !== null) {
    if ('count' in result && typeof result.count === 'number') {
      span.setAttribute('mcp.tool.result.count', result.count);
    }

    // Track result type (e.g., "show", "movie", "episode")
    if ('type' in result && typeof result.type === 'string') {
      span.setAttribute('mcp.tool.result.type', result.type);
    }
  }
}

/**
 * Create a child span within an existing trace context
 *
 * Useful for tracing sub-operations within a tool call (e.g., API requests,
 * cache lookups, data processing steps).
 *
 * @param name - Span name
 * @param operation - Async function to trace
 * @param attributes - Additional span attributes (optional)
 * @returns Result of the operation
 */
export async function traceOperation<T>(
  name: string,
  operation: (span: Span) => Promise<T>,
  attributes?: Attributes
): Promise<T> {
  if (!isTelemetryEnabled()) {
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    try {
      return await operation(noopSpan);
    } finally {
      noopSpan.end();
    }
  }

  return await tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          if (value !== undefined && value !== null) {
            span.setAttribute(key, value as string | number | boolean);
          }
        }
      }

      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error) {
        span.setAttribute('error.type', error.name);
        span.setAttribute('error.message', error.message);
        if (error.stack) {
          span.setAttribute('error.stack', error.stack);
        }
      }

      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Get the current active span
 *
 * Useful for adding attributes to the current span without
 * needing to pass it through function parameters.
 *
 * @returns The currently active span, or undefined if none
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

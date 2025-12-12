/**
 * Shared sanitization helpers to keep potentially sensitive titles, search terms, and payloads
 * consistent across inputs and outputs.
 */

const DEFAULT_INPUT_STRING_LIMIT = 100;
const DEFAULT_OUTPUT_STRING_LIMIT = 500;
const TRUNCATION_SUFFIX = '...[truncated]';

/**
 * Sanitize tool input arguments before logging/trace metadata.
 * Truncates long strings (e.g., user-entered titles/queries) and summarizes arrays/objects to
 * avoid leaking full inputs.
 */
export function sanitizeInputArgs(
  args: Record<string, unknown> | undefined,
  maxStringLength: number = DEFAULT_INPUT_STRING_LIMIT
): Record<string, unknown> {
  if (!args) return {};

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] =
        value.length > maxStringLength
          ? value.substring(0, maxStringLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
          : value;
    } else if (Array.isArray(value)) {
      // Privacy tradeoff: Include small sample for debugging while limiting exposure.
      // Sample items are recursively sanitized to avoid leaking nested sensitive data.
      const sample = value.slice(0, 2).map((item) => {
        if (item === null || item === undefined) return item;
        if (typeof item === 'string') {
          return item.length > maxStringLength
            ? item.substring(0, maxStringLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
            : item;
        }
        if (Array.isArray(item)) {
          return { type: 'array', length: item.length };
        }
        if (typeof item === 'object') {
          return { type: 'object', keys: Object.keys(item) };
        }
        return item;
      });
      sanitized[key] = {
        type: 'array',
        length: value.length,
        sample,
      };
    } else if (typeof value === 'object') {
      sanitized[key] = { type: 'object', keys: Object.keys(value) };
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Summarize outputs before logging to avoid leaking full response payloads (e.g., search results,
 * history entries) or overly large data.
 */
export function sanitizeOutput(
  result: unknown,
  maxStringLength: number = DEFAULT_OUTPUT_STRING_LIMIT
): unknown {
  if (result === null || result === undefined) return result;

  if (typeof result === 'string') {
    return result.length > maxStringLength
      ? result.substring(0, maxStringLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
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

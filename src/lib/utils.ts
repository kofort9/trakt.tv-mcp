import {
  parseISO,
  subDays,
  subWeeks,
  subMonths,
  startOfDay,
  format,
} from 'date-fns';

/**
 * Parse natural language date strings into ISO format
 * Supports: "yesterday", "last week", "last month", ISO strings, etc.
 */
export function parseNaturalDate(input: string): string {
  const now = new Date();
  const lowerInput = input.toLowerCase().trim();

  // Handle relative dates
  if (lowerInput === 'today') {
    return format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  if (lowerInput === 'yesterday') {
    return format(startOfDay(subDays(now, 1)), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  if (lowerInput === 'last week') {
    return format(startOfDay(subWeeks(now, 1)), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  if (lowerInput === 'last month') {
    return format(startOfDay(subMonths(now, 1)), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  // Try parsing as ISO date
  try {
    const parsed = parseISO(input);
    if (!isNaN(parsed.getTime())) {
      return format(parsed, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    }
  } catch {
    // Fall through to error
  }

  throw new Error(
    `Unable to parse date: "${input}". Use ISO format (YYYY-MM-DD) or natural language (today, yesterday, last week, last month)`
  );
}

/**
 * Parse date range from natural language
 */
export function parseDateRange(
  start?: string,
  end?: string
): { startAt?: string; endAt?: string } {
  const result: { startAt?: string; endAt?: string } = {};

  if (start) {
    result.startAt = parseNaturalDate(start);
  }

  if (end) {
    result.endAt = parseNaturalDate(end);
  }

  return result;
}

/**
 * Generate episode range
 * Supports formats like: "1-5", "1,3,5", "1-3,5,7-9"
 */
export function parseEpisodeRange(range: string): number[] {
  const episodes = new Set<number>();

  const parts = range.split(',').map((p) => p.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      // Range format: "1-5"
      const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
      if (isNaN(start) || isNaN(end) || start > end || start < 1) {
        throw new Error(`Invalid episode range: "${part}"`);
      }
      for (let i = start; i <= end; i++) {
        episodes.add(i);
      }
    } else {
      // Single episode
      const episode = parseInt(part, 10);
      if (isNaN(episode) || episode < 1) {
        throw new Error(`Invalid episode number: "${part}"`);
      }
      episodes.add(episode);
    }
  }

  return Array.from(episodes).sort((a, b) => a - b);
}

/**
 * Validate episode number
 */
export function validateEpisodeNumber(episode: number): void {
  if (!Number.isInteger(episode) || episode < 1) {
    throw new Error(`Episode number must be a positive integer, got: ${episode}`);
  }
}

/**
 * Validate season number
 */
export function validateSeasonNumber(season: number): void {
  if (!Number.isInteger(season) || season < 0) {
    throw new Error(`Season number must be a non-negative integer, got: ${season}`);
  }
}

/**
 * Format error response for tools
 */
export interface ToolError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function createToolError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ToolError {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Format success response for tools
 */
export interface ToolSuccess<T = unknown> {
  success: true;
  data: T;
}

export function createToolSuccess<T>(data: T): ToolSuccess<T> {
  return {
    success: true,
    data,
  };
}

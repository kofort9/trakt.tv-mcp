import { parseISO } from 'date-fns';

/**
 * Parse natural language date strings into ISO format
 * Supports: "yesterday", "last week", "last month", ISO strings, etc.
 *
 * CRITICAL: Uses UTC dates to avoid timezone-related off-by-one errors.
 * All dates are returned at midnight UTC (00:00:00.000Z).
 */
export function parseNaturalDate(input: string): string {
  const lowerInput = input.toLowerCase().trim();

  // Validate input is not empty
  if (!lowerInput || lowerInput === '') {
    throw new Error(
      'Date parameter cannot be empty. Supported formats: "today", "yesterday", "last week", "last month", "January 2025", or ISO date (YYYY-MM-DD)'
    );
  }

  // Get current date in UTC
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDate = now.getUTCDate();

  // Handle month name patterns like "January 2025", "Jan. 2025", "Jan 2025"
  const monthYearMatch = lowerInput.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})$/
  );
  if (monthYearMatch) {
    const monthMap: { [key: string]: number } = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const monthIndex = monthMap[monthYearMatch[1].substring(0, 3)];
    const year = parseInt(monthYearMatch[2], 10);

    // Return the first day of the month at UTC midnight
    const firstDay = new Date(Date.UTC(year, monthIndex, 1));
    return firstDay.toISOString();
  }

  // Handle "this month" - returns first day of current month
  if (lowerInput === 'this month') {
    const firstDay = new Date(Date.UTC(currentYear, currentMonth, 1));
    return firstDay.toISOString();
  }

  // Handle relative dates using UTC date operations
  if (lowerInput === 'today') {
    const today = new Date(Date.UTC(currentYear, currentMonth, currentDate));
    return today.toISOString();
  }

  if (lowerInput === 'yesterday') {
    // Subtract 1 day in UTC
    const yesterday = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1));
    return yesterday.toISOString();
  }

  if (lowerInput === 'last week') {
    // Subtract 7 days in UTC
    const lastWeek = new Date(Date.UTC(currentYear, currentMonth, currentDate - 7));
    return lastWeek.toISOString();
  }

  if (lowerInput === 'last month') {
    // Subtract 1 month in UTC
    const lastMonth = new Date(Date.UTC(currentYear, currentMonth - 1, currentDate));
    return lastMonth.toISOString();
  }

  // Try parsing as ISO date
  try {
    const parsed = parseISO(input);
    if (!isNaN(parsed.getTime())) {
      // Convert to UTC midnight
      const utcDate = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
      return utcDate.toISOString();
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
export function parseDateRange(start?: string, end?: string): { startAt?: string; endAt?: string } {
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
 * Parse month range (e.g., "January 2025") into start and end dates
 * Returns the first and last day of the specified month
 */
export function parseMonthRange(input: string): { startDate: string; endDate: string } {
  const lowerInput = input.toLowerCase().trim();

  // Parse "January 2025", "Jan. 2025", "Jan 2025"
  const monthYearMatch = lowerInput.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})$/
  );
  if (monthYearMatch) {
    const monthMap: { [key: string]: number } = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const monthIndex = monthMap[monthYearMatch[1].substring(0, 3)];
    const year = parseInt(monthYearMatch[2], 10);

    // First day of month at UTC midnight
    const startDate = new Date(Date.UTC(year, monthIndex, 1));
    // Last day of month at 23:59:59.999 UTC
    const endDate = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }

  // Handle "this month"
  if (lowerInput === 'this month') {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }

  throw new Error(
    `Unable to parse month range: "${input}". Use formats like "January 2025", "Jan. 2025", or "this month"`
  );
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
  message?: string;
}

export function createToolSuccess<T>(data: T, message?: string): ToolSuccess<T> {
  const result: ToolSuccess<T> = {
    success: true,
    data,
  };
  if (message) {
    result.message = message;
  }
  return result;
}

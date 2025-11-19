import { parseISO } from 'date-fns';
import type { TraktSearchResult, DisambiguationResponse, DisambiguationOption } from '../types/trakt.js';

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
      'Date parameter cannot be empty. Supported formats: "today", "yesterday", "last night", "N days ago", "N weeks ago", "last week", "last weekend", "last monday" (or any weekday), "last month", "January 2025", or ISO date (YYYY-MM-DD)'
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

  // Handle "last night" - synonym for yesterday
  if (lowerInput === 'last night' || lowerInput === 'last nite') {
    const yesterday = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1));
    return yesterday.toISOString();
  }

  // Handle "N days ago" patterns (e.g., "3 days ago", "5 days ago")
  const daysAgoMatch = lowerInput.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgoMatch) {
    const daysAgo = parseInt(daysAgoMatch[1], 10);
    const targetDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - daysAgo));
    return targetDate.toISOString();
  }

  // Handle "N weeks ago" patterns (e.g., "2 weeks ago", "three weeks ago")
  // Support both numeric and text numbers: "2 weeks ago", "two weeks ago"
  const weeksAgoMatch = lowerInput.match(/^(\d+|one|two|three|four)\s+weeks?\s+ago$/);
  if (weeksAgoMatch) {
    const numberMap: { [key: string]: number } = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
    };
    const weeksStr = weeksAgoMatch[1];
    const weeks = isNaN(Number(weeksStr)) ? numberMap[weeksStr] : parseInt(weeksStr, 10);
    const daysAgo = weeks * 7;
    const targetDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - daysAgo));
    return targetDate.toISOString();
  }

  if (lowerInput === 'last week') {
    // Subtract 7 days in UTC
    const lastWeek = new Date(Date.UTC(currentYear, currentMonth, currentDate - 7));
    return lastWeek.toISOString();
  }

  // Handle "last weekend" - returns last Saturday
  if (lowerInput === 'last weekend') {
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
    let daysToLastSaturday: number;

    if (dayOfWeek === 0) {
      // If today is Sunday, last Saturday is 1 day ago
      daysToLastSaturday = 1;
    } else {
      // Otherwise, calculate days back to last Saturday
      daysToLastSaturday = dayOfWeek + 1;
    }

    const lastSaturday = new Date(Date.UTC(currentYear, currentMonth, currentDate - daysToLastSaturday));
    return lastSaturday.toISOString();
  }

  // Handle "last [weekday]" patterns - e.g., "last monday", "last tuesday"
  const weekdayMatch = lowerInput.match(/^last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (weekdayMatch) {
    const targetWeekday = weekdayMatch[1];
    const weekdayMap: { [key: string]: number } = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const targetDay = weekdayMap[targetWeekday];
    const currentDay = now.getUTCDay();

    // Calculate days to go back
    let daysBack: number;
    if (currentDay === targetDay) {
      // If today is the target day, go back a full week
      daysBack = 7;
    } else if (currentDay > targetDay) {
      // Target day is earlier in the current week
      daysBack = currentDay - targetDay;
    } else {
      // Target day is in the previous week
      daysBack = 7 - (targetDay - currentDay);
    }

    const targetDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - daysBack));
    return targetDate.toISOString();
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
    `Unable to parse date: "${input}". Use ISO format (YYYY-MM-DD) or natural language (today, yesterday, last night, N days ago, N weeks ago, last week, last weekend, last monday, last month)`
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
    suggestions?: string[];
  };
}

export function createToolError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  suggestions?: string[]
): ToolError {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
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

/**
 * Validate that a string parameter is not empty or whitespace
 */
export function validateNonEmptyString(value: string | undefined, paramName: string): void {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '') {
    throw new Error(`${paramName} parameter cannot be empty or whitespace`);
  }
}

/**
 * Sanitize error messages for user consumption
 * Maps common API errors to user-friendly messages while logging full errors server-side
 */
export function sanitizeError(error: unknown, context?: string): string {
  // Log the full error server-side for debugging
  console.error('[Error]', context || 'Unknown context', error);

  if (error instanceof Error) {
    const message = error.message;

    // Map common error patterns to user-friendly messages
    const errorMappings: Record<string, string> = {
      // Network errors
      'Network Error': 'Unable to connect to Trakt.tv. Please check your internet connection.',
      'ECONNREFUSED': 'Unable to connect to Trakt.tv. The service may be temporarily unavailable.',
      'ETIMEDOUT': 'Request timed out. Please try again.',
      'ENOTFOUND': 'Unable to reach Trakt.tv. Please check your internet connection.',

      // Authentication errors
      'Authentication failed': 'Authentication failed. Please re-authenticate with Trakt.tv.',
      'Invalid token': 'Your session has expired. Please re-authenticate.',
      'Unauthorized': 'Authentication required. Please authenticate with Trakt.tv.',

      // Rate limiting
      'Rate limit exceeded':
        'Rate limit exceeded. Trakt.tv limits requests to 1000 per 5 minutes. Please wait a moment and try again.',
      '429': 'Rate limit exceeded. Trakt.tv limits requests to 1000 per 5 minutes. Please wait a few minutes and try again.',

      // API errors
      '404': 'The requested content was not found on Trakt.tv.',
      '500': 'Trakt.tv is experiencing issues. Please try again later.',
      '502': 'Trakt.tv is temporarily unavailable. Please try again in a few minutes.',
      '503': 'Trakt.tv is under maintenance. Please try again later.',
    };

    // Check for exact matches first
    for (const [pattern, userMessage] of Object.entries(errorMappings)) {
      if (message.includes(pattern)) {
        return userMessage;
      }
    }

    // If it's already a user-friendly message (doesn't contain technical details), return as-is
    const technicalPatterns = [
      /stack trace/i,
      /at\s+[\w.]+\s+\(/i, // Stack trace lines
      /Error:\s+Error:/i, // Nested error wrapping
      /\n\s+at\s+/i, // Multi-line stack traces
      /code:\s*['"]?\w+['"]?/i, // Error codes
    ];

    const hasTechnicalDetails = technicalPatterns.some((pattern) => pattern.test(message));
    if (!hasTechnicalDetails && message.length < 200) {
      // Likely already user-friendly
      return message;
    }

    // Generic fallback for unknown errors
    return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
  }

  // Non-Error objects
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Result of search disambiguation - either a selected item or a disambiguation response
 */
export type SearchDisambiguationResult =
  | { needsDisambiguation: true; response: DisambiguationResponse }
  | { needsDisambiguation: false; selected: TraktSearchResult };

/**
 * Handle search results and determine if disambiguation is needed
 * Returns either the selected item (if unique or exact match) or a disambiguation response
 */
export function handleSearchDisambiguation(
  searchResults: TraktSearchResult[],
  searchTerm: string,
  contentType: 'show' | 'movie',
  providedYear?: number,
  providedTraktId?: number
): SearchDisambiguationResult {
  if (searchResults.length === 0) {
    throw new Error(`No ${contentType} found matching "${searchTerm}"`);
  }

  // If traktId provided, find exact match
  if (providedTraktId !== undefined) {
    const exactMatch = searchResults.find((result) => {
      const item = contentType === 'show' ? result.show : result.movie;
      return item?.ids.trakt === providedTraktId;
    });

    if (exactMatch) {
      return { needsDisambiguation: false, selected: exactMatch };
    }
    throw new Error(`No ${contentType} found with Trakt ID ${providedTraktId}`);
  }

  // If year provided, filter by year
  if (providedYear !== undefined) {
    const yearMatches = searchResults.filter((result) => {
      const item = contentType === 'show' ? result.show : result.movie;
      return item?.year === providedYear;
    });

    if (yearMatches.length === 0) {
      throw new Error(`No ${contentType} found matching "${searchTerm}" from year ${providedYear}`);
    }

    if (yearMatches.length === 1) {
      return { needsDisambiguation: false, selected: yearMatches[0] };
    }

    // Multiple matches even with year - still need disambiguation
    searchResults = yearMatches;
  }

  // If exactly one result, auto-select it
  if (searchResults.length === 1) {
    return { needsDisambiguation: false, selected: searchResults[0] };
  }

  // Check for exact title match (case-insensitive)
  const normalizedSearchTerm = searchTerm.toLowerCase().trim();
  const exactTitleMatches = searchResults.filter((result) => {
    const item = contentType === 'show' ? result.show : result.movie;
    return item?.title.toLowerCase().trim() === normalizedSearchTerm;
  });

  // If exactly one exact title match, auto-select it
  if (exactTitleMatches.length === 1) {
    return { needsDisambiguation: false, selected: exactTitleMatches[0] };
  }

  // Multiple results - need disambiguation
  const options: DisambiguationOption[] = searchResults.slice(0, 10).map((result) => {
    const item = contentType === 'show' ? result.show : result.movie;
    if (!item) {
      throw new Error('Search result missing item data');
    }
    return {
      title: item.title,
      year: item.year,
      traktId: item.ids.trakt,
      type: contentType,
    };
  });

  return {
    needsDisambiguation: true,
    response: {
      success: false,
      needs_disambiguation: true,
      options,
      message: `Multiple matches found for "${searchTerm}". Please retry with the year parameter (e.g., year: ${options[0]?.year}) or traktId parameter (e.g., traktId: ${options[0]?.traktId}).`,
    },
  };
}

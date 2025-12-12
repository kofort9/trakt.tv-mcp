import type {
  TraktSearchResult,
  DisambiguationResponse,
  DisambiguationOption,
} from '../types/trakt.js';
import { logError } from './logging.js';

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
 * Validate ISO 8601 date format
 * Accepts two formats:
 * - Date only: YYYY-MM-DD (e.g., "2025-12-08")
 * - Full timestamp: YYYY-MM-DDTHH:MM:SS.sssZ (e.g., "2025-12-08T20:30:00.000Z")
 */
export function validateISO8601Date(value: string | undefined, paramName: string): void {
  if (!value) return; // Optional parameter - skip if not provided

  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

  // Check format first
  if (!iso8601Pattern.test(value)) {
    throw new Error(
      `${paramName} must be in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.SSSZ). ` +
        `Got invalid format: "${value}". Examples: "2025-12-08" or "2025-12-08T20:30:00.000Z"`
    );
  }

  // Extract date parts for strict validation
  const datePart = value.split('T')[0];
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // Validate month range
  if (month < 1 || month > 12) {
    throw new Error(
      `${paramName} has invalid month: ${monthStr}. Month must be between 01 and 12.`
    );
  }

  // Validate day range for the specific month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    throw new Error(
      `${paramName} has invalid day: ${dayStr} for month ${monthStr}. ` +
        `${monthStr}/${year} has ${daysInMonth} days.`
    );
  }

  // Final validation - ensure Date parsing succeeds
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`${paramName} could not be parsed as a valid date: "${value}".`);
  }
}

/**
 * Sanitize error messages for user consumption
 * Maps common API errors to user-friendly messages while logging full errors server-side
 */
export function sanitizeError(error: unknown, context?: string): string {
  // Log the full error server-side for debugging
  logError(`[Error] ${context || 'Unknown context'}`, error);

  if (error instanceof Error) {
    const message = error.message;

    // Map common error patterns to user-friendly messages
    const errorMappings: Record<string, string> = {
      // Network errors
      'Network Error': 'Unable to connect to Trakt.tv. Please check your internet connection.',
      ECONNREFUSED: 'Unable to connect to Trakt.tv. The service may be temporarily unavailable.',
      ETIMEDOUT: 'Request timed out. Please try again.',
      ENOTFOUND: 'Unable to reach Trakt.tv. Please check your internet connection.',

      // Authentication errors
      'Authentication failed': 'Authentication failed. Please re-authenticate with Trakt.tv.',
      'Invalid token': 'Your session has expired. Please re-authenticate.',
      Unauthorized: 'Authentication required. Please authenticate with Trakt.tv.',

      // Rate limiting
      'Rate limit exceeded':
        'Rate limit exceeded. Trakt.tv limits requests to 1000 per 5 minutes. Please wait a moment and try again.',
      '429':
        'Rate limit exceeded. Trakt.tv limits requests to 1000 per 5 minutes. Please wait a few minutes and try again.',

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

/**
 * NLP Event Tracking
 *
 * Specialized telemetry for natural language processing events in the MCP server.
 * Tracks search ambiguity, fuzzy matching, and disambiguation patterns.
 *
 * This module provides hooks for tracking NLP-related metrics:
 * - Search query complexity and ambiguity
 * - Multiple match scenarios requiring user clarification
 * - Fuzzy match confidence scores
 * - Disambiguation resolution methods
 *
 * These events help identify areas where the AI assistant needs better
 * prompting or where the search algorithm could be improved.
 */

import { trace, Attributes } from '@opentelemetry/api';
import { isTelemetryEnabled } from './config.js';

const tracer = trace.getTracer('trakt-mcp-server', '1.0.0');

/**
 * Match type categorization for search results
 */
export type MatchType = 'exact' | 'fuzzy' | 'partial' | 'none';

/**
 * How ambiguity was resolved (for future implementation)
 */
export type ResolutionMethod =
  | 'user_choice'
  | 'year_filter'
  | 'trakt_id'
  | 'auto_selected'
  | 'none';

/**
 * Track search ambiguity when multiple matches are found
 *
 * This event fires when a search query returns multiple results that
 * could match the user's intent, requiring clarification or further filtering.
 *
 * @param query - The user's search query
 * @param matches - Number of matches found
 * @param needsClarification - Whether user intervention is needed
 * @param matchType - Type of matching that occurred
 * @param attributes - Additional context (optional)
 *
 * @example
 * ```typescript
 * // User searches for "The Office" - multiple versions exist
 * trackSearchAmbiguity(
 *   'The Office',
 *   2, // US and UK versions
 *   true,
 *   'exact',
 *   { 'search.type': 'show' }
 * );
 * ```
 */
export function trackSearchAmbiguity(
  query: string,
  matches: number,
  needsClarification: boolean,
  matchType: MatchType = 'exact',
  attributes?: Attributes
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const span = tracer.startSpan('nlp.search.ambiguity');

  try {
    // Core NLP attributes
    span.setAttribute('nlp.query', query);
    span.setAttribute('nlp.match_count', matches);
    span.setAttribute('nlp.match_type', matchType);
    span.setAttribute('nlp.needs_clarification', needsClarification);
    span.setAttribute('nlp.query_length', query.length);

    // Categorize ambiguity level
    let ambiguityLevel: string;
    if (matches === 0) {
      ambiguityLevel = 'none';
    } else if (matches === 1) {
      ambiguityLevel = 'low';
    } else if (matches <= 5) {
      ambiguityLevel = 'medium';
    } else {
      ambiguityLevel = 'high';
    }
    span.setAttribute('nlp.ambiguity_level', ambiguityLevel);

    // Add custom attributes
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
          span.setAttribute(key, value as string | number | boolean);
        }
      }
    }
  } finally {
    span.end();
  }
}

/**
 * Track fuzzy matching results and confidence scores
 *
 * Records when fuzzy matching is used to find content and how confident
 * the match is. Useful for tuning fuzzy match thresholds and algorithms.
 *
 * @param query - The user's search query
 * @param result - The matched result title
 * @param score - Confidence score (0.0-1.0)
 * @param attributes - Additional context (optional)
 *
 * @example
 * ```typescript
 * // User searches for "Breaking Badd" (typo)
 * trackFuzzyMatch(
 *   'Breaking Badd',
 *   'Breaking Bad',
 *   0.92, // High confidence despite typo
 *   { 'search.type': 'show', 'match.algorithm': 'levenshtein' }
 * );
 * ```
 */
export function trackFuzzyMatch(
  query: string,
  result: string,
  score: number,
  attributes?: Attributes
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const span = tracer.startSpan('nlp.fuzzy_match');

  try {
    span.setAttribute('nlp.query', query);
    span.setAttribute('nlp.result', result);
    span.setAttribute('nlp.confidence', score);
    span.setAttribute('nlp.query_length', query.length);
    span.setAttribute('nlp.result_length', result.length);

    // Categorize confidence
    let confidenceLevel: string;
    if (score >= 0.9) {
      confidenceLevel = 'high';
    } else if (score >= 0.7) {
      confidenceLevel = 'medium';
    } else if (score >= 0.5) {
      confidenceLevel = 'low';
    } else {
      confidenceLevel = 'very_low';
    }
    span.setAttribute('nlp.confidence_level', confidenceLevel);

    // Calculate edit distance as a rough metric
    const editDistance = Math.abs(query.length - result.length);
    span.setAttribute('nlp.edit_distance', editDistance);

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
          span.setAttribute(key, value as string | number | boolean);
        }
      }
    }
  } finally {
    span.end();
  }
}

/**
 * Track how disambiguation was resolved
 *
 * Records when a user or system resolves an ambiguous search by providing
 * additional context (year, ID, etc.). Helps understand which disambiguation
 * strategies are most effective.
 *
 * @param query - The original ambiguous query
 * @param userChoice - The final selected result
 * @param alternatives - Number of alternative options presented
 * @param resolutionMethod - How the ambiguity was resolved
 * @param attributes - Additional context (optional)
 *
 * @example
 * ```typescript
 * // User clarified "The Office" by providing year
 * trackDisambiguation(
 *   'The Office',
 *   'The Office (US)',
 *   2, // US and UK versions
 *   'year_filter',
 *   { 'disambiguation.year': 2005 }
 * );
 * ```
 */
export function trackDisambiguation(
  query: string,
  userChoice: string,
  alternatives: number,
  resolutionMethod: ResolutionMethod,
  attributes?: Attributes
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const span = tracer.startSpan('nlp.disambiguation');

  try {
    span.setAttribute('nlp.query', query);
    span.setAttribute('nlp.user_choice', userChoice);
    span.setAttribute('nlp.alternatives_count', alternatives);
    span.setAttribute('nlp.resolution_method', resolutionMethod);

    // Track if this was a successful disambiguation
    const wasSuccessful = resolutionMethod !== 'none';
    span.setAttribute('nlp.disambiguation_success', wasSuccessful);

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
          span.setAttribute(key, value as string | number | boolean);
        }
      }
    }
  } finally {
    span.end();
  }
}

/**
 * Track search query complexity metrics
 *
 * Analyzes the search query to identify characteristics that might
 * affect search quality or require special handling.
 *
 * @param query - The search query
 * @param attributes - Additional context (optional)
 *
 * @example
 * ```typescript
 * trackQueryComplexity('star wars episode iv: a new hope (1977)');
 * // Tracks: length, has year, has special chars, word count, etc.
 * ```
 */
export function trackQueryComplexity(query: string, attributes?: Attributes): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const span = tracer.startSpan('nlp.query.complexity');

  try {
    span.setAttribute('nlp.query', query);
    span.setAttribute('nlp.query_length', query.length);

    // Analyze query characteristics
    const wordCount = query.split(/\s+/).length;
    span.setAttribute('nlp.word_count', wordCount);

    const hasYear = /\b(19|20)\d{2}\b/.test(query);
    span.setAttribute('nlp.has_year', hasYear);

    const hasSpecialChars = /[^a-zA-Z0-9\s]/.test(query);
    span.setAttribute('nlp.has_special_chars', hasSpecialChars);

    const hasParentheses = /[()]/.test(query);
    span.setAttribute('nlp.has_parentheses', hasParentheses);

    // Complexity scoring (simple heuristic)
    let complexityScore = 0;
    if (wordCount > 5) complexityScore += 1;
    if (hasYear) complexityScore += 1;
    if (hasSpecialChars) complexityScore += 1;
    if (query.length > 50) complexityScore += 1;

    let complexityLevel: string;
    if (complexityScore === 0) {
      complexityLevel = 'simple';
    } else if (complexityScore <= 2) {
      complexityLevel = 'moderate';
    } else {
      complexityLevel = 'complex';
    }
    span.setAttribute('nlp.complexity_level', complexityLevel);

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
          span.setAttribute(key, value as string | number | boolean);
        }
      }
    }
  } finally {
    span.end();
  }
}

/**
 * Track search result quality metrics
 *
 * Records metadata about search results to help evaluate search effectiveness.
 *
 * @param query - The search query
 * @param resultCount - Number of results returned
 * @param topMatchScore - Confidence score of the best match (0.0-1.0)
 * @param averageScore - Average confidence across all matches (0.0-1.0)
 * @param attributes - Additional context (optional)
 */
export function trackSearchQuality(
  query: string,
  resultCount: number,
  topMatchScore: number,
  averageScore: number,
  attributes?: Attributes
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const span = tracer.startSpan('nlp.search.quality');

  try {
    span.setAttribute('nlp.query', query);
    span.setAttribute('nlp.result_count', resultCount);
    span.setAttribute('nlp.top_match_score', topMatchScore);
    span.setAttribute('nlp.average_score', averageScore);

    // Calculate quality metrics
    const scoreVariance = topMatchScore - averageScore;
    span.setAttribute('nlp.score_variance', scoreVariance);

    // Determine search quality
    let quality: string;
    if (resultCount === 0) {
      quality = 'no_results';
    } else if (resultCount === 1 && topMatchScore >= 0.9) {
      quality = 'excellent';
    } else if (topMatchScore >= 0.8 && scoreVariance >= 0.2) {
      quality = 'good';
    } else if (resultCount > 10) {
      quality = 'too_many_results';
    } else {
      quality = 'fair';
    }
    span.setAttribute('nlp.search_quality', quality);

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
          span.setAttribute(key, value as string | number | boolean);
        }
      }
    }
  } finally {
    span.end();
  }
}

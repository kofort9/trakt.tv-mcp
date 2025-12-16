/**
 * Natural Language Parser for Watch Notes
 *
 * Parses natural language watch notes from offline queue into structured data.
 * Handles date expressions, temporal modifiers, recall patterns, and content identification.
 */

export interface ParsedWatchEntry {
  title: string;
  type: 'movie' | 'episode' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  year?: number;
  season?: number;
  episode?: number;
  watchedAt?: string; // ISO format - parsed from text or fallback
  dateSource: 'parsed' | 'fallback'; // Track if date came from text or capturedAt
  dateExpression?: string; // Original expression like "last night"
  isRecallPattern: boolean; // true if "I've seen"/"seen" pattern detected
}

/**
 * Parse natural language watch note into structured data
 *
 * @param rawText - The natural language note (e.g., "watched Dune 2021 yesterday")
 * @param capturedAt - Fallback timestamp if no date in text (ISO format)
 * @returns Parsed watch entry with extracted information
 */
export function parseWatchNote(rawText: string, capturedAt: string): ParsedWatchEntry {
  let text = rawText.trim();

  // Initialize result
  const result: ParsedWatchEntry = {
    title: '',
    type: 'unknown',
    confidence: 'medium',
    dateSource: 'fallback',
    watchedAt: capturedAt,
    isRecallPattern: false,
  };

  // 1. Check for temporal modifiers (immediate action indicators)
  const temporalModifiers = /\b(just\s+finished|just\s+now|just)\b/i;
  const temporalMatch = text.match(temporalModifiers);
  if (temporalMatch) {
    result.dateSource = 'parsed';
    result.dateExpression = temporalMatch[0].toLowerCase();
    result.watchedAt = capturedAt; // Use capture time for "just" actions
    text = text.replace(temporalMatch[0], '').trim();
  }

  // 2. Check for recall patterns (indefinite past)
  const recallPatterns =
    /\b(I['']ve\s+seen|I\s+have\s+seen|seen|I['']ve\s+watched|I\s+have\s+watched)\b/i;
  const recallMatch = text.match(recallPatterns);
  if (recallMatch && !temporalMatch) {
    result.isRecallPattern = true;
    result.dateSource = 'fallback';
    text = text.replace(recallPatterns, '').trim();
  }

  // 3. Extract explicit date expressions (if no temporal modifier yet)
  if (!temporalMatch && !result.dateExpression) {
    const dateResult = extractDateExpression(text, capturedAt);
    if (dateResult.found) {
      result.dateSource = 'parsed';
      result.dateExpression = dateResult.expression;
      result.watchedAt = dateResult.isoDate;
      text = dateResult.remainingText;
    }
  }

  // 4. Extract action verbs
  const actionVerbs = /\b(watched|finished|completed|saw|viewed)\b/i;
  text = text.replace(actionVerbs, '').trim();

  // 5. Extract season/episode patterns BEFORE removing type hints
  const episodeResult = extractEpisodeInfo(text);
  if (episodeResult.found) {
    result.season = episodeResult.season;
    result.episode = episodeResult.episode;
    result.type = 'episode';
    result.confidence = 'high';
    text = episodeResult.remainingText;
  }

  // 6. Extract type hints (after episode extraction)
  const typeHints = /\b(movie|film|show|series|episode|ep)\b/i;
  const typeMatch = text.match(typeHints);
  if (typeMatch) {
    const hint = typeMatch[0].toLowerCase();
    // Only use type hints if episode patterns haven't already determined the type
    if (!result.season && !result.episode) {
      if (hint === 'movie' || hint === 'film') {
        result.type = 'movie';
        result.confidence = 'high';
      } else if (hint === 'episode' || hint === 'ep' || hint === 'show' || hint === 'series') {
        result.type = 'episode';
      }
    }
    text = text.replace(typeHints, '').trim();
  }

  // 7. Extract year in parentheses or standalone
  const yearResult = extractYear(text);
  if (yearResult.found) {
    result.year = yearResult.year;
    text = yearResult.remainingText;
  }

  // 8. Remaining text is the title
  result.title = text.trim();

  // Adjust confidence based on extracted information
  if (!result.title) {
    result.confidence = 'low';
  } else if (result.type === 'episode' && result.season && result.episode) {
    result.confidence = 'high';
  } else if (result.type === 'movie' && result.year) {
    result.confidence = 'high';
  }

  return result;
}

/**
 * Extract date expression from text and convert to ISO format
 */
function extractDateExpression(
  text: string,
  capturedAt: string
): { found: boolean; expression?: string; isoDate?: string; remainingText: string } {
  const capturedDate = new Date(capturedAt);

  // Date patterns (ordered by specificity)
  const patterns = [
    // Specific dates
    { regex: /\blast\s+night\b/i, days: -1, time: 'evening' },
    { regex: /\byesterday\b/i, days: -1 },
    { regex: /\btoday\b/i, days: 0 },
    { regex: /\btonnight\b/i, days: 0, time: 'evening' },
    { regex: /\bthis\s+morning\b/i, days: 0, time: 'morning' },
    { regex: /\bthis\s+afternoon\b/i, days: 0, time: 'afternoon' },
    { regex: /\bthis\s+evening\b/i, days: 0, time: 'evening' },

    // Relative days
    { regex: /\b(\d+)\s+days?\s+ago\b/i, daysFromMatch: true },
    { regex: /\b(\d+)\s+weeks?\s+ago\b/i, weeksFromMatch: true },

    // Weekdays
    {
      regex: /\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      weekday: true,
    },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      let targetDate = new Date(capturedDate);

      if (pattern.days !== undefined) {
        targetDate.setDate(targetDate.getDate() + pattern.days);
      } else if (pattern.daysFromMatch) {
        const days = parseInt(match[1], 10);
        targetDate.setDate(targetDate.getDate() - days);
      } else if (pattern.weeksFromMatch) {
        const weeks = parseInt(match[1], 10);
        targetDate.setDate(targetDate.getDate() - weeks * 7);
      } else if (pattern.weekday) {
        const weekdayName = match[1].toLowerCase();
        const weekdays = [
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
        ];
        const targetDay = weekdays.indexOf(weekdayName);

        // Boundary check: if weekday not found or invalid, skip this pattern
        if (targetDay === -1 || targetDay < 0 || targetDay > 6) {
          continue;
        }

        const currentDay = targetDate.getDay();
        let daysBack = currentDay - targetDay;
        if (daysBack <= 0) daysBack += 7; // Go to previous week

        // Sanity check: daysBack should be between 1-7
        if (daysBack < 1 || daysBack > 7) {
          continue;
        }

        targetDate.setDate(targetDate.getDate() - daysBack);
      }

      return {
        found: true,
        expression: match[0],
        isoDate: targetDate.toISOString().split('T')[0], // YYYY-MM-DD format
        remainingText: text.replace(match[0], '').trim(),
      };
    }
  }

  return { found: false, remainingText: text };
}

/**
 * Extract season/episode information from text
 */
function extractEpisodeInfo(text: string): {
  found: boolean;
  season?: number;
  episode?: number;
  remainingText: string;
} {
  // Patterns for season/episode (ordered by specificity)
  const patterns = [
    // S2E5, S02E05, s2e5
    { regex: /\bS(\d+)E(\d+)\b/i },
    // 2x5, 2x05
    { regex: /\b(\d+)x(\d+)\b/i },
    // season 2 episode 5
    { regex: /\bseason\s+(\d+)\s+episode\s+(\d+)\b/i },
    // S2 E5, S02 E05
    { regex: /\bS\s*(\d+)\s+E\s*(\d+)\b/i },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      return {
        found: true,
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10),
        remainingText: text.replace(match[0], '').trim(),
      };
    }
  }

  return { found: false, remainingText: text };
}

/**
 * Extract year from text
 */
function extractYear(text: string): { found: boolean; year?: number; remainingText: string } {
  // Year patterns
  const patterns = [
    // In parentheses: (2021), (2020)
    /\((\d{4})\)/,
    // Standalone 4-digit year
    /\b(19\d{2}|20\d{2})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1], 10);
      // Validate year is reasonable (1900-2100)
      if (year >= 1900 && year <= 2100) {
        return {
          found: true,
          year,
          remainingText: text.replace(match[0], '').trim(),
        };
      }
    }
  }

  return { found: false, remainingText: text };
}

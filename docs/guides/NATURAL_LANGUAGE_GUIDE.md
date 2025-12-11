# Natural Language Support Guide

**Last Updated:** 2025-12-09
**Purpose:** Guide to natural language capabilities in the Trakt.tv MCP server

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Episode Specifications](#episode-specifications)
4. [Common Usage Patterns](#common-usage-patterns)
5. [Validation Rules](#validation-rules)
6. [Error Handling](#error-handling)
7. [Disambiguation](#disambiguation)
8. [Implementation Reference](#implementation-reference)

---

## Overview

The Trakt.tv MCP server provides natural language support through a clear separation of concerns between Claude (the AI assistant) and the MCP tools.

### Key Capabilities

- **Natural date interpretation by Claude**: Claude interprets expressions like "yesterday", "last week", "3 days ago" and converts them to ISO 8601 dates
- **Flexible episode specifications**: Tools parse episode ranges, non-contiguous lists, and mixed formats
- **Action verb synonyms**: "watched", "binged", "saw", "logged" (handled by Claude)
- **Parameter aliases**: Use `title` instead of requiring `movieName`/`showName`
- **Intelligent error messages**: Actionable suggestions for invalid input
- **Automatic disambiguation**: Handle ambiguous content with multiple versions

---

## Architecture

### Date Handling: Claude vs. Tools

**Claude's Responsibility:**
- Interpret natural language dates ("yesterday", "last week", "3 days ago")
- Convert to ISO 8601 format before calling tools
- Handle user timezone context if needed

**Tool's Responsibility:**
- Accept ISO 8601 dates only: `"2025-12-08"` or `"2025-12-08T20:30:00.000Z"`
- Validate date format
- Process the date for API calls

### Data Flow

```
User: "I watched Dune yesterday"
     ↓
Claude interprets:
  - "Dune" → movieName
  - "yesterday" → "2025-12-08"
     ↓
Tool receives: {
  type: "movie",
  movieName: "Dune",
  watchedAt: "2025-12-08"
}
     ↓
Tool validates ISO 8601 format → Success
     ↓
Trakt API call with parsed date
```

### Why This Architecture?

**Before:** Tools handled natural language parsing internally
**Now:** Claude handles natural language, tools are "dumb pipes" for ISO dates

**Benefits:**
1. **Simpler tools** - Tools only validate ISO 8601, not 35+ date patterns
2. **Better context** - Claude has access to user's timezone, conversation history
3. **Easier testing** - Tools test ISO dates only, Claude handles interpretation
4. **Flexibility** - Claude can evolve date interpretation without changing tools

### ISO 8601 Date Format

Tools accept two formats:

| Format              | Example                    | Description                   |
| ------------------- | -------------------------- | ----------------------------- |
| Date only           | `"2025-12-08"`             | Implies 00:00:00.000Z         |
| Full timestamp      | `"2025-12-08T20:30:00Z"`   | Specific time with UTC offset |
| Full timestamp (ms) | `"2025-12-08T20:30:00.000Z"` | With milliseconds             |

**All dates are treated as UTC** to ensure consistent behavior across timezones.

---

## Episode Specifications

### Single Episode Formats

Users can specify single episodes in multiple ways (all equivalent):

| Format           | Example              |
| ---------------- | -------------------- |
| Standard         | `S1E1`               |
| Zero-padded      | `S01E01`             |
| Lowercase        | `s1e1`               |
| Natural language | `season 1 episode 1` |

**Note:** Claude typically extracts season and episode numbers and passes them as integers to tools.

---

### Episode Ranges

Tools support parsing episode range strings:

| Format              | Example                | Result                 |
| ------------------- | ---------------------- | ---------------------- |
| Simple range        | `1-5`                  | Episodes 1, 2, 3, 4, 5 |
| Range with E prefix | `E1-E5`                | Episodes 1, 2, 3, 4, 5 |
| Natural language    | `episodes 1 through 5` | Episodes 1, 2, 3, 4, 5 |

**Usage Example:**

```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Demon Slayer",
    "season": 1,
    "episodes": "1-5",
    "watchedAt": "2025-12-08"
  }
}
```

---

### Non-Contiguous Episodes

| Format          | Example         | Result                             |
| --------------- | --------------- | ---------------------------------- |
| Comma-separated | `1,3,5`         | Episodes 1, 3, 5                   |
| Mixed ranges    | `1-3,5,7-9`     | Episodes 1, 2, 3, 5, 7, 8, 9       |
| Complex         | `1,3-5,8,10-12` | Episodes 1, 3, 4, 5, 8, 10, 11, 12 |

**Usage Example:**

```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "The Office",
    "season": 2,
    "episodes": "1-3,5,7-9",
    "watchedAt": "2025-12-01"
  }
}
```

**Implementation:** Episode range parsing is handled by `parseEpisodeRange()` in the tools layer.

---

## Common Usage Patterns

### Pattern 1: Log Single Episode

**User Phrasings:**

- "Watched Breaking Bad S1E1 yesterday"
- "I watched episode 5 of Demon Slayer season 1 last night"
- "Saw The Bear S2E3 today"

**Claude's Interpretation:**

```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "episode",
    "showName": "Breaking Bad",
    "season": 1,
    "episode": 1,
    "watchedAt": "2025-12-08"
  }
}
```

**Note:** Claude converts "yesterday" to ISO date before calling the tool.

---

### Pattern 2: Log Movie

**User Phrasings:**

- "Watched Dune yesterday"
- "Saw Interstellar last week"
- "I watched The Matrix"

**Claude's Interpretation:**

```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "watchedAt": "2025-12-08"
  }
}
```

**Ambiguity Note:** Some titles exist as both movie and TV show (e.g., "Dune"). Tools handle disambiguation by returning options for Claude to present to the user.

---

### Pattern 3: Bulk Log Episode Range

**User Phrasings:**

- "Watched Breaking Bad S1E1-5"
- "Binged episodes 1 through 10 of Demon Slayer season 1"
- "Caught up on The Bear S2E1-E8 last weekend"

**Claude's Interpretation:**

```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Breaking Bad",
    "season": 1,
    "episodes": "1-5",
    "watchedAt": "2025-12-07"
  }
}
```

**Note:** Episode range string (`"1-5"`) is passed to the tool which parses it.

---

### Pattern 4: Query Watch History (Date Range)

**User Phrasings:**

- "What did I watch in January 2025?"
- "Show me what I watched last week"
- "What have I watched today?"

**Claude's Interpretation:**

```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

**Note:** Claude converts "January 2025" to a date range before calling the tool.

---

### Pattern 5: Bulk Log Multiple Movies

**User Phrasings:**

- "Watched Dune and Interstellar yesterday"
- "Binged three movies: The Matrix, Inception, and Interstellar"

**Claude's Interpretation:**

```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "movies",
    "movieNames": ["Dune", "Interstellar"],
    "watchedAt": "2025-12-08"
  }
}
```

---

## Validation Rules

### Date Validation

Tools validate that dates are in ISO 8601 format:

| Rule               | Valid Examples                               | Invalid Examples |
| ------------------ | -------------------------------------------- | ---------------- |
| ISO 8601 date only | `"2025-12-08"`                               | `"yesterday"`    |
| ISO 8601 timestamp | `"2025-12-08T20:30:00.000Z"`                 | `"last week"`    |
| Empty strings      | N/A (rejected)                               | `""`             |
| Future dates       | `"2030-01-01"` (accepted, may return empty results) | N/A              |

**Implementation:** Date validation in tools focuses on ISO 8601 format compliance, not semantic meaning.

---

### Episode/Season Validation

| Parameter | Rule                 | Valid Range | Invalid Examples |
| --------- | -------------------- | ----------- | ---------------- |
| Episode   | Positive integer     | ≥ 1         | `0`, `-1`, `1.5` |
| Season    | Non-negative integer | ≥ 0         | `-1`, `2.5`      |

**Special Note:** Season 0 is valid (represents special episodes/specials in many shows).

**Implementation:**

- `validateEpisodeNumber()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts`
- `validateSeasonNumber()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts`

---

### Episode Range Validation

| Rule                         | Valid | Invalid           |
| ---------------------------- | ----- | ----------------- |
| Range must be ascending      | `1-5` | `5-1`             |
| Must have both start and end | `1-5` | `1-`, `-5`        |
| Must be numeric              | `1-5` | `abc`, `one-five` |
| Minimum episode is 1         | `1-5` | `0-5`             |

---

### Content Name Validation

| Rule              | Valid            | Invalid             |
| ----------------- | ---------------- | ------------------- |
| Non-empty strings | `"Breaking Bad"` | `""`, `"   "`       |
| Must be provided  | `"Dune"`         | `undefined`, `null` |

**Implementation:** See `validateNonEmptyString()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts`.

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {
      /* optional context */
    },
    "suggestions": [
      /* optional actionable suggestions */
    ]
  }
}
```

### Common Error Codes

| Code               | Meaning                    | Example                       |
| ------------------ | -------------------------- | ----------------------------- |
| `VALIDATION_ERROR` | Input validation failed    | Missing required parameter    |
| `NOT_FOUND`        | Content not found on Trakt | Misspelled show name          |
| `TRAKT_API_ERROR`  | Trakt.tv API issue         | Network error, rate limit     |
| `INVALID_INPUT`    | Invalid parameter value    | Empty string, negative number |

---

### Example Error Messages

#### Invalid Date Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date format: \"yesterday\". Expected ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.000Z)"
  }
}
```

**Note:** This error would occur if natural language was passed directly to a tool instead of being interpreted by Claude first.

---

#### Content Not Found

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "No show found matching \"Breaking Bed\"",
    "suggestions": [
      "Check the spelling of the show name",
      "Try using search_show to browse available titles",
      "Use the exact title as it appears on Trakt.tv",
      "Try including the year if there are multiple versions"
    ]
  }
}
```

**Good:** Provides actionable next steps.

---

#### Invalid Episode Range

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid episode range: \"5-1\". Start episode must be less than or equal to end episode."
  }
}
```

---

## Disambiguation

### When Disambiguation Occurs

Tools return a disambiguation response when:

1. **Multiple shows/movies with same title**
   - Example: "Dune" (2021 movie vs 2024 TV series)

2. **Same title across different years**
   - Example: "Hawaii Five-0" (1968 vs 2010)

3. **Title exists as both movie and show**
   - Example: "Fargo" (movie and TV series)

---

### Disambiguation Response Format

```json
{
  "success": false,
  "needs_disambiguation": true,
  "options": [
    {
      "title": "Dune",
      "year": 2021,
      "traktId": 123456,
      "type": "movie"
    },
    {
      "title": "Dune: Prophecy",
      "year": 2024,
      "traktId": 789012,
      "type": "show"
    }
  ],
  "message": "Multiple matches found for \"Dune\". Please retry with the year parameter (e.g., year: 2021) or traktId parameter (e.g., traktId: 123456)."
}
```

---

### Resolving Disambiguation

**Option 1: Use `year` parameter**

```json
{
  "type": "movie",
  "movieName": "Dune",
  "year": 2021,
  "watchedAt": "2025-12-08"
}
```

**Option 2: Use `traktId` parameter**

```json
{
  "type": "movie",
  "movieName": "Dune",
  "traktId": 123456,
  "watchedAt": "2025-12-08"
}
```

**For AI Assistants:** Present options to the user and ask them to clarify which version they meant.

**Example Response:**

```
I found multiple matches for "Dune":

1. **Dune** (2021) - Movie [Trakt ID: 123456]
2. **Dune: Prophecy** (2024) - TV Show [Trakt ID: 789012]

Which one did you watch? You can tell me by year (e.g., "the 2021 movie") or I can use the Trakt ID.
```

---

## Implementation Reference

### Key Functions

| Function                       | Location                    | Purpose                                    |
| ------------------------------ | --------------------------- | ------------------------------------------ |
| `parseEpisodeRange()`          | `/src/lib/utils.ts`         | Parse episode range strings to arrays      |
| `validateEpisodeNumber()`      | `/src/lib/utils.ts`         | Validate episode numbers                   |
| `validateSeasonNumber()`       | `/src/lib/utils.ts`         | Validate season numbers                    |
| `validateNonEmptyString()`     | `/src/lib/utils.ts`         | Validate string parameters                 |
| `handleSearchDisambiguation()` | `/src/lib/utils.ts`         | Handle ambiguous search results            |

### Tool Implementations

| Tool              | Location            | Purpose                         |
| ----------------- | ------------------- | ------------------------------- |
| `logWatch()`      | `/src/lib/tools.ts` | Log single episode or movie     |
| `bulkLog()`       | `/src/lib/tools.ts` | Log multiple episodes or movies |
| `searchEpisode()` | `/src/lib/tools.ts` | Search for specific episode     |

---

## Action Verbs

These verbs are synonymous when logging watches (handled by Claude):

| Verb     | Example                          |
| -------- | -------------------------------- |
| watched  | "watched Breaking Bad"           |
| binged   | "binged 5 episodes"              |
| saw      | "saw Dune yesterday"             |
| logged   | "logged Breaking Bad as watched" |
| finished | "finished season 1"              |

**Note:** "binged" typically implies multiple episodes/movies but is handled the same way.

---

## Parameter Aliases

### Content Name Parameters

| Canonical   | Alias   | Context                    |
| ----------- | ------- | -------------------------- |
| `movieName` | `title` | When `type` is `"movie"`   |
| `showName`  | `title` | When `type` is `"episode"` |

**Examples:**

```json
// Both are valid for movies:
{ "type": "movie", "movieName": "Dune", "watchedAt": "2025-12-08" }
{ "type": "movie", "title": "Dune", "watchedAt": "2025-12-08" }

// Both are valid for episodes:
{ "type": "episode", "showName": "Breaking Bad", "season": 1, "episode": 1, "watchedAt": "2025-12-08" }
{ "type": "episode", "title": "Breaking Bad", "season": 1, "episode": 1, "watchedAt": "2025-12-08" }
```

---

## Best Practices for AI Assistants

### 1. Always Convert Natural Language Dates to ISO 8601

**Before calling tools, interpret natural language dates:**

```
User: "yesterday" → Tool receives: "2025-12-08"
User: "last week" → Tool receives: "2025-12-01"
User: "3 days ago" → Tool receives: "2025-12-05"
```

**Never pass natural language directly to tools** - they expect ISO 8601 only.

---

### 2. Confirm Ambiguous Queries

When multiple interpretations are possible, ask the user for clarification rather than guessing.

**Example:**

- **User:** "Watched some episodes of Breaking Bad"
- **Bad Response:** "Logging all 62 episodes of Breaking Bad as watched today."
- **Good Response:** "Which episodes of Breaking Bad did you watch? You can specify: 'S1E1' or 'season 1 episode 1', 'episodes 1-5' or 'S1E1-5', or 'episodes 1, 3, and 5'."

---

### 3. Provide Helpful Examples

When asking for clarification, include example formats users can copy.

**Example:**

```
I need to know which season and episode you watched. You can say something like:
• "Season 1 episode 5"
• "S2E10"
• "Episodes 1 through 3 of season 1"
```

---

### 4. Handle Partial Information Gracefully

If users provide incomplete information, prompt for missing details without restarting the conversation.

**Example:**

- **User:** "Log Breaking Bad as watched"
- **Claude:** "I can help log that! I just need a few more details: Which season and episode? (e.g., 'S1E1') and when did you watch it? (e.g., 'yesterday', 'today', 'last week')"

---

### 5. Default to Sensible Values

For optional parameters, use intelligent defaults:

- **Date:** Default to current date (today's ISO date) if not specified
- **Do NOT default:** Episode/season numbers (always require explicit specification)

---

### 6. Confirm Bulk Actions

Before logging large ranges (e.g., S1E1-20), confirm with user:

**Example:**

- **User:** "Binged all of Breaking Bad season 1"
- **Claude:** "That's 7 episodes. Should I log all episodes of Breaking Bad season 1 (S1E1-E7) as watched today?"

**Threshold Recommendation:**

- 1-3 episodes: Proceed without confirmation
- 4-10 episodes: Confirm with count
- 11+ episodes: Confirm and suggest date range option

---

### 7. Leverage Error Suggestions

When errors include suggestions, present them to users:

**Example:**

```
I couldn't find "Breaking Bed" on Trakt.tv. Here are some suggestions:
• Check the spelling of the show name - did you mean "Breaking Bad"?
• Try using the search tool to browse available titles

Would you like me to search for "Breaking Bad" instead?
```

---

## Testing Edge Cases

### Date Edge Cases

| Test Case      | Input          | Expected Result                                     |
| -------------- | -------------- | --------------------------------------------------- |
| Empty string   | `""`           | Error: "Invalid date format"                        |
| Natural lang   | `"yesterday"`  | Error: "Expected ISO 8601 format" (if sent to tool) |
| Invalid format | `"12/08/2025"` | Error: "Invalid date format"                        |
| Future date    | `"2030-01-01"` | Valid (allowed, may return empty results)           |
| Valid ISO date | `"2025-12-08"` | Valid                                               |

**Note:** Natural language date errors should only occur if Claude fails to interpret the date before calling tools.

---

### Episode Edge Cases

| Test Case          | Input   | Expected Result                                       |
| ------------------ | ------- | ----------------------------------------------------- |
| Zero episode       | `0`     | Error: "Episode number must be a positive integer"    |
| Negative episode   | `-1`    | Error: "Episode number must be a positive integer"    |
| Fractional episode | `1.5`   | Error: "Episode number must be a positive integer"    |
| Negative season    | `-1`    | Error: "Season number must be a non-negative integer" |
| Zero season        | `0`     | Valid (special episodes)                              |
| Reversed range     | `"5-1"` | Error: "Invalid episode range"                        |
| Missing range end  | `"1-"`  | Error: "Invalid episode range"                        |

---

### Content Name Edge Cases

| Test Case       | Input            | Expected Result                                  |
| --------------- | ---------------- | ------------------------------------------------ |
| Empty string    | `""`             | Error: "parameter cannot be empty or whitespace" |
| Whitespace only | `"   "`          | Error: "parameter cannot be empty or whitespace" |
| Misspelled name | `"Breaking Bed"` | Error: "No show found" + suggestions             |
| Ambiguous name  | `"Dune"`         | Disambiguation response with options             |

---

## Quick Lookup Tables

### Episode Range Formats

| Pattern                | Example         | Result                             |
| ---------------------- | --------------- | ---------------------------------- |
| Simple range           | `1-5`           | Episodes 1, 2, 3, 4, 5             |
| Non-contiguous         | `1,3,5`         | Episodes 1, 3, 5                   |
| Mixed                  | `1-3,5,7-9`     | Episodes 1, 2, 3, 5, 7, 8, 9       |
| Complex                | `1,3-5,8,10-12` | Episodes 1, 3, 4, 5, 8, 10, 11, 12 |

---

### Validation Summary

| Validation Type | Min | Max | Notes                      |
| --------------- | --- | --- | -------------------------- |
| Episode number  | 1   | ∞   | Positive integers only     |
| Season number   | 0   | ∞   | Zero is valid (specials)   |
| Date format     | N/A | N/A | ISO 8601 required          |

---

## Related Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - How to contribute to this project, including adding new patterns
- **[docs/DEBUGGING.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/DEBUGGING.md)** - Debugging guide for troubleshooting
- **[docs/testing/TESTING_GUIDE.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/TESTING_GUIDE.md)** - Comprehensive testing documentation

---

**Maintained by:** Development Team
**For questions or updates:** Submit PR or open issue
**Last Validated:** 2025-12-09

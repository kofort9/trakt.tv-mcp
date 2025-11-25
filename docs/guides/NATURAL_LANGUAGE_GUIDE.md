# Natural Language Support Guide

**Last Updated:** 2025-11-25
**Purpose:** Comprehensive guide to natural language patterns supported by the Trakt.tv MCP server

---

## Table of Contents

1. [Overview](#overview)
2. [Date Expressions](#date-expressions)
3. [Episode Specifications](#episode-specifications)
4. [Common Usage Patterns](#common-usage-patterns)
5. [Validation Rules](#validation-rules)
6. [Error Handling](#error-handling)
7. [Disambiguation](#disambiguation)
8. [Implementation Reference](#implementation-reference)

---

## Overview

The Trakt.tv MCP server provides robust natural language support for dates, episode ranges, and conversational queries. This allows users to interact naturally rather than using structured API syntax.

### Key Capabilities

- **Natural date parsing**: "yesterday", "last week", "3 days ago", "last Monday"
- **Flexible episode specifications**: Ranges, non-contiguous lists, mixed formats
- **Action verb synonyms**: "watched", "binged", "saw", "logged"
- **Parameter aliases**: Use `title` instead of `movieName`/`showName`
- **Intelligent error messages**: Actionable suggestions for invalid input
- **Automatic disambiguation**: Handle ambiguous content with multiple versions

### UTC Timezone Handling

**All dates are parsed to UTC midnight (00:00:00.000Z)** to ensure consistent behavior across timezones.

This means:
- "yesterday" → Previous day at 00:00:00 UTC
- "today" → Current day at 00:00:00 UTC
- Users in different timezones get consistent results

---

## Date Expressions

### Absolute Day References

| Pattern | Example | Result |
|---------|---------|--------|
| `today` | "watched today" | Current date at 00:00:00 UTC |
| `yesterday` | "watched yesterday" | Previous day at 00:00:00 UTC |
| `tonight` | "watched tonight" | Current date (synonym for "today") |
| `last night` | "watched last night" | Previous day (synonym for "yesterday") |
| `last nite` | "watched last nite" | Previous day (informal synonym) |

**Usage Example:**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "watchedAt": "yesterday"
  }
}
```

---

### Time-of-Day Variants

All map to current date (UTC midnight):

| Pattern | Maps To |
|---------|---------|
| `this morning` | today |
| `earlier today` | today |
| `this afternoon` | today |
| `this evening` | today |

**Why:** Time-of-day expressions refer to the current day, regardless of the specific time mentioned.

---

### Relative Time Periods

| Pattern | Example | Calculation | Valid Range |
|---------|---------|-------------|-------------|
| `N days ago` | `3 days ago` | Current date - N days | 1-365 days |
| `N weeks ago` | `2 weeks ago` | Current date - (N × 7) days | 1-52 weeks |
| `one week ago` | `one week ago` | Same as "1 week ago" | - |
| `two weeks ago` | `two weeks ago` | Same as "2 weeks ago" | - |
| `three weeks ago` | `three weeks ago` | Same as "3 weeks ago" | - |
| `four weeks ago` | `four weeks ago` | Same as "4 weeks ago" | - |
| `last week` | `last week` | 7 days ago | - |
| `last month` | `last month` | 30 days ago | - |
| `last weekend` | `last weekend` | Last Saturday at 00:00:00 UTC | - |

**Usage Example:**
```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Breaking Bad",
    "season": 1,
    "episodes": "1-5",
    "watchedAt": "last weekend"
  }
}
```

---

### Weekday References

Pattern: `last [weekday]`

| Pattern | Example | Result |
|---------|---------|--------|
| `last monday` | "watched last monday" | Most recent Monday* |
| `last tuesday` | "watched last tuesday" | Most recent Tuesday* |
| `last wednesday` | "watched last wednesday" | Most recent Wednesday* |
| `last thursday` | "watched last thursday" | Most recent Thursday* |
| `last friday` | "watched last friday" | Most recent Friday* |
| `last saturday` | "watched last saturday" | Most recent Saturday* |
| `last sunday` | "watched last sunday" | Most recent Sunday* |

\* **Special Case:** If today is the specified weekday, goes back 7 days (e.g., if today is Monday and you say "last monday", it returns Monday from one week ago).

---

### Month References

| Pattern | Example | Result |
|---------|---------|--------|
| `January YYYY` | "January 2025" | 2025-01-01 at 00:00:00 UTC |
| `Jan. YYYY` | "Jan. 2025" | 2025-01-01 at 00:00:00 UTC |
| `Jan YYYY` | "Jan 2025" | 2025-01-01 at 00:00:00 UTC |
| `February YYYY` | "February 2025" | 2025-02-01 at 00:00:00 UTC |
| `this month` | "this month" | First day of current month at 00:00:00 UTC |

**Supported month names:** January/Jan, February/Feb, March/Mar, April/Apr, May, June/Jun, July/Jul, August/Aug, September/Sep, October/Oct, November/Nov, December/Dec

**For date ranges:** Use `parseMonthRange()` utility function which returns both `startDate` and `endDate` spanning the full month (e.g., January 1-31).

**Usage Example:**
```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

---

### ISO Dates

| Pattern | Example | Result |
|---------|---------|--------|
| `YYYY-MM-DD` | "2025-01-15" | 2025-01-15 at 00:00:00 UTC |

**When to use:** For dates more than 1 year in the past, ISO format is required (relative expressions like "400 days ago" are rejected).

---

## Episode Specifications

### Single Episode Formats

Users can specify single episodes in multiple ways (all equivalent):

| Format | Example |
|--------|---------|
| Standard | `S1E1` |
| Zero-padded | `S01E01` |
| Lowercase | `s1e1` |
| Natural language | `season 1 episode 1` |

**Parser:** Episodes are extracted from natural language and normalized internally.

---

### Episode Ranges

| Format | Example | Result |
|--------|---------|--------|
| Simple range | `1-5` | Episodes 1, 2, 3, 4, 5 |
| Range with E prefix | `E1-E5` | Episodes 1, 2, 3, 4, 5 |
| Natural language | `episodes 1 through 5` | Episodes 1, 2, 3, 4, 5 |

**Usage Example:**
```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Demon Slayer",
    "season": 1,
    "episodes": "1-5",
    "watchedAt": "yesterday"
  }
}
```

---

### Non-Contiguous Episodes

| Format | Example | Result |
|--------|---------|--------|
| Comma-separated | `1,3,5` | Episodes 1, 3, 5 |
| Mixed ranges | `1-3,5,7-9` | Episodes 1, 2, 3, 5, 7, 8, 9 |
| Complex | `1,3-5,8,10-12` | Episodes 1, 3, 4, 5, 8, 10, 11, 12 |

**Usage Example:**
```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "The Office",
    "season": 2,
    "episodes": "1-3,5,7-9",
    "watchedAt": "last week"
  }
}
```

**Implementation:** Use `parseEpisodeRange(range: string)` from `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 310-336).

---

## Common Usage Patterns

### Pattern 1: Query Watch History (Monthly)

**User Phrasings:**
- "What did I watch in Jan. 2025?"
- "What did I watch in January 2025?"
- "Show me what I watched in Jan 2025"
- "Give me my January 2025 watch history"

**Implementation:**
```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

**Note:** Month names must be manually converted to date ranges. The server does not automatically expand "January 2025" to a full month range.

---

### Pattern 2: Query Watch History (Recent Period)

**User Phrasings:**
- "What did I watch last week?"
- "Show me what I watched yesterday"
- "What have I watched today?"
- "What did I watch in the last 7 days?"

**Implementation:**
```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "last week",
    "endDate": "today"
  }
}
```

---

### Pattern 3: Log Single Episode

**User Phrasings:**
- "Watched Breaking Bad S1E1 yesterday"
- "I watched episode 5 of Demon Slayer season 1 last night"
- "Saw The Bear S2E3 today"

**Implementation:**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "episode",
    "showName": "Breaking Bad",
    "season": 1,
    "episode": 1,
    "watchedAt": "yesterday"
  }
}
```

---

### Pattern 4: Log Movie

**User Phrasings:**
- "Watched Dune yesterday"
- "Saw Interstellar last week"
- "I watched The Matrix"

**Implementation:**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "watchedAt": "yesterday"
  }
}
```

**Ambiguity Note:** Some titles exist as both movie and TV show (e.g., "Dune"). Use `search_show` to confirm, or trigger disambiguation flow.

---

### Pattern 5: Bulk Log Episode Range

**User Phrasings:**
- "Watched Breaking Bad S1E1-5"
- "Binged episodes 1 through 10 of Demon Slayer season 1"
- "Caught up on The Bear S2E1-E8 last weekend"

**Implementation:**
```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Breaking Bad",
    "season": 1,
    "episodes": "1-5",
    "watchedAt": "yesterday"
  }
}
```

---

### Pattern 6: Bulk Log Multiple Movies

**User Phrasings:**
- "Watched Dune and Interstellar yesterday"
- "Binged three movies: The Matrix, Inception, and Interstellar"

**Implementation:**
```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "movies",
    "movieNames": ["Dune", "Interstellar"],
    "watchedAt": "yesterday"
  }
}
```

---

## Validation Rules

### Date Validation

| Rule | Boundary | Error Example |
|------|----------|---------------|
| Empty strings not allowed | - | `""` → Error: "Date parameter cannot be empty" |
| Zero values rejected | N/A | `"0 days ago"` → Error: "Ambiguous date" |
| Max days in past | 365 days | `"400 days ago"` → Error: "Date too far in past" |
| Max weeks in past | 52 weeks | `"60 weeks ago"` → Error: "Date too far in past" |

**For dates beyond 1 year:** Use ISO format (YYYY-MM-DD) instead of relative expressions.

**Implementation:** See `parseNaturalDate()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 11-227).

---

### Episode/Season Validation

| Parameter | Rule | Valid Range | Invalid Examples |
|-----------|------|-------------|------------------|
| Episode | Positive integer | ≥ 1 | `0`, `-1`, `1.5` |
| Season | Non-negative integer | ≥ 0 | `-1`, `2.5` |

**Special Note:** Season 0 is valid (represents special episodes/specials in many shows).

**Implementation:**
- `validateEpisodeNumber()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 341-345)
- `validateSeasonNumber()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 350-354)

---

### Episode Range Validation

| Rule | Valid | Invalid |
|------|-------|---------|
| Range must be ascending | `1-5` | `5-1` |
| Must have both start and end | `1-5` | `1-`, `-5` |
| Must be numeric | `1-5` | `abc`, `one-five` |
| Minimum episode is 1 | `1-5` | `0-5` |

---

### Content Name Validation

| Rule | Valid | Invalid |
|------|-------|---------|
| Non-empty strings | `"Breaking Bad"` | `""`, `"   "` |
| Must be provided | `"Dune"` | `undefined`, `null` |

**Implementation:** See `validateNonEmptyString()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 409-414).

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": { /* optional context */ },
    "suggestions": [ /* optional actionable suggestions */ ]
  }
}
```

### Common Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| `VALIDATION_ERROR` | Input validation failed | Missing required parameter |
| `NOT_FOUND` | Content not found on Trakt | Misspelled show name |
| `TRAKT_API_ERROR` | Trakt.tv API issue | Network error, rate limit |
| `INVALID_INPUT` | Invalid parameter value | Empty string, negative number |

---

### Example Error Messages

#### Date Parsing Error

```json
{
  "success": false,
  "error": {
    "code": "TRAKT_API_ERROR",
    "message": "Unable to parse date: \"tomorow\". Use ISO format (YYYY-MM-DD) or natural language (today, yesterday, last week, last month)"
  }
}
```

**Good:** Identifies the typo and explains valid formats.

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

#### Ambiguous Date

```json
{
  "success": false,
  "error": {
    "code": "TRAKT_API_ERROR",
    "message": "Ambiguous date: \"0 days ago\" could mean today or yesterday. Use \"today\" or \"yesterday\" instead.",
    "suggestions": ["today", "yesterday"]
  }
}
```

**Good:** Explains the ambiguity and provides alternatives.

---

#### Date Too Far in Past

```json
{
  "success": false,
  "error": {
    "code": "TRAKT_API_ERROR",
    "message": "Date too far in past: 400 days ago. Please use an ISO date (YYYY-MM-DD) for dates more than a year ago.",
    "suggestions": [
      "Use ISO format like \"2024-01-15\"",
      "Maximum: \"365 days ago\""
    ]
  }
}
```

**Good:** Explains the limitation and provides alternative.

---

## Disambiguation

### When Disambiguation Occurs

The server returns a disambiguation response when:

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
  "year": 2021
}
```

**Option 2: Use `traktId` parameter**

```json
{
  "type": "movie",
  "movieName": "Dune",
  "traktId": 123456
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

| Function | Location | Purpose |
|----------|----------|---------|
| `parseNaturalDate()` | `/src/lib/utils.ts:11-227` | Parse natural language dates to ISO format |
| `parseDateRange()` | `/src/lib/utils.ts:232-244` | Parse start/end date ranges |
| `parseMonthRange()` | `/src/lib/utils.ts:250-304` | Parse month names to full month ranges |
| `parseEpisodeRange()` | `/src/lib/utils.ts:310-336` | Parse episode range strings to arrays |
| `validateEpisodeNumber()` | `/src/lib/utils.ts:341-345` | Validate episode numbers |
| `validateSeasonNumber()` | `/src/lib/utils.ts:350-354` | Validate season numbers |
| `validateNonEmptyString()` | `/src/lib/utils.ts:409-414` | Validate string parameters |
| `handleSearchDisambiguation()` | `/src/lib/utils.ts:493-576` | Handle ambiguous search results |

### Tool Implementations

| Tool | Location | Purpose |
|------|----------|---------|
| `logWatch()` | `/src/lib/tools.ts:95-271` | Log single episode or movie |
| `bulkLog()` | `/src/lib/tools.ts:277-` | Log multiple episodes or movies |
| `searchEpisode()` | `/src/lib/tools.ts:29-90` | Search for specific episode |

---

## Action Verbs

These verbs are synonymous when logging watches:

| Verb | Example |
|------|---------|
| watched | "watched Breaking Bad" |
| binged | "binged 5 episodes" |
| saw | "saw Dune yesterday" |
| logged | "logged Breaking Bad as watched" |
| finished | "finished season 1" |

**Note:** "binged" typically implies multiple episodes/movies but is handled the same way.

---

## Parameter Aliases

### Content Name Parameters

| Canonical | Alias | Context |
|-----------|-------|---------|
| `movieName` | `title` | When `type` is `"movie"` |
| `showName` | `title` | When `type` is `"episode"` |

**Examples:**

```json
// Both are valid for movies:
{ "type": "movie", "movieName": "Dune" }
{ "type": "movie", "title": "Dune" }

// Both are valid for episodes:
{ "type": "episode", "showName": "Breaking Bad", "season": 1, "episode": 1 }
{ "type": "episode", "title": "Breaking Bad", "season": 1, "episode": 1 }
```

**Implementation:** See `logWatch()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/tools.ts` (lines 99-135).

---

## Best Practices for AI Assistants

### 1. Always Confirm Ambiguous Queries

When multiple interpretations are possible, ask the user for clarification rather than guessing.

**Example:**
- **User:** "Watched some episodes of Breaking Bad"
- **Bad Response:** "Logging all 62 episodes of Breaking Bad as watched today."
- **Good Response:** "Which episodes of Breaking Bad did you watch? You can specify: 'S1E1' or 'season 1 episode 1', 'episodes 1-5' or 'S1E1-5', or 'episodes 1, 3, and 5'."

---

### 2. Provide Helpful Examples

When asking for clarification, include example formats users can copy.

**Example:**
```
I need to know which season and episode you watched. You can say something like:
• "Season 1 episode 5"
• "S2E10"
• "Episodes 1 through 3 of season 1"
```

---

### 3. Handle Partial Information Gracefully

If users provide incomplete information, prompt for missing details without restarting the conversation.

**Example:**
- **User:** "Log Breaking Bad as watched"
- **Claude:** "I can help log that! I just need a few more details: Which season and episode? (e.g., 'S1E1') and when did you watch it? (e.g., 'yesterday', 'today', 'last week')"

---

### 4. Default to Sensible Values

For optional parameters, use intelligent defaults:

- **Date:** Default to `"today"` if not specified
- **Do NOT default:** Episode/season numbers (always require explicit specification)

---

### 5. Confirm Bulk Actions

Before logging large ranges (e.g., S1E1-20), confirm with user:

**Example:**
- **User:** "Binged all of Breaking Bad season 1"
- **Claude:** "That's 7 episodes. Should I log all episodes of Breaking Bad season 1 (S1E1-E7) as watched today?"

**Threshold Recommendation:**
- 1-3 episodes: Proceed without confirmation
- 4-10 episodes: Confirm with count
- 11+ episodes: Confirm and suggest date range option

---

### 6. Use Natural Language in Responses

After successfully logging watches, provide friendly confirmation:

**Good:** "I've logged Breaking Bad S1E1 as watched yesterday. Great choice - that's the pilot episode where Walter White's journey begins!"

**Acceptable:** "Successfully logged Breaking Bad S1E1 as watched on 2025-11-18."

**Poor:** "Tool execution completed. Result: success=true"

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

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Empty string | `""` | Error: "Date parameter cannot be empty" |
| Zero days | `"0 days ago"` | Error: "Ambiguous date" |
| Zero weeks | `"0 weeks ago"` | Error: "Ambiguous date" |
| Max days | `"365 days ago"` | Valid (exactly 1 year) |
| Exceed max days | `"366 days ago"` | Error: "Date too far in past" |
| Max weeks | `"52 weeks ago"` | Valid (exactly 1 year) |
| Exceed max weeks | `"53 weeks ago"` | Error: "Date too far in past" |
| Invalid format | `"tomorow"` | Error: "Unable to parse date" |
| Future date | `"2030-01-01"` | Valid (allowed, returns empty results) |

### Episode Edge Cases

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Zero episode | `0` | Error: "Episode number must be a positive integer" |
| Negative episode | `-1` | Error: "Episode number must be a positive integer" |
| Fractional episode | `1.5` | Error: "Episode number must be a positive integer" |
| Negative season | `-1` | Error: "Season number must be a non-negative integer" |
| Zero season | `0` | Valid (special episodes) |
| Reversed range | `"5-1"` | Error: "Invalid episode range" |
| Missing range end | `"1-"` | Error: "Invalid episode range" |

### Content Name Edge Cases

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Empty string | `""` | Error: "parameter cannot be empty or whitespace" |
| Whitespace only | `"   "` | Error: "parameter cannot be empty or whitespace" |
| Misspelled name | `"Breaking Bed"` | Error: "No show found" + suggestions |
| Ambiguous name | `"Dune"` | Disambiguation response with options |

---

## Quick Lookup Tables

### Date Expression Categories

| Category | Count | Examples |
|----------|-------|----------|
| Absolute days | 5 | today, yesterday, tonight, last night, last nite |
| Time-of-day | 4 | this morning, earlier today, this afternoon, this evening |
| Relative periods | 4 | N days ago, N weeks ago, last week, last month |
| Weekdays | 7 | last monday, last tuesday, ..., last sunday |
| Month names | 12 | January, February, ..., December (+ abbreviations) |
| Special | 2 | last weekend, this month |
| ISO | 1 | YYYY-MM-DD |

**Total supported patterns:** 35+ natural language expressions + ISO dates

### Boundary Summary

| Validation Type | Min | Max | Notes |
|-----------------|-----|-----|-------|
| Episode number | 1 | ∞ | Positive integers only |
| Season number | 0 | ∞ | Zero is valid (specials) |
| Days ago | 1 | 365 | Use ISO for older dates |
| Weeks ago | 1 | 52 | Use ISO for older dates |

---

## Related Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - How to contribute to this project, including adding new NL patterns
- **[docs/DEBUGGING.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/DEBUGGING.md)** - Debugging guide for troubleshooting
- **[docs/testing/TESTING_GUIDE.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/TESTING_GUIDE.md)** - Comprehensive testing documentation

---

**Maintained by:** Development Team
**For questions or updates:** Submit PR or open issue
**Last Validated:** 2025-11-25

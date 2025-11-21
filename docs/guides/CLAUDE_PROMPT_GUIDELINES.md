# Claude Prompt Guidelines for Trakt.tv MCP Server

**Purpose:** This document guides AI assistants like Claude Code on how to interpret user queries and map them to MCP tool calls when interacting with the Trakt.tv MCP server.

**Last Updated:** 2025-11-19
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Supported Natural Language Patterns](#supported-natural-language-patterns)
3. [Pattern Mapping Examples](#pattern-mapping-examples)
4. [Validation Rules](#validation-rules)
5. [Error Handling](#error-handling)
6. [Ambiguity Resolution](#ambiguity-resolution)
7. [Best Practices](#best-practices)

---

## Overview

The Trakt.tv MCP server provides robust natural language support for date parsing and content specification. This allows users to interact conversationally rather than requiring structured API syntax.

**Key Capabilities:**
- Natural language date parsing (e.g., "yesterday", "last week", "3 days ago")
- Flexible episode specifications (ranges, non-contiguous, single episodes)
- Parameter aliases for improved UX (e.g., `title` instead of `movieName`/`showName`)
- Intelligent error messages with actionable suggestions
- Automatic disambiguation for ambiguous content

---

## Supported Natural Language Patterns

### Date Expressions

All dates are parsed to UTC midnight to ensure timezone consistency.

#### Absolute Day References
| Pattern | Example | Result |
|---------|---------|--------|
| `"today"` | "watched today" | Current date at 00:00:00 UTC |
| `"yesterday"` | "watched yesterday" | Previous day at 00:00:00 UTC |
| `"tonight"` | "watched tonight" | Current date (synonym for "today") |
| `"last night"` | "watched last night" | Previous day (synonym for "yesterday") |

#### Time-of-Day Variants (all map to "today")
| Pattern | Example | Result |
|---------|---------|--------|
| `"this morning"` | "watched this morning" | Current date at 00:00:00 UTC |
| `"earlier today"` | "watched earlier today" | Current date at 00:00:00 UTC |
| `"this afternoon"` | "watched this afternoon" | Current date at 00:00:00 UTC |
| `"this evening"` | "watched this evening" | Current date at 00:00:00 UTC |

#### Relative Time Periods
| Pattern | Example | Result | Bounds |
|---------|---------|--------|--------|
| `"N days ago"` | "3 days ago", "7 days ago" | N days before current date | 1-365 days |
| `"N weeks ago"` | "2 weeks ago", "four weeks ago" | N×7 days before current date | 1-52 weeks |
| `"last week"` | "watched last week" | 7 days ago at 00:00:00 UTC | - |
| `"last month"` | "watched last month" | 30 days ago at 00:00:00 UTC | - |
| `"last weekend"` | "watched last weekend" | Last Saturday at 00:00:00 UTC | - |

#### Weekday References
| Pattern | Example | Result |
|---------|---------|--------|
| `"last monday"` | "watched last monday" | Most recent Monday (or 7 days ago if today is Monday) |
| `"last tuesday"` | "watched last tuesday" | Most recent Tuesday |
| `"last wednesday"` | "watched last wednesday" | Most recent Wednesday |
| `"last thursday"` | "watched last thursday" | Most recent Thursday |
| `"last friday"` | "watched last friday" | Most recent Friday |
| `"last saturday"` | "watched last saturday" | Most recent Saturday |
| `"last sunday"` | "watched last sunday" | Most recent Sunday |

#### Month References
| Pattern | Example | Result |
|---------|---------|--------|
| `"January 2025"` | "watched in January 2025" | First day of January 2025 at 00:00:00 UTC |
| `"Jan. 2025"` | "watched in Jan. 2025" | First day of January 2025 at 00:00:00 UTC |
| `"Jan 2025"` | "watched in Jan 2025" | First day of January 2025 at 00:00:00 UTC |
| `"this month"` | "watched this month" | First day of current month at 00:00:00 UTC |

**Note:** For month ranges in `summarize_history`, use the helper function `parseMonthRange()` which returns both start and end dates for the full month.

#### ISO Dates
| Pattern | Example | Result |
|---------|---------|--------|
| `"YYYY-MM-DD"` | "2025-01-15" | Specified date at 00:00:00 UTC |

---

### Episode Specifications

#### Episode Number Formats
Users can specify episodes in multiple ways:

**Single Episode:**
- `S1E1` - Standard format
- `season 1 episode 1` - Natural language
- `s01e01` - Zero-padded format

**Episode Ranges:**
- `"1-5"` - Episodes 1 through 5
- `"E1-E5"` - Episodes 1 through 5 (E prefix optional)
- `"episodes 1 through 5"` - Natural language

**Non-Contiguous Episodes:**
- `"1,3,5"` - Episodes 1, 3, and 5
- `"1-3,5,7-9"` - Mixed: episodes 1, 2, 3, 5, 7, 8, 9

**Implementation:** Use the `parseEpisodeRange()` function from `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` to handle all formats.

---

### Action Verbs

Users may use various verbs to indicate watching content. Treat these as equivalent:

**Synonyms for logging watches:**
- "watched"
- "binged" (implies multiple episodes/movies)
- "saw"
- "logged"
- "finished"

**Examples:**
- "I watched Breaking Bad S1E1 yesterday" → Use `log_watch`
- "Binged episodes 1-5 of Demon Slayer" → Use `bulk_log`
- "Saw Dune last night" → Use `log_watch` (type: movie)

---

### Parameter Aliases

The server supports flexible parameter naming:

| Canonical Parameter | Alias | Context |
|---------------------|-------|---------|
| `movieName` | `title` | When type is "movie" |
| `showName` | `title` | When type is "episode" |

**Example:**
```json
// Both are valid:
{ "type": "movie", "movieName": "Dune" }
{ "type": "movie", "title": "Dune" }
```

**Implementation:** The `logWatch()` function in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/tools.ts` (lines 99-135) handles parameter normalization.

---

## Pattern Mapping Examples

### Example 1: Single Episode Watch with Natural Date

**User Query:**
> "Watched Breaking Bad S1E1 yesterday"

**Interpretation:**
- Action: Log single episode watch
- Show: "Breaking Bad"
- Season: 1
- Episode: 1
- Date: "yesterday"

**Tool Call:**
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

**Processing:**
1. `parseNaturalDate("yesterday")` converts to UTC midnight of previous day
2. Search for "Breaking Bad" on Trakt.tv
3. Verify episode S1E1 exists
4. Add to watch history

---

### Example 2: Movie with Time-of-Day Reference

**User Query:**
> "Watched Dune tonight"

**Interpretation:**
- Action: Log movie watch
- Movie: "Dune"
- Date: "tonight" (maps to today)

**Tool Call:**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "watchedAt": "tonight"
  }
}
```

**Processing:**
1. `parseNaturalDate("tonight")` converts to current day at UTC midnight
2. Search for "Dune" on Trakt.tv
3. May trigger disambiguation (movie vs show, multiple years)
4. Add to watch history

---

### Example 3: Date Range Query with Month Name

**User Query:**
> "What did I watch in January 2025?"

**Interpretation:**
- Action: Summarize watch history
- Time Range: Full month of January 2025

**Tool Call:**
```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

**Processing:**
1. Parse "January 2025" as month range
2. Convert to first day (2025-01-01) and last day (2025-01-31)
3. Fetch history within date range
4. Calculate statistics

**Note:** Claude should manually convert month names to date ranges. The `parseMonthRange()` utility function is available in the codebase but not exposed as a tool parameter directly.

---

### Example 4: Bulk Episode Logging with Range

**User Query:**
> "Binged episodes 1-5 of Dune Prophecy last weekend"

**Interpretation:**
- Action: Bulk log multiple episodes
- Show: "Dune Prophecy"
- Season: Assume season 1 if not specified (or ask for clarification)
- Episodes: Range "1-5"
- Date: "last weekend" (maps to last Saturday)

**Tool Call:**
```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Dune Prophecy",
    "season": 1,
    "episodes": "1-5",
    "watchedAt": "last weekend"
  }
}
```

**Processing:**
1. `parseNaturalDate("last weekend")` converts to last Saturday at UTC midnight
2. `parseEpisodeRange("1-5")` generates array [1, 2, 3, 4, 5]
3. Search for "Dune Prophecy"
4. Verify episodes exist
5. Add all episodes to watch history with same timestamp

---

### Example 5: Relative Date with Numeric Expression

**User Query:**
> "What did I watch 7 days ago?"

**Interpretation:**
- Action: Summarize watch history
- Time Range: Single day 7 days in the past

**Tool Call:**
```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "7 days ago",
    "endDate": "7 days ago"
  }
}
```

**Processing:**
1. `parseNaturalDate("7 days ago")` calculates date 7 days before current date
2. Same date used for both start and end creates single-day range
3. Fetch history for that specific day
4. Return statistics

---

### Example 6: Weekday Reference

**User Query:**
> "Watched The Bear last Monday"

**Interpretation:**
- Action: Log episode or season (clarify if needed)
- Show: "The Bear"
- Date: "last Monday"

**Tool Call (assuming user clarifies S2E3):**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "episode",
    "showName": "The Bear",
    "season": 2,
    "episode": 3,
    "watchedAt": "last monday"
  }
}
```

**Processing:**
1. `parseNaturalDate("last monday")` calculates most recent Monday
2. If today is Monday, returns 7 days ago
3. Otherwise calculates days back to last Monday
4. Adds watch to history

---

## Validation Rules

### Date Validation

#### Empty Strings
**Rule:** Date parameters cannot be empty strings.

**Invalid:**
```json
{ "startDate": "", "endDate": "" }
```

**Error:**
```
Date parameter cannot be empty. Supported formats: "today", "tonight", "yesterday", ...
```

**Implementation:** See `parseNaturalDate()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 14-19)

---

#### Zero Values
**Rule:** "0 days ago" and "0 weeks ago" are ambiguous and rejected.

**Invalid:**
```json
{ "watchedAt": "0 days ago" }
```

**Error:**
```
Ambiguous date: "0 days ago" could mean today or yesterday. Use "today" or "yesterday" instead.
Suggestions: today, yesterday
```

**Rationale:** "0 days ago" is unclear - does it mean the current day or the day that just ended?

**Implementation:** See `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 102-106 for days, lines 132-136 for weeks)

---

#### Maximum Bounds
**Rule:** Relative dates cannot exceed 1 year in the past.

**Limits:**
- `"N days ago"`: Maximum 365 days
- `"N weeks ago"`: Maximum 52 weeks

**Invalid:**
```json
{ "watchedAt": "400 days ago" }
```

**Error:**
```
Date too far in past: 400 days ago. Please use an ISO date (YYYY-MM-DD) for dates more than a year ago.
Suggestions: Use ISO format like "2024-01-15", Maximum: "365 days ago"
```

**Rationale:** For dates beyond 1 year, ISO format is more precise and less error-prone.

**Implementation:** See `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 108-112 for days, lines 138-142 for weeks)

---

### Episode/Season Validation

#### Episode Numbers
**Rule:** Episode numbers must be positive integers (≥ 1).

**Invalid:**
```json
{ "episode": 0 }
{ "episode": -1 }
{ "episode": 1.5 }
```

**Error:**
```
Episode number must be a positive integer, got: 0
```

**Implementation:** See `validateEpisodeNumber()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 341-345)

---

#### Season Numbers
**Rule:** Season numbers must be non-negative integers (≥ 0).

**Invalid:**
```json
{ "season": -1 }
{ "season": 2.5 }
```

**Valid:**
```json
{ "season": 0 }  // Special episodes/specials
{ "season": 1 }  // Regular season
```

**Error:**
```
Season number must be a non-negative integer, got: -1
```

**Implementation:** See `validateSeasonNumber()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 350-354)

---

#### Episode Ranges
**Rule:** Episode ranges must follow valid syntax.

**Valid Formats:**
- `"1-5"` - Range from 1 to 5
- `"1,3,5"` - Specific episodes
- `"1-3,5,7-9"` - Mixed ranges and individual episodes

**Invalid:**
```
"5-1"     // End before start
"-5"      // Missing start
"1-"      // Missing end
"abc"     // Non-numeric
"0-5"     // Episode 0 invalid
```

**Error Example:**
```
Invalid episode range: "5-1"
```

**Implementation:** See `parseEpisodeRange()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 310-336)

---

### Content Name Validation

#### Non-Empty Strings
**Rule:** Content names (show/movie names) cannot be empty or whitespace-only.

**Invalid:**
```json
{ "showName": "" }
{ "movieName": "   " }
{ "title": "" }
```

**Error:**
```
showName parameter cannot be empty or whitespace
```

**Implementation:** See `validateNonEmptyString()` in `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 409-414)

---

## Error Handling

### Error Response Format

All tools return errors in a consistent format:

```typescript
{
  success: false,
  error: {
    code: string,           // Machine-readable error code
    message: string,        // Human-readable error description
    details?: object,       // Optional additional context
    suggestions?: string[]  // Optional actionable suggestions
  }
}
```

**Example:**
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

---

### Common Error Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| `VALIDATION_ERROR` | Input validation failed | Missing required parameters, invalid types |
| `NOT_FOUND` | Content not found | Misspelled name, content doesn't exist on Trakt |
| `TRAKT_API_ERROR` | Trakt.tv API issue | Network error, API down, rate limit |
| `INVALID_INPUT` | Invalid parameter value | Empty strings, out-of-bounds numbers |

---

### Error Message Patterns

#### Good Error Messages

**Characteristics:**
- Explain what went wrong
- Provide specific context
- Suggest how to fix it
- Reference available alternatives

**Examples:**

✅ **Good:**
```
Unable to parse date: "tomorow". Use ISO format (YYYY-MM-DD) or natural language
(today, yesterday, last week, last month)
```
*Why: Identifies the typo, explains valid formats*

✅ **Good:**
```
No show found matching "Breaking Bed".
Suggestions:
- Check the spelling of the show name
- Try using search_show to browse available titles
```
*Why: Provides actionable next steps*

✅ **Good:**
```
Date too far in past: 400 days ago. Please use an ISO date (YYYY-MM-DD) for dates
more than a year ago. Maximum: "365 days ago"
```
*Why: Explains the limitation and provides alternative*

---

#### Poor Error Messages (Avoid)

❌ **Bad:**
```
Error: Invalid input
```
*Why: No context about what's invalid*

❌ **Bad:**
```
Failed
```
*Why: No information about what failed or why*

❌ **Bad:**
```
NaN
```
*Why: Technical error message, not user-friendly*

---

### Presenting Errors to Users

When an error occurs, Claude should:

1. **Acknowledge the issue clearly**
   - "I encountered an error while trying to log that episode."

2. **Explain what went wrong**
   - "The show name 'Breaking Bed' wasn't found on Trakt.tv - you might have meant 'Breaking Bad'."

3. **Provide the suggestions from the error response**
   - "Here are some tips: Check the spelling, use search_show to browse titles, or try including the year if there are multiple versions."

4. **Offer to retry or take alternative action**
   - "Would you like me to search for 'Breaking Bad' instead?"

**Example Response:**
```
I couldn't find a show called "Breaking Bed" on Trakt.tv. Did you mean "Breaking Bad"?

Here's what might help:
• Check the spelling of the show name
• Try using the search_show tool to browse available titles
• Include the year if there are multiple versions (e.g., year: 2008)

Would you like me to search for "Breaking Bad" instead?
```

---

## Ambiguity Resolution

### When Disambiguation is Needed

The server automatically detects when content references are ambiguous and returns a disambiguation response.

**Common Scenarios:**
1. **Multiple shows/movies with same name**
   - "Dune" (2021 movie vs 2024 TV series)
   - "The Office" (US vs UK versions)

2. **Shows with multiple year releases**
   - "Hawaii Five-0" (1968 vs 2010)
   - "MacGyver" (1985 vs 2016)

3. **Exact title matches across different content types**
   - Same title exists as both movie and TV show

---

### Disambiguation Response Format

When disambiguation is needed, the server returns:

```typescript
{
  success: false,
  needs_disambiguation: true,
  options: [
    {
      title: string,
      year: number,
      traktId: number,
      type: "show" | "movie"
    },
    // ... up to 10 options
  ],
  message: string
}
```

**Example:**
```json
{
  "success": false,
  "needs_disambiguation": true,
  "options": [
    { "title": "Dune", "year": 2021, "traktId": 123456, "type": "movie" },
    { "title": "Dune", "year": 2024, "traktId": 789012, "type": "show" }
  ],
  "message": "Multiple matches found for \"Dune\". Please retry with the year parameter (e.g., year: 2021) or traktId parameter (e.g., traktId: 123456)."
}
```

---

### Resolving Disambiguation

Claude should present options to the user and retry with additional parameters.

**Option 1: Use Year**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "year": 2021,
    "watchedAt": "yesterday"
  }
}
```

**Option 2: Use Trakt ID**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "traktId": 123456,
    "watchedAt": "yesterday"
  }
}
```

---

### Presentation to User

**Good Disambiguation Response:**
```
I found multiple matches for "Dune":

1. **Dune** (2021) - Movie [Trakt ID: 123456]
2. **Dune: Prophecy** (2024) - TV Show [Trakt ID: 789012]

Which one did you watch? You can tell me by year (e.g., "the 2021 movie") or I can use the Trakt ID.
```

**After User Clarification:**
```
Got it! Logging the 2021 Dune movie as watched yesterday.
```

---

### Avoiding Ambiguity Proactively

When users provide additional context, use it to avoid disambiguation:

**User Query with Year:**
> "Watched Dune 2021 yesterday"

**Extract Year:**
```json
{
  "type": "movie",
  "movieName": "Dune",
  "year": 2021,
  "watchedAt": "yesterday"
}
```

**User Query with Descriptive Context:**
> "Watched the new Dune movie with Timothée Chalamet"

**Infer Year:**
- "new" suggests recent release → likely 2021
- Still include year parameter to avoid ambiguity

---

## Best Practices

### 1. Always Confirm Ambiguous Queries

When multiple interpretations are possible, ask for clarification rather than guessing.

**Ambiguous Query:**
> "Watched some episodes of Breaking Bad"

**Bad Response:**
❌ "Logging all 62 episodes of Breaking Bad as watched today."

**Good Response:**
✅ "Which episodes of Breaking Bad did you watch? You can specify:
- A single episode: 'S1E1' or 'season 1 episode 1'
- A range: 'episodes 1-5' or 'S1E1-5'
- Multiple: 'episodes 1, 3, and 5'"

---

### 2. Provide Helpful Examples in Questions

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

**User Query:**
> "Log Breaking Bad as watched"

**Claude Response:**
```
I can help log that! I just need a few more details:
• Which season and episode? (e.g., "S1E1")
• When did you watch it? (e.g., "yesterday", "today", "last week")
```

**Follow-up Response:**
After user provides "S1E1 yesterday":
```
Got it! Logging Breaking Bad S1E1 as watched yesterday.
```

---

### 4. Default to Sensible Values

For optional parameters, use intelligent defaults:

**Date Defaults:**
- If watch date not specified → default to `"today"`

**Example:**
> "Watched Breaking Bad S1E1"

Interpret as:
```json
{
  "type": "episode",
  "showName": "Breaking Bad",
  "season": 1,
  "episode": 1,
  "watchedAt": "today"  // Default applied
}
```

**Do NOT default:**
- Episode/season numbers (always require explicit specification)
- Movie vs show type (always require clarification if ambiguous)

---

### 5. Confirm Bulk Actions

Before logging large ranges, confirm with the user to prevent mistakes.

**User Query:**
> "Binged all of Breaking Bad season 1"

**Check Episode Count:**
If season 1 has 7 episodes:

**Claude Response:**
```
That's 7 episodes. Should I log all episodes of Breaking Bad season 1 (S1E1-E7) as watched today?
```

**Threshold Recommendation:**
- 1-3 episodes: Proceed without confirmation
- 4-10 episodes: Confirm with count
- 11+ episodes: Confirm and suggest date range option

---

### 6. Use Natural Language in Responses

After successfully logging watches, provide friendly confirmation:

**Good:**
✅ "I've logged Breaking Bad S1E1 as watched yesterday. Great choice - that's the pilot episode where Walter White's journey begins!"

**Acceptable:**
✓ "Successfully logged Breaking Bad S1E1 as watched on 2025-11-18."

**Poor:**
❌ "Tool execution completed. Result: success=true"

---

### 7. Preserve User Intent with Date Expressions

When users provide specific date expressions, preserve their meaning:

**User Query:**
> "What did I watch last night?"

**Interpretation:**
Use `"last night"` which maps to "yesterday" - don't convert to ISO date before calling the tool. Let the tool handle natural language parsing.

**Good:**
```json
{ "watchedAt": "last night" }
```

**Less Good:**
```json
{ "watchedAt": "2025-11-18" }  // Loses semantic meaning
```

**Why:** The natural language parser maintains consistency with UTC boundaries and future enhancements may handle time-of-day differently.

---

### 8. Leverage Error Suggestions

When errors include suggestions, present them to users:

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "No show found matching \"Breaking Bed\"",
    "suggestions": [
      "Check the spelling of the show name",
      "Try using search_show to browse available titles"
    ]
  }
}
```

**Claude Presentation:**
```
I couldn't find "Breaking Bed" on Trakt.tv. Here are some suggestions:
• Check the spelling of the show name - did you mean "Breaking Bad"?
• Try using the search tool to browse available titles

Would you like me to search for "Breaking Bad" instead?
```

---

### 9. Handle Time Zones Transparently

All dates are in UTC. Users in different time zones may experience edge cases:

**Scenario:**
- User in PST (UTC-8) at 11 PM on Nov 18
- Says "watched tonight"
- UTC is already Nov 19

**Handling:**
1. "tonight" maps to current UTC date (Nov 19)
2. This is correct behavior - "tonight" means "today's date"
3. Claude should NOT try to adjust for user's local timezone

**Note to Claude:**
- Do NOT ask users for their timezone
- Do NOT perform manual timezone conversions
- Trust the UTC implementation in `parseNaturalDate()`

---

### 10. Batch Independent Operations

When logging multiple unrelated items, consider batching:

**User Query:**
> "Watched Dune and Interstellar yesterday"

**Good Approach:**
Call `bulk_log` once:
```json
{
  "type": "movies",
  "movieNames": ["Dune", "Interstellar"],
  "watchedAt": "yesterday"
}
```

**Less Efficient:**
Call `log_watch` twice (but still valid)

---

## Advanced Scenarios

### Scenario 1: Month Range Queries

**User Query:**
> "What did I watch in January 2025?"

**Processing:**
1. Recognize "January 2025" as a month range
2. Convert to full month: Jan 1 - Jan 31
3. Call `summarize_history` with date range

```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

**Response Formatting:**
```
In January 2025, you watched:
• 12 movies
• 0 TV episodes

You've been on a movie binge! Your most active day was January 15th with 3 movies watched.
```

---

### Scenario 2: Implied Season

**User Query:**
> "Watched episode 3 of The Bear"

**Ambiguity:**
- Season not specified
- Could be any season

**Claude Response:**
```
Which season of The Bear? For example:
• "Season 1" or "S1"
• "Season 2" or "S2"
• "Season 3" or "S3"
```

**Do NOT assume season 1** - always ask for clarification.

---

### Scenario 3: Relative Date with Specific Count

**User Query:**
> "Watched three episodes of Demon Slayer 2 weeks ago"

**Processing:**
1. Parse "three episodes" → need episode numbers
2. Parse "2 weeks ago" → valid relative date
3. Ask for specific episodes or range

**Claude Response:**
```
Which three episodes of Demon Slayer? For example:
• "Episodes 1-3" (first three)
• "Episodes 5-7" (specific range)
• "Episodes 1, 3, 5" (non-contiguous)
```

**After user specifies "episodes 1-3 of season 1":**
```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Demon Slayer",
    "season": 1,
    "episodes": "1-3",
    "watchedAt": "2 weeks ago"
  }
}
```

---

### Scenario 4: Content Type Ambiguity

**User Query:**
> "Watched Dune"

**Ambiguity:**
- Could be movie (2021, 1984) or TV show (2024)

**Claude Response:**
```
I found multiple versions of "Dune":
• Dune (2021) - Movie directed by Denis Villeneuve
• Dune (1984) - Movie directed by David Lynch
• Dune: Prophecy (2024) - TV Series

Which one did you watch?
```

**After user specifies "the 2021 movie":**
```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "year": 2021,
    "watchedAt": "today"
  }
}
```

---

## Quick Reference

### Most Common Patterns

| User Intent | Tool | Key Parameters |
|-------------|------|----------------|
| Log single episode | `log_watch` | `type: "episode"`, `showName`, `season`, `episode`, `watchedAt` |
| Log single movie | `log_watch` | `type: "movie"`, `movieName`, `watchedAt` |
| Log episode range | `bulk_log` | `type: "episodes"`, `showName`, `season`, `episodes`, `watchedAt` |
| Log multiple movies | `bulk_log` | `type: "movies"`, `movieNames`, `watchedAt` |
| Query history | `summarize_history` | `startDate`, `endDate` (both optional) |
| Search content | `search_show` | `query`, `type` (optional) |

### Date Format Quick Reference

| Category | Examples |
|----------|----------|
| Absolute | `"today"`, `"yesterday"`, `"tonight"`, `"last night"` |
| Time-of-day | `"this morning"`, `"this afternoon"`, `"this evening"` |
| Relative | `"3 days ago"`, `"2 weeks ago"`, `"last week"`, `"last month"` |
| Weekdays | `"last monday"`, `"last friday"`, `"last weekend"` |
| Months | `"January 2025"`, `"Jan. 2025"`, `"this month"` |
| ISO | `"2025-01-15"` |

### Episode Format Quick Reference

| Format | Example | Result |
|--------|---------|--------|
| Range | `"1-5"` | Episodes 1, 2, 3, 4, 5 |
| List | `"1,3,5"` | Episodes 1, 3, 5 |
| Mixed | `"1-3,5,7-9"` | Episodes 1, 2, 3, 5, 7, 8, 9 |

---

**For implementation details, see:**
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` - Date parsing and validation
- `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/tools.ts` - Tool implementations
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/NATURAL_LANGUAGE_PATTERNS.md` - Pattern library
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/NL_PATTERNS_REFERENCE.md` - Quick reference card

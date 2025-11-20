# Natural Language Patterns - Quick Reference

**Last Updated:** 2025-11-19
**Purpose:** Quick reference card for developers and power users showing all supported natural language patterns in the Trakt.tv MCP server.

---

## Date Expressions

All dates are parsed to **UTC midnight** (00:00:00.000Z) to ensure timezone consistency.

### Absolute Day References

| Pattern | Example | Result |
|---------|---------|--------|
| `today` | "watched today" | Current date at 00:00:00 UTC |
| `yesterday` | "watched yesterday" | Previous day at 00:00:00 UTC |
| `tonight` | "watched tonight" | Current date (synonym for "today") |
| `last night` | "watched last night" | Previous day (synonym for "yesterday") |
| `last nite` | "watched last nite" | Previous day (informal synonym) |

### Time-of-Day Variants

All map to current date (UTC midnight):

| Pattern | Maps To |
|---------|---------|
| `this morning` | today |
| `earlier today` | today |
| `this afternoon` | today |
| `this evening` | today |

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

\* If today is the specified weekday, goes back 7 days (e.g., if today is Monday and you say "last monday", it returns Monday from one week ago).

### Month References

| Pattern | Example | Result |
|---------|---------|--------|
| `January YYYY` | "January 2025" | 2025-01-01 at 00:00:00 UTC |
| `Jan. YYYY` | "Jan. 2025" | 2025-01-01 at 00:00:00 UTC |
| `Jan YYYY` | "Jan 2025" | 2025-01-01 at 00:00:00 UTC |
| `February YYYY` | "February 2025" | 2025-02-01 at 00:00:00 UTC |
| `this month` | "this month" | First day of current month at 00:00:00 UTC |

**Supported month names:** January/Jan, February/Feb, March/Mar, April/Apr, May, June/Jun, July/Jul, August/Aug, September/Sep, October/Oct, November/Nov, December/Dec

**Note:** For date ranges spanning full months (e.g., "January 2025" meaning Jan 1-31), use `parseMonthRange()` utility function which returns both `startDate` and `endDate`.

### ISO Dates

| Pattern | Example | Result |
|---------|---------|--------|
| `YYYY-MM-DD` | "2025-01-15" | 2025-01-15 at 00:00:00 UTC |

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

### Episode Ranges

| Format | Example | Result |
|--------|---------|--------|
| Simple range | `1-5` | Episodes 1, 2, 3, 4, 5 |
| Range with E prefix | `E1-E5` | Episodes 1, 2, 3, 4, 5 |
| Natural language | `episodes 1 through 5` | Episodes 1, 2, 3, 4, 5 |

### Non-Contiguous Episodes

| Format | Example | Result |
|--------|---------|--------|
| Comma-separated | `1,3,5` | Episodes 1, 3, 5 |
| Mixed ranges | `1-3,5,7-9` | Episodes 1, 2, 3, 5, 7, 8, 9 |
| Complex | `1,3-5,8,10-12` | Episodes 1, 3, 4, 5, 8, 10, 11, 12 |

**Implementation:** Use `parseEpisodeRange(range: string)` from `/Users/kofifort/Repos/trakt.tv-mcp/src/lib/utils.ts` (lines 310-336).

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

## Validation Boundaries

### Date Validation

| Rule | Boundary | Error Example |
|------|----------|---------------|
| Empty strings not allowed | - | `""` → Error: "Date parameter cannot be empty" |
| Zero values rejected | N/A | `"0 days ago"` → Error: "Ambiguous date" |
| Max days in past | 365 days | `"400 days ago"` → Error: "Date too far in past" |
| Max weeks in past | 52 weeks | `"60 weeks ago"` → Error: "Date too far in past" |

**For dates beyond 1 year:** Use ISO format (YYYY-MM-DD) instead of relative expressions.

### Episode/Season Validation

| Parameter | Rule | Valid Range | Invalid Examples |
|-----------|------|-------------|------------------|
| Episode | Positive integer | ≥ 1 | `0`, `-1`, `1.5` |
| Season | Non-negative integer | ≥ 0 | `-1`, `2.5` |

**Special Note:** Season 0 is valid (represents special episodes/specials in many shows).

### Episode Range Validation

| Rule | Valid | Invalid |
|------|-------|---------|
| Range must be ascending | `1-5` | `5-1` |
| Must have both start and end | `1-5` | `1-`, `-5` |
| Must be numeric | `1-5` | `abc`, `one-five` |
| Minimum episode is 1 | `1-5` | `0-5` |

### Content Name Validation

| Rule | Valid | Invalid |
|------|-------|---------|
| Non-empty strings | `"Breaking Bad"` | `""`, `"   "` |
| Must be provided | `"Dune"` | `undefined`, `null` |

---

## Error Messages

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

---

## Common Usage Patterns

### Pattern 1: Log Single Episode

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

### Pattern 2: Log Movie

```json
{
  "tool": "log_watch",
  "arguments": {
    "type": "movie",
    "movieName": "Dune",
    "year": 2021,
    "watchedAt": "last night"
  }
}
```

### Pattern 3: Bulk Log Episodes

```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "episodes",
    "showName": "Demon Slayer",
    "season": 1,
    "episodes": "1-5",
    "watchedAt": "last weekend"
  }
}
```

### Pattern 4: Bulk Log Movies

```json
{
  "tool": "bulk_log",
  "arguments": {
    "type": "movies",
    "movieNames": ["Dune", "Interstellar", "The Matrix"],
    "watchedAt": "3 days ago"
  }
}
```

### Pattern 5: Summarize History (Date Range)

```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Pattern 6: Summarize History (Relative Dates)

```json
{
  "tool": "summarize_history",
  "arguments": {
    "startDate": "last week",
    "endDate": "today"
  }
}
```

### Pattern 7: All-Time History

```json
{
  "tool": "summarize_history",
  "arguments": {}
}
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

## Testing Edge Cases

### Date Edge Cases to Test

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

### Episode Edge Cases to Test

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Zero episode | `0` | Error: "Episode number must be a positive integer" |
| Negative episode | `-1` | Error: "Episode number must be a positive integer" |
| Fractional episode | `1.5` | Error: "Episode number must be a positive integer" |
| Negative season | `-1` | Error: "Season number must be a non-negative integer" |
| Zero season | `0` | Valid (special episodes) |
| Reversed range | `"5-1"` | Error: "Invalid episode range" |
| Missing range end | `"1-"` | Error: "Invalid episode range" |

### Content Name Edge Cases to Test

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

- **[CLAUDE_PROMPT_GUIDELINES.md](./CLAUDE_PROMPT_GUIDELINES.md)** - Comprehensive guide for AI assistants
- **[CONTRIBUTING_NL.md](./CONTRIBUTING_NL.md)** - Guide for adding new NL patterns
- **[NATURAL_LANGUAGE_PATTERNS.md](./NATURAL_LANGUAGE_PATTERNS.md)** - Full pattern library with examples
- **[TEST_REPORT_summarize_history.md](./TEST_REPORT_summarize_history.md)** - Test results and validation

---

**Maintained by:** Development Team
**For questions or updates:** Submit PR or open issue

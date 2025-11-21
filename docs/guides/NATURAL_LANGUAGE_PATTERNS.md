# Natural Language Pattern Library
## Watch Tracking System - User Intent Patterns

**Last Updated:** 2025-11-18
**Purpose:** Document validated natural language patterns for watch tracking queries

---

## Intent: Query Watch History

### Pattern: Monthly History Query

**User Phrasings:**
- "What did I watch in Jan. 2025?"
- "What did I watch in January 2025?"
- "Show me what I watched in Jan 2025"
- "Give me my January 2025 watch history"
- "What did I watch last month?"

**Required Interpretation:**
1. Extract month and year
2. Convert to date range (first to last day of month)
3. Call `summarize_history` with `startDate` and `endDate`

**Implementation Pattern:**
```javascript
// For "What did I watch in Jan. 2025"
{
  tool: "summarize_history",
  arguments: {
    startDate: "2025-01-01",
    endDate: "2025-01-31"
  }
}
```

**Status:** WORKING (requires manual date conversion)

**Enhancement Opportunity:** Add month name parser to `parseNaturalDate()` function

---

### Pattern: Recent Time Period

**User Phrasings:**
- "What did I watch last week?"
- "Show me what I watched yesterday"
- "What have I watched today?"
- "What did I watch in the last 7 days?"

**Required Interpretation:**
1. Parse relative time reference
2. Convert to date range
3. Call `summarize_history` with appropriate dates

**Implementation Pattern:**
```javascript
// For "What did I watch last week?"
{
  tool: "summarize_history",
  arguments: {
    startDate: "last week",
    endDate: "today"
  }
}
```

**Status:** WORKING (fully supported)

**Supported Natural Language:**
- "yesterday" - Previous day
- "today" - Current day
- "last week" - 7 days ago
- "last month" - 30 days ago

---

### Pattern: All-Time Summary

**User Phrasings:**
- "What have I watched?"
- "Show me my watch history"
- "Summarize everything I've watched"
- "Give me my watch stats"

**Required Interpretation:**
1. No date filtering needed
2. Call `summarize_history` with no arguments

**Implementation Pattern:**
```javascript
{
  tool: "summarize_history",
  arguments: {}
}
```

**Status:** WORKING

---

### Pattern: Custom Date Range

**User Phrasings:**
- "What did I watch between January 1 and January 15?"
- "Show me my watch history from 2025-01-01 to 2025-01-15"
- "What did I watch from last Monday to yesterday?"

**Required Interpretation:**
1. Extract start and end dates
2. Convert to ISO format or natural language supported by tool
3. Call `summarize_history`

**Implementation Pattern:**
```javascript
{
  tool: "summarize_history",
  arguments: {
    startDate: "2025-01-01",
    endDate: "2025-01-15"
  }
}
```

**Status:** WORKING

**Supported Formats:**
- ISO dates: "2025-01-01"
- Natural language: "yesterday", "today", "last week", "last month"
- Mixed: Can combine ISO and natural language

---

## Intent: Log Single Watch

### Pattern: Episode with Natural Date

**User Phrasings:**
- "Watched Breaking Bad S1E1 yesterday"
- "I watched episode 5 of Demon Slayer season 1 last night"
- "Saw The Bear S2E3 today"

**Required Interpretation:**
1. Extract show name
2. Extract season number
3. Extract episode number
4. Extract watch date (natural language)
5. Call `log_watch`

**Implementation Pattern:**
```javascript
{
  tool: "log_watch",
  arguments: {
    type: "episode",
    showName: "Breaking Bad",
    season: 1,
    episode: 1,
    watchedAt: "yesterday"
  }
}
```

**Status:** WORKING

---

### Pattern: Movie with Date

**User Phrasings:**
- "Watched Dune yesterday"
- "Saw Interstellar last week"
- "I watched The Matrix"

**Required Interpretation:**
1. Determine if query refers to movie or TV show (may require clarification)
2. Extract movie name
3. Extract date (default to "today" if not specified)
4. Call `log_watch`

**Implementation Pattern:**
```javascript
{
  tool: "log_watch",
  arguments: {
    type: "movie",
    movieName: "Dune",
    watchedAt: "yesterday"
  }
}
```

**Status:** WORKING

**Ambiguity:** Some titles exist as both movie and TV show (e.g., "Dune")
**Resolution:** Use `search_show` to confirm, or ask user for clarification

---

## Intent: Bulk Logging

### Pattern: Episode Range

**User Phrasings:**
- "Watched Breaking Bad S1E1-5"
- "Binged episodes 1 through 10 of Demon Slayer season 1"
- "Caught up on The Bear S2E1-E8 last weekend"

**Required Interpretation:**
1. Extract show name
2. Extract season number
3. Extract episode range
4. Format as range string (e.g., "1-5")
5. Call `bulk_log`

**Implementation Pattern:**
```javascript
{
  tool: "bulk_log",
  arguments: {
    type: "episodes",
    showName: "Breaking Bad",
    season: 1,
    episodes: "1-5",
    watchedAt: "yesterday"
  }
}
```

**Status:** WORKING

**Supported Episode Range Formats:**
- "1-5" - Range
- "1,3,5" - Specific episodes
- "1-3,5,7-9" - Mixed ranges and specific

---

### Pattern: Multiple Episodes (Non-Contiguous)

**User Phrasings:**
- "Watched episodes 1, 3, and 5 of Breaking Bad season 1"
- "Saw The Bear S2 episodes 2, 4, 6"

**Required Interpretation:**
1. Extract show name
2. Extract season number
3. Extract episode numbers
4. Format as comma-separated string
5. Call `bulk_log`

**Implementation Pattern:**
```javascript
{
  tool: "bulk_log",
  arguments: {
    type: "episodes",
    showName: "Breaking Bad",
    season: 1,
    episodes: "1,3,5",
    watchedAt: "today"
  }
}
```

**Status:** WORKING

---

### Pattern: Multiple Movies

**User Phrasings:**
- "Watched Dune and Interstellar yesterday"
- "Binged three movies: The Matrix, Inception, and Interstellar"

**Required Interpretation:**
1. Extract list of movie names
2. Convert to array
3. Call `bulk_log`

**Implementation Pattern:**
```javascript
{
  tool: "bulk_log",
  arguments: {
    type: "movies",
    movieNames: ["Dune", "Interstellar"],
    watchedAt: "yesterday"
  }
}
```

**Status:** WORKING

---

## Intent: Search and Discover

### Pattern: Find Show

**User Phrasings:**
- "Search for Breaking Bad"
- "Find the show Demon Slayer"
- "Look up Game of Thrones"

**Required Interpretation:**
1. Extract search query
2. Optional: Determine type (show vs movie)
3. Call `search_show`

**Implementation Pattern:**
```javascript
{
  tool: "search_show",
  arguments: {
    query: "Breaking Bad",
    type: "show"  // optional
  }
}
```

**Status:** WORKING

---

### Pattern: Find Specific Episode

**User Phrasings:**
- "Find Breaking Bad season 1 episode 1"
- "What is The Bear S2E5 called?"
- "Look up Demon Slayer S1E10"

**Required Interpretation:**
1. Extract show name
2. Extract season number
3. Extract episode number
4. Call `search_episode`

**Implementation Pattern:**
```javascript
{
  tool: "search_episode",
  arguments: {
    showName: "Breaking Bad",
    season: 1,
    episode: 1
  }
}
```

**Status:** WORKING

---

## Intent: Track Shows

### Pattern: Follow Show

**User Phrasings:**
- "Follow Breaking Bad"
- "Track The Bear"
- "Add Demon Slayer to my watchlist"
- "I want to keep track of Game of Thrones"

**Required Interpretation:**
1. Extract show name
2. Call `follow_show`

**Implementation Pattern:**
```javascript
{
  tool: "follow_show",
  arguments: {
    showName: "Breaking Bad"
  }
}
```

**Status:** WORKING

---

### Pattern: Unfollow Show

**User Phrasings:**
- "Unfollow Breaking Bad"
- "Stop tracking The Bear"
- "Remove Demon Slayer from my watchlist"

**Required Interpretation:**
1. Extract show name
2. Call `unfollow_show`

**Implementation Pattern:**
```javascript
{
  tool: "unfollow_show",
  arguments: {
    showName: "Breaking Bad"
  }
}
```

**Status:** WORKING

---

### Pattern: Check Upcoming Episodes

**User Phrasings:**
- "What's coming up?"
- "Show me upcoming episodes"
- "What episodes are airing this week?"
- "What's on my calendar for the next 7 days?"

**Required Interpretation:**
1. Extract time range (if specified)
2. Call `get_upcoming`

**Implementation Pattern:**
```javascript
{
  tool: "get_upcoming",
  arguments: {
    days: 7  // optional, defaults to 7
  }
}
```

**Status:** WORKING

---

## Common Clarification Scenarios

### Ambiguous Content Type

**User Input:** "Watched Dune"
**Ambiguity:** Could be movie (2021) or TV series
**Resolution Strategy:**
1. Call `search_show` with query "Dune"
2. Check if multiple types exist
3. Ask clarifying question if needed

**Clarifying Question Template:**
"I found both a movie and a TV show called 'Dune'. Which one did you watch?"

---

### Missing Episode Number

**User Input:** "Watched some episodes of Breaking Bad season 1"
**Ambiguity:** Which specific episodes?
**Resolution Strategy:**
Ask for clarification

**Clarifying Question Template:**
"Which episodes of Breaking Bad season 1 did you watch? You can say something like 'episodes 1-5' or 'episode 3'."

---

### Ambiguous Date Reference

**User Input:** "Watched Breaking Bad last night"
**Ambiguity:** Is "last night" yesterday or late at night today?
**Current Handling:** Treated as "yesterday"
**Status:** ACCEPTABLE (UTC date handling is consistent)

---

### Vague Time Ranges

**User Input:** "Binged some episodes this weekend"
**Ambiguity:** Which specific episodes? What exact dates?
**Resolution Strategy:**
Ask for clarification on both episodes and dates

**Clarifying Questions Template:**
1. "Which show did you watch?"
2. "Which season and episode numbers?"
3. "Was this last weekend or this past weekend?"

---

## Date Parsing Reference

### Supported Natural Language Dates

| Pattern | Example | Interpretation |
|---------|---------|----------------|
| "today" | "today" | Current date at midnight UTC |
| "yesterday" | "yesterday" | Previous day at midnight UTC |
| "last week" | "last week" | 7 days ago at midnight UTC |
| "last month" | "last month" | 30 days ago at midnight UTC |
| ISO format | "2025-01-15" | Specified date at midnight UTC |

### Recommended Enhancements

These patterns should be added for better UX:

| Pattern | Example | Desired Interpretation |
|---------|---------|----------------------|
| Month names | "January 2025" | 2025-01-01 to 2025-01-31 |
| Short months | "Jan 2025" | 2025-01-01 to 2025-01-31 |
| Month with dot | "Jan. 2025" | 2025-01-01 to 2025-01-31 |
| "this month" | "this month" | Current month full range |
| "this year" | "this year" | Current year full range |
| Relative days | "3 days ago" | 3 days before current date |
| Day of week | "last Monday" | Most recent Monday |

---

## Best Practices for Conversational AI

### 1. Always Confirm Ambiguous Queries
When multiple interpretations are possible, ask the user for clarification rather than guessing.

### 2. Provide Helpful Examples
When asking for clarification, include example formats:
- "You can say 'episodes 1-5' or 'episode 3'"
- "Try 'yesterday', '2025-01-15', or 'last week'"

### 3. Handle Partial Information Gracefully
If user provides incomplete information, prompt for missing details:
- Missing season: "Which season of Breaking Bad?"
- Missing episodes: "Which episodes did you watch?"

### 4. Default to Sensible Values
- Date: Default to "today" if not specified
- Episode logging: Require explicit episode numbers (don't guess)

### 5. Confirm Bulk Actions
Before logging large ranges (e.g., S1E1-20), confirm with user:
"That's 20 episodes. Should I log all of them as watched yesterday?"

---

## Error Message Best Practices

### Good Error Messages
- "Unable to parse date: 'invalid-date'. Use ISO format (YYYY-MM-DD) or natural language (today, yesterday, last week, last month)"
- "No show found matching 'Breaking Bed'. Did you mean 'Breaking Bad'?"
- "Episode S1E99 not found for 'Breaking Bad'. Season 1 has 7 episodes."

### Poor Error Messages
- "Error: Invalid input"
- "Failed"
- "NaN"

---

## Testing Recommendations

### Regression Test Suite
Maintain tests for these critical patterns:
1. Month name queries ("January 2025")
2. Mixed date formats
3. Episode range parsing
4. Ambiguous content type resolution
5. Empty/missing parameter handling

### User Acceptance Testing
Test with real users using natural phrasings:
- Don't prompt them with structured formats
- Observe what they naturally say
- Collect failure cases and add support

---

## Appendix: Test Coverage Matrix

| Intent | Pattern | Tested | Working | Notes |
|--------|---------|--------|---------|-------|
| Query History | Monthly query | YES | PARTIAL | Requires manual date conversion |
| Query History | Recent time period | YES | YES | Natural language supported |
| Query History | All-time summary | YES | YES | No arguments needed |
| Query History | Custom date range | YES | YES | ISO + natural language |
| Log Single | Episode with date | YES | YES | Fully supported |
| Log Single | Movie with date | YES | YES | May need clarification |
| Bulk Log | Episode range | YES | YES | Multiple formats supported |
| Bulk Log | Multiple movies | YES | YES | Array of names |
| Search | Find show | YES | YES | Works with type filter |
| Search | Find episode | YES | YES | Requires season/episode |
| Track | Follow show | YES | YES | Adds to watchlist |
| Track | Unfollow show | YES | YES | Removes from watchlist |
| Track | Upcoming episodes | YES | YES | Calendar integration |

---

**Document Maintained By:** QA Engineering Team
**For Updates:** Submit PR with new patterns and test results

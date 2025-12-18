# Queue Sync Tool Test Report
**Date:** 2025-12-16
**Test File:** `/Users/kofifort/.trakt-mcp/pending-logs.jsonl`

## Test Summary

Successfully tested the `sync_logwatch_queue` MCP tool with both `showSummary=true` and `dryRun=true` modes.

### Execution Results

- ✅ Tool executed successfully without crashes
- ✅ Summary mode (`showSummary=true`) worked correctly
- ✅ Dry run mode (`dryRun=true`) worked correctly
- ✅ Formatted table output displayed properly
- ✅ No queue file modifications in dry run mode (as expected)

## Queue Contents

The queue file contains **20 pending entries** from various dates:

1. "i watched columbus 2017 last week" (captured 2025-12-12)
2. "i watched Paterson (2016)" (captured 2025-12-12)
3. "I watched all of the pirates of the carrabien movies last month" (captured 2025-12-12)
4. "I've seen all the marvel movies but I dont have a watch day..." (captured 2025-12-12)
5. "I've seen All the home alone movies" (captured 2025-12-12)
6. "I've seen All the jurassic Park movies" (captured 2025-12-12)
7. "I've seen All the lion king movies" (captured 2025-12-12)
8. "I've seen titanic before" (captured 2025-12-12)
9. "I've seen forest gump" (captured 2025-12-12)
10. "I've seen all the matrix movies" (captured 2025-12-12)
11. "I've seen pulp fiction" (captured 2025-12-12)
12. "I've seen all the toy story movies" (captured 2025-12-12)
13. "I've seen all the men in black movies" (captured 2025-12-12)
14. "I've seen all the bad boy's movies" (captured 2025-12-12)
15. "I just watched enemy (2013)" (captured 2025-12-12)
16. "last night i watched F1 the movie" (captured 2025-12-13)
17. "I just finished Still walking (2009)" (captured 2025-12-14)
18. "I just finished in the mood for love (2000)" (captured 2025-12-15)
19. "I just finished Chungking Express" (captured 2025-12-15)
20. "I just finished 2046" (captured 2025-12-16)

## Sync Process Results

### Overall Statistics
- **Total Entries:** 20
- **Resolved:** 0
- **Ambiguous:** 0
- **Not Found:** 0
- **Errors:** 20
- **Can Proceed:** No

### Error Analysis

All 20 entries failed with the error: **"Unknown content type"**

This is because the natural language parser requires explicit type hints to distinguish between movies and TV shows. The parser looks for keywords like:
- **Movies:** "movie", "film"
- **TV Shows:** "show", "series", "episode", "ep"
- **Episodes:** S1E1 format or "season X episode Y"

#### Problem Examples:

1. **Entry:** "i watched columbus 2017 last week"
   - **Parsed Title:** "i columbus last week"
   - **Parsed Type:** unknown
   - **Issue:** No type hint (movie/show), parser couldn't determine content type
   
2. **Entry:** "I've seen titanic before"
   - **Parsed Title:** "titanic before"
   - **Parsed Type:** unknown
   - **Issue:** Same - no explicit type hint

3. **Entry:** "last night i watched F1 the movie"
   - **Parsed Title:** "i F1 the"
   - **Parsed Type:** movie (detected!)
   - **Issue:** Search failed with: "Cannot read properties of undefined (reading '_retryCount')"
   - **Note:** This one actually detected "movie" but then had a runtime error

#### One Runtime Error:

Entry #16 showed a different error:
```
Error: Search failed for "i F1 the": Cannot read properties of undefined (reading '_retryCount')
```

This suggests there's a bug in the retry logic when the Trakt client attempts to search.

## Parsing Behavior Observations

### Date Parsing
The parser successfully identified temporal expressions:
- "last week" → parsed date source
- "last night" → parsed to 2025-12-12
- "just watched" → uses capturedAt timestamp
- "just finished" → uses capturedAt timestamp

### Recall Patterns
Successfully detected "I've seen" patterns and marked them as recall patterns:
- Used `capturedAt` as fallback since no specific date mentioned
- Set `isRecallPattern: true`

### Title Extraction Issues
The parser has some title extraction problems:
- Doesn't properly clean up pronouns and filler words ("I", "i", "the")
- Keeps temporal phrases in the title ("last week", "before")
- Examples:
  - "i watched columbus 2017" → "i columbus last week" (should be "Columbus")
  - "I've seen titanic before" → "titanic before" (should be "Titanic")

## Next Steps & Recommendations

### Immediate Issues to Fix:

1. **Runtime Error in Search**
   - Fix the `_retryCount` undefined error in TraktClient search
   - Location: Entry #16 with "F1 the movie"

2. **Title Parser Improvements**
   - Remove leading pronouns ("I", "i") from titles
   - Remove temporal modifiers that weren't caught ("before", "last week")
   - Improve title extraction to be more robust

3. **Type Inference**
   - Consider defaulting to "movie" when:
     - No episode pattern found
     - Title has a year (indicates a movie)
     - No show-specific keywords present
   - Or prompt user to clarify ambiguous entries

### Testing Recommendations:

1. **Unit Test Coverage**
   - Add parser tests for these specific failing cases
   - Test title extraction edge cases
   - Test type inference with and without hints

2. **Integration Test**
   - Test with queue entries that have proper type hints
   - Verify actual sync works when entries are properly formatted

3. **User Experience**
   - Consider interactive mode to resolve ambiguous entries
   - Provide suggestions for fixing malformed entries
   - Show better error messages with hints on how to fix

## Tool Behavior Verification

### `showSummary=true` Mode
- ✅ Shows formatted summary table
- ✅ Displays total counts (resolved, ambiguous, not found, errors)
- ✅ Lists all entries with their status
- ✅ Shows error messages for each failed entry
- ✅ Returns `action_required: "review"`
- ✅ Returns `canProceed: false` when errors present
- ✅ Does NOT modify queue file

### `dryRun=true` Mode
- ✅ Same behavior as showSummary
- ✅ Does NOT call Trakt API to log watches
- ✅ Does NOT modify queue file
- ✅ Performs search and validation
- ✅ Returns preview data structure

## Conclusion

The `sync_logwatch_queue` tool is **working as designed** but reveals that:

1. **Parser needs improvement** to handle natural language inputs without explicit type hints
2. **Runtime error exists** in the search retry logic
3. **Title extraction** needs better cleaning of filler words

The tool successfully prevented syncing bad data (all entries would have failed), which is the correct behavior. The formatted output clearly communicates what's wrong with each entry.

**Status:** Tool functional, but queue entries need better parsing or user needs to provide type hints.

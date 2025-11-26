# Contributing to Trakt.tv MCP Server

**Last Updated:** 2025-11-25
**Purpose:** Guide for contributors extending the Trakt.tv MCP server functionality

---

## Table of Contents

1. [Overview](#overview)
2. [For Developers: Adding Features](#for-developers-adding-features)
3. [For AI Assistants: Integration Guidelines](#for-ai-assistants-integration-guidelines)
4. [Adding Natural Language Patterns](#adding-natural-language-patterns)
5. [Testing Requirements](#testing-requirements)
6. [QA Process](#qa-process)
7. [Code Quality Standards](#code-quality-standards)

---

## Overview

This guide covers:
- How to add new MCP tools and features
- How AI assistants (like Claude) should interpret user queries
- How to extend natural language support
- Testing and quality assurance requirements

For natural language pattern details, see [NATURAL_LANGUAGE_GUIDE.md](./NATURAL_LANGUAGE_GUIDE.md).

---

## For Developers: Adding Features

### Architecture Principles

1. **Single Source of Truth:** Date parsing logic lives exclusively in `parseNaturalDate()`
2. **UTC Consistency:** All dates are converted to UTC midnight to avoid timezone bugs
3. **Fail Fast:** Invalid input throws errors with helpful messages immediately
4. **Composability:** Utility functions are small, focused, and composable
5. **Type Safety:** TypeScript strict mode enforced, no `any` types

### Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `/src/lib/utils.ts` | Date parsing, validation, error formatting | `parseNaturalDate()`, `parseEpisodeRange()`, `createToolError()` |
| `/src/lib/tools.ts` | Tool implementations with parameter normalization | `logWatch()`, `bulkLog()`, `searchEpisode()` |
| `/src/lib/__tests__/utils.test.ts` | Unit tests for utilities | Test suites for date parsing, validation |
| `/src/lib/__tests__/tools.test.ts` | Integration tests for tools | End-to-end tool behavior tests |

---

## For AI Assistants: Integration Guidelines

### Role of Claude and Similar AI Assistants

The Trakt.tv MCP server is designed for AI assistant integration. This section explains how AI assistants should interpret user queries and map them to tool calls.

### Core Capabilities to Leverage

- **Natural language dates**: Users say "yesterday" or "last week", not "2025-01-15"
- **Flexible episodes**: Users say "episodes 1-5" or "S1E1-5"
- **Action verbs**: "watched", "binged", "saw" all mean the same thing
- **Parameter aliases**: Accept `title` instead of requiring `movieName`/`showName`
- **Intelligent errors**: Error messages include actionable suggestions

---

### Pattern Mapping Best Practices

#### 1. Always Confirm Ambiguous Queries

When multiple interpretations are possible, ask for clarification rather than guessing.

**Example:**
- **User:** "Watched some episodes of Breaking Bad"
- **Bad:** Logging all 62 episodes
- **Good:** "Which episodes? You can say 'S1E1' or 'episodes 1-5' or 'episodes 1, 3, and 5'"

---

#### 2. Handle Partial Information Gracefully

Prompt for missing details without restarting the conversation.

**Example:**
- **User:** "Log Breaking Bad as watched"
- **Claude:** "Which season and episode? (e.g., 'S1E1') And when? (e.g., 'yesterday', 'today')"

---

#### 3. Default to Sensible Values

- **Date:** Default to `"today"` if not specified
- **Do NOT default:** Episode/season numbers (always require explicit specification)

**Example:**
```json
// User: "Watched Breaking Bad S1E1"
{
  "type": "episode",
  "showName": "Breaking Bad",
  "season": 1,
  "episode": 1,
  "watchedAt": "today"  // Default applied
}
```

---

#### 4. Confirm Bulk Actions

Before logging large ranges, confirm with the user.

**Example:**
- **User:** "Binged all of Breaking Bad season 1"
- **Claude:** "That's 7 episodes. Should I log all episodes of Breaking Bad season 1 (S1E1-E7) as watched today?"

**Threshold Recommendation:**
- 1-3 episodes: Proceed without confirmation
- 4-10 episodes: Confirm with count
- 11+ episodes: Confirm and suggest date range option

---

#### 5. Preserve User Intent with Natural Language

Don't convert natural language dates to ISO before calling tools. Let the tool handle parsing.

**Good:**
```json
{ "watchedAt": "last night" }
```

**Less Good:**
```json
{ "watchedAt": "2025-11-18" }  // Loses semantic meaning
```

**Why:** The natural language parser maintains consistency and may handle time-of-day differently in future enhancements.

---

#### 6. Leverage Error Suggestions

When errors include suggestions, present them to users.

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
• Check the spelling - did you mean "Breaking Bad"?
• Try using the search tool to browse available titles

Would you like me to search for "Breaking Bad" instead?
```

---

### Handling Disambiguation

When the server returns a disambiguation response:

**Response Format:**
```json
{
  "success": false,
  "needs_disambiguation": true,
  "options": [
    { "title": "Dune", "year": 2021, "traktId": 123456, "type": "movie" },
    { "title": "Dune: Prophecy", "year": 2024, "traktId": 789012, "type": "show" }
  ],
  "message": "Multiple matches found..."
}
```

**Present Options to User:**
```
I found multiple matches for "Dune":

1. **Dune** (2021) - Movie [Trakt ID: 123456]
2. **Dune: Prophecy** (2024) - TV Show [Trakt ID: 789012]

Which one did you watch? You can tell me by year (e.g., "the 2021 movie").
```

**Retry with Disambiguation Parameter:**
```json
{
  "type": "movie",
  "movieName": "Dune",
  "year": 2021,  // Add year to resolve
  "watchedAt": "yesterday"
}
```

---

### Common Query Patterns

See [NATURAL_LANGUAGE_GUIDE.md](./NATURAL_LANGUAGE_GUIDE.md) for comprehensive pattern documentation.

**Quick Reference:**

| User Intent | Tool | Key Parameters |
|-------------|------|----------------|
| Log single episode | `log_watch` | `type: "episode"`, `showName`, `season`, `episode`, `watchedAt` |
| Log single movie | `log_watch` | `type: "movie"`, `movieName`, `watchedAt` |
| Log episode range | `bulk_log` | `type: "episodes"`, `showName`, `season`, `episodes`, `watchedAt` |
| Log multiple movies | `bulk_log` | `type: "movies"`, `movieNames`, `watchedAt` |
| Query history | `summarize_history` | `startDate`, `endDate` (both optional) |
| Search content | `search_show` | `query`, `type` (optional) |

---

## Adding Natural Language Patterns

### Step 1: Identify the Pattern

Before implementing, document:
- **User Input:** What will users type? (e.g., "this weekend")
- **Expected Output:** What date should this map to?
- **Edge Cases:** What happens on boundary days?
- **Ambiguity:** Is the meaning clear and unambiguous?

**Example:**
```
Pattern: "this weekend"
Output: Next Saturday (or today if today is Saturday/Sunday)
Edge Case: If today is Monday, returns the upcoming Saturday
Ambiguity: Clear - always refers to nearest upcoming or current weekend
```

---

### Step 2: Add Logic to `parseNaturalDate()`

**Location:** `/src/lib/utils.ts` (function starts at line 11)

**Pattern:** Add new conditional logic following existing patterns:

```typescript
// Example: Adding "this weekend" support
if (lowerInput === 'this weekend') {
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
  let daysToNextSaturday: number;

  if (dayOfWeek === 0) {
    // Sunday - next Saturday is 6 days away
    daysToNextSaturday = 6;
  } else if (dayOfWeek === 6) {
    // Already Saturday - return today
    daysToNextSaturday = 0;
  } else {
    // Monday-Friday - calculate days to Saturday
    daysToNextSaturday = 6 - dayOfWeek;
  }

  const targetDate = new Date(Date.UTC(currentYear, currentMonth, currentDate + daysToNextSaturday));
  return targetDate.toISOString();
}
```

**Key Requirements:**
- Use `Date.UTC()` for all date construction (never local time)
- Return ISO string: `targetDate.toISOString()`
- Place new patterns **before** the ISO date parsing fallback
- Use lowercase comparison: `lowerInput.toLowerCase()`

---

### Step 3: Update Error Messages

Add the new pattern to error messages so users know it's supported:

**Location:** `/src/lib/utils.ts` line 224-226

```typescript
throw new Error(
  `Unable to parse date: "${input}". Use ISO format (YYYY-MM-DD) or natural language ` +
  `(today, tonight, yesterday, last night, this morning, earlier today, this afternoon, ` +
  `this evening, N days ago, N weeks ago, last week, last weekend, this weekend, ` + // Added "this weekend"
  `last monday, last month)`
);
```

---

### Step 4: Add Unit Tests

**Location:** `/src/lib/__tests__/utils.test.ts`

```typescript
describe('parseNaturalDate', () => {
  describe('this weekend', () => {
    it('should return next Saturday when today is Monday-Friday', () => {
      const mockWednesday = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(mockWednesday);

      const result = parseNaturalDate('this weekend');
      const parsed = new Date(result);

      // Next Saturday should be 2025-01-18
      expect(parsed.getUTCFullYear()).toBe(2025);
      expect(parsed.getUTCMonth()).toBe(0); // January
      expect(parsed.getUTCDate()).toBe(18);
      expect(parsed.getUTCHours()).toBe(0);
      expect(parsed.getUTCMinutes()).toBe(0);
    });

    it('should return today when today is Saturday', () => {
      const mockSaturday = new Date('2025-01-18T12:00:00Z');
      vi.setSystemTime(mockSaturday);

      const result = parseNaturalDate('this weekend');
      const parsed = new Date(result);

      expect(parsed.getUTCDate()).toBe(18);
    });
  });
});
```

**Testing Requirements:**
- Test happy path (typical usage)
- Test edge cases (boundary days)
- Verify UTC midnight (hours/minutes/seconds all 0)
- Test case insensitivity
- Verify no timezone leaks

---

### Step 5: Add Integration Tests

**Location:** `/src/lib/__tests__/tools.test.ts`

```typescript
describe('logWatch with new date pattern', () => {
  it('should accept "this weekend" as watchedAt parameter', async () => {
    const mockClient = createMockClient();

    const result = await logWatch(mockClient, {
      type: 'movie',
      movieName: 'Dune',
      watchedAt: 'this weekend',
    });

    expect(result.success).toBe(true);
    expect(mockClient.addToHistory).toHaveBeenCalled();

    // Verify the date was parsed correctly
    const historyCall = mockClient.addToHistory.mock.calls[0][0];
    const watchedAt = new Date(historyCall.movies[0].watched_at);
    expect(watchedAt.getUTCDay()).toBe(6); // Saturday
  });
});
```

---

## Testing Requirements

### Unit Tests (Required)

Test your utility functions in isolation:

```typescript
describe('parseNaturalDate', () => {
  describe('your new pattern', () => {
    it('should handle happy path', () => {
      const result = parseNaturalDate('your pattern');
      // Assert correct behavior
    });

    it('should handle edge case 1', () => {
      // Test boundary conditions
    });

    it('should be case-insensitive', () => {
      expect(parseNaturalDate('YOUR PATTERN')).toBe(parseNaturalDate('your pattern'));
    });
  });
});
```

**Required Coverage:**
- Happy path
- Edge cases (boundary values)
- Error cases
- Case insensitivity
- UTC consistency

---

### Integration Tests (Required)

Test tools using your new pattern:

```typescript
describe('logWatch integration', () => {
  it('should work with new date pattern', async () => {
    const mockClient = createMockClient();

    const result = await logWatch(mockClient, {
      type: 'movie',
      movieName: 'Dune',
      watchedAt: 'your new pattern',
    });

    expect(result.success).toBe(true);
  });
});
```

---

### Manual Testing (Recommended)

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Test with MCP Inspector:**
   - Point inspector to your built server
   - Ensure valid Trakt.tv authentication
   - Try various inputs with your new pattern
   - Verify error messages are clear

3. **Document observations:**
   - Note unexpected behavior
   - Record user-facing issues
   - Capture example responses

---

## QA Process

### Pre-Submission Checklist

**Code Quality:**
- [ ] TypeScript strict mode passes (no `any` types)
- [ ] All new code has JSDoc comments
- [ ] Function names are clear and descriptive
- [ ] No code duplication (DRY principle)
- [ ] Error handling is comprehensive
- [ ] UTC dates used consistently

**Testing:**
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Edge cases tested
- [ ] Error cases tested
- [ ] Manual testing with MCP Inspector completed
- [ ] No regressions in existing tests

**Documentation:**
- [ ] Updated [NATURAL_LANGUAGE_GUIDE.md](./NATURAL_LANGUAGE_GUIDE.md) if needed
- [ ] Updated error messages to include new patterns
- [ ] Added JSDoc comments to new functions
- [ ] Created or updated test scripts if applicable

**UX:**
- [ ] Error messages are clear and actionable
- [ ] Suggestions provided for common errors
- [ ] Ambiguous inputs handled gracefully
- [ ] Date parsing is consistent with existing patterns
- [ ] No surprising behavior or magic

---

### Run Full Test Suite

```bash
# Unit and integration tests
npm test

# Build check
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

All must pass before submitting PR.

---

## Code Quality Standards

### 1. Preserve UTC Consistency

**Always use UTC for date operations:**

✅ **Good:**
```typescript
const today = new Date(Date.UTC(currentYear, currentMonth, currentDate));
```

❌ **Bad:**
```typescript
const today = new Date(currentYear, currentMonth, currentDate);  // Uses local time!
```

**Why:** Local time creates timezone bugs.

---

### 2. Fail Fast with Clear Errors

**Validate early, fail immediately:**

✅ **Good:**
```typescript
if (!lowerInput || lowerInput === '') {
  throw new Error('Date parameter cannot be empty. Supported formats: ...');
}
```

❌ **Bad:**
```typescript
// Proceed without validation, fail later with cryptic error
const parsed = new Date(lowerInput);  // Might be Invalid Date
```

---

### 3. Use Existing Utilities

**Don't reinvent the wheel:**

✅ **Good:**
```typescript
validateNonEmptyString(showName, 'showName');
validateEpisodeNumber(episode);
```

❌ **Bad:**
```typescript
if (!showName || showName.trim() === '') {
  throw new Error('showName cannot be empty');
}
```

---

### 4. Write Self-Documenting Code

**Use descriptive variable names:**

✅ **Good:**
```typescript
const daysToLastSaturday = calculateDaysToLastSaturday(currentDayOfWeek);
const targetDate = new Date(Date.UTC(year, month, date - daysToLastSaturday));
```

❌ **Bad:**
```typescript
const d = calc(dow);
const t = new Date(Date.UTC(y, m, dt - d));
```

---

### 5. Keep Error Messages User-Friendly

**Write for humans, not machines:**

✅ **Good:**
```typescript
throw new Error(
  `Date too far in past: ${days} days ago. Please use an ISO date (YYYY-MM-DD) ` +
  `for dates more than a year ago. Maximum: "365 days ago"`
);
```

❌ **Bad:**
```typescript
throw new Error(`ERR_DATE_RANGE: ${days} > MAX_DAYS`);
```

---

### 6. Document Non-Obvious Decisions

**Add comments for "why", not "what":**

✅ **Good:**
```typescript
// If today is the target weekday, go back a full week to avoid ambiguity
// (e.g., "last Monday" when today is Monday should mean the previous Monday)
if (currentDay === targetDay) {
  daysBack = 7;
}
```

❌ **Bad:**
```typescript
// Set daysBack to 7
if (currentDay === targetDay) {
  daysBack = 7;
}
```

---

## PR Submission Template

```markdown
## Description
Add support for "this weekend" date pattern

## Changes
- Added "this weekend" parsing to `parseNaturalDate()`
- Returns next Saturday (or today if today is Saturday)
- Updated error messages to include new pattern
- Added comprehensive unit tests
- Added integration tests for `logWatch` with new pattern

## Testing
- [x] Unit tests pass (12 new tests added)
- [x] Integration tests pass (3 new tests added)
- [x] Manual testing with MCP Inspector completed
- [x] Tested edge cases (all days of week)
- [x] No regressions in existing functionality

## Documentation
- [x] Updated docs/guides/NATURAL_LANGUAGE_GUIDE.md
- [x] Added JSDoc comments
- [x] Updated error message strings

## QA Checklist
- [x] TypeScript strict mode passes
- [x] All tests pass (`npm test`)
- [x] Build succeeds (`npm run build`)
- [x] No linting errors (`npm run lint`)
- [x] UTC consistency maintained
- [x] Error messages are clear and actionable
```

---

## Getting Help

**Questions about implementation?**
- Review existing patterns in `/src/lib/utils.ts`
- Check test files for examples: `/src/lib/__tests__/utils.test.ts`
- Read [NATURAL_LANGUAGE_GUIDE.md](./NATURAL_LANGUAGE_GUIDE.md) for context

**Found a bug?**
- Open an issue with reproduction steps
- Include relevant code snippets
- Provide test case that demonstrates the bug

**Want to propose a new pattern?**
- Open an issue for discussion first
- Explain the use case and expected behavior
- Consider edge cases and ambiguity

**Ready to contribute?**
- Fork the repository
- Create a feature branch
- Follow this guide
- Submit a PR with completed checklist

---

## Related Documentation

- **[NATURAL_LANGUAGE_GUIDE.md](./NATURAL_LANGUAGE_GUIDE.md)** - Comprehensive NL pattern reference
- **[docs/DEBUGGING.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/DEBUGGING.md)** - Debugging and troubleshooting
- **[docs/testing/TESTING_GUIDE.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/testing/TESTING_GUIDE.md)** - Testing documentation
- **[docs/TECHNICAL_DEBT.md](/Users/kofifort/Repos/trakt.tv-mcp/docs/TECHNICAL_DEBT.md)** - Future improvements and known issues
- **[CLAUDE.md](/Users/kofifort/Repos/trakt.tv-mcp/CLAUDE.md)** - Project architecture and guidelines

---

**Thank you for contributing to better natural language support!**

Your work helps make the Trakt.tv MCP server more intuitive and user-friendly for everyone.

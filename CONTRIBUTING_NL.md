# Contributing to Natural Language Support

**Last Updated:** 2025-11-19
**Purpose:** Guide for contributors who want to add or improve natural language patterns in the Trakt.tv MCP server.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Adding New Date Patterns](#adding-new-date-patterns)
3. [Adding New Parameter Aliases](#adding-new-parameter-aliases)
4. [Improving Error Messages](#improving-error-messages)
5. [Testing Requirements](#testing-requirements)
6. [QA Process](#qa-process)
7. [Best Practices](#best-practices)

---

## Architecture Overview

Natural language parsing is centralized in a few key locations:

### Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `/src/lib/utils.ts` | Date parsing, validation, error formatting | `parseNaturalDate()`, `parseEpisodeRange()`, `createToolError()` |
| `/src/lib/tools.ts` | Tool implementations with parameter normalization | `logWatch()`, `bulkLog()`, `searchEpisode()` |
| `/src/lib/__tests__/utils.test.ts` | Unit tests for utilities | Test suites for date parsing, validation |
| `/src/lib/__tests__/tools.test.ts` | Integration tests for tools | End-to-end tool behavior tests |

### Architecture Principles

1. **Single Source of Truth:** Date parsing logic lives exclusively in `parseNaturalDate()`
2. **UTC Consistency:** All dates are converted to UTC midnight to avoid timezone bugs
3. **Fail Fast:** Invalid input throws errors with helpful messages immediately
4. **Composability:** Utility functions are small, focused, and composable
5. **Type Safety:** TypeScript strict mode enforced, no `any` types

---

## Adding New Date Patterns

### Step 1: Identify the Pattern

Before implementing, document:
- **User Input:** What will users type? (e.g., "this weekend")
- **Expected Output:** What date should this map to?
- **Edge Cases:** What happens on boundary days? (e.g., if today is Sunday, what is "this weekend"?)
- **Ambiguity:** Is the meaning clear and unambiguous?

**Example:**
```
Pattern: "this weekend"
Output: Next Saturday (or today if today is Saturday/Sunday)
Edge Case: If today is Monday, returns the upcoming Saturday
Ambiguity: Clear - always refers to the nearest upcoming or current weekend
```

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

### Step 3: Update Error Messages

Add the new pattern to error messages so users know it's supported:

**Location:** `/src/lib/utils.ts` line 224-226 (error message in `parseNaturalDate()`)

```typescript
throw new Error(
  `Unable to parse date: "${input}". Use ISO format (YYYY-MM-DD) or natural language ` +
  `(today, tonight, yesterday, last night, this morning, earlier today, this afternoon, ` +
  `this evening, N days ago, N weeks ago, last week, last weekend, this weekend, ` + // Added "this weekend"
  `last monday, last month)`
);
```

Also update line 15-18 (empty string validation error):

```typescript
throw new Error(
  'Date parameter cannot be empty. Supported formats: "today", "tonight", "yesterday", ' +
  '"last night", "this morning", "earlier today", "this afternoon", "this evening", ' +
  '"N days ago", "N weeks ago", "last week", "last weekend", "this weekend", ' + // Added "this weekend"
  '"last monday" (or any weekday), "last month", "January 2025", or ISO date (YYYY-MM-DD)'
);
```

### Step 4: Add Unit Tests

**Location:** `/src/lib/__tests__/utils.test.ts`

Add tests for your new pattern in the `parseNaturalDate` test suite:

```typescript
describe('parseNaturalDate', () => {
  // ... existing tests ...

  describe('this weekend', () => {
    it('should return next Saturday when today is Monday-Friday', () => {
      // Mock current date to be a Wednesday
      const mockWednesday = new Date('2025-01-15T12:00:00Z'); // Wednesday
      vi.setSystemTime(mockWednesday);

      const result = parseNaturalDate('this weekend');
      const parsed = new Date(result);

      // Next Saturday should be 2025-01-18
      expect(parsed.getUTCFullYear()).toBe(2025);
      expect(parsed.getUTCMonth()).toBe(0); // January
      expect(parsed.getUTCDate()).toBe(18); // Saturday
      expect(parsed.getUTCHours()).toBe(0);
      expect(parsed.getUTCMinutes()).toBe(0);
    });

    it('should return today when today is Saturday', () => {
      const mockSaturday = new Date('2025-01-18T12:00:00Z'); // Saturday
      vi.setSystemTime(mockSaturday);

      const result = parseNaturalDate('this weekend');
      const parsed = new Date(result);

      expect(parsed.getUTCDate()).toBe(18);
    });

    it('should return next Saturday when today is Sunday', () => {
      const mockSunday = new Date('2025-01-19T12:00:00Z'); // Sunday
      vi.setSystemTime(mockSunday);

      const result = parseNaturalDate('this weekend');
      const parsed = new Date(result);

      // Next Saturday should be 2025-01-25
      expect(parsed.getUTCDate()).toBe(25);
    });
  });
});
```

**Testing Requirements:**
- Test happy path (typical usage)
- Test edge cases (boundary days like Sunday, Saturday)
- Verify UTC midnight (hours/minutes/seconds all 0)
- Test both uppercase and lowercase input
- Verify no timezone leaks

### Step 5: Add Integration Tests

**Location:** `/src/lib/__tests__/tools.test.ts`

Test that tools correctly use your new pattern:

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

## Adding New Parameter Aliases

Parameter aliases allow users to use alternative names for parameters (e.g., `title` instead of `movieName`).

### Step 1: Identify Use Case

Determine:
- **Original Parameter:** What's the canonical parameter name?
- **Alias:** What alternative name makes sense?
- **Context:** When should the alias apply?
- **Conflicts:** Could this alias create ambiguity?

**Example:**
```
Original: movieName
Alias: name
Context: When type is "movie"
Conflicts: What if both movieName and name are provided? (Use movieName as priority)
```

### Step 2: Add Normalization Logic

**Location:** `/src/lib/tools.ts` in the relevant tool function

**Example (in `logWatch` function):**

```typescript
export async function logWatch(
  client: TraktClient,
  args: {
    type: 'episode' | 'movie';
    title?: string;
    name?: string;      // New alias
    showName?: string;
    movieName?: string;
    // ... other params
  }
): Promise<ToolSuccess<TraktHistoryAddResponse> | ToolError | DisambiguationResponse> {
  try {
    const { type, title, name, showName, movieName, /* ... */ } = args;

    // Parameter normalization
    let effectiveMovieName = movieName;
    let effectiveShowName = showName;

    // Validate aliases if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return createToolError(
          'INVALID_INPUT',
          'Invalid name: Name must be a non-empty string.',
          undefined,
          ['Provide a movie or show name', 'Use movieName or showName parameter instead']
        );
      }
    }

    // Priority: canonical parameter > title alias > name alias
    if (title && !movieName && type === 'movie') {
      effectiveMovieName = title;
    } else if (name && !movieName && !title && type === 'movie') {
      effectiveMovieName = name;  // Use new alias
    }

    // Same for shows...
    if (title && !showName && type === 'episode') {
      effectiveShowName = title;
    } else if (name && !showName && !title && type === 'episode') {
      effectiveShowName = name;  // Use new alias
    }

    // ... rest of implementation uses effectiveMovieName/effectiveShowName
  }
}
```

**Key Principles:**
- **Priority Order:** Canonical > First alias > Second alias
- **Validate Early:** Check alias validity before using it
- **Use Effective Variables:** Always use `effectiveMovieName` in subsequent logic, not the raw parameter

### Step 3: Update Type Definitions

Add the new parameter to the function signature and argument type:

```typescript
args: {
  type: 'episode' | 'movie';
  title?: string;
  name?: string;       // Add to type definition
  showName?: string;
  movieName?: string;
  // ...
}
```

### Step 4: Document the Alias

Update relevant documentation files:
- `/CLAUDE_PROMPT_GUIDELINES.md` - Add to "Parameter Aliases" section
- `/NL_PATTERNS_REFERENCE.md` - Add to "Parameter Aliases" table
- JSDoc comments in the function

### Step 5: Add Tests

Test all alias combinations:

```typescript
describe('logWatch parameter aliases', () => {
  it('should accept "name" as alias for movieName', async () => {
    const mockClient = createMockClient();

    const result = await logWatch(mockClient, {
      type: 'movie',
      name: 'Dune',  // Using alias
    });

    expect(result.success).toBe(true);
  });

  it('should prioritize movieName over name alias', async () => {
    const mockClient = createMockClient();

    const result = await logWatch(mockClient, {
      type: 'movie',
      movieName: 'Dune',
      name: 'Interstellar',  // Should be ignored
    });

    expect(result.success).toBe(true);
    // Verify "Dune" was used, not "Interstellar"
    expect(mockClient.search).toHaveBeenCalledWith('Dune', 'movie');
  });

  it('should validate name alias as non-empty string', async () => {
    const mockClient = createMockClient();

    const result = await logWatch(mockClient, {
      type: 'movie',
      name: '',  // Empty string
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});
```

---

## Improving Error Messages

Good error messages are critical for UX. Follow these guidelines:

### Error Message Anatomy

```typescript
createToolError(
  'ERROR_CODE',              // Machine-readable code
  'Human-readable message',  // Clear explanation
  { key: 'value' },          // Optional details object
  ['suggestion 1', 'suggestion 2']  // Optional actionable suggestions
)
```

### Writing Good Error Messages

**Do:**
- ✅ Explain what went wrong: "No show found matching 'Breaking Bed'"
- ✅ Provide context: Include the user's input in quotes
- ✅ Suggest fixes: "Check the spelling of the show name"
- ✅ Reference alternatives: "Try using search_show to browse titles"
- ✅ Be specific: "Episode number must be a positive integer, got: 0"

**Don't:**
- ❌ Be vague: "Error"
- ❌ Use technical jargon: "NullPointerException"
- ❌ Blame the user: "You entered invalid input"
- ❌ Omit context: "Not found"
- ❌ Leave users stuck: No suggestions on how to fix

### Example: Improving a Date Parse Error

**Before:**
```typescript
throw new Error('Invalid date');
```

**After:**
```typescript
throw new Error(
  `Unable to parse date: "${input}". Use ISO format (YYYY-MM-DD) or natural ` +
  `language (today, yesterday, last week, last month)`
);
```

**Why Better:**
- Shows the exact input that failed
- Explains valid formats
- Gives concrete examples

### Adding Suggestions

Suggestions should be actionable next steps:

```typescript
return createToolError(
  'NOT_FOUND',
  `No show found matching "${showName}"`,
  undefined,
  [
    'Check the spelling of the show name',
    'Try using search_show to browse available titles',
    'Use the exact title as it appears on Trakt.tv',
    'Try including the year if there are multiple versions',
  ]
);
```

**Suggestion Guidelines:**
- Provide 2-4 suggestions (not too many)
- Start with most likely fix first
- Be specific to the error type
- Reference other tools when relevant
- Include example values when helpful

---

## Testing Requirements

All changes to natural language support must include tests.

### Unit Tests (Required)

**Location:** `/src/lib/__tests__/utils.test.ts`

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

    it('should handle edge case 2', () => {
      // Test another boundary
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

### Integration Tests (Required)

**Location:** `/src/lib/__tests__/tools.test.ts`

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

### Manual Testing with MCP Inspector (Recommended)

Test your changes in a real MCP environment:

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Configure MCP Inspector:**
   - Point inspector to your built server
   - Ensure valid Trakt.tv authentication

3. **Test the new pattern:**
   - Try various inputs with your new pattern
   - Verify error messages are clear
   - Check edge cases manually
   - Test with real Trakt.tv data

4. **Document observations:**
   - Note any unexpected behavior
   - Record user-facing issues
   - Capture example responses

### Test Script for Regression Testing

Create standalone test scripts for complex patterns:

**Example:** `/test-new-pattern.mjs`

```javascript
import { parseNaturalDate } from './dist/lib/utils.js';

console.log('Testing new pattern...\n');

// Test cases
const testCases = [
  { input: 'your pattern', expected: '2025-01-20T00:00:00.000Z' },
  { input: 'edge case 1', expected: '2025-01-21T00:00:00.000Z' },
  // ... more test cases
];

let passed = 0;
let failed = 0;

for (const { input, expected } of testCases) {
  try {
    const result = parseNaturalDate(input);
    if (result === expected) {
      console.log(`✓ "${input}" -> ${result}`);
      passed++;
    } else {
      console.log(`✗ "${input}" -> Expected ${expected}, got ${result}`);
      failed++;
    }
  } catch (error) {
    console.log(`✗ "${input}" -> Error: ${error.message}`);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

Run with:
```bash
node test-new-pattern.mjs
```

---

## QA Process

Before submitting a PR, complete this checklist:

### Code Quality Checklist

- [ ] TypeScript strict mode passes (no `any` types)
- [ ] All new code has JSDoc comments
- [ ] Function names are clear and descriptive
- [ ] No code duplication (DRY principle)
- [ ] Error handling is comprehensive
- [ ] UTC dates used consistently

### Testing Checklist

- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Edge cases tested
- [ ] Error cases tested
- [ ] Manual testing with MCP Inspector completed
- [ ] No regressions in existing tests

### Documentation Checklist

- [ ] Updated `CLAUDE_PROMPT_GUIDELINES.md` if needed
- [ ] Updated `NL_PATTERNS_REFERENCE.md` if needed
- [ ] Updated error messages to include new patterns
- [ ] Added JSDoc comments to new functions
- [ ] Created or updated test scripts if applicable

### UX Checklist

- [ ] Error messages are clear and actionable
- [ ] Suggestions provided for common errors
- [ ] Ambiguous inputs handled gracefully
- [ ] Date parsing is consistent with existing patterns
- [ ] No surprising behavior or magic

### Performance Checklist

- [ ] No unnecessary API calls
- [ ] Date parsing is O(1) or O(n) at worst
- [ ] No regex catastrophic backtracking
- [ ] Memory usage is reasonable

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

## Best Practices

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

**Why:** Local time creates timezone bugs. A user in PST logging "yesterday" at 11 PM would get a different date than a user in EST.

### 2. Fail Fast with Clear Errors

**Validate early, fail immediately:**

✅ **Good:**
```typescript
if (!lowerInput || lowerInput === '') {
  throw new Error('Date parameter cannot be empty. Supported formats: ...');
}
// ... proceed with valid input
```

❌ **Bad:**
```typescript
// Proceed without validation, fail later with cryptic error
const parsed = new Date(lowerInput);  // Might be Invalid Date
```

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
if (typeof episode !== 'number' || episode < 1) {
  throw new Error('Invalid episode');
}
```

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

### 5. Test Edge Cases First

**Write tests for boundary conditions before happy path:**

```typescript
describe('parseNaturalDate', () => {
  // Edge cases first
  it('should reject empty string', () => { /* ... */ });
  it('should reject zero days ago', () => { /* ... */ });
  it('should handle maximum boundary (365 days ago)', () => { /* ... */ });

  // Then happy path
  it('should parse "yesterday" correctly', () => { /* ... */ });
});
```

**Why:** Edge cases are where bugs hide. Test them first to ensure robust behavior.

### 6. Keep Error Messages User-Friendly

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

### 7. Document Non-Obvious Decisions

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

## Example PR Checklist

Use this template when submitting a PR for natural language enhancements:

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
- [x] Updated CLAUDE_PROMPT_GUIDELINES.md
- [x] Updated NL_PATTERNS_REFERENCE.md
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

**Questions about natural language implementation?**
- Review existing patterns in `/src/lib/utils.ts`
- Check test files for examples: `/src/lib/__tests__/utils.test.ts`
- Read `CLAUDE_PROMPT_GUIDELINES.md` for context

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

**Thank you for contributing to better natural language support!**

Your work helps make the Trakt.tv MCP server more intuitive and user-friendly for everyone.

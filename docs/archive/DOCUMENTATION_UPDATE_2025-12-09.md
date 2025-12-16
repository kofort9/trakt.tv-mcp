# Documentation Update - December 9, 2025

## Summary

Updated documentation to reflect architectural change: **Natural language date parsing removed from MCP tools**. Claude now handles date interpretation and passes ISO 8601 dates to tools.

---

## Architectural Change

### Before
- Tools had `parseNaturalDate()` function
- Tools accepted both natural language ("yesterday") and ISO 8601 dates
- 35+ natural language patterns supported in tools
- Tools were responsible for date interpretation

### After
- Tools are "dumb pipes" - accept **only** ISO 8601 dates
- Claude interprets natural language and converts to ISO 8601 before calling tools
- Tools validate ISO 8601 format compliance only
- Clear separation: Claude handles NL interpretation, tools handle validation

---

## Benefits

1. **Simpler Tools** - Tools only validate ISO 8601, not 35+ date patterns
2. **Better Context** - Claude has access to user's timezone, conversation history
3. **Easier Testing** - Tools test ISO dates only, Claude handles interpretation
4. **Flexibility** - Claude can evolve date interpretation without changing tools

---

## Files Updated

### 1. `/docs/guides/NATURAL_LANGUAGE_GUIDE.md`

**Status:** Completely rewritten

**Changes:**
- Removed entire "Date Expressions" section (35+ natural language patterns)
- Added new "Architecture" section explaining Claude vs. Tools responsibilities
- Updated all examples to show Claude converting NL to ISO before calling tools
- Removed references to `parseNaturalDate()` function
- Updated "Implementation Reference" section to remove deleted functions
- Changed focus from "tools parse dates" to "Claude interprets, tools validate"

**Key Sections:**
- New: Architecture overview with data flow diagram
- New: "Why This Architecture?" explaining benefits
- Updated: All usage patterns show ISO 8601 dates in tool calls
- Updated: Error handling section for ISO validation errors
- Updated: Best practices for AI assistants (always convert to ISO)

---

### 2. `/docs/guides/CONTRIBUTING.md`

**Status:** Updated sections

**Changes:**
- Updated "Architecture Principles" - removed "Single Source of Truth" for date parsing
- Changed to "Separation of Concerns" between Claude and tools
- Updated "Key Files" table - removed `parseNaturalDate()` from utils.ts description
- Updated "Core Capabilities" - clarified Claude handles NL date interpretation
- Renamed section from "Adding Natural Language Patterns" to "Adding Episode Range Patterns"
- Removed all instructions for adding date parsing patterns
- Updated step-by-step guides to focus on episode range patterns instead
- Changed Best Practice #5 from "Preserve User Intent" to "Always Convert to ISO 8601"
- Updated PR template example to use episode range pattern instead of date pattern
- Updated all code examples to use ISO 8601 dates
- Updated testing examples to remove `parseNaturalDate` tests

---

### 3. `/docs/testing/TESTING_GUIDE.md`

**Status:** Updated test documentation

**Changes:**
- Changed "Natural language date parsing" to "ISO 8601 date validation" in overview
- Updated test counts (107+ → 72+ total, Date Parsing 45+ → Date Validation 10+)
- Changed test pattern examples from `parseNaturalDate` to `validation`
- Updated successful/failed test examples to use `validateEpisodeNumber`
- Updated "Key Findings" - removed NL pattern validation, added ISO 8601 validation
- Updated "Natural Language Test Results" to show Claude converting dates
- Added "Architecture Validation" section
- Changed performance metrics from "Natural language dates" to "ISO date validation"
- Renamed section from "Natural Language Testing" to "Date Format Testing"
- Replaced 35+ NL patterns with ISO 8601 format documentation
- Updated "Supported Date Patterns" to "ISO 8601 Date Validation"
- Added note about Claude's responsibility for NL interpretation
- Updated Bug #1 from "Date Parsing Off-By-One Error" to "Natural Language Date Parsing Removed"
- Updated test command examples
- Updated test file descriptions

---

## Episode Range Parsing

**Status:** UNCHANGED

Episode range parsing remains in the tools:
- Simple ranges: `1-5`
- Non-contiguous: `1,3,5`
- Mixed: `1-3,5,7-9`
- Complex: `1,3-5,8,10-12`

The `parseEpisodeRange()` function still exists and works as before.

---

## Disambiguation

**Status:** UNCHANGED

Disambiguation functionality remains in the tools and works exactly the same way:
- Returns options when multiple matches found
- Includes year and traktId for resolution
- Claude presents options to user

---

## What's Still Needed

### Code Changes Required

The documentation now reflects the architecture, but **code changes are still needed**:

1. **Remove `parseNaturalDate()` function** from `/src/lib/utils.ts`
2. **Remove natural language date tests** from `/src/lib/__tests__/utils.test.ts`
3. **Update tool validation** to reject natural language dates
4. **Add ISO 8601 validation** in tools
5. **Update error messages** to indicate ISO 8601 expected

### Testing

After code changes:
- Verify tools reject natural language dates
- Verify tools accept ISO 8601 dates
- Update test suites to match new behavior
- Run full regression testing

---

## Key Points for Users

When using the Trakt.tv MCP server:

1. **Natural language still works** - Claude handles it automatically
2. **Users don't change behavior** - Still say "yesterday", "last week", etc.
3. **Only internal architecture changed** - User experience remains the same
4. **Tools are simpler** - But users won't notice

---

## Key Points for Developers

When contributing to the project:

1. **Don't add NL date patterns to tools** - Claude handles that
2. **Tools must validate ISO 8601 only** - No exceptions
3. **Episode range parsing stays in tools** - That's different from dates
4. **Test ISO validation** - Not natural language parsing
5. **Update CONTRIBUTING.md** if adding new validation rules

---

## Related Documentation

All documentation is now consistent with this architecture:

- **NATURAL_LANGUAGE_GUIDE.md** - User-facing guide (updated)
- **CONTRIBUTING.md** - Developer guide (updated)
- **TESTING_GUIDE.md** - Testing reference (updated)
- **CLAUDE.md** - Project instructions (may need review)

---

## Timeline

- **2025-12-09**: Documentation updated to reflect new architecture
- **Next**: Code changes to implement architecture
- **Then**: Testing and validation
- **Finally**: Update CHANGELOG.md with breaking change notice

---

## Breaking Change Notice

**For future CHANGELOG.md:**

### Breaking Change: Natural Language Date Handling

**Changed:** Tools no longer accept natural language dates like "yesterday", "last week", etc.

**Impact:**
- Direct API users must pass ISO 8601 dates: `"2025-12-08"` or `"2025-12-08T20:30:00.000Z"`
- Claude users (recommended usage) are **not affected** - Claude handles conversion automatically

**Migration:**
- If calling tools directly: Convert natural language to ISO 8601 before calling
- If using through Claude: No changes needed

**Reason:** Simplifies tools and improves separation of concerns. Claude has better context for date interpretation.

---

**Documentation Updated By:** Tech Writer Agent
**Date:** 2025-12-09
**Status:** Documentation complete, code changes pending

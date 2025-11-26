# Cross-Reference Updates Required

After running the reorganization script, the following cross-references need to be updated in moved files.

## Files That Need Updates

### 1. docs/guides/CLAUDE_PROMPT_GUIDELINES.md

**Line 1148-1149:** Update relative paths to sibling files

**Current:**
```markdown
- `/Users/kofifort/Repos/trakt.tv-mcp/NATURAL_LANGUAGE_PATTERNS.md` - Pattern library
- `/Users/kofifort/Repos/trakt.tv-mcp/NL_PATTERNS_REFERENCE.md` - Quick reference card
```

**Replace with:**
```markdown
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/NATURAL_LANGUAGE_PATTERNS.md` - Pattern library
- `/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/NL_PATTERNS_REFERENCE.md` - Quick reference card
```

---

### 2. docs/guides/NL_PATTERNS_REFERENCE.md

**Lines 533-536:** Update relative paths to documentation files

**Current:**
```markdown
- **[CLAUDE_PROMPT_GUIDELINES.md](./CLAUDE_PROMPT_GUIDELINES.md)** - Comprehensive guide for AI assistants
- **[CONTRIBUTING_NL.md](./CONTRIBUTING_NL.md)** - Guide for adding new NL patterns
- **[NATURAL_LANGUAGE_PATTERNS.md](./NATURAL_LANGUAGE_PATTERNS.md)** - Full pattern library with examples
- **[TEST_REPORT_summarize_history.md](./TEST_REPORT_summarize_history.md)** - Test results and validation
```

**Replace with:**
```markdown
- **[CLAUDE_PROMPT_GUIDELINES.md](./CLAUDE_PROMPT_GUIDELINES.md)** - Comprehensive guide for AI assistants
- **[CONTRIBUTING_NL.md](./CONTRIBUTING_NL.md)** - Guide for adding new NL patterns
- **[NATURAL_LANGUAGE_PATTERNS.md](./NATURAL_LANGUAGE_PATTERNS.md)** - Full pattern library with examples
- **[TEST_REPORT_summarize_history.md](../testing/TEST_REPORT_summarize_history.md)** - Test results and validation
```

**Note:** Only the test report reference needs updating (relative path to different directory).

---

### 3. docs/guides/CONTRIBUTING_NL.md

**Lines 308-309:** Update absolute paths in documentation references

**Current:**
```markdown
- `/CLAUDE_PROMPT_GUIDELINES.md` - Add to "Parameter Aliases" section
- `/NL_PATTERNS_REFERENCE.md` - Add to "Parameter Aliases" table
```

**Replace with:**
```markdown
- `/docs/guides/CLAUDE_PROMPT_GUIDELINES.md` - Add to "Parameter Aliases" section
- `/docs/guides/NL_PATTERNS_REFERENCE.md` - Add to "Parameter Aliases" table
```

---

**Lines 595-596:** Update checklist references

**Current:**
```markdown
- [ ] Updated `CLAUDE_PROMPT_GUIDELINES.md` if needed
- [ ] Updated `NL_PATTERNS_REFERENCE.md` if needed
```

**Replace with:**
```markdown
- [ ] Updated `docs/guides/CLAUDE_PROMPT_GUIDELINES.md` if needed
- [ ] Updated `docs/guides/NL_PATTERNS_REFERENCE.md` if needed
```

---

**Lines 789-790:** Update completed checklist references

**Current:**
```markdown
- [x] Updated CLAUDE_PROMPT_GUIDELINES.md
- [x] Updated NL_PATTERNS_REFERENCE.md
```

**Replace with:**
```markdown
- [x] Updated docs/guides/CLAUDE_PROMPT_GUIDELINES.md
- [x] Updated docs/guides/NL_PATTERNS_REFERENCE.md
```

---

**Line 810:** Update reference in context section

**Current:**
```markdown
- Read `CLAUDE_PROMPT_GUIDELINES.md` for context
```

**Replace with:**
```markdown
- Read `docs/guides/CLAUDE_PROMPT_GUIDELINES.md` for context
```

---

## Automated Update Commands

You can use these sed commands to update the cross-references (run from repository root):

```bash
# Update CLAUDE_PROMPT_GUIDELINES.md
sed -i '' 's|/Users/kofifort/Repos/trakt.tv-mcp/NATURAL_LANGUAGE_PATTERNS.md|/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/NATURAL_LANGUAGE_PATTERNS.md|g' docs/guides/CLAUDE_PROMPT_GUIDELINES.md
sed -i '' 's|/Users/kofifort/Repos/trakt.tv-mcp/NL_PATTERNS_REFERENCE.md|/Users/kofifort/Repos/trakt.tv-mcp/docs/guides/NL_PATTERNS_REFERENCE.md|g' docs/guides/CLAUDE_PROMPT_GUIDELINES.md

# Update NL_PATTERNS_REFERENCE.md
sed -i '' 's|\./TEST_REPORT_summarize_history.md|../testing/TEST_REPORT_summarize_history.md|g' docs/guides/NL_PATTERNS_REFERENCE.md

# Update CONTRIBUTING_NL.md
sed -i '' 's|`/CLAUDE_PROMPT_GUIDELINES.md`|`/docs/guides/CLAUDE_PROMPT_GUIDELINES.md`|g' docs/guides/CONTRIBUTING_NL.md
sed -i '' 's|`/NL_PATTERNS_REFERENCE.md`|`/docs/guides/NL_PATTERNS_REFERENCE.md`|g' docs/guides/CONTRIBUTING_NL.md
sed -i '' 's|CLAUDE_PROMPT_GUIDELINES.md|docs/guides/CLAUDE_PROMPT_GUIDELINES.md|g' docs/guides/CONTRIBUTING_NL.md
sed -i '' 's|NL_PATTERNS_REFERENCE.md|docs/guides/NL_PATTERNS_REFERENCE.md|g' docs/guides/CONTRIBUTING_NL.md
```

**Note:** On Linux, remove the `''` after `-i` in the sed commands.

---

## Verification

After updating, verify all links work:

```bash
# Check for broken markdown links in docs/
find docs/ -name "*.md" -exec grep -H '\[.*\](.*\.md)' {} \; | grep -v "http"

# Test that referenced files exist
grep -r "\.md" docs/ --include="*.md" | grep -o '[^(]*\.md' | sort | uniq
```

---

## Summary

**Files requiring updates:** 3
- `docs/guides/CLAUDE_PROMPT_GUIDELINES.md` - 2 references
- `docs/guides/NL_PATTERNS_REFERENCE.md` - 1 reference
- `docs/guides/CONTRIBUTING_NL.md` - 7 references

**Total references to update:** 10

All updates are path changes to reflect the new directory structure. No content changes required.

---
name: comment-validate
description: |
  Pre-validate code comment syntax before running code reviews.
  Filters false positives caused by comment-like patterns in string literals,
  regex, or other non-comment contexts. Run before review agents to reduce noise.
---

# Comment Validate Skill

Pre-validate comment syntax to reduce false positives in code reviews.

## Origin

PR #27 review flagged `tools.ts:1544` as having a "comment typo (`/` → `//`)" but the actual code was already correct:

```typescript
// Smart auto-confirm: Skip (not fail) on 0 results so entry needs attention
```

The reviewer got confused by parenthetical content `(not fail)` which contains context that resembles comment patterns. This skill prevents such false positives.

## When to Use

- **Before:** Running `code-reviewer`, `comment-analyzer`, or similar review agents
- **After:** Writing new code with significant comments or documentation
- **Proactively:** When PR touches files with complex comments (JSDoc, regex, etc.)

## What It Validates

### 1. Comment Syntax Correctness

| Language | Valid Patterns |
|----------|----------------|
| TypeScript/JS | `//`, `/* */`, `/** */` (JSDoc) |
| Markdown | `<!-- -->` |
| Shell | `#` |
| JSON | None (comments invalid) |

### 2. Common False Positive Patterns

Patterns that look like comment issues but aren't:

| Pattern | Example | Why It's Valid |
|---------|---------|----------------|
| URL protocols | `https://` | Not a comment |
| Regex | `/pattern/g` | Regex delimiter |
| String literals | `"path/to/file"` | Inside string |
| Division | `a / b` | Math operator |
| JSDoc tags | `@param {string}` | Valid JSDoc |

### 3. Actual Issues to Flag

| Issue | Example | Problem |
|-------|---------|---------|
| Incomplete block comment | `/* comment` | Missing `*/` |
| Nested block comment | `/* /* nested */` | Syntax error |
| Comment in JSON | `{ // comment }` | Invalid JSON |
| Orphan closing | `*/ stray` | No opening |

## Validation Process

### Step 1: Identify Files to Check

```bash
# Get changed files with comment-heavy extensions
git diff --name-only HEAD~1 | grep -E '\.(ts|tsx|js|jsx|md|sh)$'
```

### Step 2: Parse Comments

For each file:
1. Use AST parser (TypeScript compiler API for TS/JS)
2. Extract all comment nodes with line numbers
3. Identify string literals, regex, and other non-comment contexts

### Step 3: Validate Each Comment

```typescript
interface CommentValidation {
  file: string;
  line: number;
  type: 'line' | 'block' | 'jsdoc';
  status: 'valid' | 'warning' | 'error';
  issue?: string;
  context?: string; // surrounding code for review
}
```

### Step 4: Filter Known False Positives

Skip flagging if pattern is in:
- String literal context
- Regex literal context
- URL (matches `https?://`)
- Import path

## Output Format

### Clean Output (No Issues)

```markdown
## Comment Validation: PASSED ✅

**Files checked:** 12
**Comments validated:** 47
**Issues found:** 0

Ready for code review.
```

### Issues Found

```markdown
## Comment Validation: 2 ISSUES FOUND ⚠️

**Files checked:** 12
**Comments validated:** 47

### Issues

| File | Line | Type | Issue |
|------|------|------|-------|
| `src/utils.ts` | 45 | block | Unclosed block comment |
| `config.json` | 12 | line | JSON does not support comments |

### Context

#### src/utils.ts:45
```typescript
/* This helper function
   processes input data  // <-- Missing closing */
function processInput() {
```

### Recommendations
1. Close block comment on line 45: add `*/`
2. Remove comment from config.json or convert to .jsonc
```

## Integration with Review Pipeline

```
                    ┌─────────────────────┐
                    │  /comment-validate  │
                    │  (pre-filter)       │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Issues found?     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │ NO             │                │ YES
              ▼                │                ▼
   ┌──────────────────┐        │     ┌──────────────────┐
   │  code-reviewer   │        │     │  Fix issues      │
   │  (proceed)       │        │     │  (before review) │
   └──────────────────┘        │     └──────────────────┘
```

## Implementation Notes

### AST-Based Parsing (Preferred)

```typescript
import ts from 'typescript';

function extractComments(sourceFile: ts.SourceFile): CommentInfo[] {
  const comments: CommentInfo[] = [];

  // Get leading and trailing comments
  ts.forEachChild(sourceFile, function visit(node) {
    const leadingComments = ts.getLeadingCommentRanges(
      sourceFile.getFullText(),
      node.getFullStart()
    );
    // ... process comments
    ts.forEachChild(node, visit);
  });

  return comments;
}
```

### Regex Fallback (Simpler, Less Accurate)

```typescript
const COMMENT_PATTERNS = {
  lineComment: /(?<!:)\/\/(?!\/)/g,  // // but not :// (URLs)
  blockOpen: /\/\*/g,
  blockClose: /\*\//g,
};
```

## Anti-Patterns

- **Don't flag URL protocols** - `https://` is not a broken comment
- **Don't flag regex delimiters** - `/pattern/g` is valid regex
- **Don't flag division operators** - `a / b / c` is math
- **Don't flag JSDoc special syntax** - `@param`, `@returns` are valid

## Error Categorization

For metrics and debugging, classify validation results:

| Category | Description |
|----------|-------------|
| `syntax_error` | Actual broken comment syntax |
| `json_comment` | Comment in JSON (invalid) |
| `false_positive` | Pattern that looks wrong but isn't |
| `style_warning` | Valid but unusual (e.g., `//////`) |

## Future Enhancements

1. **IDE integration** - Run on save, highlight issues inline
2. **Auto-fix** - Suggest fixes for common issues
3. **Custom rules** - Project-specific comment conventions
4. **Performance** - Cache AST parsing for large files

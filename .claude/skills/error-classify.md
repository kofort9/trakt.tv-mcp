---
name: error-classify
description: |
  Categorize error handling patterns before code review.
  Classifies errors into taxonomy (network, validation, auth, api, internal)
  to help reviewers assess if each category is handled appropriately.
  Enables error handling metrics and focused review feedback.
---

# Error Classify Skill

Pre-classify error handling patterns to improve code review quality.

## Origin

PR #28 review noted:
> "Error categorization | Good candidate for future `/error-classify` skill"

And from future-work.md:
> "Classify errors (network/validation/auth) for metrics"

The goal is to help reviewers quickly assess whether all error categories are properly handled, rather than manually tracing every catch block.

## When to Use

- **Before:** Running `code-reviewer` on PRs that touch error handling
- **After:** Implementing new API integrations or error-prone code paths
- **Proactively:** When reviewing code with multiple try-catch blocks
- **For metrics:** Periodic codebase health checks

## Error Taxonomy

### Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `network` | Connection/transport failures | Timeout, ECONNREFUSED, DNS errors |
| `validation` | Input/data validation failures | Missing required field, invalid format |
| `auth` | Authentication/authorization | 401, 403, token expired, invalid credentials |
| `api` | External API errors | Rate limit (429), bad request (400), server error (5xx) |
| `internal` | Application logic errors | Null reference, type error, assertion failure |
| `resource` | Resource exhaustion | Out of memory, disk full, file handle limit |
| `unknown` | Unclassified/generic catch-all | `catch (e) { }` without specific handling |

### Subcategories

```typescript
type ErrorCategory = {
  network: 'timeout' | 'connection_refused' | 'dns' | 'ssl' | 'other';
  validation: 'missing_field' | 'invalid_format' | 'type_mismatch' | 'range' | 'other';
  auth: 'unauthenticated' | 'unauthorized' | 'token_expired' | 'invalid_credentials';
  api: 'rate_limit' | 'bad_request' | 'not_found' | 'server_error' | 'unavailable';
  internal: 'null_reference' | 'type_error' | 'assertion' | 'state' | 'other';
  resource: 'memory' | 'disk' | 'handles' | 'quota';
  unknown: 'generic_catch' | 'empty_catch' | 'untyped';
};
```

## Classification Process

### Step 1: Find Error Handling Code

Scan for patterns:

```typescript
// Patterns to find
const ERROR_PATTERNS = [
  /catch\s*\([^)]*\)\s*\{/g,           // catch blocks
  /\.catch\s*\(/g,                      // promise .catch()
  /throw\s+new\s+\w+Error/g,            // throw statements
  /if\s*\([^)]*error[^)]*\)/gi,         // error conditionals
  /instanceof\s+\w*Error/g,             // error type checks
  /status\s*[=!]==?\s*[45]\d{2}/g,      // HTTP status checks
];
```

### Step 2: Analyze Each Error Handler

For each catch block or error handler:

```typescript
interface ErrorHandlerAnalysis {
  file: string;
  line: number;
  category: ErrorCategory;
  subcategory: string;
  pattern: 'catch_block' | 'promise_catch' | 'conditional' | 'throw';
  handling: 'logged' | 'rethrown' | 'swallowed' | 'transformed' | 'recovered';
  specificity: 'specific' | 'generic' | 'empty';
  context: string; // Code snippet
}
```

### Step 3: Classify Based on Indicators

| Indicator | Likely Category |
|-----------|-----------------|
| `ECONNREFUSED`, `ETIMEDOUT`, `fetch failed` | network |
| `required`, `invalid`, `must be`, `expected` | validation |
| `401`, `403`, `unauthorized`, `token`, `credentials` | auth |
| `429`, `rate limit`, `5xx`, `API error` | api |
| `TypeError`, `ReferenceError`, `Cannot read property` | internal |
| `catch (e)` with no specific handling | unknown |

### Step 4: Assess Handling Quality

| Handling Type | Quality | Description |
|---------------|---------|-------------|
| `recovered` | ✅ Good | Error handled, operation continues |
| `transformed` | ✅ Good | Error wrapped with context, rethrown |
| `logged` | ⚠️ Depends | Logged but may need action |
| `rethrown` | ⚠️ Depends | Propagated up, handled elsewhere? |
| `swallowed` | ❌ Bad | Silently ignored |

## Output Format

### Summary Report

```markdown
## Error Classification Report

**Files analyzed:** 8
**Error handlers found:** 23
**Coverage by category:**

| Category | Count | Handling Quality |
|----------|-------|------------------|
| network | 5 | ✅ 4 good, ⚠️ 1 logged-only |
| validation | 8 | ✅ 8 good |
| auth | 3 | ✅ 3 good |
| api | 4 | ✅ 3 good, ❌ 1 swallowed |
| internal | 2 | ✅ 2 good |
| unknown | 1 | ❌ 1 empty catch |

### Issues Requiring Review

| File | Line | Category | Issue |
|------|------|----------|-------|
| `trakt-client.ts` | 234 | api | Error swallowed in rate limit handler |
| `tools.ts` | 456 | unknown | Empty catch block |

### Recommendations
1. **trakt-client.ts:234** - Add logging or user feedback for rate limit errors
2. **tools.ts:456** - Specify error type or add handling logic
```

### Detailed Report (for review)

```markdown
## Error Handlers by File

### src/domain/trakt/trakt-client.ts

#### Line 89-95: Network Error Handler ✅
**Category:** network/timeout
**Handling:** transformed (wrapped with retry context)
```typescript
catch (error) {
  if (error.code === 'ETIMEDOUT') {
    throw new TraktApiError('Request timed out', { retryable: true });
  }
  throw error;
}
```
**Assessment:** Good - provides retry hint to caller

---

#### Line 234-236: Rate Limit Handler ❌
**Category:** api/rate_limit
**Handling:** swallowed
```typescript
catch (error) {
  // TODO: handle rate limit
}
```
**Assessment:** Bad - error silently ignored, user gets no feedback

---
```

## Integration with Review Pipeline

```
┌──────────────────┐
│ /error-classify  │
│ (pre-analysis)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Classification Report               │
│  - Categories covered                │
│  - Handling quality by category      │
│  - Issues flagged                    │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  code-reviewer   │
│  (uses report)   │
│                  │
│  Focus areas:    │
│  - Missing cats  │
│  - Bad handling  │
│  - Empty catches │
└──────────────────┘
```

## Implementation Notes

### AST-Based Analysis (Preferred)

```typescript
import ts from 'typescript';

function findErrorHandlers(sourceFile: ts.SourceFile): ErrorHandler[] {
  const handlers: ErrorHandler[] = [];

  function visit(node: ts.Node) {
    if (ts.isCatchClause(node)) {
      handlers.push(analyzeCatchClause(node, sourceFile));
    }
    if (ts.isCallExpression(node)) {
      // Check for .catch() calls
      if (isCatchMethod(node)) {
        handlers.push(analyzePromiseCatch(node, sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return handlers;
}
```

### Heuristic Classification

```typescript
function classifyError(catchBlock: string): ErrorCategory {
  const indicators = {
    network: ['ECONNREFUSED', 'ETIMEDOUT', 'fetch', 'network', 'socket'],
    validation: ['required', 'invalid', 'must be', 'expected', 'schema'],
    auth: ['401', '403', 'unauthorized', 'token', 'credential', 'auth'],
    api: ['429', 'rate', '500', '502', '503', 'API', 'response'],
    internal: ['TypeError', 'ReferenceError', 'null', 'undefined'],
  };

  for (const [category, keywords] of Object.entries(indicators)) {
    if (keywords.some(kw => catchBlock.toLowerCase().includes(kw.toLowerCase()))) {
      return category as ErrorCategory;
    }
  }

  return 'unknown';
}
```

## Metrics Collection

For long-term tracking:

```typescript
interface ErrorMetrics {
  timestamp: string;
  commit: string;
  totalHandlers: number;
  byCategory: Record<ErrorCategory, number>;
  byQuality: {
    good: number;
    warning: number;
    bad: number;
  };
  issues: {
    swallowed: number;
    empty: number;
    generic: number;
  };
}
```

### Trend Analysis

Track over time:
- Are we adding more specific error handling?
- Are swallowed errors decreasing?
- Which categories need more attention?

## Anti-Patterns to Flag

| Anti-Pattern | Example | Why It's Bad |
|--------------|---------|--------------|
| Empty catch | `catch (e) { }` | Errors silently lost |
| Catch-all swallow | `catch (e) { console.log(e) }` | No recovery or escalation |
| Pokemon catching | `catch (e: any)` | No type information |
| Re-throw without context | `catch (e) { throw e }` | Stack trace lost |
| Overly broad catch | `catch (e) { return null }` | Masks different failures |

## Good Patterns to Recognize

| Pattern | Example | Why It's Good |
|---------|---------|---------------|
| Specific catch | `catch (e) { if (e instanceof NetworkError) ... }` | Targeted handling |
| Wrap and throw | `catch (e) { throw new AppError('Context', { cause: e }) }` | Preserves context |
| Graceful recovery | `catch (e) { return fallbackValue }` (with logging) | User experience |
| Retry logic | `catch (e) { if (retryable(e)) retry() }` | Resilience |

## Future Enhancements

1. **IDE plugin** - Real-time error classification as you type
2. **CI integration** - Block PRs with swallowed errors
3. **Auto-fix suggestions** - Propose handling improvements
4. **Coverage requirements** - Ensure all categories handled in critical paths
5. **Error boundary mapping** - Which errors propagate to users?

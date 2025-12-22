# Review Pipeline Learnings

Aggregated patterns and session logs from `/review-pipeline` executions.

## Pattern Library

### Comment Patterns (from /comment-validate)

| Pattern | Classification | Lesson | Source |
|---------|---------------|--------|--------|
| `(not X)` in comments | Valid | Parenthetical negations are documentation, not typos | PR #27 |
| URL protocols `https://` | Valid | Not a broken comment | Spec |
| Regex delimiters `/pattern/g` | Valid | Not a comment | Spec |
| `// TODO:` | Valid | Track separately, not a syntax issue | Spec |

### Error Patterns (from /error-classify)

| Pattern | Classification | Lesson | Source |
|---------|---------------|--------|--------|
| `catch (e) { }` | Bad | Empty catch silently loses errors | Spec |
| `catch (e) { console.log(e) }` | Warning | Log-only may hide failures from callers | Spec |
| `catch (e) { return null }` | Depends | OK for optional operations, bad for critical paths | Spec |
| `catch (e) { throw new AppError(..., { cause: e }) }` | Good | Preserves context and chain | Spec |
| `// TODO` in catch block | Bad | Tech debt marker in error path = risky | PR #28 |

## Accuracy Metrics

| Date | PR | Flagged | Actual Issues | Missed | False Positives | Accuracy |
|------|-----|---------|---------------|--------|-----------------|----------|
| - | - | - | - | - | - | No data yet |

## Session Log

### 2025-12-22 - Pipeline Created

- Origin: PR #29 discussion identified need to orchestrate `/error-classify` (from PR #28) and `/comment-validate` (from PR #27)
- Architecture: Meta-skill orchestrating both + code-reviewer
- Next: First real execution to gather baseline data

---

*Updated automatically by `/review-pipeline` post-checkpoint stage*

---
name: review-pipeline
description: |
  Orchestrate multi-skill review workflow with checkpoints and feedback loops.
  Runs /comment-validate -> /error-classify -> code-reviewer in sequence.
  Captures learnings from each cycle to improve future reviews.
---

# Review Pipeline Skill

Orchestrate pre-review analysis skills before code-reviewer, with checkpoints and continuous learning.

## Origin

PR #29 identified that `/comment-validate` and `/error-classify` both:
- Parse TypeScript AST
- Run BEFORE code-reviewer
- Output structured reports

This skill coordinates them into a unified pipeline with feedback loops.

## When to Use

- **Before PR creation** - Catch issues before they reach reviewers
- **After feature implementation** - Validate error handling and comments
- **On TypeScript changes** - When touching error handling or documentation
- **Proactively** - Before requesting human review

## Pipeline Architecture

```
┌─────────────────────┐
│ 1. comment-validate │  Filter false positives (URLs, regex, etc.)
└──────────┬──────────┘
           │ Issues? → Fix first, don't proceed
           ▼
┌─────────────────────┐
│ 2. error-classify   │  Categorize error handling by taxonomy
└──────────┬──────────┘
           │ Gaps? → Note for focused review
           ▼
┌─────────────────────┐
│ 3. pre-checkpoint   │  Save analysis state
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 4. code-reviewer    │  Full review WITH context from 1-2
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 5. post-checkpoint  │  Compare, learn, improve
└─────────────────────┘
```

## Execution Workflow

### Stage 1: Comment Validation

**Purpose:** Filter noise before review

```bash
# Get changed TypeScript files
git diff --name-only HEAD~1 | grep -E '\.(ts|tsx)$'
```

**Run:** `/comment-validate` on each file

**Gate:**
- PASSED → Proceed to stage 2
- ISSUES → Fix before continuing (don't waste reviewer time)

**Output:** Comment validation report

### Stage 2: Error Classification

**Purpose:** Enrich review with error handling context

**Run:** `/error-classify` on changed files

**Output:** Error classification report with:
- Categories found (network, validation, auth, api, internal)
- Handling quality by category
- Flags for focused review (swallowed errors, empty catches)

**No gate** - issues become focus areas for reviewer

### Stage 3: Pre-Review Checkpoint

**Purpose:** Capture analysis state for comparison

**Location:** `.claude/checkpoints/review-pipeline/`

**Format:**
```markdown
## YYYY-MM-DD HH:MM - Pre-Review: [branch-name]

### Input
- Branch: feature/xyz
- Changed files: 5
- PR: #30 (or "pending")

### Comment Validation
- Status: PASSED
- Files checked: 5
- Comments validated: 23

### Error Classification
- Categories: network (3), validation (5), api (2)
- Quality: 8 good, 1 warning, 1 bad
- Focus areas:
  - trakt-client.ts:234 - empty catch block
  - tools.ts:456 - swallowed rate limit error

### Pre-Review Checklist
- [x] Comment syntax validated
- [x] Error handling categorized
- [ ] Ready for code-reviewer
```

### Stage 4: Code Review

**Purpose:** Full review with pre-analysis context

**Invoke:** `code-reviewer` agent with context injection:

```
Context from review-pipeline:
- Comment validation: PASSED (no false positives to ignore)
- Error handling focus areas:
  1. trakt-client.ts:234 - empty catch (flagged by error-classify)
  2. tools.ts:456 - swallowed error (flagged by error-classify)
- Skip checks: URL protocols, regex delimiters (validated by comment-validate)
```

**Output:** Review findings with priorities (P1/P2/P3)

### Stage 5: Post-Review Checkpoint + Learning

**Purpose:** Compare predictions vs findings, capture learnings

**Format:**
```markdown
## YYYY-MM-DD HH:MM - Post-Review: [branch-name]

### Review Outcome
- Verdict: APPROVED / CHANGES_REQUESTED
- Issues found: P1: 0, P2: 2, P3: 1

### Pipeline Accuracy

| Metric | Value |
|--------|-------|
| Flagged by pipeline | 2 |
| Actually issues | 2 |
| Missed (not flagged) | 1 |
| False positives | 0 |

### Learnings

**Confirmed:**
- trakt-client.ts:234 empty catch → P2 issue (correct flag)

**Missed:**
- Pattern: `console.log(error)` without re-throw
- Lesson: Add "log-only" detection to error-classify

**False Positives:**
- None this cycle

### Action Items
- [ ] Update error-classify to detect log-only handlers
```

## Checkpoint Storage

### Directory Structure

```
.claude/checkpoints/review-pipeline/
├── learnings.md              # Aggregated patterns over time
├── 2025-12-22-pr-30-pre.md   # Pre-review checkpoint
├── 2025-12-22-pr-30-post.md  # Post-review checkpoint
└── ...
```

### Learnings File

Append after each review cycle:

```markdown
# Review Pipeline Learnings

## Pattern Library

### Comment Patterns (from /comment-validate)

| Pattern | Classification | Lesson |
|---------|---------------|--------|
| `(not X)` in comments | Valid | Parenthetical negations are documentation |
| `// TODO:` | Valid | Track separately, not a syntax issue |

### Error Patterns (from /error-classify)

| Pattern | Classification | Lesson |
|---------|---------------|--------|
| `catch (e) { console.log(e) }` | Warning | Log-only may hide failures |
| `catch (e) { /* TODO */ }` | Bad | Empty catch with TODO = tech debt |
| `catch (e) { return null }` | Depends | OK for optional operations, bad for critical |

## Session Log

### 2025-12-22 - PR #30
- Accuracy: 2/2 flagged correctly, 1 missed
- New pattern: log-only handlers
- Action: Update error-classify

### 2025-12-22 - PR #29
- Accuracy: N/A (pipeline not active)
- Origin of this skill spec
```

## Feedback Loop

The key differentiator of this pipeline:

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
Pre-Review Analysis → Code Review → Post-Review → Learn
     (predict)          (actual)      (compare)    (improve)
                                                      │
                                                      │
              Update skill specs ◄────────────────────┘
```

### Comparison Logic

After code-reviewer completes:

1. **Collect flags** from comment-validate + error-classify
2. **Collect findings** from code-reviewer
3. **Match:** Which flags became actual issues?
4. **Identify missed:** Issues found that weren't flagged
5. **Log:** Append to learnings.md with patterns

### Improvement Triggers

| Condition | Action |
|-----------|--------|
| Same pattern missed 3x | Create issue to update skill |
| False positive rate > 20% | Review skill thresholds |
| New error category found | Add to taxonomy |

## Integration with GitHub Actions

### Option 1: Manual (Current)

Run `/review-pipeline` before creating PR:
```bash
# In Claude Code session
/review-pipeline
# Review output
# Create PR when ready
```

### Option 2: CI Integration (Future)

Update `.github/workflows/claude-code-review.yml`:

```yaml
- name: Run Review Pipeline
  uses: anthropics/claude-code-action@v1
  with:
    prompt: |
      Run /review-pipeline on this PR.
      Pass context to code-reviewer.
      Save checkpoint to PR comment.
```

## Anti-Patterns

- **Don't skip stages** - Each stage feeds the next
- **Don't ignore flags** - Fix comment issues before review
- **Don't forget post-checkpoint** - Learning requires comparison
- **Don't over-engineer** - Start simple, add complexity as needed

## Example Session

```markdown
## 14:30 - Running /review-pipeline on feature/oauth-refresh

### Stage 1: Comment Validation
Running on 3 changed files...
✅ PASSED - 15 comments validated, 0 issues

### Stage 2: Error Classification
Running on 3 changed files...
Found 8 error handlers:
- network: 2 (✅ good)
- auth: 3 (✅ good)
- api: 2 (⚠️ 1 swallowed)
- unknown: 1 (❌ empty catch)

Focus areas for review:
1. oauth.ts:145 - swallowed 401 error
2. oauth.ts:189 - empty catch block

### Stage 3: Pre-Checkpoint
Saved to .claude/checkpoints/review-pipeline/2025-12-22-oauth-refresh-pre.md

### Stage 4: Code Review
Invoking code-reviewer with context...

[code-reviewer output]
P2: oauth.ts:145 - 401 should trigger re-auth flow, not be swallowed
P2: oauth.ts:189 - Empty catch hides token refresh failures
P3: oauth.ts:67 - Consider adding retry for network errors

### Stage 5: Post-Checkpoint
Comparing flags vs findings...

Accuracy: 2/2 flagged → P2 issues
Missed: 1 (retry suggestion - outside error-classify scope)

Saved to .claude/checkpoints/review-pipeline/2025-12-22-oauth-refresh-post.md
Updated learnings.md

### Summary
Pipeline complete. 2 P2 issues to address before merge.
```

## Dependencies

| Skill | Purpose | Required |
|-------|---------|----------|
| `/comment-validate` | Stage 1 | Yes |
| `/error-classify` | Stage 2 | Yes |
| `/checkpoint` | Stages 3, 5 | Yes |
| `code-reviewer` agent | Stage 4 | Yes |

## Future Enhancements

1. **AST caching** - Share parsed AST between comment-validate and error-classify
2. **Parallel execution** - Run stages 1-2 concurrently (no dependencies)
3. **PR comment integration** - Post checkpoint summary to PR
4. **Trend dashboard** - Visualize accuracy over time
5. **Auto-issue creation** - When pattern missed 3x, create GitHub issue

---
name: pr-feedback-loop
description: |
  Handle automated review comments on PR. Process one comment at a time.
  Works with GitHub native reviews (Claude bot, Copilot, etc.).
  Old context lives in checkpoints, not working memory.
---

# PR Feedback Loop Skill

Process the **latest unaddressed comment** only. Checkpoint outcome. Move on.

## Core Principle

```
Latest comment → Triage → Act → Checkpoint → Forget
                                    ↓
                        (Old context in Obsidian/checkpoints)
```

## Workflow

### 1. Fetch PR Comments

```bash
# Get all comments on the PR
gh pr view <PR_NUMBER> --comments --json comments

# Or use MCP tool
mcp__github__pull_request_read
  method: get_comments
  owner: kofort9
  repo: trakt.tv-mcp
  pullNumber: <PR_NUMBER>
```

### 2. Identify Automated Review Comments

Look for comments from:
- `claude[bot]` - Claude Code automated reviews
- `github-actions[bot]` - CI/CD feedback
- `copilot[bot]` - GitHub Copilot reviews

### 3. Parse Review Structure

Claude bot reviews typically follow this format:

```markdown
## Summary / Title
### ✅ Strengths
### 🔍 Issues / Suggestions
  - Priority levels (P1, P2, P3 or Critical, Important, Minor)
  - File:line references
### 🎯 Recommendations
### ✅ Final Verdict
```

### 4. Triage Each Issue (per DD-008)

| Priority | Meaning | Action |
|----------|---------|--------|
| P1 / Critical | Blocks merge | Fix immediately |
| P2 / Important | Should fix | Fix if quick, else log |
| P3 / Minor | Nice to have | Log to backlog |
| Out-of-scope | Beyond PR goal | Log to TECHNICAL_DEBT.md |

**Triage questions:**
- **In-scope?** Does it relate to the PR's stated goal?
- **Quick fix?** Can it be done in < 5 minutes?
- **Design question?** Requires architectural decision → escalate to human

### 5. Checkpoint Outcome

After addressing each issue:

```markdown
## HH:MM - Review comment addressed
- Comment: [one-line summary]
- Priority: P1/P2/P3
- Action: Fixed / Logged / Escalated / Out-of-scope
- File: path:line (if applicable)
```

### 6. Reply to PR (Optional)

If significant changes made, add a comment:

```bash
gh pr comment <PR_NUMBER> --body "Addressed review feedback:
- Fixed: [list]
- Logged for later: [list]
- Out of scope: [list]"
```

## Context Strategy

| Context | Location |
|---------|----------|
| Current comment | Working memory (temporary) |
| Past comments | Checkpoints in Obsidian |
| Decisions made | PROJECT_STATUS.md DDs |
| Out-of-scope items | TECHNICAL_DEBT.md |

**If you need old context**: Read checkpoint, don't re-fetch all comments.

## Escalation Triggers

- Comment questions the approach (not just implementation)
- > 10 issues flagged (scope creep signal)
- Same issue keeps recurring after fix
- Comment requires architectural decision
- Reviewer explicitly requests human review

## Output Format

After processing each issue:
```
Addressed: [type error in tools.ts:142]
Priority: P2
Action: Fixed
Remaining: 2 issues
```

After all issues:
```
Review loop complete. All issues addressed. Ready for merge approval.
Summary:
- Fixed: 3
- Logged: 1
- Out-of-scope: 1
```

## Example Session

```markdown
## 15:30 - PR #29 Review Feedback

### Comment from claude[bot]
Review identified 3 suggestions:
1. P3: Clarify ErrorCategory type definition
2. P3: Add edge cases for template literals
3. P3: Cross-reference to CLAUDE.md

### Triage
All P3 (minor) and documentation-only PR → Log for implementation phase

### Action
- Logged to future-work.md under skill implementation notes
- No code changes needed

### Status
Review complete. PR ready to merge.
```

## Anti-Patterns

- **Don't fix everything**: P3 items in a docs PR can wait
- **Don't argue with bots**: If review is wrong, just note it and move on
- **Don't lose context**: Checkpoint before moving to next issue
- **Don't re-fetch repeatedly**: Read checkpoints for history

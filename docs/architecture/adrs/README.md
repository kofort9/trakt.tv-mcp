# Architecture Decision Records (ADRs)

Use this folder to capture design decisions that affect the Trakt MCP server.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./ADR-001-queue-sync-token-optimization.md) | Token Cost Optimization for Queue Sync | Accepted | 2025-12-17 |
| [ADR-002](./ADR-002-interactive-state-machine.md) | Interactive State Machine for Queue Sync | Proposed | 2025-12-17 |

## Template

Copy the outline below into a new file named `ADR-<number>-<slug>.md`:

```
# ADR-000: Title
- Status: Proposed | Accepted | Deprecated | Superseded by ADR-xxx
- Date: YYYY-MM-DD
- Owners: @github-handle

## Context
- Why this change is needed
- Constraints and assumptions

## Decision
- What was decided and why

## Consequences
- Positive outcomes
- Risks and mitigations

## Alternatives Considered
- Option A (pros/cons)
- Option B (pros/cons)
```

Keep ADRs short and focused; link to design docs or issues for deep context.

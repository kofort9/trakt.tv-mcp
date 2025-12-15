# Documentation Index

Quick links by topic. All paths are relative to `docs/`.

## Guides
- `guides/NATURAL_LANGUAGE_GUIDE.md` — Natural language patterns and examples
- `guides/QUICK_START.md` — Fast setup + first commands
- `guides/LINEAR_IMPORT_GUIDE.md` — Linear import how-to
- `guides/CONTRIBUTING.md` — Contributor + AI assistant guidelines

## Operations
- `operations/DEBUGGING.md` — Debugging tips and tools
- `operations/observability.md` — Langfuse/telemetry setup
- `operations/manual-e2e-plan.md` — Manual end-to-end plan for offline flows
- `operations/CACHE.md` — Cache behavior and tuning

## Testing
- `testing/TESTING_GUIDE.md` — Full testing guide
- `testing/TEST_QUICK_REFERENCE.md` — Quick commands
- `testing/test-tools.md` — Helper tools and fixtures

## Architecture
- `architecture/IMPLEMENTATION_REPORT.md` — Observability implementation report
- `architecture/gpt5_2-reporeview.md` — Repo review & UX ideas
- `architecture/adrs/README.md` — ADR index and template
- `architecture/future-work.md` — Forward-looking UX/features plan

## Policies & Security
- `../SECURITY.md` — Security policy
- `../CODE_OF_CONDUCT.md` — Code of conduct
- `policies/SECURITY_INVESTIGATION.md` — Security investigation log
- `policies/audit-report.json` — Latest audit output

## Archive (Historical)
- `archive/README.md` — Historical docs index
- `archive/TECHNICAL_DEBT.md` — Legacy technical debt log
- `archive/` subfolders: implementation notes, past reports, and scripts

If you add a new doc, drop a link in the relevant section above and keep the title descriptive.

**Cross-References:**

- Use relative paths for internal links
- Verify links after moving or renaming files
- Include absolute file paths in format: `/Users/kofifort/Repos/trakt.tv-mcp/path/to/file.ts`

---

## Getting Help

**For Users:**

- Check [Natural Language Guide](guides/NATURAL_LANGUAGE_GUIDE.md) for usage examples
- Review [README](../README.md) for setup troubleshooting

**For Developers:**

- See [CLAUDE.md](../CLAUDE.md) for project-specific AI instructions
- Review [Testing Guide](testing/TESTING_GUIDE.md) for quality assurance details
- Check [Contributing Guide](guides/CONTRIBUTING.md) for contribution guidelines

**For AI Assistants:**

- Start with [Contributing Guide - AI Assistants Section](guides/CONTRIBUTING.md#for-ai-assistants-integration-guidelines)
- Reference [Natural Language Guide](guides/NATURAL_LANGUAGE_GUIDE.md) for pattern mapping

---

## Recent Changes

**2025-12-11: Dependency Documentation & Security Updates**

- Added TECHNICAL_DEBT.md with dependency pin documentation (ora 8.2.0, vitest 3.2.4)
- Updated Langfuse documentation for class-based DI pattern
- Added cache performance benchmarks to CACHE.md
- Added OAuth security documentation (race condition guards)
- Updated README with token storage security details

**2025-11-25: Documentation Consolidation**

- Reduced from ~30 files to 10 active files
- Archived 17 historical documents
- Consolidated guides from 4 to 2 files:
  - CONTRIBUTING.md (merged CONTRIBUTING_NL.md + CLAUDE_PROMPT_GUIDELINES.md)
  - NATURAL_LANGUAGE_GUIDE.md (merged NATURAL_LANGUAGE_PATTERNS.md + NL_PATTERNS_REFERENCE.md)
- Consolidated testing docs from 5 to 2 files:
  - TESTING_GUIDE.md (comprehensive guide)
  - TEST_QUICK_REFERENCE.md (quick reference)
- Created comprehensive archive with README and headers

---

**Last Updated:** 2025-12-11
**Documentation Version:** 2.1.0 (Observability & Security)
**Maintained By:** Development Team

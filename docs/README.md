# Documentation Index

Welcome to the Trakt.tv MCP server documentation. This directory contains all project documentation organized by topic.

## Quick Navigation

### For Users

- **[README](../README.md)** - Project overview, setup instructions, and quick start
- **[CHANGELOG](../CHANGELOG.md)** - Version history and release notes
- **[Natural Language Patterns Guide](guides/NATURAL_LANGUAGE_PATTERNS.md)** - How to use natural language with the server
- **[NL Patterns Quick Reference](guides/NL_PATTERNS_REFERENCE.md)** - Cheat sheet for date and episode formats

### For AI Assistants (Claude, etc.)

- **[Claude Prompt Guidelines](guides/CLAUDE_PROMPT_GUIDELINES.md)** - How AI assistants should interpret user queries and map them to tool calls
- **[Contributing Natural Language Patterns](guides/CONTRIBUTING_NL.md)** - How to extend natural language support

### For Contributors

- **[Testing Documentation](testing/)** - Test reports, results, and testing guidelines
- **[Debugging Guide](DEBUGGING.md)** - How to use debug tools and analyze logs
- **[Technical Debt & Improvements](TECHNICAL_DEBT.md)** - Tracked improvements and future enhancements
- **[Archive](archive/)** - Historical bug reports and resolved issues

---

## Documentation Structure

```
docs/
├── README.md                          # This file - navigation index
├── DEBUGGING.md                       # Debugging guide
├── TECHNICAL_DEBT.md                  # Technical debt and future improvements
├── guides/                            # User and developer guides
│   ├── CLAUDE_PROMPT_GUIDELINES.md   # AI assistant integration guide
│   ├── NATURAL_LANGUAGE_PATTERNS.md  # Natural language pattern library
│   ├── NL_PATTERNS_REFERENCE.md      # Quick reference card
│   └── CONTRIBUTING_NL.md            # How to add new patterns
├── testing/                           # Test documentation
│   ├── PHASE3_COMPREHENSIVE_TEST_REPORT.md
│   ├── PHASE3_RETEST_EXECUTIVE_SUMMARY.md
│   ├── PHASE3_RETEST_RESULTS.md
│   ├── PHASE3_TESTING_SUMMARY.md
│   ├── PHASE3_TEST_RESULTS.md
│   ├── PHASE3_TEST_SUMMARY.md
│   ├── NATURAL_LANGUAGE_TEST_REPORT.md
│   ├── SUMMARIZE_HISTORY_TEST_SUMMARY.md
│   ├── TEST_REPORT_summarize_history.md
│   ├── TEST_QUICK_REFERENCE.md
│   └── FINAL_TEST_REPORT_WITH_BUGS.md
└── archive/                           # Historical documentation
    ├── BUG_FIX_REPORT.md
    └── CRITICAL_BUGS_AND_PLAN.md
```

---

## Documentation by Topic

### Authentication & Setup
- [README - Setup Section](../README.md#setup)
- Environment configuration
- OAuth 2.0 device flow setup
- Trakt.tv API credentials

### Natural Language Support
- [Natural Language Patterns Guide](guides/NATURAL_LANGUAGE_PATTERNS.md) - Comprehensive pattern documentation
- [NL Patterns Quick Reference](guides/NL_PATTERNS_REFERENCE.md) - Quick lookup
- [Contributing NL Patterns](guides/CONTRIBUTING_NL.md) - Extending pattern support

### AI Assistant Integration
- [Claude Prompt Guidelines](guides/CLAUDE_PROMPT_GUIDELINES.md) - How Claude should interpret queries
- Pattern mapping examples
- Disambiguation handling
- Error message presentation

### Testing
- [Phase 3 Comprehensive Test Report](testing/PHASE3_COMPREHENSIVE_TEST_REPORT.md) - Latest full test results
- [Phase 3 Retest Executive Summary](testing/PHASE3_RETEST_EXECUTIVE_SUMMARY.md) - Post-fix verification
- [Natural Language Test Report](testing/NATURAL_LANGUAGE_TEST_REPORT.md) - NL pattern testing
- [Test Quick Reference](testing/TEST_QUICK_REFERENCE.md) - Testing commands and patterns

### Development
- [README - Development Section](../README.md#development)
- [Debugging Guide](DEBUGGING.md) - Debug tools and log analysis
- [CHANGELOG](../CHANGELOG.md) - Version history
- [CLAUDE.md](../CLAUDE.md) - Project instructions for Claude Code
- [Technical Debt & Improvements](TECHNICAL_DEBT.md) - Tracked future improvements
  - Performance optimizations
  - Security hardening
  - Documentation cleanup

### Historical Records
- [Bug Fix Report](archive/BUG_FIX_REPORT.md) - Resolved bug documentation
- [Critical Bugs and Plan](archive/CRITICAL_BUGS_AND_PLAN.md) - Historical bug tracking

---

## Documentation Maintenance

### When to Update Documentation

**Update README.md when:**
- Adding new features visible to end users
- Changing setup or installation procedures
- Modifying environment variables or configuration

**Update CHANGELOG.md when:**
- Releasing a new version
- Merging significant features or fixes
- Making breaking changes

**Update Pattern Guides when:**
- Adding new natural language patterns
- Changing date parsing behavior
- Adding or modifying tool parameters

**Create Test Reports when:**
- Completing a testing phase
- Verifying bug fixes
- Releasing a new version

**Update TECHNICAL_DEBT.md when:**
- Identifying performance bottlenecks or optimization opportunities
- Discovering security concerns or hardening needs
- Planning future features that are deferred
- Finding code that needs refactoring but can't be done immediately
- Noting infrastructure or operational improvements

### Documentation Standards

**Style Guidelines:**
- Use clear, direct language
- Include code examples for technical concepts
- Provide both conceptual explanations and practical examples
- Reference specific file paths and line numbers where helpful

**Format Conventions:**
- Use markdown for all documentation
- Include table of contents for documents over 200 lines
- Use code fences with language tags
- Keep line length under 120 characters

**Cross-References:**
- Use relative paths for internal links
- Verify links after moving or renaming files
- Include file paths in format: `/Users/kofifort/Repos/trakt.tv-mcp/path/to/file.ts`

---

## Getting Help

**For Users:**
- Check [Natural Language Patterns](guides/NATURAL_LANGUAGE_PATTERNS.md) for usage examples
- Review [README](../README.md) for setup troubleshooting

**For Developers:**
- See [CLAUDE.md](../CLAUDE.md) for project-specific AI instructions
- Review [Test Reports](testing/) for quality assurance details

**For AI Assistants:**
- Start with [Claude Prompt Guidelines](guides/CLAUDE_PROMPT_GUIDELINES.md)
- Reference [NL Patterns Quick Reference](guides/NL_PATTERNS_REFERENCE.md) for pattern mapping

---

**Last Updated:** 2025-11-20
**Documentation Version:** 1.0.0

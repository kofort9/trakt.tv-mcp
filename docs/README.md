# Documentation Index

Welcome to the Trakt.tv MCP server documentation. This directory contains all project documentation organized by topic.

---

## Quick Navigation

### For Users

- **[README](../README.md)** - Project overview, setup instructions, and quick start
- **[CHANGELOG](../CHANGELOG.md)** - Version history and release notes
- **[Natural Language Guide](guides/NATURAL_LANGUAGE_GUIDE.md)** - Complete guide to natural language patterns and usage

### For AI Assistants (Claude, etc.)

- **[Contributing Guide](guides/CONTRIBUTING.md)** - Guidelines for AI assistants and developers
  - AI assistant integration patterns
  - How to interpret user queries
  - Natural language pattern mapping

### For Contributors

- **[Contributing Guide](guides/CONTRIBUTING.md)** - How to contribute to this project
  - Adding new features
  - Extending natural language support
  - Code quality standards
- **[Testing Guide](testing/TESTING_GUIDE.md)** - Comprehensive testing documentation
- **[Test Quick Reference](testing/TEST_QUICK_REFERENCE.md)** - Quick testing cheat sheet
- **[Debugging Guide](DEBUGGING.md)** - How to use debug tools and analyze logs
- **[Technical Debt](TECHNICAL_DEBT.md)** - Tracked improvements and future enhancements

### Historical Documentation

- **[Archive](archive/)** - Historical bug reports, test reports, and implementation documents
  - See [Archive README](archive/README.md) for complete index

---

## Documentation Structure

```
docs/
├── README.md                           # This file - navigation index
├── DEBUGGING.md                        # Debugging guide
├── TECHNICAL_DEBT.md                   # Technical debt and future improvements
├── guides/                             # User and developer guides
│   ├── CONTRIBUTING.md                 # Contributing guide (AI + developers)
│   └── NATURAL_LANGUAGE_GUIDE.md       # Complete NL pattern reference
├── testing/                            # Test documentation
│   ├── TESTING_GUIDE.md                # Comprehensive testing guide
│   └── TEST_QUICK_REFERENCE.md         # Quick testing cheat sheet
└── archive/                            # Historical documentation
    ├── README.md                       # Archive index
    ├── implementation/                 # Implementation phase docs
    └── test-reports/                   # Historical test reports
```

**Total Active Documentation:** 10 files (down from ~30)

---

## Documentation by Topic

### Setup & Configuration

- [README - Setup Section](../README.md#setup)
- Environment configuration
- OAuth 2.0 device flow setup
- Trakt.tv API credentials

### Natural Language Support

- [Natural Language Guide](guides/NATURAL_LANGUAGE_GUIDE.md) - Comprehensive pattern documentation
  - Date expressions (35+ patterns)
  - Episode specifications
  - Common usage patterns
  - Validation rules
  - Error handling
  - Disambiguation

### AI Assistant Integration

- [Contributing Guide - AI Assistants Section](guides/CONTRIBUTING.md#for-ai-assistants-integration-guidelines)
  - How Claude should interpret queries
  - Pattern mapping examples
  - Disambiguation handling
  - Error message presentation
  - Best practices

### Development & Contributing

- [Contributing Guide](guides/CONTRIBUTING.md)
  - Architecture principles
  - Adding new features
  - Extending natural language patterns
  - Code quality standards
  - Testing requirements
- [CLAUDE.md](../CLAUDE.md) - Project-specific instructions for Claude Code

### Testing

- [Testing Guide](testing/TESTING_GUIDE.md) - Comprehensive testing documentation
  - Testing tools and setup
  - Test status summary
  - Running tests
  - Edge case testing
  - MCP Inspector testing
- [Test Quick Reference](testing/TEST_QUICK_REFERENCE.md) - Quick testing commands and examples

### Debugging & Troubleshooting

- [Debugging Guide](DEBUGGING.md)
  - Debug tools
  - Log analysis
  - Common issues
  - Performance profiling

### Performance & Caching

- [Cache Implementation](CACHE.md) - Memory management and caching behavior
  - Memory tracking
  - Cache limits
  - Eviction policies

### Project Management

- [Technical Debt](TECHNICAL_DEBT.md)
  - Performance optimizations
  - Security hardening
  - Documentation improvements
  - Future features
- [CHANGELOG](../CHANGELOG.md) - Version history

### Historical Records

- [Archive](archive/) - Historical documentation
  - [Archive README](archive/README.md) - Complete archive index
  - Implementation phase documents
  - Phase 3 test reports
  - Bug fix reports
  - Linear import guide

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

**Update Natural Language Guide when:**
- Adding new natural language patterns
- Changing date parsing behavior
- Adding or modifying tool parameters

**Update Testing Guide when:**
- Adding new test suites
- Discovering new edge cases
- Updating test procedures or tools

**Update Technical Debt when:**
- Identifying performance bottlenecks
- Discovering security concerns
- Planning future features that are deferred
- Finding code that needs refactoring

### Documentation Standards

**Style Guidelines:**
- Use clear, direct language
- Include code examples for technical concepts
- Provide both conceptual explanations and practical examples
- Reference specific file paths where helpful

**Format Conventions:**
- Use markdown for all documentation
- Include table of contents for documents over 200 lines
- Use code fences with language tags
- Keep line length under 120 characters

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

**Last Updated:** 2025-11-25
**Documentation Version:** 2.0.0 (Consolidated)
**Maintained By:** Development Team

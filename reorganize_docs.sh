#!/bin/bash
# Phase 2: Documentation Reorganization Script
# Purpose: Create directory structure and move documentation files
# Repository: /Users/kofifort/Repos/trakt.tv-mcp
# Run from: Repository root directory

set -e  # Exit immediately if a command exits with a non-zero status
set -u  # Treat unset variables as an error

echo "================================================"
echo "Phase 2: Documentation Reorganization"
echo "================================================"
echo ""

# Verify we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "ERROR: Must run from repository root directory"
    echo "Current directory: $(pwd)"
    exit 1
fi

echo "✓ Running from repository root"
echo ""

# Step 1: Create directory structure
echo "[1/4] Creating directory structure..."
mkdir -p docs/guides
mkdir -p docs/testing
mkdir -p docs/archive
echo "  ✓ Created docs/guides/"
echo "  ✓ Created docs/testing/"
echo "  ✓ Created docs/archive/"
echo ""

# Step 2: Move guide files (4 files)
echo "[2/4] Moving guide files to docs/guides/..."

FILES_GUIDES=(
    "CLAUDE_PROMPT_GUIDELINES.md"
    "NL_PATTERNS_REFERENCE.md"
    "CONTRIBUTING_NL.md"
    "NATURAL_LANGUAGE_PATTERNS.md"
)

for file in "${FILES_GUIDES[@]}"; do
    if [ -f "$file" ]; then
        git mv "$file" docs/guides/
        echo "  ✓ Moved $file"
    else
        echo "  ⚠ Warning: $file not found, skipping"
    fi
done
echo ""

# Step 3: Move testing files (11 files)
echo "[3/4] Moving testing files to docs/testing/..."

FILES_TESTING=(
    "PHASE3_COMPREHENSIVE_TEST_REPORT.md"
    "PHASE3_RETEST_EXECUTIVE_SUMMARY.md"
    "PHASE3_RETEST_RESULTS.md"
    "PHASE3_TESTING_SUMMARY.md"
    "PHASE3_TEST_RESULTS.md"
    "PHASE3_TEST_SUMMARY.md"
    "NATURAL_LANGUAGE_TEST_REPORT.md"
    "SUMMARIZE_HISTORY_TEST_SUMMARY.md"
    "TEST_REPORT_summarize_history.md"
    "TEST_QUICK_REFERENCE.md"
    "FINAL_TEST_REPORT_WITH_BUGS.md"
)

for file in "${FILES_TESTING[@]}"; do
    if [ -f "$file" ]; then
        git mv "$file" docs/testing/
        echo "  ✓ Moved $file"
    else
        echo "  ⚠ Warning: $file not found, skipping"
    fi
done
echo ""

# Step 4: Move archive files (2 files)
echo "[4/4] Moving archive files to docs/archive/..."

FILES_ARCHIVE=(
    "BUG_FIX_REPORT.md"
    "CRITICAL_BUGS_AND_PLAN.md"
)

for file in "${FILES_ARCHIVE[@]}"; do
    if [ -f "$file" ]; then
        git mv "$file" docs/archive/
        echo "  ✓ Moved $file"
    else
        echo "  ⚠ Warning: $file not found, skipping"
    fi
done
echo ""

# Summary
echo "================================================"
echo "Reorganization Complete!"
echo "================================================"
echo ""
echo "Files moved:"
echo "  • 4 guide files → docs/guides/"
echo "  • 11 testing files → docs/testing/"
echo "  • 2 archive files → docs/archive/"
echo ""
echo "New documentation files created by Claude:"
echo "  • CHANGELOG.md (root)"
echo "  • README.md (updated)"
echo "  • docs/README.md (navigation index)"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git status"
echo "  2. Verify file paths in documentation"
echo "  3. Commit the reorganization:"
echo "     git commit -m 'docs: reorganize documentation structure'"
echo ""

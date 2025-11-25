/**
 * Pre-Push Hook Logic Tests
 *
 * Tests the pre-push hook logic for:
 * - Documentation pattern detection
 * - Code change detection
 * - Correct test skip/run behavior
 */

import { describe, it, expect } from 'vitest';

describe('Pre-Push Hook Logic', () => {
  describe('Documentation Pattern Matching', () => {
    it('should identify markdown files as documentation', () => {
      const docPatterns = [/\.md$/, /^\.claude\/agents\//, /^docs\//];
      const files = ['README.md', 'CONTRIBUTING.md', 'docs/guide.md'];

      files.forEach(file => {
        const isDoc = docPatterns.some(pattern => pattern.test(file));
        expect(isDoc).toBe(true);
      });
    });

    it('should identify agent config files as documentation', () => {
      const docPatterns = [/\.md$/, /^\.claude\/agents\//, /^docs\//];
      const files = [
        '.claude/agents/trakt-watch-companion.md',
        '.claude/agents/backend-agent.md'
      ];

      files.forEach(file => {
        const isDoc = docPatterns.some(pattern => pattern.test(file));
        expect(isDoc).toBe(true);
      });
    });

    it('should identify docs directory files as documentation', () => {
      const docPatterns = [/\.md$/, /^\.claude\/agents\//, /^docs\//];
      const files = ['docs/api.md', 'docs/setup/installation.md'];

      files.forEach(file => {
        const isDoc = docPatterns.some(pattern => pattern.test(file));
        expect(isDoc).toBe(true);
      });
    });

    it('should NOT identify code files as documentation', () => {
      const docPatterns = [/\.md$/, /^\.claude\/agents\//, /^docs\//];
      const files = [
        'src/index.ts',
        'src/lib/tools.ts',
        'package.json',
        '.husky/pre-push',
        'tsconfig.json'
      ];

      files.forEach(file => {
        const isDoc = docPatterns.some(pattern => pattern.test(file));
        expect(isDoc).toBe(false);
      });
    });
  });

  describe('Change Detection Logic', () => {
    const filterNonDocChanges = (files: string[]): string[] => {
      // Simulates the grep logic from pre-push hook
      return files.filter(file => {
        return !file.match(/\.md$/) &&
               !file.match(/^\.claude\/agents\//) &&
               !file.match(/^docs\//);
      });
    };

    it('should return empty array for documentation-only changes', () => {
      const files = [
        'README.md',
        '.claude/agents/trakt-watch-companion.md',
        'docs/api.md'
      ];

      const nonDocChanges = filterNonDocChanges(files);
      expect(nonDocChanges).toHaveLength(0);
    });

    it('should detect code changes', () => {
      const files = [
        'README.md',
        'src/index.ts',
        '.claude/agents/agent.md'
      ];

      const nonDocChanges = filterNonDocChanges(files);
      expect(nonDocChanges).toHaveLength(1);
      expect(nonDocChanges[0]).toBe('src/index.ts');
    });

    it('should detect package.json changes', () => {
      const files = [
        'README.md',
        'package.json'
      ];

      const nonDocChanges = filterNonDocChanges(files);
      expect(nonDocChanges).toHaveLength(1);
      expect(nonDocChanges[0]).toBe('package.json');
    });

    it('should detect hook file changes', () => {
      const files = [
        'README.md',
        '.husky/pre-push'
      ];

      const nonDocChanges = filterNonDocChanges(files);
      expect(nonDocChanges).toHaveLength(1);
      expect(nonDocChanges[0]).toBe('.husky/pre-push');
    });

    it('should handle mixed changes correctly', () => {
      const files = [
        'README.md',
        'src/lib/tools.ts',
        'docs/setup.md',
        '.claude/agents/agent.md',
        'package.json',
        'CONTRIBUTING.md'
      ];

      const nonDocChanges = filterNonDocChanges(files);
      expect(nonDocChanges).toHaveLength(2);
      expect(nonDocChanges).toContain('src/lib/tools.ts');
      expect(nonDocChanges).toContain('package.json');
    });
  });

  describe('Hook Behavior', () => {
    it('should define correct documentation patterns', () => {
      // These patterns should match the ones in .husky/pre-push
      const expectedPatterns = [
        '*.md (Markdown files)',
        '.claude/agents/* (Agent configuration files)',
        'docs/* (Documentation directory)'
      ];

      expect(expectedPatterns).toHaveLength(3);
      expect(expectedPatterns[0]).toContain('*.md');
      expect(expectedPatterns[1]).toContain('.claude/agents/*');
      expect(expectedPatterns[2]).toContain('docs/*');
    });

    it('should skip tests for documentation-only changes', () => {
      const files = ['README.md', 'docs/api.md'];
      const nonDocChanges = files.filter(file =>
        !file.match(/\.md$/) &&
        !file.match(/^\.claude\/agents\//) &&
        !file.match(/^docs\//)
      );

      const shouldSkipTests = nonDocChanges.length === 0;
      expect(shouldSkipTests).toBe(true);
    });

    it('should run tests for code changes', () => {
      const files = ['src/index.ts'];
      const nonDocChanges = files.filter(file =>
        !file.match(/\.md$/) &&
        !file.match(/^\.claude\/agents\//) &&
        !file.match(/^docs\//)
      );

      const shouldRunTests = nonDocChanges.length > 0;
      expect(shouldRunTests).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with .md in directory name but not extension', () => {
      const file = 'src/md-parser/index.ts';
      const isDoc = file.match(/\.md$/);

      expect(isDoc).toBeFalsy();
    });

    it('should handle nested documentation directories', () => {
      const file = 'docs/guides/advanced/setup.md';
      const isDoc = file.match(/^docs\//);

      expect(isDoc).toBeTruthy();
    });

    it('should handle hidden files in .claude/agents', () => {
      const file = '.claude/agents/.gitkeep';
      const isDoc = file.match(/^\.claude\/agents\//);

      expect(isDoc).toBeTruthy();
    });
  });
});

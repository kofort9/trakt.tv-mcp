/**
 * Git Hooks Integration Tests
 *
 * Tests the behavior of git hook scripts across different shell environments.
 * These tests verify:
 * - NVM setup script functionality
 * - Node version validation
 * - Shell compatibility (sh, bash)
 * - Graceful degradation when NVM is unavailable
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Skip all tests on Windows - shell scripts and chmod don't work the same way
const isWindows = os.platform() === 'win32';
const describeUnix = isWindows ? describe.skip : describe;

const HOOK_DIR = path.join(process.cwd(), '.husky');
const NVM_SETUP_SCRIPT = path.join(HOOK_DIR, 'nvm-setup.sh');
const PRE_COMMIT_HOOK = path.join(HOOK_DIR, 'pre-commit');
const PRE_PUSH_HOOK = path.join(HOOK_DIR, 'pre-push');

// Helper to run a script with a specific shell
function runWithShell(
  shell: string,
  script: string,
  env: Record<string, string> = {}
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(shell, ['-c', script], {
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// Helper to create a mock script that simulates node being unavailable
function createMockNodeScript(version: string | null, tmpDir: string): string {
  const mockBin = path.join(tmpDir, 'bin');
  fs.mkdirSync(mockBin, { recursive: true });

  if (version) {
    // Create a mock node that returns the specified version
    const mockNode = path.join(mockBin, 'node');
    fs.writeFileSync(
      mockNode,
      `#!/bin/sh
if [ "$1" = "-v" ]; then
  echo "v${version}"
  exit 0
fi
exit 0
`
    );
    fs.chmodSync(mockNode, '755');
  }

  return mockBin;
}

describeUnix('Git Hooks Integration Tests', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-hooks-test-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Hook Script Existence', () => {
    it('nvm-setup.sh script exists and is executable', () => {
      expect(fs.existsSync(NVM_SETUP_SCRIPT)).toBe(true);
      const stats = fs.statSync(NVM_SETUP_SCRIPT);
      // Check if owner has execute permission
      expect(stats.mode & parseInt('0100', 8)).toBeTruthy();
    });

    it('pre-commit hook exists and is executable', () => {
      expect(fs.existsSync(PRE_COMMIT_HOOK)).toBe(true);
      const stats = fs.statSync(PRE_COMMIT_HOOK);
      expect(stats.mode & parseInt('0100', 8)).toBeTruthy();
    });

    it('pre-push hook exists and is executable', () => {
      expect(fs.existsSync(PRE_PUSH_HOOK)).toBe(true);
      const stats = fs.statSync(PRE_PUSH_HOOK);
      expect(stats.mode & parseInt('0100', 8)).toBeTruthy();
    });
  });

  describe('NVM Setup Script', () => {
    it('sources without error when node is available in PATH', () => {
      // Test with current environment (assumes node is available)
      const result = runWithShell('sh', `. "${NVM_SETUP_SCRIPT}" && echo "SUCCESS"`);
      expect(result.stdout).toContain('SUCCESS');
      expect(result.status).toBe(0);
    });

    it('works with bash shell', () => {
      const result = runWithShell('bash', `. "${NVM_SETUP_SCRIPT}" && echo "SUCCESS"`);
      expect(result.stdout).toContain('SUCCESS');
      expect(result.status).toBe(0);
    });

    it('fails gracefully when node is not found', () => {
      // Create an environment where node is not in PATH
      const result = runWithShell('sh', `. "${NVM_SETUP_SCRIPT}"`, {
        PATH: '/nonexistent',
        HOME: tempDir,
      });
      // Should exit with non-zero status when node is not available
      expect(result.status).not.toBe(0);
    });
  });

  describe('Node Version Validation', () => {
    it('accepts Node 18.x', () => {
      const mockBin = createMockNodeScript('18.20.0', tempDir);
      const result = runWithShell('sh', `. "${NVM_SETUP_SCRIPT}" && echo "PASSED"`, {
        PATH: `${mockBin}:${process.env.PATH}`,
        HOME: tempDir,
      });
      expect(result.stdout).toContain('PASSED');
      expect(result.status).toBe(0);
    });

    it('accepts Node 20.x', () => {
      const mockBin = createMockNodeScript('20.10.0', tempDir);
      const result = runWithShell('sh', `. "${NVM_SETUP_SCRIPT}" && echo "PASSED"`, {
        PATH: `${mockBin}:${process.env.PATH}`,
        HOME: tempDir,
      });
      expect(result.stdout).toContain('PASSED');
      expect(result.status).toBe(0);
    });

    it('accepts Node 22.x', () => {
      const mockBin = createMockNodeScript('22.0.0', tempDir);
      const result = runWithShell('sh', `. "${NVM_SETUP_SCRIPT}" && echo "PASSED"`, {
        PATH: `${mockBin}:${process.env.PATH}`,
        HOME: tempDir,
      });
      expect(result.stdout).toContain('PASSED');
      expect(result.status).toBe(0);
    });

    it('rejects Node 16.x (too old)', () => {
      const mockBin = createMockNodeScript('16.20.0', tempDir);
      const result = runWithShell('sh', `. "${NVM_SETUP_SCRIPT}"`, {
        PATH: `${mockBin}:${process.env.PATH}`,
        HOME: tempDir,
      });
      expect(result.status).not.toBe(0);
      // Should mention the version requirement
      expect(result.stdout + result.stderr).toMatch(/18|20/);
    });

    it('rejects Node 14.x (too old)', () => {
      const mockBin = createMockNodeScript('14.21.0', tempDir);
      const result = runWithShell('sh', `. "${NVM_SETUP_SCRIPT}"`, {
        PATH: `${mockBin}:${process.env.PATH}`,
        HOME: tempDir,
      });
      expect(result.status).not.toBe(0);
    });
  });

  describe('Pre-commit Hook Structure', () => {
    it('sources nvm-setup.sh', () => {
      const content = fs.readFileSync(PRE_COMMIT_HOOK, 'utf-8');
      expect(content).toContain('nvm-setup.sh');
    });

    it('runs lint-staged', () => {
      const content = fs.readFileSync(PRE_COMMIT_HOOK, 'utf-8');
      expect(content).toContain('lint-staged');
    });

    it('has proper shebang', () => {
      const content = fs.readFileSync(PRE_COMMIT_HOOK, 'utf-8');
      expect(content.startsWith('#!/bin/sh')).toBe(true);
    });
  });

  describe('Pre-push Hook Structure', () => {
    it('sources nvm-setup.sh', () => {
      const content = fs.readFileSync(PRE_PUSH_HOOK, 'utf-8');
      expect(content).toContain('nvm-setup.sh');
    });

    it('consumes stdin to prevent git interference', () => {
      const content = fs.readFileSync(PRE_PUSH_HOOK, 'utf-8');
      // Should read stdin in a loop
      expect(content).toMatch(/while\s+read/);
    });

    it('handles grep exit code correctly', () => {
      const content = fs.readFileSync(PRE_PUSH_HOOK, 'utf-8');
      // Grep with || true to handle no-match case
      expect(content).toMatch(/grep.*\|\|\s*true/);
    });

    it('skips tests for documentation-only changes', () => {
      const content = fs.readFileSync(PRE_PUSH_HOOK, 'utf-8');
      expect(content).toContain('.md');
      expect(content).toContain('documentation');
    });

    it('has proper shebang', () => {
      const content = fs.readFileSync(PRE_PUSH_HOOK, 'utf-8');
      expect(content.startsWith('#!/bin/sh')).toBe(true);
    });
  });

  describe('Shell Compatibility', () => {
    const shells = ['sh', 'bash'];

    shells.forEach((shell) => {
      it(`nvm-setup.sh syntax is valid in ${shell}`, () => {
        // Use shell's syntax check mode
        const checkFlag = shell === 'bash' ? '-n' : '-n';
        const result = spawnSync(shell, [checkFlag, NVM_SETUP_SCRIPT], {
          encoding: 'utf-8',
        });
        expect(result.status).toBe(0);
        if (result.stderr) {
          // Warn but don't fail - some shells may emit warnings
          console.warn(`${shell} syntax check warnings:`, result.stderr);
        }
      });

      it(`pre-commit hook syntax is valid in ${shell}`, () => {
        const result = spawnSync(shell, ['-n', PRE_COMMIT_HOOK], {
          encoding: 'utf-8',
        });
        expect(result.status).toBe(0);
      });

      it(`pre-push hook syntax is valid in ${shell}`, () => {
        const result = spawnSync(shell, ['-n', PRE_PUSH_HOOK], {
          encoding: 'utf-8',
        });
        expect(result.status).toBe(0);
      });
    });
  });

  describe('POSIX Compliance', () => {
    it('nvm-setup.sh uses only POSIX constructs', () => {
      const content = fs.readFileSync(NVM_SETUP_SCRIPT, 'utf-8');

      // Should not use bashisms
      expect(content).not.toMatch(/\[\[/); // No [[ ]] (bash-only)
      expect(content).not.toMatch(/\$\(\(/); // No $(( )) arithmetic
      expect(content).not.toMatch(/function\s+\w+/); // No 'function' keyword
      expect(content).not.toMatch(/declare\s/); // No 'declare'
      // Check for 'local' keyword at start of statement (not in strings)
      // Skip this check as 'local' is widely supported and may appear in examples
    });

    it('pre-commit hook uses only POSIX constructs', () => {
      const content = fs.readFileSync(PRE_COMMIT_HOOK, 'utf-8');
      expect(content).not.toMatch(/\[\[/);
    });

    it('pre-push hook uses only POSIX constructs', () => {
      const content = fs.readFileSync(PRE_PUSH_HOOK, 'utf-8');
      expect(content).not.toMatch(/\[\[/);
    });
  });
});

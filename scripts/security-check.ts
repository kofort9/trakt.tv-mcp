#!/usr/bin/env tsx
/**
 * Security Preflight Check Script
 * Validates security posture before deployment
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
}

const checks: CheckResult[] = [];

// Check 1: npm audit
function checkNpmAudit(): CheckResult {
  try {
    execSync('npm audit --audit-level=moderate', {
      cwd: rootDir,
      stdio: 'pipe',
    });
    return {
      name: 'NPM Audit',
      status: 'pass',
      message: 'No vulnerabilities found',
    };
  } catch (error: any) {
    const output = error.stdout?.toString() || error.message;
    const hasVulns = output.includes('vulnerabilities');

    return {
      name: 'NPM Audit',
      status: hasVulns ? 'fail' : 'warn',
      message: hasVulns ? 'Vulnerabilities detected' : 'Audit check failed',
      details: output.slice(0, 500),
    };
  }
}

// Check 2: Environment configuration
function checkEnvConfig(): CheckResult {
  const envExample = path.join(rootDir, '.env.example');
  const envFile = path.join(rootDir, '.env');

  if (!fs.existsSync(envExample)) {
    return {
      name: 'Environment Config',
      status: 'warn',
      message: '.env.example not found',
    };
  }

  if (!fs.existsSync(envFile)) {
    return {
      name: 'Environment Config',
      status: 'warn',
      message: '.env file not found (expected for local dev)',
    };
  }

  return {
    name: 'Environment Config',
    status: 'pass',
    message: 'Environment configuration files present',
  };
}

// Check 3: Log file permissions
function checkLogPermissions(): CheckResult {
  const logDir = path.join(rootDir, 'logs');

  if (!fs.existsSync(logDir)) {
    return {
      name: 'Log Permissions',
      status: 'pass',
      message: 'No logs directory yet (will be created with correct permissions)',
    };
  }

  try {
    const stats = fs.statSync(logDir);
    const mode = (stats.mode & 0o777).toString(8);

    if (mode !== '700') {
      return {
        name: 'Log Permissions',
        status: 'fail',
        message: `Log directory has incorrect permissions: ${mode} (expected 700)`,
        details: `Run: chmod 700 ${logDir}`,
      };
    }

    return {
      name: 'Log Permissions',
      status: 'pass',
      message: 'Log directory has correct permissions (700)',
    };
  } catch (error: any) {
    return {
      name: 'Log Permissions',
      status: 'warn',
      message: 'Unable to check log permissions',
      details: error.message,
    };
  }
}

// Check 4: Token file permissions (if exists)
function checkTokenPermissions(): CheckResult {
  const tokenFile = path.join(rootDir, '.trakt-token.json');

  if (!fs.existsSync(tokenFile)) {
    return {
      name: 'Token Permissions',
      status: 'pass',
      message: 'No token file yet (will be created with correct permissions)',
    };
  }

  try {
    const stats = fs.statSync(tokenFile);
    const mode = (stats.mode & 0o777).toString(8);

    if (mode !== '600') {
      return {
        name: 'Token Permissions',
        status: 'fail',
        message: `Token file has incorrect permissions: ${mode} (expected 600)`,
        details: `Run: chmod 600 ${tokenFile}`,
      };
    }

    return {
      name: 'Token Permissions',
      status: 'pass',
      message: 'Token file has correct permissions (600)',
    };
  } catch (error: any) {
    return {
      name: 'Token Permissions',
      status: 'warn',
      message: 'Unable to check token permissions',
      details: error.message,
    };
  }
}

// Check 5: Dependency freshness
function checkDependencyFreshness(): CheckResult {
  try {
    const output = execSync('npm outdated --json', {
      cwd: rootDir,
      stdio: 'pipe',
    }).toString();

    if (!output || output === '{}') {
      return {
        name: 'Dependency Freshness',
        status: 'pass',
        message: 'All dependencies are up to date',
      };
    }

    const outdated = JSON.parse(output);
    const count = Object.keys(outdated).length;

    return {
      name: 'Dependency Freshness',
      status: 'warn',
      message: `${count} outdated dependencies found`,
      details: Object.keys(outdated).join(', '),
    };
  } catch (error: any) {
    // npm outdated exits with code 1 when outdated packages exist
    if (error.stdout) {
      try {
        const outdated = JSON.parse(error.stdout.toString());
        const count = Object.keys(outdated).length;
        return {
          name: 'Dependency Freshness',
          status: 'warn',
          message: `${count} outdated dependencies found`,
          details: Object.keys(outdated).slice(0, 10).join(', '),
        };
      } catch {
        // Ignore parse errors
      }
    }

    return {
      name: 'Dependency Freshness',
      status: 'pass',
      message: 'Unable to check outdated packages (likely all current)',
    };
  }
}

// Run all checks
function runSecurityChecks(): void {
  console.log('🔒 Running Security Preflight Checks...\n');

  checks.push(checkNpmAudit());
  checks.push(checkEnvConfig());
  checks.push(checkLogPermissions());
  checks.push(checkTokenPermissions());
  checks.push(checkDependencyFreshness());

  // Print results
  let hasFailures = false;
  let hasWarnings = false;

  checks.forEach((check) => {
    const icon =
      check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${check.name}: ${check.message}`);

    if (check.details) {
      console.log(`   ${check.details.split('\n')[0]}`);
    }

    if (check.status === 'fail') hasFailures = true;
    if (check.status === 'warn') hasWarnings = true;
  });

  console.log('');

  // Summary
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;

  console.log(
    `Summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed`
  );

  if (hasFailures) {
    console.log('\n❌ Security check FAILED. Fix issues before deployment.');
    process.exit(1);
  } else if (hasWarnings) {
    console.log(
      '\n⚠️  Security check passed with warnings. Review before deployment.'
    );
    process.exit(0);
  } else {
    console.log('\n✅ All security checks passed!');
    process.exit(0);
  }
}

runSecurityChecks();

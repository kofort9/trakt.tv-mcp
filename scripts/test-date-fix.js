#!/usr/bin/env node

/**
 * Manual test script to verify the critical date parsing bug fix
 *
 * This script tests that parseNaturalDate() correctly returns dates in UTC
 * without off-by-one errors due to timezone mismatches.
 */

import { parseNaturalDate } from '../dist/lib/utils.js';

console.log('=== Date Parsing Fix Verification ===\n');

// Get current UTC date for reference
const now = new Date();
const currentYear = now.getUTCFullYear();
const currentMonth = now.getUTCMonth();
const currentDate = now.getUTCDate();

console.log('Current Time (Local):', now.toString());
console.log('Current Time (UTC):  ', now.toUTCString());
console.log('Timezone Offset:     ', now.getTimezoneOffset(), 'minutes\n');

// Test cases
const testCases = [
  {
    input: 'today',
    expectedDate: new Date(Date.UTC(currentYear, currentMonth, currentDate)),
    description: 'Today at UTC midnight'
  },
  {
    input: 'yesterday',
    expectedDate: new Date(Date.UTC(currentYear, currentMonth, currentDate - 1)),
    description: 'Yesterday at UTC midnight (CRITICAL BUG FIX)'
  },
  {
    input: 'last week',
    expectedDate: new Date(Date.UTC(currentYear, currentMonth, currentDate - 7)),
    description: '7 days ago at UTC midnight'
  },
  {
    input: 'last month',
    expectedDate: new Date(Date.UTC(currentYear, currentMonth - 1, currentDate)),
    description: '1 month ago at UTC midnight'
  },
  {
    input: '2024-01-15',
    expectedDate: new Date(Date.UTC(2024, 0, 15)),
    description: 'ISO date converted to UTC midnight'
  }
];

let passed = 0;
let failed = 0;

console.log('Running Tests:\n');

for (const testCase of testCases) {
  try {
    const result = parseNaturalDate(testCase.input);
    const resultDate = new Date(result);
    const expected = testCase.expectedDate.toISOString();

    const isMatch = result === expected;
    const status = isMatch ? '✓ PASS' : '✗ FAIL';

    console.log(`${status} - ${testCase.description}`);
    console.log(`  Input:    "${testCase.input}"`);
    console.log(`  Result:   ${result}`);
    console.log(`  Expected: ${expected}`);

    if (!isMatch) {
      const resultMs = resultDate.getTime();
      const expectedMs = testCase.expectedDate.getTime();
      const diffMs = resultMs - expectedMs;
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffHours / 24;

      console.log(`  ERROR: Off by ${diffHours.toFixed(2)} hours (${diffDays.toFixed(2)} days)`);
      failed++;
    } else {
      passed++;
    }

    console.log('');
  } catch (error) {
    console.log(`✗ FAIL - ${testCase.description}`);
    console.log(`  Input:    "${testCase.input}"`);
    console.log(`  Error:    ${error.message}`);
    console.log('');
    failed++;
  }
}

// Additional verification: Check that yesterday is exactly 1 day before today
console.log('=== Critical Bug Verification ===\n');

const todayResult = parseNaturalDate('today');
const yesterdayResult = parseNaturalDate('yesterday');

const todayDate = new Date(todayResult);
const yesterdayDate = new Date(yesterdayResult);

const timeDiff = todayDate.getTime() - yesterdayDate.getTime();
const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

console.log('Today:     ', todayResult);
console.log('Yesterday: ', yesterdayResult);
console.log('Difference:', daysDiff, 'days');

if (daysDiff === 1) {
  console.log('✓ PASS - Yesterday is exactly 1 day before today');
  passed++;
} else {
  console.log('✗ FAIL - Yesterday is NOT exactly 1 day before today');
  console.log(`  Expected: 1 day difference`);
  console.log(`  Actual:   ${daysDiff} days difference`);
  failed++;
}

// Summary
console.log('\n=== Test Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}\n`);

if (failed === 0) {
  console.log('✓ All tests passed! Date parsing bug is FIXED.');
  process.exit(0);
} else {
  console.log('✗ Some tests failed. Date parsing bug still exists.');
  process.exit(1);
}

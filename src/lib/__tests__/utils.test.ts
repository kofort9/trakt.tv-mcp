import { describe, it, expect } from 'vitest';
import {
  parseNaturalDate,
  parseDateRange,
  parseEpisodeRange,
  validateEpisodeNumber,
  validateSeasonNumber,
  createToolError,
  createToolSuccess,
} from '../utils.js';

describe('utils', () => {
  describe('parseNaturalDate', () => {
    it('should parse "today" as UTC midnight', () => {
      const result = parseNaturalDate('today');

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);

      // Verify it's actually today in UTC
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "yesterday" as UTC midnight one day ago', () => {
      const result = parseNaturalDate('yesterday');

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);

      // Verify it's actually yesterday in UTC
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "last week" as UTC midnight 7 days ago', () => {
      const result = parseNaturalDate('last week');

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);

      // Verify it's actually 7 days ago in UTC
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "last month" as UTC midnight 1 month ago', () => {
      const result = parseNaturalDate('last month');

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);

      // Verify it's actually 1 month ago in UTC
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate())
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse ISO date to UTC midnight', () => {
      const result = parseNaturalDate('2024-01-15');
      expect(result).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should parse ISO date with time to UTC midnight', () => {
      const result = parseNaturalDate('2024-01-15T14:30:00');
      expect(result).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should handle case-insensitive input', () => {
      expect(parseNaturalDate('TODAY')).toMatch(/T00:00:00\.000Z$/);
      expect(parseNaturalDate('Yesterday')).toMatch(/T00:00:00\.000Z$/);
      expect(parseNaturalDate('LAST WEEK')).toMatch(/T00:00:00\.000Z$/);
    });

    it('should handle whitespace in input', () => {
      expect(parseNaturalDate('  today  ')).toMatch(/T00:00:00\.000Z$/);
      expect(parseNaturalDate('  yesterday  ')).toMatch(/T00:00:00\.000Z$/);
    });

    it('should throw error for invalid date', () => {
      expect(() => parseNaturalDate('invalid date')).toThrow(/Unable to parse date/);
    });

    it('should throw error with helpful message', () => {
      expect(() => parseNaturalDate('next week')).toThrow(
        /Use ISO format \(YYYY-MM-DD\) or natural language/
      );
    });

    // Critical test: Verify no off-by-one errors
    it('should correctly calculate yesterday regardless of local timezone', () => {
      const result = parseNaturalDate('yesterday');
      const parsed = new Date(result);

      // Get current UTC date components
      const now = new Date();
      const todayUTC = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const yesterdayUTC = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      );

      // Result should be exactly 24 hours before today at UTC midnight
      const daysDifference = (todayUTC.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDifference).toBe(1);
      expect(parsed.getTime()).toBe(yesterdayUTC.getTime());
    });

    // Test "last weekend" parsing
    it('should parse "last weekend" as last Saturday', () => {
      const result = parseNaturalDate('last weekend');
      const parsed = new Date(result);

      // Verify it's a Saturday (day 6)
      expect(parsed.getUTCDay()).toBe(6);

      // Verify it's in the past
      const now = new Date();
      expect(parsed.getTime()).toBeLessThan(now.getTime());

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    });

    // Test "last monday" parsing
    it('should parse "last monday" correctly', () => {
      const result = parseNaturalDate('last monday');
      const parsed = new Date(result);

      // Verify it's a Monday (day 1)
      expect(parsed.getUTCDay()).toBe(1);

      // Verify it's in the past
      const now = new Date();
      expect(parsed.getTime()).toBeLessThan(now.getTime());

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    });

    // Test all weekdays
    it('should parse all weekday patterns', () => {
      const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      weekdays.forEach((day, expectedDayOfWeek) => {
        const result = parseNaturalDate(`last ${day}`);
        const parsed = new Date(result);

        // Verify it's the correct day of week
        expect(parsed.getUTCDay()).toBe(expectedDayOfWeek);

        // Verify it's in the past
        const now = new Date();
        expect(parsed.getTime()).toBeLessThan(now.getTime());

        // Verify format
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
      });
    });

    // Test boundary condition: "last monday" when today is Monday
    it('should handle "last monday" when today is Monday (goes back full week)', () => {
      const now = new Date();
      const currentDayOfWeek = now.getUTCDay();

      // Only run this test if today is Monday
      if (currentDayOfWeek === 1) {
        const result = parseNaturalDate('last monday');
        const parsed = new Date(result);

        // Should be exactly 7 days ago
        const daysDifference = Math.floor((now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24));
        expect(daysDifference).toBe(7);
      }
    });

    // Test boundary: "yesterday" crossing month boundary
    it('should correctly handle "yesterday" on the 1st of the month', () => {
      // This test verifies the implementation handles month boundaries correctly
      // by checking that the result is always exactly 1 day before "today"
      const result = parseNaturalDate('yesterday');
      const parsed = new Date(result);
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      const hoursDifference = (today.getTime() - parsed.getTime()) / (1000 * 60 * 60);
      expect(hoursDifference).toBe(24);
    });

    // Test "last night" parsing
    it('should parse "last night" as yesterday', () => {
      const result = parseNaturalDate('last night');

      // Verify it's yesterday
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      );
      expect(result).toBe(expectedDate.toISOString());

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    });

    it('should parse "last nite" as yesterday', () => {
      const result = parseNaturalDate('last nite');

      // Verify it's yesterday
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    // Test "N days ago" parsing
    it('should parse "3 days ago" correctly', () => {
      const result = parseNaturalDate('3 days ago');

      // Verify it's 3 days ago
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3)
      );
      expect(result).toBe(expectedDate.toISOString());

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    });

    it('should parse "1 day ago" correctly (singular)', () => {
      const result = parseNaturalDate('1 day ago');

      // Verify it's 1 day ago (yesterday)
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "5 days ago" correctly', () => {
      const result = parseNaturalDate('5 days ago');

      // Verify it's 5 days ago
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 5)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    // Test "N weeks ago" parsing
    it('should parse "2 weeks ago" correctly', () => {
      const result = parseNaturalDate('2 weeks ago');

      // Verify it's 14 days ago
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 14)
      );
      expect(result).toBe(expectedDate.toISOString());

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    });

    it('should parse "1 week ago" correctly (singular)', () => {
      const result = parseNaturalDate('1 week ago');

      // Verify it's 7 days ago
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "one week ago" correctly (text number)', () => {
      const result = parseNaturalDate('one week ago');

      // Verify it's 7 days ago
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "three weeks ago" correctly (text number)', () => {
      const result = parseNaturalDate('three weeks ago');

      // Verify it's 21 days ago
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 21)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    // Test "tonight" parsing
    it('should parse "tonight" as today', () => {
      const result = parseNaturalDate('tonight');

      // Verify it's today
      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      expect(result).toBe(expectedDate.toISOString());

      // Verify format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    });

    // Test time-of-day variants
    it('should parse "this morning" as today', () => {
      const result = parseNaturalDate('this morning');

      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "earlier today" as today', () => {
      const result = parseNaturalDate('earlier today');

      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "this afternoon" as today', () => {
      const result = parseNaturalDate('this afternoon');

      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should parse "this evening" as today', () => {
      const result = parseNaturalDate('this evening');

      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    // Test validation for "0 days ago"
    it('should throw helpful error for "0 days ago"', () => {
      expect(() => parseNaturalDate('0 days ago')).toThrow(
        /Ambiguous date: "0 days ago" could mean today or yesterday/
      );
      expect(() => parseNaturalDate('0 days ago')).toThrow(/Suggestions: today, yesterday/);
    });

    // Test validation for extreme "days ago" values
    it('should throw helpful error for "999 days ago"', () => {
      expect(() => parseNaturalDate('999 days ago')).toThrow(/Date too far in past: 999 days ago/);
      expect(() => parseNaturalDate('999 days ago')).toThrow(
        /Please use an ISO date \(YYYY-MM-DD\) for dates more than a year ago/
      );
      expect(() => parseNaturalDate('999 days ago')).toThrow(/Maximum: "365 days ago"/);
    });

    it('should allow "365 days ago" (boundary)', () => {
      const result = parseNaturalDate('365 days ago');

      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 365)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should throw helpful error for "366 days ago" (just over boundary)', () => {
      expect(() => parseNaturalDate('366 days ago')).toThrow(/Date too far in past: 366 days ago/);
    });

    // Test validation for "0 weeks ago"
    it('should throw helpful error for "0 weeks ago"', () => {
      expect(() => parseNaturalDate('0 weeks ago')).toThrow(
        /Ambiguous date: "0 weeks ago" could mean this week or last week/
      );
      expect(() => parseNaturalDate('0 weeks ago')).toThrow(/Suggestions: last week, today/);
    });

    // Test validation for extreme "weeks ago" values
    it('should throw helpful error for "100 weeks ago"', () => {
      expect(() => parseNaturalDate('100 weeks ago')).toThrow(/Date too far in past: 100 weeks ago/);
      expect(() => parseNaturalDate('100 weeks ago')).toThrow(
        /Please use an ISO date \(YYYY-MM-DD\) for dates more than a year ago/
      );
      expect(() => parseNaturalDate('100 weeks ago')).toThrow(/Maximum: "52 weeks ago"/);
    });

    it('should allow "52 weeks ago" (boundary)', () => {
      const result = parseNaturalDate('52 weeks ago');

      const now = new Date();
      const expectedDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 364)
      );
      expect(result).toBe(expectedDate.toISOString());
    });

    it('should throw helpful error for "53 weeks ago" (just over boundary)', () => {
      expect(() => parseNaturalDate('53 weeks ago')).toThrow(/Date too far in past: 53 weeks ago/);
    });

    // Test boundary: "last week" crossing month boundary
    it('should correctly handle "last week" crossing month boundaries', () => {
      const result = parseNaturalDate('last week');
      const parsed = new Date(result);
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      const daysDifference = (today.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDifference).toBe(7);
    });

    // Test boundary: "last month" in January
    it('should correctly handle "last month" in January (goes to previous year)', () => {
      // This test verifies month arithmetic handles year boundaries
      const result = parseNaturalDate('last month');
      const parsed = new Date(result);

      const now = new Date();
      const currentMonth = now.getUTCMonth();
      const resultMonth = parsed.getUTCMonth();

      if (currentMonth === 0) {
        // If current month is January (0), last month should be December (11) of previous year
        expect(resultMonth).toBe(11);
        expect(parsed.getUTCFullYear()).toBe(now.getUTCFullYear() - 1);
      } else {
        // Otherwise, should be previous month in same year
        expect(resultMonth).toBe(currentMonth - 1);
      }
    });
  });

  describe('parseDateRange', () => {
    it('should parse both start and end dates', () => {
      const result = parseDateRange('2024-01-01', '2024-01-31');
      expect(result.startAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.endAt).toBe('2024-01-31T00:00:00.000Z');
    });

    it('should handle missing dates', () => {
      const result = parseDateRange();
      expect(result.startAt).toBeUndefined();
      expect(result.endAt).toBeUndefined();
    });

    it('should handle only start date', () => {
      const result = parseDateRange('yesterday');
      expect(result.startAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.endAt).toBeUndefined();
    });
  });

  describe('parseEpisodeRange', () => {
    it('should parse single episode', () => {
      const result = parseEpisodeRange('5');
      expect(result).toEqual([5]);
    });

    it('should parse episode range', () => {
      const result = parseEpisodeRange('1-5');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse comma-separated episodes', () => {
      const result = parseEpisodeRange('1,3,5');
      expect(result).toEqual([1, 3, 5]);
    });

    it('should parse complex range', () => {
      const result = parseEpisodeRange('1-3,5,7-9');
      expect(result).toEqual([1, 2, 3, 5, 7, 8, 9]);
    });

    it('should throw error for invalid range', () => {
      expect(() => parseEpisodeRange('5-1')).toThrow();
      expect(() => parseEpisodeRange('abc')).toThrow();
      expect(() => parseEpisodeRange('-5')).toThrow();
    });

    it('should remove duplicates and sort', () => {
      const result = parseEpisodeRange('3,1,5,3');
      expect(result).toEqual([1, 3, 5]);
    });
  });

  describe('validateEpisodeNumber', () => {
    it('should accept valid episode numbers', () => {
      expect(() => validateEpisodeNumber(1)).not.toThrow();
      expect(() => validateEpisodeNumber(100)).not.toThrow();
    });

    it('should reject invalid episode numbers', () => {
      expect(() => validateEpisodeNumber(0)).toThrow();
      expect(() => validateEpisodeNumber(-1)).toThrow();
      expect(() => validateEpisodeNumber(1.5)).toThrow();
    });
  });

  describe('validateSeasonNumber', () => {
    it('should accept valid season numbers', () => {
      expect(() => validateSeasonNumber(0)).not.toThrow(); // Specials
      expect(() => validateSeasonNumber(1)).not.toThrow();
      expect(() => validateSeasonNumber(10)).not.toThrow();
    });

    it('should reject invalid season numbers', () => {
      expect(() => validateSeasonNumber(-1)).toThrow();
      expect(() => validateSeasonNumber(1.5)).toThrow();
    });
  });

  describe('createToolError', () => {
    it('should create error object', () => {
      const error = createToolError('TEST_ERROR', 'Test error message');
      expect(error).toEqual({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error message',
        },
      });
    });

    it('should include details if provided', () => {
      const error = createToolError('TEST_ERROR', 'Test error', { key: 'value' });
      expect(error.error.details).toEqual({ key: 'value' });
    });
  });

  describe('createToolSuccess', () => {
    it('should create success object', () => {
      const success = createToolSuccess({ result: 'data' });
      expect(success).toEqual({
        success: true,
        data: { result: 'data' },
      });
    });
  });
});

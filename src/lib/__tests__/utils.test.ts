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

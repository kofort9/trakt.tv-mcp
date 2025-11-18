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
    it('should parse "today"', () => {
      const result = parseNaturalDate('today');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should parse "yesterday"', () => {
      const result = parseNaturalDate('yesterday');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should parse "last week"', () => {
      const result = parseNaturalDate('last week');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should parse "last month"', () => {
      const result = parseNaturalDate('last month');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should parse ISO date', () => {
      const result = parseNaturalDate('2024-01-15');
      expect(result).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should throw error for invalid date', () => {
      expect(() => parseNaturalDate('invalid date')).toThrow();
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

import { describe, it, expect } from 'vitest';
import {
  parseEpisodeRange,
  validateEpisodeNumber,
  validateSeasonNumber,
  createToolError,
  createToolSuccess,
  validateISO8601Date,
  validateNonEmptyString,
} from '../utils.js';

describe('utils', () => {
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

  describe('validateNonEmptyString', () => {
    it('should accept valid non-empty strings', () => {
      expect(() => validateNonEmptyString('test', 'param')).not.toThrow();
      expect(() => validateNonEmptyString('  hello  ', 'param')).not.toThrow();
    });

    it('should reject empty strings', () => {
      expect(() => validateNonEmptyString('', 'param')).toThrow(
        'param parameter cannot be empty or whitespace'
      );
      expect(() => validateNonEmptyString('   ', 'param')).toThrow(
        'param parameter cannot be empty or whitespace'
      );
    });

    it('should reject undefined', () => {
      expect(() => validateNonEmptyString(undefined, 'param')).toThrow(
        'param parameter cannot be empty or whitespace'
      );
    });
  });

  describe('validateISO8601Date', () => {
    describe('valid formats', () => {
      it('should accept date-only format (YYYY-MM-DD)', () => {
        expect(() => validateISO8601Date('2025-12-08', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2024-01-01', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2023-06-15', 'watchedAt')).not.toThrow();
      });

      it('should accept full timestamp without milliseconds', () => {
        expect(() => validateISO8601Date('2025-12-08T20:30:00Z', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2024-01-01T00:00:00Z', 'watchedAt')).not.toThrow();
      });

      it('should accept full timestamp with milliseconds', () => {
        expect(() => validateISO8601Date('2025-12-08T20:30:00.000Z', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2024-01-01T12:34:56.789Z', 'watchedAt')).not.toThrow();
      });

      it('should accept timestamp without Z suffix', () => {
        expect(() => validateISO8601Date('2025-12-08T20:30:00', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2025-12-08T20:30:00.000', 'watchedAt')).not.toThrow();
      });
    });

    describe('optional parameter behavior', () => {
      it('should skip validation for undefined (optional parameter)', () => {
        expect(() => validateISO8601Date(undefined, 'watchedAt')).not.toThrow();
      });

      it('should skip validation for empty string', () => {
        expect(() => validateISO8601Date('', 'watchedAt')).not.toThrow();
      });
    });

    describe('invalid formats', () => {
      it('should reject natural language dates', () => {
        expect(() => validateISO8601Date('December 8, 2025', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
        expect(() => validateISO8601Date('today', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
        expect(() => validateISO8601Date('2025/12/08', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
      });

      it('should reject wrong separators', () => {
        expect(() => validateISO8601Date('2025/12/08', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
        expect(() => validateISO8601Date('2025.12.08', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
        expect(() => validateISO8601Date('20251208', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
      });

      it('should reject incomplete dates', () => {
        expect(() => validateISO8601Date('2025-12', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
        expect(() => validateISO8601Date('2025', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
      });

      it('should reject malformed timestamps', () => {
        expect(() => validateISO8601Date('2025-12-08T20:30', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
        expect(() => validateISO8601Date('2025-12-08T20', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
        expect(() => validateISO8601Date('2025-12-08 20:30:00', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
      });

      it('should include parameter name in error message', () => {
        expect(() => validateISO8601Date('invalid', 'watchedAt')).toThrow(
          'watchedAt must be in ISO 8601 format'
        );
        expect(() => validateISO8601Date('invalid', 'releasedAt')).toThrow(
          'releasedAt must be in ISO 8601 format'
        );
      });

      it('should include the invalid value in error message', () => {
        expect(() => validateISO8601Date('2025/12/08', 'watchedAt')).toThrow('"2025/12/08"');
      });
    });

    describe('edge cases', () => {
      it('should accept leap year dates', () => {
        expect(() => validateISO8601Date('2024-02-29', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2020-02-29', 'watchedAt')).not.toThrow();
      });

      it('should accept dates that JavaScript auto-corrects', () => {
        // Note: JavaScript Date is lenient and auto-corrects invalid dates
        // 2023-02-29 becomes 2023-03-01, 2025-04-31 becomes 2025-05-01
        // The validation function checks format and parseability, not logical correctness
        expect(() => validateISO8601Date('2023-02-29', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2025-02-29', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2025-04-31', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2025-06-31', 'watchedAt')).not.toThrow();
      });

      it('should reject truly invalid dates that cannot be parsed', () => {
        // These produce Invalid Date in JavaScript
        expect(() => validateISO8601Date('2025-13-01', 'watchedAt')).toThrow(/is not a valid date/);
        expect(() => validateISO8601Date('invalid-date', 'watchedAt')).toThrow(
          /must be in ISO 8601 format/
        );
      });

      it('should accept valid month boundaries', () => {
        expect(() => validateISO8601Date('2025-04-30', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2025-01-31', 'watchedAt')).not.toThrow();
        expect(() => validateISO8601Date('2025-12-31', 'watchedAt')).not.toThrow();
      });
    });
  });
});

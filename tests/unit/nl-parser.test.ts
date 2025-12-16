import { describe, it, expect } from 'vitest';
import { parseWatchNote, ParsedWatchEntry } from '../../src/shared/nl-parser.js';

describe('parseWatchNote', () => {
  const testCapturedAt = '2025-12-16T10:00:00.000Z';

  describe('Temporal Modifiers', () => {
    it('should detect "just watched" and use capturedAt', () => {
      const result = parseWatchNote('just watched Dune', testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just');
      expect(result.watchedAt).toBe(testCapturedAt);
      expect(result.isRecallPattern).toBe(false);
      expect(result.title).toBe('Dune');
    });

    it('should detect "just finished" and use capturedAt', () => {
      const result = parseWatchNote('just finished The Bear', testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just finished');
      expect(result.watchedAt).toBe(testCapturedAt);
      expect(result.isRecallPattern).toBe(false);
    });

    it('should handle "I\'ve just watched" variant', () => {
      const result = parseWatchNote("I've just watched Inception", testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just');
      expect(result.watchedAt).toBe(testCapturedAt);
      expect(result.isRecallPattern).toBe(false);
      expect(result.title).toContain('Inception');
    });

    it('should handle "just now" variant', () => {
      const result = parseWatchNote('just now watched Dune', testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just now');
      expect(result.watchedAt).toBe(testCapturedAt);
    });
  });

  describe('Recall Patterns', () => {
    it('should detect "I\'ve seen" as recall pattern', () => {
      const result = parseWatchNote("I've seen Dune", testCapturedAt);
      
      expect(result.isRecallPattern).toBe(true);
      expect(result.dateSource).toBe('fallback');
      expect(result.watchedAt).toBe(testCapturedAt);
      expect(result.title).toContain('Dune');
    });

    it('should detect "seen" without temporal modifier', () => {
      const result = parseWatchNote('seen Inception 2010', testCapturedAt);
      
      expect(result.isRecallPattern).toBe(true);
      expect(result.dateSource).toBe('fallback');
      expect(result.year).toBe(2010);
    });

    it('should detect "I\'ve watched" as recall pattern', () => {
      const result = parseWatchNote("I've watched The Matrix", testCapturedAt);
      
      expect(result.isRecallPattern).toBe(true);
      expect(result.dateSource).toBe('fallback');
    });

    it('should NOT flag "just watched" as recall', () => {
      const result = parseWatchNote('just watched Dune', testCapturedAt);
      
      expect(result.isRecallPattern).toBe(false);
      expect(result.dateSource).toBe('parsed');
    });

    it('should set isRecallPattern flag correctly for "I have seen"', () => {
      const result = parseWatchNote('I have seen The Godfather', testCapturedAt);
      
      expect(result.isRecallPattern).toBe(true);
      expect(result.dateSource).toBe('fallback');
    });
  });

  describe('Date Expressions', () => {
    it('should parse "yesterday"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('watched Dune yesterday', captured.toISOString());
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('yesterday');
      expect(result.watchedAt).toBe('2025-12-15');
    });

    it('should parse "last night"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('watched Dune last night', captured.toISOString());
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('last night');
      expect(result.watchedAt).toBe('2025-12-15');
    });

    it('should parse "2 days ago"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('watched Dune 2 days ago', captured.toISOString());
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('2 days ago');
      expect(result.watchedAt).toBe('2025-12-14');
    });

    it('should parse "last Monday"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z'); // Tuesday
      const result = parseWatchNote('watched Dune last Monday', captured.toISOString());
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('last Monday');
      // Should be the previous Monday
      expect(result.watchedAt).toBeTruthy();
    });

    it('should parse "today"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('watched Dune today', captured.toISOString());
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('today');
      expect(result.watchedAt).toBe('2025-12-16');
    });

    it('should prefer explicit dates over capturedAt', () => {
      const result = parseWatchNote('watched Dune yesterday', testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.watchedAt).not.toBe(testCapturedAt);
    });

    it('should parse "3 weeks ago"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('watched Dune 3 weeks ago', captured.toISOString());
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('3 weeks ago');
      // 3 weeks = 21 days
      expect(result.watchedAt).toBeTruthy();
    });
  });

  describe('Episode Patterns', () => {
    it('should parse S2E5 format', () => {
      const result = parseWatchNote('watched The Bear S2E5', testCapturedAt);
      
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
      expect(result.type).toBe('episode');
      expect(result.confidence).toBe('high');
      expect(result.title).toContain('The Bear');
    });

    it('should parse 2x05 format', () => {
      const result = parseWatchNote('watched The Bear 2x05', testCapturedAt);
      
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
      expect(result.type).toBe('episode');
    });

    it('should parse "season 2 episode 5"', () => {
      const result = parseWatchNote('watched The Bear season 2 episode 5', testCapturedAt);
      
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
      expect(result.type).toBe('episode');
    });

    it('should parse lowercase s2e5', () => {
      const result = parseWatchNote('watched the bear s2e5', testCapturedAt);
      
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });

    it('should parse S02E05 with leading zeros', () => {
      const result = parseWatchNote('watched The Bear S02E05', testCapturedAt);
      
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });
  });

  describe('Year Extraction', () => {
    it('should extract year in parentheses (2021)', () => {
      const result = parseWatchNote('watched Dune (2021)', testCapturedAt);
      
      expect(result.year).toBe(2021);
      expect(result.title).toContain('Dune');
    });

    it('should extract standalone year 2021', () => {
      const result = parseWatchNote('watched Dune 2021', testCapturedAt);
      
      expect(result.year).toBe(2021);
    });

    it('should validate reasonable year range', () => {
      const resultOld = parseWatchNote('watched movie 1899', testCapturedAt);
      expect(resultOld.year).toBeUndefined();
      
      const resultValid = parseWatchNote('watched movie 1950', testCapturedAt);
      expect(resultValid.year).toBe(1950);
      
      const resultFuture = parseWatchNote('watched movie 2150', testCapturedAt);
      expect(resultFuture.year).toBeUndefined();
    });

    it('should handle year with parentheses and season', () => {
      const result = parseWatchNote('watched The Bear (2022) S1E1', testCapturedAt);
      
      expect(result.year).toBe(2022);
      expect(result.season).toBe(1);
      expect(result.episode).toBe(1);
    });
  });

  describe('Type Detection', () => {
    it('should detect movie type from "movie" keyword', () => {
      const result = parseWatchNote('watched Dune movie', testCapturedAt);
      
      expect(result.type).toBe('movie');
      expect(result.confidence).toBe('high');
    });

    it('should detect movie type from "film" keyword', () => {
      const result = parseWatchNote('watched Dune film', testCapturedAt);
      
      expect(result.type).toBe('movie');
    });

    it('should detect episode type from S2E5', () => {
      const result = parseWatchNote('watched something S2E5', testCapturedAt);
      
      expect(result.type).toBe('episode');
      expect(result.confidence).toBe('high');
    });

    it('should detect episode type from "episode" keyword', () => {
      const result = parseWatchNote('watched The Bear episode', testCapturedAt);
      
      expect(result.type).toBe('episode');
    });

    it('should set confidence based on extracted info - high for movie with year', () => {
      const result = parseWatchNote('watched Dune 2021 movie', testCapturedAt);
      
      expect(result.confidence).toBe('high');
    });

    it('should set confidence based on extracted info - high for episode with season', () => {
      const result = parseWatchNote('watched The Bear S2E5', testCapturedAt);
      
      expect(result.confidence).toBe('high');
    });

    it('should default to unknown type when no hints', () => {
      const result = parseWatchNote('watched something', testCapturedAt);
      
      expect(result.type).toBe('unknown');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = parseWatchNote('', testCapturedAt);
      
      expect(result.title).toBe('');
      expect(result.confidence).toBe('low');
    });

    it('should handle text with no clear title', () => {
      const result = parseWatchNote('watched yesterday', testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.title).toBeTruthy(); // Should have something left
    });

    it('should handle multiple date expressions - use first', () => {
      const result = parseWatchNote('watched Dune yesterday today', testCapturedAt);
      
      expect(result.dateExpression).toBe('yesterday');
    });

    it('should handle conflicting type hints - prefer episode marker', () => {
      const result = parseWatchNote('watched movie S2E5', testCapturedAt);
      
      expect(result.type).toBe('episode');
      expect(result.confidence).toBe('high');
    });

    it('should handle very long titles', () => {
      const longTitle = 'The Lord of the Rings: The Fellowship of the Ring Extended Edition';
      const result = parseWatchNote(`watched ${longTitle}`, testCapturedAt);
      
      expect(result.title).toBeTruthy();
    });

    it('should handle special characters in title', () => {
      const result = parseWatchNote('watched O\'Brother Where Art Thou?', testCapturedAt);
      
      expect(result.title).toBeTruthy();
    });

    it('should handle mixed case', () => {
      const result = parseWatchNote('WATCHED DUNE Yesterday', testCapturedAt);
      
      expect(result.title).toBeTruthy();
      expect(result.dateSource).toBe('parsed');
    });

    it('should handle no action verb', () => {
      const result = parseWatchNote('Dune 2021', testCapturedAt);
      
      expect(result.title).toContain('Dune');
      expect(result.year).toBe(2021);
    });

    it('should handle temporal modifier without "watched"', () => {
      const result = parseWatchNote('just Dune', testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just');
    });
  });

  describe('Complete Scenarios', () => {
    it('should parse: "just watched Dune"', () => {
      const result = parseWatchNote('just watched Dune', testCapturedAt);
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just');
      expect(result.isRecallPattern).toBe(false);
      expect(result.title).toBe('Dune');
    });

    it('should parse: "I\'ve seen Dune"', () => {
      const result = parseWatchNote("I've seen Dune", testCapturedAt);
      
      expect(result.isRecallPattern).toBe(true);
      expect(result.dateSource).toBe('fallback');
      expect(result.title).toContain('Dune');
    });

    it('should parse: "watched Dune yesterday"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('watched Dune yesterday', captured.toISOString());
      
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('yesterday');
      expect(result.watchedAt).toBe('2025-12-15');
    });

    it('should parse: "Dune 2021 S1E3"', () => {
      const result = parseWatchNote('Dune 2021 S1E3', testCapturedAt);
      
      expect(result.year).toBe(2021);
      expect(result.season).toBe(1);
      expect(result.episode).toBe(3);
      expect(result.type).toBe('episode');
      expect(result.confidence).toBe('high');
    });

    it('should parse: "watched The Bear S2E5 yesterday"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('watched The Bear S2E5 yesterday', captured.toISOString());
      
      expect(result.title).toContain('The Bear');
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
      expect(result.dateSource).toBe('parsed');
      expect(result.watchedAt).toBe('2025-12-15');
    });

    it('should parse: "just finished Inception (2010) movie last night"', () => {
      const captured = new Date('2025-12-16T10:00:00.000Z');
      const result = parseWatchNote('just finished Inception (2010) movie last night', captured.toISOString());
      
      // Temporal modifier takes precedence
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just finished');
      expect(result.year).toBe(2010);
      expect(result.type).toBe('movie');
    });
  });
});

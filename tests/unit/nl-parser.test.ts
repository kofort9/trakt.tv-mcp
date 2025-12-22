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
      // Year 1899 is outside valid range (1900-2100), should not be extracted
      const resultOld = parseWatchNote('watched Casablanca 1899', testCapturedAt);
      expect(resultOld.year).toBeUndefined();
      expect(resultOld.title).toContain('Casablanca');

      // Year 1950 is valid, should be extracted
      const resultValid = parseWatchNote('watched Casablanca 1950', testCapturedAt);
      expect(resultValid.year).toBe(1950);
      expect(resultValid.title).toBe('Casablanca');

      // Year 2150 is outside valid range, should not be extracted
      const resultFuture = parseWatchNote('watched Casablanca 2150', testCapturedAt);
      expect(resultFuture.year).toBeUndefined();
      expect(resultFuture.title).toContain('Casablanca');
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

    it('should default to infer_from_search type when no hints', () => {
      const result = parseWatchNote('watched something', testCapturedAt);

      // 'infer_from_search' means "let the search API determine the type"
      expect(result.type).toBe('infer_from_search');
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
      expect(result.confidence).toBe('low'); // Low confidence without title
    });

    it('should handle multiple date expressions - use first', () => {
      const result = parseWatchNote('watched Dune yesterday today', testCapturedAt);

      expect(result.dateExpression).toBe('yesterday');
    });

    it('should handle conflicting type hints - prefer episode marker', () => {
      const result = parseWatchNote('watched movie S2E5', testCapturedAt);

      expect(result.type).toBe('episode');
      // Confidence might be low without a clear title
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });

    it('should handle very long titles', () => {
      const longTitle = 'The Lord of the Rings: The Fellowship of the Ring Extended Edition';
      const result = parseWatchNote(`watched ${longTitle}`, testCapturedAt);

      expect(result.title).toBeTruthy();
    });

    it('should handle special characters in title', () => {
      const result = parseWatchNote("watched O'Brother Where Art Thou?", testCapturedAt);

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

  describe('Title Cleanup', () => {
    it('should preserve titles starting with "I" that are real titles (I Am Legend)', () => {
      const result = parseWatchNote('watched I Am Legend', testCapturedAt);

      expect(result.title).toBe('I Am Legend');
    });

    it('should preserve "I, Robot" title', () => {
      const result = parseWatchNote('watched I, Robot', testCapturedAt);

      expect(result.title).toBe('I, Robot');
    });

    it('should preserve "I Know What You Did Last Summer"', () => {
      const result = parseWatchNote('watched I Know What You Did Last Summer', testCapturedAt);

      expect(result.title).toBe('I Know What You Did Last Summer');
    });

    it('should remove artifact "I" from "I just finished X"', () => {
      const result = parseWatchNote('I just finished Chungking Express', testCapturedAt);

      // The "I" at the start should be removed (it's an artifact, not part of the title)
      expect(result.title).toBe('Chungking Express');
    });

    it('should keep year as title when it IS the movie title (2046)', () => {
      const result = parseWatchNote('I just finished 2046', testCapturedAt);

      // "2046" is the movie title, not a year
      expect(result.title).toBe('2046');
      expect(result.year).toBeUndefined();
    });

    it('should extract year when there is a meaningful title left', () => {
      const result = parseWatchNote('watched columbus 2017', testCapturedAt);

      expect(result.title).toBe('columbus');
      expect(result.year).toBe(2017);
    });

    it('should remove "all the" prefix from franchise patterns', () => {
      const result = parseWatchNote("I've seen all the matrix movies", testCapturedAt);

      expect(result.title).toBe('matrix movies');
    });

    it('should remove "all of the" prefix', () => {
      // Note: Typo/fuzzy matching tests tracked in TECHNICAL_DEBT.md
      const result = parseWatchNote(
        "I've seen all of the pirates of the caribbean movies",
        testCapturedAt
      );

      expect(result.title).toBe('pirates of the caribbean movies');
    });

    it('should remove trailing "before"', () => {
      const result = parseWatchNote("I've seen titanic before", testCapturedAt);

      expect(result.title).toBe('titanic');
    });

    it('should clean up multiple spaces', () => {
      const result = parseWatchNote('I   watched   Dune', testCapturedAt);

      expect(result.title).toBe('Dune');
      expect(result.title).not.toContain('  ');
    });
  });

  describe('Rating Patterns', () => {
    it('should extract "8/10" format', () => {
      const result = parseWatchNote('watched Dune 8/10', testCapturedAt);

      expect(result.rating).toBe(8);
      expect(result.ratingSource).toBe('parsed');
      expect(result.ratingExpression).toBe('8/10');
      expect(result.title).toContain('Dune');
    });

    it('should extract "7 out of 10" format', () => {
      const result = parseWatchNote('watched Dune 7 out of 10', testCapturedAt);

      expect(result.rating).toBe(7);
      expect(result.ratingSource).toBe('parsed');
      expect(result.ratingExpression).toBe('7 out of 10');
    });

    it('should convert "4 stars" to 8/10', () => {
      const result = parseWatchNote('watched Dune 4 stars', testCapturedAt);

      expect(result.rating).toBe(8); // 4 stars * 2 = 8
      expect(result.ratingSource).toBe('parsed');
      expect(result.ratingExpression).toBe('4 stars');
    });

    it('should convert "3 star" to 6/10', () => {
      const result = parseWatchNote('watched Dune 3 star', testCapturedAt);

      expect(result.rating).toBe(6); // 3 stars * 2 = 6
      expect(result.ratingSource).toBe('parsed');
    });

    it('should convert "5 stars" to 10/10', () => {
      const result = parseWatchNote('watched Dune 5 stars', testCapturedAt);

      expect(result.rating).toBe(10); // 5 stars * 2 = 10
      expect(result.ratingSource).toBe('parsed');
    });

    it('should extract "rated 9" format', () => {
      const result = parseWatchNote('watched Dune, rated 9', testCapturedAt);

      expect(result.rating).toBe(9);
      expect(result.ratingSource).toBe('parsed');
    });

    it('should extract "gave it a 7" format', () => {
      const result = parseWatchNote('watched Dune, gave it a 7', testCapturedAt);

      expect(result.rating).toBe(7);
      expect(result.ratingSource).toBe('parsed');
    });

    it('should extract "loved it" as 10', () => {
      const result = parseWatchNote('watched Dune loved it', testCapturedAt);

      expect(result.rating).toBe(10);
      expect(result.ratingSource).toBe('parsed');
      expect(result.ratingExpression).toContain('loved');
    });

    it('should extract "hated it" as 1', () => {
      const result = parseWatchNote('watched Dune hated it', testCapturedAt);

      expect(result.rating).toBe(1);
      expect(result.ratingSource).toBe('parsed');
    });

    it('should extract "really good" as 9', () => {
      const result = parseWatchNote('watched Dune, really good', testCapturedAt);

      expect(result.rating).toBe(9);
      expect(result.ratingSource).toBe('parsed');
    });

    it('should extract rating with episode info', () => {
      const result = parseWatchNote('watched The Bear S2E5 8/10', testCapturedAt);

      expect(result.rating).toBe(8);
      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
      expect(result.type).toBe('episode');
    });

    it('should extract rating with year', () => {
      const result = parseWatchNote('watched Dune (2021) 9/10', testCapturedAt);

      expect(result.rating).toBe(9);
      expect(result.year).toBe(2021);
    });

    it('should not extract invalid rating 11/10', () => {
      const result = parseWatchNote('watched Dune 11/10', testCapturedAt);

      // 11 is outside 1-10 range, should not be extracted
      expect(result.rating).toBeUndefined();
      expect(result.ratingSource).toBe('none');
    });

    it('should not extract rating 0/10', () => {
      const result = parseWatchNote('watched Dune 0/10', testCapturedAt);

      // 0 is outside 1-10 range, should not be extracted
      expect(result.rating).toBeUndefined();
      expect(result.ratingSource).toBe('none');
    });

    it('should set ratingSource to none when no rating found', () => {
      const result = parseWatchNote('watched Dune yesterday', testCapturedAt);

      expect(result.rating).toBeUndefined();
      expect(result.ratingSource).toBe('none');
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
      const result = parseWatchNote(
        'just finished Inception (2010) movie last night',
        captured.toISOString()
      );

      // Temporal modifier takes precedence
      expect(result.dateSource).toBe('parsed');
      expect(result.dateExpression).toBe('just finished');
      expect(result.year).toBe(2010);
      expect(result.type).toBe('movie');
    });
  });
});

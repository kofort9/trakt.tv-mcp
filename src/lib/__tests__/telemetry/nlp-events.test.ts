/**
 * Tests for NLP Event Tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  trackSearchAmbiguity,
  trackFuzzyMatch,
  trackDisambiguation,
  trackQueryComplexity,
  trackSearchQuality,
} from '../../telemetry/nlp-events.js';
import { initTelemetry, shutdownTelemetry } from '../../telemetry/config.js';

describe('NLP Event Tracking', () => {
  beforeEach(() => {
    process.env.HONEYCOMB_API_KEY = 'test-key';
    initTelemetry();
  });

  afterEach(async () => {
    await shutdownTelemetry();
    delete process.env.HONEYCOMB_API_KEY;
  });

  describe('trackSearchAmbiguity', () => {
    it('should track search with no results', () => {
      expect(() => {
        trackSearchAmbiguity('unknown show', 0, false, 'none');
      }).not.toThrow();
    });

    it('should track search with single result', () => {
      expect(() => {
        trackSearchAmbiguity('Breaking Bad', 1, false, 'exact');
      }).not.toThrow();
    });

    it('should track search requiring clarification', () => {
      expect(() => {
        trackSearchAmbiguity('The Office', 2, true, 'exact', {
          'search.type': 'show',
        });
      }).not.toThrow();
    });

    it('should categorize ambiguity levels correctly', () => {
      // Low ambiguity (1 result)
      trackSearchAmbiguity('Breaking Bad', 1, false, 'exact');

      // Medium ambiguity (2-5 results)
      trackSearchAmbiguity('Office', 3, true, 'partial');

      // High ambiguity (6+ results)
      trackSearchAmbiguity('Star', 10, true, 'partial');
    });

    it('should work when telemetry is disabled', () => {
      shutdownTelemetry();
      expect(() => {
        trackSearchAmbiguity('test', 1, false, 'exact');
      }).not.toThrow();
    });
  });

  describe('trackFuzzyMatch', () => {
    it('should track high confidence fuzzy match', () => {
      expect(() => {
        trackFuzzyMatch('Breaking Badd', 'Breaking Bad', 0.95);
      }).not.toThrow();
    });

    it('should track low confidence fuzzy match', () => {
      expect(() => {
        trackFuzzyMatch('Braking', 'Breaking Bad', 0.6);
      }).not.toThrow();
    });

    it('should categorize confidence levels', () => {
      // Very low confidence
      trackFuzzyMatch('query1', 'result1', 0.4);

      // Low confidence
      trackFuzzyMatch('query2', 'result2', 0.6);

      // Medium confidence
      trackFuzzyMatch('query3', 'result3', 0.8);

      // High confidence
      trackFuzzyMatch('query4', 'result4', 0.95);
    });

    it('should include custom attributes', () => {
      expect(() => {
        trackFuzzyMatch('test', 'test result', 0.8, {
          'match.algorithm': 'levenshtein',
        });
      }).not.toThrow();
    });
  });

  describe('trackDisambiguation', () => {
    it('should track successful year-based disambiguation', () => {
      expect(() => {
        trackDisambiguation('The Office', 'The Office (US)', 2, 'year_filter', {
          'disambiguation.year': 2005,
        });
      }).not.toThrow();
    });

    it('should track ID-based disambiguation', () => {
      expect(() => {
        trackDisambiguation('Show Name', 'Show Name (2020)', 3, 'trakt_id');
      }).not.toThrow();
    });

    it('should track failed disambiguation', () => {
      expect(() => {
        trackDisambiguation('Ambiguous', 'Unknown', 5, 'none');
      }).not.toThrow();
    });

    it('should mark disambiguation success based on method', () => {
      // Successful methods
      trackDisambiguation('test', 'result', 2, 'year_filter');
      trackDisambiguation('test', 'result', 2, 'trakt_id');
      trackDisambiguation('test', 'result', 2, 'user_choice');

      // Failed method
      trackDisambiguation('test', 'result', 2, 'none');
    });
  });

  describe('trackQueryComplexity', () => {
    it('should track simple query', () => {
      expect(() => {
        trackQueryComplexity('Friends');
      }).not.toThrow();
    });

    it('should track complex query with year', () => {
      expect(() => {
        trackQueryComplexity('Star Wars Episode IV: A New Hope (1977)');
      }).not.toThrow();
    });

    it('should detect query characteristics', () => {
      // Has year
      trackQueryComplexity('The Matrix (1999)');

      // Has special chars
      trackQueryComplexity('The IT Crowd');

      // Has parentheses
      trackQueryComplexity('Show Name (US)');

      // Long query
      trackQueryComplexity('a'.repeat(60));
    });

    it('should categorize complexity levels', () => {
      // Simple
      trackQueryComplexity('Friends');

      // Moderate
      trackQueryComplexity('The Office (US)');

      // Complex
      trackQueryComplexity('Star Wars: Episode IV - A New Hope (1977) Special Edition');
    });

    it('should include custom attributes', () => {
      expect(() => {
        trackQueryComplexity('test query', {
          'tool.name': 'search_show',
        });
      }).not.toThrow();
    });
  });

  describe('trackSearchQuality', () => {
    it('should track no results scenario', () => {
      expect(() => {
        trackSearchQuality('unknown', 0, 0, 0);
      }).not.toThrow();
    });

    it('should track excellent search quality', () => {
      expect(() => {
        trackSearchQuality('Breaking Bad', 1, 0.95, 0.95);
      }).not.toThrow();
    });

    it('should track good search quality with clear winner', () => {
      expect(() => {
        trackSearchQuality('Office', 5, 0.9, 0.6);
      }).not.toThrow();
    });

    it('should track too many results scenario', () => {
      expect(() => {
        trackSearchQuality('star', 50, 0.7, 0.5);
      }).not.toThrow();
    });

    it('should calculate score variance', () => {
      // High variance (clear winner)
      trackSearchQuality('test1', 5, 0.9, 0.5);

      // Low variance (similar results)
      trackSearchQuality('test2', 5, 0.75, 0.7);
    });

    it('should categorize search quality', () => {
      // no_results
      trackSearchQuality('q1', 0, 0, 0);

      // excellent (single high-quality match)
      trackSearchQuality('q2', 1, 0.95, 0.95);

      // good (clear winner)
      trackSearchQuality('q3', 5, 0.85, 0.6);

      // too_many_results
      trackSearchQuality('q4', 20, 0.7, 0.6);

      // fair
      trackSearchQuality('q5', 3, 0.6, 0.5);
    });
  });
});

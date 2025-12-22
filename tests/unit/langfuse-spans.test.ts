/**
 * Tests for internal Langfuse observability spans in syncLogwatchQueue
 *
 * These tests verify that the createChildSpan functionality works correctly
 * for internal tracing within tool operations.
 *
 * @see docs/test-plans/phase-0-test-plan.md Section 0.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LangfuseTracer } from '../../src/core/langfuse.js';

// Mock Langfuse to capture span creation
const mockSpanUpdate = vi.fn();
const mockSpanEnd = vi.fn();
const mockSpan = vi.fn().mockReturnValue({
  update: mockSpanUpdate,
  end: mockSpanEnd,
});

const mockTrace = {
  span: mockSpan,
  update: vi.fn(),
  end: vi.fn(),
};

describe('syncLogwatchQueue Observability', () => {
  let tracer: LangfuseTracer;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createChildSpan Method', () => {
    it('should return no-op functions when Langfuse is not configured', () => {
      // Create tracer without Langfuse (no keys)
      const noopTracer = new LangfuseTracer();

      const span = noopTracer.createChildSpan('test.span', { key: 'value' });

      // Should return callable functions that do nothing
      expect(span).toHaveProperty('end');
      expect(span).toHaveProperty('error');
      expect(typeof span.end).toBe('function');
      expect(typeof span.error).toBe('function');

      // Calling them should not throw
      expect(() => span.end({ result: 'success' })).not.toThrow();
      expect(() => span.error(new Error('test'))).not.toThrow();
    });

    it('should create span with input metadata', () => {
      // Create a tracer with mocked Langfuse
      const tracerWithMocks = new LangfuseTracer();

      // Access private langfuse property and mock it
      (tracerWithMocks as unknown as { langfuse: unknown }).langfuse = {
        span: mockSpan,
      };

      const input = {
        entryId: 'test-123',
        rawText: 'watched Dune 2021',
        parsedType: 'infer_from_search',
      };

      tracerWithMocks.createChildSpan('sync.process_entry', input);

      // Verify span was created with correct name and input
      expect(mockSpan).toHaveBeenCalledWith({
        name: 'sync.process_entry',
        input,
      });
    });

    it('should record duration in milliseconds on span.end()', async () => {
      const tracerWithMocks = new LangfuseTracer();
      (tracerWithMocks as unknown as { langfuse: unknown }).langfuse = {
        span: mockSpan,
      };

      const span = tracerWithMocks.createChildSpan('sync.search', {
        title: 'Dune',
      });

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 50));

      span.end({ resultCount: 1 }, { searchType: 'movie' });

      // Verify update was called with duration
      expect(mockSpanUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          output: { resultCount: 1 },
          metadata: expect.objectContaining({
            duration_ms: expect.any(Number),
            success: true,
            searchType: 'movie',
          }),
        })
      );

      // Duration should be at least 40ms (allowing tolerance for CI timer variance)
      const updateCall = mockSpanUpdate.mock.calls[0][0];
      expect(updateCall.metadata.duration_ms).toBeGreaterThanOrEqual(40);
    });

    it('should record error details on span.error()', () => {
      const tracerWithMocks = new LangfuseTracer();
      (tracerWithMocks as unknown as { langfuse: unknown }).langfuse = {
        span: mockSpan,
      };

      const span = tracerWithMocks.createChildSpan('sync.process_entry', {
        entryId: 'entry-456',
      });

      const testError = new Error('API rate limit exceeded');
      testError.name = 'RateLimitError';

      span.error(testError, { entryId: 'entry-456' });

      // Verify error was recorded correctly
      expect(mockSpanUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          output: { error: 'API rate limit exceeded' },
          metadata: expect.objectContaining({
            duration_ms: expect.any(Number),
            success: false,
            error_type: 'RateLimitError',
            entryId: 'entry-456',
          }),
          level: 'ERROR',
        })
      );

      expect(mockSpanEnd).toHaveBeenCalled();
    });

    it('should use active trace for child span when available', () => {
      const tracerWithMocks = new LangfuseTracer();

      // Mock both langfuse and getActiveTrace
      const mockActiveTrace = {
        span: vi.fn().mockReturnValue({
          update: vi.fn(),
          end: vi.fn(),
        }),
      };

      (tracerWithMocks as unknown as { langfuse: unknown }).langfuse = {
        span: mockSpan,
      };

      // Mock getActiveTrace to return a trace
      vi.spyOn(tracerWithMocks, 'getActiveTrace').mockReturnValue(
        mockActiveTrace as unknown as ReturnType<typeof tracerWithMocks.getActiveTrace>
      );

      tracerWithMocks.createChildSpan('sync.search', { title: 'Test' });

      // Should use activeTrace.span, not langfuse.span directly
      expect(mockActiveTrace.span).toHaveBeenCalledWith({
        name: 'sync.search',
        input: { title: 'Test' },
      });
    });
  });

  describe('Graceful Degradation', () => {
    it('should not throw when Langfuse is unavailable', () => {
      const noopTracer = new LangfuseTracer();

      // Multiple span operations should all succeed silently
      const span1 = noopTracer.createChildSpan('sync.process_entry', { id: 1 });
      const span2 = noopTracer.createChildSpan('sync.search', { title: 'Test' });

      // Nested operations
      expect(() => span1.end({ status: 'synced' })).not.toThrow();
      expect(() => span2.error(new Error('test'))).not.toThrow();
    });

    it('should have zero performance impact when Langfuse disabled', async () => {
      const noopTracer = new LangfuseTracer();

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const span = noopTracer.createChildSpan('sync.process_entry', {
          iteration: i,
          data: 'some metadata',
        });
        span.end({ status: 'synced' });
      }

      const elapsed = performance.now() - start;

      // 1000 no-op operations should complete in under 50ms
      // (typically under 5ms, but allowing margin for CI)
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Span Outcome Tracking', () => {
    it('should support all expected status values', () => {
      const noopTracer = new LangfuseTracer();

      // These are all the status values used in syncLogwatchQueue
      const statuses = [
        { status: 'skipped', reason: 'low_confidence' },
        { status: 'skipped', reason: 'no_results' },
        { status: 'skipped', reason: 'show_no_episode_info' },
        { status: 'skipped', reason: 'ambiguous', matchCount: 3 },
        { status: 'skipped', reason: 'duplicate' },
        { status: 'failed', reason: 'missing_content_data' },
        { status: 'failed', reason: 'could_not_determine_type' },
        { status: 'failed', reason: 'unknown_error' },
        { status: 'synced', resolvedType: 'movie', traktId: 12345 },
        { status: 'synced', resolvedType: 'episode', traktId: 67890 },
      ];

      // All should work without throwing
      for (const output of statuses) {
        const span = noopTracer.createChildSpan('sync.process_entry', {});
        expect(() => span.end(output)).not.toThrow();
      }
    });
  });
});

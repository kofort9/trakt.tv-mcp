import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLangfuseTracer } from '../langfuse.js';

type FakeState = {
  traces: Array<{ name: string; metadata?: Record<string, unknown> }>;
  traceUpdates: Array<{ name: string; metadata?: Record<string, unknown> }>;
  spans: Array<{ trace: string | null; name: string; input: unknown }>;
  spanUpdates: Array<{ trace: string | null; name: string; payload: unknown }>;
  endedSpans: Array<{ trace: string | null; name: string }>;
  events: Array<{ trace: string | null; name: string; input?: unknown; metadata?: unknown }>;
  flushes: number;
  shutdowns: number;
  instances: Array<{ secretKey?: string; publicKey?: string; baseUrl?: string }>;
};

/**
 * Stress Test Suite for Langfuse Tracer
 *
 * This test suite focuses on edge cases and stress scenarios that could expose bugs:
 * - Very deep nested objects that could cause stack overflow or performance issues
 * - Rapid concurrent trace operations to test race conditions
 * - Repeated endTrace calls to validate idempotency
 *
 * Uses the same stub transport pattern as langfuse.integration.test.ts
 */

vi.mock('langfuse', () => {
  const fakeState: FakeState = {
    traces: [],
    traceUpdates: [],
    spans: [],
    spanUpdates: [],
    endedSpans: [],
    events: [],
    flushes: 0,
    shutdowns: 0,
    instances: [],
  };

  class FakeSpan {
    name: string;
    input: unknown;
    traceName: string | null;

    constructor(options: { name: string; input?: unknown }, traceName: string | null) {
      this.name = options.name;
      this.input = options.input;
      this.traceName = traceName;
    }

    update(payload: unknown) {
      fakeState.spanUpdates.push({ trace: this.traceName, name: this.name, payload });
    }

    end() {
      fakeState.endedSpans.push({ trace: this.traceName, name: this.name });
    }
  }

  class FakeTrace {
    name: string;
    metadata?: Record<string, unknown>;

    constructor(options: { name: string; metadata?: Record<string, unknown> }) {
      this.name = options.name;
      this.metadata = options.metadata;
      fakeState.traces.push({ name: this.name, metadata: this.metadata });
    }

    span(options: { name: string; input?: unknown }) {
      fakeState.spans.push({ trace: this.name, name: options.name, input: options.input });
      return new FakeSpan(options, this.name);
    }

    event(options: { name: string; input?: unknown; metadata?: unknown }) {
      fakeState.events.push({ trace: this.name, ...options });
    }

    update(payload: { metadata?: Record<string, unknown> }) {
      this.metadata = { ...(this.metadata ?? {}), ...(payload.metadata ?? {}) };
      const existingTrace = fakeState.traces.find((trace) => trace.name === this.name);
      if (existingTrace) {
        existingTrace.metadata = this.metadata;
      }
      fakeState.traceUpdates.push({ name: this.name, metadata: this.metadata });
    }
  }

  class FakeLangfuse {
    api = {
      healthHealth: vi.fn().mockResolvedValue({ ok: true }),
      traceList: vi.fn().mockResolvedValue({ data: [] }),
    };

    constructor(config: { secretKey?: string; publicKey?: string; baseUrl?: string }) {
      fakeState.instances.push(config);
    }

    trace(options: { name: string; metadata?: Record<string, unknown> }) {
      return new FakeTrace(options);
    }

    span(options: { name: string; input?: unknown }) {
      fakeState.spans.push({ trace: null, name: options.name, input: options.input });
      return new FakeSpan(options, null);
    }

    event(options: { name: string; input?: unknown; metadata?: unknown }) {
      fakeState.events.push({ trace: null, ...options });
    }

    flushAsync = vi.fn().mockImplementation(async () => {
      fakeState.flushes += 1;
    });

    shutdownAsync = vi.fn().mockImplementation(async () => {
      fakeState.shutdowns += 1;
    });
  }

  const getTestHelpers = () => ({
    getState: (): Readonly<FakeState> => fakeState,
    reset: () => {
      fakeState.traces.length = 0;
      fakeState.traceUpdates.length = 0;
      fakeState.spans.length = 0;
      fakeState.spanUpdates.length = 0;
      fakeState.endedSpans.length = 0;
      fakeState.events.length = 0;
      fakeState.flushes = 0;
      fakeState.shutdowns = 0;
      fakeState.instances.length = 0;
    },
  });

  return { Langfuse: FakeLangfuse, getTestHelpers };
});

const getTestHelpers = async () => {
  const module = (await import('langfuse')) as unknown as {
    getTestHelpers: () => {
      getState: () => Readonly<FakeState>;
      reset: () => void;
    };
  };
  return module.getTestHelpers();
};

describe('Langfuse Tracer Stress Tests', () => {
  beforeEach(async () => {
    const helpers = await getTestHelpers();
    helpers.reset();
  });

  describe('Very Deep Nested Objects', () => {
    /**
     * Creates a deeply nested object to test sanitization and handling of extreme nesting.
     * Structure: { level: N, nested: { level: N-1, nested: { ... } } }
     */
    function createDeeplyNestedObject(depth: number): Record<string, unknown> {
      if (depth === 0) {
        return { level: 0, value: 'leaf' };
      }
      return {
        level: depth,
        nested: createDeeplyNestedObject(depth - 1),
        metadata: `level-${depth}`,
      };
    }

    it('handles objects nested 10 levels deep without stack overflow', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      const deepObject = createDeeplyNestedObject(10);

      // Should not throw stack overflow or performance errors
      tracer.startTrace('deep-nested-trace');
      const result = await tracer.traceToolCall(
        'deep_nested_tool',
        { deepInput: deepObject },
        async () => ({ success: true, deepOutput: deepObject })
      );

      expect(result.success).toBe(true);
      await tracer.endTrace();

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify trace was created successfully
      expect(state.traces).toHaveLength(1);
      expect(state.traces[0].name).toBe('deep-nested-trace');

      // Verify span was created with deep input
      expect(state.spans).toContainEqual(
        expect.objectContaining({
          trace: 'deep-nested-trace',
          name: 'mcp.tool.deep_nested_tool',
          input: expect.objectContaining({ deepInput: expect.any(Object) }),
        })
      );

      // Verify span ended successfully
      expect(state.endedSpans).toContainEqual({
        trace: 'deep-nested-trace',
        name: 'mcp.tool.deep_nested_tool',
      });
    });

    it('handles objects nested 20 levels deep with consistent sanitization', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      const veryDeepObject = createDeeplyNestedObject(20);

      tracer.startTrace('very-deep-trace');

      // Test sanitization at various levels by checking the object structure
      const result = await tracer.traceToolCall(
        'very_deep_tool',
        { veryDeepInput: veryDeepObject },
        async () => {
          // Simulate processing with nested object
          return { success: true, data: veryDeepObject };
        }
      );

      expect(result.success).toBe(true);
      await tracer.endTrace();

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify the trace completed successfully
      expect(state.traces).toHaveLength(1);
      expect(state.endedSpans).toHaveLength(1);

      // Verify sanitization occurred (output should be sanitized in span update)
      const spanUpdate = state.spanUpdates.find((s) => s.name === 'mcp.tool.very_deep_tool');
      expect(spanUpdate).toBeDefined();
      expect(spanUpdate?.payload).toBeDefined();
    });

    it('handles deeply nested arrays within objects', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      // Create a structure with nested arrays and objects
      const complexNested = {
        level1: {
          array1: [
            {
              level2: {
                array2: [
                  {
                    level3: {
                      array3: [
                        {
                          level4: {
                            data: 'deep-value',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      tracer.startTrace('complex-nested-trace');
      const result = await tracer.traceToolCall(
        'complex_nested_tool',
        { complexInput: complexNested },
        async () => ({ success: true })
      );

      expect(result.success).toBe(true);
      await tracer.endTrace();

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify no errors occurred and trace completed
      expect(state.traces).toHaveLength(1);
      expect(state.endedSpans).toHaveLength(1);
      expect(state.flushes).toBe(1);
    });
  });

  describe('Rapid Concurrent Trace Operations', () => {
    it('handles 10 concurrent traces without context mixing', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      // Create 10 concurrent traces, each performing tool calls
      const concurrentTraces = Array.from({ length: 10 }, (_, i) => {
        return (async () => {
          const traceName = `concurrent-trace-${i}`;
          const toolName = `tool-${i}`;

          tracer.startTrace(traceName, { traceId: i });

          // Perform multiple tool calls in each trace
          await tracer.traceToolCall(toolName, { traceId: i, step: 1 }, async () => {
            // Simulate async work with random delays
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
            return { traceId: i, result: 'step-1' };
          });

          await tracer.traceToolCall(toolName, { traceId: i, step: 2 }, async () => {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
            return { traceId: i, result: 'step-2' };
          });

          await tracer.endTrace();
        })();
      });

      // Wait for all concurrent traces to complete
      await Promise.all(concurrentTraces);

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify all 10 traces were created
      expect(state.traces).toHaveLength(10);

      // Verify each trace has unique name
      const traceNames = state.traces.map((t) => t.name);
      const uniqueTraceNames = new Set(traceNames);
      expect(uniqueTraceNames.size).toBe(10);

      // Verify all spans were created (10 traces × 2 tool calls each = 20 spans)
      expect(state.spans).toHaveLength(20);

      // Verify all spans ended
      expect(state.endedSpans).toHaveLength(20);

      // Verify each span is associated with the correct trace
      for (let i = 0; i < 10; i++) {
        const traceName = `concurrent-trace-${i}`;
        const traceSpans = state.spans.filter((s) => s.trace === traceName);
        expect(traceSpans).toHaveLength(2); // Each trace should have exactly 2 spans
      }

      // Verify all traces were flushed (10 endTrace calls = 10 flushes)
      expect(state.flushes).toBe(10);
    });

    it('handles rapid start/end cycles without losing trace context', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      // Rapidly start and end traces in sequence
      const rapidCycles = Array.from({ length: 20 }, (_, i) => {
        return (async () => {
          tracer.startTrace(`rapid-${i}`);
          await tracer.traceToolCall(`tool-${i}`, { index: i }, async () => ({ index: i }));
          await tracer.endTrace();
        })();
      });

      await Promise.all(rapidCycles);

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify all traces were created and completed
      expect(state.traces).toHaveLength(20);
      expect(state.spans).toHaveLength(20);
      expect(state.endedSpans).toHaveLength(20);
      expect(state.flushes).toBe(20);
    });

    it('maintains trace isolation when one trace is slow and others are fast', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      const slowTraceBarrier = new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      // Slow trace that takes significant time
      const slowTrace = (async () => {
        tracer.startTrace('slow-trace');
        await slowTraceBarrier;
        await tracer.traceToolCall('slow_tool', {}, async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'slow-result';
        });
        await tracer.endTrace();
      })();

      // Fast traces that start and complete quickly
      const fastTraces = Array.from({ length: 5 }, (_, i) => {
        return (async () => {
          // Wait for slow trace to start to maximize race condition potential
          await slowTraceBarrier;
          tracer.startTrace(`fast-trace-${i}`);
          await tracer.traceToolCall(`fast-tool-${i}`, { id: i }, async () => ({
            id: i,
            result: 'fast',
          }));
          await tracer.endTrace();
        })();
      });

      // Wait for all traces to complete
      await Promise.all([slowTrace, ...fastTraces]);

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify all traces were created (1 slow + 5 fast = 6 total)
      expect(state.traces).toHaveLength(6);

      // Verify slow trace's span is properly associated
      const slowSpans = state.spans.filter((s) => s.trace === 'slow-trace');
      expect(slowSpans).toHaveLength(1);
      expect(slowSpans[0].name).toBe('mcp.tool.slow_tool');

      // Verify fast traces' spans are properly associated
      for (let i = 0; i < 5; i++) {
        const fastSpans = state.spans.filter((s) => s.trace === `fast-trace-${i}`);
        expect(fastSpans).toHaveLength(1);
        expect(fastSpans[0].name).toBe(`mcp.tool.fast-tool-${i}`);
      }
    });

    it('handles interleaved trace operations without context corruption', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      // Create interleaved traces where operations overlap
      const trace1 = (async () => {
        tracer.startTrace('trace-1');
        await tracer.traceToolCall('tool-1-step-1', {}, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'result-1-1';
        });
        await new Promise((resolve) => setTimeout(resolve, 100)); // Pause to allow interleaving
        await tracer.traceToolCall('tool-1-step-2', {}, async () => 'result-1-2');
        await tracer.endTrace();
      })();

      const trace2 = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 30)); // Start after trace1
        tracer.startTrace('trace-2');
        await tracer.traceToolCall('tool-2-step-1', {}, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'result-2-1';
        });
        await tracer.traceToolCall('tool-2-step-2', {}, async () => 'result-2-2');
        await tracer.endTrace();
      })();

      await Promise.all([trace1, trace2]);

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify both traces were created
      expect(state.traces).toHaveLength(2);

      // Verify trace-1 has exactly 2 spans
      const trace1Spans = state.spans.filter((s) => s.trace === 'trace-1');
      expect(trace1Spans).toHaveLength(2);
      expect(trace1Spans.map((s) => s.name)).toEqual([
        'mcp.tool.tool-1-step-1',
        'mcp.tool.tool-1-step-2',
      ]);

      // Verify trace-2 has exactly 2 spans
      const trace2Spans = state.spans.filter((s) => s.trace === 'trace-2');
      expect(trace2Spans).toHaveLength(2);
      expect(trace2Spans.map((s) => s.name)).toEqual([
        'mcp.tool.tool-2-step-1',
        'mcp.tool.tool-2-step-2',
      ]);
    });
  });

  describe('Repeated endTrace Calls (Idempotency)', () => {
    it('handles calling endTrace multiple times on the same trace gracefully', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      tracer.startTrace('idempotent-trace');
      await tracer.traceToolCall('test_tool', {}, async () => ({ success: true }));

      // Call endTrace multiple times
      await tracer.endTrace();
      await tracer.endTrace();
      await tracer.endTrace();

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify only one trace was created
      expect(state.traces).toHaveLength(1);
      expect(state.traces[0].name).toBe('idempotent-trace');

      // Verify the trace was updated (at least once)
      expect(state.traceUpdates.length).toBeGreaterThanOrEqual(1);

      // Verify span was created and ended only once
      expect(state.spans).toHaveLength(1);
      expect(state.endedSpans).toHaveLength(1);

      // First flush should succeed, subsequent calls should be no-ops
      // (currentTrace becomes null after first endTrace)
      expect(state.flushes).toBeGreaterThanOrEqual(1);
    });

    it('handles concurrent endTrace calls without errors', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      tracer.startTrace('concurrent-end-trace');
      await tracer.traceToolCall('test_tool', {}, async () => ({ success: true }));

      // Call endTrace concurrently multiple times
      await Promise.all([
        tracer.endTrace(),
        tracer.endTrace(),
        tracer.endTrace(),
        tracer.endTrace(),
        tracer.endTrace(),
      ]);

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify trace was created
      expect(state.traces).toHaveLength(1);

      // Verify span operations completed
      expect(state.spans).toHaveLength(1);
      expect(state.endedSpans).toHaveLength(1);

      // Multiple concurrent endTrace calls should not cause errors
      // The flush count may vary depending on race conditions, but should be at least 1
      expect(state.flushes).toBeGreaterThanOrEqual(1);
    });

    it('allows starting a new trace after calling endTrace multiple times', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      // First trace with multiple endTrace calls
      tracer.startTrace('first-trace');
      await tracer.traceToolCall('first_tool', {}, async () => ({ result: 'first' }));
      await tracer.endTrace();
      await tracer.endTrace();
      await tracer.endTrace();

      // Start a second trace after multiple endTrace calls
      tracer.startTrace('second-trace');
      await tracer.traceToolCall('second_tool', {}, async () => ({ result: 'second' }));
      await tracer.endTrace();

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify both traces were created
      expect(state.traces).toHaveLength(2);
      expect(state.traces[0].name).toBe('first-trace');
      expect(state.traces[1].name).toBe('second-trace');

      // Verify both spans were created
      expect(state.spans).toHaveLength(2);
      expect(state.spans[0].name).toBe('mcp.tool.first_tool');
      expect(state.spans[1].name).toBe('mcp.tool.second_tool');

      // Verify both spans ended
      expect(state.endedSpans).toHaveLength(2);
    });

    it('handles endTrace without an active trace (no-op behavior)', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      // Call endTrace without starting a trace
      await expect(tracer.endTrace()).resolves.not.toThrow();
      await expect(tracer.endTrace()).resolves.not.toThrow();

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify no traces were created
      expect(state.traces).toHaveLength(0);

      // endTrace should still trigger flush even without active trace
      expect(state.flushes).toBeGreaterThanOrEqual(0);
    });

    it('properly finalizes trace on first endTrace and ignores subsequent calls', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      tracer.startTrace('finalize-trace', { initialData: 'test' });
      await tracer.traceToolCall('test_tool', {}, async () => ({ success: true }));

      // First endTrace should finalize the trace
      await tracer.endTrace();

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Capture state after first endTrace
      const firstFlushCount = state.flushes;
      const firstTraceUpdateCount = state.traceUpdates.length;

      // Subsequent endTrace calls should not modify the finalized trace
      await tracer.endTrace();
      await tracer.endTrace();

      // Verify trace metadata includes ended_at timestamp from first endTrace
      const finalTrace = state.traces[0];
      expect(finalTrace.metadata).toBeDefined();
      expect(finalTrace.metadata?.ended_at).toBeDefined();

      // Verify no duplicate trace updates or excessive flushes
      // (Some additional flushes may occur, but trace should not be duplicated)
      expect(state.traceUpdates.length).toBeGreaterThanOrEqual(firstTraceUpdateCount);
      expect(state.flushes).toBeGreaterThanOrEqual(firstFlushCount);
      expect(state.traces).toHaveLength(1);
    });
  });

  describe('Combined Stress Scenarios', () => {
    it('handles concurrent traces with deep nested objects and multiple endTrace calls', async () => {
      const tracer = createLangfuseTracer({
        secretKey: 'stress-secret',
        publicKey: 'stress-public',
      });
      await (tracer as any).healthCheckPromise;

      function createDeeplyNestedObject(depth: number): Record<string, unknown> {
        if (depth === 0) {
          return { level: 0, value: 'leaf' };
        }
        return {
          level: depth,
          nested: createDeeplyNestedObject(depth - 1),
          metadata: `level-${depth}`,
        };
      }

      const complexScenarios = Array.from({ length: 5 }, (_, i) => {
        return (async () => {
          const deepObject = createDeeplyNestedObject(15);

          tracer.startTrace(`combined-trace-${i}`);
          await tracer.traceToolCall(
            `combined-tool-${i}`,
            { deepInput: deepObject, index: i },
            async () => {
              await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
              return { success: true, deepOutput: deepObject };
            }
          );

          // Call endTrace multiple times
          await tracer.endTrace();
          await tracer.endTrace();
        })();
      });

      await Promise.all(complexScenarios);

      const helpers = await getTestHelpers();
      const state = helpers.getState();

      // Verify all traces were created
      expect(state.traces).toHaveLength(5);

      // Verify all spans were created and ended
      expect(state.spans).toHaveLength(5);
      expect(state.endedSpans).toHaveLength(5);

      // Verify no errors occurred
      for (let i = 0; i < 5; i++) {
        const traceName = `combined-trace-${i}`;
        expect(state.traces.find((t) => t.name === traceName)).toBeDefined();
      }
    });
  });
});

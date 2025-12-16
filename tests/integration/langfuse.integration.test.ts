import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLangfuseTracer } from '../../src/core/langfuse.js';

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
 * Stub Transport Pattern for Langfuse Testing
 *
 * This test suite uses a "stub transport" pattern to test Langfuse integration without
 * making actual network calls. Here's how it works:
 *
 * 1. **Mock Factory**: We use vi.mock() to replace the entire 'langfuse' module with fake
 *    classes (FakeLangfuse, FakeTrace, FakeSpan) that implement the same API surface as
 *    the real Langfuse SDK.
 *
 * 2. **State Tracking**: All fake classes write to a shared `fakeState` object that tracks
 *    every operation (traces created, spans started/ended, flush calls, etc.). This gives
 *    us complete visibility into what the tracer is doing without network I/O.
 *
 * 3. **Test Helper Accessor**: Instead of exporting the internal state directly, we expose
 *    a `getTestHelpers()` function that provides controlled access to state inspection and
 *    reset functionality. This encapsulates the implementation details.
 *
 * 4. **Why This Pattern**: This approach allows us to:
 *    - Test tracer behavior in complete isolation (no network, no external dependencies)
 *    - Verify exact API call sequences and parameters
 *    - Test error scenarios and edge cases that are hard to reproduce with a real service
 *    - Run tests instantly without HTTP latency
 *    - Avoid test flakiness from network conditions or service availability
 *
 * The stub transport is ONLY used in tests. Production code uses the real Langfuse SDK
 * which makes actual HTTP requests to Langfuse servers.
 */

/**
 * Creates the Langfuse mock with stub transport.
 *
 * This factory must be defined inside vi.mock() to avoid Vitest hoisting issues.
 * The mock provides a complete fake implementation of Langfuse that captures all
 * operations in an in-memory state object for test assertions.
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

  /**
   * Test helper accessor for inspecting and resetting mock state.
   *
   * This function provides controlled access to the internal fake state without
   * exposing it directly. It returns both the current state (for assertions) and
   * a reset function (for cleanup between tests).
   */
  const getTestHelpers = () => ({
    /**
     * Read-only access to the current state for test assertions.
     */
    getState: (): Readonly<FakeState> => fakeState,

    /**
     * Resets all state to initial empty values between tests.
     */
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

/**
 * Accesses the test helpers exposed by the Langfuse mock.
 *
 * This function retrieves the test helpers via dynamic import, which is necessary
 * because the mock is defined with vi.mock() and its exports are only available
 * after the module is imported at runtime.
 *
 * @returns Promise resolving to test helpers for state inspection and reset
 */
const getTestHelpers = async () => {
  const module = (await import('langfuse')) as unknown as {
    getTestHelpers: () => {
      getState: () => Readonly<FakeState>;
      reset: () => void;
    };
  };
  return module.getTestHelpers();
};

describe('langfuse tracer integration (stub transport)', () => {
  beforeEach(async () => {
    const helpers = await getTestHelpers();
    helpers.reset();
    // Note: LANGFUSE_HEALTH_CHECK is intentionally NOT set here.
    // The stub transport doesn't require health checks, and we rely on the default
    // behavior (health check skipped in NODE_ENV === 'test') for faster test execution.
  });

  it('emits a trace, span, and flushes via the stub transport', async () => {
    const tracer = createLangfuseTracer({
      secretKey: 'stub-secret',
      publicKey: 'stub-public',
      baseUrl: 'https://stub.langfuse.local',
    });
    await (tracer as any).healthCheckPromise;
    const helpers = await getTestHelpers();
    const state = helpers.getState();

    expect(tracer.isEnabled()).toBe(true);
    expect(state.instances).toEqual([
      {
        secretKey: 'stub-secret',
        publicKey: 'stub-public',
        baseUrl: 'https://stub.langfuse.local',
      },
    ]);

    tracer.startTrace('session-langfuse', { userId: 'abc123' });
    const result = await tracer.traceToolCall(
      'search_show',
      { query: 'Princess Mononoke' },
      async () => ({ success: true, ids: ['1', '2'] })
    );
    expect(result).toEqual({ success: true, ids: ['1', '2'] });

    await tracer.endTrace();

    expect(state.traces).toEqual([
      expect.objectContaining({
        name: 'session-langfuse',
        metadata: expect.objectContaining({ userId: 'abc123', ended_at: expect.any(String) }),
      }),
    ]);

    expect(state.spans).toContainEqual({
      trace: 'session-langfuse',
      name: 'mcp.tool.search_show',
      input: { query: 'Princess Mononoke' },
    });
    expect(state.spanUpdates).toContainEqual(
      expect.objectContaining({
        trace: 'session-langfuse',
        name: 'mcp.tool.search_show',
        payload: expect.objectContaining({
          metadata: expect.objectContaining({ success: true }),
        }),
      })
    );
    expect(state.endedSpans).toContainEqual({
      trace: 'session-langfuse',
      name: 'mcp.tool.search_show',
    });
    expect(state.flushes).toBe(1);
    expect(tracer.getLastFlushDurationMs()).not.toBeNull();
  });

  it('keeps async trace context even if another context clears currentTrace', async () => {
    const tracer = createLangfuseTracer({
      secretKey: 'stub-secret',
      publicKey: 'stub-public',
    });
    await (tracer as any).healthCheckPromise;
    const helpers = await getTestHelpers();
    const state = helpers.getState();

    let fastDone: () => void = () => {};
    const fastFinished = new Promise<void>((resolve) => {
      fastDone = resolve;
    });

    const slowTrace = async () => {
      tracer.startTrace('slow-trace');
      await fastFinished; // ensure the other context ends and clears currentTrace
      await tracer.traceToolCall('slow_tool', {}, async () => 'slow-ok');
      await tracer.endTrace();
    };

    const fastTrace = async () => {
      tracer.startTrace('fast-trace');
      await tracer.traceToolCall('fast_tool', {}, async () => 'fast-ok');
      await tracer.endTrace(); // sets currentTrace = null in its own context
      fastDone();
    };

    await Promise.all([slowTrace(), fastTrace()]);

    expect(state.spans).toContainEqual({
      trace: 'slow-trace',
      name: 'mcp.tool.slow_tool',
      input: {},
    });
    expect(state.spans).toContainEqual({
      trace: 'fast-trace',
      name: 'mcp.tool.fast_tool',
      input: {},
    });
  });

  it('tracks consecutive flush failures and disables tracer after threshold', async () => {
    const tracer = createLangfuseTracer({
      secretKey: 'stub-secret',
      publicKey: 'stub-public',
    });
    await (tracer as any).healthCheckPromise;

    const langfuseInstance = (tracer as any).langfuse;
    expect(tracer.isEnabled()).toBe(true);
    expect(tracer.getConsecutiveFlushFailures()).toBe(0);

    // Mock flushAsync to fail
    langfuseInstance.flushAsync.mockRejectedValue(new Error('Network timeout'));

    // First failure
    tracer.startTrace('trace-1');
    await tracer.endTrace({ awaitFlush: false });
    // Wait for background flush to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tracer.getConsecutiveFlushFailures()).toBe(1);
    expect(tracer.isEnabled()).toBe(true);

    // Second failure
    tracer.startTrace('trace-2');
    await tracer.endTrace({ awaitFlush: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tracer.getConsecutiveFlushFailures()).toBe(2);
    expect(tracer.isEnabled()).toBe(true);

    // Third failure - should disable tracer
    tracer.startTrace('trace-3');
    await tracer.endTrace({ awaitFlush: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tracer.getConsecutiveFlushFailures()).toBe(3);
    expect(tracer.isEnabled()).toBe(false);

    // Subsequent operations should be no-ops
    const result = tracer.startTrace('trace-4');
    expect(result).toBeNull();
  });

  it('resets consecutive failure counter on successful flush', async () => {
    const tracer = createLangfuseTracer({
      secretKey: 'stub-secret',
      publicKey: 'stub-public',
    });
    await (tracer as any).healthCheckPromise;

    const langfuseInstance = (tracer as any).langfuse;

    // First failure
    langfuseInstance.flushAsync.mockRejectedValueOnce(new Error('Temporary error'));
    tracer.startTrace('trace-1');
    await tracer.endTrace({ awaitFlush: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tracer.getConsecutiveFlushFailures()).toBe(1);

    // Successful flush resets counter
    langfuseInstance.flushAsync.mockResolvedValueOnce(undefined);
    tracer.startTrace('trace-2');
    await tracer.endTrace({ awaitFlush: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tracer.getConsecutiveFlushFailures()).toBe(0);
    expect(tracer.isEnabled()).toBe(true);
  });

  it('logs warning for slow flushes', async () => {
    vi.useFakeTimers();
    const tracer = createLangfuseTracer({
      secretKey: 'stub-secret',
      publicKey: 'stub-public',
    });
    await (tracer as any).healthCheckPromise;

    const langfuseInstance = (tracer as any).langfuse;
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock slow flush (6 seconds)
    langfuseInstance.flushAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 6000))
    );

    tracer.startTrace('slow-trace');
    const endTracePromise = tracer.endTrace({ awaitFlush: true });

    // Advance timers to simulate the 6 second flush
    await vi.advanceTimersByTimeAsync(6000);
    await endTracePromise;

    expect(tracer.getLastFlushDurationMs()).toBeGreaterThanOrEqual(5000);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[LANGFUSE] WARNING: Slow flush detected')
    );

    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('handles awaited flush failures by throwing error', async () => {
    const tracer = createLangfuseTracer({
      secretKey: 'stub-secret',
      publicKey: 'stub-public',
    });
    await (tracer as any).healthCheckPromise;

    const langfuseInstance = (tracer as any).langfuse;
    langfuseInstance.flushAsync.mockRejectedValue(new Error('Critical flush error'));

    tracer.startTrace('trace-error');
    await expect(tracer.endTrace({ awaitFlush: true })).rejects.toThrow('Critical flush error');
    expect(tracer.getConsecutiveFlushFailures()).toBe(1);
  });
});

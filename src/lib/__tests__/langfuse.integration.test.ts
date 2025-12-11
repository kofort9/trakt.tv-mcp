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

// Create state inside the mock factory to avoid hoisting issues
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

  return { Langfuse: FakeLangfuse, __fakeState: fakeState };
});

const resetFakeState = async () => {
  const state = await getFakeState();
  state.traces.length = 0;
  state.traceUpdates.length = 0;
  state.spans.length = 0;
  state.spanUpdates.length = 0;
  state.endedSpans.length = 0;
  state.events.length = 0;
  state.flushes = 0;
  state.shutdowns = 0;
  state.instances.length = 0;
};

const getFakeState = async (): Promise<FakeState> => {
  const module = (await import('langfuse')) as unknown as { __fakeState: FakeState };
  return module.__fakeState;
};

describe('langfuse tracer integration (stub transport)', () => {
  beforeEach(async () => {
    await resetFakeState();
  });

  it('emits a trace, span, and flushes via the stub transport', async () => {
    const tracer = createLangfuseTracer({
      secretKey: 'stub-secret',
      publicKey: 'stub-public',
      baseUrl: 'https://stub.langfuse.local',
    });
    const state = await getFakeState();

    expect(tracer.isEnabled()).toBe(true);
    expect(state.instances).toEqual([
      { secretKey: 'stub-secret', publicKey: 'stub-public', baseUrl: 'https://stub.langfuse.local' },
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
});

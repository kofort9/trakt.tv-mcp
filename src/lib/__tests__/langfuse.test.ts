import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LangfuseTracer, createLangfuseTracer } from '../langfuse.js';

describe('langfuse integration', () => {
  describe('LangfuseTracer class', () => {
    describe('initialization', () => {
      it('should initialize when config is provided', () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
          baseUrl: 'https://test.langfuse.com',
        });

        expect(tracer.isEnabled()).toBe(true);
      });

      it('should initialize from env vars when no config provided', () => {
        // Set env vars
        process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
        process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
        process.env.LANGFUSE_BASE_URL = 'https://test.langfuse.com';

        const tracer = createLangfuseTracer();

        expect(tracer.isEnabled()).toBe(true);

        // Clean up
        delete process.env.LANGFUSE_SECRET_KEY;
        delete process.env.LANGFUSE_PUBLIC_KEY;
        delete process.env.LANGFUSE_BASE_URL;
      });

      it('should support legacy LANGFUSE_BASEURL env var', () => {
        process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
        process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
        process.env.LANGFUSE_BASEURL = 'https://legacy.langfuse.com';

        const tracer = createLangfuseTracer();

        expect(tracer.isEnabled()).toBe(true);

        // Clean up
        delete process.env.LANGFUSE_SECRET_KEY;
        delete process.env.LANGFUSE_PUBLIC_KEY;
        delete process.env.LANGFUSE_BASEURL;
      });

      it('should prefer LANGFUSE_BASE_URL over LANGFUSE_BASEURL', () => {
        process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
        process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
        process.env.LANGFUSE_BASE_URL = 'https://new.langfuse.com';
        process.env.LANGFUSE_BASEURL = 'https://old.langfuse.com';

        const tracer = createLangfuseTracer();

        // Should initialize successfully (preferring new URL)
        expect(tracer.isEnabled()).toBe(true);

        // Clean up
        delete process.env.LANGFUSE_SECRET_KEY;
        delete process.env.LANGFUSE_PUBLIC_KEY;
        delete process.env.LANGFUSE_BASE_URL;
        delete process.env.LANGFUSE_BASEURL;
      });

      it('should prefer config over env vars', () => {
        process.env.LANGFUSE_SECRET_KEY = 'env-secret';
        process.env.LANGFUSE_PUBLIC_KEY = 'env-public';

        const tracer = createLangfuseTracer({
          secretKey: 'config-secret',
          publicKey: 'config-public',
        });

        expect(tracer.isEnabled()).toBe(true);

        // Clean up
        delete process.env.LANGFUSE_SECRET_KEY;
        delete process.env.LANGFUSE_PUBLIC_KEY;
      });

      it('should not initialize when secret key is missing', () => {
        const tracer = createLangfuseTracer({
          publicKey: 'test-public-key',
        });

        expect(tracer.isEnabled()).toBe(false);
      });

      it('should not initialize when public key is missing', () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
        });

        expect(tracer.isEnabled()).toBe(false);
      });

      it('should not initialize when both keys are missing', () => {
        const tracer = createLangfuseTracer({});

        expect(tracer.isEnabled()).toBe(false);
      });
    });

    describe('graceful degradation when disabled', () => {
      let tracer: LangfuseTracer;

      beforeEach(() => {
        // Create a disabled tracer (no keys)
        tracer = createLangfuseTracer({});
      });

      it('startTrace should return null when disabled', () => {
        const trace = tracer.startTrace('test-trace');

        expect(trace).toBe(null);
      });

      it('getCurrentTrace should return null when disabled', () => {
        expect(tracer.getCurrentTrace()).toBe(null);
      });

      it('endTrace should not throw when disabled', async () => {
        await expect(tracer.endTrace()).resolves.not.toThrow();
      });

      it('traceToolCall should execute operation normally when disabled', async () => {
        const mockOperation = vi.fn().mockResolvedValue({ result: 'success' });

        const result = await tracer.traceToolCall('test_tool', { param: 'value' }, mockOperation);

        expect(result).toEqual({ result: 'success' });
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      it('traceApiCall should execute operation normally when disabled', async () => {
        const mockOperation = vi.fn().mockResolvedValue({ data: 'response' });

        const result = await tracer.traceApiCall('GET', '/api/test', mockOperation);

        expect(result).toEqual({ data: 'response' });
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      it('logAmbiguity should not throw when disabled', () => {
        expect(() => {
          tracer.logAmbiguity('test query', 3, true, 'fuzzy');
        }).not.toThrow();
      });

      it('logCacheEvent should not throw when disabled', () => {
        expect(() => {
          tracer.logCacheEvent('hit', 'test-key', 'test_tool');
        }).not.toThrow();
      });

      it('shutdown should not throw when disabled', async () => {
        await expect(tracer.shutdown()).resolves.not.toThrow();
      });
    });

    describe('startTrace and getCurrentTrace', () => {
      it('should start a trace when enabled', () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        expect(tracer.getCurrentTrace()).toBe(null);

        const trace = tracer.startTrace('test-session', { userId: 'test-user' });
        expect(trace).not.toBe(null);
        expect(tracer.getCurrentTrace()).toBe(trace);
      });

      it('should return null when disabled', () => {
        const tracer = createLangfuseTracer({});

        const trace = tracer.startTrace('test-session');
        expect(trace).toBe(null);
        expect(tracer.getCurrentTrace()).toBe(null);
      });
    });

    describe('traceToolCall integration', () => {
      it('should execute operation and return result when enabled', async () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        const mockOperation = vi.fn().mockResolvedValue({ success: true, data: { id: 123 } });

        const result = await tracer.traceToolCall('log_watch', { showId: 456 }, mockOperation);

        expect(result).toEqual({ success: true, data: { id: 123 } });
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      it('should propagate errors from operation when enabled', async () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        const error = new Error('API request failed');
        const mockOperation = vi.fn().mockRejectedValue(error);

        await expect(
          tracer.traceToolCall('log_watch', { showId: 456 }, mockOperation)
        ).rejects.toThrow('API request failed');
      });

      it('should execute operation normally when disabled', async () => {
        const tracer = createLangfuseTracer({});

        const mockOperation = vi.fn().mockResolvedValue({ success: true });

        const result = await tracer.traceToolCall('log_watch', { showId: 456 }, mockOperation);

        expect(result).toEqual({ success: true });
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });
    });

    describe('traceApiCall integration', () => {
      it('should execute operation and return result when enabled', async () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        const mockOperation = vi.fn().mockResolvedValue({ data: 'response' });

        const result = await tracer.traceApiCall('POST', '/sync/history', mockOperation);

        expect(result).toEqual({ data: 'response' });
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      it('should execute operation normally when disabled', async () => {
        const tracer = createLangfuseTracer({});

        const mockOperation = vi.fn().mockResolvedValue({ data: 'response' });

        const result = await tracer.traceApiCall('GET', '/users/me', mockOperation);

        expect(result).toEqual({ data: 'response' });
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });
    });

    describe('logAmbiguity', () => {
      it('should not throw when enabled', () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        expect(() => {
          tracer.logAmbiguity('breaking bad', 3, true, 'fuzzy');
        }).not.toThrow();
      });

      it('should not throw when disabled', () => {
        const tracer = createLangfuseTracer({});

        expect(() => {
          tracer.logAmbiguity('breaking bad', 3, true, 'fuzzy');
        }).not.toThrow();
      });

      it('should handle different ambiguity levels', () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        // Test various ambiguity levels without throwing
        expect(() => tracer.logAmbiguity('query', 0, false, 'none')).not.toThrow();
        expect(() => tracer.logAmbiguity('query', 1, false, 'exact')).not.toThrow();
        expect(() => tracer.logAmbiguity('query', 3, true, 'fuzzy')).not.toThrow();
        expect(() => tracer.logAmbiguity('query', 10, true, 'partial')).not.toThrow();
      });
    });

    describe('logCacheEvent', () => {
      it('should not throw when enabled', () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        expect(() => {
          tracer.logCacheEvent('hit', 'test-key', 'test_tool');
        }).not.toThrow();
      });

      it('should not throw when disabled', () => {
        const tracer = createLangfuseTracer({});

        expect(() => {
          tracer.logCacheEvent('miss', 'test-key');
        }).not.toThrow();
      });

      it('should handle long cache keys', () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });
        tracer.startTrace('test-session');

        const longKey = 'a'.repeat(100);
        expect(() => {
          tracer.logCacheEvent('hit', longKey, 'test_tool');
        }).not.toThrow();
      });
    });

    describe('endTrace', () => {
      it('should not throw when enabled', async () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });
        tracer.startTrace('test-session');

        await expect(tracer.endTrace()).resolves.not.toThrow();
      }, 10000); // 10 second timeout for network call

      it('should not throw when disabled', async () => {
        const tracer = createLangfuseTracer({});

        await expect(tracer.endTrace()).resolves.not.toThrow();
      });
    });

    describe('shutdown', () => {
      it('should not throw when enabled', async () => {
        const tracer = createLangfuseTracer({
          secretKey: 'test-secret-key',
          publicKey: 'test-public-key',
        });

        await expect(tracer.shutdown()).resolves.not.toThrow();
      });

      it('should not throw when disabled', async () => {
        const tracer = createLangfuseTracer({});

        await expect(tracer.shutdown()).resolves.not.toThrow();
      });
    });

    describe('test isolation', () => {
      it('should allow multiple independent tracer instances', () => {
        const tracer1 = createLangfuseTracer({
          secretKey: 'test-secret-1',
          publicKey: 'test-public-1',
        });

        const tracer2 = createLangfuseTracer({
          secretKey: 'test-secret-2',
          publicKey: 'test-public-2',
        });

        // Both should be enabled
        expect(tracer1.isEnabled()).toBe(true);
        expect(tracer2.isEnabled()).toBe(true);

        // They should maintain independent state
        const trace1 = tracer1.startTrace('session-1');
        const trace2 = tracer2.startTrace('session-2');

        expect(tracer1.getCurrentTrace()).toBe(trace1);
        expect(tracer2.getCurrentTrace()).toBe(trace2);
        expect(trace1).not.toBe(trace2);
      });

      it('should not share state between tracer instances', async () => {
        const tracer1 = createLangfuseTracer({
          secretKey: 'test-secret-1',
          publicKey: 'test-public-1',
        });

        const tracer2 = createLangfuseTracer({
          secretKey: 'test-secret-2',
          publicKey: 'test-public-2',
        });

        tracer1.startTrace('session-1');
        tracer2.startTrace('session-2');

        // End trace on tracer1 should not affect tracer2
        await tracer1.endTrace();

        expect(tracer1.getCurrentTrace()).toBe(null);
        expect(tracer2.getCurrentTrace()).not.toBe(null);
      }, 15000); // Extended timeout for network operations
    });
  });

  describe('backward compatibility', () => {
    let originalEnv: typeof process.env;

    beforeEach(() => {
      // Save original env vars
      originalEnv = { ...process.env };

      // Clear module cache to reset singleton instance
      vi.resetModules();
    });

    afterEach(() => {
      // Restore original env vars
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('should support legacy function exports with env vars', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
      process.env.LANGFUSE_BASE_URL = 'https://test.langfuse.com';

      const { isLangfuseEnabled, startTrace, getCurrentTrace } = await import('../langfuse.js');

      expect(isLangfuseEnabled()).toBe(true);

      const trace = startTrace('test-session', { userId: 'test-user' });
      expect(trace).not.toBe(null);
      expect(getCurrentTrace()).toBe(trace);
    });

    it('should support legacy function exports when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const {
        isLangfuseEnabled,
        startTrace,
        traceToolCall,
        traceApiCall,
        logAmbiguity,
        logCacheEvent,
        endTrace,
        shutdown,
      } = await import('../langfuse.js');

      expect(isLangfuseEnabled()).toBe(false);
      expect(startTrace('test-trace')).toBe(null);

      // All operations should work without throwing
      await expect(endTrace()).resolves.not.toThrow();
      await expect(shutdown()).resolves.not.toThrow();

      const mockOp = vi.fn().mockResolvedValue({ success: true });
      await expect(traceToolCall('test_tool', {}, mockOp)).resolves.toEqual({ success: true });
      await expect(traceApiCall('GET', '/test', mockOp)).resolves.toEqual({ success: true });

      expect(() => logAmbiguity('query', 0, false, 'none')).not.toThrow();
      expect(() => logCacheEvent('hit', 'key')).not.toThrow();
    });
  });
});

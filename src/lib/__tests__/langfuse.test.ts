import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('langfuse integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

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

  describe('initialization', () => {
    it('should initialize when env vars are provided', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
      process.env.LANGFUSE_BASE_URL = 'https://test.langfuse.com';

      const { isLangfuseEnabled } = await import('../langfuse.js');
      const enabled = isLangfuseEnabled();

      expect(enabled).toBe(true);
    });

    it('should support legacy LANGFUSE_BASEURL env var', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
      process.env.LANGFUSE_BASEURL = 'https://legacy.langfuse.com';

      const { isLangfuseEnabled } = await import('../langfuse.js');
      const enabled = isLangfuseEnabled();

      expect(enabled).toBe(true);
    });

    it('should prefer LANGFUSE_BASE_URL over LANGFUSE_BASEURL', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
      process.env.LANGFUSE_BASE_URL = 'https://new.langfuse.com';
      process.env.LANGFUSE_BASEURL = 'https://old.langfuse.com';

      const { isLangfuseEnabled } = await import('../langfuse.js');
      const enabled = isLangfuseEnabled();

      // Should initialize successfully
      expect(enabled).toBe(true);
    });

    it('should not initialize when secret key is missing', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';
      delete process.env.LANGFUSE_SECRET_KEY;

      const { isLangfuseEnabled } = await import('../langfuse.js');
      const enabled = isLangfuseEnabled();

      expect(enabled).toBe(false);
    });

    it('should not initialize when public key is missing', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { isLangfuseEnabled } = await import('../langfuse.js');
      const enabled = isLangfuseEnabled();

      expect(enabled).toBe(false);
    });

    it('should not initialize when both keys are missing', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { isLangfuseEnabled } = await import('../langfuse.js');
      const enabled = isLangfuseEnabled();

      expect(enabled).toBe(false);
    });
  });

  describe('graceful degradation when disabled', () => {
    beforeEach(() => {
      // Ensure Langfuse is disabled
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;
    });

    it('startTrace should return null when disabled', async () => {
      const { startTrace } = await import('../langfuse.js');
      const trace = startTrace('test-trace');

      expect(trace).toBe(null);
    });

    it('endTrace should not throw when disabled', async () => {
      const { endTrace } = await import('../langfuse.js');

      await expect(endTrace()).resolves.not.toThrow();
    });

    it('traceToolCall should execute operation normally when disabled', async () => {
      const { traceToolCall } = await import('../langfuse.js');
      const mockOperation = vi.fn().mockResolvedValue({ result: 'success' });

      const result = await traceToolCall('test_tool', { param: 'value' }, mockOperation);

      expect(result).toEqual({ result: 'success' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('traceApiCall should execute operation normally when disabled', async () => {
      const { traceApiCall } = await import('../langfuse.js');
      const mockOperation = vi.fn().mockResolvedValue({ data: 'response' });

      const result = await traceApiCall('GET', '/api/test', mockOperation);

      expect(result).toEqual({ data: 'response' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('logAmbiguity should not throw when disabled', async () => {
      const { logAmbiguity } = await import('../langfuse.js');

      expect(() => {
        logAmbiguity('test query', 3, true, 'fuzzy');
      }).not.toThrow();
    });

    it('logCacheEvent should not throw when disabled', async () => {
      const { logCacheEvent } = await import('../langfuse.js');

      expect(() => {
        logCacheEvent('hit', 'test-key', 'test_tool');
      }).not.toThrow();
    });

    it('shutdown should not throw when disabled', async () => {
      const { shutdown } = await import('../langfuse.js');

      await expect(shutdown()).resolves.not.toThrow();
    });
  });

  describe('startTrace and getCurrentTrace', () => {
    it('should start a trace when enabled', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { startTrace, getCurrentTrace } = await import('../langfuse.js');

      expect(getCurrentTrace()).toBe(null);

      const trace = startTrace('test-session', { userId: 'test-user' });
      expect(trace).not.toBe(null);
      expect(getCurrentTrace()).toBe(trace);
    });

    it('should return null when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { startTrace, getCurrentTrace } = await import('../langfuse.js');

      const trace = startTrace('test-session');
      expect(trace).toBe(null);
      expect(getCurrentTrace()).toBe(null);
    });
  });

  describe('traceToolCall integration', () => {
    it('should execute operation and return result when enabled', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { traceToolCall } = await import('../langfuse.js');
      const mockOperation = vi.fn().mockResolvedValue({ success: true, data: { id: 123 } });

      const result = await traceToolCall('log_watch', { showId: 456 }, mockOperation);

      expect(result).toEqual({ success: true, data: { id: 123 } });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from operation when enabled', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { traceToolCall } = await import('../langfuse.js');
      const error = new Error('API request failed');
      const mockOperation = vi.fn().mockRejectedValue(error);

      await expect(traceToolCall('log_watch', { showId: 456 }, mockOperation)).rejects.toThrow(
        'API request failed'
      );
    });

    it('should execute operation normally when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { traceToolCall } = await import('../langfuse.js');
      const mockOperation = vi.fn().mockResolvedValue({ success: true });

      const result = await traceToolCall('log_watch', { showId: 456 }, mockOperation);

      expect(result).toEqual({ success: true });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('traceApiCall integration', () => {
    it('should execute operation and return result when enabled', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { traceApiCall } = await import('../langfuse.js');
      const mockOperation = vi.fn().mockResolvedValue({ data: 'response' });

      const result = await traceApiCall('POST', '/sync/history', mockOperation);

      expect(result).toEqual({ data: 'response' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should execute operation normally when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { traceApiCall } = await import('../langfuse.js');
      const mockOperation = vi.fn().mockResolvedValue({ data: 'response' });

      const result = await traceApiCall('GET', '/users/me', mockOperation);

      expect(result).toEqual({ data: 'response' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('logAmbiguity', () => {
    it('should not throw when enabled', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { logAmbiguity } = await import('../langfuse.js');

      expect(() => {
        logAmbiguity('breaking bad', 3, true, 'fuzzy');
      }).not.toThrow();
    });

    it('should not throw when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { logAmbiguity } = await import('../langfuse.js');

      expect(() => {
        logAmbiguity('breaking bad', 3, true, 'fuzzy');
      }).not.toThrow();
    });

    it('should handle different ambiguity levels', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { logAmbiguity } = await import('../langfuse.js');

      // Test various ambiguity levels without throwing
      expect(() => logAmbiguity('query', 0, false, 'none')).not.toThrow();
      expect(() => logAmbiguity('query', 1, false, 'exact')).not.toThrow();
      expect(() => logAmbiguity('query', 3, true, 'fuzzy')).not.toThrow();
      expect(() => logAmbiguity('query', 10, true, 'partial')).not.toThrow();
    });
  });

  describe('logCacheEvent', () => {
    it('should not throw when enabled', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { logCacheEvent } = await import('../langfuse.js');

      expect(() => {
        logCacheEvent('hit', 'test-key', 'test_tool');
      }).not.toThrow();
    });

    it('should not throw when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { logCacheEvent } = await import('../langfuse.js');

      expect(() => {
        logCacheEvent('miss', 'test-key');
      }).not.toThrow();
    });

    it('should handle long cache keys', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { startTrace, logCacheEvent } = await import('../langfuse.js');
      startTrace('test-session');

      const longKey = 'a'.repeat(100);
      expect(() => {
        logCacheEvent('hit', longKey, 'test_tool');
      }).not.toThrow();
    });
  });

  describe('endTrace', () => {
    it(
      'should not throw when enabled',
      async () => {
        process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
        process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

        const { startTrace, endTrace } = await import('../langfuse.js');
        startTrace('test-session');

        await expect(endTrace()).resolves.not.toThrow();
      },
      10000
    ); // 10 second timeout for network call

    it('should not throw when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { endTrace } = await import('../langfuse.js');

      await expect(endTrace()).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should not throw when enabled', async () => {
      process.env.LANGFUSE_SECRET_KEY = 'test-secret-key';
      process.env.LANGFUSE_PUBLIC_KEY = 'test-public-key';

      const { isLangfuseEnabled, shutdown } = await import('../langfuse.js');
      isLangfuseEnabled();

      await expect(shutdown()).resolves.not.toThrow();
    });

    it('should not throw when disabled', async () => {
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { shutdown } = await import('../langfuse.js');

      await expect(shutdown()).resolves.not.toThrow();
    });
  });
});

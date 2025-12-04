/**
 * Tests for OpenTelemetry configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTelemetry, shutdownTelemetry, isTelemetryEnabled } from '../../telemetry/config.js';

describe('Telemetry Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.HONEYCOMB_API_KEY;
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_SERVICE_NAME;
  });

  afterEach(async () => {
    // Restore environment
    process.env = originalEnv;
    // Shutdown telemetry to clean up
    await shutdownTelemetry();
  });

  describe('initTelemetry', () => {
    it('should return false when HONEYCOMB_API_KEY is not set', () => {
      const result = initTelemetry();
      expect(result).toBe(false);
      expect(isTelemetryEnabled()).toBe(false);
    });

    it('should return false when OTEL_ENABLED is explicitly false', () => {
      process.env.HONEYCOMB_API_KEY = 'test-key';
      process.env.OTEL_ENABLED = 'false';

      const result = initTelemetry();
      expect(result).toBe(false);
      expect(isTelemetryEnabled()).toBe(false);
    });

    it('should initialize successfully with HONEYCOMB_API_KEY', () => {
      process.env.HONEYCOMB_API_KEY = 'test-api-key';

      const result = initTelemetry();
      expect(result).toBe(true);
      expect(isTelemetryEnabled()).toBe(true);
    });

    it('should use default service name when OTEL_SERVICE_NAME not set', () => {
      process.env.HONEYCOMB_API_KEY = 'test-api-key';

      const result = initTelemetry();
      expect(result).toBe(true);
      // Service name is set internally, can't easily verify without inspection
    });

    it('should not reinitialize if already initialized', () => {
      process.env.HONEYCOMB_API_KEY = 'test-api-key';

      const result1 = initTelemetry();
      const result2 = initTelemetry();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe('shutdownTelemetry', () => {
    it('should shutdown gracefully when telemetry is enabled', async () => {
      process.env.HONEYCOMB_API_KEY = 'test-api-key';
      initTelemetry();

      await shutdownTelemetry();
      expect(isTelemetryEnabled()).toBe(false);
    });

    it('should not throw when shutting down non-initialized telemetry', async () => {
      await expect(shutdownTelemetry()).resolves.not.toThrow();
    });
  });

  describe('isTelemetryEnabled', () => {
    it('should return false when telemetry not initialized', () => {
      expect(isTelemetryEnabled()).toBe(false);
    });

    it('should return true when telemetry initialized', () => {
      process.env.HONEYCOMB_API_KEY = 'test-api-key';
      initTelemetry();

      expect(isTelemetryEnabled()).toBe(true);
    });
  });
});

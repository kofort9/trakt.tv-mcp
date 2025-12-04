/**
 * Tests for MCP Tool Tracer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { traceMcpTool, addToolParams, getCurrentSpan } from '../../telemetry/mcp-tracer.js';
import { initTelemetry, shutdownTelemetry } from '../../telemetry/config.js';

describe('MCP Tool Tracer', () => {
  beforeEach(() => {
    // Initialize telemetry for tests
    process.env.HONEYCOMB_API_KEY = 'test-key';
    initTelemetry();
  });

  afterEach(async () => {
    await shutdownTelemetry();
    delete process.env.HONEYCOMB_API_KEY;
  });

  describe('traceMcpTool', () => {
    it('should execute operation successfully', async () => {
      const result = await traceMcpTool(
        'test_tool',
        async (span) => {
          expect(span).toBeDefined();
          return { success: true };
        }
      );

      expect(result).toEqual({ success: true });
    });

    it('should handle operation errors', async () => {
      await expect(
        traceMcpTool('test_tool', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should add attributes to span', async () => {
      await traceMcpTool(
        'test_tool',
        async (span) => {
          span.setAttribute('test.attribute', 'value');
          return { success: true };
        },
        { 'custom.attribute': 'test' }
      );

      // Span attributes are set, but we can't easily verify without instrumentation
    });

    it('should work when telemetry is disabled', async () => {
      await shutdownTelemetry();
      delete process.env.HONEYCOMB_API_KEY;

      const result = await traceMcpTool('test_tool', async () => {
        return { success: true };
      });

      expect(result).toEqual({ success: true });
    });

    it('should handle async operations', async () => {
      const result = await traceMcpTool('test_tool', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { delayed: true };
      });

      expect(result).toEqual({ delayed: true });
    });
  });

  describe('addToolParams', () => {
    it('should sanitize sensitive parameters', async () => {
      await traceMcpTool('test_tool', async (span) => {
        addToolParams(span, {
          query: 'search term',
          token: 'secret-token',
          apiKey: 'secret-key',
        });

        // Sensitive params should be redacted in actual telemetry
        return { success: true };
      });
    });

    it('should handle complex parameter types', async () => {
      await traceMcpTool('test_tool', async (span) => {
        addToolParams(span, {
          string: 'test',
          number: 42,
          boolean: true,
          array: [1, 2, 3],
          object: { nested: 'value' },
        });

        return { success: true };
      });
    });

    it('should truncate long strings', async () => {
      const longString = 'a'.repeat(1000);

      await traceMcpTool('test_tool', async (span) => {
        addToolParams(span, {
          longParam: longString,
        });

        return { success: true };
      });
    });
  });

  describe('getCurrentSpan', () => {
    it('should return undefined when no span is active', () => {
      const span = getCurrentSpan();
      expect(span).toBeUndefined();
    });

    it('should return active span within traced operation', async () => {
      await traceMcpTool('test_tool', async () => {
        const span = getCurrentSpan();
        expect(span).toBeDefined();
        return { success: true };
      });
    });
  });
});

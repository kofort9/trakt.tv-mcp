import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger, RequestLog } from '../logger.js';
import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Logger', () => {
  let logger: Logger;
  let testLogDir: string;

  beforeEach(() => {
    // Create a unique test log directory
    testLogDir = path.join(os.tmpdir(), `trakt-mcp-test-logs-${Date.now()}`);
    logger = new Logger({
      maxBufferSize: 10,
      enableFileLogging: true,
      logDirectory: testLogDir,
    });
  });

  afterEach(() => {
    // Clean up test logs
    logger.clear();
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testLogDir, file));
      });
      fs.rmdirSync(testLogDir);
    }
  });

  describe('generateCorrelationId', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = logger.generateCorrelationId();
      const id2 = logger.generateCorrelationId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs in expected format', () => {
      const id = logger.generateCorrelationId();
      expect(id).toMatch(/^\d+-\d+$/);
    });
  });

  describe('logRequest', () => {
    it('should add request to buffer', () => {
      const log: RequestLog = {
        correlationId: 'test-123',
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.trakt.tv/shows/popular',
        headers: { 'Content-Type': 'application/json' },
        statusCode: 200,
        durationMs: 150,
      };

      logger.logRequest(log);
      const logs = logger.getRecentLogs(1);

      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(log);
    });

    it('should maintain circular buffer with max size', () => {
      // Log 15 requests (max buffer is 10)
      for (let i = 0; i < 15; i++) {
        logger.logRequest({
          correlationId: `test-${i}`,
          timestamp: new Date().toISOString(),
          method: 'GET',
          url: `https://api.trakt.tv/test/${i}`,
          headers: {},
          durationMs: 100,
        });
      }

      const logs = logger.getRecentLogs(100);

      expect(logs).toHaveLength(10);
      // Should have most recent 10 (5-14)
      expect(logs[0].correlationId).toBe('test-14');
      expect(logs[9].correlationId).toBe('test-5');
    });
  });

  describe('createRequestLog', () => {
    it('should create request log from axios config', () => {
      const config: AxiosRequestConfig = {
        method: 'POST',
        url: '/sync/history',
        baseURL: 'https://api.trakt.tv',
        headers: {
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        },
        data: { movies: [{ ids: { trakt: 12345 } }] },
      };

      const correlationId = 'test-correlation-id';
      const partialLog = logger.createRequestLog(config, correlationId, 'log_watch');

      expect(partialLog.correlationId).toBe(correlationId);
      expect(partialLog.toolName).toBe('log_watch');
      expect(partialLog.method).toBe('POST');
      expect(partialLog.url).toBe('https://api.trakt.tv/sync/history');
      expect(partialLog.headers?.Authorization).toBe('[REDACTED]');
      expect(partialLog.requestBody).toEqual({ movies: [{ ids: { trakt: 12345 } }] });
    });

    it('should handle query parameters', () => {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: '/search/show',
        baseURL: 'https://api.trakt.tv',
        params: { query: 'breaking bad', year: 2008 },
      };

      const partialLog = logger.createRequestLog(config, 'test-id');

      expect(partialLog.url).toBe('https://api.trakt.tv/search/show?query=breaking+bad&year=2008');
    });
  });

  describe('completeRequestLog', () => {
    it('should complete request log with response data', () => {
      const partialLog = {
        correlationId: 'test-id',
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.trakt.tv/shows/popular',
        headers: {},
      };

      const response = {
        status: 200,
        statusText: 'OK',
        headers: {
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '999',
          'x-ratelimit-reset': '1234567890',
        },
        config: {} as AxiosRequestConfig,
        data: [{ show: { title: 'Breaking Bad' } }],
      } as AxiosResponse;

      const startTime = Date.now() - 150;
      const fullLog = logger.completeRequestLog(partialLog, response, startTime);

      expect(fullLog.statusCode).toBe(200);
      expect(fullLog.responseBody).toEqual([{ show: { title: 'Breaking Bad' } }]);
      expect(fullLog.durationMs).toBeGreaterThanOrEqual(150);
      expect(fullLog.rateLimitInfo?.limit).toBe('1000');
      expect(fullLog.rateLimitInfo?.remaining).toBe('999');
    });

    it('should truncate large response bodies', () => {
      const partialLog = {
        correlationId: 'test-id',
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.trakt.tv/shows/popular',
        headers: {},
      };

      // Create a large response body (>5KB)
      const largeData = Array(500).fill({ show: { title: 'A'.repeat(50) } });
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as AxiosRequestConfig,
        data: largeData,
      } as AxiosResponse;

      const fullLog = logger.completeRequestLog(partialLog, response, Date.now());

      expect(fullLog.responseBody).toHaveProperty('_truncated');
      expect((fullLog.responseBody as { _truncated: boolean })._truncated).toBe(true);
    });
  });

  describe('completeRequestLogWithError', () => {
    it('should complete request log with error data', () => {
      const partialLog = {
        correlationId: 'test-id',
        timestamp: new Date().toISOString(),
        method: 'POST',
        url: 'https://api.trakt.tv/sync/history',
        headers: {},
      };

      const error = {
        message: 'Network Error',
        name: 'AxiosError',
        config: {} as AxiosRequestConfig,
        isAxiosError: true,
        toJSON: () => ({}),
      } as AxiosError;

      const startTime = Date.now() - 100;
      const fullLog = logger.completeRequestLogWithError(partialLog, error, startTime);

      expect(fullLog.error).toBe('Network Error');
      expect(fullLog.durationMs).toBeGreaterThanOrEqual(100);
    });

    it('should include response data from error', () => {
      const partialLog = {
        correlationId: 'test-id',
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.trakt.tv/shows/invalid',
        headers: {},
      };

      const error = {
        message: 'Request failed with status code 404',
        name: 'AxiosError',
        config: {} as AxiosRequestConfig,
        response: {
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config: {} as AxiosRequestConfig,
          data: { error: 'Show not found' },
        },
        isAxiosError: true,
        toJSON: () => ({}),
      } as AxiosError;

      const fullLog = logger.completeRequestLogWithError(partialLog, error, Date.now());

      expect(fullLog.statusCode).toBe(404);
      expect(fullLog.responseBody).toEqual({ error: 'Show not found' });
    });
  });

  describe('getRecentLogs', () => {
    beforeEach(() => {
      // Add sample logs
      for (let i = 0; i < 5; i++) {
        logger.logRequest({
          correlationId: `test-${i}`,
          timestamp: new Date(Date.now() - (5 - i) * 1000).toISOString(),
          toolName: i % 2 === 0 ? 'log_watch' : 'get_history',
          method: i % 2 === 0 ? 'POST' : 'GET',
          url: `https://api.trakt.tv/test/${i}`,
          headers: {},
          statusCode: i === 3 ? 404 : 200,
          durationMs: 100 + i * 10,
        });
      }
    });

    it('should return most recent logs first', () => {
      const logs = logger.getRecentLogs(3);

      expect(logs).toHaveLength(3);
      expect(logs[0].correlationId).toBe('test-4');
      expect(logs[1].correlationId).toBe('test-3');
      expect(logs[2].correlationId).toBe('test-2');
    });

    it('should filter by tool name', () => {
      const logs = logger.getRecentLogs(10, { toolName: 'log_watch' });

      expect(logs).toHaveLength(3);
      logs.forEach((log) => {
        expect(log.toolName).toBe('log_watch');
      });
    });

    it('should filter by HTTP method', () => {
      const logs = logger.getRecentLogs(10, { method: 'GET' });

      expect(logs).toHaveLength(2);
      logs.forEach((log) => {
        expect(log.method).toBe('GET');
      });
    });

    it('should filter by status code', () => {
      const logs = logger.getRecentLogs(10, { statusCode: 404 });

      expect(logs).toHaveLength(1);
      expect(logs[0].statusCode).toBe(404);
    });

    it('should filter by date range', () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 4000).toISOString();
      const endDate = new Date(now.getTime() - 1000).toISOString();

      const logs = logger.getRecentLogs(10, { startDate, endDate });

      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.length).toBeLessThanOrEqual(4);
    });
  });

  describe('getMetrics', () => {
    it('should track metrics for tools', () => {
      logger.logRequest({
        correlationId: 'test-1',
        timestamp: new Date().toISOString(),
        toolName: 'log_watch',
        method: 'POST',
        url: 'https://api.trakt.tv/sync/history',
        headers: {},
        statusCode: 200,
        durationMs: 150,
      });

      logger.logRequest({
        correlationId: 'test-2',
        timestamp: new Date().toISOString(),
        toolName: 'log_watch',
        method: 'POST',
        url: 'https://api.trakt.tv/sync/history',
        headers: {},
        statusCode: 200,
        durationMs: 200,
      });

      const metrics = logger.getMetrics('log_watch');

      expect(metrics).toHaveLength(1);
      expect(metrics[0].toolName).toBe('log_watch');
      expect(metrics[0].totalCalls).toBe(2);
      expect(metrics[0].successfulCalls).toBe(2);
      expect(metrics[0].failedCalls).toBe(0);
      expect(metrics[0].avgDurationMs).toBe(175);
      expect(metrics[0].minDurationMs).toBe(150);
      expect(metrics[0].maxDurationMs).toBe(200);
    });

    it('should track failed requests', () => {
      logger.logRequest({
        correlationId: 'test-1',
        timestamp: new Date().toISOString(),
        toolName: 'log_watch',
        method: 'POST',
        url: 'https://api.trakt.tv/sync/history',
        headers: {},
        statusCode: 200,
        durationMs: 150,
      });

      logger.logRequest({
        correlationId: 'test-2',
        timestamp: new Date().toISOString(),
        toolName: 'log_watch',
        method: 'POST',
        url: 'https://api.trakt.tv/sync/history',
        headers: {},
        error: 'Network Error',
        durationMs: 50,
      });

      const metrics = logger.getMetrics('log_watch');

      expect(metrics[0].totalCalls).toBe(2);
      expect(metrics[0].successfulCalls).toBe(1);
      expect(metrics[0].failedCalls).toBe(1);
    });

    it('should return all metrics when no tool specified', () => {
      logger.logRequest({
        correlationId: 'test-1',
        timestamp: new Date().toISOString(),
        toolName: 'log_watch',
        method: 'POST',
        url: 'https://api.trakt.tv/test',
        headers: {},
        durationMs: 150,
      });

      logger.logRequest({
        correlationId: 'test-2',
        timestamp: new Date().toISOString(),
        toolName: 'get_history',
        method: 'GET',
        url: 'https://api.trakt.tv/test',
        headers: {},
        durationMs: 100,
      });

      const metrics = logger.getMetrics();

      expect(metrics).toHaveLength(2);
      expect(metrics.find((m) => m.toolName === 'log_watch')).toBeDefined();
      expect(metrics.find((m) => m.toolName === 'get_history')).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear all logs and metrics', () => {
      logger.logRequest({
        correlationId: 'test-1',
        timestamp: new Date().toISOString(),
        toolName: 'log_watch',
        method: 'POST',
        url: 'https://api.trakt.tv/test',
        headers: {},
        durationMs: 150,
      });

      expect(logger.getRecentLogs(1)).toHaveLength(1);
      expect(logger.getMetrics()).toHaveLength(1);

      logger.clear();

      expect(logger.getRecentLogs(1)).toHaveLength(0);
      expect(logger.getMetrics()).toHaveLength(0);
    });
  });

  describe('file logging', () => {
    it('should write logs to file when enabled', () => {
      logger.logRequest({
        correlationId: 'test-1',
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.trakt.tv/test',
        headers: {},
        durationMs: 100,
      });

      const files = fs.readdirSync(testLogDir);
      expect(files.length).toBeGreaterThan(0);

      const logFile = path.join(testLogDir, files[0]);
      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('test-1');
    });

    it('should not write to file when disabled', () => {
      const noFileLogDir = path.join(os.tmpdir(), `trakt-mcp-no-file-test-${Date.now()}`);
      const noFileLogger = new Logger({
        enableFileLogging: false,
        logDirectory: noFileLogDir,
      });

      noFileLogger.logRequest({
        correlationId: 'test-1',
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.trakt.tv/test',
        headers: {},
        durationMs: 100,
      });

      // Directory should not be created when file logging is disabled
      expect(fs.existsSync(noFileLogDir)).toBe(false);
    });
  });

  describe('header redaction', () => {
    it('should redact Authorization headers', () => {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: '/test',
        headers: {
          Authorization: 'Bearer secret-token-12345',
          'Content-Type': 'application/json',
        },
      };

      const partialLog = logger.createRequestLog(config, 'test-id');

      expect(partialLog.headers?.Authorization).toBe('[REDACTED]');
      expect(partialLog.headers?.['Content-Type']).toBe('application/json');
    });
  });

  describe('performance overhead', () => {
    it('should have minimal overhead (<5ms per log)', () => {
      const log: RequestLog = {
        correlationId: 'test-perf',
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://api.trakt.tv/test',
        headers: {},
        durationMs: 100,
      };

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        logger.logRequest({ ...log, correlationId: `test-${i}` });
      }
      const elapsed = Date.now() - start;

      // 100 logs should take less than 500ms (5ms per log)
      expect(elapsed).toBeLessThan(500);
    });
  });
});

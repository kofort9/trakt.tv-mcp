import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Request log entry with full details for debugging
 */
export interface RequestLog {
  /** Unique correlation ID for tracking related requests */
  correlationId: string;
  /** Timestamp when request was initiated */
  timestamp: string;
  /** Tool/method that initiated the request */
  toolName?: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Full request URL */
  url: string;
  /** Request headers (auth tokens redacted) */
  headers: Record<string, string>;
  /** Request body (if present) */
  requestBody?: unknown;
  /** HTTP status code */
  statusCode?: number;
  /** Response body (truncated if large) */
  responseBody?: unknown;
  /** Error message (if request failed) */
  error?: string;
  /** Request duration in milliseconds */
  durationMs: number;
  /** Rate limit headers from response */
  rateLimitInfo?: {
    limit?: string;
    remaining?: string;
    reset?: string;
  };
}

/**
 * Performance metrics for tool execution
 */
export interface ToolMetrics {
  /** Tool name */
  toolName: string;
  /** Total number of calls */
  totalCalls: number;
  /** Number of successful calls */
  successfulCalls: number;
  /** Number of failed calls */
  failedCalls: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Minimum duration in milliseconds */
  minDurationMs: number;
  /** Maximum duration in milliseconds */
  maxDurationMs: number;
  /** Last execution timestamp */
  lastExecuted: string;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Maximum number of entries to keep in memory */
  maxBufferSize?: number;
  /** Maximum log file size in bytes before rotation */
  maxFileSize?: number;
  /** Directory to store log files */
  logDirectory?: string;
  /** Enable/disable file logging */
  enableFileLogging?: boolean;
  /** Maximum age of logs in days before deletion (default: 7) */
  maxLogAge?: number;
  /** Maximum number of log files to keep (default: 10) */
  maxLogFiles?: number;
}

/**
 * Logger class for comprehensive request/response tracking
 *
 * Features:
 * - In-memory circular buffer for recent requests
 * - File-based logging with automatic rotation
 * - Performance metrics tracking per tool
 * - Request correlation IDs
 * - Rate limit tracking
 */
export class Logger {
  private buffer: RequestLog[] = [];
  private maxBufferSize: number;
  private maxFileSize: number;
  private logDirectory: string;
  private enableFileLogging: boolean;
  private maxLogAge: number;
  private maxLogFiles: number;
  private currentLogFile: string;
  private currentFileSize: number = 0;
  private metrics: Map<string, ToolMetrics> = new Map();
  private correlationCounter: number = 0;

  constructor(config: LoggerConfig = {}) {
    this.maxBufferSize = config.maxBufferSize || 1000;
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB
    // Use ~/.trakt-mcp/logs/ for secure logging
    this.logDirectory = config.logDirectory || path.join(os.homedir(), '.trakt-mcp', 'logs');
    this.enableFileLogging = config.enableFileLogging ?? true;
    this.maxLogAge = config.maxLogAge || 7;
    this.maxLogFiles = config.maxLogFiles || 10;

    // Initialize log directory and file
    if (this.enableFileLogging) {
      this.ensureLogDirectory();
      this.cleanupOldLogs();
      this.currentLogFile = this.getNewLogFileName();
    } else {
      this.currentLogFile = '';
    }
  }

  /**
   * Generate a unique correlation ID for request tracking
   */
  generateCorrelationId(): string {
    const timestamp = Date.now();
    const counter = ++this.correlationCounter;
    return `${timestamp}-${counter}`;
  }

  /**
   * Log an API request with timing and context
   */
  logRequest(log: RequestLog): void {
    // Add to circular buffer
    this.buffer.push(log);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift(); // Remove oldest entry
    }

    // Update metrics
    this.updateMetrics(log);

    // Write to file if enabled
    if (this.enableFileLogging) {
      this.writeToFile(log);
    }
  }

  /**
   * Create a request log from Axios config (before request)
   */
  createRequestLog(
    config: AxiosRequestConfig,
    correlationId: string,
    toolName?: string
  ): Partial<RequestLog> {
    return {
      correlationId,
      timestamp: new Date().toISOString(),
      toolName,
      method: config.method?.toUpperCase() || 'GET',
      url: this.buildFullUrl(config),
      headers: this.redactSensitiveHeaders(config.headers || {}),
      requestBody: config.data,
    };
  }

  /**
   * Update request log with response data
   */
  completeRequestLog(
    partialLog: Partial<RequestLog>,
    response: AxiosResponse,
    startTime: number
  ): RequestLog {
    const durationMs = Date.now() - startTime;

    return {
      ...partialLog,
      correlationId: partialLog.correlationId!,
      timestamp: partialLog.timestamp!,
      method: partialLog.method!,
      url: partialLog.url!,
      headers: partialLog.headers!,
      statusCode: response.status,
      responseBody: this.truncateResponseBody(response.data),
      durationMs,
      rateLimitInfo: this.extractRateLimitInfo(response),
    };
  }

  /**
   * Update request log with error data
   */
  completeRequestLogWithError(
    partialLog: Partial<RequestLog>,
    error: AxiosError,
    startTime: number
  ): RequestLog {
    const durationMs = Date.now() - startTime;

    return {
      ...partialLog,
      correlationId: partialLog.correlationId!,
      timestamp: partialLog.timestamp!,
      method: partialLog.method!,
      url: partialLog.url!,
      headers: partialLog.headers!,
      statusCode: error.response?.status,
      responseBody: error.response ? this.truncateResponseBody(error.response.data) : undefined,
      error: error.message,
      durationMs,
      rateLimitInfo: error.response ? this.extractRateLimitInfo(error.response) : undefined,
    };
  }

  /**
   * Get recent request logs
   */
  getRecentLogs(
    limit: number = 10,
    filters?: {
      toolName?: string;
      method?: string;
      statusCode?: number;
      startDate?: string;
      endDate?: string;
    }
  ): RequestLog[] {
    let logs = [...this.buffer].reverse(); // Most recent first

    // Apply filters
    if (filters) {
      if (filters.toolName) {
        logs = logs.filter((log) => log.toolName === filters.toolName);
      }
      if (filters.method) {
        logs = logs.filter((log) => log.method === filters.method);
      }
      if (filters.statusCode) {
        logs = logs.filter((log) => log.statusCode === filters.statusCode);
      }
      if (filters.startDate) {
        const startTime = new Date(filters.startDate).getTime();
        logs = logs.filter((log) => new Date(log.timestamp).getTime() >= startTime);
      }
      if (filters.endDate) {
        const endTime = new Date(filters.endDate).getTime();
        logs = logs.filter((log) => new Date(log.timestamp).getTime() <= endTime);
      }
    }

    return logs.slice(0, limit);
  }

  /**
   * Get performance metrics for all tools or a specific tool
   */
  getMetrics(toolName?: string): ToolMetrics[] {
    if (toolName) {
      const metric = this.metrics.get(toolName);
      return metric ? [metric] : [];
    }

    return Array.from(this.metrics.values());
  }

  /**
   * Clear all logs and metrics (useful for testing)
   */
  clear(): void {
    this.buffer = [];
    this.metrics.clear();
    this.correlationCounter = 0;
  }

  /**
   * Private helper methods
   */

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDirectory)) {
        fs.mkdirSync(this.logDirectory, { recursive: true, mode: 0o700 });
      } else {
        // Ensure permissions are correct for existing directory
        try {
          fs.chmodSync(this.logDirectory, 0o700);
        } catch {
          // Ignore if we can't change permissions (e.g. not owner)
        }
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
      this.enableFileLogging = false;
    }
  }

  private cleanupOldLogs(): void {
    try {
      if (!fs.existsSync(this.logDirectory)) return;

      const files = fs.readdirSync(this.logDirectory)
        .filter(file => file.startsWith('trakt-mcp-') && file.endsWith('.log'))
        .map(file => {
          const filePath = path.join(this.logDirectory, file);
          return {
            name: file,
            path: filePath,
            stats: fs.statSync(filePath)
          };
        })
        .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs); // Newest first

      const now = Date.now();
      const maxAgeMs = this.maxLogAge * 24 * 60 * 60 * 1000;

      // 1. Cleanup by count (keep only maxLogFiles)
      if (files.length > this.maxLogFiles) {
        const filesToDelete = files.slice(this.maxLogFiles);
        for (const file of filesToDelete) {
          try {
            fs.unlinkSync(file.path);
          } catch (err) {
            console.error(`Failed to delete excess log file ${file.name}:`, err);
          }
        }
      }

      // 2. Cleanup by age (for remaining files)
      const remainingFiles = files.slice(0, this.maxLogFiles);
      for (const file of remainingFiles) {
        try {
          if (now - file.stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(file.path);
          }
        } catch (err) {
          console.error(`Failed to cleanup old log file ${file.name}:`, err);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  private getNewLogFileName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.logDirectory, `trakt-mcp-${timestamp}.log`);
  }

  private writeToFile(log: RequestLog): void {
    try {
      // Ensure directory exists before writing
      this.ensureLogDirectory();

      const logLine = JSON.stringify(log) + '\n';
      const logSize = Buffer.byteLength(logLine);

      // Check if rotation needed
      if (this.currentFileSize + logSize > this.maxFileSize) {
        this.currentLogFile = this.getNewLogFileName();
        this.currentFileSize = 0;
        this.cleanupOldLogs(); // Cleanup after rotation
      }

      // Ensure file exists with correct permissions (600)
      if (!fs.existsSync(this.currentLogFile)) {
        const fd = fs.openSync(this.currentLogFile, 'w', 0o600);
        fs.closeSync(fd);
      }

      fs.appendFileSync(this.currentLogFile, logLine);
      this.currentFileSize += logSize;
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private updateMetrics(log: RequestLog): void {
    if (!log.toolName) return;

    const existing = this.metrics.get(log.toolName);

    if (existing) {
      const totalCalls = existing.totalCalls + 1;
      const successfulCalls = log.error ? existing.successfulCalls : existing.successfulCalls + 1;
      const failedCalls = log.error ? existing.failedCalls + 1 : existing.failedCalls;
      const totalDuration = existing.avgDurationMs * existing.totalCalls + log.durationMs;

      this.metrics.set(log.toolName, {
        toolName: log.toolName,
        totalCalls,
        successfulCalls,
        failedCalls,
        avgDurationMs: totalDuration / totalCalls,
        minDurationMs: Math.min(existing.minDurationMs, log.durationMs),
        maxDurationMs: Math.max(existing.maxDurationMs, log.durationMs),
        lastExecuted: log.timestamp,
      });
    } else {
      this.metrics.set(log.toolName, {
        toolName: log.toolName,
        totalCalls: 1,
        successfulCalls: log.error ? 0 : 1,
        failedCalls: log.error ? 1 : 0,
        avgDurationMs: log.durationMs,
        minDurationMs: log.durationMs,
        maxDurationMs: log.durationMs,
        lastExecuted: log.timestamp,
      });
    }
  }

  private buildFullUrl(config: AxiosRequestConfig): string {
    const baseURL = config.baseURL || '';
    const url = config.url || '';
    const fullUrl = baseURL + url;

    if (config.params) {
      const params = new URLSearchParams(config.params as Record<string, string>);
      return `${fullUrl}?${params.toString()}`;
    }

    return fullUrl;
  }

  private redactSensitiveHeaders(headers: Record<string, unknown>): Record<string, string> {
    const redacted: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'authorization') {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = String(value);
      }
    }

    return redacted;
  }

  private truncateResponseBody(body: unknown): unknown {
    if (!body) return body;

    const json = JSON.stringify(body);
    const maxLength = 5000; // 5KB truncation limit

    if (json.length > maxLength) {
      try {
        return {
          _truncated: true,
          _originalSize: json.length,
          data: JSON.parse(json.substring(0, maxLength)),
        };
      } catch {
        // If partial JSON is invalid, just return truncated string
        return {
          _truncated: true,
          _originalSize: json.length,
          data: json.substring(0, maxLength),
        };
      }
    }

    return body;
  }

  private extractRateLimitInfo(response: AxiosResponse): RequestLog['rateLimitInfo'] {
    const headers = response.headers;
    return {
      limit: headers['x-ratelimit-limit'] as string,
      remaining: headers['x-ratelimit-remaining'] as string,
      reset: headers['x-ratelimit-reset'] as string,
    };
  }
}

// Singleton logger instance
export const logger = new Logger();

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Logger Security & Maintenance', () => {
  let logger: Logger;
  let testLogDir: string;

  beforeEach(() => {
    // Create a unique test log directory
    testLogDir = path.join(os.tmpdir(), `trakt-mcp-security-test-${Date.now()}`);
  });

  afterEach(() => {
    // Clean up test logs
    if (logger) logger.clear();
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testLogDir, file));
      });
      fs.rmdirSync(testLogDir);
    }
    vi.restoreAllMocks();
  });

  it('should set directory permissions to 700 (rwx------)', () => {
    logger = new Logger({
      logDirectory: testLogDir,
      enableFileLogging: true,
    });

    // Check directory exists
    expect(fs.existsSync(testLogDir)).toBe(true);

    // Check permissions on POSIX systems
    if (process.platform !== 'win32') {
      const stats = fs.statSync(testLogDir);
      // Mode includes file type, so we mask with 0o777
      expect(stats.mode & 0o777).toBe(0o700);
    }
  });

  it('should set log file permissions to 600 (rw-------)', () => {
    logger = new Logger({
      logDirectory: testLogDir,
      enableFileLogging: true,
    });

    // Create a log entry to trigger file creation
    logger.logRequest({
      correlationId: 'test-sec-1',
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://test.com',
      headers: {},
      durationMs: 10,
    });

    const files = fs.readdirSync(testLogDir);
    expect(files.length).toBeGreaterThan(0);
    const logFile = path.join(testLogDir, files[0]);

    // Check permissions on POSIX systems
    if (process.platform !== 'win32') {
      const stats = fs.statSync(logFile);
      expect(stats.mode & 0o777).toBe(0o600);
    }
  });

  it('should cleanup logs older than 7 days', () => {
    // 1. Create dummy old files
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true, mode: 0o700 });
    }

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 8); // 8 days ago
    const oldFile = path.join(
      testLogDir,
      `trakt-mcp-${oldDate.toISOString().replace(/[:.]/g, '-')}.log`
    );

    fs.writeFileSync(oldFile, 'old log content');

    // Manually update mtime to be old (fs.writeFileSync sets it to now)
    fs.utimesSync(oldFile, oldDate, oldDate);

    // 2. Create dummy new file
    const newDate = new Date();
    const newFile = path.join(
      testLogDir,
      `trakt-mcp-${newDate.toISOString().replace(/[:.]/g, '-')}.log`
    );
    fs.writeFileSync(newFile, 'new log content');

    // 3. Initialize logger which should trigger cleanup
    logger = new Logger({
      logDirectory: testLogDir,
      enableFileLogging: true,
    });

    // 4. Verify old file is gone and new file remains
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it('should cleanup logs older than configured maxLogAge', () => {
    // 1. Create dummy old files
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true, mode: 0o700 });
    }

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 4); // 4 days ago
    const oldFile = path.join(
      testLogDir,
      `trakt-mcp-${oldDate.toISOString().replace(/[:.]/g, '-')}.log`
    );

    fs.writeFileSync(oldFile, 'old log content');
    fs.utimesSync(oldFile, oldDate, oldDate);

    // 2. Initialize logger with maxLogAge = 3
    logger = new Logger({
      logDirectory: testLogDir,
      enableFileLogging: true,
      maxLogAge: 3,
    });

    // 3. Verify old file is gone (4 days > 3 days)
    expect(fs.existsSync(oldFile)).toBe(false);
  });

  it('should respect maxLogFiles limit', () => {
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true, mode: 0o700 });
    }

    const maxFiles = 3;

    // Create more files than limit
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setMinutes(date.getMinutes() - i); // Different times
      const file = path.join(
        testLogDir,
        `trakt-mcp-${date.toISOString().replace(/[:.]/g, '-')}.log`
      );
      fs.writeFileSync(file, `content ${i}`);
      fs.utimesSync(file, date, date);
    }

    // Initialize logger with maxLogFiles = 3
    logger = new Logger({
      logDirectory: testLogDir,
      enableFileLogging: true,
      maxLogFiles: maxFiles,
    });

    // Count remaining log files
    const remainingFiles = fs.readdirSync(testLogDir).filter((f) => f.endsWith('.log'));

    // Should be maxFiles (new logger hasn't written yet, so no new file created)
    expect(remainingFiles.length).toBe(maxFiles);
  });

  it('should cleanup on rotation', () => {
    // Create a new logger with small max size to force rotation
    const rotationLogger = new Logger({
      logDirectory: testLogDir,
      enableFileLogging: true,
      maxFileSize: 10, // Small size
      maxLogFiles: 2, // Small file limit
    });

    // Use fake timers to ensure unique timestamps for rotated files
    vi.useFakeTimers();
    const startTime = new Date();

    // Generate logs to force multiple rotations
    // Each log is ~150 bytes, so each write forces rotation
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(startTime.getTime() + i * 1000));
      rotationLogger.logRequest({
        correlationId: `test-rot-${i}`,
        timestamp: new Date().toISOString(),
        method: 'GET',
        url: 'https://test.com',
        headers: {},
        durationMs: 10,
      });
    }

    vi.useRealTimers();

    const files = fs.readdirSync(testLogDir).filter((f) => f.endsWith('.log'));
    // Should have maxLogFiles (2) + current file = 3 files
    expect(files.length).toBe(3);
  });

  it('should respect custom log directory', () => {
    logger = new Logger({
      logDirectory: testLogDir,
      enableFileLogging: true,
    });

    expect(fs.existsSync(testLogDir)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WatchLogQueue } from '../../src/domain/trakt/watch-queue.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('WatchLogQueue Performance Tests', () => {
  let testDir: string;
  let queuePath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trakt-mcp-perf-test-'));
    queuePath = path.join(testDir, 'test-queue.jsonl');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Large Queue Files', () => {
    it('should handle 1000 entries efficiently', async () => {
      const queue = new WatchLogQueue(queuePath);
      const startTime = Date.now();

      // Add 1000 entries
      for (let i = 0; i < 1000; i++) {
        await queue.append(`watched movie ${i}`);
      }

      const addDuration = Date.now() - startTime;
      expect(addDuration).toBeLessThan(5000); // Should complete within 5 seconds

      // List all entries
      const listStart = Date.now();
      const entries = await queue.list();
      const listDuration = Date.now() - listStart;

      expect(entries).toHaveLength(1000);
      expect(listDuration).toBeLessThan(1000); // Listing should be fast
    });

    it('should handle reading last N entries from large file', async () => {
      const queue = new WatchLogQueue(queuePath);

      // Add 5000 entries
      for (let i = 0; i < 5000; i++) {
        await queue.append(`watched movie ${i}`);
      }

      // Read only last 100
      const startTime = Date.now();
      const entries = await queue.list(100);
      const duration = Date.now() - startTime;

      expect(entries).toHaveLength(100);
      expect(entries[entries.length - 1].rawText).toBe('watched movie 4999');
      expect(duration).toBeLessThan(500); // Should be fast even with large file
    });

    it('should handle concurrent appends', async () => {
      const queue = new WatchLogQueue(queuePath);

      // Concurrent appends
      const promises = Array.from({ length: 100 }, (_, i) =>
        queue.append(`watched movie ${i}`)
      );

      await Promise.all(promises);

      const entries = await queue.list();
      expect(entries.length).toBeGreaterThanOrEqual(100);
    });

    it('should efficiently filter pending entries from large queue', async () => {
      const queue = new WatchLogQueue(queuePath);

      // Add 1000 entries with mixed statuses
      for (let i = 0; i < 1000; i++) {
        const { entry } = await queue.append(`watched movie ${i}`);
        
        if (i % 3 === 0) {
          await queue.markSynced(entry.id);
        } else if (i % 5 === 0) {
          await queue.markFailed(entry.id, 'test failure');
        }
      }

      const startTime = Date.now();
      const pending = await queue.getPending();
      const duration = Date.now() - startTime;

      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every((e) => e.status === 'pending')).toBe(true);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Corrupted Data Handling', () => {
    it('should skip malformed JSON lines gracefully', async () => {
      // Write a file with some malformed lines
      const validEntry1 = JSON.stringify({
        id: 'test-1',
        rawText: 'watched movie 1',
        capturedAt: new Date().toISOString(),
        status: 'pending',
        source: 'cli',
      });
      const invalidJSON = 'this is not json{{{';
      const validEntry2 = JSON.stringify({
        id: 'test-2',
        rawText: 'watched movie 2',
        capturedAt: new Date().toISOString(),
        status: 'pending',
        source: 'cli',
      });

      fs.writeFileSync(queuePath, `${validEntry1}\n${invalidJSON}\n${validEntry2}\n`, {
        encoding: 'utf8',
      });

      const queue = new WatchLogQueue(queuePath);
      const entries = await queue.list();

      // Should only get 2 valid entries, skipping the malformed one
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('test-1');
      expect(entries[1].id).toBe('test-2');
    });

    it('should skip entries with invalid schema', async () => {
      // Write entries with missing required fields
      const validEntry = JSON.stringify({
        id: 'test-1',
        rawText: 'watched movie 1',
        capturedAt: new Date().toISOString(),
        status: 'pending',
        source: 'cli',
      });
      const invalidEntry1 = JSON.stringify({
        id: 'test-2',
        // missing rawText
        capturedAt: new Date().toISOString(),
        status: 'pending',
        source: 'cli',
      });
      const invalidEntry2 = JSON.stringify({
        id: 'test-3',
        rawText: 'watched movie 3',
        capturedAt: new Date().toISOString(),
        status: 'invalid-status', // invalid status value
        source: 'cli',
      });

      fs.writeFileSync(queuePath, `${validEntry}\n${invalidEntry1}\n${invalidEntry2}\n`, {
        encoding: 'utf8',
      });

      const queue = new WatchLogQueue(queuePath);
      const entries = await queue.list();

      // Should only get 1 valid entry
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('test-1');
    });

    it('should handle empty lines in queue file', async () => {
      const queue = new WatchLogQueue(queuePath);
      await queue.append('watched movie 1');

      // Manually add empty lines
      fs.appendFileSync(queuePath, '\n\n\n', { encoding: 'utf8' });

      await queue.append('watched movie 2');

      const entries = await queue.list();
      expect(entries).toHaveLength(2);
    });
  });

  describe('Archive Performance', () => {
    it('should archive large queue efficiently', async () => {
      const queue = new WatchLogQueue(queuePath);

      // Add 500 entries
      const ids: string[] = [];
      for (let i = 0; i < 500; i++) {
        const { entry } = await queue.append(`watched movie ${i}`);
        ids.push(entry.id);
      }

      // Mark half as synced
      for (let i = 0; i < 250; i++) {
        await queue.markSynced(ids[i]);
      }

      const startTime = Date.now();
      const archivePath = await queue.archive();
      const duration = Date.now() - startTime;

      expect(fs.existsSync(archivePath)).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

      // Verify queue now only has pending entries
      const remaining = await queue.list();
      expect(remaining.length).toBe(250);
      expect(remaining.every((e) => e.status === 'pending')).toBe(true);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not load entire file into memory when using limit', async () => {
      const queue = new WatchLogQueue(queuePath);

      // Add many entries
      for (let i = 0; i < 10000; i++) {
        await queue.append(`watched movie with very long title that takes up space ${i}`);
      }

      // Reading with limit should not cause memory issues
      const entries = await queue.list(10);
      expect(entries).toHaveLength(10);
    });
  });
});

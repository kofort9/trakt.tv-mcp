import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WatchLogQueue } from '../../src/domain/trakt/watch-queue.js';

describe('WatchLogQueue', () => {
  let queuePath: string;
  let tempDir: string;
  let queue: WatchLogQueue;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `trakt-mcp-logwatch-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    queuePath = path.join(tempDir, 'pending-logs.jsonl');
    queue = new WatchLogQueue(queuePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should append and list queued entries without altering raw text', async () => {
    const input = 'i watched columbus 2017 last week';
    const { entry, isDuplicate } = await queue.append(input);

    expect(isDuplicate).toBe(false);
    expect(entry.rawText).toBe(input);
    expect(entry.status).toBe('pending');
    expect(entry.source).toBe('cli');

    const listed = await queue.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(entry.id);
    expect(listed[0].rawText).toBe(input);
  });

  it('should skip duplicate raw text by default', async () => {
    const input = 'i watched columbus 2017 last week';
    const first = await queue.append(input);
    const second = await queue.append(input);

    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);

    const listed = await queue.list();
    expect(listed).toHaveLength(1);
  });

  it('should allow duplicates when explicitly requested', async () => {
    const input = 'i watched columbus 2017 last week';
    const first = await queue.append(input, 'cli', { allowDuplicate: true });
    const second = await queue.append(input, 'cli', { allowDuplicate: true });

    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(false);

    const listed = await queue.list();
    expect(listed).toHaveLength(2);
  });

  it('should respect secure file permissions on POSIX systems', async () => {
    await queue.append('watched Dune 2021 today');

    if (process.platform !== 'win32') {
      const stats = fs.statSync(queuePath);
      expect(stats.mode & 0o777).toBe(0o600);
    }
  });

  it('should honor list limits and keep newest entries last', async () => {
    await queue.append('first entry');
    await queue.append('second entry');

    const limited = await queue.list(1);
    expect(limited).toHaveLength(1);
    expect(limited[0].rawText).toBe('second entry');
  });

  describe('Enhanced Operations', () => {
    describe('Status Management', () => {
      it('should mark entry as synced with resolved content', async () => {
        const { entry } = await queue.append('watched Dune 2021');
        
        await queue.markSynced(entry.id, {
          type: 'movie',
          traktId: 12345,
          title: 'Dune',
          year: 2021,
        });

        const listed = await queue.list();
        expect(listed[0].status).toBe('synced');
        expect(listed[0].syncedAt).toBeTruthy();
        expect(listed[0].resolvedContent).toEqual({
          type: 'movie',
          traktId: 12345,
          title: 'Dune',
          year: 2021,
        });
      });

      it('should mark entry as failed with reason', async () => {
        const { entry } = await queue.append('watched something');
        
        await queue.markFailed(entry.id, 'No search results found');

        const listed = await queue.list();
        expect(listed[0].status).toBe('failed');
        expect(listed[0].failureReason).toBe('No search results found');
      });

      it('should mark entry as skipped', async () => {
        const { entry } = await queue.append('watched something');
        
        await queue.markSkipped(entry.id);

        const listed = await queue.list();
        expect(listed[0].status).toBe('skipped');
      });

      it('should throw error for non-existent entry ID', async () => {
        await expect(queue.markSynced('non-existent-id')).rejects.toThrow();
      });

      it('should update status multiple times', async () => {
        const { entry } = await queue.append('watched Dune');
        
        await queue.markFailed(entry.id, 'First failure');
        let listed = await queue.list();
        expect(listed[0].status).toBe('failed');
        
        await queue.markSynced(entry.id);
        listed = await queue.list();
        expect(listed[0].status).toBe('synced');
      });
    });

    describe('getPending', () => {
      it('should return only pending entries', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        const { entry: entry3 } = await queue.append('entry 3');
        
        await queue.markSynced(entry1.id);
        await queue.markFailed(entry2.id, 'Failed');

        const pending = await queue.getPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe(entry3.id);
      });

      it('should filter out synced entries', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markSynced(entry1.id);

        const pending = await queue.getPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe(entry2.id);
      });

      it('should filter out failed entries', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markFailed(entry1.id, 'Failed');

        const pending = await queue.getPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe(entry2.id);
      });

      it('should filter out skipped entries', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markSkipped(entry1.id);

        const pending = await queue.getPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe(entry2.id);
      });

      it('should return empty array when no pending entries', async () => {
        const { entry } = await queue.append('entry 1');
        await queue.markSynced(entry.id);

        const pending = await queue.getPending();
        expect(pending).toHaveLength(0);
      });
    });

    describe('archive', () => {
      it('should create timestamped archive file', async () => {
        await queue.append('entry 1');
        
        const archivePath = await queue.archive();
        
        expect(fs.existsSync(archivePath)).toBe(true);
        expect(archivePath).toContain('archive');
        expect(archivePath).toContain('pending-logs-');
      });

      it('should keep failed entries in active queue', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markSynced(entry1.id);
        await queue.markFailed(entry2.id, 'Failed');
        
        await queue.archive();

        const remaining = await queue.list();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe(entry2.id);
        expect(remaining[0].status).toBe('failed');
      });

      it('should keep skipped entries in active queue', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markSynced(entry1.id);
        await queue.markSkipped(entry2.id);
        
        await queue.archive();

        const remaining = await queue.list();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe(entry2.id);
        expect(remaining[0].status).toBe('skipped');
      });

      it('should keep pending entries in active queue', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markSynced(entry1.id);
        // entry2 remains pending
        
        await queue.archive();

        const remaining = await queue.list();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe(entry2.id);
        expect(remaining[0].status).toBe('pending');
      });

      it('should remove synced entries from active queue', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markSynced(entry1.id);
        await queue.markSynced(entry2.id);
        
        await queue.archive();

        const remaining = await queue.list();
        expect(remaining).toHaveLength(0);
      });

      it('should throw error if no queue file exists', async () => {
        // Don't append anything - no queue file
        await expect(queue.archive()).rejects.toThrow('No queue file to archive');
      });

      it('should handle empty queue', async () => {
        await queue.append('entry 1');
        // Immediately archive without processing
        
        const archivePath = await queue.archive();
        
        expect(fs.existsSync(archivePath)).toBe(true);
        
        // Should keep pending entry
        const remaining = await queue.list();
        expect(remaining).toHaveLength(1);
      });

      it('should preserve original queue content in archive', async () => {
        const { entry: entry1 } = await queue.append('entry 1');
        const { entry: entry2 } = await queue.append('entry 2');
        
        await queue.markSynced(entry1.id);
        
        const archivePath = await queue.archive();
        
        // Read archive file
        const archiveContent = fs.readFileSync(archivePath, 'utf8');
        const archiveLines = archiveContent.trim().split('\n');
        
        // Archive should have both entries
        expect(archiveLines).toHaveLength(2);
      });
    });
  });
});

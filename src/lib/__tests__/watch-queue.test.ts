import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WatchLogQueue } from '../watch-queue.js';

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
});

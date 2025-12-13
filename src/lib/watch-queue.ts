import { appendFile, mkdir, readFile, writeFile, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { homedir } from 'os';

const DEFAULT_QUEUE_PATH = join(homedir(), '.trakt-mcp', 'pending-logs.jsonl');

export type WatchEntryStatus = 'pending';
export type WatchEntrySource = 'cli' | 'api' | 'slack' | 'system';

export interface WatchQueueEntry {
  id: string;
  rawText: string;
  capturedAt: string;
  status: WatchEntryStatus;
  source: WatchEntrySource;
}

export interface AppendOptions {
  allowDuplicate?: boolean;
}

export interface AppendResult {
  entry: WatchQueueEntry;
  isDuplicate: boolean;
}

/**
 * Lightweight local queue for capturing natural-language watch logs when AI/Trakt is unavailable.
 *
 * The queue is append-only JSONL for durability, stored at ~/.trakt-mcp/pending-logs.jsonl with
 * owner-only permissions (600). Each entry captures the raw text exactly as provided.
 */
export class WatchLogQueue {
  private queueFilePath: string;

  constructor(queueFilePath: string = DEFAULT_QUEUE_PATH) {
    this.queueFilePath = queueFilePath;
  }

  getQueueFilePath(): string {
    return this.queueFilePath;
  }

  /**
   * Append a new watch entry to the local queue.
   */
  async append(
    rawText: string,
    source: WatchEntrySource = 'cli',
    options?: AppendOptions
  ): Promise<AppendResult> {
    const hasContent = rawText.trim().length > 0;
    if (!hasContent) {
      throw new Error('Cannot queue an empty watch entry');
    }

    await this.ensureQueueFile();

    if (!options?.allowDuplicate) {
      const duplicate = await this.findDuplicate(rawText);
      if (duplicate) {
        return { entry: duplicate, isDuplicate: true };
      }
    }

    const entry: WatchQueueEntry = {
      id: randomUUID(),
      rawText,
      capturedAt: new Date().toISOString(),
      status: 'pending',
      source,
    };

    await appendFile(this.queueFilePath, JSON.stringify(entry) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });

    return { entry, isDuplicate: false };
  }

  /**
   * Read queue entries (newest last). Defaults to the full file; pass a limit to truncate.
   */
  async list(limit?: number): Promise<WatchQueueEntry[]> {
    if (!existsSync(this.queueFilePath)) {
      return [];
    }

    const content = await readFile(this.queueFilePath, 'utf8');
    if (!content.trim()) {
      return [];
    }

    const lines = content.split(/\r?\n/).filter(Boolean);
    const slice = typeof limit === 'number' && limit > 0 ? lines.slice(-limit) : lines;

    const entries: WatchQueueEntry[] = [];
    for (const line of slice) {
      try {
        entries.push(JSON.parse(line) as WatchQueueEntry);
      } catch {
        // Skip malformed lines to avoid breaking listing when the file is partially corrupted.
        continue;
      }
    }
    return entries;
  }

  private normalize(rawText: string): string {
    return rawText.trim().replace(/\s+/g, ' ');
  }

  private async findDuplicate(rawText: string): Promise<WatchQueueEntry | null> {
    if (!existsSync(this.queueFilePath)) {
      return null;
    }

    const normalizedIncoming = this.normalize(rawText);
    const content = await readFile(this.queueFilePath, 'utf8');
    if (!content.trim()) return null;

    const lines = content.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as WatchQueueEntry;
        const normalizedExisting = this.normalize(parsed.rawText || '');
        if (normalizedExisting === normalizedIncoming) {
          return parsed;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async ensureQueueFile(): Promise<void> {
    await mkdir(dirname(this.queueFilePath), { recursive: true, mode: 0o700 });

    if (!existsSync(this.queueFilePath)) {
      await writeFile(this.queueFilePath, '', { encoding: 'utf8', mode: 0o600 });
    } else if (process.platform !== 'win32') {
      await chmod(this.queueFilePath, 0o600);
    }
  }
}

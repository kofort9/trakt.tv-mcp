import { appendFile, mkdir, readFile, writeFile, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import { homedir } from 'os';

const DEFAULT_QUEUE_PATH = join(homedir(), '.trakt-mcp', 'pending-logs.jsonl');
const ARCHIVE_DIR = join(homedir(), '.trakt-mcp', 'archive');

export type WatchEntryStatus = 'pending' | 'synced' | 'failed' | 'skipped';
export type WatchEntrySource = 'cli' | 'api' | 'slack' | 'system';

export interface WatchQueueEntry {
  id: string;
  rawText: string;
  capturedAt: string;
  status: WatchEntryStatus;
  source: WatchEntrySource;
  syncedAt?: string;
  failureReason?: string;
  resolvedContent?: {
    type: 'episode' | 'movie';
    traktId: number;
    title: string;
    year?: number;
    season?: number;
    episode?: number;
  };
}

export interface AppendOptions {
  allowDuplicate?: boolean;
}

export interface AppendResult {
  entry: WatchQueueEntry;
  isDuplicate: boolean;
}

/**
 * Validate if an object is a valid WatchQueueEntry
 */
function isValidWatchQueueEntry(obj: unknown): obj is WatchQueueEntry {
  if (!obj || typeof obj !== 'object') return false;
  
  const entry = obj as Record<string, unknown>;
  
  // Required fields
  if (typeof entry.id !== 'string' || !entry.id) return false;
  if (typeof entry.rawText !== 'string') return false;
  if (typeof entry.capturedAt !== 'string' || !entry.capturedAt) return false;
  if (!['pending', 'synced', 'failed', 'skipped'].includes(entry.status as string)) return false;
  if (!['cli', 'api', 'slack', 'system'].includes(entry.source as string)) return false;
  
  // Optional fields type checks
  if (entry.syncedAt !== undefined && typeof entry.syncedAt !== 'string') return false;
  if (entry.failureReason !== undefined && typeof entry.failureReason !== 'string') return false;
  
  if (entry.resolvedContent !== undefined) {
    const resolved = entry.resolvedContent as Record<string, unknown>;
    if (!['episode', 'movie'].includes(resolved.type as string)) return false;
    if (typeof resolved.traktId !== 'number') return false;
    if (typeof resolved.title !== 'string') return false;
    if (resolved.year !== undefined && typeof resolved.year !== 'number') return false;
    if (resolved.season !== undefined && typeof resolved.season !== 'number') return false;
    if (resolved.episode !== undefined && typeof resolved.episode !== 'number') return false;
  }
  
  return true;
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
        const parsed = JSON.parse(line);
        if (isValidWatchQueueEntry(parsed)) {
          entries.push(parsed);
        }
        // Skip invalid entries silently to avoid breaking listing when the file is partially corrupted
      } catch {
        // Skip malformed JSON lines to avoid breaking listing when the file is partially corrupted.
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

  /**
   * Get only pending entries (not synced, failed, or skipped)
   */
  async getPending(): Promise<WatchQueueEntry[]> {
    const allEntries = await this.list();
    return allEntries.filter((entry) => entry.status === 'pending');
  }

  /**
   * Mark an entry as successfully synced
   */
  async markSynced(
    id: string,
    resolvedContent?: WatchQueueEntry['resolvedContent']
  ): Promise<void> {
    await this.updateEntryStatus(id, 'synced', {
      syncedAt: new Date().toISOString(),
      resolvedContent,
    });
  }

  /**
   * Mark an entry as failed with reason
   */
  async markFailed(id: string, reason: string): Promise<void> {
    await this.updateEntryStatus(id, 'failed', {
      failureReason: reason,
    });
  }

  /**
   * Mark an entry as skipped
   */
  async markSkipped(id: string): Promise<void> {
    await this.updateEntryStatus(id, 'skipped');
  }

  /**
   * Archive current queue file and rewrite with only failed/skipped entries
   *
   * @returns Path to archived file
   */
  async archive(): Promise<string> {
    if (!existsSync(this.queueFilePath)) {
      throw new Error('No queue file to archive');
    }

    // Ensure archive directory exists
    await mkdir(ARCHIVE_DIR, { recursive: true, mode: 0o700 });

    // Create timestamped archive filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('T');
    const archivePath = join(ARCHIVE_DIR, `pending-logs-${timestamp}.jsonl`);

    // Copy current queue to archive
    const content = await readFile(this.queueFilePath, 'utf8');
    await writeFile(archivePath, content, { encoding: 'utf8', mode: 0o600 });

    // Get all entries
    const allEntries = await this.list();

    // Keep only failed and skipped entries
    const entriesToKeep = allEntries.filter(
      (entry) =>
        entry.status === 'failed' || entry.status === 'skipped' || entry.status === 'pending'
    );

    // Rewrite queue with only entries to keep
    const newContent =
      entriesToKeep.map((entry) => JSON.stringify(entry)).join('\n') +
      (entriesToKeep.length > 0 ? '\n' : '');
    await writeFile(this.queueFilePath, newContent, { encoding: 'utf8', mode: 0o600 });

    return archivePath;
  }

  /**
   * Update the status of a queue entry
   */
  private async updateEntryStatus(
    id: string,
    status: WatchEntryStatus,
    updates?: Partial<WatchQueueEntry>
  ): Promise<void> {
    if (!existsSync(this.queueFilePath)) {
      throw new Error('Queue file does not exist');
    }

    const content = await readFile(this.queueFilePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);

    let found = false;
    const updatedLines = lines.map((line) => {
      try {
        const entry = JSON.parse(line) as WatchQueueEntry;
        if (entry.id === id) {
          found = true;
          return JSON.stringify({
            ...entry,
            status,
            ...updates,
          });
        }
        return line;
      } catch {
        return line; // Keep malformed lines as-is
      }
    });

    if (!found) {
      throw new Error(`Entry with id ${id} not found in queue`);
    }

    await writeFile(this.queueFilePath, updatedLines.join('\n') + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
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

#!/usr/bin/env node
/* eslint-disable no-console */
import { WatchLogQueue } from './lib/watch-queue.js';
import { logError } from './lib/logging.js';

function printUsage(): void {
  console.log(`logwatch - queue watch logs locally when AI is unavailable

Usage:
  logwatch "<natural language note>"
      Queues the note in ~/.trakt-mcp/pending-logs.jsonl for later resolution (raw text only).

  logwatch list [limit]
      Show queued entries (newest last). Optionally pass a limit (default: all).`);
}

async function handleList(queue: WatchLogQueue, limitArg?: string): Promise<void> {
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;
  const entries = await queue.list(Number.isFinite(limit) ? limit : undefined);

  if (!entries.length) {
    console.log(`No queued watch entries. File: ${queue.getQueueFilePath()}`);
    return;
  }

  console.log(`Queued watch entries (${entries.length}):`);
  for (const entry of entries) {
    console.log(`- ${entry.id} | ${entry.status} | ${entry.capturedAt} | ${entry.rawText}`);
  }
  console.log(`File: ${queue.getQueueFilePath()}`);
}

async function handleAppend(queue: WatchLogQueue, args: string[]): Promise<void> {
  const note = args.join(' ').trim();
  if (!note) {
    printUsage();
    throw new Error('Please provide the note to log, for example: logwatch "watched Dune 2021"');
  }

  const { entry, isDuplicate } = await queue.append(note, 'cli');

  if (isDuplicate) {
    console.log('Already queued (not added again).');
    console.log(`  id: ${entry.id}`);
    console.log(`  capturedAt: ${entry.capturedAt}`);
    console.log(`  raw: ${entry.rawText}`);
    console.log(`  file: ${queue.getQueueFilePath()}`);
    return;
  }

  console.log('Queued offline watch entry.');
  console.log(`  id: ${entry.id}`);
  console.log(`  capturedAt: ${entry.capturedAt}`);
  console.log(`  raw: ${entry.rawText}`);
  console.log(`  stored in: ${queue.getQueueFilePath()}`);
  console.log('Re-run with `logwatch list` to review or export the queue later.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const queue = new WatchLogQueue();

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  if (args[0] === 'list') {
    await handleList(queue, args[1]);
    return;
  }

  await handleAppend(queue, args);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`logwatch failed: ${message}`);
  process.exit(1);
});

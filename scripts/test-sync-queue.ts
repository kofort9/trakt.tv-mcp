import { syncLogwatchQueue } from '../dist/domain/trakt/tools.js';
import { TraktClient } from '../dist/domain/trakt/trakt-client.js';
import * as fs from 'fs';

const QUEUE_PATH = '/Users/kofifort/.trakt-mcp/pending-logs.jsonl';
const TOKEN_PATH = '/Users/kofifort/.trakt-mcp/.trakt-token.json';

async function main() {
  console.log('=== Testing sync_logwatch_queue MCP Tool ===\n');

  // Read auth token
  const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));

  // Get env vars
  const clientId = process.env.TRAKT_CLIENT_ID;
  const clientSecret = process.env.TRAKT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET must be set');
    process.exit(1);
  }

  // Create client
  const client = new TraktClient(
    clientId,
    clientSecret,
    tokenData.access_token,
    tokenData.refresh_token
  );

  console.log('Step 1: Show summary (preview mode)');
  console.log('=====================================\n');

  const summaryResult = await syncLogwatchQueue(client, {
    queuePath: QUEUE_PATH,
    showSummary: true,
  });

  console.log('Summary Result:');
  console.log(JSON.stringify(summaryResult, null, 2));

  if (summaryResult.data?.formattedTable) {
    console.log('\n' + summaryResult.data.formattedTable);
  }

  console.log('\n\nStep 2: Dry run mode');
  console.log('====================\n');

  const dryRunResult = await syncLogwatchQueue(client, {
    queuePath: QUEUE_PATH,
    dryRun: true,
  });

  console.log('Dry Run Result:');
  console.log(JSON.stringify(dryRunResult, null, 2));

  if (dryRunResult.data?.formattedTable) {
    console.log('\n' + dryRunResult.data.formattedTable);
  }
}

main().catch(console.error);

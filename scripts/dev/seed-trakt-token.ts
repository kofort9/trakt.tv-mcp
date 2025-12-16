#!/usr/bin/env tsx
import { homedir } from 'os';
import { join } from 'path';
import { loadConfig } from '../../src/core/config.js';
import { TraktOAuth } from '../../src/domain/trakt/oauth.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const oauth = new TraktOAuth(config);

  if (oauth.isAuthenticated()) {
    console.log('✅ Trakt token already present at ~/.trakt-mcp/.trakt-token.json');
    return;
  }

  console.log('🔑 Starting Trakt device authorization flow...');
  const device = await oauth.initiateDeviceFlow();
  console.log(`Visit: ${device.verification_url}`);
  console.log(`Code : ${device.user_code}`);
  console.log('Waiting for approval (polling Trakt)...');

  await oauth.pollForToken(device.device_code, device.interval);

  const tokenPath = join(homedir(), '.trakt-mcp', '.trakt-token.json');
  console.log('✅ Token saved:', tokenPath);
  console.log("Tip: export TRAKT_TOKEN_JSON='<contents of token file>' for headless runs.");
}

main().catch((error) => {
  console.error('❌ Failed to seed Trakt token:', error instanceof Error ? error.message : error);
  process.exit(1);
});

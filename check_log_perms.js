const fs = require('fs');
const path = require('path');
const os = require('os');
const { Logger } = require('./dist/lib/logger'); // Assuming build exists, or I'll adjust path

// We can't easily use the Logger class from JS if it's TS and not built yet in the way we expect?
// Actually, let's look at the dist folder structure in the project_layout.
// dist/lib/logger.js exists.

async function run() {
  console.log('--- Current Behavior Check ---');
  
  const logDir = path.join(os.tmpdir(), 'trakt-mcp-logs');
  console.log(`Log Directory: ${logDir}`);

  if (fs.existsSync(logDir)) {
    const stats = fs.statSync(logDir);
    console.log(`Directory Mode: ${stats.mode.toString(8)}`);
    
    const files = fs.readdirSync(logDir);
    if (files.length > 0) {
        const fileStats = fs.statSync(path.join(logDir, files[0]));
        console.log(`File Mode: ${fileStats.mode.toString(8)}`);
    } else {
        console.log('No log files found to check permissions.');
    }
  } else {
      console.log('Log directory does not exist yet.');
  }
  
  console.log('------------------------------');
}

run().catch(console.error);








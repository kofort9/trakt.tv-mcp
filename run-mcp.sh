#!/bin/bash
# MCP wrapper script for Claude Desktop integration
# Suppresses dotenv banner to ensure clean JSON-RPC stdout

set -e

# Resolve script directory (works regardless of where script is called from)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Verify build exists
if [ ! -f "dist/index.js" ]; then
  echo "Error: dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

# Suppress dotenv banner for clean MCP protocol output
export DOTENV_CONFIG_QUIET=true
exec node dist/index.js

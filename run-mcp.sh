#!/usr/bin/env bash
# MCP wrapper script for Claude Desktop integration
# Suppresses dotenv banner to ensure clean JSON-RPC stdout

set -e

# Resolve script directory (works regardless of where script is called from)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Verify Node.js is available
if ! command -v node &> /dev/null; then
  echo "Error: Node.js not found. Install Node.js 20.x or later." >&2
  exit 1
fi

# Verify build exists
if [ ! -f "dist/index.js" ]; then
  echo "Error: dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

# Warn if .env is missing (don't fail - allows running for testing)
if [ ! -f ".env" ]; then
  echo "Warning: .env file not found. Copy .env.example to .env and configure credentials." >&2
fi

# Suppress dotenv banner for clean MCP protocol output
export DOTENV_CONFIG_QUIET=true

# Use exec to replace shell process - ensures proper signal handling for MCP
# and prevents orphan shell processes when Claude Desktop manages the server
exec node dist/index.js

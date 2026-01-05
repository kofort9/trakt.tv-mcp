#!/bin/bash
cd /Users/kofifort/Repos/trakt.tv-mcp
export DOTENV_CONFIG_QUIET=true
source .env 2>/dev/null
exec node dist/index.js

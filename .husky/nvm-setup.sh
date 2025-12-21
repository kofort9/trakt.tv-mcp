#!/bin/sh
# Shared NVM setup for Husky hooks
# Git hooks run in non-interactive shells that don't source ~/.bashrc
# This script sources nvm and validates Node version requirements

# Source nvm if available
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh" --no-use
  # Use .nvmrc version if it exists
  if [ -f ".nvmrc" ]; then
    nvm use >/dev/null 2>&1 || true
  fi
fi

# Verify Node version meets minimum requirements
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ -z "$NODE_VERSION" ]; then
  echo "❌ Error: Node.js not found in PATH"
  echo "   Install Node 18+ and ensure it's in your PATH"
  exit 1
fi

if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo "❌ Error: Node $NODE_VERSION detected. This project requires Node 18.18+ or 20.x"
  echo "   Use nvm/fnm/asdf/volta to switch (e.g., 'nvm use 18', 'fnm use 18', 'volta pin node@18', 'asdf local nodejs 18.18.0')"
  exit 1
fi

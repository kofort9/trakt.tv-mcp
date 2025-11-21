# Git Hooks

This directory contains Git hooks managed by [Husky](https://typicode.github.io/husky/).

## Hooks

### `pre-commit`
Runs **before every commit** to ensure code quality:
- ✨ **Prettier**: Auto-formats all TypeScript files
- 🔍 **ESLint**: Checks for code quality issues

**Purpose**: Ensures consistent code style across all commits.

### `pre-push`
Runs **before pushing to remote** to ensure code correctness:
- 🧪 **Tests**: Runs the full test suite

**Purpose**: Prevents broken code from being pushed to remote branches.

## Manual Execution

You can manually run these checks at any time:

```bash
# Format code
npm run format

# Lint code
npm run lint

# Run tests
npm test

# Run all checks (format + build + lint + test)
npm run verify
```

## Bypassing Hooks

⚠️ **Not recommended**, but if you need to bypass hooks:

```bash
# Skip pre-commit hook
git commit --no-verify

# Skip pre-push hook
git push --no-verify
```

## Setup

Hooks are automatically installed when you run `npm install` (via the `prepare` script in `package.json`).


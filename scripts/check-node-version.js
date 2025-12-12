const versionString = process.versions.node;
const [major, minor, patch] = versionString.split('.').map(Number);

if ([major, minor, patch].some((n) => Number.isNaN(n))) {
  console.error(`Unable to parse Node.js version: ${versionString}`);
  process.exit(1);
}

if (major < 20) {
  console.error(
    [
      `Node.js >=20 is required. Detected ${versionString}.`,
      'Use `.nvmrc` (nvm use) or Homebrew node@20 (`export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`).',
    ].join(' ')
  );
  process.exit(1);
}

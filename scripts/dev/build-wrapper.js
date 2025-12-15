#!/usr/bin/env node
import { execSync } from 'child_process';
const args = process.argv.slice(2);
execSync(`tsc ${args.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit', shell: true });

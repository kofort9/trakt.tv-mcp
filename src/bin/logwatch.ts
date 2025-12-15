#!/usr/bin/env node
import { handleLogwatchError, runLogwatchCli } from '../cli/logwatch/index.js';

runLogwatchCli().catch((error) => {
  handleLogwatchError(error);
  process.exit(1);
});

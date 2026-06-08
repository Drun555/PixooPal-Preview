#!/usr/bin/env node
import { runCli } from '../lib/cli.mjs';

runCli(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PixooPal Preview error: ${message}`);
  process.exit(1);
});

import { createClockface } from './create.mjs';
import { buildClockface, runPreviewServer } from './run.mjs';

export async function runCli(argv) {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'create') {
    await createClockface(rest);
    return;
  }

  if (command === 'run') {
    await runPreviewServer(rest);
    return;
  }

  if (command === 'build') {
    await buildClockface({ watch: false });
    return;
  }

  throw new Error(`Unknown command "${command}". Run "pixoopal-preview --help" for usage.`);
}

function printHelp() {
  console.log(`PixooPal Preview

Usage:
  pixoopal-preview create
  pixoopal-preview run [--host 127.0.0.1] [--port 4174]
  pixoopal-preview build

Commands:
  create  Scaffold a standalone Clockface project.
  run     Build the current Clockface and start the preview server.
  build   Build the current Clockface without starting the server.`);
}

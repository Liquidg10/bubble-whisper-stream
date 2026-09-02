#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLocalFenceReadiness } from './lib/source-write-fence-readiness.mjs';

// Intentionally no execute/confirmation flags, network, credentials or writes.
if (process.argv.length !== 2) {
  console.error('usage: node scripts/check-source-write-fence-readiness.mjs (read-only; no overrides)');
  process.exitCode = 1;
} else {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    console.log(JSON.stringify(buildLocalFenceReadiness(root), null, 2));
    process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Source inspection failed');
    process.exitCode = 1;
  }
}

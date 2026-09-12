#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubjectScope } from './lib/migration-subject-scope.mjs';
import { buildStorageIngressReadiness, loadStorageIngressObservations } from './lib/storage-ingress-readiness.mjs';

// No credentials, network, database connection, activation flag, or writes.
try {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!['--subject-scope', '--observations'].includes(name) || options[name] !== undefined
      || typeof args[index + 1] !== 'string' || args[index + 1].startsWith('--')) throw new Error('Invalid arguments');
    options[name] = args[index + 1];
  }
  if (Object.keys(options).length !== 0 && Object.keys(options).length !== 2) throw new Error('Paired inputs required');
  const input = Object.keys(options).length === 0 ? {} : {
    scope: loadSubjectScope(options['--subject-scope']),
    observations: loadStorageIngressObservations(options['--observations']),
  };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(JSON.stringify(buildStorageIngressReadiness(root, input), null, 2));
  process.exitCode = 2;
} catch {
  // Do not reflect untrusted private packet contents, paths, or argument values.
  console.error('Storage ingress diagnostic failed. Use no arguments, or paired --subject-scope ABS_PRIVATE --observations ABS_PRIVATE with exact current bindings. No override is supported.');
  process.exitCode = 1;
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const viteEntry = join(repository, 'node_modules/vite/bin/vite.js');
const configuration = join(repository, 'vite.config.ts');
const source = 'ekekeywoxvdbfbmqyhjy';
const target = 'fjxedbaskrbewjunfxaj';
const fakeKey = `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`;
const profile = { VITE_MIND_MANUAL_DEPLOYMENT_MODE: 'owner-isolated',
  VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://owner.example.test' };
const publicConfiguration = ref => ({ VITE_SUPABASE_PROJECT_ID: ref,
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: fakeKey });

// Do not pass inherited VITE_ overrides, credentials, NODE_OPTIONS, or dotenv
// paths into the child. Only ordinary executable/platform/temp locations survive.
const platformNames = new Set(['PATH', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'TMP', 'TEMP', 'TMPDIR']);
const cleanEnvironment = Object.fromEntries(Object.keys(process.env)
  .filter(name => !name.startsWith('VITE_') && platformNames.has(name))
  .map(name => [name, process.env[name]]));

function rejectsBeforeBuild(environment, expectedCode) {
  assert.equal(Object.keys(cleanEnvironment).some(name => name.startsWith('VITE_')), false);
  assert.ok(existsSync(viteEntry), 'The installed Vite CLI is required; missing tooling is not a passing rejection.');
  const temporaryRoot = resolve(tmpdir());
  const scratch = mkdtempSync(join(temporaryRoot, 'mind-manual-negative-build-'));
  const outputDirectory = join(scratch, 'never-produced-dist');
  try {
    // cwd is a fresh empty directory: the real config's loadEnv cannot read any
    // repository/private .env file. The absolute config still exercises Vite's
    // real CLI, config loading, and deployment-boundary hook before compilation.
    const result = spawnSync(process.execPath, [viteEntry, 'build', '--config', configuration, '--outDir', outputDirectory], {
      cwd: scratch,
      env: { ...cleanEnvironment, NODE_ENV: 'production', NO_COLOR: '1', FORCE_COLOR: '0', ...environment },
      encoding: 'utf8', timeout: 30_000, maxBuffer: 256 * 1024,
    });
    assert.equal(result.error === undefined, true, 'Vite must settle without spawn, timeout, or output-buffer errors.');
    assert.equal(result.signal, null, 'A killed build is not a verified configuration rejection.');
    assert.equal(result.status, 1, 'Vite must deliberately reject this configuration.');
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const codes = [...new Set([...output.matchAll(/Mind Manual deployment boundary rejected \(([a-z-]+)\)\./gu)]
      .map(match => match[1]))];
    // Only bounded rejection codes become assertion evidence. An unrelated
    // missing entrypoint, dependency/config syntax error, or arbitrary exit fails.
    assert.deepEqual(codes, [expectedCode], 'Vite did not report the exact expected deployment-boundary rejection.');
    assert.equal(/\bbuilding\b|\bmodules transformed\b|\bbuilt in\b/u.test(output), false, 'Compilation must not start.');
    assert.equal(output.includes(fakeKey), false, 'The public fixture key must not be reflected in failure output.');
    assert.equal(output.includes('invalid-origin-sentinel'), false, 'Invalid origin input must not be reflected in failure output.');
    assert.equal(existsSync(outputDirectory), false, 'No build output directory may be produced.');
  } finally {
    // Delete only this exact test-created directory, never a repository/output
    // supplied by an environment variable or caller.
    assert.equal(dirname(scratch), temporaryRoot);
    assert.ok(basename(scratch).startsWith('mind-manual-negative-build-'));
    assert.equal(lstatSync(scratch).isSymbolicLink(), false);
    rmSync(scratch, { recursive: true, force: false });
  }
}

describe('real Vite CLI rejects invalid deployment configuration before compilation', { concurrency: false }, () => {
  const cases = [
    ['target without explicit profile', publicConfiguration(target), 'project-boundary-mismatch'],
    ['mode-only process profile', { ...publicConfiguration(target), VITE_MIND_MANUAL_DEPLOYMENT_MODE: profile.VITE_MIND_MANUAL_DEPLOYMENT_MODE }, 'partial-profile'],
    ['origin-only process profile', { ...publicConfiguration(target), VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: profile.VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN }, 'partial-profile'],
    ['isolated target at shared public origin', { ...publicConfiguration(target), ...profile,
      VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://bubble-whisper-stream.lovable.app' }, 'shared-origin-forbidden'],
    ['isolated target at shared named preview', { ...publicConfiguration(target), ...profile,
      VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://preview--bubble-whisper-stream.lovable.app' }, 'shared-origin-forbidden'],
    ['isolated target at shared project preview', { ...publicConfiguration(target), ...profile,
      VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://id-preview--8d3041fb-8df4-4afe-87e4-b56a10af1d00.lovable.app' }, 'shared-origin-forbidden'],
    ['source with owner-isolated profile', { ...publicConfiguration(source), ...profile }, 'project-boundary-mismatch'],
    ['malformed non-origin URL', { ...publicConfiguration(target), ...profile,
      VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://owner.example.test/invalid-origin-sentinel' }, 'invalid-origin'],
  ];
  for (const [name, environment, code] of cases) it(name, () => rejectsBeforeBuild(environment, code));
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(REPO, 'scripts/export-isolated-supabase-schema.sh');
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// Every provider/database command below is a deterministic offline executable.
// A private PATH and a clean child environment prevent fallback to real tools,
// local credentials, a linked checkout, or PG* connection defaults.
const FAKE_CLI = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.MIND_MANUAL_EXPORT_FIXTURE_ROOT;
const mode = process.env.MIND_MANUAL_EXPORT_FIXTURE_MODE;
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const log = (value) => fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(value) + '\n');
const write = (value) => process.stdout.write(value);
const bail = () => { process.stderr.write('unexpected synthetic invocation: ' + JSON.stringify({ tool, args, temporary: process.env.TMPDIR }) + '\n'); process.exit(97); };
if (!root || !mode || !path.isAbsolute(root)) bail();
log({ tool, args });
if (tool === 'mktemp') {
  if (JSON.stringify(args) !== JSON.stringify(['-d'])) bail();
  write(fs.mkdtempSync(path.join(root, 'work/dump-')) + '\n');
} else if (tool === 'supabase') {
  if (JSON.stringify(args) !== JSON.stringify(['db', 'dump', '--linked', '--schema', 'public', '--dry-run'])) bail();
  if (mode === 'cli-error') {
    process.stderr.write('synthetic-private-login-must-not-escape\n'); process.exit(42);
  }
  write('export PGHOST="fixture-db.invalid"\nexport PGPORT="5432"\nexport PGUSER="fixture-user"\nexport PGPASSWORD="synthetic-private-login-must-not-escape"\nexport PGDATABASE="fixture-db"\n');
} else {
  const option = (name) => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  if (option('--host') !== 'fixture-db.invalid' || option('--port') !== '5432' || option('--username') !== 'fixture-user' || option('--dbname') !== 'fixture-db' || process.env.PGPASSWORD !== 'synthetic-private-login-must-not-escape') bail();
  if (tool === 'psql') {
    const sql = option('--command');
    if (!sql || !args.includes('--no-psqlrc') || !args.includes('ON_ERROR_STOP=1')) bail();
    if (sql.startsWith('SELECT EXISTS (SELECT 1 FROM pg_namespace')) {
      const counterPath = path.join(root, 'guard-probe-count');
      const count = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, 'utf8')) + 1 : 1;
      fs.writeFileSync(counterPath, String(count));
      const guarded = mode === 'guard-before' || (mode === 'guard-after' && count === 2);
      write(mode === 'guard-unknown' ? 'unknown\n' : (guarded ? 't\n' : 'f\n'));
    } else if (sql.startsWith('WITH expected(name)') && (sql.includes('pg_catalog.pg_class') || sql.includes('object_count'))) {
      write('');
    } else if (sql.startsWith('SET ROLE postgres; SELECT pg_catalog.pg_get_functiondef')) {
      write(mode === 'dump-guard-function' ? 'CREATE FUNCTION public.mind_manual_admit_edge() RETURNS boolean LANGUAGE sql AS \'SELECT true\';\n' : 'CREATE FUNCTION public.fixture_rpc() RETURNS text LANGUAGE sql AS \'SELECT \'\'fixture\'\'\';\n');
    } else bail();
  } else if (tool === 'pg_dump') {
    const target = option('--file');
    const temporary = process.env.TMPDIR;
    if (!target || !path.resolve(target).startsWith(path.resolve(temporary) + path.sep) || !args.includes('--table=public.fixture_table') || !args.includes('--schema-only')) bail();
    if (args.includes('--section=pre-data')) {
      fs.writeFileSync(target, mode === 'dump-guard-schema' ? 'CREATE SCHEMA mind_manual_migration;\n' : '\\restrict fixture\nCREATE TABLE public.fixture_table (id uuid PRIMARY KEY);\n\\unrestrict fixture\n');
    } else if (args.includes('--section=post-data')) {
      fs.writeFileSync(target, mode === 'dump-guard-trigger' ? 'CREATE TRIGGER mind_manual_subject_write_fence BEFORE INSERT ON public.fixture_table EXECUTE FUNCTION fixture();\n' : mode === 'dump-guard-policy' ? 'CREATE POLICY mind_manual_gateway_insert ON storage.objects FOR INSERT WITH CHECK (false);\n' : 'CREATE INDEX fixture_index ON public.fixture_table (id);\n');
    } else bail();
  } else bail();
}
`;

function fixture(mode) {
  const directory = mkdtempSync(join(tmpdir(), 'mind-manual-guarded-schema-test-'));
  directories.push(directory);
  const repo = join(directory, 'fixture-repo');
  const bin = join(directory, 'bin');
  const temporary = join(directory, 'work');
  const isolation = join(repo, 'supabase/isolation');
  for (const folder of [join(repo, 'scripts'), isolation, join(repo, 'supabase/.temp'), bin, temporary]) mkdirSync(folder, { recursive: true, mode: 0o700 });
  const script = join(repo, 'scripts', basename(SCRIPT));
  copyFileSync(SCRIPT, script);
  writeFileSync(join(isolation, 'mind-manual-tables.txt'), 'fixture_table\n', { mode: 0o600 });
  writeFileSync(join(isolation, 'mind-manual-functions.txt'), 'fixture_rpc\n', { mode: 0o600 });
  writeFileSync(join(isolation, 'post-schema-hardening.sql'), 'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;\n-- synthetic hardening sentinel\n', { mode: 0o600 });
  writeFileSync(join(repo, 'supabase/.temp/project-ref'), 'ekekeywoxvdbfbmqyhjy\n', { mode: 0o600 });
  for (const name of ['supabase', 'psql', 'pg_dump', 'mktemp']) writeFileSync(join(bin, name), `#!${process.execPath}\n${FAKE_CLI}`, { mode: 0o700 });
  for (const name of ['sed', 'dirname', 'tr', 'grep', 'rm', 'chmod', 'wc']) {
    const executable = ['/usr/bin', '/bin'].map((prefix) => join(prefix, name)).find(existsSync);
    assert.ok(executable, `required fixture utility ${name} exists`);
    symlinkSync(executable, join(bin, name));
  }
  const output = join(directory, 'baseline.sql');
  const run = () => spawnSync('/bin/bash', [script, output], {
    cwd: repo, encoding: 'utf8', timeout: 10_000,
    env: {
      PATH: bin, TMPDIR: `${temporary}/`, LANG: 'C',
      MIND_MANUAL_EXPORT_FIXTURE_ROOT: directory,
      MIND_MANUAL_EXPORT_FIXTURE_MODE: mode,
    },
  });
  const calls = () => existsSync(join(directory, 'calls.jsonl')) ? readFileSync(join(directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { directory, output, script, temporary, run, calls };
}

function assertCleanFailure(f, result, message) {
  assert.equal(result.status, 65, result.stderr);
  assert.match(result.stderr, message);
  assert.equal(existsSync(f.output), false, 'failed export never creates an output baseline');
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-login-must-not-escape/);
}

describe('pre-guard schema baseline ownership', () => {
  it('parses as bash without contacting a provider', () => {
    const result = spawnSync('/bin/bash', ['-n', SCRIPT], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('refuses an installed guard before any dump or output', () => {
    const f = fixture('guard-before');
    assertCleanFailure(f, f.run(), /requires a pre-guard source snapshot/);
    assert.equal(f.calls().filter((call) => call.tool === 'pg_dump').length, 0);
    assert.equal(f.calls().filter((call) => call.tool === 'psql').length, 1);
  });

  it('fails closed for a non-boolean guard probe', () => {
    const f = fixture('guard-unknown');
    assertCleanFailure(f, f.run(), /requires a pre-guard source snapshot/);
    assert.equal(f.calls().filter((call) => call.tool === 'pg_dump').length, 0);
  });

  it('refuses guards that appear after the two dump sections without creating output', () => {
    const f = fixture('guard-after');
    assertCleanFailure(f, f.run(), /requires a pre-guard source snapshot/);
    assert.equal(f.calls().filter((call) => call.tool === 'pg_dump').length, 2);
    assert.equal(readFileSync(join(f.directory, 'guard-probe-count'), 'utf8'), '2');
  });

  for (const mode of ['dump-guard-schema', 'dump-guard-trigger', 'dump-guard-function', 'dump-guard-policy']) {
    it(`rejects ${mode} even when both live guard probes say false`, () => {
      const f = fixture(mode);
      assertCleanFailure(f, f.run(), /guard objects appeared in the baseline snapshot; no output created/);
      assert.equal(readFileSync(join(f.directory, 'guard-probe-count'), 'utf8'), '2');
      assert.equal(f.calls().filter((call) => call.tool === 'pg_dump').length, 2);
    });
  }

  it('emits a private business-only baseline only for a guard-free snapshot', () => {
    const f = fixture('guard-free');
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const sql = readFileSync(f.output, 'utf8');
    assert.match(sql, /CREATE TABLE public\.fixture_table/);
    assert.match(sql, /CREATE FUNCTION public\.fixture_rpc/);
    assert.match(sql, /CREATE INDEX fixture_index/);
    assert.match(sql, /synthetic hardening sentinel/);
    assert.match(sql, /SET row_security = on;/);
    assert.equal(sql.match(/CREATE EXTENSION IF NOT EXISTS/g)?.length, 1);
    assert.doesNotMatch(sql, /mind_manual_migration|mind_manual_gateway|\\restrict|\\unrestrict|synthetic-private-login/);
    assert.equal(statSync(f.output).mode & 0o777, 0o600);
    assert.equal(lstatSync(f.output).isSymbolicLink(), false);
    assert.equal(f.calls().filter((call) => call.tool === 'pg_dump').length, 2);
    assert.equal(readFileSync(join(f.directory, 'guard-probe-count'), 'utf8'), '2');
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-login-must-not-escape/);
  });

  it('does not overwrite an existing output if the source is guarded', () => {
    const f = fixture('guard-before');
    writeFileSync(f.output, 'retained reviewed baseline\n', { mode: 0o600 });
    const result = f.run();
    assert.equal(result.status, 65, result.stderr);
    assert.equal(readFileSync(f.output, 'utf8'), 'retained reviewed baseline\n');
  });

  it('does not expose a temporary login from failing CLI stderr', () => {
    const f = fixture('cli-error');
    const result = f.run();
    assert.equal(result.status, 42);
    assert.equal(existsSync(f.output), false);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-login-must-not-escape/);
    assert.deepEqual(f.calls().map((call) => call.tool), ['mktemp', 'supabase']);
  });
});

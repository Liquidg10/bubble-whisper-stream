import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// A fresh private socket-only cluster. Never accepts a database URL or remote host.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = readFileSync(join(root, 'supabase/manual/calendar-operation-receipts.sql'), 'utf8');
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
let binaries; let scratch; let started = false;
const children = new Set();
function command(executable, args, input) {
  const result = spawnSync(join(binaries, executable), args, { encoding: 'utf8', env: environment,
    timeout: 30_000, maxBuffer: 2 * 1024 * 1024, ...(input === undefined ? {} : { input }) });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}
function args() { return ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', scratch, '-p', '5432', '-U', 'postgres', '-d', 'postgres']; }
function sql(statement) {
  const result = command('psql', args(), statement);
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function denied(statement, code = '42501') {
  const result = command('psql', args(), statement);
  assert.notEqual(result.status, 0); assert.match(result.stderr, new RegExp(`\\b${code}\\b`, 'u'));
}
function concurrent(statement) {
  const child = spawn(join(binaries, 'psql'), args(), { env: environment }); children.add(child);
  return new Promise((resolveResult, reject) => {
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', status => { children.delete(child);
      if (status !== 0) reject(new Error(stderr)); else resolveResult(stdout.trim()); });
    child.stdin.end(statement);
  });
}
const owner = '10000000-0000-4000-8000-000000000001';
const other = '90000000-0000-4000-8000-000000000009';
const identity = { operationId: '20000000-0000-4000-8000-000000000002', taskId: 'task-1',
  calendarAccountId: '30000000-0000-4000-8000-000000000003', eventId: 'event-1',
  googleCalendarId: 'fixture@example.invalid', expectedEtag: '"before"', requestDigest: 'a'.repeat(64), afterDigest: 'b'.repeat(64) };
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const claimCall = (value = identity, user = owner) => `SELECT public.calendar_operation_claim('${user}', ${literal(value)});`;
const readCall = (value = identity, user = owner) => `SELECT public.calendar_operation_read('${user}', ${literal(value)});`;
const finalizeCall = (nonce, result, value = identity, user = owner) =>
  `SELECT public.calendar_operation_finalize('${user}', ${literal(value)}, '${nonce}', ${literal(result)});`;
const service = statement => `SET ROLE service_role; ${statement}`;
const claim = (value = identity, user = owner) => JSON.parse(sql(service(claimCall(value, user))));
const read = (value = identity, user = owner) => { const output = sql(service(readCall(value, user))); return output ? JSON.parse(output) : null; };
const finish = (nonce, result, value = identity, user = owner) => {
  const output = sql(service(finalizeCall(nonce, result, value, user))); return output ? JSON.parse(output) : null;
};
const written = { outcome: 'written', etag: '"after"', cacheUpdated: true };

describe('manual Calendar operation registry — real disposable PostgreSQL', { concurrency: false }, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : ['/opt/homebrew/opt/postgresql@16/bin', '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/16/bin',
        '/usr/lib/postgresql/17/bin', ...String(process.env.PATH ?? '').split(delimiter)];
    binaries = candidates.find(candidate => ['postgres','initdb','pg_ctl','psql'].every(binary => existsSync(join(candidate, binary))));
    assert.ok(binaries, 'Local PostgreSQL is required; remote database credentials are never used and missing binaries are not a skipped pass.');
    scratch = mkdtempSync(join(tmpdir(), 'mind-manual-calendar-registry-pg-'));
    const data = join(scratch, 'data');
    const init = command('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    assert.equal(init.status, 0, init.stderr);
    const start = command('pg_ctl', ['-D', data, '-l', join(scratch, 'server.log'), '-o', `-F -k '${scratch}' -h ''`, '-w', 'start']);
    assert.equal(start.status, 0, start.stderr); started = true;
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    sql(artifact);
  });
  beforeEach(() => sql('TRUNCATE mind_manual_calendar.operations;'));
  after(() => {
    for (const child of children) child.kill('SIGTERM');
    if (started) command('pg_ctl', ['-D', join(scratch, 'data'), '-m', 'immediate', '-w', 'stop']);
    if (scratch && dirname(scratch) === tmpdir() && scratch.includes('mind-manual-calendar-registry-pg-')) rmSync(scratch, { recursive: true, force: true });
  });
  it('installs once and refuses to overwrite an existing registry', () => {
    denied(artifact, '42P06');
    assert.equal(sql('SELECT count(*) FROM mind_manual_calendar.operations;'), '0');
  });
  for (const role of ['anon', 'authenticated']) {
    it(`denies ${role} every RPC and private-table operation`, () => {
      for (const statement of [claimCall(), readCall(), finalizeCall(other, written),
        'SELECT * FROM mind_manual_calendar.operations;', 'TRUNCATE mind_manual_calendar.operations;',
        'DELETE FROM mind_manual_calendar.operations;', 'UPDATE mind_manual_calendar.operations SET state = \'written\';']) denied(`SET ROLE ${role}; ${statement}`);
    });
  }
  it('service role can use only RPCs, not read or rewrite the underlying table', () => {
    for (const statement of ['SELECT * FROM mind_manual_calendar.operations;', 'DELETE FROM mind_manual_calendar.operations;',
      'TRUNCATE mind_manual_calendar.operations;', 'ALTER TABLE mind_manual_calendar.operations DISABLE ROW LEVEL SECURITY;']) denied(service(statement));
    assert.equal(claim().claimed, true);
    assert.equal(sql("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='mind_manual_calendar.operations'::regclass;"), 't');
  });
  it('returns a claim nonce only once, never reacquiring an identical operation', () => {
    const first = claim(); assert.equal(first.claimed, true); assert.match(first.claimToken, /^[a-f0-9-]{36}$/u);
    assert.deepEqual(claim(), { claimed: false });
    assert.deepEqual(read(), { ownerUserId: owner, identity, state: 'pending', result: null, completedAt: null });
    assert.ok(!JSON.stringify(read()).includes(first.claimToken));
  });
  it('never changes or exposes an existing operation under a different owner or binding', () => {
    const first = claim(); const before = read();
    for (const [key, value] of Object.entries({ taskId: 'task-2', calendarAccountId: other, googleCalendarId: 'other@example.invalid',
      eventId: 'event-2', expectedEtag: '"other"', requestDigest: 'c'.repeat(64), afterDigest: 'd'.repeat(64) })) {
      const changed = { ...identity, [key]: value };
      assert.deepEqual(claim(changed), { claimed: false }); assert.equal(read(changed), null); assert.equal(finish(first.claimToken, written, changed), null);
    }
    assert.equal(read(identity, other), null); assert.equal(finish(first.claimToken, written, identity, other), null);
    assert.deepEqual(read(), before);
  });
  it('holds one real provider target even through a different local account or operation', () => {
    claim();
    const changed = { ...identity, operationId: other, calendarAccountId: '40000000-0000-4000-8000-000000000004' };
    assert.deepEqual(claim(changed), { claimed: false }); assert.equal(read(changed), null);
    assert.equal(claim({ ...changed, googleCalendarId: 'distinct@example.invalid' }).claimed, true);
  });
  it('finalizes exactly once with the original private nonce and preserves completion', () => {
    const { claimToken } = claim(); assert.equal(finish(other, written), null);
    const result = finish(claimToken, written); assert.equal(result.state, 'written'); assert.deepEqual(result.result, written);
    assert.ok(Number.isSafeInteger(result.completedAt)); assert.ok(result.completedAt > 0);
    assert.deepEqual(read(), result);
    assert.equal(finish(claimToken, { outcome: 'not_written', code: 'disabled' }), null);
    assert.deepEqual(claim(), { claimed: false }); assert.deepEqual(read(), result);
    assert.equal(claim({ ...identity, operationId: other }).claimed, true);
  });
  it('recovers a committed completion independently of the lost finalizer response', () => {
    const { claimToken } = claim(); sql(service(finalizeCall(claimToken, written))); // Deliberately discard the acknowledgment.
    const recovered = read(); assert.equal(recovered.state, 'written'); assert.deepEqual(recovered.result, written);
    assert.deepEqual(claim(), { claimed: false });
  });
  it('records known-not-written evidence without authorizing a replay of that operation', () => {
    const { claimToken } = claim(); const result = { outcome: 'not_written', code: 'stale_review' };
    assert.deepEqual(finish(claimToken, result).result, result);
    assert.deepEqual(claim(), { claimed: false }); assert.equal(claim({ ...identity, operationId: other }).claimed, true);
  });
  for (const result of [{ outcome: 'uncertain', code: 'provider_outcome_unknown' },
    { outcome: 'provider_written_cache_unknown', etag: '"after"', cacheUpdated: false }]) {
    it(`retains ${result.outcome} indefinitely without releasing its event hold`, () => {
      const { claimToken } = claim(); const recorded = finish(claimToken, result);
      assert.deepEqual(recorded.result, result);
      assert.equal(finish(claimToken, written), null); assert.deepEqual(claim({ ...identity, operationId: other }), { claimed: false });
      sql("UPDATE mind_manual_calendar.operations SET created_at = '2000-01-01'::timestamptz;");
      assert.deepEqual(claim(), { claimed: false }); assert.deepEqual(read(), recorded);
    });
  }
  it('survives account/auth deletion because no cascading foreign key erases evidence', () => {
    claim(); assert.equal(sql("SELECT count(*) FROM pg_constraint WHERE conrelid='mind_manual_calendar.operations'::regclass AND contype='f';"), '0');
    sql('CREATE TEMP TABLE unrelated_accounts(id uuid PRIMARY KEY); INSERT INTO unrelated_accounts VALUES (gen_random_uuid()); DELETE FROM unrelated_accounts;');
    assert.equal(read().state, 'pending');
  });
  for (const [key, value] of [['operationId', 'invalid'], ['taskId', '../invalid'], ['googleCalendarId', 'primary'],
    ['googleCalendarId', 'bad\n'], ['requestDigest', 'a'], ['afterDigest', null], ['expectedEtag', 'unquoted'],
    ['operationId', identity.operationId + '\n'], ['taskId', 'task\n'], ['eventId', 'event\n'],
    ['expectedEtag', '"etag"\n'], ['requestDigest', 'a'.repeat(64) + '\n'], ['expectedEtag', '"' + 'x'.repeat(257) + '"']]) {
    it(`rejects malformed identity ${key} before claiming`, () => {
      denied(service(claimCall({ ...identity, [key]: value })), '22023'); assert.equal(read(), null);
    });
  }
  it('rejects NULL/extra/missing keys and zero owner without creating a row', () => {
    for (const value of [null, {}, { ...identity, extra: true }, Object.fromEntries(Object.entries(identity).filter(([key]) => key !== 'taskId'))])
      denied(service(claimCall(value)), '22023');
    denied(service(claimCall(identity, '00000000-0000-0000-0000-000000000000')), '22023');
    assert.equal(read(), null);
  });
  for (const result of [{ ...written, etag: '"before"' }, { ...written, cacheUpdated: false }, { ...written, secret: 'must-not-store' },
    { outcome: 'not_written', code: 'provider_outcome_unknown' }, { outcome: 'written' }, null]) {
    it(`rejects contradictory finalizer result ${JSON.stringify(result)} without releasing the hold`, () => {
      const { claimToken } = claim(); denied(service(finalizeCall(claimToken, result)), '22023'); assert.equal(read().state, 'pending');
    });
  }
  it('has exactly one winner among concurrent duplicate claims', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => concurrent(service(claimCall()))));
    const parsed = results.map(value => JSON.parse(value)); assert.equal(parsed.filter(value => value.claimed).length, 1);
    assert.equal(sql('SELECT count(*) FROM mind_manual_calendar.operations;'), '1');
  });
  it('has exactly one winner for concurrent different operations on the same provider target', async () => {
    const results = await Promise.all([identity, { ...identity, operationId: other, calendarAccountId: other }]
      .map(value => concurrent(service(claimCall(value)))));
    assert.equal(results.map(value => JSON.parse(value)).filter(value => value.claimed).length, 1);
  });
  it('does not expose an uncommitted terminal row and preserves rollback as pending', () => {
    const { claimToken } = claim();
    sql(`BEGIN; SET LOCAL ROLE service_role; ${finalizeCall(claimToken, written)} ROLLBACK;`);
    assert.equal(read().state, 'pending'); assert.deepEqual(claim(), { claimed: false });
  });
});

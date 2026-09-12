import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Socket-only disposable PostgreSQL. Never consumes a URL, password, or live DB.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrations = ['20260829000002_gmail_pubsub_watch.sql', '20260901000001_scope_gmail_pubsub_admission.sql']
  .map(name => readFileSync(join(root, 'supabase/migrations', name), 'utf8'));
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const owner = '10000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const account = '30000000-0000-4000-8000-000000000003';
const otherAccount = '40000000-0000-4000-8000-000000000004';
const watchId = '50000000-0000-4000-8000-000000000005';
const otherWatch = '60000000-0000-4000-8000-000000000006';
const binding = { user: owner, account, email: 'owner@example.invalid', generation: 7,
  watch: watchId, subscription: 'projects/fixture/subscriptions/gmail' };
let binaries; let scratch; let started = false;
const children = new Set();
function command(executable, args, input) {
  const result = spawnSync(join(binaries, executable), args, { encoding: 'utf8', env: environment,
    timeout: 30_000, maxBuffer: 2 * 1024 * 1024, ...(input === undefined ? {} : { input }) });
  assert.equal(result.error, undefined, result.error?.message); return result;
}
function args() { return ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', scratch, '-p', '5432', '-U', 'postgres', '-d', 'postgres']; }
function sql(statement) {
  const result = command('psql', args(), statement);
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function denied(statement, code = 'P0002') {
  const result = command('psql', args(), statement);
  assert.notEqual(result.status, 0, 'Unexpectedly allowed statement');
  assert.match(result.stderr, new RegExp(`\\b${code}\\b`, 'u'));
}
function session(name) {
  const child = spawn(join(binaries, 'psql'), args(), { env: environment }); children.add(child);
  let stdout = ''; let stderr = '';
  const deadline = setTimeout(() => child.kill('SIGKILL'), 10_000);
  const done = new Promise((resolveResult, reject) => {
    const append = (chunk, target) => {
      if (target === 'stdout') stdout += chunk; else stderr += chunk;
      if (stdout.length + stderr.length > 2 * 1024 * 1024) child.kill('SIGKILL');
    };
    child.stdout.on('data', chunk => append(chunk, 'stdout'));
    child.stderr.on('data', chunk => append(chunk, 'stderr'));
    child.stdin.on('error', () => { /* Process close reports a failed/terminated session. */ });
    child.on('error', error => { clearTimeout(deadline); children.delete(child); reject(error); });
    child.on('close', (status, signal) => {
      clearTimeout(deadline); children.delete(child);
      resolveResult({ status, signal, stdout: stdout.trim(), stderr });
    });
  });
  // Keep launch failures handled while the caller waits for a lock barrier.
  void done.catch(() => {});
  child.stdin.write(`SET application_name=${literal(name)};
    SET statement_timeout='5s'; SET lock_timeout='5s'; SET idle_in_transaction_session_timeout='8s';\n`);
  return { child, done, get stdout() { return stdout; },
    write: statement => child.stdin.write(`${statement}\n`),
    end: statement => child.stdin.end(`${statement ?? ''}\n`) };
}
async function concurrent(statement) {
  const active = session('gmail-duplicate-claim'); active.end(statement);
  const result = await active.done;
  assert.equal(result.status, 0, result.stderr || `psql terminated: ${result.signal}`);
  return result.stdout;
}
async function waitForCondition(predicate, message) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 20));
  }
  assert.fail(message);
}
async function lockedWatch(name, workUnderLock = '') {
  const active = session(name);
  active.write(`BEGIN; SELECT id FROM public.gmail_watch_subscriptions WHERE id='${watchId}' FOR UPDATE;
    ${workUnderLock}
    SELECT 'LOCK_READY:' || pg_backend_pid();`);
  try {
    await waitForCondition(() => /LOCK_READY:\d+/.test(active.stdout), 'Watch lock was not acquired within the deadline');
    return { active, pid: Number(/LOCK_READY:(\d+)/.exec(active.stdout)[1]) };
  } catch (error) {
    active.child.kill('SIGKILL'); await active.done; throw error;
  }
}
async function waitForBlock(waiterName, blockerPid) {
  await waitForCondition(() => sql(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
    WHERE application_name=${literal(waiterName)} AND wait_event_type='Lock'
      AND ${blockerPid}=ANY(pg_blocking_pids(pid)));`) === 't',
  'Expected the stale operation to block on the held watch row');
}
async function closeSessions(...active) {
  for (const item of active) if (item && children.has(item.child)) item.child.kill('SIGKILL');
  await Promise.allSettled(active.filter(Boolean).map(item => item.done));
}
const literal = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const tuple = value => [value.user, value.account, value.email, value.generation, value.watch, value.subscription].map(literal).join(',');
const service = statement => `SET ROLE service_role; ${statement}`;
const claimSql = (value = binding, message = 'delivery-1') =>
  `SELECT row_to_json(result) FROM public.claim_gmail_pubsub_message_scoped(${tuple(value)},${literal(message)},'200',NULL) result;`;
const completeSql = (receipt, value = binding, attempt = 1, status = 'succeeded', history = '200') =>
  `SELECT row_to_json(result) FROM public.complete_gmail_pubsub_message_scoped(${tuple(value)},${attempt},${literal(receipt)},${literal(status)},${literal(history)},1,1,'{}',NULL,NULL) result;`;
const claim = (value = binding, message) => JSON.parse(sql(service(claimSql(value, message))));
const complete = (receipt, value = binding, attempt = 1, status, history) =>
  JSON.parse(sql(service(completeSql(receipt, value, attempt, status, history))));
const snapshot = () => sql(`SELECT json_build_object('watch', (SELECT row_to_json(w) FROM public.gmail_watch_subscriptions w WHERE id='${watchId}'),
  'receipts', (SELECT json_agg(r ORDER BY id) FROM public.gmail_pubsub_receipts r));`);

describe('Gmail admitted tuple RPCs — real disposable PostgreSQL', { concurrency: false }, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : ['/opt/homebrew/opt/postgresql@16/bin', '/opt/homebrew/opt/postgresql@17/bin', '/opt/homebrew/opt/postgresql@18/bin',
        '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', ...String(process.env.PATH ?? '').split(delimiter)];
    binaries = candidates.find(candidate => ['postgres', 'initdb', 'pg_ctl', 'psql'].every(binary => existsSync(join(candidate, binary))));
    assert.ok(binaries, 'Local PostgreSQL is required; missing binaries are not a skipped pass.');
    scratch = mkdtempSync(join(tmpdir(), 'mind-manual-gmail-scoped-pg-'));
    const init = command('initdb', ['-D', join(scratch, 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    assert.equal(init.status, 0, init.stderr);
    const start = command('pg_ctl', ['-D', join(scratch, 'data'), '-l', join(scratch, 'server.log'), '-o', `-F -k '${scratch}' -h ''`, '-w', 'start']);
    assert.equal(start.status, 0, start.stderr); started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE TABLE public.oauth_accounts (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), UNIQUE(id,user_id));
      CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = statement_timestamp(); RETURN NEW; END $$;
      INSERT INTO auth.users VALUES ('${owner}'),('${other}');
      INSERT INTO public.oauth_accounts VALUES ('${account}','${owner}'),('${otherAccount}','${other}');`);
    for (const migration of migrations) sql(migration);
  });
  beforeEach(() => {
    sql(`TRUNCATE public.gmail_watch_subscriptions CASCADE;
      INSERT INTO public.gmail_watch_subscriptions (id,user_id,oauth_account_id,account_email,topic_name,subscription_name,status,history_id,watch_expires_at,watch_generation)
      VALUES ('${watchId}','${owner}','${account}','owner@example.invalid','projects/fixture/topics/gmail','${binding.subscription}','active','100',now()+interval '1 day',7),
      ('${otherWatch}','${other}','${otherAccount}','other@example.invalid','projects/fixture/topics/gmail','projects/fixture/subscriptions/other','active','100',now()+interval '1 day',7);`);
  });
  after(() => {
    for (const child of children) child.kill('SIGTERM');
    if (started) command('pg_ctl', ['-D', join(scratch, 'data'), '-m', 'immediate', '-w', 'stop']);
    if (scratch && dirname(scratch) === tmpdir() && scratch.includes('mind-manual-gmail-scoped-pg-')) rmSync(scratch, { recursive: true, force: true });
  });
  for (const role of ['anon', 'authenticated']) {
    it(`denies ${role} all scoped RPCs`, () => {
      denied(`SET ROLE ${role}; ${claimSql()}`, '42501');
      denied(`SET ROLE ${role}; ${completeSql(watchId)}`, '42501');
    });
  }
  it('denies stale service callers the old unbound RPCs', () => {
    denied(service(`SELECT * FROM public.claim_gmail_pubsub_message('${watchId}','${binding.subscription}','delivery-1','200',NULL);`), '42501');
    denied(service(`SELECT * FROM public.complete_gmail_pubsub_message('${watchId}','succeeded','200',0,0,'{}',NULL,NULL);`), '42501');
  });
  it('preserves scoped-only execution after the exact target hardening statements', () => {
    const hardening = readFileSync(join(root, 'supabase/isolation/post-schema-hardening.sql'), 'utf8');
    const gmailStatements = hardening.split('\n').filter(line =>
      /^(?:REVOKE|GRANT)\s+.*\bON FUNCTION public\.(?:claim|complete)_gmail_pubsub_message(?:_scoped)?\(/u.test(line));
    assert.equal(gmailStatements.length, 6, 'Review changed Gmail function hardening statements explicitly');
    assert.ok(gmailStatements.every(line => line.endsWith(';')), 'Gmail hardening statements must be complete single lines');
    // Seed inherited unsafe grants and remove scoped service execution first,
    // proving this artifact itself both closes legacy and restores scoped use.
    sql(`GRANT EXECUTE ON FUNCTION public.claim_gmail_pubsub_message(uuid,text,text,text,timestamptz) TO PUBLIC,anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION public.complete_gmail_pubsub_message(uuid,text,text,integer,integer,jsonb,text,text) TO PUBLIC,anon,authenticated,service_role;
      REVOKE EXECUTE ON FUNCTION public.claim_gmail_pubsub_message_scoped(uuid,uuid,text,bigint,uuid,text,text,text,timestamptz) FROM service_role;
      REVOKE EXECUTE ON FUNCTION public.complete_gmail_pubsub_message_scoped(uuid,uuid,text,bigint,uuid,text,integer,uuid,text,text,integer,integer,jsonb,text,text) FROM service_role;
      ${gmailStatements.join('\n')}`);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      denied(`SET ROLE ${role}; SELECT * FROM public.claim_gmail_pubsub_message('${watchId}','${binding.subscription}','delivery-1','200',NULL);`, '42501');
      denied(`SET ROLE ${role}; SELECT * FROM public.complete_gmail_pubsub_message('${watchId}','succeeded','200',0,0,'{}',NULL,NULL);`, '42501');
      if (role !== 'service_role') {
        denied(`SET ROLE ${role}; ${claimSql()}`, '42501');
        denied(`SET ROLE ${role}; ${completeSql(watchId)}`, '42501');
      }
    }
    const receipt = claim();
    assert.equal(receipt.claim_state, 'claimed');
    assert.deepEqual(complete(receipt.receipt_id), { completion_state: 'completed', stored_history_id: '200' });
  });
  it('executes the revoked legacy functions through the same non-superuser owner', () => {
    const signatures = [
      'claim_gmail_pubsub_message(uuid,text,text,text,timestamptz)',
      'complete_gmail_pubsub_message(uuid,text,text,integer,integer,jsonb,text,text)',
      'claim_gmail_pubsub_message_scoped(uuid,uuid,text,bigint,uuid,text,text,text,timestamptz)',
      'complete_gmail_pubsub_message_scoped(uuid,uuid,text,bigint,uuid,text,integer,uuid,text,text,integer,integer,jsonb,text,text)',
    ];
    // All ownership changes are transaction-local to this assertion. The role
    // has neither superuser nor BYPASSRLS; table ownership models the migration
    // owner without relying on initdb's superuser to execute the legacy calls.
    const result = sql(`BEGIN;
      CREATE ROLE gmail_rpc_owner NOSUPERUSER NOBYPASSRLS NOLOGIN;
      GRANT USAGE ON SCHEMA public TO gmail_rpc_owner;
      ${['gmail_watch_subscriptions', 'gmail_pubsub_receipts', 'gmail_history_events']
        .map(table => `ALTER TABLE public.${table} OWNER TO gmail_rpc_owner;`).join('\n')}
      ${signatures.map(signature => `ALTER FUNCTION public.${signature} OWNER TO gmail_rpc_owner;`).join('\n')}
      SELECT json_build_object('superuser',rolsuper,'bypassrls',rolbypassrls) FROM pg_roles WHERE rolname='gmail_rpc_owner';
      SELECT json_build_object('owners',COUNT(DISTINCT proowner),'non_superuser_owned',bool_and(proowner='gmail_rpc_owner'::regrole))
        FROM pg_proc WHERE oid IN (${signatures.map(signature => `${literal(`public.${signature}`)}::regprocedure`).join(',')});
      SELECT json_build_object('old_claim',has_function_privilege('service_role',${literal(`public.${signatures[0]}`)},'EXECUTE'),
        'old_complete',has_function_privilege('service_role',${literal(`public.${signatures[1]}`)},'EXECUTE'));
      SET LOCAL ROLE service_role;
      WITH claimed AS (
        SELECT * FROM public.claim_gmail_pubsub_message_scoped(${tuple(binding)},'non-superuser-delivery','200',NULL)
      ) SELECT row_to_json(completed) FROM claimed CROSS JOIN LATERAL
        public.complete_gmail_pubsub_message_scoped(${tuple(binding)},claimed.attempts,claimed.receipt_id,'succeeded','200',1,1,'{}',NULL,NULL) completed;
      RESET ROLE; ROLLBACK;`).split('\n').map(line => JSON.parse(line));
    assert.deepEqual(result, [
      { superuser: false, bypassrls: false },
      { owners: 1, non_superuser_owned: true },
      { old_claim: false, old_complete: false },
      { completion_state: 'completed', stored_history_id: '200' },
    ]);
    assert.equal(sql("SELECT COUNT(*) FROM pg_roles WHERE rolname='gmail_rpc_owner';"), '0');
  });
  it('claims and completes only the canonical tuple with a monotonic cursor', () => {
    const first = claim(); assert.equal(first.claim_state, 'claimed'); assert.equal(first.attempts, 1);
    assert.deepEqual(complete(first.receipt_id), { completion_state: 'completed', stored_history_id: '200' });
    const second = claim(binding, 'delivery-2');
    assert.deepEqual(complete(second.receipt_id, binding, 1, 'succeeded', '150'), { completion_state: 'completed', stored_history_id: '200' });
    assert.equal(sql(`SELECT history_id FROM public.gmail_watch_subscriptions WHERE id='${otherWatch}';`), '100');
  });
  for (const [key, value] of Object.entries({ user: other, account: otherAccount, email: 'other@example.invalid',
    generation: 8, watch: otherWatch, subscription: 'projects/fixture/subscriptions/other' })) {
    it(`rejects a wrong claim ${key} before creating a receipt`, () => {
      const before = snapshot(); denied(service(claimSql({ ...binding, [key]: value }))); assert.equal(snapshot(), before);
    });
    it(`rejects a wrong completion ${key} without advancing state`, () => {
      const first = claim(); const before = snapshot();
      denied(service(completeSql(first.receipt_id, { ...binding, [key]: value }))); assert.equal(snapshot(), before);
    });
  }
  it('denies an owner reassignment after Edge lookup but before receipt claim', () => {
    sql(`DELETE FROM public.gmail_watch_subscriptions WHERE id='${otherWatch}';
      UPDATE public.gmail_watch_subscriptions SET user_id='${other}',oauth_account_id='${otherAccount}',account_email='other@example.invalid' WHERE id='${watchId}';`);
    const before = snapshot(); denied(service(claimSql())); assert.equal(snapshot(), before);
  });
  it('binds completion to the exact receipt, not just a valid owner/watch', () => {
    const otherBinding = { ...binding, user: other, account: otherAccount, email: 'other@example.invalid', watch: otherWatch,
      subscription: 'projects/fixture/subscriptions/other' };
    const foreign = claim(otherBinding); const before = snapshot();
    denied(service(completeSql(foreign.receipt_id))); assert.equal(snapshot(), before);
  });
  it('rejects an original worker after an expired claim is reclaimed', () => {
    const first = claim();
    sql(`UPDATE public.gmail_pubsub_receipts SET lease_expires_at=now()-interval '1 minute' WHERE id='${first.receipt_id}';`);
    const second = claim(); assert.equal(second.receipt_id, first.receipt_id); assert.equal(second.attempts, 2);
    const before = snapshot(); denied(service(completeSql(first.receipt_id))); assert.equal(snapshot(), before);
    assert.equal(complete(second.receipt_id, binding, 2).completion_state, 'completed');
  });
  it('does not let a late worker finalize a newly renewed generation', () => {
    const first = claim(); sql(`UPDATE public.gmail_watch_subscriptions SET watch_generation=8 WHERE id='${watchId}';`);
    const before = snapshot(); denied(service(completeSql(first.receipt_id))); assert.equal(snapshot(), before);
  });
  for (const operation of ['claim', 'completion']) {
    it(`rechecks generation after a blocked stale ${operation} resumes`, async () => {
      const first = operation === 'completion' ? claim() : null;
      const receiptBefore = sql('SELECT COALESCE(json_agg(r ORDER BY id),\'[]\') FROM public.gmail_pubsub_receipts r;');
      const holder = await lockedWatch(`gmail-generation-holder-${operation}`);
      const waiterName = `gmail-generation-waiter-${operation}`;
      const waiter = session(waiterName);
      try {
        waiter.end(service(first ? completeSql(first.receipt_id) : claimSql()));
        await waitForBlock(waiterName, holder.pid);
        holder.active.end(`UPDATE public.gmail_watch_subscriptions SET watch_generation=8 WHERE id='${watchId}'; COMMIT;`);
        const heldResult = await holder.active.done;
        assert.equal(heldResult.status, 0, heldResult.stderr);
        const result = await waiter.done;
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /\bP0002\b/u);
        assert.equal(sql(`SELECT watch_generation||':'||history_id FROM public.gmail_watch_subscriptions WHERE id='${watchId}';`), '8:100');
        assert.equal(sql('SELECT COALESCE(json_agg(r ORDER BY id),\'[]\') FROM public.gmail_pubsub_receipts r;'), receiptBefore);
      } finally {
        await closeSessions(waiter, holder.active);
      }
    });
  }
  it('rejects an old completion blocked behind an uncommitted claim reclaim', async () => {
    const first = claim();
    sql(`UPDATE public.gmail_pubsub_receipts SET lease_expires_at=now()-interval '1 minute' WHERE id='${first.receipt_id}';`);
    const holder = await lockedWatch('gmail-reclaim-holder', `SET LOCAL ROLE service_role; ${claimSql()} RESET ROLE;`);
    const waiter = session('gmail-reclaim-waiter');
    try {
      const reclaimed = JSON.parse(holder.active.stdout.split('\n').find(line => line.startsWith('{')));
      assert.equal(reclaimed.receipt_id, first.receipt_id);
      assert.equal(reclaimed.attempts, 2);
      waiter.end(service(completeSql(first.receipt_id)));
      await waitForBlock('gmail-reclaim-waiter', holder.pid);
      holder.active.end('COMMIT;');
      const heldResult = await holder.active.done;
      assert.equal(heldResult.status, 0, heldResult.stderr);
      const result = await waiter.done;
      assert.notEqual(result.status, 0); assert.match(result.stderr, /\bP0002\b/u);
      assert.equal(sql(`SELECT status||':'||attempt_count FROM public.gmail_pubsub_receipts WHERE id='${first.receipt_id}';`), 'processing:2');
      assert.equal(sql(`SELECT history_id FROM public.gmail_watch_subscriptions WHERE id='${watchId}';`), '100');
      assert.deepEqual(complete(first.receipt_id, binding, 2), { completion_state: 'completed', stored_history_id: '200' });
    } finally {
      await closeSessions(waiter, holder.active);
    }
  });
  it('does not resurrect a stopped watch on a late success', () => {
    const first = claim(); sql(`UPDATE public.gmail_watch_subscriptions SET status='inactive' WHERE id='${watchId}';`);
    const before = snapshot(); denied(service(completeSql(first.receipt_id))); assert.equal(snapshot(), before);
  });
  it('records a failed receipt after the same watch is marked resync_required', () => {
    const first = claim(); sql(`UPDATE public.gmail_watch_subscriptions SET status='resync_required' WHERE id='${watchId}';`);
    assert.equal(complete(first.receipt_id, binding, 1, 'failed').completion_state, 'completed');
    assert.equal(sql(`SELECT status FROM public.gmail_watch_subscriptions WHERE id='${watchId}';`), 'resync_required');
  });
  it('acknowledges exact replay without changing completion or cursor', () => {
    const first = claim(); complete(first.receipt_id); const before = snapshot();
    assert.equal(claim().claim_state, 'replay');
    assert.equal(complete(first.receipt_id, binding, 1, 'succeeded', '999').completion_state, 'already_complete');
    assert.equal(snapshot(), before);
  });
  it('fails closed on NULL binding and malformed completion before a write', () => {
    for (const key of Object.keys(binding)) denied(service(claimSql({ ...binding, [key]: null })));
    const first = claim(); const before = snapshot();
    denied(service(completeSql(first.receipt_id, binding, 0)), '22023');
    denied(service(completeSql(first.receipt_id, binding, 1, null)), '22023');
    denied(service(completeSql(first.receipt_id, binding, 1, 'succeeded', null)), '22023');
    assert.equal(snapshot(), before);
  });
  it('has one claimed winner and only busy duplicates under concurrency', async () => {
    const claims = (await Promise.all(Array.from({ length: 8 }, () => concurrent(service(claimSql()))))).map(value => JSON.parse(value));
    assert.equal(claims.filter(value => value.claim_state === 'claimed').length, 1);
    assert.equal(claims.filter(value => value.claim_state === 'busy').length, 7);
    assert.equal(new Set(claims.map(value => value.receipt_id)).size, 1);
  });
});

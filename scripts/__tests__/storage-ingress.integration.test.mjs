import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { canonicalJson, sha256 } from '../lib/supabase-isolation.mjs';
import { subjectScopeBinding } from '../lib/migration-subject-scope.mjs';
import {
  buildStorageIngressReadiness, inspectStorageIngressWiring, loadStorageIngressObservations,
  STORAGE_WRITER_ROSTER, storageIngressBoundary, validateStorageIngressObservations,
} from '../lib/storage-ingress-readiness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = readFileSync(join(root, 'supabase/isolation/storage-write-gateway.sql'), 'utf8');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
let pgBin;
let scratch;
let started = false;
const sessions = new Set();
function command(exe, args, options = {}) {
  const result = spawnSync(join(pgBin, exe), args, { encoding: 'utf8', env, timeout: 30_000, maxBuffer: 2 * 1024 * 1024, ...options });
  assert.equal(result.error, undefined, `${exe}: ${result.error?.message}`);
  return result;
}
const psqlArgs = () => ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
  '-h', scratch, '-p', '5432', '-U', 'postgres', '-d', 'postgres'];
function execute(statement) { return command('psql', psqlArgs(), { input: statement }); }
function sql(statement) {
  const result = execute(statement);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function denies(statement, pattern = /42501/u) {
  const result = execute(statement);
  assert.notEqual(result.status, 0, 'Unexpectedly permitted test operation');
  assert.match(result.stderr, pattern);
}
function protectedRows() {
  return sql("SELECT bucket_id || '/' || name || ':' || payload FROM storage.objects WHERE bucket_id IN ('photos','voice-samples') ORDER BY 1");
}
async function waitFor(check, label) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for isolated ${label}`);
    await new Promise((done) => setTimeout(done, 10));
  }
}
function session() {
  const child = spawn(join(pgBin, 'psql'), psqlArgs(), { env });
  const handle = { child, stdout: '', stderr: '', status: undefined };
  child.stdout.on('data', (chunk) => { handle.stdout += chunk; });
  child.stderr.on('data', (chunk) => { handle.stderr += chunk; });
  handle.done = new Promise((done, reject) => {
    child.on('error', reject);
    child.on('close', (status) => { handle.status = status; sessions.delete(handle); done(handle); });
  });
  handle.send = async (statement) => {
    const marker = `done_${Math.random().toString(36).slice(2)}`;
    child.stdin.write(`${statement}\nSELECT '${marker}';\n`);
    await waitFor(() => {
      assert.equal(handle.status, undefined, handle.stderr);
      return handle.stdout.includes(marker);
    }, 'PostgreSQL session');
  };
  sessions.add(handle);
  return handle;
}

describe('storage gateway policies — isolated real PostgreSQL metadata only', { concurrency: false }, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : ['/opt/homebrew/opt/postgresql@16/bin', '/opt/homebrew/opt/postgresql@17/bin', '/opt/homebrew/opt/postgresql@18/bin',
        '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/18/bin', ...String(process.env.PATH ?? '').split(delimiter)];
    pgBin = candidates.find((candidate) => ['postgres', 'initdb', 'pg_ctl', 'psql'].every((binary) => existsSync(join(candidate, binary))));
    assert.ok(pgBin, 'Local PostgreSQL server binaries are required; no remote database or skipped pass is permitted.');
    scratch = mkdtempSync(join(tmpdir(), 'mind-manual-ingress-pg-'));
    const initialized = command('initdb', ['-D', join(scratch, 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    assert.equal(initialized.status, 0, initialized.stderr);
    const start = command('pg_ctl', ['-D', join(scratch, 'data'), '-l', join(scratch, 'server.log'),
      '-o', `-F -k '${scratch}' -h ''`, '-w', 'start']);
    assert.equal(start.status, 0, start.stderr + start.stdout);
    started = true;
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_storage_admin;');
  });
  beforeEach(async () => {
    for (const handle of sessions) handle.child.stdin.end('ROLLBACK;\n');
    await Promise.all([...sessions].map((handle) => handle.done));
    sql(`ALTER ROLE anon NOSUPERUSER NOBYPASSRLS; ALTER ROLE authenticated NOSUPERUSER NOBYPASSRLS;
      REVOKE supabase_storage_admin FROM anon, authenticated;
      DROP SCHEMA IF EXISTS storage CASCADE; DROP SCHEMA IF EXISTS mind_manual_migration CASCADE;
      CREATE SCHEMA mind_manual_migration;
      CREATE TABLE mind_manual_migration.control (singleton boolean PRIMARY KEY, phase text);
      INSERT INTO mind_manual_migration.control VALUES (true, 'open');
      CREATE TABLE mind_manual_migration.edge_leases (lease_id text PRIMARY KEY);
      CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL);
      INSERT INTO storage.buckets VALUES ('photos',false),('voice-samples',false),('commerce',false);
      CREATE TABLE storage.objects (bucket_id text REFERENCES storage.buckets(id), name text, payload text, PRIMARY KEY(bucket_id,name));
      ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon, authenticated, service_role;
      CREATE POLICY fixture_allow_everything ON storage.objects TO anon, authenticated USING(true) WITH CHECK(true);
      INSERT INTO storage.objects VALUES ('photos','fixture.jpg','original'),('voice-samples','fixture.wav','original'),('commerce','fixture.txt','original');`);
  });
  after(async () => {
    for (const handle of sessions) handle.child.stdin.end('ROLLBACK;\n');
    await Promise.all([...sessions].map((handle) => handle.done));
    if (started) {
      const stopped = command('pg_ctl', ['-D', join(scratch, 'data'), '-m', 'immediate', '-w', 'stop']);
      assert.equal(stopped.status, 0, stopped.stderr);
    }
    // Only this exact test-created disposable cluster is removed.
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });
  it('installs three restrictive policies while control remains open', () => {
    sql(artifact);
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%' AND NOT polpermissive"), '3');
    assert.equal(sql('SELECT phase FROM mind_manual_migration.control'), 'open');
  });
  it('denies new direct inserts and upserts even with extra permissive policies', () => {
    sql(artifact);
    sql('CREATE POLICY fixture_second_allow ON storage.objects TO PUBLIC USING(true) WITH CHECK(true);');
    for (const role of ['anon', 'authenticated']) for (const bucket of ['photos', 'voice-samples']) {
      denies(`SET ROLE ${role}; INSERT INTO storage.objects VALUES ('${bucket}','new','changed');`);
      denies(`SET ROLE ${role}; INSERT INTO storage.objects VALUES ('${bucket}','fixture.${bucket === 'photos' ? 'jpg' : 'wav'}','changed') ON CONFLICT (bucket_id,name) DO UPDATE SET payload=EXCLUDED.payload;`);
    }
    assert.equal(protectedRows(), 'photos/fixture.jpg:original\nvoice-samples/fixture.wav:original');
  });
  it('silently filters protected updates/deletes and denies moves into either bucket', () => {
    sql(artifact);
    const original = protectedRows();
    for (const role of ['anon', 'authenticated']) for (const bucket of ['photos', 'voice-samples']) {
      assert.equal(sql(`SET ROLE ${role}; WITH changed AS (UPDATE storage.objects SET payload='changed' WHERE bucket_id='${bucket}' RETURNING *) SELECT count(*) FROM changed;`), '0');
      assert.equal(sql(`SET ROLE ${role}; WITH changed AS (UPDATE storage.objects SET name='renamed',bucket_id='commerce' WHERE bucket_id='${bucket}' RETURNING *) SELECT count(*) FROM changed;`), '0');
      assert.equal(sql(`SET ROLE ${role}; WITH changed AS (DELETE FROM storage.objects WHERE bucket_id='${bucket}' RETURNING *) SELECT count(*) FROM changed;`), '0');
      denies(`SET ROLE ${role}; UPDATE storage.objects SET bucket_id='${bucket}' WHERE bucket_id='commerce';`);
      assert.equal(protectedRows(), original);
    }
  });
  it('denies copy destinations in protected buckets; allowed reads/copy-out do not mutate source', () => {
    sql(artifact);
    for (const bucket of ['photos', 'voice-samples']) {
      denies(`SET ROLE authenticated; INSERT INTO storage.objects SELECT '${bucket}','copied',payload FROM storage.objects WHERE bucket_id='commerce';`);
    }
    const original = protectedRows();
    sql("SET ROLE authenticated; INSERT INTO storage.objects SELECT 'commerce','copied-photo',payload FROM storage.objects WHERE bucket_id='photos';");
    assert.equal(protectedRows(), original);
    assert.equal(sql("SET ROLE authenticated; SELECT payload FROM storage.objects WHERE name='copied-photo'"), 'original');
  });
  it('preserves reads and unrelated bucket insert/update/upsert/delete for both API roles', () => {
    sql(artifact);
    for (const role of ['anon', 'authenticated']) {
      assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM storage.objects WHERE bucket_id IN ('photos','voice-samples');`), '2');
      sql(`SET ROLE ${role}; INSERT INTO storage.objects VALUES ('commerce','allowed','first');
        UPDATE storage.objects SET payload='second' WHERE name='allowed';
        INSERT INTO storage.objects VALUES ('commerce','allowed','third') ON CONFLICT (bucket_id,name) DO UPDATE SET payload=EXCLUDED.payload;`);
      assert.equal(sql("SELECT payload FROM storage.objects WHERE name='allowed'"), 'third');
      sql(`SET ROLE ${role}; DELETE FROM storage.objects WHERE name='allowed';`);
    }
  });
  it('demonstrates service-role and Storage-owner bypass — not a storage byte freeze', () => {
    sql(artifact);
    sql("SET ROLE service_role; INSERT INTO storage.objects VALUES ('photos','privileged.jpg','privileged'); UPDATE storage.objects SET payload='privileged' WHERE bucket_id='voice-samples'; DELETE FROM storage.objects WHERE name='fixture.jpg';");
    assert.equal(protectedRows(), 'photos/privileged.jpg:privileged\nvoice-samples/fixture.wav:privileged');
    sql("SET ROLE supabase_storage_admin; UPDATE storage.objects SET payload='owner bypass' WHERE bucket_id='photos';");
    assert.match(protectedRows(), /owner bypass/u);
  });
  for (const [label, mutation, error] of [
    ['missing control', 'DROP TABLE mind_manual_migration.control', /reviewed control/u],
    ['non-open control', "UPDATE mind_manual_migration.control SET phase='draining'", /open control/u],
    ['outstanding admitted work', "INSERT INTO mind_manual_migration.edge_leases VALUES ('fixture')", /no admitted work/u],
    ['public protected bucket', "UPDATE storage.buckets SET public=true WHERE id='photos'", /both approved private buckets/u],
    ['missing protected bucket', "DELETE FROM storage.objects WHERE bucket_id='voice-samples'; DELETE FROM storage.buckets WHERE id='voice-samples'", /both approved private buckets/u],
    ['RLS disabled', 'ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY', /existing Storage RLS/u],
    ['API bypass role', 'ALTER ROLE authenticated BYPASSRLS', /must not bypass/u],
    ['API owner membership', 'GRANT supabase_storage_admin TO anon', /must not bypass/u],
  ]) it(`rejects ${label} without a partial policy install`, () => {
    sql(mutation);
    denies(artifact, error);
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%'"), '0');
  });
  it('refuses duplicate installation atomically without overwriting policy definitions', () => {
    sql(artifact);
    const policies = sql("SELECT polname || ':' || pg_get_expr(polqual,polrelid) || ':' || pg_get_expr(polwithcheck,polrelid) FROM pg_policy ORDER BY polname");
    denies(artifact, /already exists/u);
    assert.equal(sql("SELECT polname || ':' || pg_get_expr(polqual,polrelid) || ':' || pg_get_expr(polwithcheck,polrelid) FROM pg_policy ORDER BY polname"), policies);
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%'"), '3');
  });
  it('rolls back earlier policy creations if a later policy name already exists', () => {
    sql('CREATE POLICY mind_manual_gateway_delete ON storage.objects FOR DELETE TO authenticated USING (false);');
    denies(artifact, /already exists/u);
    assert.equal(sql("SELECT polname || ':' || polpermissive || ':' || pg_get_expr(polqual,polrelid) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%'"), 'mind_manual_gateway_delete:true:false');
  });
  it('waits behind admitted SHARE locking, then rejects the newly committed lease atomically', async () => {
    const admission = session();
    await admission.send("BEGIN; SELECT singleton FROM mind_manual_migration.control WHERE singleton FOR SHARE; INSERT INTO mind_manual_migration.edge_leases VALUES ('admitted');");
    const installer = session();
    installer.child.stdin.end(`SET application_name='ingress_policy_install_wait';\n${artifact}`);
    await waitFor(() => sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='ingress_policy_install_wait' AND wait_event_type='Lock'") === '1', 'installer row lock');
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%'"), '0');
    admission.child.stdin.end('COMMIT;\n');
    assert.equal((await admission.done).status, 0);
    assert.notEqual((await installer.done).status, 0);
    assert.match(installer.stderr, /no admitted work/u);
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%'"), '0');
  });
  it('holds admission SHARE locking until all policy changes commit', async () => {
    const installer = session();
    await installer.send(artifact.replace(/COMMIT;\s*$/u, ''));
    const admission = session();
    admission.child.stdin.end("SET application_name='ingress_admission_wait'; BEGIN; SELECT singleton FROM mind_manual_migration.control WHERE singleton FOR SHARE; INSERT INTO mind_manual_migration.edge_leases VALUES ('after_install'); COMMIT;\n");
    await waitFor(() => sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='ingress_admission_wait' AND wait_event_type='Lock'") === '1', 'admission row lock');
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%'"), '0');
    installer.child.stdin.end('COMMIT;\n');
    assert.equal((await installer.done).status, 0);
    assert.equal((await admission.done).status, 0);
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polname LIKE 'mind_manual_gateway_%'"), '3');
    assert.equal(sql('SELECT count(*) FROM mind_manual_migration.edge_leases'), '1');
  });
});

const scope = {
  version: 1, kind: 'mind_manual_subject_scope', sourceProjectRef: 'ekekeywoxvdbfbmqyhjy', targetProjectRef: 'fjxedbaskrbewjunfxaj',
  subjectIds: ['10000000-0000-4000-8000-000000000001'], legacyStorageAssignments: [],
};
const now = Date.parse('2026-08-29T12:00:00.000Z');
const iso = (offset) => new Date(now + offset).toISOString();
const boundary = () => storageIngressBoundary(root);
function observations() {
  const subjectScope = subjectScopeBinding(scope);
  const implementation = boundary();
  const itemBinding = { scopeSha256: subjectScope.scopeSha256, boundarySha256: sha256(canonicalJson(implementation)) };
  return {
    version: 1, kind: 'mind_manual_storage_ingress_observations', subjectScope, boundary: implementation, observedAt: iso(0),
    writers: STORAGE_WRITER_ROSTER.map((writerId) => ({ writerId, ...itemBinding,
      receiptSha256: sha256(writerId), observedAt: iso(-50_000), status: 'drained', pendingOperations: 0 })),
    leases: { ...itemBinding, receiptSha256: sha256('leases'), observedAt: iso(-40_000), activeCount: 0, unresolvedCount: 0 },
    byteObservations: { ...itemBinding,
      before: { receiptSha256: sha256('before'), observedAt: iso(-30_000), objectCount: 3, byteCount: 100, contentsSha256: sha256('contents') },
      after: { receiptSha256: sha256('after'), observedAt: iso(-10_000), objectCount: 3, byteCount: 100, contentsSha256: sha256('contents') } },
  };
}
const validate = (input) => validateStorageIngressObservations(input, { scope, boundary: boundary(), now });
const codes = (report) => report.blockers.map((blocker) => blocker.code);

describe('storage observation consistency diagnostics — never activation authority', () => {
  it('recognizes the exact isolated-gateway/shared-direct photo split without claiming deployed proof', () => {
    const wiring = inspectStorageIngressWiring(root);
    assert.equal(wiring.gatewayGuarded, true);
    assert.equal(wiring.allEntrypointsGuarded,
      wiring.guardedEntrypointCount === wiring.expectedEntrypointCount);
    assert.equal(wiring.photoClientTransportRoutingExact, true);
    const report = buildStorageIngressReadiness(root);
    assert.equal(report.status, 'blocked');
    assert.equal(report.eligibleForActivation, false);
    assert.equal(report.storageByteFreezeConfirmed, false);
    assert.ok(codes(report).includes('observations_missing'));
  });
  it('even internally complete observations remain blocked and unverified', () => {
    const report = buildStorageIngressReadiness(root, { scope, observations: observations(), now });
    assert.deepEqual(codes(report), [
      ...(!report.wiring.allEntrypointsGuarded ? ['unguarded_entrypoint'] : []),
      'provider_review_unproven', 'owner_window',
    ]);
    for (const key of ['eligibleForActivation', 'sourceWriteFreezeConfirmed', 'storageByteFreezeConfirmed', 'externalProvenanceVerified']) assert.equal(report[key], false);
    assert.equal(report.observations.externalProvenanceVerified, false);
    assert.equal(report.observations.suppliedByteContentsStable, true);
    assert.equal(JSON.stringify(report).includes(scope.subjectIds[0]), false);
  });
  it('rejects unknown envelope fields, absent writers, duplicate writers, and substituted scope or build', () => {
    for (const mutate of [
      (p) => { p.approved = true; }, (p) => { p.writers.pop(); },
      (p) => { p.writers[1] = p.writers[0]; }, (p) => { p.subjectScope.scopeSha256 = sha256('other scope'); },
      (p) => { p.boundary.storagePolicySha256 = sha256('other policy'); },
      (p) => { p.writers[0].boundarySha256 = sha256('other boundary'); },
      (p) => { p.byteObservations.scopeSha256 = sha256('other scope'); },
      (p) => { p.writers[0].rawPath = 'private/path'; },
    ]) { const input = observations(); mutate(input); assert.throws(() => validate(input)); }
  });
  it('zero leases never hide missing or pending historical writers', () => {
    const input = observations();
    input.writers[0] = { ...input.writers[0], status: 'unobserved', receiptSha256: null, observedAt: null, pendingOperations: null };
    input.writers[1].pendingOperations = 1;
    const report = validate(input);
    assert.equal(report.activeLeaseCount, 0);
    assert.equal(report.unresolvedWriterCount, 2);
    assert.ok(codes(report).includes('writer_unobserved'));
    assert.ok(codes(report).includes('writer_pending'));
    assert.ok(codes(report).includes('writer_contradiction'));
  });
  it('diagnoses active/unresolved leases, reused receipts, byte changes, and an invalid drain interval', () => {
    const input = observations();
    input.leases.activeCount = 1; input.leases.unresolvedCount = 2;
    input.byteObservations.after.contentsSha256 = sha256('changed bytes');
    input.byteObservations.before.observedAt = iso(-60_000);
    input.byteObservations.after.receiptSha256 = input.byteObservations.before.receiptSha256;
    const report = validate(input);
    for (const code of ['leases_pending', 'receipt_reused', 'byte_contents_changed', 'byte_window_invalid']) assert.ok(codes(report).includes(code));
  });
  it('does not accept equal object hashes with changed object or byte counts', () => {
    for (const field of ['objectCount', 'byteCount']) {
      const input = observations(); input.byteObservations.after[field]++;
      assert.ok(codes(validate(input)).includes('byte_contents_changed'));
    }
  });
  it('rejects invalid counts, impossible timestamps, and fake unobserved receipts', () => {
    for (const mutate of [
      (p) => { p.leases.activeCount = -1; }, (p) => { p.writers[0].pendingOperations = 0.1; },
      (p) => { p.byteObservations.after.byteCount = Number.MAX_SAFE_INTEGER + 1; },
      (p) => { p.writers[0].pendingOperations = Number.MAX_SAFE_INTEGER; p.writers[1].pendingOperations = 1; },
      (p) => { p.observedAt = iso(31_000); }, (p) => { p.writers[0].observedAt = iso(1); },
      (p) => { p.observedAt = '2026-08-29'; }, (p) => { p.writers[0].status = 'unobserved'; },
    ]) { const input = observations(); mutate(input); assert.throws(() => validate(input)); }
  });
  it('reports stale evidence even if supplied writer/byte hashes agree', () => {
    const report = validateStorageIngressObservations(observations(), { scope, boundary: boundary(), now: now + 16 * 60_000 });
    assert.ok(codes(report).includes('stale_observations'));
    assert.ok(codes(report).includes('stale_item'));
  });
  it('requires both optional inputs and private non-symlink regular observation files', () => {
    assert.throws(() => buildStorageIngressReadiness(root, { scope }), /together/u);
    const temp = mkdtempSync(join(tmpdir(), 'mind-manual-ingress-packet-'));
    try {
      const path = join(temp, 'observations.json');
      writeFileSync(path, JSON.stringify(observations()), { mode: 0o600 });
      assert.deepEqual(loadStorageIngressObservations(path), observations());
      symlinkSync(path, join(temp, 'link.json'));
      assert.throws(() => loadStorageIngressObservations(join(temp, 'link.json')), /private regular/u);
      chmodSync(path, 0o644);
      assert.throws(() => loadStorageIngressObservations(path), /private regular/u);
      assert.throws(() => loadStorageIngressObservations('relative.json'), /absolute private/u);
      assert.throws(() => loadStorageIngressObservations(temp), /regular/u);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
  it('rejects cross-mode fallback, inverted boundary guards, retry loops, and changed source bindings', () => {
    const temp = mkdtempSync(join(tmpdir(), 'mind-manual-ingress-source-'));
    try {
      for (const directory of ['supabase/functions', 'supabase/isolation', 'src/services']) mkdirSync(join(temp, directory), { recursive: true });
      cpSync(join(root, 'supabase/functions'), join(temp, 'supabase/functions'), { recursive: true });
      for (const file of ['mind-manual-edge-functions.tsv', 'storage-write-gateway.sql']) cpSync(join(root, 'supabase/isolation', file), join(temp, 'supabase/isolation', file));
      const photoPath = join(temp, 'src/services/photoService.ts');
      cpSync(join(root, 'src/services/photoService.ts'), photoPath);
      const exactSource = readFileSync(photoPath, 'utf8');
      assert.equal(inspectStorageIngressWiring(temp).photoClientTransportRoutingExact, true);
      const uploadMethod = "  async uploadPhoto(file: File | string, fileName?: string): Promise<string> {";
      const mutations = [
        `${exactSource}\nsupabase.storage.from('photos').upload('unsafe', new Blob());\n`,
        exactSource.replaceAll("supabaseDeploymentBoundary.mode === 'owner-isolated'", "supabaseDeploymentBoundary.mode !== 'owner-isolated'"),
        exactSource.replace(
          "if (supabaseDeploymentBoundary.mode === 'owner-isolated') {",
          "if (supabaseDeploymentBoundary.mode === 'owner-isolated') {\n      await supabase.storage.from('photos').upload('unsafe', fileToUpload);",
        ),
        exactSource.replace(
          "() => supabase.storage.from('photos').upload(storagePath, fileToUpload, {\n          cacheControl: '3600', upsert: false,\n        }),",
          "() => {\n          for (let attempt = 0; attempt < 2; attempt++) {\n            return supabase.storage.from('photos').upload(storagePath, fileToUpload, { cacheControl: '3600', upsert: false });\n          }\n          throw new Error('unreachable');\n        },",
        ),
        exactSource.replace(uploadMethod, `${uploadMethod}\n    const { upload } = supabase.storage.from('photos');\n    void upload('unsafe', file);`),
        exactSource.replace(uploadMethod, `${uploadMethod}\n    void globalThis.fetch('/storage/v1/object/photos/unsafe', { method: 'POST' });`),
        exactSource.replace(uploadMethod, `${uploadMethod}\n    void this.uploadPhoto(file, fileName);`),
        exactSource.replace("cacheControl: '3600', upsert: false,", "cacheControl: '3600', upsert: false, ...{ upsert: true },"),
        exactSource.replace("cacheControl: '3600', upsert: false,", "cacheControl: '3600', upsert: false, ['up' + 'sert']: true,"),
        exactSource.replace(".upload(storagePath, fileToUpload, {", ".upload('foreign/path', fileToUpload, {"),
      ];
      for (const mutation of mutations) {
        assert.notEqual(mutation, exactSource);
        const parsed = ts.createSourceFile('photoService.mutant.ts', mutation, ts.ScriptTarget.Latest, true);
        assert.equal(parsed.parseDiagnostics.length, 0,
          parsed.parseDiagnostics.map((diagnostic) => diagnostic.messageText).join('; '));
        writeFileSync(photoPath, mutation);
        const report = buildStorageIngressReadiness(temp);
        assert.equal(report.wiring.photoClientTransportRoutingExact, false);
        assert.ok(codes(report).includes('photo_transport_topology_mismatch'));
      }
      assert.notEqual(buildStorageIngressReadiness(temp).boundary.photoClientSha256, boundary().photoClientSha256);
      assert.throws(() => buildStorageIngressReadiness(temp, { scope, observations: observations(), now }), /boundary mismatch/u);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
  it('CLI stays blocked with no args and rejects overrides or incomplete pairs without reflecting private arguments', () => {
    const checker = join(root, 'scripts/check-storage-ingress-readiness.mjs');
    const result = spawnSync(process.execPath, [checker], { encoding: 'utf8', env, timeout: 30_000 });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).sourceWriteFreezeConfirmed, false);
    for (const args of [['--force'], ['--subject-scope', '/private-sensitive-path'], ['--observations', '/private-sensitive-path', '--observations', '/private-sensitive-path']]) {
      const denied = spawnSync(process.execPath, [checker, ...args], { encoding: 'utf8', env, timeout: 30_000 });
      assert.equal(denied.status, 1);
      assert.equal((denied.stdout + denied.stderr).includes('/private-sensitive-path'), false);
    }
  });
  it('CLI accepts both private bound inputs only as blocked consistency evidence', () => {
    const temp = mkdtempSync(join(tmpdir(), 'mind-manual-ingress-cli-'));
    try {
      const scopePath = join(temp, 'scope.json');
      const observationPath = join(temp, 'observations.json');
      writeFileSync(scopePath, JSON.stringify(scope), { mode: 0o600 });
      writeFileSync(observationPath, JSON.stringify(observations()), { mode: 0o600 });
      const result = spawnSync(process.execPath, [join(root, 'scripts/check-storage-ingress-readiness.mjs'),
        '--observations', observationPath, '--subject-scope', scopePath], { encoding: 'utf8', env, timeout: 30_000 });
      assert.equal(result.status, 2, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.observations.subjectScope.scopeSha256, subjectScopeBinding(scope).scopeSha256);
      assert.equal(report.externalProvenanceVerified, false);
      assert.equal(report.storageByteFreezeConfirmed, false);
      assert.ok(codes(report).includes('provider_review_unproven'));
      assert.equal(result.stdout.includes(scope.subjectIds[0]), false);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { expectedMigrationGuardContract } from "../lib/migration-guard-catalog.mjs";
import { subjectScopeBinding, validateSubjectScope, validateSubjectScopeBinding } from "../lib/migration-subject-scope.mjs";
import { canonicalJson, readTsvManifest, sha256, sha256File } from "../lib/supabase-isolation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scratch = mkdtempSync(join(tmpdir(), "mind-manual-owner-only-cli-"));
const SOURCE = "ekekeywoxvdbfbmqyhjy";
const TARGET = "abcdefghijklmnopqrst";
const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const HASH = "a".repeat(64);
const MODE = "preserve_users_and_identities_force_reauthentication";
const POLICY_ERROR = /exactly one|owner.only/iu;
const SENTINEL = "OWNER_ONLY_FORBIDDEN_BOUNDARY";
const scopes = readTsvManifest("supabase/isolation/mind-manual-data-scopes.tsv", 3);
let fixtureNumber = 0;

after(() => rmSync(scratch, { recursive: true, force: true }));

function scope(ids = [OWNER]) {
  return { version: 1, kind: "mind_manual_subject_scope", sourceProjectRef: SOURCE,
    targetProjectRef: TARGET, subjectIds: ids, legacyStorageAssignments: [] };
}

// Intentionally do not call the production binding validator for stale receipts:
// these model formerly READY two-subject artifacts, including consistent hashes.
function historicalBinding(input) {
  return { version: 1, sourceProjectRef: SOURCE, targetProjectRef: TARGET,
    scopeSha256: sha256(canonicalJson(input)), subjectIdsSha256: sha256([...input.subjectIds].sort().join("\n")),
    subjectCount: input.subjectIds.length, legacyAssignmentsSha256: sha256(canonicalJson(input.legacyStorageAssignments)),
    rawSubjectIdsIncluded: false };
}
const ONE = historicalBinding(scope());
const TWO = historicalBinding(scope([OWNER, OTHER]));

// Every subprocess uses actual operator scripts, but cannot inspect linked
// project state, credentials, binary payloads, run subprocesses, or use network.
// A sentinel is emitted before throwing, even if the CLI sanitizes its error.
const preload = `
import fs from 'node:fs';
import child from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
function denied(kind) { process.stderr.write('${SENTINEL}:' + kind + '\\n'); throw new Error('${SENTINEL}'); }
function checkPath(path) {
  if (typeof path !== 'string' && !(path instanceof URL) && !Buffer.isBuffer(path)) return;
  const text = String(path);
  if (text.includes('/supabase/.temp/') || text.includes('/.supabase/')) denied('linked-state');
  if (text.endsWith('.bin')) denied('binary-payload');
}
for (const name of ['existsSync', 'readFileSync', 'openSync', 'statSync', 'lstatSync']) {
  const original = fs[name]; fs[name] = function(path, ...args) { checkPath(path); return original.call(this, path, ...args); };
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) child[name] = () => denied('subprocess');
for (const module of [http, https]) for (const name of ['request', 'get']) module[name] = () => denied('network');
for (const module of [net, tls]) for (const name of ['connect', 'createConnection']) if (module[name]) module[name] = () => denied('network');
globalThis.fetch = () => denied('network');
const secrets = new Set(['MIND_MANUAL_TARGET_DB_PASSWORD', 'MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY',
  'MIND_MANUAL_TARGET_SERVICE_ROLE_KEY', 'MIND_MANUAL_TARGET_PUBLIC_API_KEY', 'MIND_MANUAL_TARGET_AUTH_ACCESS_TOKEN',
  'OAUTH_ENCRYPTION_KEY', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL',
  'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']);
process.env = new Proxy(process.env, { get(target, key) { if (secrets.has(key)) denied('credential'); return target[key]; } });
syncBuiltinESMExports();
`;
const preloadUrl = `data:text/javascript;base64,${Buffer.from(preload).toString("base64")}`;

function runNode(args, cwd = scratch, extraEnv = {}, extraPreload = "") {
  const harnessUrl = extraPreload
    ? `data:text/javascript;base64,${Buffer.from(preload + extraPreload).toString("base64")}`
    : preloadUrl;
  return spawnSync(process.execPath, ["--import", harnessUrl, ...args], {
    cwd, encoding: "utf8", timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
    // Whitelist, never inherit real DB/provider/Auth credentials or NODE_OPTIONS.
    env: { PATH: join(scratch, "no-executables"), TMPDIR: scratch,
      PGHOST: join(scratch, "no-database-socket"),
      MIND_MANUAL_TARGET_OAUTH_KEY_IS_FRESH: "yes", MIND_MANUAL_SOURCE_PUBLIC_CONFIG_STORED: "yes", ...extraEnv },
  });
}
function run(script, args, cwd = scratch, extraEnv = {}) {
  return runNode([resolve(root, "scripts", script), ...args], cwd, extraEnv);
}

function fixture(change = () => {}) {
  const dir = join(scratch, `fixture-${++fixtureNumber}`);
  const packageDir = join(dir, "package");
  mkdirSync(packageDir, { recursive: true, mode: 0o700 });
  const now = new Date().toISOString();
  const common = { version: 1, sourceProjectRef: SOURCE, targetProjectRef: TARGET, subjectScope: ONE, sourceMutated: false };
  const source = { version: 1, kind: "source", projectRef: SOURCE, status: "ready", blockers: [], capturedAt: now,
    subjectScope: ONE, catalog: { migrationGuard: expectedMigrationGuardContract() },
    auth: { userCount: 1, identityCount: 1, subjectIdsSha256: ONE.subjectIdsSha256,
      usersSha256: HASH, identitiesSha256: HASH, mfaFactorCount: 0, ssoProviderCount: 0, nonDefaultInstanceCount: 0 },
    manifests: { dataScopesSha256: sha256File(join(root, "supabase/isolation/mind-manual-data-scopes.tsv")) },
    publicData: scopes.map(([relation, _owner, copyMode]) => ({ relation, copyMode,
      totalRowCount: ["oauth_tokens", "calendar_accounts"].includes(relation) ? 1 : 0,
      copyRowCount: ["oauth_tokens", "calendar_accounts"].includes(relation) ? 1 : 0, copyRowsSha256: HASH })),
    storage: { objects: ["photos", "voice-samples"].map(bucket => ({ bucket, objectCount: 0, totalBytes: 0,
      pathManifestSha256: HASH, targetPathManifestSha256: HASH })) } };
  const values = {
    scope: scope(), packageScope: scope(), source,
    decision: { ...common, mode: MODE, approvedBy: "owner", approvedAt: now, sourceWriteFreezeConfirmed: true,
      sourceWriteFreezeConfirmedAt: now, expectedUserCount: 1, sourceAuthSubjectsSha256: ONE.subjectIdsSha256 },
    manifest: { ...common, status: "exported_not_imported", authMode: MODE, forceReauthentication: true, files: [] },
    imported: { ...common, status: "verified_pending_storage_and_provider_rebind", migrationGuard: expectedMigrationGuardContract(),
      authSessionsCopied: false, refreshTokensCopied: false, targetPostImportReceiptSha256: HASH,
      copiedRelations: source.publicData.map(row => ({ logicalName: `public.${row.relation}`, rowCount: row.copyRowCount, fileSha256: HASH })) },
    reset: { ...common, status: "oauth_credentials_reset_pending_google_reauthorization", secretValuesIncluded: false, rowIdsIncluded: false },
    prepared: { ...common, status: "prepared_oauth_credentials_reset" },
    quarantine: { ...common, status: "provider_state_quarantined_pending_rebind", secretValuesIncluded: false, rowIdsIncluded: false },
    storage: { ...common, status: "verified", sourceSecretValueIncluded: false, targetSecretValueIncluded: false,
      rawObjectPathsIncluded: false, objects: [] },
    plan: { ...common, status: "planned_not_copied", sourceSecretValueIncluded: false, targetSecretValueIncluded: false,
      rawObjectPathsIncluded: false, objects: [] },
    revalidation: structuredClone(source), storageRevalidation: { ...common }, freeze: { ...common }, canary: { ...common },
  };
  change(values);
  const paths = {};
  const inputBytes = new Map();
  const save = (name, value, path = join(dir, `${name}.json`)) => {
    const bytes = Buffer.from(JSON.stringify(value));
    writeFileSync(path, bytes, { mode: 0o600 }); paths[name] = path; inputBytes.set(path, bytes);
    return sha256(bytes);
  };
  save("scope", values.scope);
  const packageScopeHash = save("packageScope", values.packageScope, join(packageDir, "subject-scope.json"));
  const sourceHash = save("source", values.source, join(packageDir, "source-preflight.json"));
  for (const name of ["decision", "imported", "reset", "storage", "plan"]) values[name].sourceReceiptSha256 = sourceHash;
  const decisionHash = save("decision", values.decision);
  Object.assign(values.manifest, { authDecisionSha256: decisionHash, freshSourceReceiptSha256: sourceHash,
    subjectScopeFile: { relativePath: "subject-scope.json", sha256: packageScopeHash } });
  const manifestHash = save("manifest", values.manifest, join(packageDir, "package-manifest.json"));
  Object.assign(values.imported, { authDecisionSha256: decisionHash, packageManifestSha256: manifestHash });
  const importHash = save("imported", values.imported);
  values.reset.importReceiptSha256 = importHash;
  const resetHash = save("reset", values.reset);
  Object.assign(values.quarantine, { importReceiptSha256: importHash, oauthResetReceiptSha256: resetHash });
  for (const name of ["quarantine", "storage", "plan", "revalidation", "storageRevalidation", "freeze", "canary", "prepared"]) save(name, values[name]);
  mkdirSync(join(packageDir, "data"), { mode: 0o700 });
  const binaryPath = join(packageDir, "data/auth.users.bin");
  writeFileSync(binaryPath, "synthetic payload must not be read", { mode: 0o600 });
  const output = join(dir, "output.json");
  const serviceOutput = join(dir, "service-output.json");
  const exportOutput = join(dir, "export-output");
  return { dir, paths, packageDir, output, serviceOutput, exportOutput, inputBytes };
}

function argsFor(route, f) {
  const p = f.paths;
  const target = ["--target-ref", TARGET];
  const receipt = ["--receipt", f.output];
  switch (route) {
    case "preflight": return ["supabase-isolation-preflight.mjs", ["--kind", "source", "--project-ref", SOURCE, "--subject-scope", p.scope, ...receipt]];
    case "preflight-target": return ["supabase-isolation-preflight.mjs", ["--kind", "target", "--project-ref", TARGET, "--subject-scope", p.scope, ...receipt]];
    case "preflight-compare": return ["supabase-isolation-preflight.mjs", ["--kind", "target", "--project-ref", TARGET, "--subject-scope", p.scope, "--compare-receipt", p.source, ...receipt, "--exit-zero"]];
    case "export": return ["export-isolated-supabase-data.mjs", ["--source-receipt", p.source, "--auth-decision", p.decision, "--subject-scope", p.scope, "--output-dir", f.exportOutput]];
    case "import": return ["import-isolated-supabase-data.mjs", ["--package-dir", f.packageDir, "--auth-decision", p.decision, ...target, "--execute", "--confirmation", "synthetic-not-approved"]];
    case "storage": return ["copy-isolated-supabase-storage.mjs", ["--subject-scope", p.scope, "--source-receipt", p.source, ...target, ...receipt]];
    case "storage-plan": return ["copy-isolated-supabase-storage.mjs", [...argsFor("storage", f)[1], "--execute", "--plan-receipt", p.plan, "--confirmation", "synthetic-not-approved"]];
    case "storage-compare": return ["copy-isolated-supabase-storage.mjs", [...argsFor("storage", f)[1], "--verify-only", "--compare-receipt", p.storage]];
    case "reset": return ["reset-isolated-supabase-oauth-credentials.mjs", ["--source-receipt", p.source, "--import-receipt", p.imported, ...target, ...receipt]];
    case "reset-recover": return ["reset-isolated-supabase-oauth-credentials.mjs", ["--source-receipt", p.source, "--import-receipt", p.imported,
      ...target, "--receipt", p.prepared, "--recover"]];
    case "quarantine": return ["quarantine-isolated-supabase-provider-state.mjs", ["--import-receipt", p.imported, "--oauth-reset-receipt", p.reset, ...target, ...receipt]];
    case "sync": return ["generate-sync-deferred-boundary-receipt.mjs", ["--source-receipt", p.source, "--import-receipt", p.imported, "--storage-receipt", p.storage,
      "--oauth-reset-receipt", p.reset, "--quarantine-receipt", p.quarantine, ...target, "--service-test-receipt", f.serviceOutput, ...receipt]];
    case "rollback": return ["prepare-isolated-supabase-rollback-receipt.mjs", ["--source-receipt", p.source, "--subject-scope", p.scope,
      "--source-revalidation-receipt", p.revalidation, "--source-freeze-receipt", p.freeze, "--package-manifest", p.manifest,
      "--auth-decision", p.decision, "--import-receipt", p.imported, "--storage-receipt", p.storage, "--storage-revalidation-receipt", p.storageRevalidation,
      "--oauth-reset-receipt", p.reset, "--quarantine-receipt", p.quarantine, "--target-canary-receipt", p.canary, ...target,
      "--window-ends", new Date(Date.now() + 60 * 60_000).toISOString(), ...receipt]];
    default: throw new Error("Unknown synthetic route");
  }
}

function rejectsOwnerScope(route, change, extraArgs = []) {
  const f = fixture(change);
  const [script, args] = argsFor(route, f);
  const result = run(script, [...args, ...extraArgs], f.dir);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, `${route} must finish without timeout`);
  assert.equal(result.status, 1, `${route}: ${result.stdout}${result.stderr}`);
  const diagnostic = result.stdout + result.stderr;
  assert.match(diagnostic, POLICY_ERROR, `${route} must reject owner-only policy, not unrelated fixture metadata`);
  assert.doesNotMatch(diagnostic, new RegExp(SENTINEL, "u"));
  assert.doesNotMatch(diagnostic, new RegExp(`${OWNER}|${OTHER}|synthetic payload`, "u"));
  for (const path of [f.output, f.serviceOutput, f.exportOutput, join(f.packageDir, "import-receipt.json")]) {
    assert.equal(existsSync(path), false, "No output receipt or export payload may be created");
  }
  for (const [path, bytes] of f.inputBytes) assert.deepEqual(readFileSync(path), bytes, "All synthetic inputs remain unchanged");
}

describe("owner-only actual migration command entrypoints", { concurrency: false }, () => {
  const guardProbes = {
    credential: "process.env.MIND_MANUAL_TARGET_DB_PASSWORD",
    "linked-state": `const fs = await import('node:fs'); fs.existsSync(${JSON.stringify(join(scratch, "supabase/.temp/project-ref"))})`,
    "binary-payload": `const fs = await import('node:fs'); fs.readFileSync(${JSON.stringify(join(scratch, "never-read.bin"))})`,
    subprocess: "const child = await import('node:child_process'); child.spawnSync(process.execPath, ['--version'])",
    network: "await fetch('about:blank')",
  };
  for (const [kind, probe] of Object.entries(guardProbes)) {
    it(`proves the synthetic harness traps ${kind} before any real access`, () => {
      const result = runNode(["--input-type=module", "--eval", probe]);
      assert.equal(result.error, undefined); assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`${SENTINEL}:${kind}`));
    });
  }
  it("accepts the exact one-owner envelope and rejects formerly-valid two-owner raw and hash-only evidence", () => {
    assert.deepEqual(validateSubjectScope(scope()), scope());
    assert.deepEqual(subjectScopeBinding(scope()), ONE);
    assert.deepEqual(validateSubjectScopeBinding(ONE), ONE);
    assert.throws(() => validateSubjectScope(scope([OWNER, OTHER])), POLICY_ERROR);
    assert.throws(() => validateSubjectScopeBinding(TWO), POLICY_ERROR);
  });

  for (const route of ["preflight", "preflight-target", "export", "storage", "storage-plan", "storage-compare", "rollback"]) {
    it(`${route} rejects an explicit two-owner scope before privileged or payload work`, () => {
      rejectsOwnerScope(route, values => { values.scope = scope([OWNER, OTHER]); });
    });
  }
  it("preflight --exit-zero/--overwrite cannot turn an owner-policy error into READY", () => {
    rejectsOwnerScope("preflight", values => { values.scope = scope([OWNER, OTHER]); }, ["--exit-zero", "--overwrite"]);
  });
  it("import rejects a two-owner embedded package scope before opening binary files", () => {
    rejectsOwnerScope("import", values => { values.packageScope = scope([OWNER, OTHER]); });
  });

  const staleSlots = {
    "preflight-compare": ["source"], export: ["source", "decision"], import: ["manifest", "source", "decision"],
    storage: ["source"], "storage-plan": ["plan"], "storage-compare": ["storage"],
    reset: ["source", "imported"], "reset-recover": ["prepared"], quarantine: ["imported", "reset"],
    sync: ["source", "imported", "storage", "reset", "quarantine"],
    rollback: ["source", "manifest", "decision", "revalidation", "freeze", "imported", "storage", "storageRevalidation", "reset", "quarantine"],
  };
  for (const [route, slots] of Object.entries(staleSlots)) for (const slot of slots) {
    it(`${route} rejects stale READY ${slot} evidence with subjectCount 2`, () => {
      rejectsOwnerScope(route, values => { values[slot].subjectScope = TWO; });
    });
  }

  for (const route of ["export", "import", "storage", "reset", "quarantine", "sync", "rollback"]) {
    it(`${route} rejects a consistently hashed historical two-owner chain, not just mismatched receipts`, () => {
      rejectsOwnerScope(route, values => {
        for (const value of Object.values(values)) if (value && "subjectScope" in value) value.subjectScope = TWO;
        values.scope = scope([OWNER, OTHER]); values.packageScope = scope([OWNER, OTHER]);
        for (const name of ["source", "revalidation"]) Object.assign(values[name].auth, { userCount: 2, subjectIdsSha256: TWO.subjectIdsSha256 });
        Object.assign(values.decision, { expectedUserCount: 2, sourceAuthSubjectsSha256: TWO.subjectIdsSha256 });
      });
    });
  }

  for (const argument of ["--all-users", "--allow-multiple-subjects", "--force"]) {
    it(`does not expose a ${argument} override`, () => {
      const f = fixture(); const [script, args] = argsFor("preflight", f);
      const result = run(script, [...args, argument], f.dir);
      assert.equal(result.status, 1); assert.match(result.stderr, /unknown option/u);
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SENTINEL, "u"));
      assert.equal(existsSync(f.output), false);
    });
  }

  it("reset recovery rejects a newer receipt installed between the early snapshot and target lock", () => {
    const f = fixture();
    const lockPath = join(f.dir, `mind-manual-oauth-reset-${TARGET}.lock`);
    const replacement = JSON.stringify({ version: 1, sourceProjectRef: SOURCE, targetProjectRef: TARGET,
      subjectScope: ONE, status: "oauth_credentials_reset_pending_google_reauthorization", verifiedAt: "synthetic-newer-receipt" });
    const raceMarker = "OWNER_ONLY_SYNTHETIC_RECEIPT_REPLACED";
    const racePreload = `
// This probe supplies only hard-coded synthetic values; every other credential
// and external port remains guarded by the original test harness.
process.env = new Proxy(process.env, { get(target, key) {
  if (key === 'MIND_MANUAL_TARGET_DB_PASSWORD') return 'synthetic-not-a-database-password';
  if (key === 'OAUTH_ENCRYPTION_KEY') return 'S'.repeat(32);
  return Reflect.get(target, key);
} });
const originalOpen = fs.openSync;
let replaced = false;
fs.openSync = function(path, ...args) {
  if (!replaced && String(path) === ${JSON.stringify(lockPath)} && args[0] === 'wx') {
    replaced = true;
    const next = ${JSON.stringify(`${f.paths.prepared}.replacement`)};
    fs.writeFileSync(next, ${JSON.stringify(replacement)}, { mode: 0o600 });
    fs.renameSync(next, ${JSON.stringify(f.paths.prepared)});
    process.stderr.write('${raceMarker}\\n');
  }
  return originalOpen.call(this, path, ...args);
};
syncBuiltinESMExports();
`;
    const [script, args] = argsFor("reset-recover", f);
    const result = runNode([resolve(root, "scripts", script), ...args], f.dir, { TMPDIR: f.dir }, racePreload);
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(raceMarker), "The replacement must occur at the actual lock acquisition");
    assert.match(result.stderr, /receipt changed before.*lock/iu);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SENTINEL, "u"));
    assert.equal(readFileSync(f.paths.prepared, "utf8"), replacement, "The newer receipt must not be overwritten");
    assert.equal(existsSync(lockPath), false, "The just-acquired lock must be released on rejection");
    for (const [path, bytes] of f.inputBytes) if (path !== f.paths.prepared) assert.deepEqual(readFileSync(path), bytes);
    assert.equal(existsSync(f.output), false); assert.equal(existsSync(f.serviceOutput), false);
  });
});

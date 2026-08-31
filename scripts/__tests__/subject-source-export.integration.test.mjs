import assert from "node:assert/strict";
import { expectedMigrationGuardContract } from "../lib/migration-guard-catalog.mjs";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authInventorySql,
  compareReceipts,
  dataInventorySql,
  scopeInventoryBlockers,
  secretManifestFingerprints,
  storageInventorySql,
  summarizeStorageInventory,
} from "../supabase-isolation-preflight.mjs";
import {
  buildExportCommands,
  buildExportEntries,
  exportSnapshotAssertions,
  validateDecision,
  validateFreshSourceReceipt,
  validateSourceReceipt,
} from "../export-isolated-supabase-data.mjs";
import {
  subjectScopeBinding,
  validateSubjectScope,
} from "../lib/migration-subject-scope.mjs";
import { sha256 } from "../lib/supabase-isolation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const selected = "10000000-0000-4000-8000-000000000001";
const unrelated = "20000000-0000-4000-8000-000000000002";
const newcomer = "30000000-0000-4000-8000-000000000003";
const missing = "40000000-0000-4000-8000-000000000004";
const scope = validateSubjectScope({
  version: 1,
  kind: "mind_manual_subject_scope",
  sourceProjectRef: "ekekeywoxvdbfbmqyhjy",
  targetProjectRef: "fjxedbaskrbewjunfxaj",
  subjectIds: [selected],
  legacyStorageAssignments: [],
});
const dataScopes = readFileSync(
  join(root, "supabase/isolation/mind-manual-data-scopes.tsv"),
  "utf8",
)
  .split(/\r?\n/u).filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [relation, ownerColumn, copyMode] = line.split("\t");
    return { relation, ownerColumn, copyMode };
  });
const relationMap = new Map(
  dataScopes.map((
    { relation, ownerColumn },
  ) => [relation, {
    kind: "r",
    columns: [
      { name: "id" },
      ...(ownerColumn === "id" ? [] : [{ name: ownerColumn }]),
      { name: "payload" },
    ],
  }]),
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
);
let pgBin;
let scratch;
let started = false;

function command(exe, args, options = {}) {
  const result = spawnSync(join(pgBin, exe), args, {
    encoding: "utf8",
    env,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.error, undefined, `${exe}: ${result.error?.message}`);
  return result;
}
function psqlArgs() {
  return [
    "-X",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-h",
    scratch,
    "-p",
    "5432",
    "-U",
    "postgres",
    "-d",
    "postgres",
  ];
}
function sql(statement, quiet = true) {
  const result = command("psql", [...psqlArgs(), ...(quiet ? ["-q"] : [])], {
    input: statement,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function json(statement) {
  return JSON.parse(sql(statement));
}
function inventories(subjectScope = scope, kind = "source") {
  const rawAuth = json(authInventorySql(subjectScope, kind));
  const {
    excludedUserCount,
    unapprovedIdentityCount,
    unapprovedSessionCount,
    unapprovedRefreshTokenCount,
    ...auth
  } = rawAuth;
  const publicData = json(
    dataInventorySql(dataScopes, relationMap, subjectScope, kind),
  )
    .map(({ excludedOwnedRowCount, unapprovedRowCount, ...row }) => row);
  const { excludedObjects, blockers, ...storage } = summarizeStorageInventory(
    json(storageInventorySql(["photos", "voice-samples"], kind)),
    subjectScope,
    kind,
  );
  return {
    version: 1,
    kind,
    projectRef: subjectScope.sourceProjectRef,
    status: "ready",
    blockers,
    subjectScope: subjectScopeBinding(subjectScope),
    manifests: { fixture: "exact", ...secretManifestFingerprints() },
    catalog: { relations: [], functions: [], migrationGuard: expectedMigrationGuardContract() },
    auth,
    publicData,
    storage,
    excludedDataInventory: {
      excludedUserCount,
      unapprovedIdentityCount,
      unapprovedSessionCount,
      unapprovedRefreshTokenCount,
      excludedObjects,
    },
  };
}
function insertRows(subject, payload) {
  return dataScopes.map(({ relation, ownerColumn }) =>
    `INSERT INTO public.${relation} (id, ${
      ownerColumn === "id" ? "" : `${ownerColumn}, `
    }payload)
      VALUES ('${subject}', ${
      ownerColumn === "id" ? "" : `'${subject}', `
    }'${payload}');`
  ).join("\n");
}

describe("subject-scoped source/export — real disposable PostgreSQL", {
  concurrency: false,
}, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN
      ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : [
        "/opt/homebrew/opt/postgresql@16/bin",
        "/opt/homebrew/opt/postgresql@17/bin",
        "/opt/homebrew/opt/postgresql@18/bin",
        "/usr/lib/postgresql/16/bin",
        "/usr/lib/postgresql/17/bin",
        "/usr/lib/postgresql/18/bin",
        ...String(process.env.PATH ?? "").split(delimiter),
      ];
    pgBin = candidates.find((candidate) =>
      ["postgres", "initdb", "pg_ctl", "psql"].every((binary) =>
        existsSync(join(candidate, binary))
      )
    );
    assert.ok(
      pgBin,
      "Local PostgreSQL server binaries are required; remote databases and skipped tests are forbidden.",
    );
    scratch = mkdtempSync(join(tmpdir(), "mind-manual-scope-pg-"));
    const initialized = command("initdb", [
      "-D",
      join(scratch, "data"),
      "-U",
      "postgres",
      "--auth=trust",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    assert.equal(initialized.status, 0, initialized.stderr);
    const start = command("pg_ctl", [
      "-D",
      join(scratch, "data"),
      "-l",
      join(scratch, "server.log"),
      "-o",
      `-F -k '${scratch}' -h ''`,
      "-w",
      "start",
    ]);
    assert.equal(start.status, 0, start.stderr + start.stdout);
    started = true;
    sql(
      `CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, instance_id uuid DEFAULT '00000000-0000-0000-0000-000000000000', payload text);
      CREATE TABLE auth.identities (id uuid PRIMARY KEY, user_id uuid, provider text, payload text);
      CREATE TABLE auth.sessions (user_id uuid); CREATE TABLE auth.refresh_tokens (user_id text);
      CREATE TABLE auth.mfa_factors (user_id uuid); CREATE TABLE auth.sso_providers (id uuid);
      CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects (bucket_id text, name text, owner_id text, metadata jsonb);
      ${
        dataScopes.map(({ relation, ownerColumn }) =>
          `CREATE TABLE public.${relation} (id uuid PRIMARY KEY, ${
            ownerColumn === "id" ? "" : `${ownerColumn} uuid, `
          }payload text);`
        ).join("\n")
      }
    `,
    );
  });
  beforeEach(() => {
    sql(
      `TRUNCATE auth.users, auth.identities, auth.sessions, auth.refresh_tokens, auth.mfa_factors,
      auth.sso_providers, storage.buckets, storage.objects, ${
        dataScopes.map(({ relation }) => `public.${relation}`).join(",")
      };
      INSERT INTO auth.users (id,payload) VALUES ('${selected}','selected_credentials'),('${unrelated}','outside_credentials');
      INSERT INTO auth.identities VALUES ('${selected}','${selected}','email','selected_identity'),('${unrelated}','${unrelated}','sso:outside','outside_identity');
      INSERT INTO auth.sessions VALUES ('${selected}'),('${unrelated}');
      INSERT INTO auth.refresh_tokens VALUES ('${selected}'),('${unrelated}');
      INSERT INTO auth.mfa_factors VALUES ('${unrelated}'); INSERT INTO auth.sso_providers VALUES ('${unrelated}');
      INSERT INTO storage.buckets VALUES ('photos',false,NULL,NULL),('voice-samples',false,NULL,NULL);
      INSERT INTO storage.objects VALUES ('photos','${selected}/selected.jpg','${selected}','{"size":4}'),
        ('photos','${unrelated}/outside.jpg','${unrelated}','{"size":8}');
      ${insertRows(selected, "selected_payload")}
      ${insertRows(unrelated, "outside_payload")}
    `,
    );
  });
  after(() => {
    if (started) {
      const stopped = command("pg_ctl", [
        "-D",
        join(scratch, "data"),
        "-m",
        "immediate",
        "-w",
        "stop",
      ]);
      assert.equal(stopped.status, 0, stopped.stderr);
    }
    // Exact private directory created by this test, never an existing server or arbitrary path.
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it("filters every copied relation, Auth/provider/MFA/session inventory, and transient rows to approved subjects", () => {
    const receipt = inventories();
    assert.equal(receipt.auth.userCount, 1);
    assert.equal(receipt.auth.identityCount, 1);
    assert.equal(receipt.auth.subjectIdsSha256, sha256(selected));
    assert.deepEqual(receipt.auth.providerCounts, { email: 1 });
    assert.equal(receipt.auth.sessionCountExcluded, 1);
    assert.equal(receipt.auth.refreshTokenCountExcluded, 1);
    assert.equal(receipt.auth.mfaFactorCount, 0);
    assert.equal(receipt.auth.ssoProviderCount, 0);
    assert.equal(receipt.publicData.length, dataScopes.length);
    for (const row of receipt.publicData) {
      assert.equal(row.totalRowCount, 1, row.relation);
      assert.equal(
        row.copyRowCount,
        row.copyMode === "copy" ? 1 : 0,
        row.relation,
      );
      assert.equal(row.unownedRowCount, 0);
    }
    assert.equal(receipt.storage.objects[0].objectCount, 1);
    assert.equal(receipt.storage.objects[0].totalBytes, 4);
    assert.equal(
      receipt.storage.objects[0].pathManifestSha256,
      sha256(`${selected}/selected.jpg`),
    );
    assert.ok(!JSON.stringify(receipt).includes(selected));
    assert.ok(!JSON.stringify(receipt).includes(unrelated));
    assert.ok(!JSON.stringify(receipt).includes("outside_credentials"));
  });

  it("unrelated edits and a new signup do not change selected hashes or export binary contents", () => {
    const before = inventories();
    const entries = buildExportEntries(dataScopes, before, scope);
    const first = mkdtempSync(join(scratch, "first-export-"));
    mkdirSync(join(first, "data"));
    sql(buildExportCommands(entries, first));
    sql(
      `UPDATE auth.users SET payload='outside_updated',instance_id='${unrelated}' WHERE id='${unrelated}';
      UPDATE auth.identities SET payload='outside_linked' WHERE user_id='${unrelated}';
      INSERT INTO auth.users (id,payload) VALUES ('${newcomer}','new_signup_credentials');
      INSERT INTO auth.identities VALUES ('${newcomer}','${newcomer}','email','new_signup_identity');
      INSERT INTO auth.sessions VALUES ('${newcomer}'); INSERT INTO auth.refresh_tokens VALUES ('${newcomer}');
      INSERT INTO storage.objects VALUES ('photos','${newcomer}/new.jpg','${newcomer}','{"size":16}');
      ${
        dataScopes.map(({ relation, ownerColumn }) =>
          `UPDATE public.${relation} SET payload='outside_changed' WHERE ${ownerColumn}='${unrelated}';`
        ).join("\n")
      }
      ${insertRows(newcomer, "new_signup_payload")}
    `,
    );
    const after = inventories();
    validateFreshSourceReceipt(after, before);
    assert.deepEqual(after.auth, before.auth);
    assert.deepEqual(after.publicData, before.publicData);
    assert.deepEqual(after.storage, before.storage);
    assert.notDeepEqual(
      after.excludedDataInventory,
      before.excludedDataInventory,
    );
    const second = mkdtempSync(join(scratch, "second-export-"));
    mkdirSync(join(second, "data"));
    const output = sql(
      buildExportCommands(buildExportEntries(dataScopes, after, scope), second),
    );
    assert.equal(
      [...output.matchAll(/^COPY\s+(\d+)$/gmu)].length,
      dataScopes.length + 2,
    );
    for (const entry of entries) {
      const bytes = readFileSync(join(first, entry.relativePath));
      assert.deepEqual(
        readFileSync(join(second, entry.relativePath)),
        bytes,
        entry.logicalName,
      );
      assert.ok(!bytes.includes(Buffer.from("outside_")), entry.logicalName);
      assert.ok(!bytes.includes(Buffer.from("new_signup_")), entry.logicalName);
    }
  });

  it("target inventories all users and rows, including unapproved Auth, MFA, SSO and Storage", () => {
    const auth = json(authInventorySql(scope, "target"));
    assert.equal(auth.userCount, 2);
    assert.equal(auth.identityCount, 2);
    assert.equal(auth.excludedUserCount, 1);
    assert.equal(auth.unapprovedIdentityCount, 1);
    assert.equal(auth.mfaFactorCount, 1);
    assert.equal(auth.ssoProviderCount, 1);
    assert.match(
      scopeInventoryBlockers("target", subjectScopeBinding(scope), auth, [])
        .join("\n"),
      /outside the approved subject scope/u,
    );
    for (
      const row of json(
        dataInventorySql(dataScopes, relationMap, scope, "target"),
      )
    ) {
      assert.equal(row.totalRowCount, 2);
      assert.equal(row.unapprovedRowCount, 1);
    }
    const storage = summarizeStorageInventory(
      json(storageInventorySql(["photos", "voice-samples"])),
      scope,
      "target",
    );
    assert.equal(storage.objects[0].objectCount, 2);
    assert.match(storage.blockers.join("\n"), /unapproved objects/u);
  });

  it("target requires exactly the two private buckets while source ignores unrelated bucket metadata and bytes", () => {
    const before = inventories();
    sql(
      `INSERT INTO storage.buckets VALUES ('unrelated-private',false,NULL,NULL);
      INSERT INTO storage.objects VALUES ('unrelated-private','secret-object.jpg','${unrelated}','{"size":500}');`,
    );
    const sourceRaw = json(
      storageInventorySql(["photos", "voice-samples"], "source"),
    );
    assert.equal(sourceRaw.buckets.length, 2);
    assert.deepEqual(inventories().storage, before.storage);
    const targetRaw = json(
      storageInventorySql(["photos", "voice-samples"], "target"),
    );
    assert.equal(targetRaw.buckets.length, 3);
    assert.ok(
      targetRaw.objects.every((object) =>
        object.bucket !== "unrelated-private"
      ),
    );
    assert.match(
      summarizeStorageInventory(targetRaw, scope, "target").blockers.join("\n"),
      /buckets outside the allowlist/u,
    );
    sql("DELETE FROM storage.buckets WHERE id='voice-samples';");
    const missingBucketRaw = json(
      storageInventorySql(["photos", "voice-samples"], "target"),
    );
    assert.match(
      summarizeStorageInventory(missingBucketRaw, scope, "target").blockers
        .join("\n"),
      /missing private storage bucket: voice-samples/u,
    );
  });

  it("rejects missing selected users, old unscoped receipts, and a changed selected scope", () => {
    const approved = inventories();
    const old = structuredClone(approved);
    delete old.subjectScope;
    assert.throws(() => validateSourceReceipt(old), /subject scope/u);
    const changedScope = validateSubjectScope({
      ...scope,
      subjectIds: [missing],
    });
    assert.throws(
      () => validateSourceReceipt(inventories(changedScope)),
      /Auth subjects/u,
    );
    const changed = {
      ...approved,
      subjectScope: subjectScopeBinding({ ...scope, subjectIds: [unrelated] }),
    };
    assert.throws(
      () => validateFreshSourceReceipt(changed, approved),
      /subject/u,
    );
    const blockers = [];
    compareReceipts({ ...approved, kind: "target" }, old, blockers);
    assert.equal(blockers.length, 1);
    assert.match(blockers.join("\n"), /subject scope/u);
  });

  it("rejects missing or forged guards even when source and target claim matching catalogs", () => {
    const approved = inventories();
    for (const migrationGuard of [undefined, {}, { ...approved.catalog.migrationGuard, catalogSha256: "0".repeat(64) }]) {
      const changed = { ...approved, catalog: { ...approved.catalog, migrationGuard } };
      assert.throws(() => validateSourceReceipt(changed), /guard catalog/u);
      const blockers = [];
      compareReceipts({ ...changed, kind: "target" }, changed, blockers);
      assert.deepEqual(blockers, [
        "migration guard catalog binding is missing, stale or unreviewed",
        "migration guard catalog binding is missing, stale or unreviewed",
      ]);
    }
  });

  it("binds configuration manifests independently of valid selected data and guard catalogs", () => {
    const approved = inventories();
    const target = { ...approved, kind: "target" };
    const matchingBlockers = [];
    compareReceipts(target, approved, matchingBlockers);
    assert.deepEqual(matchingBlockers, []);
    for (const field of ["secretsSha256", "optionalConfigSha256"]) {
      const changed = {
        ...target,
        manifests: { ...target.manifests, [field]: "0".repeat(64) },
      };
      const blockers = [];
      compareReceipts(changed, approved, blockers);
      assert.deepEqual(blockers, [`configuration manifest binding mismatch: ${field}`]);
    }
  });

  it("requires the exact approved scope, byte-snapshot hash, owner decision and actual fresh freeze assertion", () => {
    const receipt = inventories();
    const sourceHash = sha256("synthetic source snapshot bytes");
    const decision = {
      version: 1,
      sourceProjectRef: scope.sourceProjectRef,
      targetProjectRef: scope.targetProjectRef,
      subjectScope: receipt.subjectScope,
      mode: "preserve_users_and_identities_force_reauthentication",
      expectedUserCount: 1,
      sourceAuthSubjectsSha256: receipt.auth.subjectIdsSha256,
      sourceReceiptSha256: sourceHash,
      approvedBy: "owner",
      approvedAt: new Date().toISOString(),
      sourceWriteFreezeConfirmed: true,
      sourceWriteFreezeConfirmedAt: new Date().toISOString(),
    };
    validateDecision(decision, receipt, sourceHash);
    assert.throws(
      () => validateDecision(decision, receipt, sha256("mutated file bytes")),
      /fingerprint/u,
    );
    assert.throws(
      () =>
        validateDecision(
          { ...decision, subjectScope: undefined },
          receipt,
          sourceHash,
        ),
      /subject scope/u,
    );
    assert.throws(
      () =>
        validateDecision(
          { ...decision, approvedBy: "template" },
          receipt,
          sourceHash,
        ),
      /owner approval/u,
    );
    assert.throws(
      () =>
        validateDecision(
          { ...decision, sourceWriteFreezeConfirmed: false },
          receipt,
          sourceHash,
        ),
      /confirm the source/u,
    );
    assert.throws(
      () =>
        validateDecision(
          {
            ...decision,
            sourceWriteFreezeConfirmedAt: new Date(Date.now() - 31 * 60 * 1000)
              .toISOString(),
          },
          receipt,
          sourceHash,
        ),
      /30 minutes/u,
    );
  });

  it("requires disposition for null-owner and orphaned durable rows instead of copying them", () => {
    sql(
      `INSERT INTO public.ai_conversations VALUES ('${newcomer}',NULL,'unknown'),('${missing}','${missing}','orphan');`,
    );
    const row = json(dataInventorySql(dataScopes, relationMap, scope)).find((
      entry,
    ) => entry.relation === "ai_conversations");
    assert.equal(row.totalRowCount, 1);
    assert.equal(row.copyRowCount, 1);
    assert.equal(row.unownedRowCount, 2);
    assert.match(
      scopeInventoryBlockers(
        "source",
        subjectScopeBinding(scope),
        inventories().auth,
        [row],
      ).join("\n"),
      /without a disposition/u,
    );
  });

  it("rejects out-of-scope sessions and refresh tokens on an otherwise selected-only target", () => {
    sql(
      `DELETE FROM auth.users WHERE id='${unrelated}'; DELETE FROM auth.identities WHERE user_id='${unrelated}';
      TRUNCATE auth.mfa_factors,auth.sso_providers;`,
    );
    const auth = json(authInventorySql(scope, "target"));
    assert.equal(auth.excludedUserCount, 0);
    assert.equal(auth.unapprovedIdentityCount, 0);
    assert.equal(auth.unapprovedSessionCount, 1);
    assert.equal(auth.unapprovedRefreshTokenCount, 1);
    assert.match(
      scopeInventoryBlockers("target", subjectScopeBinding(scope), auth, [])
        .join("\n"),
      /sessions outside/u,
    );
  });

  it("rejects newly added selected MFA inside the export snapshot without affecting outside MFA", () => {
    const entries = buildExportEntries(dataScopes, inventories(), scope);
    sql(`INSERT INTO auth.mfa_factors VALUES ('${selected}');`);
    const destination = mkdtempSync(join(scratch, "mfa-denied-export-"));
    mkdirSync(join(destination, "data"));
    const result = command("psql", psqlArgs(), {
      input: buildExportCommands(entries, destination),
    });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /55000: Scoped export cannot omit selected MFA state/u,
    );
    for (const entry of entries) {
      assert.ok(!existsSync(join(destination, entry.relativePath)));
    }
  });

  for (
    const target of ["auth.users", "auth.identities", "public.ai_conversations"]
  ) {
    it(`same-count selected mutation in ${target} rejects both fresh approval and transaction-snapshot export`, () => {
      const before = inventories();
      const entries = buildExportEntries(dataScopes, before, scope);
      sql(
        `UPDATE ${target} SET payload='selected_changed' WHERE id='${selected}';`,
      );
      assert.throws(
        () => validateFreshSourceReceipt(inventories(), before),
        /changed after owner approval/u,
      );
      const destination = mkdtempSync(join(scratch, "denied-export-"));
      mkdirSync(join(destination, "data"));
      const result = command("psql", psqlArgs(), {
        input: buildExportCommands(entries, destination),
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /55000: Scoped export snapshot changed/u);
      for (const entry of entries) {
        assert.ok(
          !existsSync(join(destination, entry.relativePath)),
          "Assertions must precede every binary COPY",
        );
      }
    });
  }

  it("rejects catalog drift and fails closed on missing snapshot fingerprints", () => {
    const approved = inventories();
    const changed = structuredClone(approved);
    changed.catalog.relations.push({
      fullFingerprintSha256: sha256("changed trigger"),
    });
    assert.throws(
      () => validateFreshSourceReceipt(changed, approved),
      /exact source catalog/u,
    );
    const entries = buildExportEntries(dataScopes, approved, scope);
    delete entries[0].sourceRowsSha256;
    assert.throws(() => exportSnapshotAssertions(entries), /fingerprint/u);
  });
});

describe("subject storage receipt policy", () => {
  const raw = (objects) => ({
    buckets: [],
    objects: objects.map((object) => ({
      metadataText: "{}",
      bytes: 1,
      ...object,
    })),
  });
  it("requires exact legacy mapping even for a sole selected user and never leaks paths in errors", () => {
    assert.throws(
      () =>
        summarizeStorageInventory(
          raw([{
            bucket: "photos",
            path: "private-legacy.jpg",
            ownerId: null,
          }]),
          scope,
        ),
      (error) =>
        /explicit path assignment/u.test(error.message) &&
        !error.message.includes("private-legacy.jpg"),
    );
    const explicit = {
      ...scope,
      legacyStorageAssignments: [{
        bucket: "photos",
        pathSha256: sha256("legacy.jpg"),
        ownerSubjectId: selected,
      }],
    };
    const inventory = summarizeStorageInventory(
      raw([{ bucket: "photos", path: "legacy.jpg", ownerId: null }]),
      explicit,
    );
    assert.equal(inventory.objects[0].pathManifestSha256, sha256("legacy.jpg"));
    assert.equal(
      inventory.objects[0].targetPathManifestSha256,
      sha256(`${selected}/legacy.jpg`),
    );
    assert.equal(
      inventory.objects[0].pathPolicy,
      "explicit_legacy_remap_required",
    );
    assert.throws(
      () => summarizeStorageInventory(raw([]), explicit),
      /unused legacy/u,
    );
  });
  it("explicit exclusion, conflicting owners, and path collisions fail closed as appropriate", () => {
    const explicit = {
      ...scope,
      legacyStorageAssignments: [{
        bucket: "photos",
        pathSha256: sha256("outside.jpg"),
        ownerSubjectId: unrelated,
      }],
    };
    assert.equal(
      summarizeStorageInventory(
        raw([{ bucket: "photos", path: "outside.jpg", ownerId: unrelated }]),
        explicit,
      ).objects.length,
      0,
    );
    assert.deepEqual(summarizeStorageInventory(raw([]), explicit).objects, []);
    assert.throws(
      () =>
        summarizeStorageInventory(
          raw([{
            bucket: "photos",
            path: `${selected}/x.jpg`,
            ownerId: unrelated,
          }]),
          scope,
        ),
      /conflict/u,
    );
    const collisionScope = {
      ...scope,
      legacyStorageAssignments: [{
        bucket: "photos",
        pathSha256: sha256("legacy.jpg"),
        ownerSubjectId: selected,
      }],
    };
    assert.throws(
      () =>
        summarizeStorageInventory(
          raw([{ bucket: "photos", path: "legacy.jpg" }, {
            bucket: "photos",
            path: `${selected}/legacy.jpg`,
          }]),
          collisionScope,
        ),
      /collide/u,
    );
  });
});

describe("required private subject-scope CLI boundary", () => {
  for (const kind of ["source", "target"]) {
    it(`requires a subject scope before any ${kind} preflight database access`, () => {
      const result = spawnSync(process.execPath, [
        join(root, "scripts/supabase-isolation-preflight.mjs"),
        "--kind",
        kind,
        "--project-ref",
        kind === "source" ? scope.sourceProjectRef : scope.targetProjectRef,
        "--receipt",
        "/nonexistent-private-preflight.json",
      ], { encoding: "utf8", env });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /missing required option: --subject-scope/u);
    });
  }
  it("requires a subject scope before reading an approval or creating an export directory", () => {
    const result = spawnSync(process.execPath, [
      join(root, "scripts/export-isolated-supabase-data.mjs"),
      "--source-receipt",
      "/nonexistent-private-source.json",
      "--auth-decision",
      "/nonexistent-private-decision.json",
      "--output-dir",
      "/nonexistent-private-export",
    ], { encoding: "utf8", env });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing required option: --subject-scope/u);
  });
});

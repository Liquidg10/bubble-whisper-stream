import assert from "node:assert/strict";
import { expectedMigrationGuardContract } from "../lib/migration-guard-catalog.mjs";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  assertScopeBinding,
  classifyStorageObject,
  loadSubjectScope,
  scopeSqlPredicate,
  subjectScopeBinding,
  targetSubjectAssertionSql,
  validateSubjectScope,
  validateSubjectScopeBinding,
} from "../lib/migration-subject-scope.mjs";
import {
  importTransactionGuards,
  privateSnapshot,
  snapshotPackageBinaryFiles,
  validateImportScope,
} from "../lib/import-subject-package.mjs";
import {
  canonicalJson,
  readTsvManifest,
  sha256,
} from "../lib/supabase-isolation.mjs";

const SOURCE = "ekekeywoxvdbfbmqyhjy";
const TARGET = "abcdefghijklmnopqrst";
const FIRST = "10000000-0000-4000-8000-000000000001";
const SECOND = "20000000-0000-4000-8000-000000000002";
const OUTSIDE = "30000000-0000-4000-8000-000000000003";
const directories = [];
const publicScopes = readTsvManifest(
  "supabase/isolation/mind-manual-data-scopes.tsv",
  3,
);

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporary() {
  const directory = mkdtempSync(join(tmpdir(), "mind-manual-scope-unit-"));
  directories.push(directory);
  return directory;
}

function scope() {
  return {
    version: 1,
    kind: "mind_manual_subject_scope",
    sourceProjectRef: SOURCE,
    targetProjectRef: TARGET,
    subjectIds: [SECOND, FIRST],
    legacyStorageAssignments: [
      {
        bucket: "voice-samples",
        pathSha256: sha256("legacy-voice.webm"),
        ownerSubjectId: SECOND,
      },
      {
        bucket: "photos",
        pathSha256: sha256("legacy-photo.png"),
        ownerSubjectId: FIRST,
      },
      {
        bucket: "photos",
        pathSha256: sha256("legacy-outside.png"),
        ownerSubjectId: OUTSIDE,
      },
    ],
  };
}

function importInputs() {
  const input = scope();
  const binding = subjectScopeBinding(input);
  const scopeFileSha256 = sha256(JSON.stringify(input));
  return {
    scope: input,
    scopeFileSha256,
    targetRef: TARGET,
    manifest: {
      subjectScope: binding,
      subjectScopeFile: {
        relativePath: "subject-scope.json",
        sha256: scopeFileSha256,
      },
    },
    source: {
      subjectScope: binding,
      auth: { userCount: 2, subjectIdsSha256: binding.subjectIdsSha256 },
      catalog: { migrationGuard: expectedMigrationGuardContract() },
    },
    decision: { subjectScope: binding },
  };
}

describe("private subject scope and hash-only contracts", () => {
  it("normalizes order without mutating operator input and produces one canonical binding", () => {
    const input = scope();
    const before = canonicalJson(input);
    const normalized = validateSubjectScope(input);
    assert.deepEqual(normalized.subjectIds, [FIRST, SECOND]);
    assert.equal(canonicalJson(input), before);
    const reordered = {
      ...input,
      subjectIds: [...input.subjectIds].reverse(),
      legacyStorageAssignments: [...input.legacyStorageAssignments].reverse(),
    };
    const binding = subjectScopeBinding(input);
    assert.deepEqual(subjectScopeBinding(reordered), binding);
    assert.equal(binding.subjectIdsSha256, sha256(`${FIRST}\n${SECOND}`));
    assert.equal(binding.scopeSha256, sha256(canonicalJson(normalized)));
    assert.equal(binding.subjectCount, 2);
    assert.equal(binding.rawSubjectIdsIncluded, false);
    assert.ok(!canonicalJson(binding).includes(FIRST));
    assert.ok(!canonicalJson(binding).includes("legacy-photo.png"));
  });

  it("rejects absent, extra, and wrong envelope fields", () => {
    for (
      const value of [
        undefined,
        null,
        [],
        {},
        { ...scope(), approvedBy: "owner" },
        { ...scope(), kind: "other" },
        { ...scope(), version: "1" },
      ]
    ) {
      assert.throws(() => validateSubjectScope(value));
    }
    for (const field of Object.keys(scope())) {
      const incomplete = scope();
      delete incomplete[field];
      assert.throws(() => validateSubjectScope(incomplete));
    }
  });

  it("requires a canonical source, distinct valid target, and exact requested target", () => {
    for (
      const patch of [{ sourceProjectRef: TARGET }, {
        targetProjectRef: SOURCE,
      }, { targetProjectRef: "bad" }]
    ) {
      assert.throws(
        () => validateSubjectScope({ ...scope(), ...patch }),
        /project mismatch/u,
      );
    }
    assert.throws(
      () =>
        validateSubjectScope(scope(), {
          targetProjectRef: "bcdefghijklmnopqrstuv",
        }),
      /project mismatch/u,
    );
  });

  it("requires a nonempty bounded set of explicit canonical UUID strings", () => {
    for (
      const ids of [
        [],
        [FIRST, FIRST],
        ["ALL"],
        ["00000000-0000-0000-0000-000000000000"],
        [[FIRST]],
        [1],
        Array(5001).fill(FIRST),
        ["ABCDEFAB-0000-4000-8000-000000000001"],
      ]
    ) {
      assert.throws(
        () => validateSubjectScope({ ...scope(), subjectIds: ids }),
        /canonical UUIDs/u,
      );
    }
  });

  it("legacy assignments require exact fields, valid bucket/hash/owner and unique bucket-path identity", () => {
    const input = scope();
    const good = input.legacyStorageAssignments[0];
    for (
      const assignment of [
        { ...good, rawPath: "private" },
        { ...good, bucket: "commerce" },
        { ...good, pathSha256: "bad" },
        { ...good, ownerSubjectId: "bad" },
      ]
    ) {
      assert.throws(() =>
        validateSubjectScope({
          ...input,
          legacyStorageAssignments: [assignment],
        })
      );
    }
    assert.throws(
      () =>
        validateSubjectScope({
          ...input,
          legacyStorageAssignments: [good, good],
        }),
      /Duplicate/u,
    );
    assert.throws(
      () =>
        validateSubjectScope({
          ...input,
          legacyStorageAssignments: [good, {
            ...good,
            ownerSubjectId: OUTSIDE,
          }],
        }),
      /conflicting/u,
    );
    assert.doesNotThrow(() =>
      validateSubjectScope({
        ...input,
        legacyStorageAssignments: [good, { ...good, bucket: "photos" }],
      })
    );
  });

  it("requires hash fields to be strings rather than regex-coercible arrays", () => {
    const input = scope();
    const good = input.legacyStorageAssignments[0];
    assert.throws(() =>
      validateSubjectScope({
        ...input,
        legacyStorageAssignments: [{ ...good, pathSha256: [good.pathSha256] }],
      })
    );
    const binding = subjectScopeBinding(input);
    for (
      const field of [
        "scopeSha256",
        "subjectIdsSha256",
        "legacyAssignmentsSha256",
      ]
    ) {
      assert.throws(() =>
        validateSubjectScopeBinding({ ...binding, [field]: [binding[field]] })
      );
    }
  });

  it("bindings reject unknown/raw-ID fields, unapproved sources, malformed counts and substituted hashes", () => {
    const binding = subjectScopeBinding(scope());
    assert.equal(validateSubjectScopeBinding(binding), binding);
    for (
      const patch of [
        { subjectIds: [FIRST] },
        { rawSubjectIdsIncluded: true },
        { subjectCount: 0 },
        { subjectCount: 2.5 },
        { subjectCount: 5001 },
        { scopeSha256: "0" },
        { sourceProjectRef: TARGET },
        { targetProjectRef: SOURCE },
      ]
    ) {
      assert.throws(() =>
        validateSubjectScopeBinding({ ...binding, ...patch })
      );
    }
    assert.throws(
      () =>
        assertScopeBinding(
          { ...binding, scopeSha256: sha256("different") },
          binding,
        ),
      /approved scope/u,
    );
    assert.equal(assertScopeBinding(binding, binding), binding);
  });

  it("renders only validated identifiers and the exact UUID set in source SQL", () => {
    const sql = scopeSqlPredicate(scope(), "r.user_id");
    assert.equal(
      sql,
      `"r"."user_id" = ANY(ARRAY['${FIRST}','${SECOND}']::uuid[])`,
    );
    assert.ok(!sql.includes("auth.users"));
    for (
      const column of [
        "r.user_id; DROP TABLE profiles",
        "a..b",
        "r.*",
        "a.b.c.d",
        "user_id--",
        "",
        undefined,
      ]
    ) {
      assert.throws(() => scopeSqlPredicate(scope(), column));
    }
  });

  it("target SQL contains hashes/counts but no raw subject IDs and checks orphan identities", () => {
    const binding = subjectScopeBinding(scope());
    const sql = targetSubjectAssertionSql(binding);
    assert.match(sql, /count\(\*\) FROM auth\.users\) <> 2/u);
    assert.ok(sql.includes(binding.subjectIdsSha256));
    assert.match(
      sql,
      /NOT EXISTS \(SELECT 1 FROM auth\.users u WHERE u\.id=i\.user_id\)/u,
    );
    assert.ok(!sql.includes(FIRST));
    assert.ok(!sql.includes(SECOND));
    assert.throws(() =>
      targetSubjectAssertionSql({
        ...binding,
        subjectCount: "2;DROP TABLE auth.users",
      })
    );
  });

  it("loads only private regular scope JSON and keeps parse diagnostics content-free", () => {
    const directory = temporary();
    const path = join(directory, "scope.json");
    writeFileSync(path, JSON.stringify(scope()), { mode: 0o600 });
    assert.deepEqual(loadSubjectScope(path), validateSubjectScope(scope()));
    chmodSync(path, 0o644);
    assert.throws(() => loadSubjectScope(path), /private regular file/u);
    chmodSync(path, 0o600);
    const link = join(directory, "scope-link.json");
    symlinkSync(path, link);
    assert.throws(() => loadSubjectScope(link), /private regular file/u);
    writeFileSync(path, `bad secret ${FIRST}`);
    assert.throws(() => loadSubjectScope(path), (error) => {
      assert.equal(error.message, "Subject scope is not valid JSON");
      return true;
    });
  });
});

describe("storage classification has no implicit ownership", () => {
  it("selects matching UUID folders and excludes unrelated folders", () => {
    assert.deepEqual(
      classifyStorageObject(scope(), {
        bucket: "photos",
        path: `${FIRST}/a.png`,
        ownerId: FIRST,
      }),
      { selected: true, targetPath: `${FIRST}/a.png` },
    );
    assert.deepEqual(
      classifyStorageObject(scope(), {
        bucket: "photos",
        path: `${OUTSIDE}/a.png`,
      }),
      { selected: false, targetPath: null },
    );
  });

  it("maps only explicit legacy assignments; an outside assignment explicitly excludes", () => {
    assert.deepEqual(
      classifyStorageObject(scope(), {
        bucket: "photos",
        path: "legacy-photo.png",
      }),
      { selected: true, targetPath: `${FIRST}/legacy-photo.png` },
    );
    assert.deepEqual(
      classifyStorageObject(scope(), {
        bucket: "photos",
        path: "legacy-outside.png",
      }),
      { selected: false, targetPath: null },
    );
    assert.deepEqual(
      classifyStorageObject(scope(), {
        bucket: "photos",
        path: "other-outside.png",
        ownerId: OUTSIDE,
      }),
      { selected: false, targetPath: null },
    );
  });

  it("rejects ambiguous selected-owner legacy paths and any ownership contradiction", () => {
    for (
      const input of [
        { bucket: "photos", path: "unknown.png" },
        { bucket: "photos", path: "unknown.png", ownerId: FIRST },
        { bucket: "photos", path: `${FIRST}/a.png`, ownerId: OUTSIDE },
        { bucket: "photos", path: "legacy-photo.png", ownerId: OUTSIDE },
        { bucket: "photos", path: `${FIRST}/a.png`, ownerId: {} },
      ]
    ) assert.throws(() => classifyStorageObject(scope(), input));
    const path = `${OUTSIDE}/a.png`;
    const input = {
      ...scope(),
      legacyStorageAssignments: [{
        bucket: "photos",
        pathSha256: sha256(path),
        ownerSubjectId: FIRST,
      }],
    };
    assert.throws(
      () => classifyStorageObject(input, { bucket: "photos", path }),
      /cannot override/u,
    );
  });

  it("rejects path traversal, empty segments, control characters and unapproved buckets", () => {
    for (
      const path of ["", "/a", "a//b", "a/../b", "a/./b", "a\0b", "a\nb", "a/"]
    ) {
      assert.throws(() =>
        classifyStorageObject(scope(), { bucket: "photos", path })
      );
    }
    assert.throws(() =>
      classifyStorageObject(scope(), { bucket: "commerce", path: `${FIRST}/a` })
    );
  });
});

describe("immutable private import package snapshots", () => {
  it("binds parsed JSON and SHA to the same bytes and keeps a detached snapshot", () => {
    const directory = temporary();
    const path = join(directory, "input.json");
    const original = Buffer.from(JSON.stringify({ synthetic: "old" }));
    writeFileSync(path, original, { mode: 0o600 });
    const snapshot = privateSnapshot(path, "unit input", { json: true });
    writeFileSync(path, JSON.stringify({ synthetic: "new" }));
    assert.deepEqual(snapshot.bytes, original);
    assert.equal(snapshot.sha256, sha256(original));
    assert.deepEqual(snapshot.value, { synthetic: "old" });
  });

  it("rejects symlinks, directories, group-readable inputs, missing paths and oversized JSON", () => {
    const directory = temporary();
    const path = join(directory, "input.json");
    writeFileSync(path, "{}", { mode: 0o600 });
    const link = join(directory, "symlink.json");
    symlinkSync(path, link);
    for (const invalid of [link, directory, join(directory, "absent")]) {
      assert.throws(
        () => privateSnapshot(invalid, "unit input", { json: true }),
        /private regular JSON file/u,
      );
    }
    chmodSync(path, 0o640);
    assert.throws(
      () => privateSnapshot(path, "unit input"),
      /private regular file/u,
    );
    chmodSync(path, 0o600);
    writeFileSync(path, Buffer.alloc(4 * 1024 * 1024 + 1, " "));
    assert.throws(
      () => privateSnapshot(path, "unit input", { json: true }),
      /private regular JSON file/u,
    );
  });

  it("does not echo malformed private JSON or filesystem error details", () => {
    const directory = temporary();
    const path = join(directory, "secret-input.json");
    writeFileSync(path, `invalid private ${FIRST}`, { mode: 0o600 });
    assert.throws(
      () => privateSnapshot(path, "receipt", { json: true }),
      (error) => {
        assert.equal(
          error.message,
          "receipt must be a readable private regular JSON file",
        );
        return true;
      },
    );
  });

  it("requires package, source and Auth decision to bind the same scope and exact scope-file bytes", () => {
    const input = importInputs();
    assert.deepEqual(
      validateImportScope(input),
      subjectScopeBinding(input.scope),
    );
    for (const key of ["manifest", "source", "decision"]) {
      const changed = structuredClone(input);
      changed[key].subjectScope = subjectScopeBinding({
        ...input.scope,
        subjectIds: [OUTSIDE],
      });
      assert.throws(() => validateImportScope(changed), /approved scope/u);
    }
    for (
      const file of [
        undefined,
        { relativePath: "../scope.json", sha256: input.scopeFileSha256 },
        { relativePath: "subject-scope.json", sha256: sha256("different") },
        {
          relativePath: "subject-scope.json",
          sha256: input.scopeFileSha256,
          extra: true,
        },
      ]
    ) {
      assert.throws(
        () =>
          validateImportScope({
            ...input,
            manifest: { ...input.manifest, subjectScopeFile: file },
          }),
        /does not match/u,
      );
    }
    for (
      const auth of [{
        userCount: 1,
        subjectIdsSha256: input.source.auth.subjectIdsSha256,
      }, { userCount: 2, subjectIdsSha256: sha256("different") }]
    ) {
      assert.throws(
        () =>
          validateImportScope({ ...input, source: { ...input.source, auth } }),
        /Auth inventory/u,
      );
    }
  });

  it("copies validated binary bytes to private staging files without reopening later", () => {
    const directory = temporary();
    const packageDir = join(directory, "package");
    const stagingDir = join(directory, "staged");
    mkdirSync(join(packageDir, "data"), { recursive: true, mode: 0o700 });
    mkdirSync(stagingDir, { mode: 0o700 });
    const bytes = Buffer.from("synthetic binary sentinel\0");
    const relativePath = "data/auth.users.bin";
    writeFileSync(join(packageDir, relativePath), bytes, { mode: 0o600 });
    const manifest = {
      files: [{
        logicalName: "auth.users",
        relativePath,
        bytes: bytes.length,
        fileSha256: sha256(bytes),
      }],
    };
    snapshotPackageBinaryFiles(manifest, packageDir, stagingDir);
    writeFileSync(join(packageDir, relativePath), "changed after snapshot");
    assert.deepEqual(readFileSync(join(stagingDir, relativePath)), bytes);
    assert.equal(statSync(join(stagingDir, relativePath)).mode & 0o077, 0);
    assert.throws(
      () => snapshotPackageBinaryFiles(manifest, packageDir, stagingDir),
      /changed or does not match/u,
    );
  });

  it("rejects invalid or duplicate binary paths before opening their content", () => {
    const directory = temporary();
    const file = {
      logicalName: "auth.users",
      relativePath: "data/auth.users.bin",
      bytes: 0,
      fileSha256: sha256(""),
    };
    for (
      const patch of [
        { relativePath: "../secret" },
        { relativePath: "/secret" },
        { logicalName: "auth.users;DROP" },
        { logicalName: "private.secrets" },
      ]
    ) {
      assert.throws(
        () =>
          snapshotPackageBinaryFiles(
            { files: [{ ...file, ...patch }] },
            directory,
            directory,
          ),
        /Unexpected or duplicate binary package path/u,
      );
    }
    mkdirSync(join(directory, "data"), { mode: 0o700 });
    writeFileSync(join(directory, file.relativePath), "", { mode: 0o600 });
    const staging = join(directory, "staging");
    mkdirSync(staging, { mode: 0o700 });
    assert.throws(
      () =>
        snapshotPackageBinaryFiles({ files: [file, file] }, directory, staging),
      /duplicate binary package path/u,
    );
  });
});

describe("transactional import SQL guards", () => {
  function source() {
    const subjectScope = subjectScopeBinding(scope());
    return {
      subjectScope,
      auth: {
        userCount: 2,
        subjectIdsSha256: subjectScope.subjectIdsSha256,
        usersSha256: sha256("synthetic-users"),
        identityCount: 2,
        identitiesSha256: sha256("synthetic-identities"),
      },
      publicData: publicScopes.map(([relation]) => ({
        relation,
        copyRowCount: 0,
        copyRowsSha256: sha256(""),
      })),
    };
  }

  it("locks exactly Auth plus the physical allowlist before checking every table empty", () => {
    const guards = importTransactionGuards(source());
    assert.match(
      guards.beforeCopy,
      /SET LOCAL lock_timeout = '10s';\nLOCK TABLE/u,
    );
    assert.ok(
      guards.beforeCopy.indexOf("IN ACCESS EXCLUSIVE MODE") <
        guards.beforeCopy.indexOf("DO $import_empty$"),
    );
    assert.equal(
      (guards.beforeCopy.match(/EXISTS \(SELECT 1 FROM/gu) ?? []).length,
      publicScopes.length + 2,
    );
    for (const [relation] of publicScopes) {
      assert.ok(guards.beforeCopy.includes(`"public"."${relation}"`));
      assert.ok(guards.afterCopy.includes(`"public"."${relation}"`));
    }
    assert.ok(!guards.beforeCopy.includes("commerce"));
    assert.ok(!guards.beforeCopy.includes("TRUNCATE"));
    assert.ok(!guards.beforeCopy.includes("DELETE"));
  });

  it("checks every imported table count and canonical full-row SHA before commit", () => {
    const guards = importTransactionGuards(source());
    assert.equal(
      (guards.afterCopy.match(/Target transactional copy parity failed/gu) ??
        []).length,
      publicScopes.length + 2,
    );
    assert.equal(
      (guards.afterCopy.match(/to_jsonb\(r\)::text/gu) ?? []).length,
      (publicScopes.length + 2) * 2,
    );
    assert.match(guards.afterCopy, /USING ERRCODE='55000'/u);
    assert.ok(
      !guards.afterCopy.includes("COMMIT"),
      "caller must place guards before its commit",
    );
    assert.ok(
      guards.afterCopy.indexOf("DO $subject_scope$") >
        guards.afterCopy.indexOf("END $import_parity$;"),
    );
    assert.ok(
      guards.afterCopy.includes(source().subjectScope.subjectIdsSha256),
    );
    assert.match(
      guards.afterCopy,
      /Target Auth does not match approved subject scope/u,
    );
    assert.ok(!guards.afterCopy.includes(FIRST));
    assert.ok(!guards.afterCopy.includes(SECOND));
  });

  it("rejects incomplete, noninteger, negative and non-string row parity evidence", () => {
    const mutations = [
      (value) => {
        value.publicData.pop();
      },
      (value) => {
        value.auth.userCount = -1;
      },
      (value) => {
        value.auth.identityCount = 1.5;
      },
      (value) => {
        value.auth.usersSha256 = [sha256("coercible")];
      },
      (value) => {
        value.publicData[0].copyRowsSha256 = "invalid";
      },
      (value) => {
        value.publicData[0].copyRowCount = "0";
      },
    ];
    for (const mutate of mutations) {
      const value = source();
      mutate(value);
      assert.throws(() => importTransactionGuards(value), /parity inventory/u);
    }
  });

  it("rejects duplicate or out-of-allowlist public inventories even when counts and hashes match", () => {
    for (
      const mutate of [
        (value) => {
          value.publicData.push({ ...value.publicData[0] });
        },
        (value) => {
          value.publicData.push({
            relation: "unrelated_commerce",
            copyRowCount: 0,
            copyRowsSha256: sha256(""),
          });
        },
        (value) => {
          value.publicData[0].relation = "other_table";
        },
        (value) => {
          value.publicData = {};
        },
      ]
    ) {
      const value = source();
      mutate(value);
      assert.throws(() => importTransactionGuards(value));
    }
  });
});

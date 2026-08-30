import assert from "node:assert/strict";
import { expectedMigrationGuardContract } from "../lib/migration-guard-catalog.mjs";
import { describe, it } from "node:test";
import { validateRollbackScope } from "../lib/rollback-subject-scope.mjs";
import { subjectScopeBinding } from "../lib/migration-subject-scope.mjs";
import { validateFreshSourceReceipt } from "../prepare-isolated-supabase-rollback-receipt.mjs";
import {
  DEFERRED_RELATIONS,
  validateDeferredSourceParity,
  validateReceiptChain,
} from "../generate-sync-deferred-boundary-receipt.mjs";
import { sha256 } from "../lib/supabase-isolation.mjs";

const targetRef = "abcdefghijklmnopqrst";
const sourceRef = "ekekeywoxvdbfbmqyhjy";
const scope = {
  version: 1,
  kind: "mind_manual_subject_scope",
  sourceProjectRef: sourceRef,
  targetProjectRef: targetRef,
  subjectIds: ["11111111-1111-4111-8111-111111111111"],
  legacyStorageAssignments: [],
};
const binding = subjectScopeBinding(scope);
const alternate = subjectScopeBinding({
  ...scope,
  subjectIds: ["22222222-2222-4222-8222-222222222222"],
});
const scopeFileSha256 = sha256(JSON.stringify(scope));
const receiptNames = [
  "sourceRevalidation",
  "sourceFreeze",
  "imported",
  "storage",
  "storageRevalidation",
  "oauthReset",
  "quarantine",
];

function fixture() {
  const source = {
    version: 1,
    kind: "source",
    projectRef: sourceRef,
    status: "ready",
    blockers: [],
    capturedAt: new Date().toISOString(),
    subjectScope: binding,
    manifests: { hash: "a".repeat(64) },
    catalog: { exact: "b".repeat(64), migrationGuard: expectedMigrationGuardContract() },
    auth: {
      userCount: 1,
      subjectIdsSha256: binding.subjectIdsSha256,
      usersSha256: sha256("selected users"),
      identitiesSha256: sha256("selected identities"),
      sessionCountExcluded: 2,
      refreshTokenCountExcluded: 3,
    },
    publicData: DEFERRED_RELATIONS.map((relation) => ({
      relation,
      copyMode: "copy",
      copyRowCount: 2,
      copyRowsSha256: sha256(relation),
    })),
    storage: {
      objects: {
        objectCount: 1,
        pathsManifestSha256: sha256("selected object"),
      },
    },
    excludedDataInventory: {
      authUsers: 12,
      publicData: [4, 8],
      storageObjects: 4,
    },
  };
  return {
    scope,
    scopeFileSha256,
    targetRef,
    source,
    manifest: {
      subjectScope: binding,
      subjectScopeFile: {
        relativePath: "subject-scope.json",
        sha256: scopeFileSha256,
      },
    },
    decision: { subjectScope: binding },
    receipts: Object.fromEntries(
      receiptNames.map((name) => [
        name,
        name === "sourceRevalidation"
          ? structuredClone(source)
          : { subjectScope: binding, ...(name === "imported" ? { migrationGuard: expectedMigrationGuardContract() } : {}) },
      ]),
    ),
  };
}

describe("subject scope through rollback and deferred-sync evidence", () => {
  it("accepts one exact scope across all mandatory receipt boundaries", () => {
    assert.deepEqual(validateRollbackScope(fixture()), binding);
  });
  it("rejects missing or stale guard bindings in source, import and fresh source", () => {
    for (const key of ["source", "imported", "sourceRevalidation"]) {
      for (const guard of [undefined, { version: 1 }]) {
        const input = fixture();
        if (key === "source") input.source.catalog.migrationGuard = guard;
        else if (key === "imported") input.receipts.imported.migrationGuard = guard;
        else input.receipts.sourceRevalidation.catalog.migrationGuard = guard;
        assert.throws(() => validateRollbackScope(input), /guard catalog/u);
      }
    }
  });
  for (const name of receiptNames) {
    it(`rejects missing or swapped ${name} scope even when project and counts agree`, () => {
      const input = fixture();
      delete input.receipts[name].subjectScope;
      assert.throws(() => validateRollbackScope(input), /scope/);
      input.receipts[name].subjectScope = alternate;
      assert.throws(() => validateRollbackScope(input), /scope/);
    });
  }
  it("rejects changed private package scope and source Auth membership", () => {
    const input = fixture();
    assert.throws(
      () =>
        validateRollbackScope({
          ...input,
          scopeFileSha256: sha256("other bytes"),
        }),
      /scope file/,
    );
    input.receipts.sourceRevalidation.auth.subjectIdsSha256 =
      alternate.subjectIdsSha256;
    assert.throws(() => validateRollbackScope(input), /Fresh source Auth/);
  });
  it("allows unrelated source churn while retaining exact selected rows and catalog", () => {
    const { source, receipts } = fixture();
    const fresh = receipts.sourceRevalidation;
    fresh.excludedDataInventory = {
      authUsers: 200,
      publicData: [8, 16],
      storageObjects: 0,
    };
    fresh.auth.sessionCountExcluded = 10;
    fresh.auth.refreshTokenCountExcluded = 15;
    assert.doesNotThrow(() => validateFreshSourceReceipt(source, fresh));
    for (const section of ["catalog", "manifests", "publicData", "storage"]) {
      assert.throws(
        () =>
          validateFreshSourceReceipt(source, {
            ...fresh,
            [section]: section === "catalog" ? { ...fresh.catalog, changed: true } : { changed: true },
          }),
        /drifted/,
      );
    }
    assert.throws(
      () =>
        validateFreshSourceReceipt(source, {
          ...fresh,
          capturedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
        }),
      /stale/,
    );
  });
  it("rejects equal before/after sync rows that differ from the selected source", () => {
    const { source } = fixture();
    const rows = source.publicData.map((row) => ({
      relation: row.relation,
      rowCount: row.copyRowCount,
      rowsSha256: row.copyRowsSha256,
    }));
    assert.doesNotThrow(() => validateDeferredSourceParity({ rows }, source));
    const wrong = structuredClone(rows);
    wrong[0].rowsSha256 = sha256("unrelated user with same count");
    assert.throws(
      () => validateDeferredSourceParity({ rows: wrong }, source),
      /selected source/,
    );
    assert.throws(
      () => validateDeferredSourceParity({ rows: [...rows, rows[0]] }, source),
      /inventory/,
    );
    assert.throws(
      () =>
        validateDeferredSourceParity({ rows }, { ...source, publicData: [] }),
      /selected source/,
    );
    assert.throws(
      () =>
        validateDeferredSourceParity({ rows }, {
          ...source,
          subjectScope: undefined,
        }),
      /scope/,
    );
  });
  it("requires scoped producer receipts before any sync probe", () => {
    const { source } = fixture();
    const wrapped = (value, digit) => ({ value, sha256: digit.repeat(64) });
    const envelope = {
      version: 1,
      sourceProjectRef: sourceRef,
      targetProjectRef: targetRef,
      subjectScope: binding,
      sourceMutated: false,
      secretValuesIncluded: false,
      rowIdsIncluded: false,
      sourceReceiptSha256: "1".repeat(64),
      importReceiptSha256: "2".repeat(64),
    };
    const inputs = {
      source: wrapped(source, "1"),
      imported: wrapped({
        ...envelope,
        migrationGuard: expectedMigrationGuardContract(),
        status: "verified_pending_storage_and_provider_rebind",
      }, "2"),
      storage: wrapped({
        ...envelope,
        status: "verified",
        sourceSecretValueIncluded: false,
        targetSecretValueIncluded: false,
        rawObjectPathsIncluded: false,
      }, "3"),
      oauthReset: wrapped({
        ...envelope,
        status: "oauth_credentials_reset_pending_google_reauthorization",
      }, "4"),
      quarantine: wrapped({
        ...envelope,
        status: "provider_state_quarantined_pending_rebind",
        oauthResetReceiptSha256: "4".repeat(64),
      }, "5"),
    };
    assert.doesNotThrow(() => validateReceiptChain(inputs, targetRef));
    for (const key of ["source", "imported"]) {
      const changed = structuredClone(inputs);
      if (key === "source") delete changed.source.value.catalog.migrationGuard;
      else delete changed.imported.value.migrationGuard;
      assert.throws(() => validateReceiptChain(changed, targetRef), /guard catalog/u);
    }
    assert.throws(
      () =>
        validateReceiptChain({
          ...inputs,
          source: {
            ...inputs.source,
            value: { ...source, blockers: ["unresolved scope"] },
          },
        }, targetRef),
      /receipt chain/,
    );
    for (const key of Object.keys(inputs)) {
      const changed = structuredClone(inputs);
      changed[key].value.subjectScope = alternate;
      assert.throws(() => validateReceiptChain(changed, targetRef), /scope/);
    }
  });
});

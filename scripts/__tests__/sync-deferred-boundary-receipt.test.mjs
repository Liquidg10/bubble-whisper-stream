import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  buildBoundaryReceipt,
  buildServiceTestReceipt,
  credentialSafeError,
  DEFERRED_RELATIONS,
  EXPECTED_DEFERRED_TEST_ASSERTIONS,
  expectedHttpProbeContract,
  runHttpNegativeProbe,
  validateHttpProbeReceipts,
  validateTargetSnapshot,
} from "../generate-sync-deferred-boundary-receipt.mjs";
import {
  validateSyncDeferredEvidence,
} from "../prepare-isolated-supabase-rollback-receipt.mjs";
import { sha256 } from "../lib/supabase-isolation.mjs";
import { subjectScopeBinding } from "../lib/migration-subject-scope.mjs";

const TARGET_REF = "abcdefghijklmnopqrst";
const SUBJECT_SCOPE = subjectScopeBinding({
  version: 1,
  kind: "mind_manual_subject_scope",
  sourceProjectRef: "ekekeywoxvdbfbmqyhjy",
  targetProjectRef: TARGET_REF,
  subjectIds: ["11111111-1111-4111-8111-111111111111"],
  legacyStorageAssignments: [],
});
const CHAIN = Object.freeze({
  sourceReceiptSha256: "1".repeat(64),
  importReceiptSha256: "2".repeat(64),
  storageReceiptSha256: "3".repeat(64),
  oauthResetReceiptSha256: "4".repeat(64),
  quarantineReceiptSha256: "5".repeat(64),
});
const PRIVILEGES = [
  "select",
  "insert",
  "update",
  "delete",
  "truncate",
  "references",
  "trigger",
];

function targetSnapshot() {
  const denied = Object.fromEntries(
    PRIVILEGES.map((privilege) => [privilege, false]),
  );
  return {
    catalog: DEFERRED_RELATIONS.map((relation) => ({
      relation,
      relationKind: "r",
      rowSecurityEnabled: true,
      policyCount: 0,
      realtimePublicationMember: false,
      privileges: {
        anon: { ...denied },
        authenticated: { ...denied },
      },
    })),
    rows: DEFERRED_RELATIONS.map((relation) => ({
      relation,
      rowCount: 2,
      rowsSha256: sha256(`offline-${relation}`),
    })),
  };
}

function httpProbeReceipts() {
  return expectedHttpProbeContract().map((probe) => ({
    relation: probe.relation,
    role: probe.role,
    method: probe.method,
    path: probe.path,
    expectedStatus: probe.expectedStatus,
    observedStatus: probe.expectedStatus,
    postgresCode: probe.expectedPostgrestCode,
    requestBodySha256: probe.requestBodySha256,
    responseBodySha256: sha256(
      `${probe.role}:${probe.method}:${probe.relation}:42501`,
    ),
  }));
}

function vitestJsonReport() {
  const assertions = EXPECTED_DEFERRED_TEST_ASSERTIONS.map((fullName) => ({
    fullName,
    status: "passed",
  }));
  return JSON.stringify({
    success: true,
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numFailedTestSuites: 0,
    numTotalTests: assertions.length,
    numPassedTests: assertions.length,
    numFailedTests: 0,
    numPendingTests: 0,
    testResults: [{
      name:
        "/offline/src/services/__tests__/crossDeviceSyncService.deferred.test.ts",
      assertionResults: assertions,
    }],
  });
}

const temporaryDirectories = [];
afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("sync deferred-boundary receipt", () => {
  it("accepts an exact generated target, HTTP, and service-test evidence chain", () => {
    const capturedAt = new Date().toISOString();
    const directory = mkdtempSync(join(tmpdir(), "mind-manual-sync-receipt-"));
    temporaryDirectories.push(directory);
    const serviceTestReceiptPath = join(directory, "service-test.json");
    const serviceTest = buildServiceTestReceipt({
      rawReport: vitestJsonReport(),
      capturedAt,
      targetRef: TARGET_REF,
      chain: CHAIN,
    });
    const serviceBytes = `${JSON.stringify(serviceTest, null, 2)}\n`;
    writeFileSync(serviceTestReceiptPath, serviceBytes, { mode: 0o600 });
    chmodSync(serviceTestReceiptPath, 0o600);

    const snapshot = targetSnapshot();
    const receipt = buildBoundaryReceipt({
      capturedAt,
      targetRef: TARGET_REF,
      chain: CHAIN,
      before: snapshot,
      after: structuredClone(snapshot),
      httpProbes: httpProbeReceipts(),
      serviceTestReceiptPath,
      serviceTestReceiptSha256: sha256(serviceBytes),
    });

    assert.doesNotThrow(() =>
      validateSyncDeferredEvidence(
        receipt,
        TARGET_REF,
        CHAIN.sourceReceiptSha256,
        CHAIN.importReceiptSha256,
        CHAIN.storageReceiptSha256,
        CHAIN.oauthResetReceiptSha256,
        CHAIN.quarantineReceiptSha256,
        {
          subjectScope: SUBJECT_SCOPE,
          publicData: snapshot.rows.map((row) => ({
            relation: row.relation,
            copyMode: "copy",
            copyRowCount: row.rowCount,
            copyRowsSha256: row.rowsSha256,
          })),
        },
      )
    );
  });

  it("rejects a successful HTTP write or before/after row drift", () => {
    const probes = httpProbeReceipts();
    assert.throws(() =>
      validateHttpProbeReceipts([
        ...probes.slice(0, 1),
        { ...probes[1], observedStatus: 201 },
        ...probes.slice(2),
      ]), /not exact/u);
    assert.throws(
      () => validateHttpProbeReceipts([...probes].reverse()),
      /not exact/u,
    );

    const before = targetSnapshot();
    const after = structuredClone(before);
    after.rows[0].rowCount += 1;
    assert.doesNotThrow(() => validateTargetSnapshot(after));
    assert.throws(() =>
      buildBoundaryReceipt({
        capturedAt: new Date().toISOString(),
        targetRef: TARGET_REF,
        chain: CHAIN,
        before,
        after,
        httpProbes: probes,
        serviceTestReceiptPath: "/private/tmp/service-test.json",
        serviceTestReceiptSha256: "a".repeat(64),
      }), /rows changed/u);
  });

  it("redacts credentials from fetch, database, and test error envelopes", async () => {
    const secrets = [
      "database-password-value",
      "public-api-key-value",
      "authenticated-access-token-value",
    ];
    const sanitized = credentialSafeError(
      new Error(`psql ${secrets[0]} test ${secrets[1]} ${secrets[2]}`),
      secrets,
      "offline failure",
    );
    for (const secret of secrets) {
      assert.doesNotMatch(sanitized.message, new RegExp(secret, "u"));
    }
    await assert.rejects(
      () =>
        runHttpNegativeProbe({
          fetchImpl: async () => {
            throw new Error(`transport ${secrets[1]} ${secrets[2]}`);
          },
          targetOrigin: "https://abcdefghijklmnopqrst.supabase.co",
          publicApiKey: secrets[1],
          authAccessToken: secrets[2],
          relation: "sync_data",
          role: "authenticated",
          method: "POST",
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, new RegExp(secrets[1], "u"));
        assert.doesNotMatch(error.message, new RegExp(secrets[2], "u"));
        return true;
      },
    );
  });
});

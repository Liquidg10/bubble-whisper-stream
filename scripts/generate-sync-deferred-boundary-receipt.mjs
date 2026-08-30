#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  canonicalJson,
  consumeTargetDatabasePassword,
  getTargetAdminDatabaseConfig,
  parseArgs,
  quoteIdentifier,
  quoteLiteral,
  repoRoot,
  runCommand,
  runPsqlJson,
  sha256,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";
import {
  assertScopeBinding,
  validateSubjectScopeBinding,
} from "./lib/migration-subject-scope.mjs";
import { privateSnapshot } from "./lib/import-subject-package.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const PUBLIC_API_KEY_ENV = "MIND_MANUAL_TARGET_PUBLIC_API_KEY";
const AUTH_ACCESS_TOKEN_ENV = "MIND_MANUAL_TARGET_AUTH_ACCESS_TOKEN";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PRIVILEGES = Object.freeze([
  "select",
  "insert",
  "update",
  "delete",
  "truncate",
  "references",
  "trigger",
]);
export const DEFERRED_RELATIONS = Object.freeze([
  "sync_conflicts",
  "sync_data",
  "sync_devices",
]);
export const BROWSER_ROLES = Object.freeze(["anon", "authenticated"]);
export const HTTP_METHODS = Object.freeze(["GET", "POST"]);
const EXPECTED_HTTP_STATUS = Object.freeze({
  anon: 401,
  authenticated: 403,
});
const EXPECTED_POSTGREST_CODE = "42501";
const TEST_FILE_RELATIVE_PATH =
  "src/services/__tests__/crossDeviceSyncService.deferred.test.ts";
const TEST_FILE_PATH = resolve(repoRoot, TEST_FILE_RELATIVE_PATH);
const SYNC_SERVICE_PATH = resolve(
  repoRoot,
  "src/services/crossDeviceSyncService.ts",
);
const SYNC_DEFERRAL_MIGRATION_PATH = resolve(
  repoRoot,
  "supabase/migrations/20260829050000_defer_cross_device_sync.sql",
);
const DATA_SCOPES_PATH = resolve(
  repoRoot,
  "supabase/isolation/mind-manual-data-scopes.tsv",
);
const GENERATOR_PATH = resolve(
  repoRoot,
  "scripts/generate-sync-deferred-boundary-receipt.mjs",
);
const EXPECTED_DEFERRED_TEST_COUNT = 6;
export const EXPECTED_DEFERRED_TEST_ASSERTIONS = Object.freeze([
  "cross-device sync deferred boundary keeps every release capability and both feature flags disabled",
  "cross-device sync deferred boundary names the complete minimum proof required before activation",
  "cross-device sync deferred boundary initializes as a side-effect-free capability probe",
  "cross-device sync deferred boundary reports disabled state without inventing devices, queues, conflicts, or receipts",
  "cross-device sync deferred boundary fails closed instead of accepting an unreceipted local outbox write",
  "cross-device sync deferred boundary does not pretend device revocation works without key rotation",
]);
const VITEST_ARGUMENTS = Object.freeze([
  "run",
  TEST_FILE_RELATIVE_PATH,
  "--pool=forks",
  "--maxWorkers=1",
  "--no-file-parallelism",
  "--reporter=json",
]);

export function deferredServiceTestCommandSha256() {
  return sha256(canonicalJson(["vitest", ...VITEST_ARGUMENTS]));
}

export function expectedDeferredAssertionsSha256() {
  const assertions = EXPECTED_DEFERRED_TEST_ASSERTIONS
    .map((fullName) => ({ fullName, status: "passed" }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  return sha256(canonicalJson(assertions));
}

function usage() {
  console.log(
    "usage: MIND_MANUAL_TARGET_DB_PASSWORD=... " +
      `${PUBLIC_API_KEY_ENV}=... ${AUTH_ACCESS_TOKEN_ENV}=... ` +
      "node scripts/generate-sync-deferred-boundary-receipt.mjs " +
      "--source-receipt /absolute/source.json " +
      "--import-receipt /absolute/import.json " +
      "--storage-receipt /absolute/storage.json " +
      "--oauth-reset-receipt /absolute/oauth-reset.json " +
      "--quarantine-receipt /absolute/quarantine.json " +
      "--target-ref <ref> " +
      "--service-test-receipt /absolute/service-test.json " +
      "--receipt /absolute/sync-boundary.json",
  );
}

function hasExactKeys(value, keys) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) ===
      canonicalJson([...keys].sort());
}

export function credentialSafeError(error, secretValues, label) {
  let message = error instanceof Error ? error.message : String(error);
  for (
    const secret of secretValues.filter((value) =>
      typeof value === "string" && value.length > 0
    )
  ) {
    message = message.replaceAll(secret, "[redacted]");
  }
  return new Error(`${label}: ${message}`);
}

function readPrivateReceipt(path, label) {
  const { value, sha256: hash } = privateSnapshot(path, label, { json: true });
  return { value, sha256: hash };
}

export function validateReceiptChain(receipts, targetRef) {
  const { source, imported, storage, oauthReset, quarantine } = receipts;
  const binding = validateSubjectScopeBinding(source.value?.subjectScope);
  if (
    binding.targetProjectRef !== targetRef ||
    source.value.auth?.userCount !== binding.subjectCount ||
    source.value.auth?.subjectIdsSha256 !== binding.subjectIdsSha256
  ) {
    throw new Error(
      "Sync source Auth inventory is outside the approved subject scope",
    );
  }
  for (
    const [label, entry] of Object.entries({
      imported,
      storage,
      oauthReset,
      quarantine,
    })
  ) {
    assertScopeBinding(
      entry.value?.subjectScope,
      binding,
      `${label} subject scope`,
    );
  }
  const chain = {
    sourceReceiptSha256: source.sha256,
    importReceiptSha256: imported.sha256,
    storageReceiptSha256: storage.sha256,
    oauthResetReceiptSha256: oauthReset.sha256,
    quarantineReceiptSha256: quarantine.sha256,
  };
  if (
    source.value?.version !== 1 ||
    source.value?.kind !== "source" ||
    source.value?.status !== "ready" ||
    !Array.isArray(source.value?.blockers) ||
    source.value.blockers.length !== 0 ||
    source.value?.projectRef !== SOURCE_PROJECT_REF ||
    !SHA256_PATTERN.test(source.sha256) ||
    imported.value?.version !== 1 ||
    imported.value?.status !==
      "verified_pending_storage_and_provider_rebind" ||
    imported.value?.sourceProjectRef !== SOURCE_PROJECT_REF ||
    imported.value?.targetProjectRef !== targetRef ||
    imported.value?.sourceReceiptSha256 !== source.sha256 ||
    imported.value?.sourceMutated !== false ||
    storage.value?.version !== 1 ||
    storage.value?.status !== "verified" ||
    storage.value?.sourceProjectRef !== SOURCE_PROJECT_REF ||
    storage.value?.targetProjectRef !== targetRef ||
    storage.value?.sourceReceiptSha256 !== source.sha256 ||
    storage.value?.sourceSecretValueIncluded !== false ||
    storage.value?.targetSecretValueIncluded !== false ||
    storage.value?.rawObjectPathsIncluded !== false ||
    oauthReset.value?.version !== 1 ||
    oauthReset.value?.status !==
      "oauth_credentials_reset_pending_google_reauthorization" ||
    oauthReset.value?.sourceProjectRef !== SOURCE_PROJECT_REF ||
    oauthReset.value?.targetProjectRef !== targetRef ||
    oauthReset.value?.sourceReceiptSha256 !== source.sha256 ||
    oauthReset.value?.importReceiptSha256 !== imported.sha256 ||
    oauthReset.value?.secretValuesIncluded !== false ||
    oauthReset.value?.rowIdsIncluded !== false ||
    oauthReset.value?.sourceMutated !== false ||
    quarantine.value?.version !== 1 ||
    quarantine.value?.status !==
      "provider_state_quarantined_pending_rebind" ||
    quarantine.value?.sourceProjectRef !== SOURCE_PROJECT_REF ||
    quarantine.value?.targetProjectRef !== targetRef ||
    quarantine.value?.importReceiptSha256 !== imported.sha256 ||
    quarantine.value?.oauthResetReceiptSha256 !== oauthReset.sha256 ||
    quarantine.value?.secretValuesIncluded !== false ||
    quarantine.value?.rowIdsIncluded !== false ||
    quarantine.value?.sourceMutated !== false ||
    Object.values(chain).some((value) => !SHA256_PATTERN.test(value))
  ) {
    throw new Error(
      "sync boundary requires one exact source/import/storage/OAuth-reset/quarantine receipt chain",
    );
  }
  return chain;
}

/** Denied writes alone are insufficient: the preserved rows must be the approved copy. */
export function validateDeferredSourceParity(snapshot, source) {
  validateSubjectScopeBinding(source?.subjectScope);
  if (
    !Array.isArray(snapshot?.rows) ||
    snapshot.rows.length !== DEFERRED_RELATIONS.length ||
    !Array.isArray(source?.publicData)
  ) throw new Error("Missing selected sync row parity inventory");
  for (const relation of DEFERRED_RELATIONS) {
    const expected = source.publicData.filter((row) =>
      row.relation === relation
    );
    const actual = snapshot.rows.filter((row) => row.relation === relation);
    if (
      expected.length !== 1 || actual.length !== 1 ||
      expected[0].copyMode !== "copy" ||
      !Number.isSafeInteger(expected[0].copyRowCount) ||
      expected[0].copyRowCount < 0 ||
      typeof expected[0].copyRowsSha256 !== "string" ||
      !SHA256_PATTERN.test(expected[0].copyRowsSha256) ||
      actual[0].rowCount !== expected[0].copyRowCount ||
      actual[0].rowsSha256 !== expected[0].copyRowsSha256
    ) {
      throw new Error(
        "Target sync rows do not match the selected source inventory",
      );
    }
  }
}

function privilegeJson(role, relation) {
  const entries = PRIVILEGES.flatMap((privilege) => [
    quoteLiteral(privilege),
    `has_table_privilege(${quoteLiteral(role)}, ${
      quoteLiteral(`public.${relation}`)
    }, ${quoteLiteral(privilege.toUpperCase())})`,
  ]);
  return `json_build_object(${entries.join(", ")})`;
}

function relationCatalogSelect(relation) {
  return `
    SELECT
      ${quoteLiteral(relation)}::text AS relation,
      relation_class.relkind::text AS relation_kind,
      relation_class.relrowsecurity AS row_security_enabled,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_policies policy
        WHERE policy.schemaname = 'public'
          AND policy.tablename = ${quoteLiteral(relation)}
      ) AS policy_count,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication_tables published
        WHERE published.pubname = 'supabase_realtime'
          AND published.schemaname = 'public'
          AND published.tablename = ${quoteLiteral(relation)}
      ) AS realtime_publication_member,
      json_build_object(
        'anon', ${privilegeJson("anon", relation)},
        'authenticated', ${privilegeJson("authenticated", relation)}
      ) AS privileges
    FROM pg_catalog.pg_class relation_class
    JOIN pg_catalog.pg_namespace relation_namespace
      ON relation_namespace.oid = relation_class.relnamespace
    WHERE relation_namespace.nspname = 'public'
      AND relation_class.relname = ${quoteLiteral(relation)}
      AND relation_class.relkind IN ('r', 'p')`;
}

function relationRowSelect(relation) {
  const table = quoteIdentifier(relation);
  return `
    SELECT
      ${quoteLiteral(relation)}::text AS relation,
      count(*)::bigint AS row_count,
      encode(
        extensions.digest(
          convert_to(
            COALESCE(
              string_agg(row_json, E'\\n' ORDER BY row_json),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) AS rows_sha256
    FROM (
      SELECT to_jsonb(source_row)::text AS row_json
      FROM public.${table} AS source_row
    ) AS row_inventory`;
}

export function targetSnapshotSql() {
  const catalog = DEFERRED_RELATIONS.map(relationCatalogSelect).join(
    "\nUNION ALL\n",
  );
  const rows = DEFERRED_RELATIONS.map(relationRowSelect).join(
    "\nUNION ALL\n",
  );
  return `
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15000ms';
SET LOCAL lock_timeout = '2000ms';
SELECT json_build_object(
  'catalog', (
    SELECT COALESCE(json_agg(json_build_object(
      'relation', relation,
      'relationKind', relation_kind,
      'rowSecurityEnabled', row_security_enabled,
      'policyCount', policy_count,
      'realtimePublicationMember', realtime_publication_member,
      'privileges', privileges
    ) ORDER BY relation), '[]'::json)
    FROM (${catalog}) AS catalog_inventory
  ),
  'rows', (
    SELECT COALESCE(json_agg(json_build_object(
      'relation', relation,
      'rowCount', row_count,
      'rowsSha256', rows_sha256
    ) ORDER BY relation), '[]'::json)
    FROM (${rows}) AS row_state
  )
)::text;
COMMIT;
`;
}

function privilegeEnvelopeIsDenied(privileges) {
  return hasExactKeys(privileges, PRIVILEGES) &&
    PRIVILEGES.every((privilege) => privileges[privilege] === false);
}

export function validateTargetSnapshot(snapshot, label = "target snapshot") {
  if (
    !hasExactKeys(snapshot, ["catalog", "rows"]) ||
    !Array.isArray(snapshot.catalog) ||
    !Array.isArray(snapshot.rows) ||
    canonicalJson(snapshot.catalog.map(({ relation }) => relation)) !==
      canonicalJson(DEFERRED_RELATIONS) ||
    canonicalJson(snapshot.rows.map(({ relation }) => relation)) !==
      canonicalJson(DEFERRED_RELATIONS)
  ) {
    throw new Error(`${label} does not contain the exact deferred relations`);
  }
  for (const catalog of snapshot.catalog) {
    if (
      !hasExactKeys(catalog, [
        "relation",
        "relationKind",
        "rowSecurityEnabled",
        "policyCount",
        "realtimePublicationMember",
        "privileges",
      ]) ||
      catalog.relationKind !== "r" ||
      catalog.rowSecurityEnabled !== true ||
      catalog.policyCount !== 0 ||
      catalog.realtimePublicationMember !== false ||
      !hasExactKeys(catalog.privileges, BROWSER_ROLES) ||
      !BROWSER_ROLES.every((role) =>
        privilegeEnvelopeIsDenied(catalog.privileges[role])
      )
    ) {
      throw new Error(
        `${label} does not prove the fail-closed catalog contract for ${catalog.relation}`,
      );
    }
  }
  for (const row of snapshot.rows) {
    if (
      !hasExactKeys(row, ["relation", "rowCount", "rowsSha256"]) ||
      !Number.isSafeInteger(row.rowCount) ||
      row.rowCount < 0 ||
      !SHA256_PATTERN.test(row.rowsSha256 ?? "")
    ) {
      throw new Error(`${label} has invalid aggregate row evidence`);
    }
  }
  return snapshot;
}

function probePath(relation, method) {
  return method === "GET"
    ? `/rest/v1/${relation}?select=*&limit=1`
    : `/rest/v1/${relation}?select=*`;
}

function requestBody(method) {
  return method === "POST" ? "{}" : "";
}

export function expectedHttpProbeContract() {
  return DEFERRED_RELATIONS.flatMap((relation) =>
    BROWSER_ROLES.flatMap((role) =>
      HTTP_METHODS.map((method) => ({
        relation,
        role,
        method,
        path: probePath(relation, method),
        expectedStatus: EXPECTED_HTTP_STATUS[role],
        expectedPostgrestCode: EXPECTED_POSTGREST_CODE,
        requestBodySha256: sha256(requestBody(method)),
      }))
    )
  );
}

function validatePostgrestDenialBody(body, relation, role, method) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    body.code !== EXPECTED_POSTGREST_CODE ||
    typeof body.message !== "string" ||
    body.message.length === 0
  ) {
    throw new Error(
      `${role} ${method} probe on ${relation} did not return PostgreSQL 42501`,
    );
  }
}

export async function runHttpNegativeProbe({
  fetchImpl,
  targetOrigin,
  publicApiKey,
  authAccessToken,
  relation,
  role,
  method,
}) {
  try {
    const path = probePath(relation, method);
    const expectedStatus = EXPECTED_HTTP_STATUS[role];
    const body = requestBody(method);
    const headers = {
      Accept: "application/json",
      apikey: publicApiKey,
      "Cache-Control": "no-store",
    };
    if (role === "authenticated") {
      headers.Authorization = `Bearer ${authAccessToken}`;
    }
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      headers.Prefer = "return=representation";
    }
    const response = await fetchImpl(`${targetOrigin}${path}`, {
      method,
      headers,
      ...(method === "POST" ? { body } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const responseBody = await response.text();
    if (responseBody.length > 64 * 1024) {
      throw new Error(`${role} ${method} probe response is unexpectedly large`);
    }
    let parsedBody;
    try {
      parsedBody = JSON.parse(responseBody);
    } catch {
      throw new Error(`${role} ${method} probe did not return JSON`);
    }
    if (response.status !== expectedStatus) {
      throw new Error(
        `${role} ${method} probe on ${relation} returned ${response.status}, expected ${expectedStatus}`,
      );
    }
    validatePostgrestDenialBody(parsedBody, relation, role, method);
    return {
      relation,
      role,
      method,
      path,
      expectedStatus,
      observedStatus: response.status,
      postgresCode: parsedBody.code,
      requestBodySha256: sha256(body),
      responseBodySha256: sha256(responseBody),
    };
  } catch (error) {
    throw credentialSafeError(
      error,
      [publicApiKey, authAccessToken],
      `${role} ${method} ${relation} denial probe failed`,
    );
  }
}

export function validateHttpProbeReceipts(probes) {
  const contract = expectedHttpProbeContract();
  if (!Array.isArray(probes) || probes.length !== contract.length) {
    throw new Error("sync boundary requires exactly twelve HTTP denial probes");
  }
  probes.forEach((probe, index) => {
    const expected = contract[index];
    if (
      !hasExactKeys(probe, [
        "relation",
        "role",
        "method",
        "path",
        "expectedStatus",
        "observedStatus",
        "postgresCode",
        "requestBodySha256",
        "responseBodySha256",
      ]) ||
      probe.relation !== expected.relation ||
      probe.role !== expected.role ||
      probe.method !== expected.method ||
      probe.path !== expected.path ||
      probe.expectedStatus !== expected.expectedStatus ||
      probe.observedStatus !== expected.expectedStatus ||
      probe.postgresCode !== EXPECTED_POSTGREST_CODE ||
      probe.requestBodySha256 !== expected.requestBodySha256 ||
      !SHA256_PATTERN.test(probe.responseBodySha256 ?? "")
    ) {
      throw new Error(`HTTP denial probe ${index + 1} is not exact`);
    }
  });
  return probes;
}

function parseVitestReport(rawReport) {
  let report;
  try {
    report = JSON.parse(rawReport);
  } catch {
    throw new Error("deferred service test did not produce a JSON report");
  }
  const testResults = report?.testResults;
  const assertions = Array.isArray(testResults)
    ? testResults.flatMap((result) => result.assertionResults ?? [])
    : [];
  const normalizedAssertions = assertions
    .map(({ fullName, status }) => ({ fullName, status }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const expectedAssertions = EXPECTED_DEFERRED_TEST_ASSERTIONS
    .map((fullName) => ({ fullName, status: "passed" }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  if (
    report?.success !== true ||
    !Number.isSafeInteger(report?.numTotalTestSuites) ||
    report.numTotalTestSuites < 1 ||
    report?.numPassedTestSuites !== report.numTotalTestSuites ||
    report?.numFailedTestSuites !== 0 ||
    report?.numTotalTests !== EXPECTED_DEFERRED_TEST_COUNT ||
    report?.numPassedTests !== EXPECTED_DEFERRED_TEST_COUNT ||
    report?.numFailedTests !== 0 ||
    (report?.numPendingTests ?? 0) !== 0 ||
    testResults?.length !== 1 ||
    typeof testResults[0]?.name !== "string" ||
    !testResults[0].name.endsWith(TEST_FILE_RELATIVE_PATH) ||
    normalizedAssertions.length !== EXPECTED_DEFERRED_TEST_COUNT ||
    canonicalJson(normalizedAssertions) !== canonicalJson(expectedAssertions)
  ) {
    throw new Error(
      "crossDeviceSyncService deferred test did not pass its exact six-test contract",
    );
  }
  return {
    testFileCount: testResults.length,
    totalTests: report.numTotalTests,
    passedTests: report.numPassedTests,
    failedTests: report.numFailedTests,
    skippedTests: report.numPendingTests ?? 0,
    testAssertionsSha256: sha256(canonicalJson(normalizedAssertions)),
  };
}

export function buildServiceTestReceipt({
  rawReport,
  capturedAt,
  targetRef,
  chain,
}) {
  const parsed = parseVitestReport(rawReport);
  return {
    version: 1,
    status: "verified",
    evidenceType: "crossDeviceSyncService.deferred.test",
    capturedAt,
    targetProjectRef: targetRef,
    ...chain,
    testFilePath: TEST_FILE_RELATIVE_PATH,
    testFileSha256: sha256File(TEST_FILE_PATH),
    syncServiceSha256: sha256File(SYNC_SERVICE_PATH),
    commandSha256: deferredServiceTestCommandSha256(),
    vitestReportSha256: sha256(rawReport),
    ...parsed,
    sourceMutated: false,
    targetMutated: false,
    secretValuesIncluded: false,
    rowIdsIncluded: false,
  };
}

function runDeferredServiceTest(
  { capturedAt, targetRef, chain, secretValues },
) {
  const executable = resolve(repoRoot, "node_modules/.bin/vitest");
  if (!existsSync(executable)) {
    throw new Error(
      "node_modules/.bin/vitest is missing; run npm ci in the foreground first",
    );
  }
  const rawReport = String(
    runCommand(executable, VITEST_ARGUMENTS, {
      cwd: repoRoot,
      label: "crossDeviceSyncService deferred test",
      secretValues,
    }),
  );
  return buildServiceTestReceipt({ rawReport, capturedAt, targetRef, chain });
}

function assertNoSecretValues(receipt, secretValues) {
  const serialized = JSON.stringify(receipt);
  if (
    secretValues.some((secret) =>
      typeof secret === "string" && secret.length > 0 &&
      serialized.includes(secret)
    )
  ) {
    throw new Error("refusing to write a sync receipt containing a credential");
  }
}

export function buildBoundaryReceipt({
  capturedAt,
  targetRef,
  chain,
  before,
  after,
  httpProbes,
  serviceTestReceiptPath,
  serviceTestReceiptSha256,
}) {
  validateTargetSnapshot(before, "before snapshot");
  validateTargetSnapshot(after, "after snapshot");
  validateHttpProbeReceipts(httpProbes);
  if (canonicalJson(before.catalog) !== canonicalJson(after.catalog)) {
    throw new Error("target sync catalog drifted during HTTP denial probes");
  }
  if (canonicalJson(before.rows) !== canonicalJson(after.rows)) {
    throw new Error("target sync rows changed during HTTP denial probes");
  }
  if (!SHA256_PATTERN.test(serviceTestReceiptSha256 ?? "")) {
    throw new Error("service-test receipt hash is invalid");
  }
  return {
    version: 2,
    status: "verified",
    evidenceType: "syncDeferredBoundary",
    capturedAt,
    targetProjectRef: targetRef,
    ...chain,
    deferredRelations: [...DEFERRED_RELATIONS],
    catalogProbeSqlSha256: sha256(targetSnapshotSql()),
    catalogBefore: before.catalog,
    catalogAfter: after.catalog,
    rowStateBefore: before.rows,
    rowStateAfter: after.rows,
    httpProbeContractSha256: sha256(
      canonicalJson(expectedHttpProbeContract()),
    ),
    httpNegativeProbes: httpProbes,
    serviceTestReceiptPath,
    serviceTestReceiptSha256,
    syncDeferralMigrationSha256: sha256File(SYNC_DEFERRAL_MIGRATION_PATH),
    syncServiceSha256: sha256File(SYNC_SERVICE_PATH),
    syncServiceTestSha256: sha256File(TEST_FILE_PATH),
    dataScopesManifestSha256: sha256File(DATA_SCOPES_PATH),
    generatorSha256: sha256File(GENERATOR_PATH),
    databaseTransactionMode: "read_only",
    targetRowsMutated: false,
    sourceMutated: false,
    secretValuesIncluded: false,
    rowIdsIncluded: false,
  };
}

async function selfTest() {
  const zeroPrivileges = Object.fromEntries(
    PRIVILEGES.map((privilege) => [privilege, false]),
  );
  const snapshot = {
    catalog: DEFERRED_RELATIONS.map((relation) => ({
      relation,
      relationKind: "r",
      rowSecurityEnabled: true,
      policyCount: 0,
      realtimePublicationMember: false,
      privileges: {
        anon: { ...zeroPrivileges },
        authenticated: { ...zeroPrivileges },
      },
    })),
    rows: DEFERRED_RELATIONS.map((relation) => ({
      relation,
      rowCount: 0,
      rowsSha256: sha256(""),
    })),
  };
  validateTargetSnapshot(snapshot);
  const probes = [];
  for (const expected of expectedHttpProbeContract()) {
    const responseBody = JSON.stringify({
      code: EXPECTED_POSTGREST_CODE,
      details: null,
      hint: null,
      message: `permission denied for table ${expected.relation}`,
    });
    probes.push(
      await runHttpNegativeProbe({
        fetchImpl: async () =>
          new Response(responseBody, {
            status: expected.expectedStatus,
            headers: { "Content-Type": "application/json" },
          }),
        targetOrigin: "https://abcdefghijklmnopqrst.supabase.co",
        publicApiKey: "offline-public-key",
        authAccessToken: "offline-auth-token",
        relation: expected.relation,
        role: expected.role,
        method: expected.method,
      }),
    );
  }
  validateHttpProbeReceipts(probes);
  assert.throws(
    () =>
      buildBoundaryReceipt({
        capturedAt: new Date().toISOString(),
        targetRef: "abcdefghijklmnopqrst",
        chain: Object.fromEntries([
          "sourceReceiptSha256",
          "importReceiptSha256",
          "storageReceiptSha256",
          "oauthResetReceiptSha256",
          "quarantineReceiptSha256",
        ].map((key, index) => [key, String(index + 1).repeat(64)])),
        before: snapshot,
        after: {
          ...snapshot,
          rows: snapshot.rows.map((row, index) =>
            index === 0 ? { ...row, rowCount: 1 } : row
          ),
        },
        httpProbes: probes,
        serviceTestReceiptPath: "/private/tmp/service-test.json",
        serviceTestReceiptSha256: "a".repeat(64),
      }),
    /rows changed/u,
  );
  assert.throws(
    () =>
      validateHttpProbeReceipts([
        { ...probes[0], observedStatus: 200 },
        ...probes.slice(1),
      ]),
    /not exact/u,
  );
  console.log("sync deferred-boundary receipt self-test passed");
}

async function main() {
  if (process.argv.slice(2).includes("--self-test")) {
    await selfTest();
    return;
  }
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
    "source-receipt": { required: true },
    "import-receipt": { required: true },
    "storage-receipt": { required: true },
    "oauth-reset-receipt": { required: true },
    "quarantine-receipt": { required: true },
    "target-ref": { required: true },
    "service-test-receipt": { required: true },
    receipt: { required: true },
    overwrite: { type: "boolean" },
  });
  const targetRef = assertProjectRef(args["target-ref"], "target project ref");
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error("refusing to probe the source project");
  }
  const serviceTestReceiptPath = assertAbsolutePath(
    args["service-test-receipt"],
    "service-test receipt",
  );
  const boundaryReceiptPath = assertAbsolutePath(
    args.receipt,
    "sync boundary receipt",
  );
  if (resolve(serviceTestReceiptPath) === resolve(boundaryReceiptPath)) {
    throw new Error(
      "service-test and boundary receipts require distinct paths",
    );
  }
  if (
    !args.overwrite &&
    (existsSync(serviceTestReceiptPath) || existsSync(boundaryReceiptPath))
  ) {
    throw new Error("refusing to overwrite an existing output receipt");
  }

  const receipts = {
    source: readPrivateReceipt(args["source-receipt"], "source receipt"),
    imported: readPrivateReceipt(args["import-receipt"], "import receipt"),
    storage: readPrivateReceipt(args["storage-receipt"], "storage receipt"),
    oauthReset: readPrivateReceipt(
      args["oauth-reset-receipt"],
      "OAuth-reset receipt",
    ),
    quarantine: readPrivateReceipt(
      args["quarantine-receipt"],
      "provider-quarantine receipt",
    ),
  };
  const chain = validateReceiptChain(receipts, targetRef);

  const databasePassword = consumeTargetDatabasePassword();
  const publicApiKey = process.env[PUBLIC_API_KEY_ENV];
  const authAccessToken = process.env[AUTH_ACCESS_TOKEN_ENV];
  delete process.env[PUBLIC_API_KEY_ENV];
  delete process.env[AUTH_ACCESS_TOKEN_ENV];
  if (!publicApiKey || !authAccessToken || publicApiKey === authAccessToken) {
    throw new Error(
      `${PUBLIC_API_KEY_ENV} and a distinct ${AUTH_ACCESS_TOKEN_ENV} are required`,
    );
  }
  const database = getTargetAdminDatabaseConfig(
    targetRef,
    SOURCE_PROJECT_REF,
    databasePassword,
  );
  const snapshotSql = targetSnapshotSql();
  let before;
  try {
    before = validateTargetSnapshot(
      runPsqlJson(database, snapshotSql),
      "before snapshot",
    );
    validateDeferredSourceParity(before, receipts.source.value);
  } catch (error) {
    throw credentialSafeError(
      error,
      [databasePassword],
      "target before snapshot failed",
    );
  }
  const targetOrigin = `https://${targetRef}.supabase.co`;
  const httpProbes = [];
  for (const expected of expectedHttpProbeContract()) {
    httpProbes.push(
      await runHttpNegativeProbe({
        fetchImpl: fetch,
        targetOrigin,
        publicApiKey,
        authAccessToken,
        relation: expected.relation,
        role: expected.role,
        method: expected.method,
      }),
    );
  }
  validateHttpProbeReceipts(httpProbes);
  let after;
  try {
    after = validateTargetSnapshot(
      runPsqlJson(database, snapshotSql),
      "after snapshot",
    );
    validateDeferredSourceParity(after, receipts.source.value);
  } catch (error) {
    throw credentialSafeError(
      error,
      [databasePassword],
      "target after snapshot failed",
    );
  }
  const capturedAt = new Date().toISOString();
  const serviceTestReceipt = runDeferredServiceTest({
    capturedAt,
    targetRef,
    chain,
    secretValues: [databasePassword, publicApiKey, authAccessToken],
  });
  assertNoSecretValues(serviceTestReceipt, [
    databasePassword,
    publicApiKey,
    authAccessToken,
  ]);
  const serviceTestReceiptSha256 = sha256(
    `${JSON.stringify(serviceTestReceipt, null, 2)}\n`,
  );
  const receipt = buildBoundaryReceipt({
    capturedAt,
    targetRef,
    chain,
    before,
    after,
    httpProbes,
    serviceTestReceiptPath,
    serviceTestReceiptSha256,
  });
  assertNoSecretValues(receipt, [
    databasePassword,
    publicApiKey,
    authAccessToken,
  ]);
  writePrivateJson(serviceTestReceiptPath, serviceTestReceipt, {
    overwrite: args.overwrite,
  });
  if (sha256File(serviceTestReceiptPath) !== serviceTestReceiptSha256) {
    throw new Error("service-test receipt hash changed while writing");
  }
  writePrivateJson(boundaryReceiptPath, receipt, { overwrite: args.overwrite });
  console.log(
    "sync deferred-boundary receipt verified; no target rows changed",
  );
  console.log(`service-test receipt sha256: ${serviceTestReceiptSha256}`);
  console.log(`receipt sha256: ${sha256File(boundaryReceiptPath)}`);
}

const isDirectRun = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

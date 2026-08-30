#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  canonicalJson,
  parseArgs,
  repoRoot,
  sha256,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";
import {
  DEFERRED_RELATIONS,
  deferredServiceTestCommandSha256,
  expectedDeferredAssertionsSha256,
  expectedHttpProbeContract,
  targetSnapshotSql,
  validateDeferredSourceParity,
  validateHttpProbeReceipts,
  validateTargetSnapshot,
} from "./generate-sync-deferred-boundary-receipt.mjs";
import { privateSnapshot } from "./lib/import-subject-package.mjs";
import {
  assertScopeBinding,
  loadSubjectScope,
  subjectScopeBinding,
} from "./lib/migration-subject-scope.mjs";
import { validateRollbackScope } from "./lib/rollback-subject-scope.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ACTION_TIME_MAX_AGE_MS = 10 * 60 * 1000;
const CANARY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const SYNC_DEFERRAL_MIGRATION_PATH = resolve(
  repoRoot,
  "supabase/migrations/20260829050000_defer_cross_device_sync.sql",
);
const SYNC_SERVICE_PATH = resolve(
  repoRoot,
  "src/services/crossDeviceSyncService.ts",
);
const SYNC_SERVICE_TEST_PATH = resolve(
  repoRoot,
  "src/services/__tests__/crossDeviceSyncService.deferred.test.ts",
);
const SYNC_RECEIPT_GENERATOR_PATH = resolve(
  repoRoot,
  "scripts/generate-sync-deferred-boundary-receipt.mjs",
);
const DATA_SCOPES_PATH = resolve(
  repoRoot,
  "supabase/isolation/mind-manual-data-scopes.tsv",
);
const RESET_RECEIPT_RELATIONS = Object.freeze([
  "calendar_accounts",
  "calendar_events",
  "email_accounts",
  "email_messages",
  "email_recipients",
  "gmail_actionables",
  "gmail_compose_receipts",
  "gmail_history_events",
  "gmail_pubsub_receipts",
  "gmail_threads",
  "gmail_watch_subscriptions",
  "oauth_accounts",
  "oauth_state",
  "oauth_tokens",
  "plaid_accounts",
  "plaid_items",
  "plaid_sync_status",
  "plaid_transactions",
  "plaid_webhooks",
]);
const RESET_ZERO_STATE_RELATIONS = new Set(
  RESET_RECEIPT_RELATIONS.filter((relation) =>
    !new Set([
      "calendar_accounts",
      "calendar_events",
      "oauth_tokens",
    ]).has(relation)
  ),
);
const REQUIRED_BOOLEAN_CANARIES = [
  "freshPasswordSignIn",
  "profileRead",
  "privatePhotoRead",
  "calendarOAuthReauthorization",
  "calendarReadAndBoundedSync",
  "calendarWatchAuthenticatedDelivery",
  "gmailOAuthAndScope",
  "gmailWatchSignedPubsubDelivery",
  "gmailHistoryAdvanceAndReplayIdempotency",
  "gmailComposeAcceptance",
  "appBuildAndTestGates",
];
const REQUIRED_EVIDENCE_RECEIPTS = [
  "authAndProfile",
  "privateStorage",
  "calendarOAuthReauthorization",
  "calendarSync",
  "calendarWatch",
  "gmailOAuthSync",
  "gmailPubsub",
  "gmailCompose",
  "syncDeferredBoundary",
  "securityAndBuild",
];
const QUARANTINE_INVENTORY_FIELDS = Object.freeze([
  "calendarAccountsWithProviderState",
  "emailAccountsWithProviderState",
  "gmailWatchesWithProviderState",
  "activeGenericWebhooks",
  "plaidWebhookUrls",
  "transientOauthStates",
]);
const CALENDAR_REAUTHORIZATION_EVIDENCE_FIELDS = Object.freeze([
  "version",
  "status",
  "evidenceType",
  "capturedAt",
  "targetProjectRef",
  "sourceReceiptSha256",
  "importReceiptSha256",
  "storageReceiptSha256",
  "oauthResetReceiptSha256",
  "quarantineReceiptSha256",
  "oauthTokenCount",
  "calendarAccountCount",
  "primaryCalendarAccountCount",
  "calendarEventCountBeforeSync",
  "oauthIdentityLinkageSha256",
  "calendarIdentityLinkageSha256",
  "calendarEventsSha256BeforeSync",
  "strictAccessEnvelopeCount",
  "strictRefreshEnvelopeCount",
  "nonNullRefreshTokenCount",
  "futureExpiryCount",
  "tombstoneMatchCount",
  "secretValuesIncluded",
  "rowIdsIncluded",
]);
const SYNC_DEFERRED_EVIDENCE_FIELDS = Object.freeze([
  "version",
  "status",
  "evidenceType",
  "capturedAt",
  "targetProjectRef",
  "sourceReceiptSha256",
  "importReceiptSha256",
  "storageReceiptSha256",
  "oauthResetReceiptSha256",
  "quarantineReceiptSha256",
  "deferredRelations",
  "catalogProbeSqlSha256",
  "catalogBefore",
  "catalogAfter",
  "rowStateBefore",
  "rowStateAfter",
  "httpProbeContractSha256",
  "httpNegativeProbes",
  "serviceTestReceiptPath",
  "serviceTestReceiptSha256",
  "syncDeferralMigrationSha256",
  "syncServiceSha256",
  "syncServiceTestSha256",
  "dataScopesManifestSha256",
  "generatorSha256",
  "databaseTransactionMode",
  "targetRowsMutated",
  "sourceMutated",
  "secretValuesIncluded",
  "rowIdsIncluded",
]);
const SYNC_SERVICE_TEST_EVIDENCE_FIELDS = Object.freeze([
  "version",
  "status",
  "evidenceType",
  "capturedAt",
  "targetProjectRef",
  "sourceReceiptSha256",
  "importReceiptSha256",
  "storageReceiptSha256",
  "oauthResetReceiptSha256",
  "quarantineReceiptSha256",
  "testFilePath",
  "testFileSha256",
  "syncServiceSha256",
  "commandSha256",
  "vitestReportSha256",
  "testFileCount",
  "totalTests",
  "passedTests",
  "failedTests",
  "skippedTests",
  "testAssertionsSha256",
  "sourceMutated",
  "targetMutated",
  "secretValuesIncluded",
  "rowIdsIncluded",
]);

function usage() {
  console.log(
    "usage: node scripts/prepare-isolated-supabase-rollback-receipt.mjs " +
      "--source-receipt /absolute/source.json " +
      "--subject-scope /absolute/subject-scope.json " +
      "--source-revalidation-receipt /absolute/fresh-source.json " +
      "--source-freeze-receipt /absolute/source-freeze.json " +
      "--package-manifest /absolute/package-manifest.json " +
      "--auth-decision /absolute/auth-decision.json " +
      "--import-receipt /absolute/import.json " +
      "--storage-receipt /absolute/storage.json " +
      "--storage-revalidation-receipt /absolute/storage-revalidation.json " +
      "--oauth-reset-receipt /absolute/oauth-reset.json " +
      "--quarantine-receipt /absolute/quarantine.json " +
      "--target-canary-receipt /absolute/canary.json " +
      "--target-ref <ref> --window-ends <ISO timestamp> " +
      "--receipt /absolute/rollback.json",
  );
}

function resetExpectedRelations(source, imported) {
  const sourceRows = new Map();
  for (const row of source.publicData ?? []) {
    if (typeof row?.relation !== "string" || sourceRows.has(row.relation)) {
      throw new Error("source receipt has invalid or duplicate public data");
    }
    sourceRows.set(row.relation, row);
  }
  const importedRows = new Map();
  for (const row of imported.copiedRelations ?? []) {
    if (
      typeof row?.logicalName !== "string" ||
      importedRows.has(row.logicalName) ||
      !Number.isSafeInteger(row.rowCount) ||
      row.rowCount < 0 ||
      !SHA256_PATTERN.test(row.fileSha256 ?? "")
    ) {
      throw new Error("import receipt has invalid copied relation metadata");
    }
    importedRows.set(row.logicalName, row);
  }

  const expected = {};
  for (const relation of RESET_RECEIPT_RELATIONS) {
    const sourceRow = sourceRows.get(relation);
    const importedRow = importedRows.get(`public.${relation}`);
    const expectedCopyMode = relation === "oauth_state"
      ? "skip_transient"
      : "copy";
    if (
      !sourceRow ||
      sourceRow.copyMode !== expectedCopyMode ||
      !Number.isSafeInteger(sourceRow.copyRowCount) ||
      sourceRow.copyRowCount < 0 ||
      (expectedCopyMode === "copy" &&
        sourceRow.totalRowCount !== sourceRow.copyRowCount) ||
      (expectedCopyMode === "skip_transient" &&
        sourceRow.copyRowCount !== 0) ||
      !SHA256_PATTERN.test(sourceRow.copyRowsSha256 ?? "") ||
      !importedRow ||
      importedRow.rowCount !== sourceRow.copyRowCount
    ) {
      throw new Error(`reset receipt relation mismatch: ${relation}`);
    }
    if (
      RESET_ZERO_STATE_RELATIONS.has(relation) &&
      sourceRow.copyRowCount !== 0
    ) {
      throw new Error(`reset receipt requires empty ${relation}`);
    }
    expected[relation] = {
      rowCount: sourceRow.copyRowCount,
      rowsSha256: sourceRow.copyRowsSha256,
    };
  }
  if (
    expected.oauth_tokens.rowCount < 1 ||
    expected.calendar_accounts.rowCount !== expected.oauth_tokens.rowCount
  ) {
    throw new Error("reset receipt Calendar/OAuth counts are inconsistent");
  }
  return expected;
}

function preservationReceiptIsValid(value) {
  const expectedFields = [
    "oauthTokenMetadataSha256",
    "oauthIdentityLinkageSha256",
    "calendarAccountMetadataSha256",
    "calendarIdentityLinkageSha256",
    "calendarEventsSha256",
  ];
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expectedFields.length &&
    expectedFields.every((field) => SHA256_PATTERN.test(value[field] ?? ""));
}

function hasExactKeys(value, keys) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) ===
      canonicalJson([...keys].sort());
}

function isFreshTimestamp(value, maxAgeMs) {
  const timestamp = Date.parse(value);
  const ageMs = Date.now() - timestamp;
  return Number.isFinite(timestamp) && ageMs >= -5 * 60 * 1000 &&
    ageMs <= maxAgeMs;
}

function preservedAuthInventory(auth) {
  return Object.fromEntries([
    "userCount",
    "identityCount",
    "subjectIdsSha256",
    "usersSha256",
    "identitiesSha256",
    "providerCounts",
    "mfaFactorCount",
    "ssoProviderCount",
    "nonDefaultInstanceCount",
    "userColumnNames",
    "identityColumnNames",
    "usersColumnFingerprintSha256",
    "identitiesColumnFingerprintSha256",
  ].map((field) => [field, auth?.[field]]));
}

export function validateFreshSourceReceipt(source, fresh) {
  assertScopeBinding(
    fresh.subjectScope,
    source.subjectScope,
    "fresh source subject scope",
  );
  if (
    fresh.version !== 1 ||
    fresh.kind !== "source" ||
    fresh.projectRef !== SOURCE_PROJECT_REF ||
    fresh.status !== "ready" ||
    !Array.isArray(fresh.blockers) ||
    fresh.blockers.length !== 0 ||
    !isFreshTimestamp(fresh.capturedAt, ACTION_TIME_MAX_AGE_MS) ||
    canonicalJson(fresh.manifests) !== canonicalJson(source.manifests) ||
    canonicalJson(fresh.catalog) !== canonicalJson(source.catalog) ||
    canonicalJson(fresh.publicData) !== canonicalJson(source.publicData) ||
    canonicalJson(preservedAuthInventory(fresh.auth)) !==
      canonicalJson(preservedAuthInventory(source.auth)) ||
    !Number.isSafeInteger(fresh.auth?.sessionCountExcluded) ||
    fresh.auth.sessionCountExcluded < 0 ||
    !Number.isSafeInteger(fresh.auth?.refreshTokenCountExcluded) ||
    fresh.auth.refreshTokenCountExcluded < 0 ||
    canonicalJson(fresh.storage) !== canonicalJson(source.storage)
  ) {
    throw new Error(
      "action-time source revalidation is stale or drifted from the packaged source",
    );
  }
}

function validateSourceFreezeReceipt(
  freeze,
  targetRef,
  sourceReceiptSha256,
  freshSourceReceiptSha256,
  importReceiptSha256,
  sourceRevalidationCapturedAt,
  storageRevalidationCapturedAt,
) {
  const confirmedAt = Date.parse(freeze.confirmedAt);
  if (
    freeze.version !== 1 ||
    freeze.status !== "source_write_freeze_confirmed_for_cutover" ||
    freeze.sourceProjectRef !== SOURCE_PROJECT_REF ||
    freeze.targetProjectRef !== targetRef ||
    freeze.confirmedBy !== "owner" ||
    freeze.sourceWriteFreezeStillActive !== true ||
    !isFreshTimestamp(freeze.confirmedAt, ACTION_TIME_MAX_AGE_MS) ||
    confirmedAt > Date.parse(sourceRevalidationCapturedAt) ||
    confirmedAt > Date.parse(storageRevalidationCapturedAt) ||
    freeze.sourceReceiptSha256 !== sourceReceiptSha256 ||
    freeze.sourceRevalidationReceiptSha256 !==
      freshSourceReceiptSha256 ||
    freeze.importReceiptSha256 !== importReceiptSha256 ||
    freeze.sourceMutated !== false
  ) {
    throw new Error(
      "action-time source write-freeze receipt is stale or bound to different source evidence",
    );
  }
}

function validateStorageRevalidation(
  revalidation,
  storage,
  storageReceiptSha256,
  sourceReceiptSha256,
  targetRef,
) {
  if (
    revalidation.version !== 1 ||
    revalidation.status !== "verified_revalidation" ||
    !isFreshTimestamp(revalidation.capturedAt, ACTION_TIME_MAX_AGE_MS) ||
    revalidation.sourceProjectRef !== SOURCE_PROJECT_REF ||
    revalidation.targetProjectRef !== targetRef ||
    revalidation.sourceReceiptSha256 !== sourceReceiptSha256 ||
    revalidation.storageReceiptSha256 !== storageReceiptSha256 ||
    revalidation.objectCount !== storage.objectCount ||
    revalidation.totalBytes !== storage.totalBytes ||
    revalidation.contentManifestSha256 !== storage.contentManifestSha256 ||
    revalidation.signedUrlVerifiedCount !== storage.objectCount ||
    revalidation.allObjectsMatch !== true ||
    revalidation.sourceSecretValueIncluded !== false ||
    revalidation.targetSecretValueIncluded !== false ||
    revalidation.rawObjectPathsIncluded !== false
  ) {
    throw new Error(
      "fresh storage revalidation is missing, stale, or content-drifted",
    );
  }
}

function validateCalendarReauthorizationEvidence(
  receipt,
  oauthReset,
  oauthResetReceiptSha256,
  targetRef,
) {
  const tokenCount = oauthReset.expectedGoogleReconnectCount;
  const eventCount = oauthReset.after.preservedCalendarEventCount;
  if (
    !hasExactKeys(receipt, CALENDAR_REAUTHORIZATION_EVIDENCE_FIELDS) ||
    receipt.version !== 1 ||
    receipt.status !== "verified" ||
    !isFreshTimestamp(receipt.capturedAt, CANARY_MAX_AGE_MS) ||
    receipt.targetProjectRef !== targetRef ||
    receipt.oauthResetReceiptSha256 !== oauthResetReceiptSha256 ||
    receipt.oauthTokenCount !== tokenCount ||
    receipt.calendarAccountCount !== tokenCount ||
    receipt.primaryCalendarAccountCount !== tokenCount ||
    receipt.calendarEventCountBeforeSync !== eventCount ||
    receipt.oauthIdentityLinkageSha256 !==
      oauthReset.before.preservation.oauthIdentityLinkageSha256 ||
    receipt.calendarIdentityLinkageSha256 !==
      oauthReset.before.preservation.calendarIdentityLinkageSha256 ||
    receipt.calendarEventsSha256BeforeSync !==
      oauthReset.before.preservation.calendarEventsSha256 ||
    receipt.strictAccessEnvelopeCount !== tokenCount ||
    receipt.strictRefreshEnvelopeCount !== tokenCount ||
    receipt.nonNullRefreshTokenCount !== tokenCount ||
    receipt.futureExpiryCount !== tokenCount ||
    receipt.tombstoneMatchCount !== 0 ||
    receipt.secretValuesIncluded !== false ||
    receipt.rowIdsIncluded !== false
  ) {
    throw new Error(
      "Calendar OAuth reauthorization evidence does not prove preserved identity and fresh credentials",
    );
  }
}

export function validateSyncDeferredEvidence(
  receipt,
  targetRef,
  sourceReceiptSha256,
  importReceiptSha256,
  storageReceiptSha256,
  oauthResetReceiptSha256,
  quarantineReceiptSha256,
  source,
) {
  if (
    !hasExactKeys(receipt, SYNC_DEFERRED_EVIDENCE_FIELDS) ||
    receipt.version !== 2 ||
    receipt.status !== "verified" ||
    receipt.evidenceType !== "syncDeferredBoundary" ||
    receipt.targetProjectRef !== targetRef ||
    receipt.sourceReceiptSha256 !== sourceReceiptSha256 ||
    receipt.importReceiptSha256 !== importReceiptSha256 ||
    receipt.storageReceiptSha256 !== storageReceiptSha256 ||
    receipt.oauthResetReceiptSha256 !== oauthResetReceiptSha256 ||
    receipt.quarantineReceiptSha256 !== quarantineReceiptSha256 ||
    canonicalJson(receipt.deferredRelations) !==
      canonicalJson(DEFERRED_RELATIONS) ||
    receipt.catalogProbeSqlSha256 !== sha256(targetSnapshotSql()) ||
    receipt.httpProbeContractSha256 !==
      sha256(canonicalJson(expectedHttpProbeContract())) ||
    receipt.syncDeferralMigrationSha256 !==
      sha256File(SYNC_DEFERRAL_MIGRATION_PATH) ||
    receipt.syncServiceSha256 !== sha256File(SYNC_SERVICE_PATH) ||
    receipt.syncServiceTestSha256 !== sha256File(SYNC_SERVICE_TEST_PATH) ||
    receipt.dataScopesManifestSha256 !== sha256File(DATA_SCOPES_PATH) ||
    receipt.generatorSha256 !== sha256File(SYNC_RECEIPT_GENERATOR_PATH) ||
    receipt.databaseTransactionMode !== "read_only" ||
    receipt.targetRowsMutated !== false ||
    receipt.sourceMutated !== false ||
    receipt.secretValuesIncluded !== false ||
    receipt.rowIdsIncluded !== false
  ) {
    throw new Error(
      "sync deferred-boundary evidence is not bound to the reviewed target-only generator and receipt chain",
    );
  }
  validateTargetSnapshot(
    { catalog: receipt.catalogBefore, rows: receipt.rowStateBefore },
    "sync boundary before snapshot",
  );
  validateTargetSnapshot(
    { catalog: receipt.catalogAfter, rows: receipt.rowStateAfter },
    "sync boundary after snapshot",
  );
  validateDeferredSourceParity({ rows: receipt.rowStateBefore }, source);
  validateDeferredSourceParity({ rows: receipt.rowStateAfter }, source);
  if (
    canonicalJson(receipt.catalogBefore) !==
      canonicalJson(receipt.catalogAfter) ||
    canonicalJson(receipt.rowStateBefore) !==
      canonicalJson(receipt.rowStateAfter)
  ) {
    throw new Error(
      "sync deferred-boundary evidence does not prove before/after target equality",
    );
  }
  validateHttpProbeReceipts(receipt.httpNegativeProbes);

  const serviceTestPath = assertAbsolutePath(
    receipt.serviceTestReceiptPath,
    "sync service-test receipt path",
  );
  assertPrivateFile(serviceTestPath, "sync service-test receipt");
  const serviceTestBytes = readFileSync(serviceTestPath);
  if (sha256(serviceTestBytes) !== receipt.serviceTestReceiptSha256) {
    throw new Error("sync service-test receipt content drifted");
  }
  let serviceTest;
  try {
    serviceTest = JSON.parse(serviceTestBytes.toString("utf8"));
  } catch {
    throw new Error("sync service-test receipt is not JSON");
  }
  if (
    !hasExactKeys(serviceTest, SYNC_SERVICE_TEST_EVIDENCE_FIELDS) ||
    serviceTest.version !== 1 ||
    serviceTest.status !== "verified" ||
    serviceTest.evidenceType !== "crossDeviceSyncService.deferred.test" ||
    serviceTest.capturedAt !== receipt.capturedAt ||
    !isFreshTimestamp(serviceTest.capturedAt, CANARY_MAX_AGE_MS) ||
    serviceTest.targetProjectRef !== targetRef ||
    serviceTest.sourceReceiptSha256 !== sourceReceiptSha256 ||
    serviceTest.importReceiptSha256 !== importReceiptSha256 ||
    serviceTest.storageReceiptSha256 !== storageReceiptSha256 ||
    serviceTest.oauthResetReceiptSha256 !== oauthResetReceiptSha256 ||
    serviceTest.quarantineReceiptSha256 !== quarantineReceiptSha256 ||
    serviceTest.testFilePath !==
      "src/services/__tests__/crossDeviceSyncService.deferred.test.ts" ||
    serviceTest.testFileSha256 !== sha256File(SYNC_SERVICE_TEST_PATH) ||
    serviceTest.syncServiceSha256 !== sha256File(SYNC_SERVICE_PATH) ||
    serviceTest.commandSha256 !== deferredServiceTestCommandSha256() ||
    !SHA256_PATTERN.test(serviceTest.vitestReportSha256 ?? "") ||
    serviceTest.testFileCount !== 1 ||
    serviceTest.totalTests !== 6 ||
    serviceTest.passedTests !== 6 ||
    serviceTest.failedTests !== 0 ||
    serviceTest.skippedTests !== 0 ||
    serviceTest.testAssertionsSha256 !==
      expectedDeferredAssertionsSha256() ||
    serviceTest.sourceMutated !== false ||
    serviceTest.targetMutated !== false ||
    serviceTest.secretValuesIncluded !== false ||
    serviceTest.rowIdsIncluded !== false
  ) {
    throw new Error(
      "sync service-test receipt does not prove the exact passing deferred service contract",
    );
  }
}

function validateQuarantineReceipt(
  quarantine,
  targetRef,
  importReceiptSha256,
  oauthResetReceiptSha256,
  quarantineSqlSha256,
) {
  const receiptFields = [
    "version",
    "status",
    "quarantinedAt",
    "sourceProjectRef",
    "targetProjectRef",
    "subjectScope",
    "importReceiptSha256",
    "oauthResetReceiptSha256",
    "quarantineSqlSha256",
    "before",
    "after",
    "secretValuesIncluded",
    "rowIdsIncluded",
    "sourceMutated",
  ];
  const quarantinedAt = Date.parse(quarantine.quarantinedAt);
  if (
    !hasExactKeys(quarantine, receiptFields) ||
    quarantine.version !== 1 ||
    quarantine.status !== "provider_state_quarantined_pending_rebind" ||
    quarantine.sourceProjectRef !== SOURCE_PROJECT_REF ||
    quarantine.targetProjectRef !== targetRef ||
    quarantine.importReceiptSha256 !== importReceiptSha256 ||
    quarantine.oauthResetReceiptSha256 !== oauthResetReceiptSha256 ||
    quarantine.quarantineSqlSha256 !== quarantineSqlSha256 ||
    !Number.isFinite(quarantinedAt) ||
    quarantinedAt > Date.now() + 5 * 60 * 1000 ||
    !hasExactKeys(quarantine.before, QUARANTINE_INVENTORY_FIELDS) ||
    !hasExactKeys(quarantine.after, QUARANTINE_INVENTORY_FIELDS) ||
    QUARANTINE_INVENTORY_FIELDS.some((field) =>
      !Number.isSafeInteger(quarantine.before[field]) ||
      quarantine.before[field] < 0 ||
      quarantine.after[field] !== 0
    ) ||
    quarantine.secretValuesIncluded !== false ||
    quarantine.rowIdsIncluded !== false ||
    quarantine.sourceMutated !== false
  ) {
    throw new Error(
      "provider-quarantine receipt does not prove the exact zero-state contract",
    );
  }
}

function validateCanaryReceipt(
  canary,
  oauthReset,
  targetRef,
  sourceReceiptSha256,
  importReceiptSha256,
  storageReceiptSha256,
  oauthResetReceiptSha256,
  quarantineReceiptSha256,
  source,
) {
  const verifiedAt = Date.parse(canary.verifiedAt);
  const ageMs = Date.now() - verifiedAt;
  if (
    canary.version !== 1 ||
    canary.status !== "verified" ||
    canary.targetProjectRef !== targetRef ||
    !Number.isFinite(verifiedAt) ||
    ageMs < -5 * 60 * 1000 ||
    ageMs > CANARY_MAX_AGE_MS ||
    canary.sourceReceiptSha256 !== sourceReceiptSha256 ||
    canary.importReceiptSha256 !== importReceiptSha256 ||
    canary.storageReceiptSha256 !== storageReceiptSha256 ||
    canary.oauthResetReceiptSha256 !== oauthResetReceiptSha256 ||
    canary.quarantineReceiptSha256 !== quarantineReceiptSha256 ||
    canary.browserConsoleErrors !== 0 ||
    canary.securityAdvisorErrors !== 0 ||
    !new Set(["empty", "reauthorized"]).has(canary.plaidDisposition)
  ) {
    throw new Error(
      "target canary receipt is stale, incomplete, or bound to different migration receipts",
    );
  }
  for (const name of REQUIRED_BOOLEAN_CANARIES) {
    if (canary.checks?.[name] !== true) {
      throw new Error(`target canary is not verified: ${name}`);
    }
  }
  for (const name of REQUIRED_EVIDENCE_RECEIPTS) {
    if (!SHA256_PATTERN.test(canary.evidenceReceiptSha256?.[name] ?? "")) {
      throw new Error(`target canary evidence hash is missing: ${name}`);
    }
  }
  if (
    !hasExactKeys(canary.evidenceReceiptSha256, REQUIRED_EVIDENCE_RECEIPTS) ||
    !hasExactKeys(canary.evidenceReceiptPaths, REQUIRED_EVIDENCE_RECEIPTS)
  ) {
    throw new Error("target canary evidence key set is not exact");
  }
  const evidenceReceipts = new Map();
  for (const name of REQUIRED_EVIDENCE_RECEIPTS) {
    const evidencePath = assertAbsolutePath(
      canary.evidenceReceiptPaths[name],
      `target canary evidence path ${name}`,
    );
    assertPrivateFile(evidencePath, `target canary evidence ${name}`);
    const evidenceBytes = readFileSync(evidencePath);
    if (sha256(evidenceBytes) !== canary.evidenceReceiptSha256[name]) {
      throw new Error(`target canary evidence content drifted: ${name}`);
    }
    let evidence;
    try {
      evidence = JSON.parse(evidenceBytes.toString("utf8"));
    } catch {
      throw new Error(`target canary evidence is not JSON: ${name}`);
    }
    const expectedEvidenceVersion = name === "syncDeferredBoundary" ? 2 : 1;
    if (
      evidence.version !== expectedEvidenceVersion ||
      evidence.status !== "verified" ||
      evidence.evidenceType !== name ||
      evidence.targetProjectRef !== targetRef ||
      !isFreshTimestamp(evidence.capturedAt, CANARY_MAX_AGE_MS) ||
      evidence.sourceReceiptSha256 !== sourceReceiptSha256 ||
      evidence.importReceiptSha256 !== importReceiptSha256 ||
      evidence.storageReceiptSha256 !== storageReceiptSha256 ||
      evidence.oauthResetReceiptSha256 !== oauthResetReceiptSha256 ||
      evidence.quarantineReceiptSha256 !== quarantineReceiptSha256 ||
      evidence.secretValuesIncluded !== false ||
      evidence.rowIdsIncluded !== false
    ) {
      throw new Error(`target canary evidence envelope is invalid: ${name}`);
    }
    evidenceReceipts.set(name, evidence);
  }
  validateCalendarReauthorizationEvidence(
    evidenceReceipts.get("calendarOAuthReauthorization"),
    oauthReset,
    oauthResetReceiptSha256,
    targetRef,
  );
  validateSyncDeferredEvidence(
    evidenceReceipts.get("syncDeferredBoundary"),
    targetRef,
    sourceReceiptSha256,
    importReceiptSha256,
    storageReceiptSha256,
    oauthResetReceiptSha256,
    quarantineReceiptSha256,
    source,
  );
  return evidenceReceipts;
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
    "source-receipt": { required: true },
    "subject-scope": { required: true },
    "source-revalidation-receipt": { required: true },
    "source-freeze-receipt": { required: true },
    "package-manifest": { required: true },
    "auth-decision": { required: true },
    "import-receipt": { required: true },
    "storage-receipt": { required: true },
    "storage-revalidation-receipt": { required: true },
    "oauth-reset-receipt": { required: true },
    "quarantine-receipt": { required: true },
    "target-canary-receipt": { required: true },
    "target-ref": { required: true },
    "window-ends": { required: true },
    receipt: { required: true },
    overwrite: { type: "boolean" },
  });
  const targetRef = assertProjectRef(args["target-ref"], "target project ref");
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error("target must differ from source");
  }
  const windowEndsAt = new Date(args["window-ends"]);
  if (
    !Number.isFinite(windowEndsAt.getTime()) ||
    windowEndsAt.getTime() <= Date.now()
  ) {
    throw new Error("rollback window end must be a future timestamp");
  }
  if (process.env.MIND_MANUAL_SOURCE_PUBLIC_CONFIG_STORED !== "yes") {
    throw new Error(
      "set MIND_MANUAL_SOURCE_PUBLIC_CONFIG_STORED=yes only after the prior URL and publishable key are in the operator secret store",
    );
  }

  // Hash and parse exactly the same private bytes; reopening mutable receipts can
  // otherwise bind evidence different from what was actually validated.
  const snapshots = Object.fromEntries([
    "source-receipt",
    "source-revalidation-receipt",
    "source-freeze-receipt",
    "package-manifest",
    "auth-decision",
    "import-receipt",
    "storage-receipt",
    "storage-revalidation-receipt",
    "oauth-reset-receipt",
    "quarantine-receipt",
    "target-canary-receipt",
  ].map((key) => [key, privateSnapshot(args[key], key, { json: true })]));
  const source = snapshots["source-receipt"].value;
  const sourceRevalidation = snapshots["source-revalidation-receipt"].value;
  const sourceFreeze = snapshots["source-freeze-receipt"].value;
  const packageManifest = snapshots["package-manifest"].value;
  const authDecision = snapshots["auth-decision"].value;
  const imported = snapshots["import-receipt"].value;
  const storage = snapshots["storage-receipt"].value;
  const storageRevalidation = snapshots["storage-revalidation-receipt"].value;
  const oauthReset = snapshots["oauth-reset-receipt"].value;
  const quarantine = snapshots["quarantine-receipt"].value;
  const canary = snapshots["target-canary-receipt"].value;
  const sourceReceiptSha256 = snapshots["source-receipt"].sha256;
  const sourceRevalidationReceiptSha256 =
    snapshots["source-revalidation-receipt"].sha256;
  const sourceFreezeReceiptSha256 = snapshots["source-freeze-receipt"].sha256;
  const packageManifestSha256 = snapshots["package-manifest"].sha256;
  const authDecisionSha256 = snapshots["auth-decision"].sha256;
  const importReceiptSha256 = snapshots["import-receipt"].sha256;
  const storageReceiptSha256 = snapshots["storage-receipt"].sha256;
  const storageRevalidationReceiptSha256 =
    snapshots["storage-revalidation-receipt"].sha256;
  const oauthResetReceiptSha256 = snapshots["oauth-reset-receipt"].sha256;
  const quarantineReceiptSha256 = snapshots["quarantine-receipt"].sha256;
  const scope = loadSubjectScope(args["subject-scope"], {
    targetProjectRef: targetRef,
  });
  const packagedScope = privateSnapshot(
    resolve(dirname(args["package-manifest"]), "subject-scope.json"),
    "packaged subject scope",
    { json: true },
  );
  const subjectScope = validateRollbackScope({
    scope: packagedScope.value,
    scopeFileSha256: packagedScope.sha256,
    manifest: packageManifest,
    source,
    decision: authDecision,
    targetRef,
    receipts: {
      sourceRevalidation,
      sourceFreeze,
      imported,
      storage,
      storageRevalidation,
      oauthReset,
      quarantine,
    },
  });
  assertScopeBinding(
    subjectScopeBinding(scope),
    subjectScope,
    "operator subject scope",
  );
  const expectedResetRelations = resetExpectedRelations(source, imported);
  const expectedResetRelationCounts = Object.fromEntries(
    Object.entries(expectedResetRelations).map(([relation, row]) => [
      relation,
      row.rowCount,
    ]),
  );
  const sourceOauthTokenCount = expectedResetRelations.oauth_tokens.rowCount;
  const sourceCalendarAccountCount =
    expectedResetRelations.calendar_accounts.rowCount;
  const sourceCalendarEventCount =
    expectedResetRelations.calendar_events.rowCount;
  const oauthResetSqlPath = resolve(
    repoRoot,
    "supabase/isolation/post-import-oauth-credential-reset.sql",
  );
  const oauthCryptoPath = resolve(
    repoRoot,
    "supabase/functions/_shared/oauthTokenCrypto.ts",
  );
  const quarantineSqlPath = resolve(
    repoRoot,
    "supabase/isolation/post-import-provider-quarantine.sql",
  );
  const externalBindingsPath = resolve(
    repoRoot,
    "supabase/isolation/mind-manual-external-bindings.tsv",
  );
  const dataScopesPath = resolve(
    repoRoot,
    "supabase/isolation/mind-manual-data-scopes.tsv",
  );
  if (!SHA256_PATTERN.test(oauthReset.targetOauthKeyFingerprintSha256 ?? "")) {
    throw new Error("OAuth-reset receipt has no valid target key fingerprint");
  }
  const expectedResetConfirmationSha256 = sha256(canonicalJson({
    version: 1,
    action: "reset-isolated-supabase-oauth-credentials",
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    subjectScope,
    sourceReceiptSha256,
    importReceiptSha256,
    resetSqlSha256: sha256File(oauthResetSqlPath),
    oauthCryptoContractSha256: sha256File(oauthCryptoPath),
    targetOauthKeyFingerprintSha256: oauthReset.targetOauthKeyFingerprintSha256,
    expectedRelations: expectedResetRelations,
  }));
  validateFreshSourceReceipt(source, sourceRevalidation);
  validateSourceFreezeReceipt(
    sourceFreeze,
    targetRef,
    sourceReceiptSha256,
    sourceRevalidationReceiptSha256,
    importReceiptSha256,
    sourceRevalidation.capturedAt,
    storageRevalidation.capturedAt,
  );
  validateStorageRevalidation(
    storageRevalidation,
    storage,
    storageReceiptSha256,
    sourceReceiptSha256,
    targetRef,
  );
  validateQuarantineReceipt(
    quarantine,
    targetRef,
    importReceiptSha256,
    oauthResetReceiptSha256,
    sha256File(quarantineSqlPath),
  );
  const oauthResetReceiptFields = [
    "version",
    "status",
    "verifiedAt",
    "recoveredFromPreparedIntent",
    "preparedIntentSha256",
    "sourceProjectRef",
    "targetProjectRef",
    "subjectScope",
    "sourceReceiptSha256",
    "importReceiptSha256",
    "confirmationContractSha256",
    "resetSqlSha256",
    "oauthCryptoContractSha256",
    "targetOauthKeyFingerprintSha256",
    "before",
    "after",
    "expectedGoogleReconnectCount",
    "expectedPrimaryCalendarAccountCount",
    "requiresGoogleReauthorization",
    "secretValuesIncluded",
    "rowIdsIncluded",
    "sourceMutated",
  ];
  const oauthResetBeforeFields = ["relationCounts", "preservation"];
  const oauthResetAfterFields = [
    "oauthTokenCount",
    "expiredTokenCount",
    "nulledRefreshTokenCount",
    "disabledCalendarAccountCount",
    "primaryCalendarAccountCount",
    "preservedCalendarEventCount",
    "preservation",
    "tombstoneEnvelopeSha256",
  ];
  if (
    source.version !== 1 ||
    source.kind !== "source" ||
    source.projectRef !== SOURCE_PROJECT_REF ||
    source.status !== "ready" ||
    !Array.isArray(source.blockers) ||
    source.blockers.length !== 0 ||
    packageManifest.version !== 1 ||
    packageManifest.status !== "exported_not_imported" ||
    packageManifest.sourceProjectRef !== SOURCE_PROJECT_REF ||
    packageManifest.targetProjectRef !== targetRef ||
    packageManifest.authMode !==
      "preserve_users_and_identities_force_reauthentication" ||
    packageManifest.forceReauthentication !== true ||
    packageManifest.freshSourceReceiptSha256 !== sourceReceiptSha256 ||
    packageManifest.authDecisionSha256 !== authDecisionSha256 ||
    canonicalJson(packageManifest.excludedAuthState) !==
      canonicalJson(["auth.sessions", "auth.refresh_tokens"]) ||
    authDecision.version !== 1 ||
    authDecision.sourceProjectRef !== SOURCE_PROJECT_REF ||
    authDecision.targetProjectRef !== targetRef ||
    authDecision.mode !==
      "preserve_users_and_identities_force_reauthentication" ||
    authDecision.approvedBy !== "owner" ||
    authDecision.sourceWriteFreezeConfirmed !== true ||
    authDecision.expectedUserCount !== source.auth.userCount ||
    authDecision.sourceAuthSubjectsSha256 !== source.auth.subjectIdsSha256 ||
    authDecision.sourceReceiptSha256 !== packageManifest.sourceReceiptSha256 ||
    imported.version !== 1 ||
    imported.sourceProjectRef !== SOURCE_PROJECT_REF ||
    imported.targetProjectRef !== targetRef ||
    imported.status !== "verified_pending_storage_and_provider_rebind" ||
    imported.sourceReceiptSha256 !== sourceReceiptSha256 ||
    imported.packageManifestSha256 !== packageManifestSha256 ||
    imported.authDecisionSha256 !== authDecisionSha256 ||
    !SHA256_PATTERN.test(imported.packageManifestSha256 ?? "") ||
    !SHA256_PATTERN.test(imported.targetPostImportReceiptSha256 ?? "") ||
    !SHA256_PATTERN.test(imported.authDecisionSha256 ?? "") ||
    imported.authSessionsCopied !== false ||
    imported.refreshTokensCopied !== false ||
    imported.sourceMutated !== false ||
    storage.version !== 1 ||
    storage.sourceProjectRef !== SOURCE_PROJECT_REF ||
    storage.targetProjectRef !== targetRef ||
    storage.status !== "verified" ||
    storage.sourceReceiptSha256 !== sourceReceiptSha256 ||
    !Number.isSafeInteger(storage.objectCount) ||
    storage.objectCount < 0 ||
    !Number.isSafeInteger(storage.totalBytes) ||
    storage.totalBytes < 0 ||
    !SHA256_PATTERN.test(storage.contentManifestSha256 ?? "") ||
    storage.sourceSecretValueIncluded !== false ||
    storage.targetSecretValueIncluded !== false ||
    storage.rawObjectPathsIncluded !== false ||
    !hasExactKeys(oauthReset, oauthResetReceiptFields) ||
    !hasExactKeys(oauthReset.before, oauthResetBeforeFields) ||
    !hasExactKeys(oauthReset.after, oauthResetAfterFields) ||
    oauthReset.version !== 1 ||
    oauthReset.sourceProjectRef !== SOURCE_PROJECT_REF ||
    oauthReset.targetProjectRef !== targetRef ||
    oauthReset.status !==
      "oauth_credentials_reset_pending_google_reauthorization" ||
    oauthReset.sourceReceiptSha256 !== sourceReceiptSha256 ||
    oauthReset.importReceiptSha256 !== importReceiptSha256 ||
    oauthReset.resetSqlSha256 !== sha256File(oauthResetSqlPath) ||
    oauthReset.oauthCryptoContractSha256 !== sha256File(oauthCryptoPath) ||
    !SHA256_PATTERN.test(oauthReset.targetOauthKeyFingerprintSha256 ?? "") ||
    oauthReset.confirmationContractSha256 !==
      expectedResetConfirmationSha256 ||
    !SHA256_PATTERN.test(oauthReset.preparedIntentSha256 ?? "") ||
    typeof oauthReset.recoveredFromPreparedIntent !== "boolean" ||
    oauthReset.requiresGoogleReauthorization !== true ||
    oauthReset.expectedGoogleReconnectCount !== sourceOauthTokenCount ||
    oauthReset.expectedPrimaryCalendarAccountCount !==
      sourceCalendarAccountCount ||
    sourceOauthTokenCount < 1 ||
    sourceCalendarAccountCount !== sourceOauthTokenCount ||
    canonicalJson(oauthReset.before?.relationCounts) !==
      canonicalJson(expectedResetRelationCounts) ||
    oauthReset.after?.oauthTokenCount !== sourceOauthTokenCount ||
    oauthReset.after?.expiredTokenCount !== sourceOauthTokenCount ||
    oauthReset.after?.nulledRefreshTokenCount !== sourceOauthTokenCount ||
    oauthReset.after?.disabledCalendarAccountCount !==
      sourceCalendarAccountCount ||
    oauthReset.after?.primaryCalendarAccountCount !==
      sourceCalendarAccountCount ||
    oauthReset.after?.preservedCalendarEventCount !==
      sourceCalendarEventCount ||
    !SHA256_PATTERN.test(oauthReset.after?.tombstoneEnvelopeSha256 ?? "") ||
    oauthReset.secretValuesIncluded !== false ||
    oauthReset.rowIdsIncluded !== false ||
    oauthReset.sourceMutated !== false ||
    !preservationReceiptIsValid(oauthReset.before?.preservation) ||
    !preservationReceiptIsValid(oauthReset.after?.preservation) ||
    canonicalJson(oauthReset.before?.preservation) !==
      canonicalJson(oauthReset.after?.preservation) ||
    source.manifests?.externalBindingsSha256 !==
      sha256File(externalBindingsPath) ||
    source.manifests?.dataScopesSha256 !== sha256File(dataScopesPath)
  ) {
    throw new Error(
      "input receipts do not describe one ready source and target",
    );
  }
  const evidenceReceipts = validateCanaryReceipt(
    canary,
    oauthReset,
    targetRef,
    sourceReceiptSha256,
    importReceiptSha256,
    storageReceiptSha256,
    oauthResetReceiptSha256,
    quarantineReceiptSha256,
    source,
  );
  const syncDeferredEvidence = evidenceReceipts.get("syncDeferredBoundary");

  const receipt = {
    version: 1,
    status: "prepared_not_executed",
    preparedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    subjectScope,
    sourcePublicConfigStored: true,
    sourceSecretValuesRecorded: false,
    sourceReceiptSha256,
    sourceRevalidationReceiptSha256,
    sourceFreezeReceiptSha256,
    packageManifestSha256,
    authDecisionSha256,
    importReceiptSha256,
    storageReceiptSha256,
    storageRevalidationReceiptSha256,
    oauthResetReceiptSha256,
    quarantineReceiptSha256,
    targetCanaryReceiptSha256: snapshots["target-canary-receipt"].sha256,
    syncDeferredBoundaryReceiptSha256:
      canary.evidenceReceiptSha256.syncDeferredBoundary,
    syncDeferredServiceTestReceiptSha256:
      syncDeferredEvidence.serviceTestReceiptSha256,
    externalBindingsManifestSha256: sha256File(externalBindingsPath),
    rollbackWindowEndsAt: windowEndsAt.toISOString(),
    rollbackOwner: "owner",
    rollbackSteps: [
      "Restore the source Supabase URL and publishable key from the operator secret store.",
      "Publish the prior application configuration.",
      "Disable target callbacks and restore source callbacks that were moved.",
      "Verify signed-in read-only Calendar, Gmail, profile, and storage surfaces plus the fail-closed sync boundary on the source.",
      "Leave both projects intact and preserve all receipts until the incident is reconciled.",
    ],
  };
  writePrivateJson(args.receipt, receipt, { overwrite: args.overwrite });
  const receiptSha = sha256File(args.receipt);
  console.log("rollback receipt prepared; no external configuration changed");
  console.log(`receipt sha256: ${receiptSha}`);
  console.log(
    `cutover confirmation: CUTOVER:${targetRef}:${receiptSha.slice(0, 12)}`,
  );
}

const isDirectRun = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

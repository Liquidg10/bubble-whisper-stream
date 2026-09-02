#!/usr/bin/env node

import { chmodSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { privateScopedReceiptSnapshot, privateSnapshot } from "./lib/import-subject-package.mjs";
import { validateMigrationGuardCatalogBinding } from "./lib/migration-guard-catalog.mjs";
import {
  assertScopeBinding,
  loadSubjectScope,
  scopeSqlPredicate,
  subjectScopeBinding,
  validateSubjectScopeBinding,
} from "./lib/migration-subject-scope.mjs";
import {
  assertAbsolutePath,
  assertProjectRef,
  canonicalJson,
  getLinkedDatabaseConfig,
  parseArgs,
  quoteIdentifier,
  quoteLiteral,
  readTsvManifest,
  repoRoot,
  runCommand,
  runPsql,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const AUTH_MODE = "preserve_users_and_identities_force_reauthentication";

function usage() {
  console.log(
    "usage: node scripts/export-isolated-supabase-data.mjs " +
      "--source-receipt /absolute/source.json " +
      "--auth-decision /absolute/auth-decision.json " +
      "--subject-scope /absolute/private/scope.json " +
      "--output-dir /absolute/private/directory",
  );
}

export function validateDecision(decision, sourceReceipt, sourceReceiptSha256) {
  if (decision.version !== 1 || decision.mode !== AUTH_MODE) {
    throw new Error(`Auth decision must use version 1 mode ${AUTH_MODE}`);
  }
  if (decision.sourceProjectRef !== SOURCE_PROJECT_REF) {
    throw new Error(
      "Auth decision source project does not match the canonical source",
    );
  }
  assertProjectRef(
    decision.targetProjectRef,
    "Auth decision target project ref",
  );
  if (decision.targetProjectRef === SOURCE_PROJECT_REF) {
    throw new Error("Auth decision target must differ from the source project");
  }
  assertScopeBinding(
    decision.subjectScope,
    sourceReceipt.subjectScope,
    "Auth decision subject scope",
  );
  if (decision.targetProjectRef !== decision.subjectScope.targetProjectRef) {
    throw new Error(
      "Auth decision target differs from the approved subject scope",
    );
  }
  if (decision.expectedUserCount !== sourceReceipt.auth.userCount) {
    throw new Error(
      "Auth decision user count does not match the source receipt",
    );
  }
  if (
    decision.sourceAuthSubjectsSha256 !== sourceReceipt.auth.subjectIdsSha256
  ) {
    throw new Error(
      "Auth decision subject fingerprint does not match the source receipt",
    );
  }
  if (
    typeof sourceReceiptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(sourceReceiptSha256) ||
    decision.sourceReceiptSha256 !== sourceReceiptSha256
  ) {
    throw new Error(
      "Auth decision source receipt fingerprint does not match the file",
    );
  }
  if (
    decision.approvedBy !== "owner" ||
    !Number.isFinite(Date.parse(decision.approvedAt))
  ) {
    throw new Error("Auth decision requires an owner approval timestamp");
  }
  if (
    decision.sourceWriteFreezeConfirmed !== true ||
    !Number.isFinite(Date.parse(decision.sourceWriteFreezeConfirmedAt))
  ) {
    throw new Error(
      "Auth decision must confirm the source write freeze at export time",
    );
  }
  const freezeAgeMs = Date.now() -
    Date.parse(decision.sourceWriteFreezeConfirmedAt);
  if (freezeAgeMs < 0 || freezeAgeMs > 30 * 60 * 1000) {
    throw new Error(
      "source write-freeze confirmation must be no more than 30 minutes old",
    );
  }
}

export function validateSourceReceipt(receipt) {
  if (
    receipt.version !== 1 ||
    receipt.kind !== "source" ||
    receipt.projectRef !== SOURCE_PROJECT_REF ||
    receipt.status !== "ready" ||
    !Array.isArray(receipt.blockers) ||
    receipt.blockers.length !== 0
  ) {
    throw new Error("source preflight receipt is not ready for export");
  }
  validateSubjectScopeBinding(
    receipt.subjectScope,
    "source receipt subject scope",
  );
  validateMigrationGuardCatalogBinding(receipt.catalog?.migrationGuard);
  if (
    receipt.auth.userCount !== receipt.subjectScope.subjectCount ||
    receipt.auth.subjectIdsSha256 !== receipt.subjectScope.subjectIdsSha256
  ) {
    throw new Error(
      "source receipt Auth subjects do not match the approved subject scope",
    );
  }
  if (
    receipt.auth.mfaFactorCount !== 0 || receipt.auth.ssoProviderCount !== 0
  ) {
    throw new Error(
      "this toolkit does not silently drop MFA or SSO identity state",
    );
  }
  if (receipt.auth.nonDefaultInstanceCount !== 0) {
    throw new Error(
      "Auth users use a non-default instance_id and need a reviewed migration",
    );
  }
}

export function validateFreshSourceReceipt(fresh, approved) {
  validateSourceReceipt(fresh);
  assertScopeBinding(
    fresh.subjectScope,
    approved.subjectScope,
    "fresh source subject scope",
  );
  const compare = (actual, expected, label) => {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(
        `${label} changed after owner approval; obtain a new decision`,
      );
    }
  };
  compare(fresh.manifests, approved.manifests, "isolation manifests");
  compare(fresh.catalog, approved.catalog, "exact source catalog");
  for (
    const field of [
      "userCount",
      "identityCount",
      "subjectIdsSha256",
      "usersSha256",
      "identitiesSha256",
      "usersColumnFingerprintSha256",
      "identitiesColumnFingerprintSha256",
      "providerCounts",
      "mfaFactorCount",
      "ssoProviderCount",
      "nonDefaultInstanceCount",
    ]
  ) {
    compare(fresh.auth[field], approved.auth[field], `scoped Auth ${field}`);
  }
  const dataFields = [
    "relation",
    "copyMode",
    "totalRowCount",
    "copyRowCount",
    "totalRowsSha256",
    "copyRowsSha256",
    "unownedRowCount",
  ];
  const scopedData = (receipt) =>
    receipt.publicData.map((row) =>
      Object.fromEntries(dataFields.map((field) => [field, row[field]]))
    );
  compare(scopedData(fresh), scopedData(approved), "scoped public data");
  compare(
    fresh.storage.buckets,
    approved.storage.buckets,
    "storage bucket contract",
  );
  compare(
    fresh.storage.objects,
    approved.storage.objects,
    "scoped storage objects",
  );
}

function safeCopyPath(path) {
  if (/[\r\n'\\]/u.test(path)) {
    throw new Error(`unsupported character in private package path: ${path}`);
  }
  return path;
}

function copyCommand(query, outputPath) {
  return `\\copy (${query}) TO '${
    safeCopyPath(outputPath)
  }' WITH (FORMAT binary)`;
}

export function buildExportEntries(scopes, receipt, subjectScope) {
  assertScopeBinding(
    receipt.subjectScope,
    subjectScopeBinding(subjectScope),
    "export subject scope",
  );
  const entries = [
    {
      logicalName: "auth.users",
      relativePath: "data/auth.users.bin",
      expectedRows: receipt.auth.userCount,
      query: `SELECT * FROM auth.users WHERE ${
        scopeSqlPredicate(subjectScope, "id")
      } ORDER BY id`,
      sourceRowsSha256: receipt.auth.usersSha256,
      containsCredentials: true,
    },
    {
      logicalName: "auth.identities",
      relativePath: "data/auth.identities.bin",
      expectedRows: receipt.auth.identityCount,
      query: `SELECT * FROM auth.identities WHERE ${
        scopeSqlPredicate(subjectScope, "user_id")
      } ORDER BY id`,
      sourceRowsSha256: receipt.auth.identitiesSha256,
      containsCredentials: true,
    },
  ];
  for (const scope of scopes) {
    const inventory = receipt.publicData.find(({ relation }) =>
      relation === scope.relation
    );
    if (!inventory) {
      throw new Error(
        `fresh receipt has no row inventory for ${scope.relation}`,
      );
    }
    const table = quoteIdentifier(scope.relation);
    const predicate = scope.copyMode === "copy"
      ? scopeSqlPredicate(subjectScope, scope.ownerColumn)
      : "false";
    entries.push({
      logicalName: `public.${scope.relation}`,
      relativePath: `data/public.${scope.relation}.bin`,
      expectedRows: inventory.copyRowCount,
      query: `SELECT * FROM public.${table} WHERE ${predicate} ORDER BY id`,
      containsCredentials: new Set(["oauth_accounts", "oauth_tokens"]).has(
        scope.relation,
      ),
      copyMode: scope.copyMode,
      sourceRowsSha256: inventory.copyRowsSha256,
    });
  }
  return entries;
}

// These checks and COPY run under one repeatable-read snapshot. Counts alone cannot
// detect an in-place selected-user edit between preflight and export.
export function exportSnapshotAssertions(entries) {
  const users = entries.find((entry) => entry.logicalName === "auth.users");
  if (!users) throw new Error("scoped export must include Auth users");
  const mfaAssertion = `DO $export_mfa$ BEGIN
    IF EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id IN (SELECT id FROM (${users.query}) scoped_users)) THEN
      RAISE EXCEPTION 'Scoped export cannot omit selected MFA state' USING ERRCODE='55000';
    END IF;
  END $export_mfa$;`;
  return [
    mfaAssertion,
    ...entries.map((entry) => {
      if (
        !Number.isSafeInteger(entry.expectedRows) || entry.expectedRows < 0 ||
        !/^[a-f0-9]{64}$/u.test(entry.sourceRowsSha256)
      ) {
        throw new Error(
          `invalid scoped export fingerprint for ${entry.logicalName}`,
        );
      }
      return `DO $export_snapshot$ BEGIN
      IF (SELECT count(*) FROM (${entry.query}) snapshot_rows) <> ${entry.expectedRows}
         OR (SELECT encode(extensions.digest(convert_to(COALESCE(string_agg(to_jsonb(snapshot_rows)::text, E'\\n' ORDER BY to_jsonb(snapshot_rows)::text), ''), 'UTF8'), 'sha256'), 'hex')
             FROM (${entry.query}) snapshot_rows) <> ${
        quoteLiteral(entry.sourceRowsSha256)
      } THEN
        RAISE EXCEPTION ${
        quoteLiteral(`Scoped export snapshot changed: ${entry.logicalName}`)
      } USING ERRCODE='55000';
      END IF;
    END $export_snapshot$;`;
    }),
  ].join("\n");
}

export function buildExportCommands(entries, outputDir) {
  return [
    "\\set ON_ERROR_STOP on",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    "SET ROLE postgres;",
    exportSnapshotAssertions(entries),
    // runPsql is normally quiet. COPY command tags are a required receipt here.
    "\\set QUIET off",
    ...entries.map((entry) =>
      copyCommand(entry.query, resolve(outputDir, entry.relativePath))
    ),
    "COMMIT;",
    "",
  ].join("\n");
}

function ensureOutsideRepository(outputDir) {
  const normalizedRepo = `${realpathSync(repoRoot)}${sep}`;
  const realParent = realpathSync(dirname(outputDir));
  const realOutput = resolve(realParent, basename(outputDir));
  const normalizedOutput = `${realOutput}${sep}`;
  if (normalizedOutput.startsWith(normalizedRepo)) {
    throw new Error(
      "sensitive data packages must be written outside the repository",
    );
  }
  return realOutput;
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
    "source-receipt": { required: true },
    "auth-decision": { required: true },
    "subject-scope": { required: true },
    "output-dir": { required: true },
  });
  const subjectScope = loadSubjectScope(args["subject-scope"]);
  const scopeBinding = subjectScopeBinding(subjectScope);
  const sourceSnapshot = privateScopedReceiptSnapshot(
    args["source-receipt"],
    "source receipt",
  );
  const decisionSnapshot = privateScopedReceiptSnapshot(
    args["auth-decision"],
    "Auth decision",
  );
  const sourceReceipt = sourceSnapshot.value;
  const authDecision = decisionSnapshot.value;
  validateSourceReceipt(sourceReceipt);
  assertScopeBinding(
    sourceReceipt.subjectScope,
    scopeBinding,
    "source receipt subject scope",
  );
  validateDecision(authDecision, sourceReceipt, sourceSnapshot.sha256);

  const requestedOutputDir = assertAbsolutePath(
    args["output-dir"],
    "output directory",
  );
  const outputDir = ensureOutsideRepository(requestedOutputDir);
  try {
    mkdirSync(outputDir, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(
        `refusing to reuse existing package directory: ${outputDir}`,
      );
    }
    throw error;
  }
  chmodSync(outputDir, 0o700);
  const packagedScopePath = resolve(outputDir, "subject-scope.json");
  writePrivateJson(packagedScopePath, subjectScope);

  const freshReceiptPath = resolve(outputDir, "source-preflight.json");
  let preflightResult;
  try {
    preflightResult = runCommand(
      process.execPath,
      [
        resolve(repoRoot, "scripts/supabase-isolation-preflight.mjs"),
        "--kind",
        "source",
        "--project-ref",
        SOURCE_PROJECT_REF,
        "--subject-scope",
        packagedScopePath,
        "--receipt",
        freshReceiptPath,
      ],
      { label: "fresh source isolation preflight" },
    );
  } catch {
    throw new Error(
      "fresh source preflight failed; raw database output suppressed",
    );
  }
  void preflightResult;
  const freshSnapshot = privateSnapshot(
    freshReceiptPath,
    "fresh source receipt",
    { json: true },
  );
  const freshReceipt = freshSnapshot.value;
  validateFreshSourceReceipt(freshReceipt, sourceReceipt);

  const scopes = readTsvManifest(
    "supabase/isolation/mind-manual-data-scopes.tsv",
    3,
  ).map(([relation, ownerColumn, copyMode]) => ({
    relation,
    ownerColumn,
    copyMode,
  }));
  const dataDir = resolve(outputDir, "data");
  mkdirSync(dataDir, { mode: 0o700 });
  chmodSync(dataDir, 0o700);

  const exportEntries = buildExportEntries(scopes, freshReceipt, subjectScope);
  const commands = buildExportCommands(exportEntries, outputDir);
  const database = getLinkedDatabaseConfig(SOURCE_PROJECT_REF);
  let copyOutput;
  try {
    copyOutput = String(runPsql(database, commands));
  } catch {
    throw new Error(
      "scoped source export failed; no successful package manifest was created; raw database output suppressed",
    );
  }
  const copiedCounts = [...copyOutput.matchAll(/^COPY\s+(\d+)$/gmu)].map((
    match,
  ) => Number.parseInt(match[1], 10));
  if (copiedCounts.length !== exportEntries.length) {
    throw new Error(
      `expected ${exportEntries.length} COPY receipts, received ${copiedCounts.length}`,
    );
  }

  const files = exportEntries.map((entry, index) => {
    const absolutePath = resolve(outputDir, entry.relativePath);
    chmodSync(absolutePath, 0o600);
    if (copiedCounts[index] !== entry.expectedRows) {
      throw new Error(
        `${entry.logicalName} exported ${
          copiedCounts[index]
        } rows; expected ${entry.expectedRows}`,
      );
    }
    return {
      logicalName: entry.logicalName,
      relativePath: relative(outputDir, absolutePath),
      rowCount: copiedCounts[index],
      bytes: statSync(absolutePath).size,
      fileSha256: sha256File(absolutePath),
      sourceRowsSha256: entry.sourceRowsSha256 ?? null,
      copyMode: entry.copyMode ?? "auth_identity",
      containsCredentials: entry.containsCredentials,
    };
  });
  const packagedScopeSnapshot = privateSnapshot(
    packagedScopePath,
    "packaged subject scope",
    { json: true },
  );
  assertScopeBinding(
    subjectScopeBinding(packagedScopeSnapshot.value),
    scopeBinding,
    "packaged subject scope",
  );

  const packageManifest = {
    version: 1,
    status: "exported_not_imported",
    createdAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: authDecision.targetProjectRef,
    subjectScope: scopeBinding,
    subjectScopeFile: {
      relativePath: "subject-scope.json",
      sha256: packagedScopeSnapshot.sha256,
    },
    authMode: AUTH_MODE,
    forceReauthentication: true,
    sourceReceiptSha256: sourceSnapshot.sha256,
    freshSourceReceiptSha256: freshSnapshot.sha256,
    authDecisionSha256: decisionSnapshot.sha256,
    files,
    transientRowsIntentionallyExcluded: ["public.oauth_state"],
    excludedAuthState: ["auth.sessions", "auth.refresh_tokens"],
    containsSensitiveData: true,
    secretValuesPrinted: false,
  };
  const packageManifestPath = resolve(outputDir, "package-manifest.json");
  writePrivateJson(packageManifestPath, packageManifest);
  console.log(`exported ${files.length} private binary files`);
  console.log(`package manifest sha256: ${sha256File(packageManifestPath)}`);
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

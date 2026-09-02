#!/usr/bin/env node

import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import {
  assertAbsolutePath,
  assertProjectRef,
  canonicalJson,
  consumeTargetDatabasePassword,
  getLinkedDatabaseConfig,
  getTargetAdminDatabaseConfig,
  parseArgs,
  readTsvManifest,
  repoRoot,
  runCommand,
  runPsql,
  sha256File,
  writePrivateFile,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";
import { assertScopeBinding, subjectScopeBinding, validateSubjectScope } from "./lib/migration-subject-scope.mjs";
import { validateMigrationGuardCatalogBinding } from "./lib/migration-guard-catalog.mjs";
import {
  importTransactionGuards,
  privateScopedReceiptSnapshot,
  privateSnapshot,
  snapshotPackageBinaryFiles,
  validateImportScope,
} from "./lib/import-subject-package.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const AUTH_MODE = "preserve_users_and_identities_force_reauthentication";

function usage() {
  console.log(
    "usage: node scripts/import-isolated-supabase-data.mjs " +
      "--package-dir /absolute/private/directory " +
      "--auth-decision /absolute/auth-decision.json --target-ref <ref> " +
      "[--execute --confirmation IMPORT:<target-ref>:<manifest-sha-prefix>]",
  );
}

function resolvePackagePath(packageDir, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.startsWith("/") ||
    relativePath.includes("\0")
  ) {
    throw new Error(`invalid package path: ${relativePath}`);
  }
  const resolved = resolve(packageDir, relativePath);
  if (!resolved.startsWith(`${resolve(packageDir)}${sep}`)) {
    throw new Error(`package path escapes its directory: ${relativePath}`);
  }
  return resolved;
}

function safeCopyPath(path) {
  if (/[\r\n'\\]/u.test(path)) {
    throw new Error(`unsupported character in private package path: ${path}`);
  }
  return path;
}

function runTargetPreflight(
  targetRef,
  sourceReceiptPath,
  subjectScopePath,
  outputPath,
) {
  runCommand(
    process.execPath,
    [
      resolve(repoRoot, "scripts/supabase-isolation-preflight.mjs"),
      "--kind",
      "target",
      "--project-ref",
      targetRef,
      "--receipt",
      outputPath,
      "--compare-receipt",
      sourceReceiptPath,
      "--subject-scope",
      subjectScopePath,
      "--exit-zero",
    ],
    { label: "target isolation preflight" },
  );
  return privateSnapshot(outputPath, "target preflight receipt", {
    json: true,
  });
}

function missingPendingStorageBlockers(sourceReceipt) {
  return new Set(
    (sourceReceipt.storage?.objects ?? []).map(({ bucket }) =>
      `storage missing from target: ${bucket}`
    ),
  );
}

export function validatePreImportTarget(targetReceipt, sourceReceipt) {
  validateMigrationGuardCatalogBinding(sourceReceipt.catalog?.migrationGuard);
  validateMigrationGuardCatalogBinding(targetReceipt.catalog?.migrationGuard);
  assertScopeBinding(
    targetReceipt.subjectScope,
    sourceReceipt.subjectScope,
    "target pre-import scope",
  );
  if (targetReceipt.kind !== "target") {
    throw new Error("target receipt has wrong kind");
  }
  if (targetReceipt.excludedPublicRelations.length > 0) {
    throw new Error("target contains public relations outside the allowlist");
  }
  if (
    targetReceipt.auth.userCount !== 0 || targetReceipt.auth.identityCount !== 0
  ) {
    throw new Error("target Auth is not empty");
  }
  for (const row of targetReceipt.publicData) {
    if (row.totalRowCount !== 0) {
      throw new Error(`target table is not empty: ${row.relation}`);
    }
  }
  if (
    targetReceipt.auth.usersColumnFingerprintSha256 !==
      sourceReceipt.auth.usersColumnFingerprintSha256 ||
    targetReceipt.auth.identitiesColumnFingerprintSha256 !==
      sourceReceipt.auth.identitiesColumnFingerprintSha256
  ) {
    throw new Error(
      "target Auth column layout differs from the source package",
    );
  }

  const allowedBlockerPrefixes = [
    "public data mismatch for ",
    "Auth identity mismatch: ",
    "storage mismatch for ",
  ];
  const disallowed = targetReceipt.blockers.filter(
    (blocker) =>
      !allowedBlockerPrefixes.some((prefix) => blocker.startsWith(prefix)) &&
      !missingPendingStorageBlockers(sourceReceipt).has(blocker),
  );
  if (disallowed.length > 0) {
    throw new Error(`target pre-import blockers: ${disallowed.join("; ")}`);
  }
}

export function validatePostImportTarget(targetReceipt, sourceReceipt) {
  validateMigrationGuardCatalogBinding(sourceReceipt.catalog?.migrationGuard);
  validateMigrationGuardCatalogBinding(targetReceipt.catalog?.migrationGuard);
  assertScopeBinding(
    targetReceipt.subjectScope,
    sourceReceipt.subjectScope,
    "target post-import scope",
  );
  const allowedBlockerPrefixes = ["storage mismatch for "];
  const disallowed = targetReceipt.blockers.filter(
    (blocker) =>
      !allowedBlockerPrefixes.some((prefix) => blocker.startsWith(prefix)) &&
      !missingPendingStorageBlockers(sourceReceipt).has(blocker),
  );
  if (disallowed.length > 0) {
    throw new Error(`target import parity failed: ${disallowed.join("; ")}`);
  }
}

export function validatePackageFiles(manifest, sourceReceipt) {
  if (!Array.isArray(manifest.files)) {
    throw new Error("package manifest files must be an array");
  }
  const scopes = readTsvManifest(
    "supabase/isolation/mind-manual-data-scopes.tsv",
    3,
  ).map(([relation, _ownerColumn, copyMode]) => ({ relation, copyMode }));
  const sourceNames = (sourceReceipt.publicData ?? []).map((row) =>
    row?.relation
  );
  if (
    new Set(sourceNames).size !== sourceNames.length ||
    canonicalJson([...sourceNames].sort()) !==
      canonicalJson(scopes.map(({ relation }) => relation).sort())
  ) {
    throw new Error(
      "source receipt must inventory every public relation exactly once",
    );
  }
  const expected = new Map([
    [
      "auth.users",
      {
        rowCount: sourceReceipt.auth.userCount,
        copyMode: "auth_identity",
        sourceRowsSha256: sourceReceipt.auth.usersSha256,
      },
    ],
    [
      "auth.identities",
      {
        rowCount: sourceReceipt.auth.identityCount,
        copyMode: "auth_identity",
        sourceRowsSha256: sourceReceipt.auth.identitiesSha256,
      },
    ],
  ]);
  for (const scope of scopes) {
    const inventory = sourceReceipt.publicData.find(
      ({ relation }) => relation === scope.relation,
    );
    if (!inventory) {
      throw new Error(
        `source receipt has no row inventory for ${scope.relation}`,
      );
    }
    expected.set(`public.${scope.relation}`, {
      rowCount: inventory.copyRowCount,
      copyMode: scope.copyMode,
      sourceRowsSha256: inventory.copyRowsSha256,
    });
  }

  const logicalNames = manifest.files.map(({ logicalName }) => logicalName);
  if (
    new Set(logicalNames).size !== logicalNames.length ||
    canonicalJson([...logicalNames].sort()) !==
      canonicalJson([...expected.keys()].sort())
  ) {
    throw new Error(
      "package must contain every allowlisted Auth/public relation exactly once",
    );
  }
  for (const file of manifest.files) {
    const expectedFile = expected.get(file.logicalName);
    if (
      !expectedFile ||
      !Number.isSafeInteger(file.rowCount) ||
      file.rowCount < 0 ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !/^[a-f0-9]{64}$/u.test(file.fileSha256) ||
      file.rowCount !== expectedFile.rowCount ||
      file.copyMode !== expectedFile.copyMode ||
      file.sourceRowsSha256 !== expectedFile.sourceRowsSha256
    ) {
      throw new Error(`package metadata mismatch: ${file.logicalName}`);
    }
  }
}

export function buildImportCommands(manifest, stagingDir, sourceReceipt) {
  const guards = importTransactionGuards(sourceReceipt);
  return [
    "\\set ON_ERROR_STOP on",
    "\\set QUIET off",
    "BEGIN;",
    "SET ROLE postgres;",
    guards.beforeCopy,
    "SET LOCAL session_replication_role = replica;",
    ...manifest.files.map((file) => {
      if (
        !/^(auth|public)\.[a-z][a-z0-9_]*$/u.test(file.logicalName) ||
        file.relativePath !== `data/${file.logicalName}.bin`
      ) {
        throw new Error("Invalid logical relation or path in package");
      }
      const path = resolvePackagePath(stagingDir, file.relativePath);
      return `\\copy ${file.logicalName} FROM '${
        safeCopyPath(path)
      }' WITH (FORMAT binary)`;
    }),
    guards.afterCopy,
    "COMMIT;",
    "",
  ].join("\n");
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
    "package-dir": { required: true },
    "auth-decision": { required: true },
    "target-ref": { required: true },
    execute: { type: "boolean" },
    confirmation: {},
  });
  const packageDir = assertAbsolutePath(
    args["package-dir"],
    "package directory",
  );
  const targetRef = assertProjectRef(args["target-ref"], "target project ref");
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error("refusing to import into the source project");
  }

  // Validate the embedded owner scope before opening receipt chains or creating
  // staging output. Later execution uses these exact snapshots, never rereads.
  const scopeSnapshot = privateSnapshot(
    resolvePackagePath(packageDir, "subject-scope.json"),
    "package subject scope",
    { json: true },
  );
  const embeddedBinding = subjectScopeBinding(validateSubjectScope(scopeSnapshot.value, {
    targetProjectRef: targetRef,
  }));
  let stagingDir;
  try {
    const manifestSnapshot = privateScopedReceiptSnapshot(
      resolvePackagePath(packageDir, "package-manifest.json"),
      "package manifest",
    );
    assertScopeBinding(manifestSnapshot.value.subjectScope, embeddedBinding, "package scope");
    const sourceSnapshot = privateScopedReceiptSnapshot(
      resolvePackagePath(
        packageDir,
        "source-preflight.json",
      ),
      "source receipt",
    );
    assertScopeBinding(sourceSnapshot.value.subjectScope, embeddedBinding, "source receipt scope");
    const manifest = manifestSnapshot.value;
    const sourceReceipt = sourceSnapshot.value;
    const authDecisionPath = assertAbsolutePath(
      args["auth-decision"],
      "Auth decision",
    );
    const decisionSnapshot = privateScopedReceiptSnapshot(
      authDecisionPath,
      "Auth decision",
    );
    const authDecision = decisionSnapshot.value;
    const binding = validateImportScope({
      scope: scopeSnapshot.value,
      scopeFileSha256: scopeSnapshot.sha256,
      manifest,
      source: sourceReceipt,
      decision: authDecision,
      targetRef,
    });
    if (
      manifest.version !== 1 ||
      manifest.status !== "exported_not_imported" ||
      manifest.sourceProjectRef !== SOURCE_PROJECT_REF ||
      manifest.targetProjectRef !== targetRef ||
      manifest.authMode !== AUTH_MODE ||
      manifest.forceReauthentication !== true ||
      sourceReceipt.version !== 1 ||
      sourceReceipt.kind !== "source" ||
      sourceReceipt.status !== "ready" ||
      !Array.isArray(sourceReceipt.blockers) ||
      sourceReceipt.blockers.length !== 0 ||
      sourceReceipt.projectRef !== SOURCE_PROJECT_REF ||
      authDecision.version !== 1 ||
      authDecision.sourceProjectRef !== SOURCE_PROJECT_REF ||
      authDecision.targetProjectRef !== targetRef ||
      authDecision.mode !== AUTH_MODE ||
      authDecision.approvedBy !== "owner" ||
      authDecision.sourceWriteFreezeConfirmed !== true ||
      authDecision.expectedUserCount !== sourceReceipt.auth.userCount ||
      authDecision.sourceAuthSubjectsSha256 !==
        sourceReceipt.auth.subjectIdsSha256 ||
      manifest.authDecisionSha256 !== decisionSnapshot.sha256 ||
      manifest.freshSourceReceiptSha256 !== sourceSnapshot.sha256
    ) {
      throw new Error(
        "package, Auth decision, source receipt, and target do not agree",
      );
    }
    validatePackageFiles(manifest, sourceReceipt);
    stagingDir = mkdtempSync(resolve(tmpdir(), "mind-manual-import-snapshot-"));
    chmodSync(stagingDir, 0o700);
    const sourceReceiptPath = resolve(stagingDir, "source-preflight.json");
    const subjectScopePath = resolve(stagingDir, "subject-scope.json");
    writePrivateFile(sourceReceiptPath, sourceSnapshot.bytes);
    writePrivateFile(subjectScopePath, scopeSnapshot.bytes);
    snapshotPackageBinaryFiles(manifest, packageDir, stagingDir);
    const targetDatabasePassword = consumeTargetDatabasePassword();

    getLinkedDatabaseConfig(targetRef);
    const temporaryDir = mkdtempSync(
      resolve(tmpdir(), "mind-manual-target-preflight-"),
    );
    chmodSync(temporaryDir, 0o700);
    let preImportReceipt;
    try {
      const preImportPath = resolve(temporaryDir, "pre-import.json");
      preImportReceipt = runTargetPreflight(
        targetRef,
        sourceReceiptPath,
        subjectScopePath,
        preImportPath,
      ).value;
      validatePreImportTarget(preImportReceipt, sourceReceipt);
    } finally {
      rmSync(temporaryDir, { recursive: true, force: true });
    }

    const manifestSha = manifestSnapshot.sha256;
    const confirmation = `IMPORT:${targetRef}:${manifestSha.slice(0, 12)}`;
    if (!args.execute) {
      console.log("target import dry-run ready");
      console.log(`execute confirmation: ${confirmation}`);
      return;
    }
    if (args.confirmation !== confirmation) {
      throw new Error(
        `--execute requires exact --confirmation ${confirmation}`,
      );
    }

    // Verify the exact staged inputs once more immediately before use. Original
    // package mutations cannot alter this executing snapshot.
    for (const file of manifest.files) {
      const snapshot = privateSnapshot(
        resolvePackagePath(stagingDir, file.relativePath),
        "staged package input",
      );
      if (
        snapshot.bytes.length !== file.bytes ||
        snapshot.sha256 !== file.fileSha256
      ) throw new Error("Staged import package changed");
    }
    const commands = buildImportCommands(manifest, stagingDir, sourceReceipt);
    const database = getTargetAdminDatabaseConfig(
      targetRef,
      SOURCE_PROJECT_REF,
      targetDatabasePassword,
    );
    let copyOutput;
    try {
      copyOutput = String(runPsql(database, commands));
    } catch {
      // COPY diagnostics can contain row identifiers or credentials. A lost
      // connection at COMMIT is ambiguous, not permission to blindly retry.
      throw new Error(
        "Target import did not return verified completion; reconcile target state before retry or cutover",
      );
    }
    const copiedCounts = [...copyOutput.matchAll(/^COPY\s+(\d+)$/gmu)].map((
      match,
    ) => Number.parseInt(match[1], 10));
    if (
      copiedCounts.length !== manifest.files.length ||
      copiedCounts.some((count, index) =>
        count !== manifest.files[index].rowCount
      )
    ) {
      throw new Error(
        "target COPY receipts did not match the package; target is quarantined and must not be cut over",
      );
    }

    const postImportPath = resolvePackagePath(
      packageDir,
      "target-post-import.json",
    );
    const postImportSnapshot = runTargetPreflight(
      targetRef,
      sourceReceiptPath,
      subjectScopePath,
      postImportPath,
    );
    const postImportReceipt = postImportSnapshot.value;
    validatePostImportTarget(postImportReceipt, sourceReceipt);
    const importReceiptPath = resolvePackagePath(
      packageDir,
      "import-receipt.json",
    );
    writePrivateJson(importReceiptPath, {
      version: 1,
      status: "verified_pending_storage_and_provider_rebind",
      migrationGuard: sourceReceipt.catalog.migrationGuard,
      importedAt: new Date().toISOString(),
      sourceProjectRef: SOURCE_PROJECT_REF,
      targetProjectRef: targetRef,
      subjectScope: binding,
      packageManifestSha256: manifestSha,
      sourceReceiptSha256: sourceSnapshot.sha256,
      authDecisionSha256: decisionSnapshot.sha256,
      targetPostImportReceiptSha256: postImportSnapshot.sha256,
      copiedRelations: manifest.files.map((file) => ({
        logicalName: file.logicalName,
        rowCount: file.rowCount,
        fileSha256: file.fileSha256,
      })),
      authSessionsCopied: false,
      refreshTokensCopied: false,
      sourceMutated: false,
    });
    console.log(
      "target import verified; cutover remains blocked on storage and provider rebind",
    );
    console.log(`import receipt sha256: ${sha256File(importReceiptPath)}`);
  } finally {
    // Only this mkdtemp-created snapshot is disposable; original packages remain.
    if (stagingDir) rmSync(stagingDir, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

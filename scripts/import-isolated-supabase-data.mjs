#!/usr/bin/env node

import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  assertAbsolutePath,
  assertPrivateFile,
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
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

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

function readPrivateJson(path, label) {
  assertPrivateFile(path, label);
  return JSON.parse(readFileSync(path, "utf8"));
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

function runTargetPreflight(targetRef, sourceReceiptPath, outputPath) {
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
      "--exit-zero",
    ],
    { label: "target isolation preflight" },
  );
  return readPrivateJson(outputPath, "target preflight receipt");
}

function validatePreImportTarget(targetReceipt, sourceReceipt) {
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
      !allowedBlockerPrefixes.some((prefix) => blocker.startsWith(prefix)),
  );
  if (disallowed.length > 0) {
    throw new Error(`target pre-import blockers: ${disallowed.join("; ")}`);
  }
}

function validatePostImportTarget(targetReceipt) {
  const allowedBlockerPrefixes = ["storage mismatch for "];
  const disallowed = targetReceipt.blockers.filter(
    (blocker) =>
      !allowedBlockerPrefixes.some((prefix) => blocker.startsWith(prefix)),
  );
  if (disallowed.length > 0) {
    throw new Error(`target import parity failed: ${disallowed.join("; ")}`);
  }
}

function validatePackageFiles(manifest, sourceReceipt) {
  if (!Array.isArray(manifest.files)) {
    throw new Error("package manifest files must be an array");
  }
  const scopes = readTsvManifest(
    "supabase/isolation/mind-manual-data-scopes.tsv",
    3,
  ).map(([relation, _ownerColumn, copyMode]) => ({ relation, copyMode }));
  const expected = new Map([
    [
      "auth.users",
      {
        rowCount: sourceReceipt.auth.userCount,
        copyMode: "auth_identity",
        sourceRowsSha256: null,
      },
    ],
    [
      "auth.identities",
      {
        rowCount: sourceReceipt.auth.identityCount,
        copyMode: "auth_identity",
        sourceRowsSha256: null,
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
  const targetDatabasePassword = consumeTargetDatabasePassword();
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error("refusing to import into the source project");
  }

  const manifestPath = resolvePackagePath(packageDir, "package-manifest.json");
  const sourceReceiptPath = resolvePackagePath(
    packageDir,
    "source-preflight.json",
  );
  const manifest = readPrivateJson(manifestPath, "package manifest");
  const sourceReceipt = readPrivateJson(sourceReceiptPath, "source receipt");
  const authDecisionPath = assertAbsolutePath(
    args["auth-decision"],
    "Auth decision",
  );
  const authDecision = readPrivateJson(authDecisionPath, "Auth decision");
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
    manifest.authDecisionSha256 !== sha256File(authDecisionPath) ||
    manifest.freshSourceReceiptSha256 !== sha256File(sourceReceiptPath)
  ) {
    throw new Error(
      "package, Auth decision, source receipt, and target do not agree",
    );
  }
  validatePackageFiles(manifest, sourceReceipt);

  for (const file of manifest.files) {
    const path = resolvePackagePath(packageDir, file.relativePath);
    assertPrivateFile(path, file.logicalName);
    if (
      statSync(path).size !== file.bytes || sha256File(path) !== file.fileSha256
    ) {
      throw new Error(`package file checksum mismatch: ${file.logicalName}`);
    }
  }

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
      preImportPath,
    );
    validatePreImportTarget(preImportReceipt, sourceReceipt);
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }

  const manifestSha = sha256File(manifestPath);
  const confirmation = `IMPORT:${targetRef}:${manifestSha.slice(0, 12)}`;
  if (!args.execute) {
    console.log("target import dry-run ready");
    console.log(`execute confirmation: ${confirmation}`);
    return;
  }
  if (args.confirmation !== confirmation) {
    throw new Error(`--execute requires exact --confirmation ${confirmation}`);
  }

  const commands = [
    "\\set ON_ERROR_STOP on",
    "BEGIN;",
    "SET ROLE postgres;",
    "SET LOCAL session_replication_role = replica;",
    ...manifest.files.map((file) => {
      if (!/^(auth|public)\.[a-z][a-z0-9_]*$/u.test(file.logicalName)) {
        throw new Error(
          `invalid logical relation in package: ${file.logicalName}`,
        );
      }
      const path = resolvePackagePath(packageDir, file.relativePath);
      return `\\copy ${file.logicalName} FROM '${
        safeCopyPath(path)
      }' WITH (FORMAT binary)`;
    }),
    "COMMIT;",
    "",
  ].join("\n");
  const database = getTargetAdminDatabaseConfig(
    targetRef,
    SOURCE_PROJECT_REF,
    targetDatabasePassword,
  );
  const copyOutput = String(runPsql(database, commands));
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
  const postImportReceipt = runTargetPreflight(
    targetRef,
    sourceReceiptPath,
    postImportPath,
  );
  validatePostImportTarget(postImportReceipt);
  const importReceiptPath = resolvePackagePath(
    packageDir,
    "import-receipt.json",
  );
  writePrivateJson(importReceiptPath, {
    version: 1,
    status: "verified_pending_storage_and_provider_rebind",
    importedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    packageManifestSha256: manifestSha,
    sourceReceiptSha256: sha256File(sourceReceiptPath),
    authDecisionSha256: sha256File(authDecisionPath),
    targetPostImportReceiptSha256: sha256File(postImportPath),
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

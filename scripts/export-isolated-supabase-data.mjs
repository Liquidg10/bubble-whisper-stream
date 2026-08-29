#!/usr/bin/env node

import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  getLinkedDatabaseConfig,
  parseArgs,
  quoteIdentifier,
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
      "--output-dir /absolute/private/directory",
  );
}

function readJson(path, label) {
  assertAbsolutePath(path, label);
  assertPrivateFile(path, label);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function validateDecision(decision, sourceReceipt, sourceReceiptPath) {
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
  if (decision.sourceReceiptSha256 !== sha256File(sourceReceiptPath)) {
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

function validateSourceReceipt(receipt) {
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
    "output-dir": { required: true },
  });
  const sourceReceipt = readJson(args["source-receipt"], "source receipt");
  const authDecision = readJson(args["auth-decision"], "Auth decision");
  validateSourceReceipt(sourceReceipt);
  validateDecision(authDecision, sourceReceipt, args["source-receipt"]);

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
        "--receipt",
        freshReceiptPath,
      ],
      { label: "fresh source isolation preflight" },
    );
  } catch (error) {
    throw new Error(`fresh source preflight failed: ${error.message}`);
  }
  void preflightResult;
  const freshReceipt = readJson(freshReceiptPath, "fresh source receipt");
  validateSourceReceipt(freshReceipt);
  if (
    freshReceipt.auth.subjectIdsSha256 !==
      sourceReceipt.auth.subjectIdsSha256 ||
    freshReceipt.auth.userCount !== sourceReceipt.auth.userCount
  ) {
    throw new Error(
      "Auth identity changed after owner approval; obtain a new decision",
    );
  }
  if (
    JSON.stringify(freshReceipt.manifests) !==
      JSON.stringify(sourceReceipt.manifests)
  ) {
    throw new Error(
      "isolation manifests changed after the approved source receipt",
    );
  }

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

  const exportEntries = [
    {
      logicalName: "auth.users",
      relativePath: "data/auth.users.bin",
      expectedRows: freshReceipt.auth.userCount,
      query: "SELECT * FROM auth.users ORDER BY id",
      containsCredentials: true,
    },
    {
      logicalName: "auth.identities",
      relativePath: "data/auth.identities.bin",
      expectedRows: freshReceipt.auth.identityCount,
      query: "SELECT * FROM auth.identities ORDER BY id",
      containsCredentials: true,
    },
  ];
  for (const scope of scopes) {
    const inventory = freshReceipt.publicData.find(
      ({ relation }) => relation === scope.relation,
    );
    if (!inventory) {
      throw new Error(
        `fresh receipt has no row inventory for ${scope.relation}`,
      );
    }
    const table = quoteIdentifier(scope.relation);
    const owner = quoteIdentifier(scope.ownerColumn);
    const predicate = scope.copyMode === "copy"
      ? `${owner} IN (SELECT id FROM auth.users)`
      : "false";
    exportEntries.push({
      logicalName: `public.${scope.relation}`,
      relativePath: `data/public.${scope.relation}.bin`,
      expectedRows: inventory.copyRowCount,
      query: `SELECT * FROM public.${table} WHERE ${predicate} ORDER BY id`,
      containsCredentials: new Set([
        "oauth_accounts",
        "oauth_tokens",
      ]).has(scope.relation),
      copyMode: scope.copyMode,
      sourceRowsSha256: inventory.copyRowsSha256,
    });
  }

  const commands = [
    "\\set ON_ERROR_STOP on",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    "SET ROLE postgres;",
    ...exportEntries.map((entry) =>
      copyCommand(entry.query, resolve(outputDir, entry.relativePath))
    ),
    "COMMIT;",
    "",
  ].join("\n");
  const database = getLinkedDatabaseConfig(SOURCE_PROJECT_REF);
  const copyOutput = String(runPsql(database, commands));
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

  const packageManifest = {
    version: 1,
    status: "exported_not_imported",
    createdAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: authDecision.targetProjectRef,
    authMode: AUTH_MODE,
    forceReauthentication: true,
    sourceReceiptSha256: sha256File(args["source-receipt"]),
    freshSourceReceiptSha256: sha256File(freshReceiptPath),
    authDecisionSha256: sha256File(args["auth-decision"]),
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

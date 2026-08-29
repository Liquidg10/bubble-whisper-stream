#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  parseArgs,
  repoRoot,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const REQUIRED_BOOLEAN_CANARIES = [
  "freshPasswordSignIn",
  "profileRead",
  "privatePhotoRead",
  "calendarReadAndBoundedSync",
  "calendarWatchAuthenticatedDelivery",
  "gmailOAuthAndScope",
  "gmailWatchSignedPubsubDelivery",
  "gmailHistoryAdvanceAndReplayIdempotency",
  "gmailComposeAcceptance",
  "syncReadWrite",
  "appBuildAndTestGates",
];
const REQUIRED_EVIDENCE_RECEIPTS = [
  "authAndProfile",
  "privateStorage",
  "calendarSync",
  "calendarWatch",
  "gmailOAuthSync",
  "gmailPubsub",
  "gmailCompose",
  "syncReadWrite",
  "securityAndBuild",
];

function usage() {
  console.log(
    "usage: node scripts/prepare-isolated-supabase-rollback-receipt.mjs " +
      "--source-receipt /absolute/source.json " +
      "--import-receipt /absolute/import.json " +
      "--storage-receipt /absolute/storage.json " +
      "--quarantine-receipt /absolute/quarantine.json " +
      "--target-canary-receipt /absolute/canary.json " +
      "--target-ref <ref> --window-ends <ISO timestamp> " +
      "--receipt /absolute/rollback.json",
  );
}

function readReceipt(path, label) {
  assertAbsolutePath(path, label);
  assertPrivateFile(path, label);
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateCanaryReceipt(
  canary,
  targetRef,
  sourceReceiptSha256,
  importReceiptSha256,
  storageReceiptSha256,
  quarantineReceiptSha256,
) {
  const verifiedAt = Date.parse(canary.verifiedAt);
  const ageMs = Date.now() - verifiedAt;
  if (
    canary.version !== 1 ||
    canary.status !== "verified" ||
    canary.targetProjectRef !== targetRef ||
    !Number.isFinite(verifiedAt) ||
    ageMs < -5 * 60 * 1000 ||
    ageMs > 2 * 60 * 60 * 1000 ||
    canary.sourceReceiptSha256 !== sourceReceiptSha256 ||
    canary.importReceiptSha256 !== importReceiptSha256 ||
    canary.storageReceiptSha256 !== storageReceiptSha256 ||
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
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
    "source-receipt": { required: true },
    "import-receipt": { required: true },
    "storage-receipt": { required: true },
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

  const source = readReceipt(args["source-receipt"], "source receipt");
  const imported = readReceipt(args["import-receipt"], "import receipt");
  const storage = readReceipt(args["storage-receipt"], "storage receipt");
  const quarantine = readReceipt(
    args["quarantine-receipt"],
    "provider-quarantine receipt",
  );
  const canary = readReceipt(
    args["target-canary-receipt"],
    "target canary receipt",
  );
  const sourceReceiptSha256 = sha256File(args["source-receipt"]);
  const importReceiptSha256 = sha256File(args["import-receipt"]);
  const storageReceiptSha256 = sha256File(args["storage-receipt"]);
  const quarantineReceiptSha256 = sha256File(args["quarantine-receipt"]);
  const quarantineSqlPath = resolve(
    repoRoot,
    "supabase/isolation/post-import-provider-quarantine.sql",
  );
  const externalBindingsPath = resolve(
    repoRoot,
    "supabase/isolation/mind-manual-external-bindings.tsv",
  );
  if (
    source.version !== 1 ||
    source.kind !== "source" ||
    source.projectRef !== SOURCE_PROJECT_REF ||
    source.status !== "ready" ||
    imported.sourceProjectRef !== SOURCE_PROJECT_REF ||
    imported.targetProjectRef !== targetRef ||
    imported.status !== "verified_pending_storage_and_provider_rebind" ||
    imported.sourceReceiptSha256 !== sourceReceiptSha256 ||
    storage.sourceProjectRef !== SOURCE_PROJECT_REF ||
    storage.targetProjectRef !== targetRef ||
    storage.status !== "verified" ||
    storage.sourceReceiptSha256 !== sourceReceiptSha256 ||
    quarantine.sourceProjectRef !== SOURCE_PROJECT_REF ||
    quarantine.targetProjectRef !== targetRef ||
    quarantine.status !== "provider_state_quarantined_pending_rebind" ||
    quarantine.importReceiptSha256 !== importReceiptSha256 ||
    quarantine.quarantineSqlSha256 !== sha256File(quarantineSqlPath) ||
    source.manifests?.externalBindingsSha256 !==
      sha256File(externalBindingsPath)
  ) {
    throw new Error(
      "input receipts do not describe one ready source and target",
    );
  }
  validateCanaryReceipt(
    canary,
    targetRef,
    sourceReceiptSha256,
    importReceiptSha256,
    storageReceiptSha256,
    quarantineReceiptSha256,
  );

  const receipt = {
    version: 1,
    status: "prepared_not_executed",
    preparedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    sourcePublicConfigStored: true,
    sourceSecretValuesRecorded: false,
    sourceReceiptSha256,
    importReceiptSha256,
    storageReceiptSha256,
    quarantineReceiptSha256,
    targetCanaryReceiptSha256: sha256File(args["target-canary-receipt"]),
    externalBindingsManifestSha256: sha256File(externalBindingsPath),
    rollbackWindowEndsAt: windowEndsAt.toISOString(),
    rollbackOwner: "owner",
    rollbackSteps: [
      "Restore the source Supabase URL and publishable key from the operator secret store.",
      "Publish the prior application configuration.",
      "Disable target callbacks and restore source callbacks that were moved.",
      "Verify signed-in read-only Calendar, Gmail, profile, storage, and sync surfaces on the source.",
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

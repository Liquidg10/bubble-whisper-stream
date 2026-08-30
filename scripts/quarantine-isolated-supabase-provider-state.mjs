#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertScopeBinding,
  validateSubjectScopeBinding,
} from "./lib/migration-subject-scope.mjs";
import {
  guardTargetMutationSql,
  targetSubjectScopeGuardSql,
} from "./reset-isolated-supabase-oauth-credentials.mjs";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  consumeTargetDatabasePassword,
  getLinkedDatabaseConfig,
  getTargetAdminDatabaseConfig,
  parseArgs,
  repoRoot,
  runPsql,
  runPsqlJson,
  sha256,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";

export function inventorySql(subjectScope) {
  return `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET ROLE postgres;
${targetSubjectScopeGuardSql(subjectScope)}
SELECT json_build_object(
  'calendarAccountsWithProviderState', (
    SELECT count(*) FROM public.calendar_accounts
    WHERE watch_channel_id IS NOT NULL OR watch_resource_id IS NOT NULL
       OR watch_expires_at IS NOT NULL OR watch_status <> 'inactive'
  ),
  'emailAccountsWithProviderState', (
    SELECT count(*) FROM public.email_accounts
    WHERE history_id IS NOT NULL OR watch_expiration IS NOT NULL
       OR watch_resource_id IS NOT NULL OR watch_channel_id IS NOT NULL
  ),
  'gmailWatchesWithProviderState', (
    SELECT count(*) FROM public.gmail_watch_subscriptions
    WHERE status <> 'inactive' OR history_id IS NOT NULL OR watch_expires_at IS NOT NULL
  ),
  'activeGenericWebhooks', (
    SELECT count(*) FROM public.webhook_subscriptions WHERE is_active
  ),
  'plaidWebhookUrls', (
    SELECT count(*) FROM public.plaid_sync_status WHERE webhook_url IS NOT NULL
  ),
  'transientOauthStates', (SELECT count(*) FROM public.oauth_state)
)::text;
COMMIT;
`;
}

export function validateQuarantineInputs(
  importReceipt,
  oauthResetReceipt,
  importReceiptSha256,
  targetRef,
) {
  const subjectScope = validateSubjectScopeBinding(importReceipt.subjectScope);
  assertScopeBinding(
    oauthResetReceipt.subjectScope,
    subjectScope,
    "OAuth-reset subject scope",
  );
  if (
    importReceipt.version !== 1 ||
    importReceipt.status !== "verified_pending_storage_and_provider_rebind" ||
    importReceipt.sourceProjectRef !== SOURCE_PROJECT_REF ||
    importReceipt.targetProjectRef !== targetRef ||
    importReceipt.sourceMutated !== false ||
    !/^[a-f0-9]{64}$/u.test(importReceipt.sourceReceiptSha256 ?? "") ||
    subjectScope.sourceProjectRef !== SOURCE_PROJECT_REF ||
    subjectScope.targetProjectRef !== targetRef ||
    oauthResetReceipt.version !== 1 ||
    oauthResetReceipt.status !==
      "oauth_credentials_reset_pending_google_reauthorization" ||
    oauthResetReceipt.sourceProjectRef !== SOURCE_PROJECT_REF ||
    oauthResetReceipt.targetProjectRef !== targetRef ||
    oauthResetReceipt.sourceReceiptSha256 !==
      importReceipt.sourceReceiptSha256 ||
    oauthResetReceipt.importReceiptSha256 !== importReceiptSha256 ||
    oauthResetReceipt.secretValuesIncluded !== false ||
    oauthResetReceipt.rowIdsIncluded !== false ||
    oauthResetReceipt.sourceMutated !== false
  ) {
    throw new Error(
      "provider quarantine requires one verified scoped target import and OAuth-reset receipt chain",
    );
  }
  return subjectScope;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    "target-ref": { required: true },
    "import-receipt": { required: true },
    "oauth-reset-receipt": { required: true },
    receipt: { required: true },
    execute: { type: "boolean" },
    confirmation: {},
    overwrite: { type: "boolean" },
  });
  const targetRef = assertProjectRef(args["target-ref"], "target project ref");
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error(
      "refusing to quarantine provider state on the source project",
    );
  }
  const importReceiptPath = assertAbsolutePath(
    args["import-receipt"],
    "import receipt",
  );
  assertPrivateFile(importReceiptPath, "import receipt");
  const importReceiptBytes = readFileSync(importReceiptPath);
  let importReceipt;
  try {
    importReceipt = JSON.parse(importReceiptBytes.toString("utf8"));
  } catch {
    throw new Error("import receipt is not valid JSON");
  }
  const oauthResetReceiptPath = assertAbsolutePath(
    args["oauth-reset-receipt"],
    "OAuth-reset receipt",
  );
  assertPrivateFile(oauthResetReceiptPath, "OAuth-reset receipt");
  const oauthResetReceiptBytes = readFileSync(oauthResetReceiptPath);
  let oauthResetReceipt;
  try {
    oauthResetReceipt = JSON.parse(oauthResetReceiptBytes.toString("utf8"));
  } catch {
    throw new Error("OAuth-reset receipt is not valid JSON");
  }
  const importReceiptSha256 = sha256(importReceiptBytes);
  const oauthResetReceiptSha256 = sha256(oauthResetReceiptBytes);
  const subjectScope = validateQuarantineInputs(
    importReceipt,
    oauthResetReceipt,
    importReceiptSha256,
    targetRef,
  );
  const targetDatabasePassword = consumeTargetDatabasePassword();

  const readOnlyDatabase = getLinkedDatabaseConfig(targetRef);
  const before = runPsqlJson(readOnlyDatabase, inventorySql(subjectScope));
  const confirmation = `QUARANTINE:${targetRef}:${
    oauthResetReceiptSha256.slice(0, 12)
  }`;
  if (!args.execute) {
    console.log("provider quarantine dry-run ready");
    console.log(`execute confirmation: ${confirmation}`);
    return;
  }
  if (args.confirmation !== confirmation) {
    throw new Error(`--execute requires exact --confirmation ${confirmation}`);
  }

  const database = getTargetAdminDatabaseConfig(
    targetRef,
    SOURCE_PROJECT_REF,
    targetDatabasePassword,
  );
  const sqlPath = resolve(
    repoRoot,
    "supabase/isolation/post-import-provider-quarantine.sql",
  );
  const template = readFileSync(sqlPath, "utf8");
  runPsql(database, guardTargetMutationSql(template, subjectScope));
  const after = runPsqlJson(database, inventorySql(subjectScope));
  if (Object.values(after).some((value) => value !== 0)) {
    throw new Error(
      "provider quarantine verification failed; do not deploy callbacks",
    );
  }
  writePrivateJson(
    args.receipt,
    {
      version: 1,
      status: "provider_state_quarantined_pending_rebind",
      quarantinedAt: new Date().toISOString(),
      sourceProjectRef: SOURCE_PROJECT_REF,
      targetProjectRef: targetRef,
      subjectScope,
      importReceiptSha256,
      oauthResetReceiptSha256,
      quarantineSqlSha256: sha256(template),
      before,
      after,
      secretValuesIncluded: false,
      rowIdsIncluded: false,
      sourceMutated: false,
    },
    { overwrite: args.overwrite },
  );
  console.log("target provider state quarantined and verified");
  console.log(`receipt sha256: ${sha256File(args.receipt)}`);
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

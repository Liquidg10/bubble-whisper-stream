#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";

function inventorySql() {
  return `
BEGIN READ ONLY;
SET ROLE postgres;
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
  const targetDatabasePassword = consumeTargetDatabasePassword();
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
  const importReceipt = JSON.parse(readFileSync(importReceiptPath, "utf8"));
  const oauthResetReceiptPath = assertAbsolutePath(
    args["oauth-reset-receipt"],
    "OAuth-reset receipt",
  );
  assertPrivateFile(oauthResetReceiptPath, "OAuth-reset receipt");
  const oauthResetReceipt = JSON.parse(
    readFileSync(oauthResetReceiptPath, "utf8"),
  );
  const importReceiptSha256 = sha256File(importReceiptPath);
  const oauthResetReceiptSha256 = sha256File(oauthResetReceiptPath);
  if (
    importReceipt.version !== 1 ||
    importReceipt.status !== "verified_pending_storage_and_provider_rebind" ||
    importReceipt.sourceProjectRef !== SOURCE_PROJECT_REF ||
    importReceipt.targetProjectRef !== targetRef ||
    oauthResetReceipt.version !== 1 ||
    oauthResetReceipt.status !==
      "oauth_credentials_reset_pending_google_reauthorization" ||
    oauthResetReceipt.sourceProjectRef !== SOURCE_PROJECT_REF ||
    oauthResetReceipt.targetProjectRef !== targetRef ||
    oauthResetReceipt.importReceiptSha256 !== importReceiptSha256 ||
    oauthResetReceipt.sourceMutated !== false
  ) {
    throw new Error(
      "provider quarantine requires the verified target import and OAuth-reset receipts",
    );
  }

  const readOnlyDatabase = getLinkedDatabaseConfig(targetRef);
  const before = runPsqlJson(readOnlyDatabase, inventorySql());
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
  runPsql(database, readFileSync(sqlPath, "utf8"));
  const after = runPsqlJson(database, inventorySql());
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
      importReceiptSha256,
      oauthResetReceiptSha256,
      quarantineSqlSha256: sha256File(sqlPath),
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

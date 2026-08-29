#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  getLinkedDatabaseConfig,
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
  const importReceipt = JSON.parse(readFileSync(importReceiptPath, "utf8"));
  if (
    importReceipt.version !== 1 ||
    importReceipt.status !== "verified_pending_storage_and_provider_rebind" ||
    importReceipt.targetProjectRef !== targetRef
  ) {
    throw new Error(
      "provider quarantine requires the verified target import receipt",
    );
  }

  const database = getLinkedDatabaseConfig(targetRef);
  const before = runPsqlJson(database, inventorySql());
  const confirmation = `QUARANTINE:${targetRef}:${
    sha256File(importReceiptPath).slice(0, 12)
  }`;
  if (!args.execute) {
    console.log("provider quarantine dry-run ready");
    console.log(`execute confirmation: ${confirmation}`);
    return;
  }
  if (args.confirmation !== confirmation) {
    throw new Error(`--execute requires exact --confirmation ${confirmation}`);
  }

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
      importReceiptSha256: sha256File(importReceiptPath),
      quarantineSqlSha256: sha256File(sqlPath),
      before,
      after,
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

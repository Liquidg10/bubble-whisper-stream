#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateSubjectScopeBinding } from "./lib/migration-subject-scope.mjs";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  canonicalJson,
  consumeTargetDatabasePassword,
  getLinkedDatabaseConfig,
  getTargetAdminDatabaseConfig,
  parseArgs,
  quoteIdentifier,
  quoteLiteral,
  readTsvManifest,
  repoRoot,
  runPsql,
  runPsqlJson,
  sha256,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const OAUTH_KEY_ENV = "OAUTH_ENCRYPTION_KEY";
const FRESH_KEY_CONFIRMATION_ENV = "MIND_MANUAL_TARGET_OAUTH_KEY_IS_FRESH";
const OAUTH_AAD = Buffer.from("bubble-whisper-stream/oauth-token/v1", "utf8");
const TOMBSTONE_PLAINTEXT = "mind-manual:google-reauthorization-required:v1";
const STRICT_ENVELOPE_PATTERN =
  /^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RESET_SQL_PATH = resolve(
  repoRoot,
  "supabase/isolation/post-import-oauth-credential-reset.sql",
);
const OAUTH_CRYPTO_PATH = resolve(
  repoRoot,
  "supabase/functions/_shared/oauthTokenCrypto.ts",
);
const DATA_SCOPES_PATH = resolve(
  repoRoot,
  "supabase/isolation/mind-manual-data-scopes.tsv",
);

const ZERO_STATE_RELATIONS = Object.freeze([
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
  "plaid_accounts",
  "plaid_items",
  "plaid_sync_status",
  "plaid_transactions",
  "plaid_webhooks",
]);
const MUTATED_RELATIONS = Object.freeze([
  "calendar_accounts",
  "oauth_tokens",
]);
const PRESERVED_RELATIONS = Object.freeze([
  "calendar_events",
  ...ZERO_STATE_RELATIONS,
]);
const RECEIPT_BOUND_RELATIONS = Object.freeze([
  ...MUTATED_RELATIONS,
  ...PRESERVED_RELATIONS,
].sort());
const RELATIONSHIP_FIELDS = Object.freeze([
  "nonCalendarTokenCount",
  "tokenLinkMismatchCount",
  "accountOwnershipMismatchCount",
  "eventOwnershipMismatchCount",
]);
const PRESERVATION_FIELDS = Object.freeze([
  "oauthTokenMetadataSha256",
  "oauthIdentityLinkageSha256",
  "calendarAccountMetadataSha256",
  "calendarIdentityLinkageSha256",
  "calendarEventsSha256",
]);

function usage() {
  console.log(
    "usage: node scripts/reset-isolated-supabase-oauth-credentials.mjs " +
      "--source-receipt /absolute/source.json " +
      "--import-receipt /absolute/import.json --target-ref <ref> " +
      "--receipt /absolute/oauth-reset.json " +
      "[--recover] " +
      "[--execute --confirmation RESET-OAUTH:<target-ref>:<contract-prefix>]",
  );
  console.log(
    `requires ${OAUTH_KEY_ENV} and ${FRESH_KEY_CONFIRMATION_ENV}=yes; ` +
      "use --self-test for offline validation",
  );
}

function readReceiptSnapshot(path, label) {
  assertAbsolutePath(path, label);
  assertPrivateFile(path, label);
  const bytes = readFileSync(path);
  try {
    return { value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function decodeEncryptionKey(configuredValue) {
  if (!configuredValue) throw new Error(`${OAUTH_KEY_ENV} is required`);
  let key;
  if (
    configuredValue.startsWith("base64:") ||
    configuredValue.startsWith("base64url:")
  ) {
    const prefix = configuredValue.startsWith("base64:")
      ? "base64:"
      : "base64url:";
    const payload = configuredValue.slice(prefix.length)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
    if (!payload || !/^[A-Za-z0-9_-]+$/u.test(payload)) {
      throw new Error(`${OAUTH_KEY_ENV} has invalid encoding`);
    }
    key = Buffer.from(payload, "base64url");
  } else {
    key = Buffer.from(configuredValue, "utf8");
  }
  if (key.byteLength !== 32) {
    throw new Error(`${OAUTH_KEY_ENV} must contain exactly 32 bytes`);
  }
  return key;
}

function encryptTombstone(key, iv = randomBytes(12)) {
  if (!Buffer.isBuffer(iv) || iv.byteLength !== 12) {
    throw new Error("OAuth tombstone IV must contain exactly 12 bytes");
  }
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(OAUTH_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(TOMBSTONE_PLAINTEXT, "utf8"),
    cipher.final(),
  ]);
  const envelope = [
    "oauth",
    "v1",
    iv.toString("base64url"),
    Buffer.concat([ciphertext, cipher.getAuthTag()]).toString("base64url"),
  ].join(":");
  if (!STRICT_ENVELOPE_PATTERN.test(envelope)) {
    throw new Error(
      "generated OAuth tombstone does not match the strict envelope",
    );
  }
  return envelope;
}

function deriveTombstoneIv(key, contractSha256) {
  if (!SHA256_PATTERN.test(contractSha256)) {
    throw new Error("invalid OAuth-reset confirmation contract digest");
  }
  return createHmac("sha256", key)
    .update(`mind-manual/oauth-reset/tombstone-iv/v1:${contractSha256}`)
    .digest()
    .subarray(0, 12);
}

function decryptTombstone(envelope, key) {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== "oauth" || parts[1] !== "v1") {
    throw new Error("invalid test tombstone envelope");
  }
  const iv = Buffer.from(parts[2], "base64url");
  const sealed = Buffer.from(parts[3], "base64url");
  const ciphertext = sealed.subarray(0, -16);
  const tag = sealed.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(OAUTH_AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function sourceRelationMap(sourceReceipt) {
  if (!Array.isArray(sourceReceipt.publicData)) {
    throw new Error("source receipt has no public-data inventory");
  }
  const entries = new Map();
  for (const row of sourceReceipt.publicData) {
    if (typeof row?.relation !== "string" || entries.has(row.relation)) {
      throw new Error(
        "source receipt has duplicate or invalid public-data rows",
      );
    }
    entries.set(row.relation, row);
  }
  return entries;
}

export function validateMigrationReceipts(
  source,
  imported,
  sourceReceiptSha256,
  targetRef,
) {
  const binding = validateSubjectScopeBinding(source.subjectScope);
  validateSubjectScopeBinding(imported.subjectScope);
  if (
    binding.sourceProjectRef !== SOURCE_PROJECT_REF ||
    binding.targetProjectRef !== targetRef ||
    canonicalJson(imported.subjectScope) !== canonicalJson(binding) ||
    source.auth?.userCount !== binding.subjectCount ||
    source.auth?.subjectIdsSha256 !== binding.subjectIdsSha256
  ) {
    throw new Error("OAuth reset requires one exact selected-subject scope");
  }
  if (
    source.version !== 1 ||
    source.kind !== "source" ||
    source.projectRef !== SOURCE_PROJECT_REF ||
    source.status !== "ready" ||
    !Array.isArray(source.blockers) ||
    source.blockers.length !== 0 ||
    imported.version !== 1 ||
    imported.status !== "verified_pending_storage_and_provider_rebind" ||
    imported.sourceProjectRef !== SOURCE_PROJECT_REF ||
    imported.targetProjectRef !== targetRef ||
    imported.sourceReceiptSha256 !== sourceReceiptSha256 ||
    !SHA256_PATTERN.test(imported.authDecisionSha256 ?? "") ||
    imported.authSessionsCopied !== false ||
    imported.refreshTokensCopied !== false ||
    imported.sourceMutated !== false ||
    !SHA256_PATTERN.test(imported.packageManifestSha256 ?? "") ||
    !SHA256_PATTERN.test(imported.targetPostImportReceiptSha256 ?? "") ||
    source.manifests?.dataScopesSha256 !== sha256File(DATA_SCOPES_PATH)
  ) {
    throw new Error(
      "source and import receipts do not describe one verified isolation import",
    );
  }

  const sourceRelations = sourceRelationMap(source);
  const importedRelations = new Map();
  for (const row of imported.copiedRelations ?? []) {
    if (
      typeof row?.logicalName !== "string" ||
      importedRelations.has(row.logicalName) ||
      !Number.isSafeInteger(row.rowCount) ||
      row.rowCount < 0 ||
      !SHA256_PATTERN.test(row.fileSha256 ?? "")
    ) {
      throw new Error("import receipt has invalid copied-relation metadata");
    }
    importedRelations.set(row.logicalName, row);
  }

  const expected = new Map();
  for (const relation of RECEIPT_BOUND_RELATIONS) {
    const sourceRow = sourceRelations.get(relation);
    const importedRow = importedRelations.get(`public.${relation}`);
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
      throw new Error(`receipt-bound relation mismatch: ${relation}`);
    }
    expected.set(relation, {
      rowCount: sourceRow.copyRowCount,
      rowsSha256: sourceRow.copyRowsSha256,
    });
  }

  for (const relation of ZERO_STATE_RELATIONS) {
    if (expected.get(relation).rowCount !== 0) {
      throw new Error(
        `${relation} is not empty and needs a separate credential disposition`,
      );
    }
  }
  const oauthTokenCount = expected.get("oauth_tokens").rowCount;
  if (
    oauthTokenCount < 1 ||
    expected.get("calendar_accounts").rowCount !== oauthTokenCount
  ) {
    throw new Error(
      "the reviewed reset requires one Calendar account for every OAuth token",
    );
  }
  return expected;
}

function rowDigestExpression(valueExpression) {
  return `encode(extensions.digest(convert_to(COALESCE(string_agg(${valueExpression}, E'\\n' ORDER BY ${valueExpression}), ''), 'UTF8'), 'sha256'), 'hex')`;
}

// The target must contain ONLY the approved subjects. Matching an old import
// receipt is insufficient: a new signup or an unowned durable row must fail
// before a target-wide credential operation can touch it. No raw IDs enter SQL.
export function targetSubjectScopeGuardSql(binding, { lock = false } = {}) {
  validateSubjectScopeBinding(binding);
  if (
    binding.sourceProjectRef !== SOURCE_PROJECT_REF ||
    binding.targetProjectRef === SOURCE_PROJECT_REF
  ) {
    throw new Error("target scope guard requires the isolated target scope");
  }
  const scopes = readTsvManifest(
    "supabase/isolation/mind-manual-data-scopes.tsv",
    3,
  );
  const tables = [
    "auth.identities",
    "auth.users",
    ...scopes.map(([relation]) => `public.${quoteIdentifier(relation)}`),
  ];
  const ownershipChecks = [
    ["auth", "identities", "user_id"],
    ...scopes.map(([relation, owner]) => ["public", relation, owner]),
  ]
    .map(([schema, relation, owner]) => `
  IF EXISTS (SELECT 1 FROM ${schema}.${quoteIdentifier(relation)} AS owned
             WHERE NOT EXISTS (SELECT 1 FROM auth.users AS approved WHERE approved.id = owned.${
      quoteIdentifier(owner)
    })) THEN
    RAISE EXCEPTION 'Target contains rows outside the approved subject scope' USING ERRCODE = '55000';
  END IF;`).join("\n");
  return `${
    lock ? `LOCK TABLE ${tables.join(", ")} IN SHARE ROW EXCLUSIVE MODE;\n` : ""
  }
DO $subject_scope$
BEGIN
  IF (SELECT count(*) FROM auth.users) <> ${binding.subjectCount}
     OR (SELECT ${rowDigestExpression("id::text")} FROM auth.users) <> ${
    quoteLiteral(binding.subjectIdsSha256)
  } THEN
    RAISE EXCEPTION 'Target Auth subjects differ from the approved scope' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation
             JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
             WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
               AND relation.relname <> ALL (ARRAY[${
    scopes.map(([relation]) => quoteLiteral(relation)).join(", ")
  }]::text[])) THEN
    RAISE EXCEPTION 'Target contains unapproved public relations' USING ERRCODE = '55000';
  END IF;
  ${ownershipChecks}
END
$subject_scope$;
`;
}

export function guardTargetMutationSql(template, binding) {
  if (
    (template.match(/^BEGIN;$/gmu) ?? []).length !== 1 ||
    (template.match(/^COMMIT;$/gmu) ?? []).length !== 1
  ) {
    throw new Error(
      "target mutation template must have one explicit transaction",
    );
  }
  return template.replace(
    /^BEGIN;$/mu,
    `BEGIN;\nSET ROLE postgres;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n${
      targetSubjectScopeGuardSql(binding, { lock: true })
    }`,
  )
    .replace(/^COMMIT;$/mu, `${targetSubjectScopeGuardSql(binding)}\nCOMMIT;`);
}

export function inventorySql(expectedTombstone = null, binding) {
  const relationInventory = RECEIPT_BOUND_RELATIONS.map((relation) => {
    const table = quoteIdentifier(relation);
    return `
      SELECT
        ${quoteLiteral(relation)}::text AS relation,
        count(*)::bigint AS row_count,
        ${rowDigestExpression("row_json")} AS rows_sha256
      FROM (
        SELECT to_jsonb(source_row)::text AS row_json
        FROM public.${table} AS source_row
      ) AS rows`;
  }).join("\nUNION ALL\n");
  const tombstoneCount = expectedTombstone
    ? `(SELECT count(*) FROM public.oauth_tokens WHERE access_token = ${
      quoteLiteral(expectedTombstone)
    })`
    : "0";

  return `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET ROLE postgres;
${targetSubjectScopeGuardSql(binding)}
SELECT json_build_object(
  'relations', (
    SELECT json_agg(json_build_object(
      'relation', relation,
      'rowCount', row_count,
      'rowsSha256', rows_sha256
    ) ORDER BY relation)
    FROM (${relationInventory}) relation_inventory
  ),
  'oauth', json_build_object(
    'tokenCount', (SELECT count(*) FROM public.oauth_tokens),
    'canonicalCalendarTokenCount', (
      SELECT count(*) FROM public.oauth_tokens
      WHERE provider = 'google' AND service_type = 'calendar'
        AND provider_account_id IS NOT NULL
    ),
    'strictAccessEnvelopeCount', (
      SELECT count(*) FROM public.oauth_tokens
      WHERE access_token ~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
    ),
    'nonNullRefreshCount', (
      SELECT count(*) FROM public.oauth_tokens WHERE refresh_token IS NOT NULL
    ),
    'strictRefreshEnvelopeCount', (
      SELECT count(*) FROM public.oauth_tokens
      WHERE refresh_token ~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
    ),
    'expiredTokenCount', (
      SELECT count(*) FROM public.oauth_tokens
      WHERE token_expires_at IS NOT NULL AND token_expires_at < statement_timestamp()
    ),
    'tombstoneMatchCount', ${tombstoneCount}
  ),
  'calendar', json_build_object(
    'accountCount', (SELECT count(*) FROM public.calendar_accounts),
    'primaryCalendarIdCount', (
      SELECT count(*) FROM public.calendar_accounts
      WHERE calendar_id = 'primary'
    ),
    'eventCount', (SELECT count(*) FROM public.calendar_events),
    'syncDisabledCount', (
      SELECT count(*) FROM public.calendar_accounts WHERE NOT sync_enabled
    ),
    'syncStateClearedCount', (
      SELECT count(*) FROM public.calendar_accounts
      WHERE last_sync_at IS NULL AND sync_token IS NULL
        AND next_sync_token IS NULL AND sync_status = 'idle'
        AND last_sync_error IS NULL AND sync_cursor IS NULL
        AND last_full_sync_at IS NULL AND sync_page_token IS NULL
    ),
    'watchStateClearedCount', (
      SELECT count(*) FROM public.calendar_accounts
      WHERE watch_channel_id IS NULL AND watch_resource_id IS NULL
        AND watch_expires_at IS NULL AND watch_status = 'inactive'
    )
  ),
  'relationships', json_build_object(
    'nonCalendarTokenCount', (
      SELECT count(*) FROM public.oauth_tokens
      WHERE provider <> 'google' OR service_type <> 'calendar'
        OR provider_account_id IS NULL
    ),
    'tokenLinkMismatchCount', (
      SELECT count(*) FROM (
        SELECT token.id
        FROM public.oauth_tokens AS token
        LEFT JOIN public.calendar_accounts AS account
          ON account.oauth_token_id = token.id
        GROUP BY token.id
        HAVING count(account.id) <> 1
      ) mismatches
    ),
    'accountOwnershipMismatchCount', (
      SELECT count(*)
      FROM public.calendar_accounts AS account
      JOIN public.oauth_tokens AS token ON token.id = account.oauth_token_id
      WHERE account.user_id <> token.user_id OR account.provider <> 'google'
    ),
    'eventOwnershipMismatchCount', (
      SELECT count(*)
      FROM public.calendar_events AS event
      LEFT JOIN public.calendar_accounts AS account
        ON account.id = event.calendar_account_id
      WHERE account.id IS NULL
         OR event.user_id IS DISTINCT FROM account.user_id
    )
  ),
  'preservation', json_build_object(
    'oauthTokenMetadataSha256', (
      SELECT ${
    rowDigestExpression(
      "jsonb_build_object('id', id, 'user_id', user_id, 'provider', provider, 'service_type', service_type, 'provider_account_id', provider_account_id, 'account_email', account_email, 'scope', scope, 'created_at', created_at)::text",
    )
  }
      FROM public.oauth_tokens
    ),
    'oauthIdentityLinkageSha256', (
      SELECT ${
    rowDigestExpression(
      "jsonb_build_object('id', id, 'user_id', user_id, 'provider', provider, 'service_type', service_type, 'provider_account_id', provider_account_id)::text",
    )
  }
      FROM public.oauth_tokens
    ),
    'calendarAccountMetadataSha256', (
      SELECT ${
    rowDigestExpression(
      "jsonb_build_object('id', id, 'user_id', user_id, 'oauth_token_id', oauth_token_id, 'provider', provider, 'account_name', account_name, 'account_email', account_email, 'calendar_id', calendar_id, 'calendar_name', calendar_name, 'is_primary', is_primary, 'bounded_sync_window_days', bounded_sync_window_days, 'created_at', created_at)::text",
    )
  }
      FROM public.calendar_accounts
    ),
    'calendarIdentityLinkageSha256', (
      SELECT ${
    rowDigestExpression(
      "jsonb_build_object('id', id, 'user_id', user_id, 'oauth_token_id', oauth_token_id, 'provider', provider, 'calendar_id', calendar_id)::text",
    )
  }
      FROM public.calendar_accounts
    ),
    'calendarEventsSha256', (
      SELECT ${rowDigestExpression("to_jsonb(source_row)::text")}
      FROM public.calendar_events AS source_row
    )
  )
)::text;
COMMIT;
`;
}

function inventoryRelationMap(inventory) {
  const result = new Map();
  for (const row of inventory.relations ?? []) {
    if (
      typeof row?.relation !== "string" ||
      result.has(row.relation) ||
      !Number.isSafeInteger(row.rowCount) ||
      row.rowCount < 0 ||
      !SHA256_PATTERN.test(row.rowsSha256 ?? "")
    ) {
      throw new Error("target inventory has invalid relation metadata");
    }
    result.set(row.relation, row);
  }
  if (result.size !== RECEIPT_BOUND_RELATIONS.length) {
    throw new Error(
      "target inventory relation set does not match the contract",
    );
  }
  return result;
}

function hasExactFields(value, fields, predicate) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) =>
      Object.hasOwn(value, field) && predicate(value[field])
    );
}

function relationshipsAreClear(value) {
  return hasExactFields(value, RELATIONSHIP_FIELDS, (count) => count === 0);
}

function preservationIsHashed(value) {
  return hasExactFields(
    value,
    PRESERVATION_FIELDS,
    (digest) => SHA256_PATTERN.test(digest ?? ""),
  );
}

function validateBeforeInventory(inventory, expected) {
  const actual = inventoryRelationMap(inventory);
  for (const relation of RECEIPT_BOUND_RELATIONS) {
    const actualRow = actual.get(relation);
    const expectedRow = expected.get(relation);
    if (
      !actualRow ||
      actualRow.rowCount !== expectedRow.rowCount ||
      actualRow.rowsSha256 !== expectedRow.rowsSha256
    ) {
      throw new Error(`target drift before OAuth reset: ${relation}`);
    }
  }
  const tokenCount = expected.get("oauth_tokens").rowCount;
  if (
    inventory.oauth?.tokenCount !== tokenCount ||
    inventory.oauth?.canonicalCalendarTokenCount !== tokenCount ||
    inventory.oauth?.strictAccessEnvelopeCount !== tokenCount ||
    inventory.oauth?.strictRefreshEnvelopeCount !==
      inventory.oauth?.nonNullRefreshCount ||
    inventory.calendar?.accountCount !==
      expected.get("calendar_accounts").rowCount ||
    inventory.calendar?.primaryCalendarIdCount !==
      expected.get("calendar_accounts").rowCount ||
    inventory.calendar?.eventCount !==
      expected.get("calendar_events").rowCount ||
    !relationshipsAreClear(inventory.relationships) ||
    !preservationIsHashed(inventory.preservation)
  ) {
    throw new Error(
      "target OAuth relationships do not match the reset contract",
    );
  }
}

function validateAfterInventory(after, before, expected) {
  const actual = inventoryRelationMap(after);
  for (const relation of RECEIPT_BOUND_RELATIONS) {
    const actualRow = actual.get(relation);
    if (!actualRow || actualRow.rowCount !== expected.get(relation).rowCount) {
      throw new Error(
        `target row count changed during OAuth reset: ${relation}`,
      );
    }
  }
  for (const relation of PRESERVED_RELATIONS) {
    if (actual.get(relation).rowsSha256 !== expected.get(relation).rowsSha256) {
      throw new Error(
        `preserved target data changed during OAuth reset: ${relation}`,
      );
    }
  }
  const tokenCount = expected.get("oauth_tokens").rowCount;
  const accountCount = expected.get("calendar_accounts").rowCount;
  if (
    after.oauth?.tokenCount !== tokenCount ||
    after.oauth?.canonicalCalendarTokenCount !== tokenCount ||
    after.oauth?.strictAccessEnvelopeCount !== tokenCount ||
    after.oauth?.nonNullRefreshCount !== 0 ||
    after.oauth?.strictRefreshEnvelopeCount !== 0 ||
    after.oauth?.expiredTokenCount !== tokenCount ||
    after.oauth?.tombstoneMatchCount !== tokenCount ||
    after.calendar?.accountCount !== accountCount ||
    after.calendar?.primaryCalendarIdCount !== accountCount ||
    after.calendar?.syncDisabledCount !== accountCount ||
    after.calendar?.syncStateClearedCount !== accountCount ||
    after.calendar?.watchStateClearedCount !== accountCount ||
    !relationshipsAreClear(after.relationships) ||
    !preservationIsHashed(after.preservation) ||
    !preservationIsHashed(before.preservation) ||
    canonicalJson(after.preservation) !== canonicalJson(before.preservation)
  ) {
    throw new Error(
      "target OAuth reset verification failed; keep the target quarantined",
    );
  }
}

export function renderResetSql(template, expected, tombstone, binding) {
  const replacements = new Map([
    [
      "@@EXPECTED_OAUTH_TOKEN_COUNT@@",
      String(expected.get("oauth_tokens").rowCount),
    ],
    [
      "@@EXPECTED_CALENDAR_ACCOUNT_COUNT@@",
      String(expected.get("calendar_accounts").rowCount),
    ],
    [
      "@@EXPECTED_CALENDAR_EVENT_COUNT@@",
      String(expected.get("calendar_events").rowCount),
    ],
    [
      "@@EXPECTED_OAUTH_TOKEN_DIGEST@@",
      quoteLiteral(expected.get("oauth_tokens").rowsSha256),
    ],
    [
      "@@EXPECTED_CALENDAR_ACCOUNT_DIGEST@@",
      quoteLiteral(expected.get("calendar_accounts").rowsSha256),
    ],
    [
      "@@EXPECTED_CALENDAR_EVENT_DIGEST@@",
      quoteLiteral(expected.get("calendar_events").rowsSha256),
    ],
    ["@@OAUTH_TOMBSTONE@@", quoteLiteral(tombstone)],
  ]);
  let rendered = template;
  for (const [token, value] of replacements) {
    rendered = rendered.replaceAll(token, value);
  }
  if (/@@[A-Z0-9_]+@@/u.test(rendered)) {
    throw new Error("OAuth reset SQL template contains an unresolved token");
  }
  return guardTargetMutationSql(rendered, binding);
}

function confirmationContract(
  targetRef,
  sourceReceiptSha256,
  importReceiptSha256,
  expected,
  targetOauthKeyFingerprintSha256,
  subjectScope,
) {
  if (!SHA256_PATTERN.test(targetOauthKeyFingerprintSha256)) {
    throw new Error("target OAuth key fingerprint is invalid");
  }
  return {
    version: 1,
    action: "reset-isolated-supabase-oauth-credentials",
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    subjectScope: validateSubjectScopeBinding(subjectScope),
    sourceReceiptSha256,
    importReceiptSha256,
    resetSqlSha256: sha256File(RESET_SQL_PATH),
    oauthCryptoContractSha256: sha256File(OAUTH_CRYPTO_PATH),
    targetOauthKeyFingerprintSha256,
    expectedRelations: Object.fromEntries(
      [...expected.entries()].map(([relation, row]) => [relation, row]),
    ),
  };
}

function acquireTargetRunLock(targetRef, contractSha256) {
  const lockPath = resolve(
    tmpdir(),
    `mind-manual-oauth-reset-${targetRef}.lock`,
  );
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    writeFileSync(
      descriptor,
      `${
        canonicalJson({
          version: 1,
          action: "reset-isolated-supabase-oauth-credentials",
          targetProjectRef: targetRef,
          confirmationContractSha256: contractSha256,
        })
      }\n`,
    );
    fsyncSync(descriptor);
    chmodSync(lockPath, 0o600);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      try {
        unlinkSync(lockPath);
      } catch {
        // Preserve the original setup error.
      }
    }
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(
        `another OAuth reset or recovery holds the target lock: ${lockPath}; inspect that exact mode-0600 file before removing a stale lock`,
      );
    }
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(descriptor);
    unlinkSync(lockPath);
  };
}

function expectedRelationCounts(expected) {
  return Object.fromEntries(
    RECEIPT_BOUND_RELATIONS.map((relation) => [
      relation,
      expected.get(relation).rowCount,
    ]),
  );
}

function preparedResetReceipt({
  targetRef,
  sourceReceiptSha256,
  importReceiptSha256,
  contract,
  contractSha256,
  expected,
  before,
  tombstone,
}) {
  return {
    version: 1,
    status: "prepared_oauth_reset_not_verified",
    preparedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    subjectScope: contract.subjectScope,
    sourceReceiptSha256,
    importReceiptSha256,
    confirmationContractSha256: contractSha256,
    resetSqlSha256: contract.resetSqlSha256,
    oauthCryptoContractSha256: contract.oauthCryptoContractSha256,
    targetOauthKeyFingerprintSha256: contract.targetOauthKeyFingerprintSha256,
    before: {
      relationCounts: expectedRelationCounts(expected),
      preservation: before.preservation,
    },
    intendedTombstoneEnvelopeSha256: sha256(tombstone),
    expectedGoogleReconnectCount: expected.get("oauth_tokens").rowCount,
    expectedPrimaryCalendarAccountCount:
      expected.get("calendar_accounts").rowCount,
    requiresGoogleReauthorization: true,
    secretValuesIncluded: false,
    rowIdsIncluded: false,
    sourceMutated: false,
  };
}

function validatePreparedResetReceipt(
  prepared,
  {
    targetRef,
    sourceReceiptSha256,
    importReceiptSha256,
    contract,
    contractSha256,
    expected,
    tombstone,
  },
) {
  if (
    prepared.version !== 1 ||
    prepared.status !== "prepared_oauth_reset_not_verified" ||
    prepared.sourceProjectRef !== SOURCE_PROJECT_REF ||
    prepared.targetProjectRef !== targetRef ||
    canonicalJson(prepared.subjectScope) !==
      canonicalJson(contract.subjectScope) ||
    prepared.sourceReceiptSha256 !== sourceReceiptSha256 ||
    prepared.importReceiptSha256 !== importReceiptSha256 ||
    prepared.confirmationContractSha256 !== contractSha256 ||
    prepared.resetSqlSha256 !== contract.resetSqlSha256 ||
    prepared.oauthCryptoContractSha256 !==
      contract.oauthCryptoContractSha256 ||
    prepared.targetOauthKeyFingerprintSha256 !==
      contract.targetOauthKeyFingerprintSha256 ||
    canonicalJson(prepared.before?.relationCounts) !==
      canonicalJson(expectedRelationCounts(expected)) ||
    !preservationIsHashed(prepared.before?.preservation) ||
    prepared.intendedTombstoneEnvelopeSha256 !== sha256(tombstone) ||
    prepared.expectedGoogleReconnectCount !==
      expected.get("oauth_tokens").rowCount ||
    prepared.expectedPrimaryCalendarAccountCount !==
      expected.get("calendar_accounts").rowCount ||
    prepared.requiresGoogleReauthorization !== true ||
    prepared.secretValuesIncluded !== false ||
    prepared.rowIdsIncluded !== false ||
    prepared.sourceMutated !== false
  ) {
    throw new Error(
      "prepared OAuth-reset receipt does not match this target, key, or migration contract",
    );
  }
}

function finalResetReceipt({
  prepared,
  preparedIntentSha256,
  after,
  recovered,
}) {
  return {
    version: 1,
    status: "oauth_credentials_reset_pending_google_reauthorization",
    verifiedAt: new Date().toISOString(),
    recoveredFromPreparedIntent: recovered,
    preparedIntentSha256,
    sourceProjectRef: prepared.sourceProjectRef,
    targetProjectRef: prepared.targetProjectRef,
    subjectScope: prepared.subjectScope,
    sourceReceiptSha256: prepared.sourceReceiptSha256,
    importReceiptSha256: prepared.importReceiptSha256,
    confirmationContractSha256: prepared.confirmationContractSha256,
    resetSqlSha256: prepared.resetSqlSha256,
    oauthCryptoContractSha256: prepared.oauthCryptoContractSha256,
    targetOauthKeyFingerprintSha256: prepared.targetOauthKeyFingerprintSha256,
    before: prepared.before,
    after: {
      oauthTokenCount: after.oauth.tokenCount,
      expiredTokenCount: after.oauth.expiredTokenCount,
      nulledRefreshTokenCount: after.oauth.tokenCount -
        after.oauth.nonNullRefreshCount,
      disabledCalendarAccountCount: after.calendar.syncDisabledCount,
      primaryCalendarAccountCount: after.calendar.primaryCalendarIdCount,
      preservedCalendarEventCount: after.calendar.eventCount,
      preservation: after.preservation,
      tombstoneEnvelopeSha256: prepared.intendedTombstoneEnvelopeSha256,
    },
    expectedGoogleReconnectCount: prepared.expectedGoogleReconnectCount,
    expectedPrimaryCalendarAccountCount:
      prepared.expectedPrimaryCalendarAccountCount,
    requiresGoogleReauthorization: true,
    secretValuesIncluded: false,
    rowIdsIncluded: false,
    sourceMutated: false,
  };
}

function selfTest() {
  const key = Buffer.alloc(32, 7);
  const base64Key = `base64:${key.toString("base64")}`;
  const base64UrlKey = `base64url:${key.toString("base64url")}`;
  assert.deepEqual(decodeEncryptionKey(base64Key), key);
  assert.deepEqual(decodeEncryptionKey(base64UrlKey), key);
  assert.throws(() => decodeEncryptionKey("too-short"), /exactly 32 bytes/u);

  const first = encryptTombstone(key);
  const second = encryptTombstone(key);
  assert.match(first, STRICT_ENVELOPE_PATTERN);
  assert.notEqual(first, second);
  assert.equal(decryptTombstone(first, key), TOMBSTONE_PLAINTEXT);
  const deterministicIv = deriveTombstoneIv(key, "f".repeat(64));
  const deterministicFirst = encryptTombstone(key, deterministicIv);
  const deterministicSecond = encryptTombstone(
    key,
    deriveTombstoneIv(key, "f".repeat(64)),
  );
  const differentContract = encryptTombstone(
    key,
    deriveTombstoneIv(key, "e".repeat(64)),
  );
  assert.equal(deterministicFirst, deterministicSecond);
  assert.notEqual(deterministicFirst, differentContract);

  const digest = "a".repeat(64);
  const targetRef = "abcdefghijklmnopqrst";
  const subjectScope = {
    version: 1,
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    scopeSha256: "1".repeat(64),
    subjectIdsSha256: "2".repeat(64),
    subjectCount: 2,
    legacyAssignmentsSha256: "3".repeat(64),
    rawSubjectIdsIncluded: false,
  };
  const source = {
    version: 1,
    kind: "source",
    projectRef: SOURCE_PROJECT_REF,
    status: "ready",
    blockers: [],
    subjectScope,
    auth: { userCount: 2, subjectIdsSha256: subjectScope.subjectIdsSha256 },
    manifests: { dataScopesSha256: sha256File(DATA_SCOPES_PATH) },
    publicData: RECEIPT_BOUND_RELATIONS.map((relation) => ({
      relation,
      copyMode: relation === "oauth_state" ? "skip_transient" : "copy",
      totalRowCount:
        relation === "oauth_tokens" || relation === "calendar_accounts"
          ? 2
          : relation === "calendar_events"
          ? 40
          : 0,
      copyRowCount:
        relation === "oauth_tokens" || relation === "calendar_accounts"
          ? 2
          : relation === "calendar_events"
          ? 40
          : 0,
      copyRowsSha256: digest,
    })),
  };
  const sourceHash = "b".repeat(64);
  const imported = {
    version: 1,
    status: "verified_pending_storage_and_provider_rebind",
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    subjectScope,
    sourceReceiptSha256: sourceHash,
    authDecisionSha256: "9".repeat(64),
    packageManifestSha256: "c".repeat(64),
    targetPostImportReceiptSha256: "d".repeat(64),
    authSessionsCopied: false,
    refreshTokensCopied: false,
    sourceMutated: false,
    copiedRelations: RECEIPT_BOUND_RELATIONS.map((relation) => ({
      logicalName: `public.${relation}`,
      rowCount: relation === "oauth_tokens" || relation === "calendar_accounts"
        ? 2
        : relation === "calendar_events"
        ? 40
        : 0,
      fileSha256: "e".repeat(64),
    })),
  };
  const expected = validateMigrationReceipts(
    source,
    imported,
    sourceHash,
    targetRef,
  );
  const testContract = confirmationContract(
    targetRef,
    sourceHash,
    "8".repeat(64),
    expected,
    sha256(key),
    subjectScope,
  );
  const testContractSha256 = sha256(canonicalJson(testContract));
  const recoveryTombstone = encryptTombstone(
    key,
    deriveTombstoneIv(key, testContractSha256),
  );
  const testPreservation = {
    oauthTokenMetadataSha256: "1".repeat(64),
    oauthIdentityLinkageSha256: "2".repeat(64),
    calendarAccountMetadataSha256: "3".repeat(64),
    calendarIdentityLinkageSha256: "4".repeat(64),
    calendarEventsSha256: "5".repeat(64),
  };
  const prepared = preparedResetReceipt({
    targetRef,
    sourceReceiptSha256: sourceHash,
    importReceiptSha256: "8".repeat(64),
    contract: testContract,
    contractSha256: testContractSha256,
    expected,
    before: { preservation: testPreservation },
    tombstone: recoveryTombstone,
  });
  validatePreparedResetReceipt(prepared, {
    targetRef,
    sourceReceiptSha256: sourceHash,
    importReceiptSha256: "8".repeat(64),
    contract: testContract,
    contractSha256: testContractSha256,
    expected,
    tombstone: recoveryTombstone,
  });
  assert.throws(
    () =>
      validatePreparedResetReceipt(
        { ...prepared, intendedTombstoneEnvelopeSha256: "0".repeat(64) },
        {
          targetRef,
          sourceReceiptSha256: sourceHash,
          importReceiptSha256: "8".repeat(64),
          contract: testContract,
          contractSha256: testContractSha256,
          expected,
          tombstone: recoveryTombstone,
        },
      ),
    /does not match/u,
  );
  for (
    const subjectScope of [undefined, {
      ...prepared.subjectScope,
      scopeSha256: "0".repeat(64),
    }]
  ) {
    assert.throws(
      () =>
        validatePreparedResetReceipt({ ...prepared, subjectScope }, {
          targetRef,
          sourceReceiptSha256: sourceHash,
          importReceiptSha256: "8".repeat(64),
          contract: testContract,
          contractSha256: testContractSha256,
          expected,
          tombstone: recoveryTombstone,
        }),
      /does not match/u,
    );
  }
  const template = readFileSync(RESET_SQL_PATH, "utf8");
  const rendered = renderResetSql(template, expected, first, subjectScope);
  assert.doesNotMatch(rendered, /@@[A-Z0-9_]+@@/u);
  assert.doesNotMatch(rendered, new RegExp(TOMBSTONE_PLAINTEXT, "u"));
  assert.ok(rendered.includes(first));
  const drifted = structuredClone(source);
  drifted.publicData.find(({ relation }) => relation === "oauth_tokens")
    .copyRowCount = 3;
  assert.throws(
    () => validateMigrationReceipts(drifted, imported, sourceHash, targetRef),
    /receipt-bound relation mismatch/u,
  );
  console.log("OAuth credential reset self-test passed");
}

async function main() {
  if (process.argv.slice(2).includes("--self-test")) {
    selfTest();
    return;
  }
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
    "source-receipt": { required: true },
    "import-receipt": { required: true },
    "target-ref": { required: true },
    receipt: { required: true },
    recover: { type: "boolean" },
    execute: { type: "boolean" },
    confirmation: {},
  });
  const targetRef = assertProjectRef(args["target-ref"], "target project ref");
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error(
      "refusing to reset OAuth credentials on the source project",
    );
  }
  if (process.env[FRESH_KEY_CONFIRMATION_ENV] !== "yes") {
    throw new Error(
      `set ${FRESH_KEY_CONFIRMATION_ENV}=yes only after provisioning a newly generated target-only key`,
    );
  }
  const sourceSnapshot = readReceiptSnapshot(
    args["source-receipt"],
    "source receipt",
  );
  const importSnapshot = readReceiptSnapshot(
    args["import-receipt"],
    "import receipt",
  );
  const source = sourceSnapshot.value;
  const imported = importSnapshot.value;
  const sourceReceiptSha256 = sourceSnapshot.sha256;
  const importReceiptSha256 = importSnapshot.sha256;
  const expected = validateMigrationReceipts(
    source,
    imported,
    sourceReceiptSha256,
    targetRef,
  );
  const receiptPath = assertAbsolutePath(args.receipt, "reset receipt");
  if (!args.recover && existsSync(receiptPath)) {
    throw new Error(`refusing to overwrite existing output: ${receiptPath}`);
  }
  const targetDatabasePassword = consumeTargetDatabasePassword();
  let configuredKey = process.env[OAUTH_KEY_ENV];
  delete process.env[OAUTH_KEY_ENV];
  let tombstone;
  let key;
  let targetOauthKeyFingerprintSha256;
  let contract;
  let contractSha256;
  let confirmation;
  try {
    key = decodeEncryptionKey(configuredKey);
    configuredKey = undefined;
    targetOauthKeyFingerprintSha256 = sha256(key);
    contract = confirmationContract(
      targetRef,
      sourceReceiptSha256,
      importReceiptSha256,
      expected,
      targetOauthKeyFingerprintSha256,
      source.subjectScope,
    );
    contractSha256 = sha256(canonicalJson(contract));
    confirmation = `RESET-OAUTH:${targetRef}:${contractSha256.slice(0, 12)}`;
    tombstone = encryptTombstone(
      key,
      deriveTombstoneIv(key, contractSha256),
    );
  } finally {
    configuredKey = undefined;
    key?.fill(0);
  }

  const releaseTargetRunLock = acquireTargetRunLock(targetRef, contractSha256);
  try {
    let prepared;
    let preparedIntentSha256;
    if (args.recover) {
      if (!existsSync(receiptPath)) {
        throw new Error(
          "--recover requires the existing prepared reset receipt",
        );
      }
      const preparedSnapshot = readReceiptSnapshot(
        receiptPath,
        "prepared OAuth-reset receipt",
      );
      prepared = preparedSnapshot.value;
      validatePreparedResetReceipt(prepared, {
        targetRef,
        sourceReceiptSha256,
        importReceiptSha256,
        contract,
        contractSha256,
        expected,
        tombstone,
      });
      preparedIntentSha256 = preparedSnapshot.sha256;
    }

    const readOnlyDatabase = getLinkedDatabaseConfig(targetRef);
    const current = runPsqlJson(
      readOnlyDatabase,
      inventorySql(tombstone, source.subjectScope),
    );
    let targetState;
    try {
      validateBeforeInventory(current, expected);
      if (
        prepared &&
        canonicalJson(current.preservation) !==
          canonicalJson(prepared.before.preservation)
      ) {
        throw new Error("prepared preservation digest drift");
      }
      targetState = "pre_reset";
    } catch {
      if (!prepared) {
        throw new Error(
          "target is not in the exact receipt-bound pre-reset state",
        );
      }
      try {
        validateAfterInventory(
          current,
          { preservation: prepared.before.preservation },
          expected,
        );
        targetState = "post_reset";
      } catch {
        throw new Error(
          "prepared reset recovery found neither the exact pre-reset nor post-reset target state",
        );
      }
    }

    if (!args.execute) {
      console.log(
        args.recover
          ? `prepared target OAuth reset recovery ready (${targetState})`
          : "target OAuth credential reset dry-run ready",
      );
      console.log(`execute confirmation: ${confirmation}`);
      return;
    }
    if (args.confirmation !== confirmation) {
      throw new Error(
        `--execute requires exact --confirmation ${confirmation}`,
      );
    }

    if (!prepared) {
      prepared = preparedResetReceipt({
        targetRef,
        sourceReceiptSha256,
        importReceiptSha256,
        contract,
        contractSha256,
        expected,
        before: current,
        tombstone,
      });
      writePrivateJson(receiptPath, prepared);
      preparedIntentSha256 = sha256File(receiptPath);
    }

    let after = current;
    if (targetState === "pre_reset") {
      const database = getTargetAdminDatabaseConfig(
        targetRef,
        SOURCE_PROJECT_REF,
        targetDatabasePassword,
      );
      const template = readFileSync(RESET_SQL_PATH, "utf8");
      if (sha256(template) !== contract.resetSqlSha256) {
        throw new Error("OAuth-reset SQL changed after the confirmed contract");
      }
      const sql = renderResetSql(
        template,
        expected,
        tombstone,
        source.subjectScope,
      );
      runPsql(database, sql);
      after = runPsqlJson(
        database,
        inventorySql(tombstone, source.subjectScope),
      );
      validateAfterInventory(
        after,
        { preservation: prepared.before.preservation },
        expected,
      );
    }

    writePrivateJson(
      receiptPath,
      finalResetReceipt({
        prepared,
        preparedIntentSha256,
        after,
        recovered: Boolean(args.recover),
      }),
      { overwrite: true },
    );
    console.log(
      "target OAuth credentials reset and verified; Google reauthorization is required",
    );
    console.log(`receipt sha256: ${sha256File(receiptPath)}`);
  } finally {
    releaseTargetRunLock();
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

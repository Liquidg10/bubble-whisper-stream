import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('isolated Supabase OAuth credential reset', () => {
  const script = readRepoFile(
    'scripts/reset-isolated-supabase-oauth-credentials.mjs',
  );
  const sql = readRepoFile(
    'supabase/isolation/post-import-oauth-credential-reset.sql',
  );

  it('binds the dry-run and confirmation to verified migration receipts', () => {
    expect(script).toContain('sourceReceiptSha256');
    expect(script).toContain('importReceiptSha256');
    expect(script).toContain('sourceRow.copyRowsSha256');
    expect(script).toContain('imported.authSessionsCopied !== false');
    expect(script).toContain('imported.refreshTokensCopied !== false');
    expect(script).toContain('target drift before OAuth reset');
    expect(script).toContain('RESET-OAUTH:${targetRef}:${contractSha256.slice(0, 12)}');
    expect(script).toContain('refusing to reset OAuth credentials on the source project');
    expect(script).toContain('MIND_MANUAL_TARGET_OAUTH_KEY_IS_FRESH');
    expect(script).toContain('targetOauthKeyFingerprintSha256');
    expect(script).toContain('targetOauthKeyFingerprintSha256 = sha256(key)');
    expect(script).not.toContain('default-oauth-encryption-key');
  });

  it('uses the strict production AES-GCM envelope contract without exposing the key', () => {
    expect(script).toContain('bubble-whisper-stream/oauth-token/v1');
    expect(script).toContain('createCipheriv("aes-256-gcm", key, iv)');
    expect(script).toContain('randomBytes(12)');
    expect(script).toContain('cipher.getAuthTag()');
    expect(script).toContain('key.byteLength !== 32');
    expect(script).not.toMatch(/console\.log\([^\n]*(key|tombstone)/i);
  });

  it('asserts exact imported state before changing target credentials', () => {
    const firstUpdate = sql.indexOf('UPDATE public.oauth_tokens');
    expect(firstUpdate).toBeGreaterThan(-1);
    expect(sql.indexOf('@@EXPECTED_OAUTH_TOKEN_DIGEST@@')).toBeLessThan(firstUpdate);
    expect(sql.indexOf('@@EXPECTED_CALENDAR_ACCOUNT_DIGEST@@')).toBeLessThan(firstUpdate);
    expect(sql.indexOf('@@EXPECTED_CALENDAR_EVENT_DIGEST@@')).toBeLessThan(firstUpdate);
    expect(sql.indexOf('Generic OAuth accounts require')).toBeLessThan(firstUpdate);
    expect(sql.indexOf('Email, Gmail, or Plaid state requires')).toBeLessThan(firstUpdate);
    expect(sql.indexOf('Every imported OAuth token must back exactly one')).toBeLessThan(
      firstUpdate,
    );
    expect(sql.indexOf('LOCK TABLE')).toBeLessThan(firstUpdate);
    expect(sql).toContain('public.oauth_state');
    expect(sql.indexOf('UNION ALL SELECT 1 FROM public.oauth_state')).toBeLessThan(
      firstUpdate,
    );
  });

  it('preserves identities and events while forcing fail-closed reauthorization', () => {
    expect(sql).toContain('SET access_token = @@OAUTH_TOMBSTONE@@');
    expect(sql).toContain('refresh_token = NULL');
    expect(sql).toContain('token_expires_at = to_timestamp(0)');
    expect(sql).toContain('sync_enabled = false');
    expect(sql).toContain("watch_status = 'inactive'");
    expect(sql).toContain("sync_status = 'idle'");
    expect(sql).not.toContain('DELETE FROM public.oauth_tokens');
    expect(sql).not.toContain('DELETE FROM public.calendar_accounts');
    expect(sql).not.toContain('DELETE FROM public.calendar_events');
    expect(script).toContain('canonicalJson(after.preservation) !== canonicalJson(before.preservation)');
    expect(script).toContain('secretValuesIncluded: false');
    expect(script).toContain('rowIdsIncluded: false');
    expect(script).toContain('sourceMutated: false');
    expect(sql).toContain(
      'OAuth identity or account metadata changed during credential reset',
    );
    expect(sql).toContain(
      'Calendar identity or account metadata changed during quarantine',
    );
    expect(sql).toContain('Calendar events changed during OAuth credential reset');
    expect(sql).toContain(
      'Reviewed reset requires every Calendar account to retain calendar_id=primary',
    );
    expect(script).toContain("'primaryCalendarIdCount'");
  });

  it('leaves a private prepared intent and supports exact pre/post recovery', () => {
    expect(script).toContain('prepared_oauth_reset_not_verified');
    expect(script).toContain('preparedIntentSha256');
    expect(script).toContain('recoveredFromPreparedIntent');
    expect(script).toContain('deriveTombstoneIv(key, contractSha256)');
    expect(script).toContain('createHmac("sha256", key)');
    expect(script).toContain('args.recover');
    expect(script).toContain('targetState = "pre_reset"');
    expect(script).toContain('targetState = "post_reset"');
    expect(script).toContain('mind-manual-oauth-reset-${targetRef}.lock');
    expect(script).toContain('acquireTargetRunLock(targetRef, contractSha256)');
    expect(script.indexOf('const releaseTargetRunLock = acquireTargetRunLock')).toBeLessThan(
      script.indexOf('const readOnlyDatabase = getLinkedDatabaseConfig(targetRef)'),
    );
    expect(script.indexOf('writePrivateJson(receiptPath, prepared)')).toBeLessThan(
      script.indexOf('runPsql(database, sql)'),
    );
    const isolation = readRepoFile('scripts/lib/supabase-isolation.mjs');
    expect(isolation).toContain('fsyncSync(descriptor)');
    expect(isolation).toContain('linkSync(temporaryPath, path)');
  });

  it('keeps the target admin password out of read-only child processes', () => {
    const isolation = readRepoFile('scripts/lib/supabase-isolation.mjs');
    const importer = readRepoFile('scripts/import-isolated-supabase-data.mjs');
    const quarantine = readRepoFile(
      'scripts/quarantine-isolated-supabase-provider-state.mjs',
    );

    expect(isolation).toContain('MIND_MANUAL_TARGET_DB_PASSWORD');
    expect(isolation).toContain('delete process.env[TARGET_DB_PASSWORD_ENV]');
    expect(isolation).toContain('PGHOST: `db.${targetRef}.supabase.co`');
    expect(isolation).toContain('PGUSER: "postgres"');
    expect(isolation).toContain('secretValues: [database.PGPASSWORD]');
    for (const targetWriter of [script, importer, quarantine]) {
      expect(targetWriter).toContain('consumeTargetDatabasePassword()');
      expect(targetWriter).toContain('getTargetAdminDatabaseConfig(');
      expect(targetWriter.indexOf('consumeTargetDatabasePassword()')).toBeLessThan(
        targetWriter.indexOf('getLinkedDatabaseConfig(targetRef)'),
      );
    }
  });

  it('makes final cutover receipts depend on the reset and a real reconnect canary', () => {
    const rollback = readRepoFile(
      'scripts/prepare-isolated-supabase-rollback-receipt.mjs',
    );
    const canary = readRepoFile(
      'supabase/isolation/target-cutover-canary.example.json',
    );
    const quarantine = readRepoFile(
      'scripts/quarantine-isolated-supabase-provider-state.mjs',
    );

    expect(rollback).toContain('oauthResetReceiptSha256');
    expect(rollback).toContain('oauth_credentials_reset_pending_google_reauthorization');
    expect(rollback).toContain('calendarOAuthReauthorization');
    expect(canary).toContain('"oauthResetReceiptSha256"');
    expect(canary).toContain('"calendarOAuthReauthorization": true');
    expect(quarantine).toContain('"oauth-reset-receipt": { required: true }');
    expect(quarantine).toContain('oauthResetReceiptSha256');
    expect(rollback).toContain(
      'quarantine.oauthResetReceiptSha256 !== oauthResetReceiptSha256',
    );
    expect(rollback).toContain('expectedResetConfirmationSha256');
    expect(rollback).toContain('validateQuarantineReceipt');
    expect(rollback).toContain('QUARANTINE_INVENTORY_FIELDS.some');
    expect(rollback).toContain('expectedResetRelationCounts');
    expect(rollback).toContain('imported.authSessionsCopied !== false');
    expect(rollback).toContain('imported.refreshTokensCopied !== false');
  });

  it('reauthorizes the sole linked Calendar account without changing its identity', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260829060000_preserve_calendar_account_on_reauthorization.sql',
    );

    expect(migration).toContain('linked_calendar_account_count = 1');
    expect(migration).toContain('WHERE account.oauth_token_id = selected_token_id');
    expect(migration).toContain('WHERE id = selected_calendar_account_id');
    expect(migration).not.toContain("SET calendar_id = 'primary'");
    expect(migration).not.toContain('DELETE FROM public.calendar_accounts');
  });

  it('binds storage execution to a separate content plan and fresh verification', () => {
    const storage = readRepoFile('scripts/copy-isolated-supabase-storage.mjs');

    expect(storage).toContain('"plan-receipt": {}');
    expect(storage).toContain('"verify-only": { type: "boolean" }');
    expect(storage).toContain('planReceiptSha256.slice(0, 12)');
    expect(storage).toContain('sourcePlanProjection(comparisonReceipt.objects)');
    expect(storage).toContain('status: "verified_revalidation"');
    expect(storage).toContain('storageReceiptSha256: comparedStorageReceiptSha256');
    expect(storage).toContain('bucket,');
    expect(storage).toContain('`${left.bucket}\\0${left.targetPathSha256}`');
    expect(storage).not.toContain('overwrite: { type: "boolean" }');
  });

  it('requires action-time source/storage continuity and live evidence files', () => {
    const rollback = readRepoFile(
      'scripts/prepare-isolated-supabase-rollback-receipt.mjs',
    );
    const canary = readRepoFile(
      'supabase/isolation/target-cutover-canary.example.json',
    );

    expect(rollback).toContain('"source-revalidation-receipt": { required: true }');
    expect(rollback).toContain('"source-freeze-receipt": { required: true }');
    expect(rollback).toContain('"storage-revalidation-receipt": { required: true }');
    expect(rollback).toContain('confirmedAt > Date.parse(sourceRevalidationCapturedAt)');
    expect(rollback).toContain('confirmedAt > Date.parse(storageRevalidationCapturedAt)');
    expect(rollback).toContain('const evidenceBytes = readFileSync(evidencePath)');
    expect(rollback).toContain('evidence.evidenceType !== name');
    expect(rollback).toContain('validateCalendarReauthorizationEvidence');
    expect(rollback).toContain('validateSyncDeferredEvidence');
    expect(rollback).toContain('sha256File(SYNC_DEFERRAL_MIGRATION_PATH)');
    expect(rollback).toContain('sha256File(SYNC_SERVICE_PATH)');
    expect(canary).toContain('"syncDeferredBoundary": true');
    expect(canary).not.toContain('"syncReadWrite"');
    expect(canary).toContain('"evidenceReceiptPaths"');
  });

  it('uses the app callback for the unpublished Google OAuth canary', () => {
    const bindings = readRepoFile(
      'supabase/isolation/mind-manual-external-bindings.tsv',
    );
    const runbook = readRepoFile(
      'docs/operations/supabase-isolated-cutover-runbook-2026-08-29.md',
    );

    expect(bindings).toContain(
      'google_oauth_canary_redirect\tGoogle Cloud\thttp://localhost:8080/oauth-callback',
    );
    expect(bindings).toContain(
      'https://bubble-whisper-stream.lovable.app/oauth-callback',
    );
    expect(bindings).toContain('https://bubbleuniverse.app/oauth-callback');
    expect(bindings).not.toContain('calendar-oauth-callback');
    expect(bindings).not.toContain('/auth/v1/callback');
    expect(runbook).toContain('`http://localhost:8080/oauth-callback`');
    expect(runbook).toContain('add only');
    expect(runbook).toContain('Supabase Google provider stays disabled');
  });
});

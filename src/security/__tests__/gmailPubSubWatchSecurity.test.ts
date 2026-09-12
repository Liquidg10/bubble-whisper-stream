import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Gmail Pub/Sub watch security boundary', () => {
  it('uses the Gmail Pub/Sub request contract instead of Calendar webhook headers', () => {
    const handler = readRepoFile('supabase/functions/gmail-watch/index.ts');
    const protocol = readRepoFile('supabase/functions/gmail-watch/gmailWatchProtocol.ts');

    expect(handler).toContain('https://gmail.googleapis.com/gmail/v1/users/me/watch');
    expect(handler).toContain('buildGmailWatchRequest(topicName)');
    expect(protocol).toContain('labelFilterBehavior: "INCLUDE"');
    expect(protocol).not.toContain('address:');
    expect(protocol).not.toContain('channelId:');
    expect(handler).not.toMatch(/X-Goog-Resource|x-goog-resource|watch_channel_id|watch_resource_id/);
  });

  it('verifies Google OIDC identity before parsing or looking up a mailbox', () => {
    const resolver = readRepoFile(
      'supabase/functions/_shared/gmailMigrationScope.ts',
    );
    const pushScope = resolver.slice(
      resolver.indexOf('async function resolvePushScope'),
      resolver.indexOf('export function gmailWatchMigrationScope'),
    );
    const oidcVerification = pushScope.indexOf(
      'dependencies.verifyOidc ?? verifyGooglePubSubOidcJwt',
    );
    const envelopeParsing = pushScope.indexOf('parseGmailPubSubEnvelope');
    const mailboxLookup = pushScope.indexOf('resolveActiveWatchOwner');

    expect(oidcVerification).toBeGreaterThan(-1);
    expect(oidcVerification).toBeLessThan(envelopeParsing);
    expect(oidcVerification).toBeLessThan(mailboxLookup);
    expect(pushScope).toContain('runtime.env("GMAIL_PUBSUB_PUSH_AUDIENCE")');
    expect(pushScope).toContain(
      'runtime.env("GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT")',
    );
    expect(pushScope).toContain('action: "pubsub_history"');
  });

  it('keeps control calls account-specific and owner-bound', () => {
    const source = readRepoFile('supabase/functions/gmail-watch/index.ts');
    const resolver = readRepoFile(
      'supabase/functions/_shared/gmailMigrationScope.ts',
    );
    const control = source.slice(
      source.indexOf('async function handleControlRequest'),
      source.indexOf('function normalizeMessageReference'),
    );

    expect(resolver).toContain('normalizeOAuthAccountId(input.accountId)');
    expect(resolver).toContain('verifiedBearerMindManualScope("user_request")');
    expect(resolver).toContain(
      'isExactServiceRoleBearer(authorization, runtime.serviceKey)',
    );
    expect(resolver).toContain('resolveAccountOwner(');
    expect(control).toContain('scope.accountId');
    expect(control).toContain('scope.subjectId');
    expect(source).toContain('.eq("user_id", ownerUserId)');
    expect(control).not.toMatch(/renew-all|allAccounts|\beq\([^)]*\*\)/);
  });

  it('revalidates the exact admitted watch before any push receipt or provider work', () => {
    const source = readRepoFile('supabase/functions/gmail-watch/index.ts');
    const revalidation = readRepoFile('supabase/functions/gmail-watch/gmailWatchAdmissionWork.ts');
    const push = source.slice(source.indexOf('async function handlePubSubPush'));
    const watchLookup = revalidation.indexOf('.from("gmail_watch_subscriptions")');
    const exactId = revalidation.indexOf('.eq("id", scope.watchId)');
    const exactOwner = revalidation.indexOf('.eq("user_id", scope.subjectId)');
    const receipt = push.indexOf('claimPushReceipt');

    expect(watchLookup).toBeGreaterThan(-1);
    expect(exactId).toBeGreaterThan(watchLookup);
    expect(exactOwner).toBeGreaterThan(exactId);
    expect(push.indexOf('loadAdmittedGmailPushWatch(supabase, scope)')).toBeLessThan(receipt);
  });

  it('requires encrypted OAuth envelopes for Gmail provider calls', () => {
    const source = readRepoFile('supabase/functions/gmail-watch/index.ts');

    expect(source).toContain('decryptOAuthToken(value, await loadOAuthTokenEncryptionKey())');
    expect(source).toContain('const storedAccessToken = await encryptOAuthToken(');
    expect(source).not.toContain('startsWith(OAUTH_TOKEN_ENVELOPE_PREFIX)');
  });

  it('durably leases deliveries and advances history monotonically', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260829000002_gmail_pubsub_watch.sql',
    );

    expect(migration).toContain('UNIQUE (subscription_name, pubsub_message_id)');
    expect(migration).toContain("statement_timestamp() + interval '5 minutes'");
    expect(migration).toContain("RETURN QUERY SELECT v_receipt.id, 'busy'::text");
    expect(migration).toContain("RETURN QUERY SELECT v_receipt.id, 'replay'::text");
    expect(migration).toContain(
      'p_effective_history_id::numeric > v_watch.history_id::numeric',
    );
    expect(migration).toContain(
      'UNIQUE (oauth_account_id, history_id, event_type, gmail_message_id)',
    );
  });

  it('fails closed when the history gap needs a full mailbox resync', () => {
    const source = readRepoFile('supabase/functions/gmail-watch/index.ts');

    expect(source).toContain('existing?.status === "resync_required"');
    expect(source).toContain('"GMAIL_FULL_RESYNC_REQUIRED"');
    expect(source).toContain('errorCode === "HISTORY_CURSOR_EXPIRED"');
    expect(source).toContain('errorCode === "GMAIL_HISTORY_PAGE_LIMIT"');
  });

  it('keeps provider delivery receipts server-only', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260829000002_gmail_pubsub_watch.sql',
    );

    expect(migration).toContain('ALTER TABLE public.gmail_pubsub_receipts ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.gmail_watch_subscriptions,');
    expect(migration).toContain('public.gmail_pubsub_receipts,');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).not.toMatch(/GRANT SELECT[^;]+gmail_pubsub_receipts[^;]+authenticated/s);
    expect(migration).toContain('TO service_role');
  });

  it('exposes the public push endpoint only behind in-handler OIDC verification', () => {
    const config = readRepoFile('supabase/config.toml');
    expect(config).toMatch(/\[functions\.gmail-watch\]\s*verify_jwt = false/);
    expect(config).toMatch(/\[functions\.gmail-compose\]\s*verify_jwt = true/);
  });

  it('renews canonical Gmail watches without invented channel identifiers', () => {
    const entrypoint = readRepoFile('supabase/functions/watch-renewal-cron/index.ts');
    const cron = readRepoFile('supabase/functions/watch-renewal-cron/watchRenewalHandler.ts');
    const browserService = readRepoFile('src/services/watchRenewalService.ts');
    const cronGmailBranch = cron.slice(cron.indexOf('supabase.functions.invoke("gmail-watch"'));
    const browserGmailMethod = browserService.slice(
      browserService.indexOf('private async renewGmailWatch'),
      browserService.indexOf('stopWatchRenewal()'),
    );

    expect(cron).toContain('.from("gmail_watch_subscriptions")');
    expect(entrypoint).toContain('serve(createWatchRenewalHandler({');
    expect(cron).toContain('.eq("status", "active")');
    expect(cron).toContain('runMindManualSubjectWork(');
    expect(cron).toContain('? "renew_calendar"');
    expect(cron).toContain(': "renew_gmail"');
    expect(cron).toContain('if (admission.kind === "blocked")');
    expect(cron).toContain('lifecycle.holdUntil(completion)');
    expect(cron).toContain('migrationBlocked += 1');
    expect(cron).toContain('accountId: watch.account_id');
    expect(cronGmailBranch).not.toContain('oldChannelId: watch.channel_id');
    expect(browserService).toContain(".from('gmail_watch_subscriptions')");
    expect(browserGmailMethod).not.toContain('oldChannelId: watch.channel_id');
  });

  it('hydrates triage threads from the canonical production message table', () => {
    const triage = readRepoFile('src/services/gmailTriageService.ts');

    expect(triage).not.toContain('gmail_messages');
    expect(triage).toContain(".from('email_messages')");
    expect(triage).toContain(".eq('user_id', userId)");
    expect(triage).toContain(".in('gmail_thread_id', threadIds)");
  });
});

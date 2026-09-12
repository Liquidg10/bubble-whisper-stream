import { describe, expect, it, vi } from 'vitest';
import { createWatchRenewalHandler, type WatchRenewalDependencies } from '../../../supabase/functions/watch-renewal-cron/watchRenewalHandler';
import { gmailWatchMigrationScope } from '../../../supabase/functions/_shared/gmailMigrationScope';
import { claimAdmittedGmailPushReceipt, completeAdmittedGmailPushReceipt, GmailWatchHttpError, isVerifiedGmailWatchWriteReceipt, loadAdmittedGmailPushWatch, safeGmailWatchErrorMessage, type GmailWatchRow, type ReceiptClaim } from '../../../supabase/functions/gmail-watch/gmailWatchAdmissionWork';
import { GmailWatchProtocolError } from '../../../supabase/functions/gmail-watch/gmailWatchProtocol';
import { GoogleOidcVerificationError } from '../../../supabase/functions/gmail-watch/googleOidcJwt';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const WATCH = '44444444-4444-4444-8444-444444444444';
const OTHER_WATCH = '55555555-5555-4555-8555-555555555555';
const OTHER_ACCOUNT = '66666666-6666-4666-8666-666666666666';
const KEY = 'test-service-secret';
const ORIGIN = 'https://project.supabase.co';
const GENERATION = 'owner-fence-test-v2';
const SUBSCRIPTION = 'projects/mind-manual/subscriptions/gmail-watch';
const NOW = Date.parse('2026-09-01T00:00:00Z');
const ENV: Record<string, string> = { SUPABASE_URL: ORIGIN, SUPABASE_SERVICE_ROLE_KEY: KEY, MIND_MANUAL_RUNTIME_GENERATION: GENERATION, GMAIL_PUBSUB_SUBSCRIPTION: SUBSCRIPTION };
const watch = (extra: Record<string, unknown> = {}) => ({ id: WATCH, user_id: OWNER, oauth_account_id: ACCOUNT, watch_expires_at: new Date(NOW + 60_000).toISOString(), watch_generation: 4, status: 'active', ...extra });
type Row = Record<string, unknown>;

function harness(options: {
  gmail?: Row[]; calendar?: Row[]; blockedOwner?: string; selectedOwner?: string;
  failReceipt?: boolean; failChild?: boolean; throwChild?: boolean; revalidateAs?: Row | null;
  discoveryError?: boolean;
} = {}) {
  const events: string[] = [];
  const receipts: Row[] = [];
  const admissions: Row[] = [];
  const releases: Row[] = [];
  const invocations: Array<{ name: string; body: Row }> = [];
  const queries: Array<{ table: string; filters: Row; limit?: number; order: string[] }> = [];
  const tables: Record<string, Row[]> = { calendar_accounts: options.calendar ?? [], gmail_watch_subscriptions: options.gmail ?? [watch()] };
  const client = {
    from(table: string) {
      const state = { table, filters: {} as Row, limit: undefined as number | undefined, order: [] as string[] };
      queries.push(state);
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { state.filters[key] = value; return query; },
        not() { return query; }, lte() { return query; }, lt() { return query; },
        order(key: string) { state.order.push(key); return query; },
        limit(limit: number) { state.limit = limit; return query; },
        maybeSingle() {
          events.push(`revalidate:${state.filters.user_id}`);
          const row = 'revalidateAs' in options ? options.revalidateAs : tables[table]?.find(row => Object.entries(state.filters).every(([key, value]) => row[key] === value));
          return Promise.resolve({ data: row ?? null, error: null });
        },
        insert(receipt: Row) {
          events.push(`receipt:${receipt.user_id}`); receipts.push(receipt);
          return Promise.resolve({ error: options.failReceipt ? new Error('secret receipt error') : null });
        },
        then(resolve: (value: unknown) => unknown) {
          events.push(`discover:${table}`);
          return Promise.resolve({ data: tables[table] ?? [], error: options.discoveryError ? new Error('secret database error') : null }).then(resolve);
        },
      };
      return query;
    },
    functions: {
      invoke(name: string, { body }: { body: Row }) {
        invocations.push({ name, body }); events.push(`invoke:${name}`);
        if (options.throwChild) return Promise.reject(new Error('secret provider failure'));
        return Promise.resolve({ data: { success: !options.failChild }, error: null });
      },
    },
  } as unknown as ReturnType<WatchRenewalDependencies['createAdminClient']>;
  let sequence = 0;
  const deps: WatchRenewalDependencies = {
    env: name => ENV[name], now: () => NOW,
    createAdminClient() { events.push('client'); return client; },
    admissionDependencies: {
      randomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, '0')}`,
      fetch: async (input, init) => {
        const payload = JSON.parse(String(init?.body));
        if (String(input).endsWith('/mind_manual_admit_subject_edge')) {
          admissions.push(payload); events.push(`admit:${payload.p_subject_id}`);
          return Response.json(payload.p_subject_id === options.blockedOwner ? { decision: 'blocked' } : payload.p_subject_id === options.selectedOwner ? { decision: 'admitted', generation: GENERATION } : { decision: 'unselected' });
        }
        expect(String(input)).toBe(`${ORIGIN}/rest/v1/rpc/mind_manual_release_subject_edge`);
        releases.push(payload); events.push(`release:${payload.p_subject_id}`);
        return Response.json({ decision: 'released' });
      },
    },
  };
  const handler = createWatchRenewalHandler(deps);
  const run = (method = 'POST', authorization = `Bearer ${KEY}`) => handler(new Request(`${ORIGIN}/functions/v1/watch-renewal-cron`, { method, headers: { authorization } }));
  return { run, events, receipts, admissions, releases, invocations, queries, client };
}

describe('per-owner watch renewal behavior', () => {
  it('rejects non-POST and inexact service authorization before privileged discovery', async () => {
    const h = harness();
    expect((await h.run('GET')).status).toBe(405);
    expect((await h.run('POST', `Bearer ${KEY}-suffix`)).status).toBe(401);
    expect(h.events).toEqual([]);
  });

  it('skips a blocked selected owner while renewing an unrelated authoritative owner', async () => {
    const h = harness({ gmail: [watch(), watch({ id: OTHER_WATCH, user_id: OTHER, oauth_account_id: OTHER_ACCOUNT })], blockedOwner: OWNER });
    const result = await (await h.run()).json();
    expect(result).toMatchObject({ migrationBlocked: 1, renewalsScheduled: 1, renewalErrors: 0 });
    expect(h.admissions.map(row => [row.p_subject_id, row.p_action])).toEqual([[OWNER, 'renew_gmail'], [OTHER, 'renew_gmail']]);
    expect(h.invocations).toEqual([{ name: 'gmail-watch', body: { action: 'renew', accountId: OTHER_ACCOUNT } }]);
    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0]).toMatchObject({ user_id: OTHER, account_id: OTHER_ACCOUNT, status: 'success' });
    expect(h.events).not.toContain(`revalidate:${OWNER}`);
    expect(h.releases).toEqual([]);
  });

  it('keeps exact selected tuple leased through child and receipt completion', async () => {
    const h = harness({ selectedOwner: OWNER });
    expect((await h.run()).status).toBe(200);
    expect(h.releases).toHaveLength(1);
    expect(h.releases[0]).toEqual(h.admissions[0]);
    expect(h.admissions[0]).toMatchObject({ p_function_name: 'watch-renewal-cron', p_subject_id: OWNER, p_action: 'renew_gmail', p_generation: GENERATION });
    expect(h.events.slice(3)).toEqual([`admit:${OWNER}`, `revalidate:${OWNER}`, 'invoke:gmail-watch', `receipt:${OWNER}`, `release:${OWNER}`]);
    const revalidation = h.queries.find(q => q.filters.id === WATCH);
    expect(revalidation?.filters).toMatchObject({ id: WATCH, user_id: OWNER, oauth_account_id: ACCOUNT, status: 'active', watch_expires_at: watch().watch_expires_at });
  });

  it('uses a separate closed Calendar action and derives the child account only from its row', async () => {
    const row = { id: ACCOUNT, user_id: OWNER, watch_status: 'active', watch_expires_at: new Date(NOW + 60_000).toISOString(), watch_channel_id: 'channel', watch_resource_id: 'resource', calendar_id: 'primary' };
    const h = harness({ calendar: [row], gmail: [], selectedOwner: OWNER });
    expect(await (await h.run()).json()).toMatchObject({ renewalsScheduled: 1, renewalErrors: 0 });
    expect(h.admissions[0]).toMatchObject({ p_subject_id: OWNER, p_action: 'renew_calendar' });
    expect(h.invocations).toEqual([{ name: 'calendar-watch', body: { action: 'renew', calendarAccountId: ACCOUNT } }]);
    expect(h.receipts[0]).toMatchObject({ user_id: OWNER, account_id: ACCOUNT, service_type: 'calendar', status: 'success' });
    expect(h.releases).toHaveLength(1);
  });

  it.each([{ failReceipt: true }, { failChild: true }, { throwChild: true }])('retains failed or uncertain work without a second child invocation: %o', async (failure) => {
    const h = harness({ ...failure, selectedOwner: OWNER });
    const response = await h.run();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ renewalsScheduled: 0, renewalErrors: 1 });
    expect(h.releases).toEqual([]);
    expect(h.invocations).toHaveLength(1);
    expect(h.receipts).toHaveLength(1);
    expect(JSON.stringify(h.receipts)).not.toContain('secret');
  });

  it('revalidates ownership after admission and skips changed tuples before any child or receipt', async () => {
    const h = harness({ selectedOwner: OWNER, revalidateAs: watch({ user_id: OTHER }) });
    expect(await (await h.run()).json()).toMatchObject({ staleSkipped: 1, renewalsScheduled: 0 });
    expect(h.invocations).toEqual([]);
    expect(h.receipts).toEqual([]);
    expect(h.releases).toHaveLength(1);
  });

  it('bounds and orders discovery, caps work, and reports remaining eligible rows', async () => {
    const rows = Array.from({ length: 101 }, (_, n) => watch({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n + 1).padStart(12, '0')}` }));
    const h = harness({ gmail: rows, blockedOwner: OWNER });
    expect(await (await h.run()).json()).toMatchObject({ gmailWatches: 100, migrationBlocked: 100, moreEligible: true });
    expect(h.queries.slice(0, 2).map(q => [q.limit, q.order])).toEqual([[101, ['watch_expires_at', 'id']], [101, ['watch_expires_at', 'id']]]);
    expect(h.admissions).toHaveLength(100);
  });

  it('sanitizes discovery failures and does no admitted work', async () => {
    const h = harness({ discoveryError: true });
    const response = await h.run();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
    expect(h.admissions).toEqual([]);
  });
});

describe('Gmail scope input and post-admission behavior', () => {
  const runtime = (fetcher: typeof fetch) => ({ origin: ORIGIN, serviceKey: KEY, env: (name: string) => ENV[name], fetch: fetcher });

  it('cancels an undeclared streaming oversized body without buffering the remainder or looking up owners', async () => {
    let cancelled = false;
    let pulls = 0;
    let lookups = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(32 * 1024)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const request = new Request(`${ORIGIN}/functions/v1/gmail-watch`, { method: 'POST', body, duplex: 'half' } as RequestInit);
    const result = await gmailWatchMigrationScope()(request, runtime(async () => { lookups++; return Response.json([]); }));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBe(3);
    expect(lookups).toBe(0);
  });

  it('bounds empty chunk floods and never waits for hostile cancellation', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(0)); }, cancel() { return new Promise(() => {}); } }, { highWaterMark: 0 });
    const request = new Request(`${ORIGIN}/functions/v1/gmail-watch`, { method: 'POST', body, duplex: 'half' } as RequestInit);
    const result = await gmailWatchMigrationScope()(request, runtime(async () => { throw new Error('Must not fetch'); }));
    if (result.kind !== 'respond') throw new Error('Unexpected resolution');
    expect(result.response.status).toBe(413);
    expect(pulls).toBe(1025);
  });

  it('ends a stalled read at its deadline without awaiting cancellation', async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; return new Promise(() => {}); } });
      const request = new Request(`${ORIGIN}/functions/v1/gmail-watch`, { method: 'POST', body, duplex: 'half' } as RequestInit);
      const pending = gmailWatchMigrationScope()(request, runtime(async () => { throw new Error('Must not fetch'); }));
      await vi.advanceTimersByTimeAsync(5001);
      const result = await pending;
      if (result.kind !== 'respond') throw new Error('Unexpected resolution');
      expect(result.response.status).toBe(408);
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('snapshots chunks before a producer reuses their buffer', async () => {
    const payload = JSON.stringify({ action: 'renew', accountId: ACCOUNT });
    const buffer = new TextEncoder().encode(payload);
    let pull = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (pull++ === 0) controller.enqueue(buffer);
      else { buffer.fill(0); controller.close(); }
    } }, { highWaterMark: 0 });
    const request = new Request(`${ORIGIN}/functions/v1/gmail-watch`, { method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body, duplex: 'half' } as RequestInit);
    const result = await gmailWatchMigrationScope()(request, runtime(async () => Response.json([{ id: ACCOUNT, user_id: OWNER }])));
    expect(result).toMatchObject({ kind: 'resolved', subjectId: OWNER, action: 'service_renew' });
  });

  it('verifies OIDC before decoding an invalid mailbox payload or making an owner lookup', async () => {
    let verified = 0;
    let lookups = 0;
    const result = await gmailWatchMigrationScope({ verifyOidc: async () => { verified++; throw new GoogleOidcVerificationError('secret invalid provider', 'OIDC_SIGNATURE_INVALID'); } })(
      new Request(`${ORIGIN}/functions/v1/gmail-watch`, { method: 'POST', headers: { authorization: 'Bearer provider.signed.token' }, body: JSON.stringify({ subscription: SUBSCRIPTION, message: { data: 'not valid base64 !' } }) }),
      runtime(async () => { lookups++; return Response.json([]); }),
    );
    expect(verified).toBe(1);
    expect(lookups).toBe(0);
    if (result.kind !== 'respond') throw new Error('Unexpected resolution');
    expect(result.response.status).toBe(401);
    expect(await result.response.text()).not.toContain('secret');
  });

  it('NACKs OIDC verification outages without a watch lookup', async () => {
    const result = await gmailWatchMigrationScope({ verifyOidc: async () => { throw new GoogleOidcVerificationError('secret key transport', 'OIDC_JWKS_UNAVAILABLE'); } })(
      new Request(`${ORIGIN}/functions/v1/gmail-watch`, { method: 'POST', headers: { authorization: 'Bearer provider.signed.token' }, body: JSON.stringify({ subscription: SUBSCRIPTION, message: { data: 'invalid' } }) }),
      runtime(async () => { throw new Error('Must not fetch'); }),
    );
    if (result.kind !== 'respond') throw new Error('Unexpected resolution');
    expect(result.response.status).toBe(503);
    expect(await result.response.text()).not.toContain('secret');
  });

  it('uses verified Auth and exact account ownership, not a body owner or action tag', async () => {
    const requests: URL[] = [];
    const result = await gmailWatchMigrationScope()(new Request(`${ORIGIN}/functions/v1/gmail-watch`, {
      method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({ action: 'renew', accountId: ACCOUNT, subjectId: OTHER, callerKind: 'service' }),
    }), runtime(async input => {
      const url = new URL(String(input)); requests.push(url);
      return Response.json(url.pathname === '/auth/v1/user' ? { id: OWNER } : [{ id: ACCOUNT, user_id: OWNER }]);
    }));
    expect(result).toMatchObject({ kind: 'resolved', action: 'user_renew', subjectId: OWNER });
    expect(requests[1].searchParams.get('user_id')).toBe(`eq.${OWNER}`);
  });

  it('binds the post-admission watch lookup to owner, subscription, mailbox, status and watch ID', async () => {
    const h = harness({ revalidateAs: watch({ account_email: 'owner@example.com', subscription_name: SUBSCRIPTION }) });
    const scope = { kind: 'pubsub' as const, subjectId: OWNER, watchId: WATCH, notification: { emailAddress: 'owner@example.com', subscription: SUBSCRIPTION, historyId: '10', messageId: 'one', publishTime: null } };
    expect(await loadAdmittedGmailPushWatch(h.client, scope)).toMatchObject({ id: WATCH, user_id: OWNER });
    expect(h.queries[0].filters).toEqual({ id: WATCH, user_id: OWNER, account_email: 'owner@example.com', subscription_name: SUBSCRIPTION, status: 'active' });
    const stale = harness({ revalidateAs: watch({ user_id: OTHER, account_email: 'owner@example.com', subscription_name: SUBSCRIPTION }) });
    await expect(loadAdmittedGmailPushWatch(stale.client, scope)).rejects.toThrow('revalidation unavailable');
    const missing = harness({ revalidateAs: null });
    expect(await loadAdmittedGmailPushWatch(missing.client, scope)).toBeNull();
    for (const watch_generation of [-1, Number.MAX_SAFE_INTEGER + 1, 1.5, '4', null]) {
      const malformed = harness({ revalidateAs: watch({ watch_generation, account_email: 'owner@example.com', subscription_name: SUBSCRIPTION }) });
      await expect(loadAdmittedGmailPushWatch(malformed.client, scope)).rejects.toThrow('revalidation unavailable');
    }
  });

  it('accepts equivalent PostgreSQL timestamp spelling but rejects a different expiry or unsafe generation', () => {
    const expected = { ownerId: OWNER, accountId: ACCOUNT, expiresAt: '2026-09-01T00:01:00.000Z', generation: 4 };
    expect(isVerifiedGmailWatchWriteReceipt(watch({ watch_expires_at: '2026-09-01T00:01:00+00:00' }), expected)).toBe(true);
    expect(isVerifiedGmailWatchWriteReceipt(watch({ watch_expires_at: '2026-09-01T01:01:00+01:00' }), expected)).toBe(true);
    expect(isVerifiedGmailWatchWriteReceipt(watch({ watch_expires_at: '2026-09-01T00:01:01+00:00' }), expected)).toBe(false);
    expect(isVerifiedGmailWatchWriteReceipt(watch({ watch_expires_at: 'invalid' }), expected)).toBe(false);
    expect(isVerifiedGmailWatchWriteReceipt(watch({ watch_generation: Number.MAX_SAFE_INTEGER + 1 }), expected)).toBe(false);
  });
});

describe('Gmail scoped receipt contracts', () => {
  const RECEIPT = '77777777-7777-4777-8777-777777777777';
  const canonicalWatch = { ...watch(), account_email: 'owner@example.com', subscription_name: SUBSCRIPTION, topic_name: 'projects/mind-manual/topics/gmail', history_id: '9', watch_generation: 4 } as GmailWatchRow;
  const notification = { emailAddress: 'owner@example.com', subscription: SUBSCRIPTION, historyId: '10', messageId: 'one', publishTime: null };
  const claim: ReceiptClaim = { receipt_id: RECEIPT, claim_state: 'claimed', receipt_status: 'processing', attempts: 3 };
  function rpcClient(result: unknown, error: unknown = null) {
    const rpc = vi.fn().mockResolvedValue({ data: result, error });
    return { rpc, client: { rpc } as unknown as Parameters<typeof claimAdmittedGmailPushReceipt>[0] };
  }

  it('does not persist raw crypto, transport, provider or arbitrary object error text', () => {
    for (const error of [new Error('secret access token'), 'secret refresh token', { message: 'secret provider payload' }, { toString: () => { throw new Error('must not serialize'); } }]) {
      expect(safeGmailWatchErrorMessage(error)).toBe('Gmail watch processing did not complete');
    }
    expect(safeGmailWatchErrorMessage(new GmailWatchHttpError('Gmail watch state could not be saved', 503, 'WATCH_STATE_WRITE_FAILED'))).toBe('Gmail watch state could not be saved');
    expect(safeGmailWatchErrorMessage(new GmailWatchProtocolError('Request body is too large', 'REQUEST_TOO_LARGE'))).toBe('Request body is too large');
  });

  it('claims under the admitted canonical owner, account, generation, mailbox and subscription', async () => {
    const h = rpcClient([claim]);
    expect(await claimAdmittedGmailPushReceipt(h.client, canonicalWatch, notification)).toEqual(claim);
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('claim_gmail_pubsub_message_scoped', {
      p_watch_id: WATCH, p_user_id: OWNER, p_oauth_account_id: ACCOUNT, p_account_email: 'owner@example.com', p_watch_generation: 4,
      p_subscription_name: SUBSCRIPTION, p_pubsub_message_id: 'one', p_notification_history_id: '10', p_publish_time: null,
    });
  });

  it.each([[], [claim, claim], [{ ...claim, receipt_id: 'untrusted' }], [{ ...claim, attempts: 0 }], [{ ...claim, attempts: 1.5 }], [{ ...claim, claim_state: 'unknown' }], [{ ...claim, claim_state: 'replay' }], [{ ...claim, receipt_status: 'failed' }]].map(result => ({ result })))('rejects malformed claim receipts: $result', async ({ result }) => {
    const h = rpcClient(result);
    await expect(claimAdmittedGmailPushReceipt(h.client, canonicalWatch, notification)).rejects.toThrow('claim was not verified');
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it('completes only the exact current claim attempt and canonical tuple', async () => {
    const h = rpcClient([{ completion_state: 'completed', stored_history_id: '11' }]);
    await completeAdmittedGmailPushReceipt(h.client, { watch: canonicalWatch, claim, status: 'succeeded', effectiveHistoryId: '10' });
    expect(h.rpc).toHaveBeenCalledWith('complete_gmail_pubsub_message_scoped', expect.objectContaining({
      p_receipt_id: RECEIPT, p_watch_id: WATCH, p_user_id: OWNER, p_oauth_account_id: ACCOUNT, p_account_email: 'owner@example.com',
      p_subscription_name: SUBSCRIPTION, p_watch_generation: 4, p_attempt_count: 3,
    }));
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([[], [{ completion_state: 'unknown', stored_history_id: '10' }], [{ completion_state: 'completed', stored_history_id: null }], [{ completion_state: 'completed', stored_history_id: '9' }], [{ completion_state: 'completed', stored_history_id: 'invalid' }], [{ completion_state: 'completed', stored_history_id: '10' }, { completion_state: 'completed', stored_history_id: '10' }]].map(result => ({ result })))('rejects missing, malformed and nonmonotonic completion receipts: $result', async ({ result }) => {
    const h = rpcClient(result);
    await expect(completeAdmittedGmailPushReceipt(h.client, { watch: canonicalWatch, claim, status: 'succeeded', effectiveHistoryId: '10' })).rejects.toThrow('completion was not verified');
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});

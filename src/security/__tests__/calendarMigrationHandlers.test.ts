import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCalendarWatchChannelToken } from '../../../supabase/functions/_shared/calendarWatchSecurity.ts';

const stubs = vi.hoisted(() => ({
  serve: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock('https://deno.land/std@0.168.0/http/server.ts', () => ({ serve: stubs.serve }));
vi.mock('https://esm.sh/@supabase/supabase-js@2.56.0', () => ({
  createClient: () => ({ from: stubs.from, functions: { invoke: stubs.invoke }, rpc: stubs.rpc }),
}));
vi.mock('../../../supabase/functions/_shared/oauthTokenCrypto.ts', () => ({
  decryptOAuthToken: stubs.decrypt,
  encryptOAuthToken: stubs.encrypt,
  loadOAuthTokenEncryptionKey: async () => ({}),
}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICE = 'calendar-test-service';
const ORIGIN = 'https://calendar.test';
const GENERATION = 'calendar-stage-b.test';
const SECRET = 'calendar-test-secret';
const PRIVATE_ERROR = 'PRIVATE provider body, token, account and internal database details';
type Endpoint = (request: Request) => Promise<Response>;
type Query = { table: string; operations: Array<[string, ...unknown[]]> };
let sync: Endpoint;
let watch: Endpoint;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let queries: Query[];
let queryResult: (query: Query) => { data?: unknown; error?: unknown };
let admission: 'admitted' | 'unselected' | 'blocked';

function request(body: Record<string, unknown>, bearer = 'user-token', headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/functions/v1/calendar-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
function rpcCalls(name: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/rpc/${name}`));
}
function account() {
  return {
    id: ACCOUNT, user_id: OWNER, calendar_id: 'primary', provider: 'google',
    oauth_token_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    oauth_tokens: { access_token: 'encrypted', refresh_token: 'encrypted-refresh', token_expires_at: '2099-01-01T00:00:00.000Z' },
    watch_channel_id: 'channel', watch_resource_id: 'resource', watch_status: 'active',
    watch_expires_at: '2099-01-01T00:00:00.000Z', bounded_sync_window_days: 90,
  };
}
async function callback() {
  return request({}, 'unused', {
    'X-Goog-Channel-Id': 'channel',
    'X-Goog-Resource-Id': 'resource',
    'X-Goog-Resource-State': 'exists',
    'X-Goog-Channel-Token': await createCalendarWatchChannelToken('channel', SECRET),
  });
}

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => ({
    SUPABASE_URL: ORIGIN, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    MIND_MANUAL_RUNTIME_GENERATION: GENERATION, CALENDAR_WATCH_WEBHOOK_SECRET: SECRET,
  })[name] } });
  // These deployable Deno entrypoints have their own `deno check` gate. A
  // runtime path lets Vitest execute them without putting Deno URL modules
  // into the separate browser-app TypeScript program.
  const syncEntrypoint = '../../../supabase/functions/calendar-sync/index.ts';
  const watchEntrypoint = '../../../supabase/functions/calendar-watch/index.ts';
  await import(/* @vite-ignore */ syncEntrypoint);
  sync = stubs.serve.mock.calls[0][0];
  await import(/* @vite-ignore */ watchEntrypoint);
  watch = stubs.serve.mock.calls[1][0];
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  queries = [];
  admission = 'admitted';
  queryResult = (query) => ({ data: query.operations.some(([name]) => name === 'select') ? account() : null, error: null });
  stubs.decrypt.mockReset().mockResolvedValue('test-access-token');
  stubs.encrypt.mockReset().mockResolvedValue('encrypted-new-token');
  stubs.invoke.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  stubs.rpc.mockReset();
  stubs.from.mockReset().mockImplementation((table: string) => {
    const query: Query = { table, operations: [] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'update', 'insert', 'upsert', 'delete', 'eq', 'in', 'or', 'is']) {
      builder[method] = (...args: unknown[]) => { query.operations.push([method, ...args]); return builder; };
    }
    builder.single = builder.maybeSingle = async () => queryResult(query);
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve().then(() => queryResult(query)).then(resolve, reject);
    return builder;
  });
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: OWNER });
    if (url.includes('/rest/v1/calendar_accounts?')) return Response.json([{ id: ACCOUNT, user_id: OWNER }]);
    if (url.endsWith('/rpc/mind_manual_admit_subject_edge')) {
      return Response.json(admission === 'admitted' ? { decision: admission, generation: GENERATION } : { decision: admission });
    }
    if (url.endsWith('/rpc/mind_manual_release_subject_edge')) return Response.json({ decision: 'released' });
    if (url.includes('/events?')) return Response.json({ items: [], nextSyncToken: 'next-test-token' });
    if (url.endsWith('/channels/stop')) return new Response(null, { status: 204 });
    if (url.endsWith('/events/watch')) return Response.json({ id: 'replacement', resourceId: 'replacement-resource', expiration: String(Date.now() + 86400000) });
    throw new Error(PRIVATE_ERROR);
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('Calendar production handler owner admission', () => {
  it('rejects unknown sync actions before Auth, admission, credentials or provider work', async () => {
    const response = await sync(request({ action: 'update_event', calendarAccountId: ACCOUNT }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stubs.from).not.toHaveBeenCalled();
    expect(stubs.decrypt).not.toHaveBeenCalled();
  });

  it('rejects unknown watch actions before account/token/provider work', async () => {
    const response = await watch(request({ action: 'renew-all', calendarAccountId: ACCOUNT }));
    expect(response.status).toBe(400);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([`${ORIGIN}/auth/v1/user`]);
    expect(stubs.from).not.toHaveBeenCalled();
    expect(stubs.decrypt).not.toHaveBeenCalled();
  });

  it.each(['sync', 'watch'])('rejects invalid %s authentication before admission', async endpoint => {
    fetchMock.mockResolvedValueOnce(new Response(PRIVATE_ERROR, { status: 401 }));
    const response = await (endpoint === 'sync' ? sync : watch)(request({ calendarAccountId: ACCOUNT, ...(endpoint === 'watch' ? { action: 'renew' } : {}) }));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(PRIVATE_ERROR);
    expect(rpcCalls('mind_manual_admit_subject_edge')).toHaveLength(0);
    expect(stubs.from).not.toHaveBeenCalled();
  });

  it.each(['sync', 'watch'])('blocks selected %s before account/token/provider work', async endpoint => {
    admission = 'blocked';
    const response = await (endpoint === 'sync' ? sync : watch)(request({ calendarAccountId: ACCOUNT, ...(endpoint === 'watch' ? { action: 'renew' } : {}) }));
    expect(response.status).toBe(503);
    expect(stubs.from).not.toHaveBeenCalled();
    expect(stubs.decrypt).not.toHaveBeenCalled();
    expect(rpcCalls('mind_manual_admit_subject_edge')).toHaveLength(1);
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it.each(['sync', 'watch'])('binds %s account reads to Auth owner, not attacker body', async endpoint => {
    queryResult = () => ({ data: null, error: { message: PRIVATE_ERROR } });
    const response = await (endpoint === 'sync' ? sync : watch)(request({ calendarAccountId: ACCOUNT, user_id: OTHER, ...(endpoint === 'watch' ? { action: 'renew' } : {}) }));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(PRIVATE_ERROR);
    expect(queries[0].operations).toContainEqual(['eq', 'id', ACCOUNT]);
    expect(queries[0].operations).toContainEqual(['eq', 'user_id', OWNER]);
    expect(queries[0].operations).toContainEqual(['eq', 'oauth_tokens.user_id', OWNER]);
    expect(stubs.decrypt).not.toHaveBeenCalled();
    const tuple = JSON.parse(String(rpcCalls('mind_manual_admit_subject_edge')[0][1]?.body));
    expect(tuple.p_subject_id).toBe(OWNER);
    expect(tuple.p_action).toBe(endpoint === 'sync' ? 'user_sync' : 'user_renew');
    expect(JSON.parse(String(rpcCalls('mind_manual_release_subject_edge')[0][1]?.body))).toEqual(tuple);
  });

  it('uses the service-located owner for a full sync and owner-filters bounded cleanup', async () => {
    const response = await sync(request({ calendarAccountId: ACCOUNT, fullSync: true, user_id: OTHER }, SERVICE));
    expect(response.status).toBe(200);
    await response.json();
    const cleanup = queries.find(q => q.table === 'calendar_events' && q.operations.some(([name]) => name === 'delete'))!;
    expect(cleanup.operations).toContainEqual(['eq', 'calendar_account_id', ACCOUNT]);
    expect(cleanup.operations).toContainEqual(['eq', 'user_id', OWNER]);
    expect(cleanup.operations.find(([name]) => name === 'or')?.[1]).toMatch(/^start_time\.lt\..*,start_time\.gt\./);
    expect(stubs.rpc).not.toHaveBeenCalled();
    expect(JSON.parse(String(rpcCalls('mind_manual_admit_subject_edge')[0][1]?.body))).toMatchObject({ p_subject_id: OWNER, p_action: 'service_sync' });
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(1);
  });

  it('allows an unrelated owner to reuse a watch without acquiring or releasing a selected lease', async () => {
    admission = 'unselected';
    const response = await watch(request({ action: 'setup', calendarAccountId: ACCOUNT }));
    expect(await response.json()).toMatchObject({ success: true, reused: true });
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('googleapis.com'))).toBe(false);
  });

  it.each(['sync', 'watch'])('does not decrypt a %s token excluded by the owner relation filter', async endpoint => {
    queryResult = () => ({ data: { ...account(), oauth_tokens: null }, error: null });
    const response = await (endpoint === 'sync' ? sync : watch)(request({ calendarAccountId: ACCOUNT, ...(endpoint === 'watch' ? { action: 'renew' } : {}) }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(PRIVATE_ERROR);
    expect(stubs.decrypt).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('googleapis.com'))).toBe(false);
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it.each(['sync', 'watch'])('retains %s lease after an uncertain refresh without exposing provider details', async endpoint => {
    queryResult = () => ({ data: { ...account(), oauth_tokens: { ...account().oauth_tokens, token_expires_at: '2000-01-01T00:00:00.000Z' } }, error: null });
    const response = await (endpoint === 'sync' ? sync : watch)(request({ calendarAccountId: ACCOUNT, ...(endpoint === 'watch' ? { action: 'renew' } : {}) }));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(PRIVATE_ERROR);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === 'https://oauth2.googleapis.com/token')).toBe(true);
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
  });
});

describe('Calendar watch provider and completion contracts', () => {
  it('rejects forged callbacks before lookup or admission', async () => {
    const incoming = await callback();
    incoming.headers.set('X-Goog-Channel-Token', 'forged');
    const response = await watch(incoming);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stubs.from).not.toHaveBeenCalled();
  });

  it('acknowledges authenticated initial sync callbacks without lookup or lease', async () => {
    const incoming = await callback();
    incoming.headers.set('X-Goog-Resource-State', 'sync');
    const response = await watch(incoming);
    expect(await response.text()).toBe('OK');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stubs.from).not.toHaveBeenCalled();
  });

  it('revalidates the exact owner/channel/resource after admission before child sync', async () => {
    const response = await watch(await callback());
    expect(await response.text()).toBe('OK');
    expect(queries[0].operations).toEqual([
      ['select', 'id'], ['eq', 'id', ACCOUNT], ['eq', 'user_id', OWNER],
      ['eq', 'watch_channel_id', 'channel'], ['eq', 'watch_resource_id', 'resource'], ['eq', 'watch_status', 'active'],
    ]);
    expect(stubs.invoke).toHaveBeenCalledOnce();
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(1);
  });

  it('acknowledges a replaced channel without invoking child work', async () => {
    queryResult = () => ({ data: null, error: null });
    const response = await watch(await callback());
    expect(await response.text()).toBe('OK');
    expect(stubs.invoke).not.toHaveBeenCalled();
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(1);
  });

  it('fails closed and retains a selected lease on revalidation error', async () => {
    queryResult = () => ({ data: null, error: { message: PRIVATE_ERROR } });
    const response = await watch(await callback());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(PRIVATE_ERROR);
    expect(stubs.invoke).not.toHaveBeenCalled();
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('retains selected callback work when child failure is followed by successful fallback', async () => {
    stubs.invoke.mockResolvedValueOnce({ error: { message: PRIVATE_ERROR } });
    const response = await watch(await callback());
    expect(await response.text()).toBe('OK');
    expect(stubs.invoke).toHaveBeenCalledTimes(2);
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it.each([null, {}, { success: false }])('retains a selected callback with malformed child completion %j', async data => {
    stubs.invoke.mockResolvedValueOnce({ data, error: null });
    const response = await watch(await callback());
    expect(await response.text()).toBe('OK');
    expect(stubs.invoke).toHaveBeenCalledTimes(2);
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it.each(['stop', 'renew'])('retains selected %s when provider stop is uncertain', async action => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => String(input).endsWith('/channels/stop')
      ? new Response(PRIVATE_ERROR, { status: 503 }) : original(input, init));
    const response = await watch(request({ action, calendarAccountId: ACCOUNT }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(PRIVATE_ERROR);
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
    expect(queries.filter(q => q.operations.some(([name]) => name === 'update')).every(q =>
      q.operations.some(([name, field, value]) => name === 'eq' && field === 'user_id' && value === OWNER))).toBe(true);
  });

  it('sanitizes provider errors and retains the selected lease', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => String(input).endsWith('/events/watch')
      ? new Response(PRIVATE_ERROR, { status: 403 }) : original(input, init));
    const response = await watch(request({ action: 'renew', calendarAccountId: ACCOUNT }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Watch operation failed' });
    expect(rpcCalls('mind_manual_release_subject_edge')).toHaveLength(0);
  });
});

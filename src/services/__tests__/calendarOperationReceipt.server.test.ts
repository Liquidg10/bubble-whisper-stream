import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  calendarOperationDigests, calendarOperationIdentity, equalCalendarOperationIdentity, parseCalendarOperationResponse,
  type CalendarOperationIdentity, type CalendarOperationResult, type CalendarOperationStoredRecord,
} from '../../../supabase/functions/_shared/calendarOperationReceiptContract.ts';
import {
  handleCalendarOperationReceiptRead, handleCalendarOperationUpdate, type CalendarOperationUpdateDependencies,
} from '../../../supabase/functions/calendar-sync/calendarOperationReceipt.ts';
import type { ReviewedCalendarUpdateCacheWrite } from '../../../supabase/functions/calendar-sync/reviewedCalendarUpdate.ts';

const OWNER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '10000000-0000-4000-8000-000000000002';
const TOKEN = '10000000-0000-4000-8000-000000000003';
const CACHE = '10000000-0000-4000-8000-000000000004';
const OPERATION = '10000000-0000-4000-8000-000000000005';
const NONCE = '10000000-0000-4000-8000-000000000006';
const OTHER = '10000000-0000-4000-8000-000000000007';
const GOOGLE = 'synthetic@example.test';
const NOW = Date.parse('2030-01-01T00:00:00.000Z');
const before = { title: 'Before', description: '', location: '', startTime: '2030-01-01T10:00:00.000Z',
  endTime: '2030-01-01T11:00:00.000Z', startTz: 'UTC', endTz: 'UTC' };
const after = { ...before, title: 'Reviewed private revision' };
const prepare = () => ({ version: 2 as const, action: 'prepare_reviewed_update' as const, operationId: OPERATION,
  taskId: 'saved-task', calendarAccountId: ACCOUNT, eventId: 'synthetic-event' });
async function confirmation() {
  const intent = { operationId: OPERATION, taskId: 'saved-task', calendarAccountId: ACCOUNT,
    eventId: 'synthetic-event', googleCalendarId: GOOGLE, expectedEtag: '"before"', before: { ...before }, after: { ...after } };
  return { version: 2 as const, action: 'confirm_reviewed_update' as const, ...intent, ...await calendarOperationDigests(OWNER, intent) };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const providerEvent = (fields = before, etag = '"before"') => ({ id: 'synthetic-event', etag, summary: fields.title,
  description: fields.description, location: fields.location, status: 'confirmed', eventType: 'default', organizer: { self: true },
  start: { dateTime: fields.startTime, timeZone: fields.startTz }, end: { dateTime: fields.endTime, timeZone: fields.endTz } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  let saved: CalendarOperationStoredRecord | null = null;
  const order: string[] = [];
  const claimOperation = vi.fn(async (owner: string, identity: CalendarOperationIdentity) => {
    order.push('claim');
    if (saved) return { claimed: false };
    saved = { ownerUserId: owner, identity: structuredClone(identity), state: 'pending', completedAt: null, result: null };
    return { claimed: true, claimToken: NONCE };
  });
  const readOperation = vi.fn(async (owner: string, identity: CalendarOperationIdentity) => {
    order.push('read');
    return saved?.ownerUserId === owner && equalCalendarOperationIdentity(saved.identity, identity) ? structuredClone(saved) : null;
  });
  const finalizeOperation = vi.fn(async (owner: string, identity: CalendarOperationIdentity, nonce: string, result: CalendarOperationResult) => {
    order.push('finalize');
    if (!saved || saved.state !== 'pending' || owner !== saved.ownerUserId || nonce !== NONCE || !equalCalendarOperationIdentity(identity, saved.identity)) return null;
    saved = { ...saved, state: result.outcome === 'provider_written_cache_unknown' ? 'provider_written' : result.outcome,
      completedAt: NOW, result: structuredClone(result) };
    return structuredClone(saved);
  });
  const loadAccount = vi.fn(async () => ({ id: ACCOUNT, user_id: OWNER, provider: 'google', sync_enabled: true,
    calendar_id: GOOGLE, oauth_token_id: TOKEN }));
  const loadToken = vi.fn(async () => ({ id: TOKEN, user_id: OWNER, provider: 'google', service_type: 'calendar',
    scope: 'https://www.googleapis.com/auth/calendar.events', access_token: 'encrypted-fixture', token_expires_at: '2030-01-01T01:00:00.000Z' }));
  const loadEvent = vi.fn(async () => ({ id: CACHE, user_id: OWNER, calendar_account_id: ACCOUNT, external_event_id: 'synthetic-event', etag: '"cached"' }));
  const updateCache = vi.fn(async (write: ReviewedCalendarUpdateCacheWrite) => {
    order.push('cache');
    return { id: CACHE, user_id: OWNER, calendar_account_id: ACCOUNT, external_event_id: 'synthetic-event',
      etag: write.etag, title: write.fields.title, description: write.fields.description || null, location: write.fields.location || null,
      start_time: write.fields.startTime, end_time: write.fields.endTime, start_tz: write.fields.startTz, end_tz: write.fields.endTz };
  });
  const decryptAccessToken = vi.fn(async () => 'synthetic-access-token');
  const fetch = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    order.push(options?.method ?? 'GET');
    expect(saved?.state).toBe('pending');
    return json(options?.method === 'PATCH' ? providerEvent(after, '"after"') : providerEvent());
  });
  const deps: CalendarOperationUpdateDependencies = { enabled: 'true', callerUserId: OWNER, isInternalCaller: false,
    claimOperation, readOperation, finalizeOperation, loadAccount, loadToken, loadEvent, updateCache, decryptAccessToken,
    fetch, now: () => NOW };
  return { deps, order, claimOperation, readOperation, finalizeOperation, loadAccount, loadToken, loadEvent, updateCache, decryptAccessToken, fetch,
    get saved() { return saved; }, set saved(value: CalendarOperationStoredRecord | null) { saved = value; } };
}
async function dispatch(f = fixture(), raw?: unknown) {
  const response = await handleCalendarOperationUpdate(raw === undefined ? await confirmation() : raw, f.deps);
  return { response, body: await response.json() };
}
async function read(f: ReturnType<typeof fixture>, identity: CalendarOperationIdentity) {
  const response = await handleCalendarOperationReceiptRead({ version: 2, action: 'read_reviewed_update_receipt', ...identity }, {
    callerUserId: f.deps.callerUserId, isInternalCaller: f.deps.isInternalCaller, readOperation: f.readOperation,
  });
  return { response, body: await response.json() };
}
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

describe('v2 durable Calendar dispatch admission', () => {
  it('saves admission before GET/PATCH, exact completion after cache, and only then returns recorded', async () => {
    const f = fixture(); const request = await confirmation(); const { response, body } = await dispatch(f, request);
    expect(f.order).toEqual(['claim', 'GET', 'PATCH', 'cache', 'finalize']);
    expect(f.claimOperation).toHaveBeenCalledExactlyOnceWith(OWNER, calendarOperationIdentity(request));
    expect(f.finalizeOperation).toHaveBeenCalledExactlyOnceWith(OWNER, calendarOperationIdentity(request), NONCE,
      { outcome: 'written', etag: '"after"', cacheUpdated: true });
    expect(body).toEqual({ version: 2, ...calendarOperationIdentity(request), outcome: 'recorded', completedAt: NOW,
      result: { outcome: 'written', etag: '"after"', cacheUpdated: true } });
    expect(parseCalendarOperationResponse(body)).toEqual(body);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(body)).not.toContain(after.title); expect(JSON.stringify(f.saved)).not.toContain(after.title);
  });
  it.each([undefined, '', 'false', 'TRUE', '1'])('leaves dispatch held when the flag is %s without SQL/provider access', async enabled => {
    const f = fixture(); f.deps.enabled = enabled;
    expect((await dispatch(f)).body).toMatchObject({ outcome: 'held', code: 'disabled' });
    expect(f.claimOperation).not.toHaveBeenCalled(); expect(f.loadAccount).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([null, 'invalid', '00000000-0000-0000-0000-000000000000'])('rejects owner %s before admission', async callerUserId => {
    const f = fixture(); f.deps.callerUserId = callerUserId;
    expect((await dispatch(f)).body).toMatchObject({ outcome: 'held', code: 'unauthenticated' }); expect(f.claimOperation).not.toHaveBeenCalled();
  });
  it('rejects internal service callers even with an owner claim', async () => {
    const f = fixture(); f.deps.isInternalCaller = true;
    expect((await dispatch(f)).body.code).toBe('unauthenticated'); expect(f.claimOperation).not.toHaveBeenCalled();
  });
  it.each(['requestDigest', 'afterDigest', 'before', 'after', 'owner'])('recomputes and rejects changed %s before claim', async key => {
    const f = fixture(); const request = await confirmation();
    if (key === 'requestDigest' || key === 'afterDigest') request[key] = 'f'.repeat(64);
    if (key === 'before' || key === 'after') request[key].title = 'Changed after digest';
    if (key === 'owner') f.deps.callerUserId = OTHER;
    expect((await dispatch(f, request)).body).toMatchObject({ outcome: 'held', code: 'invalid_request' });
    expect(f.claimOperation).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([null, [], 'claimed', { claimed: true }, { claimed: true, claimToken: 'bad' },
    { claimed: true, claimToken: NONCE, extra: true }, { claimed: false, claimToken: NONCE }])('rejects a malformed claim %j without helper work', async claim => {
    const f = fixture(); f.claimOperation.mockResolvedValueOnce(claim as never);
    expect((await dispatch(f)).body.code).toBe('registry_unavailable'); expect(f.loadAccount).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('does not turn a missing RPC or its raw error into a fallback/known no-write receipt', async () => {
    const f = fixture(); f.claimOperation.mockRejectedValueOnce(new Error('PRIVATE SQL INTENT'));
    const { body } = await dispatch(f); expect(body).toMatchObject({ outcome: 'held', code: 'registry_unavailable' });
    expect(JSON.stringify(body)).not.toContain('PRIVATE'); expect(f.fetch).not.toHaveBeenCalled(); expect(f.finalizeOperation).not.toHaveBeenCalled();
  });
  it('keeps a busy/mismatched identity held rather than claiming it was not written', async () => {
    const f = fixture(); f.claimOperation.mockResolvedValueOnce({ claimed: false });
    expect((await dispatch(f)).body).toMatchObject({ outcome: 'held', code: 'operation_conflict' });
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.finalizeOperation).not.toHaveBeenCalled();
  });
  it('never executes an existing pending claim', async () => {
    const f = fixture(); const request = await confirmation();
    f.saved = { ownerUserId: OWNER, identity: calendarOperationIdentity(request), state: 'pending', completedAt: null, result: null };
    expect((await dispatch(f, request)).body).toMatchObject({ outcome: 'held', code: 'operation_pending' });
    expect(f.order).toEqual(['claim', 'read']); expect(f.loadAccount).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('returns an exact saved replay without checking expired/disconnected provider state', async () => {
    const f = fixture(); const request = await confirmation(); const first = await dispatch(f, request);
    f.loadAccount.mockRejectedValue(new Error('Disconnected')); f.fetch.mockClear(); f.finalizeOperation.mockClear();
    expect((await dispatch(f, request)).body).toEqual(first.body); expect(f.fetch).not.toHaveBeenCalled(); expect(f.finalizeOperation).not.toHaveBeenCalled();
    expect(f.loadAccount).toHaveBeenCalledOnce();
  });
  it('allows only the nonce winner during concurrent confirmations', async () => {
    const f = fixture(); const request = await confirmation(); const pending = deferred<Response>();
    f.fetch.mockReturnValueOnce(pending.promise);
    const first = dispatch(f, request); await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
    expect((await dispatch(f, request)).body).toMatchObject({ outcome: 'held', code: 'operation_pending' });
    pending.resolve(json(providerEvent())); expect((await first).body.outcome).toBe('recorded');
    expect(f.fetch).toHaveBeenCalledTimes(2); expect(f.finalizeOperation).toHaveBeenCalledOnce();
  });
  it('pins the actual stored Google target and never contacts a substituted calendar', async () => {
    const f = fixture(); f.loadAccount.mockResolvedValueOnce({ id: ACCOUNT, user_id: OWNER, provider: 'google', sync_enabled: true,
      calendar_id: 'other@example.test', oauth_token_id: TOKEN });
    expect((await dispatch(f)).body).toMatchObject({ outcome: 'recorded', result: { outcome: 'not_written' } });
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.finalizeOperation).toHaveBeenCalledOnce();
  });
  it('detaches the frozen request before an async claim can observe caller mutations', async () => {
    const f = fixture(); const request = await confirmation(); const claim = deferred<{ claimed: true; claimToken: string }>();
    const original = f.claimOperation.getMockImplementation()!;
    f.claimOperation.mockImplementationOnce(async (owner, identity) => { await original(owner, identity); return claim.promise; });
    const running = dispatch(f, request); await vi.waitFor(() => expect(f.claimOperation).toHaveBeenCalledOnce());
    request.after.title = 'Altered later'; request.googleCalendarId = 'other@example.test'; claim.resolve({ claimed: true, claimToken: NONCE });
    expect((await running).body.outcome).toBe('recorded');
    expect(JSON.parse(f.fetch.mock.calls[1][1]!.body as string).summary).toBe(after.title);
  });
});

describe('v2 completion persistence preserves uncertainty', () => {
  it.each([412, 400, 401, 403, 404, 410, 422, 429])('durably records definite PATCH rejection %s before replying', async status => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json(providerEvent())).mockResolvedValueOnce(new Response(null, { status }));
    expect((await dispatch(f)).body).toMatchObject({ outcome: 'recorded', result: { outcome: 'not_written' } });
    expect(f.saved?.state).toBe('not_written'); expect(f.finalizeOperation).toHaveBeenCalledOnce();
  });
  it.each(['lost-patch', 'bad-patch', 'cache'])('persists %s as held evidence and never re-executes it', async kind => {
    const f = fixture(); const request = await confirmation();
    if (kind === 'lost-patch') f.fetch.mockResolvedValueOnce(json(providerEvent())).mockRejectedValueOnce(new Error('PRIVATE PROVIDER'));
    if (kind === 'bad-patch') f.fetch.mockResolvedValueOnce(json(providerEvent())).mockResolvedValueOnce(json(providerEvent(after, '"before"')));
    if (kind === 'cache') f.updateCache.mockRejectedValueOnce(new Error('PRIVATE CACHE'));
    const { body } = await dispatch(f, request); expect(body.outcome).toBe('held');
    expect(f.saved?.state).toBe(kind === 'cache' ? 'provider_written' : 'uncertain');
    expect(JSON.stringify(body)).not.toContain('PRIVATE'); f.fetch.mockClear();
    expect((await dispatch(f, request)).body.outcome).toBe('held'); expect(f.fetch).not.toHaveBeenCalled();
    expect((await read(f, calendarOperationIdentity(request))).body.outcome).toBe('held');
  });
  it.each(['throw', 'null', 'other-owner', 'other-operation', 'wrong-result'])('does not report terminal completion on finalize %s', async kind => {
    const f = fixture(); const request = await confirmation();
    if (kind === 'throw') f.finalizeOperation.mockRejectedValueOnce(new Error('PRIVATE DATABASE'));
    else f.finalizeOperation.mockImplementationOnce(async (_owner, identity) => kind === 'null' ? null : ({
      ownerUserId: kind === 'other-owner' ? OTHER : OWNER, identity: { ...identity, operationId: kind === 'other-operation' ? OTHER : identity.operationId },
      state: kind === 'wrong-result' ? 'not_written' : 'written', completedAt: NOW,
      result: kind === 'wrong-result' ? { outcome: 'not_written', code: 'disabled' } : { outcome: 'written', etag: '"after"', cacheUpdated: true },
    }));
    const { body } = await dispatch(f, request); expect(body).toMatchObject({ outcome: 'held', code: 'outcome_unknown' });
    expect(JSON.stringify(body)).not.toContain('PRIVATE'); expect(f.saved?.state).toBe('pending');
  });
  it('recovers a committed terminal receipt after the finalize response was lost, without any write', async () => {
    const f = fixture(); const request = await confirmation(); const finalize = f.finalizeOperation.getMockImplementation()!;
    f.finalizeOperation.mockImplementationOnce(async (...args) => { await finalize(...args); throw new Error('Response lost'); });
    expect((await dispatch(f, request)).body.outcome).toBe('held'); expect(f.saved?.state).toBe('written');
    f.deps.enabled = undefined; f.fetch.mockClear(); f.loadAccount.mockClear(); f.loadToken.mockClear(); f.updateCache.mockClear(); f.finalizeOperation.mockClear();
    expect((await read(f, calendarOperationIdentity(request))).body).toMatchObject({ outcome: 'recorded', result: { outcome: 'written' } });
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.loadAccount).not.toHaveBeenCalled(); expect(f.loadToken).not.toHaveBeenCalled();
    expect(f.updateCache).not.toHaveBeenCalled(); expect(f.finalizeOperation).not.toHaveBeenCalled();
  });
});

describe('v2 preparation and read-only recovery boundaries', () => {
  it('prepares exact target and seven fields without admission or provider mutation', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json(providerEvent()));
    const { body } = await dispatch(f, prepare());
    expect(body).toEqual({ version: 2, operationId: OPERATION, taskId: 'saved-task', calendarAccountId: ACCOUNT,
      eventId: 'synthetic-event', outcome: 'ready', googleCalendarId: GOOGLE, expectedEtag: '"before"', before });
    expect(parseCalendarOperationResponse(body)).toEqual(body); expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.fetch.mock.calls[0][1]?.method).toBe('GET'); expect(f.claimOperation).not.toHaveBeenCalled();
    expect(f.finalizeOperation).not.toHaveBeenCalled(); expect(f.updateCache).not.toHaveBeenCalled();
  });
  it.each(['disabled', 'unauthenticated'])('does not prepare when %s', async code => {
    const f = fixture(); if (code === 'disabled') f.deps.enabled = undefined; else f.deps.isInternalCaller = true;
    expect((await dispatch(f, prepare())).body).toMatchObject({ outcome: 'unavailable', code }); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([null, { version: 1 }, { ...prepare(), unexpected: true }, { ...prepare(), version: 1 }])('rejects malformed/v1 request %j without work', async raw => {
    const f = fixture(); expect((await dispatch(f, raw)).response.status).toBe(400); expect(f.claimOperation).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('rejects throwing input accessors without reflecting raw errors', async () => {
    const raw = { ...prepare(), get version() { throw new Error('PRIVATE REQUEST'); } };
    const { response, body } = await dispatch(fixture(), raw); expect(response.status).toBe(400); expect(JSON.stringify(body)).not.toContain('PRIVATE');
  });
  it.each(['missing', 'pending', 'unknown', 'partial', 'wrong-owner', 'wrong-identity', 'malformed', 'error'])('read preserves %s as held, never no-write', async kind => {
    const f = fixture(); const identity = calendarOperationIdentity(await confirmation());
    if (kind === 'error') f.readOperation.mockRejectedValueOnce(new Error('PRIVATE DATABASE'));
    else if (kind !== 'missing') f.readOperation.mockResolvedValueOnce(kind === 'malformed' ? {} as never : {
      ownerUserId: kind === 'wrong-owner' ? OTHER : OWNER, identity: { ...identity, operationId: kind === 'wrong-identity' ? OTHER : identity.operationId },
      state: kind === 'unknown' ? 'uncertain' : kind === 'partial' ? 'provider_written' : 'pending',
      completedAt: ['unknown', 'partial'].includes(kind) ? NOW : null,
      result: kind === 'unknown' ? { outcome: 'uncertain', code: 'provider_outcome_unknown' }
        : kind === 'partial' ? { outcome: 'provider_written_cache_unknown', etag: '"after"', cacheUpdated: false } : null,
    });
    const { body } = await read(f, identity); expect(body.outcome).toBe('held'); expect(JSON.stringify(body)).not.toContain('PRIVATE');
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.claimOperation).not.toHaveBeenCalled(); expect(f.finalizeOperation).not.toHaveBeenCalled();
  });
  it.each(['missing-owner', 'internal'])('read rejects %s before accessing the registry', async kind => {
    const f = fixture(); if (kind === 'missing-owner') f.deps.callerUserId = null; else f.deps.isInternalCaller = true;
    expect((await read(f, calendarOperationIdentity(await confirmation()))).body.code).toBe('unauthenticated'); expect(f.readOperation).not.toHaveBeenCalled();
  });
  it('actual routing rejects both v1 write-preview actions and keeps receipt recovery separate from provider dependencies', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-sync/index.ts'), 'utf8');
    const start = source.indexOf("if (requestBody?.action === 'prepare_reviewed_update'");
    const end = source.indexOf('// Handle write operations', start); const routing = source.slice(start, end);
    expect(routing).toContain("(requestBody.action === 'prepare_reviewed_update' || requestBody.action === 'confirm_reviewed_update') && requestBody.version !== 2");
    expect(routing).toContain("error: 'unsupported_reviewed_update_version'");
    const readStart = routing.indexOf("if (requestBody.action === 'read_reviewed_update_receipt')");
    const readEnd = routing.indexOf('// This independent path', readStart); const readRoute = routing.slice(readStart, readEnd);
    expect(readRoute).toContain('handleCalendarOperationReceiptRead'); expect(readRoute).toContain('readOperation: operationRegistry.readOperation');
    expect(readRoute).not.toContain('CALENDAR_REVIEWED_UPDATES_ENABLED'); expect(readRoute).not.toContain('reviewedDependencies');
    expect(routing).toContain('handleCalendarOperationUpdate(requestBody, { ...reviewedDependencies, ...operationRegistry })');
    expect(routing).not.toContain('await handleReviewedCalendarUpdate('); expect(routing).not.toContain('refreshAccessToken');
    const legacy = source.slice(end);
    expect(legacy).toContain("case 'create_event'"); expect(legacy).toContain("case 'delete_event'");
    expect(legacy).not.toContain("case 'update_event'"); expect(legacy).not.toContain('handleReviewedCalendarUpdate');
    expect(legacy).not.toContain('handleCalendarOperationUpdate'); expect(legacy).not.toContain('calendar_operation_');
  });
});

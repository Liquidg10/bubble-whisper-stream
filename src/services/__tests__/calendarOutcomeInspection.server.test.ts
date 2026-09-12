import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCalendarOutcomeInspection, type CalendarOutcomeInspectionDependencies } from '../../../supabase/functions/calendar-sync/inspectCalendarOutcome.ts';
import { parseCalendarOutcomeInspectionRequest, parseCalendarOutcomeInspectionResponse } from '../../../supabase/functions/_shared/calendarOutcomeInspectionContract.ts';
import { parseCalendarReviewedUpdateResponse } from '../../../supabase/functions/_shared/calendarReviewedUpdateContract.ts';
const OWNER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '10000000-0000-4000-8000-000000000002';
const TOKEN = '10000000-0000-4000-8000-000000000003';
const OPERATION = '10000000-0000-4000-8000-000000000004';
const EVENT = 'observed-event';
const NOW = Date.parse('2030-01-01T00:00:00.000Z');
const request = () => ({ version: 1, action: 'inspect_reviewed_outcome', operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: EVENT });
const fields = () => ({ title: 'Current title', description: '', location: '', startTime: '2030-01-01T10:00:00.000Z',
  endTime: '2030-01-01T11:00:00.000Z', startTz: null, endTz: null });
const event = () => ({ id: EVENT, etag: '"current"', summary: fields().title, status: 'confirmed', organizer: { self: true },
  start: { dateTime: fields().startTime }, end: { dateTime: fields().endTime } });
function fixture() {
  const loadAccount = vi.fn().mockResolvedValue({ id: ACCOUNT, user_id: OWNER, provider: 'google', sync_enabled: true,
    calendar_id: 'synthetic@example.test', oauth_token_id: TOKEN });
  const loadToken = vi.fn().mockResolvedValue({ id: TOKEN, user_id: OWNER, provider: 'google', service_type: 'calendar',
    scope: 'https://www.googleapis.com/auth/calendar.readonly', access_token: 'encrypted-fixture', token_expires_at: '2030-01-01T01:00:00.000Z' });
  const decryptAccessToken = vi.fn().mockResolvedValue('synthetic-token');
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(event())));
  const deps: CalendarOutcomeInspectionDependencies = { enabled: 'true', callerUserId: OWNER, isInternalCaller: false,
    loadAccount, loadToken, decryptAccessToken, fetch, now: () => NOW };
  return { deps, loadAccount, loadToken, decryptAccessToken, fetch };
}
async function inspect(f = fixture(), raw: unknown = request()) {
  const result = await handleCalendarOutcomeInspection(raw, f.deps);
  return { result, body: await result.json() };
}
afterEach(() => vi.restoreAllMocks());

describe('Calendar outcome inspection disjoint protocol', () => {
  it('accepts only the exact read action and explicitly observed receipt', async () => {
    expect(parseCalendarOutcomeInspectionRequest(request())).toEqual(request());
    const { body } = await inspect();
    expect(parseCalendarOutcomeInspectionResponse(body)).toEqual(body);
    expect(parseCalendarReviewedUpdateResponse(body)).toBeNull();
  });
  it.each(['version', 'action', 'operationId', 'calendarAccountId', 'eventId'])('rejects missing or inherited request %s', key => {
    const raw = { ...request() } as Record<string, unknown>; const inherited = Object.create({ [key]: raw[key] });
    delete raw[key]; Object.assign(inherited, raw);
    expect(parseCalendarOutcomeInspectionRequest(raw)).toBeNull(); expect(parseCalendarOutcomeInspectionRequest(inherited)).toBeNull();
  });
  it.each([{ action: 'confirm_reviewed_update' }, { version: 2 }, { expectedEtag: '"old"' }, { operationId: 'invalid' },
    { calendarAccountId: OWNER.toUpperCase() + 'x' }, { eventId: '../event' }, { ownerUserId: OWNER }])('rejects malformed/expanded request %j', async change => {
    const f = fixture(); expect((await inspect(f, { ...request(), ...change })).result.status).toBe(400); expect(f.loadAccount).not.toHaveBeenCalled();
  });
  it.each(['written', 'not_written', 'uncertain', 'provider_written_cache_unknown'])('never parses dispatch outcome %s as observation', async outcome => {
    expect(parseCalendarOutcomeInspectionResponse({ ...(await inspect()).body, outcome })).toBeNull();
  });
  it.each(['observationOnly', 'etag', 'fields', 'observedAt', 'operationId'])('rejects missing/inherited observation %s', async key => {
    const raw = { ...(await inspect()).body }; const inherited = Object.create({ [key]: raw[key] }); delete raw[key]; Object.assign(inherited, raw);
    expect(parseCalendarOutcomeInspectionResponse(raw)).toBeNull(); expect(parseCalendarOutcomeInspectionResponse(inherited)).toBeNull();
  });
  it.each([{ observationOnly: false }, { etag: 'unquoted' }, { observedAt: NaN }, { observedAt: -1 }, { observedAt: 8.64e15 + 1 },
    { fields: { ...fields(), title: '' } }, { cacheUpdated: true }, { success: true }])('rejects misleading observation %j', async change => {
    expect(parseCalendarOutcomeInspectionResponse({ ...(await inspect()).body, ...change })).toBeNull();
  });
});

describe('Calendar outcome inspection has read-only owner-scoped authority', () => {
  it('makes exactly one authenticated GET without cache, patch, refresh or lease release', async () => {
    const f = fixture(); const { result, body } = await inspect(f);
    expect(body).toEqual({ version: 1, operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: EVENT,
      outcome: 'observed', observationOnly: true, etag: '"current"', fields: fields(), observedAt: NOW });
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(f.loadAccount).toHaveBeenCalledExactlyOnceWith(ACCOUNT, OWNER); expect(f.loadToken).toHaveBeenCalledExactlyOnceWith(TOKEN, OWNER);
    expect(f.fetch).toHaveBeenCalledOnce(); const [url, options] = f.fetch.mock.calls[0];
    expect(url).toContain('/calendars/synthetic%40example.test/events/observed-event?');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer synthetic-token' } });
    expect(options).not.toHaveProperty('body'); expect(options.headers).not.toHaveProperty('If-Match');
    expect(JSON.stringify(body)).not.toContain('synthetic-token');
  });
  it.each([undefined, '', 'false', 'TRUE', '1'])('defaults off for %s', async enabled => {
    const f = fixture(); f.deps.enabled = enabled;
    expect((await inspect(f)).body).toMatchObject({ outcome: 'inspection_unavailable', code: 'disabled' });
    expect(f.loadAccount).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([null, 'bad', '00000000-0000-0000-0000-000000000000'])('rejects missing/malformed owner %s', async callerUserId => {
    const f = fixture(); f.deps.callerUserId = callerUserId;
    expect((await inspect(f)).body.code).toBe('unauthenticated'); expect(f.loadAccount).not.toHaveBeenCalled();
  });
  it('rejects internal callers', async () => {
    const f = fixture(); f.deps.isInternalCaller = true;
    expect((await inspect(f)).body.code).toBe('unauthenticated'); expect(f.loadAccount).not.toHaveBeenCalled();
  });
  it.each([{ id: OWNER }, { user_id: ACCOUNT }, { provider: 'other' }, { sync_enabled: false }, { oauth_token_id: '' },
    { calendar_id: 'primary' }, { calendar_id: '*' }, { calendar_id: 'all' }, { calendar_id: '' }, { calendar_id: ' private' }, { calendar_id: 'x\u0000y' }])('independently rejects account %j', async change => {
    const f = fixture(); f.loadAccount.mockResolvedValue({ ...(await f.loadAccount()), ...change }); f.loadAccount.mockClear();
    expect((await inspect(f)).body.code).toBe('account_unavailable'); expect(f.loadToken).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([{ id: OWNER }, { user_id: ACCOUNT }, { provider: 'other' }, { service_type: 'gmail' }, { access_token: '' }])('independently rejects token %j', async change => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), ...change });
    expect((await inspect(f)).body.code).toBe('account_unavailable'); expect(f.decryptAccessToken).not.toHaveBeenCalled();
  });
  it.each(['calendar', 'calendar.events', 'calendar.readonly', 'calendar.events.readonly'])('accepts supported read capability %s without requesting more', async suffix => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), scope: `https://www.googleapis.com/auth/${suffix}` });
    expect((await inspect(f)).body.outcome).toBe('observed'); expect(f.fetch).toHaveBeenCalledOnce();
  });
  it.each(['', 'openid', 'https://www.googleapis.com/auth/gmail.readonly'])('rejects unrelated scope %s', async scope => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), scope });
    expect((await inspect(f)).body.code).toBe('read_permission_required'); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([null, 'bad', '2030-01-01T00:00:00.000Z'])('rejects expired or unproven expiry %s', async token_expires_at => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), token_expires_at });
    expect((await inspect(f)).body.code).toBe('authorization_expired'); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(['', 'with space', 'x'.repeat(65 * 1024)])('rejects unsafe decrypted token without provider work', async token => {
    const f = fixture(); f.decryptAccessToken.mockResolvedValue(token);
    expect((await inspect(f)).body.code).toBe('account_unavailable'); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('checks expiry again after decrypt', async () => {
    const f = fixture();
    const clock = vi.fn().mockReturnValueOnce(NOW).mockReturnValue(NOW + 7200_000); f.deps.now = clock;
    expect((await inspect(f)).body.code).toBe('authorization_expired'); expect(f.fetch).not.toHaveBeenCalled();
  });
});

describe('Calendar outcome observation failure remains distinct from original write outcome', () => {
  it.each([400, 401, 403, 404, 410, 412, 429, 500, 502, 302])('status %s never claims original not-written or clears a hold', async status => {
    const f = fixture(); f.fetch.mockResolvedValue(new Response('PRIVATE_PROVIDER_ERROR', { status }));
    const { body } = await inspect(f); expect(body.outcome).toBe('inspection_unavailable');
    expect(body.code).toBe([404, 410].includes(status) ? 'event_unavailable' : 'provider_unavailable');
    expect(JSON.stringify(body)).not.toContain('PRIVATE_PROVIDER_ERROR'); expect(f.fetch).toHaveBeenCalledOnce();
  });
  it.each([{ id: 'other' }, { etag: 'invalid' }, { attendees: [{}] }, { recurrence: [] }, { organizer: { self: false } },
    { status: 'cancelled' }, { start: { date: '2030-01-01' } }])('unsupported current event %j is not completion evidence', async change => {
    const f = fixture(); f.fetch.mockResolvedValue(new Response(JSON.stringify({ ...event(), ...change })));
    expect((await inspect(f)).body.code).toBe('event_not_supported'); expect(f.fetch).toHaveBeenCalledOnce();
  });
  it.each(['loadAccount', 'loadToken', 'decryptAccessToken', 'fetch'] as const)('hides %s errors', async port => {
    const f = fixture(); f[port].mockRejectedValue(new Error('PRIVATE_DETAIL'));
    const { body } = await inspect(f); expect(body.outcome).toBe('inspection_unavailable'); expect(JSON.stringify(body)).not.toContain('PRIVATE_DETAIL');
  });
  it.each(['bad JSON', 'x'.repeat(129 * 1024)])('rejects malformed or oversized body', async body => {
    const f = fixture(); f.fetch.mockResolvedValue(new Response(body)); expect((await inspect(f)).body.code).toBe('provider_unavailable');
  });
  it('bounds a never-settling GET and does not retry', async () => {
    const f = fixture(); f.deps.transportTimeoutMs = 1; f.fetch.mockReturnValue(new Promise(() => {}));
    expect((await inspect(f)).body.code).toBe('provider_unavailable'); expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('bounds a stalled response body and does not retry', async () => {
    const f = fixture(); f.deps.transportTimeoutMs = 1;
    f.fetch.mockResolvedValue(new Response(new ReadableStream({ start() { /* intentionally no completion */ } })));
    expect((await inspect(f)).body.code).toBe('provider_unavailable'); expect(f.fetch).toHaveBeenCalledOnce();
  });
  it('routes the new action through POST-only gated handler before legacy write dispatch', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-sync/index.ts'), 'utf8');
    const start = source.indexOf("if (operation === 'prepare_reviewed_update'");
    const block = source.slice(start, source.indexOf('// Handle write operations', start));
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("operation === 'inspect_reviewed_outcome'"); expect(block).toContain("req.method !== 'POST'");
    expect(block).toContain('await handleCalendarOutcomeInspection(requestBody, reviewedDependencies)');
    const helper = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-sync/inspectCalendarOutcome.ts'), 'utf8');
    expect(helper).not.toMatch(/updateCache|loadEvent|mind_manual_release_edge|method: 'PATCH'|refresh_token/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type CalendarReviewedUpdateFields,
  parseCalendarReviewedUpdateRequest,
  parseCalendarReviewedUpdateResponse,
} from '../../../supabase/functions/_shared/calendarReviewedUpdateContract.ts';
import {
  handleReviewedCalendarUpdate,
  parseReviewedCalendarProviderEvent,
  type ReviewedCalendarUpdateCacheWrite,
  type ReviewedCalendarUpdateDependencies,
} from '../../../supabase/functions/calendar-sync/reviewedCalendarUpdate.ts';

const OWNER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '10000000-0000-4000-8000-000000000002';
const TOKEN = '10000000-0000-4000-8000-000000000003';
const CACHE = '10000000-0000-4000-8000-000000000004';
const OPERATION = '10000000-0000-4000-8000-000000000005';
const EVENT = 'synthetic-event';
const NOW = Date.parse('2030-01-01T00:00:00.000Z');
const before: CalendarReviewedUpdateFields = { title: 'Before', description: '', location: '',
  startTime: '2030-01-01T10:00:00.000Z', endTime: '2030-01-01T11:00:00.000Z', startTz: 'UTC', endTz: 'UTC' };
const after: CalendarReviewedUpdateFields = { ...before, title: 'Reviewed revision' };
const prepare = () => ({ version: 1, operationId: OPERATION, action: 'prepare_reviewed_update', calendarAccountId: ACCOUNT, eventId: EVENT });
const confirm = () => ({ ...prepare(), action: 'confirm_reviewed_update', expectedEtag: '"before"', before: { ...before }, after: { ...after } });
const event = (fields = before, etag = '"before"') => ({ id: EVENT, etag, summary: fields.title,
  description: fields.description, location: fields.location, status: 'confirmed', eventType: 'default', organizer: { self: true },
  start: { dateTime: fields.startTime, ...(fields.startTz !== null ? { timeZone: fields.startTz } : {}) },
  end: { dateTime: fields.endTime, ...(fields.endTz !== null ? { timeZone: fields.endTz } : {}) } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const cacheReceipt = (write: ReviewedCalendarUpdateCacheWrite) => ({ id: CACHE, user_id: OWNER, calendar_account_id: ACCOUNT,
  external_event_id: EVENT, etag: write.etag, title: write.fields.title, description: write.fields.description || null,
  location: write.fields.location || null, start_time: write.fields.startTime, end_time: write.fields.endTime,
  start_tz: write.fields.startTz, end_tz: write.fields.endTz });

function fixture() {
  const loadAccount = vi.fn().mockResolvedValue({ id: ACCOUNT, user_id: OWNER, provider: 'google',
    sync_enabled: true, calendar_id: 'synthetic@example.test', oauth_token_id: TOKEN });
  const loadToken = vi.fn().mockResolvedValue({ id: TOKEN, user_id: OWNER, provider: 'google', service_type: 'calendar',
    scope: 'https://www.googleapis.com/auth/calendar.events', access_token: 'encrypted-fixture-only',
    token_expires_at: '2030-01-01T01:00:00.000Z' });
  const loadEvent = vi.fn().mockResolvedValue({ id: CACHE, user_id: OWNER, calendar_account_id: ACCOUNT, external_event_id: EVENT, etag: '"cached"' });
  const updateCache = vi.fn(async (write: ReviewedCalendarUpdateCacheWrite) => cacheReceipt(write));
  const decryptAccessToken = vi.fn(async () => 'synthetic-access-token');
  const fetch = vi.fn(async (_url: string | URL | Request, options?: RequestInit) =>
    json(options?.method === 'PATCH' ? event(after, '"after"') : event()));
  const deps: ReviewedCalendarUpdateDependencies = { enabled: 'true', callerUserId: OWNER, isInternalCaller: false,
    loadAccount, loadToken, loadEvent, updateCache, decryptAccessToken, fetch, now: () => NOW };
  return { deps, loadAccount, loadToken, loadEvent, updateCache, decryptAccessToken, fetch };
}

async function outcome(raw = confirm(), f = fixture()) {
  const result = await handleReviewedCalendarUpdate(raw, f.deps);
  return { status: result.status, body: await result.json(), f };
}

describe('reviewed update strict shared protocol', () => {
  it('accepts only the exact versioned prepare and confirm contracts', () => {
    expect(parseCalendarReviewedUpdateRequest(prepare())).toEqual(prepare());
    expect(parseCalendarReviewedUpdateRequest(confirm())).toEqual(confirm());
  });
  it.each([
    ['wrong version', { version: 2 }], ['unknown action', { action: 'update_event' }],
    ['extra property', { sendUpdates: 'all' }], ['invalid operation', { operationId: '*' }],
    ['nil owner locator', { calendarAccountId: '00000000-0000-0000-0000-000000000000' }],
    ['event traversal', { eventId: '../another' }], ['oversized event', { eventId: 'a'.repeat(257) }],
    ['wildcard ETag', { expectedEtag: '*' }], ['weak ETag', { expectedEtag: 'W/"before"' }],
    ['header ETag', { expectedEtag: '"before"\r\nx: value' }],
  ])('rejects %s before any work', async (_label, change) => {
    const raw = { ...confirm(), ...change };
    expect(parseCalendarReviewedUpdateRequest(raw)).toBeNull();
    const f = fixture();
    const result = await handleReviewedCalendarUpdate(raw, f.deps);
    expect(result.status).toBe(400); expect(f.loadAccount).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['blank title', { title: ' ' }], ['long description', { description: 'a'.repeat(4097) }],
    ['control character', { title: 'bad\u0000name' }], ['invalid start', { startTime: '2030-02-30T10:00:00.000Z' }],
    ['implicit timezone', { startTime: '2030-01-01T10:00:00' }], ['noncanonical offset', { startTime: '2030-01-01T10:00:00+00:00' }],
    ['negative duration', { endTime: '2030-01-01T09:00:00.000Z' }], ['too long duration', { endTime: '2030-01-03T10:00:00.000Z' }],
    ['invalid zone', { startTz: 'invented/not-a-zone' }], ['array payload', { attendees: [] }],
  ])('rejects %s fields', (_label, change) => {
    expect(parseCalendarReviewedUpdateRequest({ ...confirm(), after: { ...after, ...change } })).toBeNull();
  });
  it('rejects inherited required keys and receipt contradictions', () => {
    expect(parseCalendarReviewedUpdateRequest(Object.create(prepare()))).toBeNull();
    expect(parseCalendarReviewedUpdateRequest({ ...confirm(), before: Object.create(before) })).toBeNull();
    expect(parseCalendarReviewedUpdateResponse({ ...prepare(), outcome: 'ready', expectedEtag: '"before"', before })).toBeNull();
    const receipt = { version: 1, operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: EVENT,
      outcome: 'written', fields: after, etag: '"after"', cacheUpdated: true };
    expect(parseCalendarReviewedUpdateResponse(receipt)).toEqual(receipt);
    expect(parseCalendarReviewedUpdateResponse({ ...receipt, cacheUpdated: false })).toBeNull();
    expect(parseCalendarReviewedUpdateResponse({ ...receipt, operationId: null })).toBeNull();
    expect(parseCalendarReviewedUpdateResponse({ ...receipt, extra: true })).toBeNull();
    expect(parseCalendarReviewedUpdateResponse({ version: 1, operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: EVENT,
      outcome: 'not_written', code: 'provider_outcome_unknown' })).toBeNull();
  });
});

describe('reviewed update activation, authentication and independent ownership', () => {
  it.each([undefined, '', 'false', 'TRUE', ' true', '1'])('stays OFF for %s without touching credentials or provider', async enabled => {
    const f = fixture(); f.deps.enabled = enabled;
    const result = await outcome(confirm(), f);
    expect(result.body).toMatchObject({ version: 1, operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: EVENT, outcome: 'not_written', code: 'disabled' });
    expect(f.loadAccount).not.toHaveBeenCalled(); expect(f.loadToken).not.toHaveBeenCalled(); expect(f.decryptAccessToken).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([null, 'not-a-user', '00000000-0000-0000-0000-000000000000'])('rejects invalid authenticated user %s', async callerUserId => {
    const f = fixture(); f.deps.callerUserId = callerUserId;
    expect((await outcome(confirm(), f)).body.code).toBe('unauthenticated'); expect(f.loadAccount).not.toHaveBeenCalled();
  });
  it('rejects service-role/internal calls even with a supplied user ID', async () => {
    const f = fixture(); f.deps.isInternalCaller = true;
    expect((await outcome(confirm(), f)).body.code).toBe('unauthenticated'); expect(f.loadAccount).not.toHaveBeenCalled();
  });
  it.each([
    { id: TOKEN }, { user_id: TOKEN }, { provider: 'other' }, { sync_enabled: false },
    { calendar_id: null }, { calendar_id: '' }, { calendar_id: 'primary' }, { calendar_id: '*' },
    { calendar_id: ' space@example.test' }, { oauth_token_id: 'not-a-token' },
  ])('rejects unowned/disabled/uncanonical account %j', async change => {
    const f = fixture(); f.loadAccount.mockResolvedValue({ ...(await f.loadAccount()), ...change }); f.loadAccount.mockClear();
    expect((await outcome(confirm(), f)).body.code).toBe('account_unavailable'); expect(f.loadToken).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([{ id: ACCOUNT }, { user_id: TOKEN }, { provider: 'other' }, { service_type: 'gmail' }, { access_token: '' }])('rejects independently invalid token %j', async change => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), ...change }); f.loadToken.mockClear();
    expect((await outcome(confirm(), f)).body.code).toBe('account_unavailable'); expect(f.decryptAccessToken).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(['', 'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.events.owned'])('requires a separately granted write scope, not %s', async scope => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), scope }); f.loadToken.mockClear();
    expect((await outcome(confirm(), f)).body.code).toBe('write_permission_required'); expect(f.loadEvent).not.toHaveBeenCalled(); expect(f.decryptAccessToken).not.toHaveBeenCalled();
  });
  it.each(['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'])('accepts the explicit supported grant %s', async scope => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), scope });
    expect((await outcome(confirm(), f)).body.outcome).toBe('written');
  });
  it.each([null, 'invalid', '2030-01-01T00:00:00.000Z', '2029-01-01T00:00:00.000Z'])('requires a currently unexpired token, never refreshes %s', async token_expires_at => {
    const f = fixture(); f.loadToken.mockResolvedValue({ ...(await f.loadToken()), token_expires_at });
    expect((await outcome(confirm(), f)).body.code).toBe('authorization_expired'); expect(f.fetch).not.toHaveBeenCalled(); expect(f.decryptAccessToken).not.toHaveBeenCalled();
  });
  it.each([{ id: 'bad' }, { user_id: TOKEN }, { calendar_account_id: TOKEN }, { external_event_id: 'other-event' }, { etag: '*' }])('requires the exact existing owned cache row %j', async change => {
    const f = fixture(); f.loadEvent.mockResolvedValue({ ...(await f.loadEvent()), ...change });
    expect((await outcome(confirm(), f)).body.code).toBe('event_unavailable'); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('passes the independently authenticated owner to all source lookups', async () => {
    const f = fixture(); await outcome(confirm(), f);
    expect(f.loadAccount).toHaveBeenCalledExactlyOnceWith(ACCOUNT, OWNER);
    expect(f.loadToken).toHaveBeenCalledExactlyOnceWith(TOKEN, OWNER);
    expect(f.loadEvent).toHaveBeenCalledExactlyOnceWith(ACCOUNT, EVENT, OWNER);
  });
});

describe('reviewed update event eligibility and preview', () => {
  it('prepares one exact read-only provider snapshot without patch or cache mutation', async () => {
    const f = fixture(); const result = await handleReviewedCalendarUpdate(prepare(), f.deps);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const body = await result.json();
    expect(body).toEqual({ version: 1, operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: EVENT, outcome: 'ready', expectedEtag: '"before"', before });
    expect(parseCalendarReviewedUpdateResponse(body)).toEqual(body);
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.fetch.mock.calls[0][1]?.method).toBe('GET'); expect(f.updateCache).not.toHaveBeenCalled();
  });
  it.each([
    ['guest', { attendees: [{ email: 'somebody@example.test' }] }], ['omitted guest list', { attendeesOmitted: true }],
    ['wrong organizer', { organizer: { self: false } }], ['unverified organizer', { organizer: {} }],
    ['recurrence rule', { recurrence: [] }], ['recurring instance', { recurringEventId: 'series' }],
    ['original start', { originalStartTime: {} }], ['all-day', { start: { date: '2030-01-01' } }],
    ['cancelled', { status: 'cancelled' }], ['tentative', { status: 'tentative' }], ['locked', { locked: true }],
    ['focus time', { eventType: 'focusTime' }], ['other event ID', { id: 'other-event' }],
    ['missing ETag', { etag: null }], ['wildcard ETag', { etag: '*' }], ['malformed start', { start: { dateTime: 'tomorrow' } }],
    ['oversized summary', { summary: 'a'.repeat(4097) }], ['null description', { description: null }],
  ])('rejects %s before sending PATCH', async (_label, change) => {
    const f = fixture(); f.fetch.mockResolvedValue(json({ ...event(), ...change }));
    expect((await outcome(confirm(), f)).body.code).toBe('event_not_supported'); expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.updateCache).not.toHaveBeenCalled();
  });
  it('normalizes provider offsets for an exact instant comparison', () => {
    expect(parseReviewedCalendarProviderEvent({ ...event(), start: { dateTime: '2030-01-01T12:00:00+02:00', timeZone: 'UTC' } }, EVENT)?.fields.startTime).toBe(before.startTime);
  });
  it('rejects inherited organizer confirmation', () => {
    expect(parseReviewedCalendarProviderEvent({ ...event(), organizer: Object.create({ self: true }) }, EVENT)).toBeNull();
  });
  it.each(['2030-02-30T10:00:00Z', '2030-01-01T24:00:00Z'])('rejects raw provider date rollover %s', dateTime => {
    expect(parseReviewedCalendarProviderEvent({ ...event(), start: { dateTime, timeZone: 'UTC' } }, EVENT)).toBeNull();
  });
  it.each([404, 410, 401, 403, 500])('GET status %s proves no PATCH happened', async status => {
    const f = fixture(); f.fetch.mockResolvedValue(new Response('private error text', { status }));
    const result = await outcome(confirm(), f);
    expect(result.status).toBe(200); expect(result.body.outcome).toBe('not_written'); expect(JSON.stringify(result.body)).not.toContain('private'); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('reviewed conditional update and durable result distinction', () => {
  it('sends one narrowly scoped PATCH with the reviewed ETag and returns verified provider plus cache receipt', async () => {
    const f = fixture(); const { status, body } = await outcome(confirm(), f);
    expect(status).toBe(200); expect(body).toEqual({ version: 1, operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: EVENT,
      outcome: 'written', etag: '"after"', fields: after, cacheUpdated: true });
    expect(parseCalendarReviewedUpdateResponse(body)).toEqual(body);
    expect(f.fetch).toHaveBeenCalledTimes(2);
    const [url, options] = f.fetch.mock.calls[1];
    expect(new URL(String(url)).pathname).toBe('/calendar/v3/calendars/synthetic%40example.test/events/synthetic-event');
    expect(new URL(String(url)).searchParams.get('sendUpdates')).toBe('none');
    expect(options?.headers).toMatchObject({ 'If-Match': '"before"' }); expect(options?.redirect).toBe('error');
    expect(JSON.parse(String(options?.body))).toEqual({ summary: after.title, description: '', location: '',
      start: { dateTime: after.startTime, timeZone: 'UTC' }, end: { dateTime: after.endTime, timeZone: 'UTC' } });
    expect(f.updateCache).toHaveBeenCalledExactlyOnceWith({ ownerUserId: OWNER, calendarAccountId: ACCOUNT, eventId: EVENT,
      cacheId: CACHE, expectedCacheEtag: '"cached"', etag: '"after"', fields: after });
  });
  it('does not fill absent timezones or send any array fields', async () => {
    const f = fixture(); const raw = confirm(); raw.before.startTz = null; raw.before.endTz = null; raw.after.startTz = null; raw.after.endTz = null;
    f.fetch.mockImplementation(async (_url, options) => json(options?.method === 'PATCH' ? event(raw.after, '"after"') : event(raw.before)));
    expect((await outcome(raw, f)).body.outcome).toBe('written');
    const sent = JSON.parse(String(f.fetch.mock.calls[1][1]?.body));
    expect(sent.start).toEqual({ dateTime: before.startTime }); expect(sent).not.toHaveProperty('attendees'); expect(sent).not.toHaveProperty('recurrence');
  });
  it('rejects a timezone-setting change before any lookup', async () => {
    const f = fixture(); const raw = confirm(); raw.after.startTz = 'America/New_York';
    expect((await outcome(raw, f)).body.code).toBe('invalid_request'); expect(f.loadAccount).not.toHaveBeenCalled();
  });
  it('does not submit a no-op mutation', async () => {
    const f = fixture(); const raw = confirm(); raw.after = { ...before };
    expect((await outcome(raw, f)).body.code).toBe('no_changes'); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([{ etag: '"newer"' }, { summary: 'changed before review' }])('requires the exact current ETag and before fields %j', async change => {
    const f = fixture(); f.fetch.mockResolvedValue(json({ ...event(), ...change }));
    expect((await outcome(confirm(), f)).body.code).toBe('stale_review'); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('rechecks token expiry after the GET and before the PATCH', async () => {
    const f = fixture(); f.deps.now = vi.fn().mockReturnValueOnce(NOW).mockReturnValue(NOW + 2 * 60 * 60 * 1000);
    expect((await outcome(confirm(), f)).body.code).toBe('authorization_expired'); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403, 404, 410, 412, 422, 429])('does not retry a known PATCH rejection %s', async status => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json(event())).mockResolvedValueOnce(new Response('private provider error', { status }));
    const result = await outcome(confirm(), f); expect(result.status).toBe(200); expect(result.body.outcome).toBe('not_written');
    expect(result.body.code).toBe(status === 412 ? 'stale_review' : 'provider_rejected'); expect(f.fetch).toHaveBeenCalledTimes(2); expect(f.updateCache).not.toHaveBeenCalled();
  });
  it.each([201, 204, 301, 500, 502, 503])('retains uncertain PATCH status %s without retry', async status => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json(event())).mockResolvedValueOnce(new Response(null, { status }));
    const result = await outcome(confirm(), f); expect(result.status).toBe(502); expect(result.body.outcome).toBe('uncertain');
    expect(f.fetch).toHaveBeenCalledTimes(2); expect(f.updateCache).not.toHaveBeenCalled();
  });
  it.each([{ id: 'wrong' }, { etag: '"before"' }, { summary: 'not the reviewed change' }, { organizer: { self: false } }])('does not accept an invalid provider success receipt %j', async change => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json(event())).mockResolvedValueOnce(json({ ...event(after, '"after"'), ...change }));
    const result = await outcome(confirm(), f); expect(result.status).toBe(502); expect(result.body.outcome).toBe('uncertain'); expect(f.updateCache).not.toHaveBeenCalled();
  });
  it.each([null, {}, { id: CACHE }, { ...cacheReceipt({ fields: after, etag: '"after"' } as ReviewedCalendarUpdateCacheWrite), user_id: TOKEN }])('preserves provider success when cache receipt is unverified %j', async receipt => {
    const f = fixture(); f.updateCache.mockResolvedValue(receipt as ReturnType<typeof cacheReceipt>);
    const result = await outcome(confirm(), f); expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ outcome: 'provider_written_cache_unknown', etag: '"after"', fields: after, cacheUpdated: false });
    expect(parseCalendarReviewedUpdateResponse(result.body)).toEqual(result.body); expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it('preserves provider success if the independent cache write rejects', async () => {
    const f = fixture(); f.updateCache.mockRejectedValue(new Error('private database details'));
    const result = await outcome(confirm(), f); expect(result.status).toBe(502); expect(result.body.outcome).toBe('provider_written_cache_unknown');
    expect(JSON.stringify(result.body)).not.toContain('private'); expect(f.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('reviewed update bounded transport and integration', () => {
  it.each(['GET', 'PATCH'])('distinguishes a %s network failure without retry or raw diagnostics', async method => {
    const f = fixture();
    if (method === 'PATCH') f.fetch.mockResolvedValueOnce(json(event()));
    f.fetch.mockRejectedValueOnce(new Error('private token and event URL'));
    const result = await outcome(confirm(), f);
    expect(result.status).toBe(method === 'PATCH' ? 502 : 200); expect(result.body.outcome).toBe(method === 'PATCH' ? 'uncertain' : 'not_written');
    expect(JSON.stringify(result.body)).not.toContain('private'); expect(f.fetch).toHaveBeenCalledTimes(method === 'PATCH' ? 2 : 1);
  });
  it.each(['GET', 'PATCH'])('bounds the %s provider body and keeps dispatch ambiguity', async method => {
    const f = fixture(); if (method === 'PATCH') f.fetch.mockResolvedValueOnce(json(event()));
    f.fetch.mockResolvedValueOnce(new Response('a'.repeat(128 * 1024 + 1)));
    const result = await outcome(confirm(), f); expect(result.status).toBe(method === 'PATCH' ? 502 : 200);
    expect(result.body.outcome).toBe(method === 'PATCH' ? 'uncertain' : 'not_written'); expect(f.updateCache).not.toHaveBeenCalled();
  });
  it.each(['GET', 'PATCH'])('bounds the %s transport even if an injected provider ignores abort', async method => {
    const f = fixture(); f.deps.transportTimeoutMs = 1; if (method === 'PATCH') f.fetch.mockResolvedValueOnce(json(event()));
    f.fetch.mockImplementationOnce(() => new Promise(() => {}));
    const result = await outcome(confirm(), f); expect(result.status).toBe(method === 'PATCH' ? 502 : 200);
    expect(result.body.outcome).toBe(method === 'PATCH' ? 'uncertain' : 'not_written');
  });
  it('routes new actions before legacy refresh and scopes every database stage', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-sync/index.ts'), 'utf8');
    const start = source.indexOf("if (requestBody?.action === 'prepare_reviewed_update'");
    const end = source.indexOf('// Handle write operations', start);
    const routing = source.slice(start, end);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    expect(routing).toContain("Deno.env.get('CALENDAR_REVIEWED_UPDATES_ENABLED')");
    expect(routing).toContain(".eq('id', tokenId).eq('user_id', owner).eq('provider', 'google').eq('service_type', 'calendar')");
    expect(routing).toContain(".eq('user_id', owner).eq('calendar_account_id', accountId).eq('external_event_id', eventId)");
    expect(routing).toContain(".eq('id', write.cacheId).eq('user_id', write.ownerUserId)");
    expect(routing).toContain("update.is('etag', null) : update.eq('etag', write.expectedCacheEtag)");
    expect(routing).toContain('.single()'); expect(routing).not.toContain('refreshAccessToken'); expect(routing).not.toContain('.insert('); expect(routing).not.toContain('.upsert(');
  });
});

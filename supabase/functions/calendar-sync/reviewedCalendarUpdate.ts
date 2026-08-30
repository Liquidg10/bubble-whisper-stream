import {
  type CalendarReviewedUpdateCode,
  type CalendarReviewedUpdateFields,
  type CalendarReviewedUpdateResponse,
  equalCalendarReviewedUpdateFields,
  isCalendarReviewedUpdateFields,
  parseCalendarReviewedUpdateRequest,
  reviewedUpdateEtag,
  reviewedUpdateRecord,
  reviewedUpdateUuid,
} from '../_shared/calendarReviewedUpdateContract.ts';

export interface ReviewedCalendarUpdateCacheWrite {
  ownerUserId: string;
  calendarAccountId: string;
  eventId: string;
  cacheId: string;
  expectedCacheEtag: string | null;
  etag: string;
  fields: CalendarReviewedUpdateFields;
}

/** Every database port must scope to the supplied authenticated owner, never the request's claim. */
export interface ReviewedCalendarUpdateDependencies {
  enabled: string | undefined;
  callerUserId: string | null;
  isInternalCaller: boolean;
  loadAccount: (accountId: string, owner: string) => Promise<unknown>;
  loadToken: (tokenId: string, owner: string) => Promise<unknown>;
  loadEvent: (accountId: string, eventId: string, owner: string) => Promise<unknown>;
  updateCache: (write: ReviewedCalendarUpdateCacheWrite) => Promise<unknown>;
  decryptAccessToken: (encrypted: string) => Promise<string>;
  fetch?: typeof fetch;
  now?: () => number;
  /** Only injected by tests; bounded production default is 15 seconds. */
  transportTimeoutMs?: number;
}

interface EventSnapshot { etag: string; fields: CalendarReviewedUpdateFields }
const MAX_PROVIDER_BYTES = 128 * 1024;
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const ownString = (value: Record<string, unknown>, key: string): string | null =>
  hasOwn(value, key) && typeof value[key] === 'string' ? value[key] as string : null;

/** Reject guest, recurring, date-only and special events before an update is possible. */
export function parseReviewedCalendarProviderEvent(value: unknown, eventId: string): EventSnapshot | null {
  if (!reviewedUpdateRecord(value) || ownString(value, 'id') !== eventId || !hasOwn(value, 'etag') || !reviewedUpdateEtag(value.etag) ||
    ownString(value, 'status') !== 'confirmed' || (hasOwn(value, 'eventType') && value.eventType !== 'default') ||
    ['recurrence', 'recurringEventId', 'originalStartTime'].some(key => hasOwn(value, key)) ||
    (hasOwn(value, 'locked') && value.locked !== false) ||
    (hasOwn(value, 'attendeesOmitted') && value.attendeesOmitted !== false) ||
    (hasOwn(value, 'attendees') && (!Array.isArray(value.attendees) || value.attendees.length !== 0)) ||
    !hasOwn(value, 'organizer') || !reviewedUpdateRecord(value.organizer) || !hasOwn(value.organizer, 'self') || value.organizer.self !== true ||
    !hasOwn(value, 'start') || !reviewedUpdateRecord(value.start) || !hasOwn(value, 'end') || !reviewedUpdateRecord(value.end)) return null;
  const start = value.start;
  const end = value.end;
  if (hasOwn(start, 'date') || hasOwn(end, 'date')) return null;
  const startRaw = ownString(start, 'dateTime');
  const endRaw = ownString(end, 'dateTime');
  // Google dateTime is RFC3339. Never let Date.parse invent a zone or date.
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!startRaw || !endRaw || !rfc3339.test(startRaw) || !rfc3339.test(endRaw) ||
    !Number.isFinite(Date.parse(startRaw)) || !Number.isFinite(Date.parse(endRaw))) return null;
  for (const timestamp of [startRaw, endRaw]) {
    // Date.parse accepts values such as February 30 and 24:00 by rolling them
    // into a different day. Do not silently reinterpret a malformed receipt.
    const day = timestamp.slice(0, 10);
    const parsedDay = new Date(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day ||
      Number(timestamp.slice(11, 13)) > 23 || Number(timestamp.slice(14, 16)) > 59 || Number(timestamp.slice(17, 19)) > 59) return null;
  }
  const fields = {
    title: ownString(value, 'summary'),
    description: hasOwn(value, 'description') ? value.description : '',
    location: hasOwn(value, 'location') ? value.location : '',
    startTime: new Date(startRaw).toISOString(),
    endTime: new Date(endRaw).toISOString(),
    startTz: hasOwn(start, 'timeZone') ? start.timeZone : null,
    endTz: hasOwn(end, 'timeZone') ? end.timeZone : null,
  };
  if (!isCalendarReviewedUpdateFields(fields)) return null;
  return { etag: value.etag, fields };
}

export async function readBoundedCalendarProviderJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_PROVIDER_BYTES)) throw new Error('Provider response unavailable');
  if (!response.body) throw new Error('Provider response unavailable');
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_PROVIDER_BYTES) throw new Error('Provider response unavailable');
      chunks.push(part.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
}

function response(body: CalendarReviewedUpdateResponse | { error: 'invalid_request' }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  } });
}

function patchFields(fields: CalendarReviewedUpdateFields): Record<string, unknown> {
  return {
    summary: fields.title, description: fields.description, location: fields.location,
    start: { dateTime: fields.startTime, ...(fields.startTz !== null ? { timeZone: fields.startTz } : {}) },
    end: { dateTime: fields.endTime, ...(fields.endTz !== null ? { timeZone: fields.endTz } : {}) },
  };
}

function cacheReceiptMatches(value: unknown, write: ReviewedCalendarUpdateCacheWrite): boolean {
  if (!reviewedUpdateRecord(value)) return false;
  return value.id === write.cacheId && value.user_id === write.ownerUserId && value.calendar_account_id === write.calendarAccountId &&
    value.external_event_id === write.eventId && value.etag === write.etag && value.title === write.fields.title &&
    (value.description ?? '') === write.fields.description && (value.location ?? '') === write.fields.location &&
    typeof value.start_time === 'string' && Date.parse(value.start_time) === Date.parse(write.fields.startTime) &&
    typeof value.end_time === 'string' && Date.parse(value.end_time) === Date.parse(write.fields.endTime) &&
    value.start_tz === write.fields.startTz && value.end_tz === write.fields.endTz;
}

/** No retries, refreshes, inserts, background work, or raw provider/error logging. */
export async function handleReviewedCalendarUpdate(raw: unknown, dependencies: ReviewedCalendarUpdateDependencies): Promise<Response> {
  const request = parseCalendarReviewedUpdateRequest(raw);
  if (!request) return response({ error: 'invalid_request' }, 400);
  const identity = { operationId: request.operationId, calendarAccountId: request.calendarAccountId, eventId: request.eventId };
  const notWritten = (code: CalendarReviewedUpdateCode) => response({ version: 1, ...identity, outcome: 'not_written', code });
  const uncertain = () => response({ version: 1, ...identity, outcome: 'uncertain', code: 'provider_outcome_unknown' }, 502);
  // This is an independent server-side activation gate, not a UI preference.
  if (dependencies.enabled !== 'true') return notWritten('disabled');
  const owner = dependencies.callerUserId;
  if (dependencies.isInternalCaller || !reviewedUpdateUuid(owner)) return notWritten('unauthenticated');
  if (request.action === 'confirm_reviewed_update') {
    if (request.before.startTz !== request.after.startTz || request.before.endTz !== request.after.endTz) return notWritten('invalid_request');
    if (equalCalendarReviewedUpdateFields(request.before, request.after)) return notWritten('no_changes');
  }
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.transportTimeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) return notWritten('provider_unavailable');
  let patchDispatched = false;
  try {
    const account = await dependencies.loadAccount(request.calendarAccountId, owner);
    if (!reviewedUpdateRecord(account) || account.id !== request.calendarAccountId || account.user_id !== owner || account.sync_enabled !== true ||
      account.provider !== 'google' || !reviewedUpdateUuid(account.oauth_token_id) || typeof account.calendar_id !== 'string' ||
      !account.calendar_id || account.calendar_id.length > 1024 || account.calendar_id.trim() !== account.calendar_id ||
      /\s/.test(account.calendar_id) || [...account.calendar_id].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      ['primary', 'all', '*'].includes(account.calendar_id)) return notWritten('account_unavailable');
    const token = await dependencies.loadToken(account.oauth_token_id, owner);
    if (!reviewedUpdateRecord(token) || token.id !== account.oauth_token_id || token.user_id !== owner || token.provider !== 'google' ||
      token.service_type !== 'calendar' || typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 96 * 1024) return notWritten('account_unavailable');
    const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/) : [];
    // calendar.events.owned is deliberately not accepted until that narrower grant has its own activation evidence.
    if (!scopes.some(scope => ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'].includes(scope))) return notWritten('write_permission_required');
    const expiresAt = typeof token.token_expires_at === 'string' ? Date.parse(token.token_expires_at) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) return notWritten('authorization_expired');
    const cached = await dependencies.loadEvent(request.calendarAccountId, request.eventId, owner);
    if (!reviewedUpdateRecord(cached) || !reviewedUpdateUuid(cached.id) || cached.user_id !== owner || cached.calendar_account_id !== request.calendarAccountId ||
      cached.external_event_id !== request.eventId || !(cached.etag === null || reviewedUpdateEtag(cached.etag))) return notWritten('event_unavailable');
    const accessToken = await dependencies.decryptAccessToken(token.access_token);
    if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 64 * 1024 || /\s/.test(accessToken)) return notWritten('account_unavailable');
    const fetchImpl = dependencies.fetch ?? fetch;
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(account.calendar_id)}/events/${encodeURIComponent(request.eventId)}`);
    url.searchParams.set('fields', 'id,etag,summary,description,location,start,end,status,eventType,organizer,attendees,attendeesOmitted,recurrence,recurringEventId,originalStartTime,locked');
    const providerRequest = async (method: 'GET' | 'PATCH'): Promise<{ status: number; body: unknown }> => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Provider response unavailable')); }, timeoutMs);
      });
      const operation = (async () => {
        const destination = new URL(url);
        if (method === 'PATCH') destination.searchParams.set('sendUpdates', 'none');
        const confirmation = request.action === 'confirm_reviewed_update' ? request : null;
        const result = await fetchImpl(destination.toString(), {
          method, redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${accessToken}`,
            ...(method === 'PATCH' && confirmation ? { 'Content-Type': 'application/json', 'If-Match': confirmation.expectedEtag } : {}) },
          ...(method === 'PATCH' && confirmation ? { body: JSON.stringify(patchFields(confirmation.after)) } : {}),
        });
        if (result.status !== 200) {
          // Error bodies can contain private Calendar content; never parse or log them.
          void result.body?.cancel().catch(() => undefined);
          return { status: result.status, body: null };
        }
        return { status: result.status, body: await readBoundedCalendarProviderJson(result) };
      })();
      try { return await Promise.race([operation, deadline]); }
      finally { if (timer !== undefined) clearTimeout(timer); }
    };
    const fetched = await providerRequest('GET');
    if (fetched.status !== 200) return notWritten(fetched.status === 404 || fetched.status === 410 ? 'event_unavailable' : 'provider_unavailable');
    const before = parseReviewedCalendarProviderEvent(fetched.body, request.eventId);
    if (!before) return notWritten('event_not_supported');
    if (request.action === 'prepare_reviewed_update') return response({ version: 1, ...identity, outcome: 'ready', expectedEtag: before.etag, before: before.fields });
    if (request.expectedEtag !== before.etag || !equalCalendarReviewedUpdateFields(request.before, before.fields)) return notWritten('stale_review');
    if (expiresAt <= now()) return notWritten('authorization_expired');
    patchDispatched = true;
    const changed = await providerRequest('PATCH');
    if (changed.status === 412) return notWritten('stale_review');
    if ([400, 401, 403, 404, 410, 422, 429].includes(changed.status)) return notWritten('provider_rejected');
    if (changed.status !== 200) return uncertain();
    const committed = parseReviewedCalendarProviderEvent(changed.body, request.eventId);
    if (!committed || committed.etag === request.expectedEtag || !equalCalendarReviewedUpdateFields(committed.fields, request.after)) return uncertain();
    const write: ReviewedCalendarUpdateCacheWrite = {
      ownerUserId: owner, calendarAccountId: request.calendarAccountId, eventId: request.eventId,
      cacheId: cached.id, expectedCacheEtag: cached.etag as string | null, etag: committed.etag, fields: committed.fields,
    };
    // Provider success survives any independent cache persistence failure. A 502
    // preserves the migration lease until explicit operator reconciliation.
    let cacheUpdated = false;
    try { cacheUpdated = cacheReceiptMatches(await dependencies.updateCache(write), write); } catch { /* keep the provider receipt */ }
    if (cacheUpdated) return response({ version: 1, ...identity, outcome: 'written', etag: committed.etag, fields: committed.fields, cacheUpdated: true });
    return response({ version: 1, ...identity, outcome: 'provider_written_cache_unknown', etag: committed.etag, fields: committed.fields, cacheUpdated: false }, 502);
  } catch {
    return patchDispatched ? uncertain() : notWritten('provider_unavailable');
  }
}

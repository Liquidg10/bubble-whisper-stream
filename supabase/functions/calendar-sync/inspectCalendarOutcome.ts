import { parseCalendarOutcomeInspectionRequest, type CalendarOutcomeInspectionCode,
  type CalendarOutcomeInspectionResponse } from '../_shared/calendarOutcomeInspectionContract.ts';
import { reviewedUpdateRecord, reviewedUpdateUuid } from '../_shared/calendarReviewedUpdateContract.ts';
import { parseReviewedCalendarProviderEvent, readBoundedCalendarProviderJson,
  type ReviewedCalendarUpdateDependencies } from './reviewedCalendarUpdate.ts';

export type CalendarOutcomeInspectionDependencies = Pick<ReviewedCalendarUpdateDependencies,
  'enabled' | 'callerUserId' | 'isInternalCaller' | 'loadAccount' | 'loadToken' | 'decryptAccessToken' | 'fetch' | 'now' | 'transportTimeoutMs'>;

function response(body: CalendarOutcomeInspectionResponse | { error: 'invalid_request' }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json',
    'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

/** GET-only observation. No cache port, provider write, replay, or lease-release authority. */
export async function handleCalendarOutcomeInspection(raw: unknown, dependencies: CalendarOutcomeInspectionDependencies): Promise<Response> {
  const request = parseCalendarOutcomeInspectionRequest(raw);
  if (!request) return response({ error: 'invalid_request' }, 400);
  const identity = { version: 1 as const, operationId: request.operationId, calendarAccountId: request.calendarAccountId, eventId: request.eventId };
  const unavailable = (code: CalendarOutcomeInspectionCode) => response({ ...identity, outcome: 'inspection_unavailable', code });
  if (dependencies.enabled !== 'true') return unavailable('disabled');
  const owner = dependencies.callerUserId;
  if (dependencies.isInternalCaller || !reviewedUpdateUuid(owner)) return unavailable('unauthenticated');
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.transportTimeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) return unavailable('provider_unavailable');
  try {
    const account = await dependencies.loadAccount(request.calendarAccountId, owner);
    if (!reviewedUpdateRecord(account) || account.id !== request.calendarAccountId || account.user_id !== owner
      || account.sync_enabled !== true || account.provider !== 'google' || !reviewedUpdateUuid(account.oauth_token_id)
      || typeof account.calendar_id !== 'string' || !account.calendar_id || account.calendar_id.length > 1024
      || /\s/.test(account.calendar_id) || [...account.calendar_id].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
      || ['primary', 'all', '*'].includes(account.calendar_id)) return unavailable('account_unavailable');
    const token = await dependencies.loadToken(account.oauth_token_id, owner);
    if (!reviewedUpdateRecord(token) || token.id !== account.oauth_token_id || token.user_id !== owner || token.provider !== 'google'
      || token.service_type !== 'calendar' || typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 96 * 1024) return unavailable('account_unavailable');
    const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/) : [];
    if (!scopes.some(scope => ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'].includes(scope))) return unavailable('read_permission_required');
    const expiresAt = typeof token.token_expires_at === 'string' ? Date.parse(token.token_expires_at) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) return unavailable('authorization_expired');
    const accessToken = await dependencies.decryptAccessToken(token.access_token);
    if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 64 * 1024 || /\s/.test(accessToken)) return unavailable('account_unavailable');
    if (expiresAt <= now()) return unavailable('authorization_expired');
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(account.calendar_id)}/events/${encodeURIComponent(request.eventId)}`);
    url.searchParams.set('fields', 'id,etag,summary,description,location,start,end,status,eventType,organizer,attendees,attendeesOmitted,recurrence,recurringEventId,originalStartTime,locked');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Provider observation unavailable')); }, timeoutMs);
    });
    try {
      const observation = (async () => {
        const fetched = await (dependencies.fetch ?? fetch)(url.toString(), { method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${accessToken}` } });
        if (fetched.status !== 200) {
          void fetched.body?.cancel().catch(() => undefined);
          return unavailable(fetched.status === 404 || fetched.status === 410 ? 'event_unavailable' : 'provider_unavailable');
        }
        const event = parseReviewedCalendarProviderEvent(await readBoundedCalendarProviderJson(fetched), request.eventId);
        if (!event) return unavailable('event_not_supported');
        const observedAt = now();
        if (!Number.isSafeInteger(observedAt) || observedAt < 0 || observedAt > 8.64e15) return unavailable('provider_unavailable');
        return response({ ...identity, outcome: 'observed', observationOnly: true, etag: event.etag, fields: event.fields, observedAt });
      })();
      return await Promise.race([observation, deadline]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  } catch { return unavailable('provider_unavailable'); }
}

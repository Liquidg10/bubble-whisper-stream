import {
  type MindManualWorkLifecycle,
  type MindManualScopeResolver,
} from './migrationWriteFence.ts';
import {
  extractBearerToken,
  isCalendarWatchAction,
  normalizeCalendarAccountId,
  verifyCalendarWatchChannelToken,
  type CalendarWatchAction,
} from './calendarWatchSecurity.ts';

const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_REQUEST_CHUNKS = 1024;
const REQUEST_BODY_DEADLINE_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9._~-]+$/;

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

type JsonObject = Record<string, unknown>;
const hasOwn = (value: JsonObject, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

export type CalendarSyncOperation =
  | 'sync'
  | 'prepare_reviewed_update'
  | 'confirm_reviewed_update'
  | 'inspect_reviewed_outcome'
  | 'read_reviewed_update_receipt'
  | 'create_event'
  | 'delete_event';

const REVIEWED_CALENDAR_OPERATIONS = new Set<CalendarSyncOperation>([
  'prepare_reviewed_update',
  'confirm_reviewed_update',
  'inspect_reviewed_outcome',
  'read_reviewed_update_receipt',
]);

const LEGACY_CALENDAR_WRITE_OPERATIONS = new Set<CalendarSyncOperation>([
  'create_event',
  'delete_event',
]);

export interface CalendarMigrationScopeDependencies {
  env?: (name: string) => string | undefined;
}

export interface CalendarSyncMigrationContext {
  kind: 'user' | 'service';
  subjectId: string;
  callerUserId: string | null;
  isInternalCaller: boolean;
  calendarAccountId: string;
  operation: CalendarSyncOperation;
  requestBody: JsonObject;
}

export interface CalendarWatchControlMigrationContext {
  kind: 'control';
  callerKind: 'user' | 'service';
  subjectId: string;
  callerUserId: string | null;
  isInternalCaller: boolean;
  calendarAccountId: string;
  action: CalendarWatchAction;
  requestBody: JsonObject;
}

export interface CalendarWatchProviderMigrationContext {
  kind: 'provider';
  subjectId: string;
  calendarAccountId: string;
  resourceState: 'exists';
  resourceId: string;
  channelId: string;
  messageNumber: string | null;
}

export type CalendarWatchMigrationContext =
  | CalendarWatchControlMigrationContext
  | CalendarWatchProviderMigrationContext;

function jsonResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });
}

function unavailable(): Response {
  return new Response(JSON.stringify({
    error: 'MIND_MANUAL_TEMPORARILY_UNAVAILABLE',
    message: 'Mind Manual is temporarily unavailable. Please retry shortly.',
  }), {
    status: 503,
    headers: { ...jsonHeaders, 'Retry-After': '30' },
  });
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value) &&
    value !== '00000000-0000-0000-0000-000000000000';
}

function validAccountId(value: unknown): value is string {
  return validUuid(value);
}

function normalizedBearer(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization || authorization.length > 16_384) return null;
  const bearer = extractBearerToken(authorization);
  return bearer && TOKEN.test(bearer) ? bearer : null;
}

async function readRequestObject(request: Request): Promise<JsonObject | null> {
  const contentType = request.headers.get('content-type');
  if (contentType && contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return null;
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const body = new Uint8Array(MAX_REQUEST_BYTES);
  let bytes = 0;
  let chunks = 0;
  let complete = false;
  const deadlineReached = Symbol('calendar-request-deadline');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof deadlineReached>(resolve => {
    timer = setTimeout(() => resolve(deadlineReached), REQUEST_BODY_DEADLINE_MS);
  });
  try {
    while (true) {
      // One absolute deadline covers the entire body, even if individual
      // chunks arrive slowly or the source ignores cancellation.
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk === deadlineReached) return null;
      if (chunk.done) {
        complete = true;
        break;
      }
      chunks += 1;
      if (chunks > MAX_REQUEST_CHUNKS || !ArrayBuffer.isView(chunk.value) ||
        Object.prototype.toString.call(chunk.value) !== '[object Uint8Array]' ||
        bytes + chunk.value.byteLength > MAX_REQUEST_BYTES) return null;
      // Do not retain borrowed chunk buffers: a source can reuse them.
      body.set(chunk.value, bytes);
      bytes += chunk.value.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(0, bytes)));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonObject
      : null;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (!complete) {
      // A rejected or permanently pending cancellation is cleanup only; it
      // cannot extend the deadline or admit late-arriving work.
      try { void reader.cancel().catch(() => undefined); } catch { /* cleanup only */ }
    }
    try { reader.releaseLock(); } catch { /* pending reads cannot extend the deadline */ }
  }
}

type CalendarSyncRequestClassification = Readonly<{
  operation: CalendarSyncOperation;
  calendarAccountId: string;
}>;

function classifyCalendarSyncRequest(
  body: JsonObject,
): CalendarSyncRequestClassification | null {
  if (!validAccountId(body.calendarAccountId)) return null;
  let operation: CalendarSyncOperation;
  if (!hasOwn(body, 'action')) {
    operation = 'sync';
  } else {
    if (typeof body.action !== 'string') return null;
    if (!REVIEWED_CALENDAR_OPERATIONS.has(body.action as CalendarSyncOperation) &&
      !LEGACY_CALENDAR_WRITE_OPERATIONS.has(body.action as CalendarSyncOperation)) return null;
    operation = body.action as CalendarSyncOperation;
  }

  if (operation === 'create_event') {
    if (hasOwn(body, 'draft') && typeof body.draft !== 'boolean') return null;
    if (!body.eventData || typeof body.eventData !== 'object' || Array.isArray(body.eventData)) return null;
  } else if (hasOwn(body, 'draft')) {
    return null;
  }
  if (operation === 'delete_event' &&
    (typeof body.eventId !== 'string' || !body.eventId || body.eventId.trim() !== body.eventId)) return null;
  if (hasOwn(body, 'sendUpdates') &&
    !['all', 'externalOnly', 'none'].includes(body.sendUpdates as string)) return null;
  if (operation === 'sync') {
    for (const field of ['fullSync', 'simulate410', 'boundedWindow']) {
      if (hasOwn(body, field) && typeof body[field] !== 'boolean') return null;
    }
    if (hasOwn(body, 'timeWindow')) {
      const window = body.timeWindow;
      if (!window || typeof window !== 'object' || Array.isArray(window)) return null;
      for (const field of ['startDays', 'endDays']) {
        const value = (window as JsonObject)[field];
        if (hasOwn(window as JsonObject, field) &&
          (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) return null;
      }
    }
  }

  return { operation, calendarAccountId: body.calendarAccountId };
}

function calendarSyncLeaseAction(
  caller: 'user' | 'service',
  operation: CalendarSyncOperation,
): string {
  return `${caller}_${operation}`;
}

/** Register a failed completion without changing the endpoint's public response. */
export function retainCalendarLeaseForUncertainCompletion(
  lifecycle: MindManualWorkLifecycle,
  completed: boolean,
): void {
  if (!completed) {
    lifecycle.holdUntil(Promise.reject(new Error('Calendar provider completion is unverified')));
  }
}

async function resolveAuthenticatedUser(
  request: Request,
  runtime: { origin: string; serviceKey: string; fetch: typeof fetch },
): Promise<string | Response> {
  const bearer = normalizedBearer(request);
  if (!bearer) return jsonResponse('Unauthorized', 401);
  let result: Response;
  try {
    result = await runtime.fetch(`${runtime.origin}/auth/v1/user`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        apikey: runtime.serviceKey,
        Authorization: `Bearer ${bearer}`,
      },
    });
  } catch {
    return unavailable();
  }
  if (result.status === 401 || result.status === 403) return jsonResponse('Unauthorized', 401);
  if (!result.ok) return unavailable();
  try {
    const user: unknown = await result.json();
    const id = user && typeof user === 'object' && !Array.isArray(user)
      ? (user as JsonObject).id
      : null;
    return validUuid(id) ? id : unavailable();
  } catch {
    return unavailable();
  }
}

type OwnerLookup =
  | Readonly<{ kind: 'resolved'; accountId: string; subjectId: string }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'unavailable' }>;

async function readExactRows(
  url: URL,
  runtime: { serviceKey: string; fetch: typeof fetch },
): Promise<unknown[] | null> {
  let result: Response;
  try {
    result = await runtime.fetch(url.toString(), {
      method: 'GET',
      redirect: 'error',
      headers: {
        apikey: runtime.serviceKey,
        Authorization: `Bearer ${runtime.serviceKey}`,
        Accept: 'application/json',
      },
    });
  } catch {
    return null;
  }
  if (!result.ok) return null;
  try {
    const rows: unknown = await result.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

async function resolveAccountOwner(
  calendarAccountId: string,
  runtime: { origin: string; serviceKey: string; fetch: typeof fetch },
): Promise<OwnerLookup> {
  const url = new URL(`${runtime.origin}/rest/v1/calendar_accounts`);
  url.searchParams.set('select', 'id,user_id');
  url.searchParams.set('id', `eq.${calendarAccountId}`);
  url.searchParams.set('limit', '2');
  const rows = await readExactRows(url, runtime);
  if (rows === null || rows.length > 1) return { kind: 'unavailable' };
  if (rows.length === 0) return { kind: 'missing' };
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { kind: 'unavailable' };
  const record = row as JsonObject;
  return record.id === calendarAccountId && validUuid(record.user_id)
    ? { kind: 'resolved', accountId: calendarAccountId, subjectId: record.user_id }
    : { kind: 'unavailable' };
}

async function resolveWatchOwner(
  channelId: string,
  resourceId: string,
  runtime: { origin: string; serviceKey: string; fetch: typeof fetch },
): Promise<OwnerLookup> {
  const url = new URL(`${runtime.origin}/rest/v1/calendar_accounts`);
  url.searchParams.set('select', 'id,user_id');
  url.searchParams.set('watch_channel_id', `eq.${channelId}`);
  url.searchParams.set('watch_resource_id', `eq.${resourceId}`);
  url.searchParams.set('watch_status', 'eq.active');
  url.searchParams.set('limit', '2');
  const rows = await readExactRows(url, runtime);
  if (rows === null || rows.length > 1) return { kind: 'unavailable' };
  if (rows.length === 0) return { kind: 'missing' };
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { kind: 'unavailable' };
  const record = row as JsonObject;
  return validUuid(record.id) && validUuid(record.user_id)
    ? { kind: 'resolved', accountId: record.id, subjectId: record.user_id }
    : { kind: 'unavailable' };
}

export function calendarSyncMigrationScope(): MindManualScopeResolver<CalendarSyncMigrationContext> {
  return async (request, runtime) => {
    if (request.method !== 'POST') {
      return { kind: 'respond', response: jsonResponse('Invalid request', 405) };
    }
    const requestBody = await readRequestObject(request);
    if (!requestBody) return { kind: 'respond', response: jsonResponse('Invalid request', 400) };
    const classification = classifyCalendarSyncRequest(requestBody);
    if (!classification) {
      return { kind: 'respond', response: jsonResponse('Invalid calendar operation', 400) };
    }
    const bearer = normalizedBearer(request);
    if (!bearer) return { kind: 'respond', response: jsonResponse('Unauthorized', 401) };

    if (bearer === runtime.serviceKey) {
      const owner = await resolveAccountOwner(classification.calendarAccountId, runtime);
      if (owner.kind === 'missing') {
        return { kind: 'respond', response: jsonResponse('Calendar account not found', 404) };
      }
      if (owner.kind !== 'resolved') return { kind: 'respond', response: unavailable() };
      return {
        kind: 'resolved',
        subjectId: owner.subjectId,
        action: calendarSyncLeaseAction('service', classification.operation),
        context: Object.freeze({
          kind: 'service',
          subjectId: owner.subjectId,
          callerUserId: null,
          isInternalCaller: true,
          calendarAccountId: owner.accountId,
          operation: classification.operation,
          requestBody,
        }),
      };
    }

    const authenticated = await resolveAuthenticatedUser(request, runtime);
    if (authenticated instanceof Response) return { kind: 'respond', response: authenticated };
    return {
      kind: 'resolved',
      subjectId: authenticated,
      action: calendarSyncLeaseAction('user', classification.operation),
      context: Object.freeze({
        kind: 'user',
        subjectId: authenticated,
        callerUserId: authenticated,
        isInternalCaller: false,
        calendarAccountId: classification.calendarAccountId,
        operation: classification.operation,
        requestBody,
      }),
    };
  };
}

function controlAction(caller: 'user' | 'service', action: CalendarWatchAction): string {
  return `${caller}_${action}`;
}

export function calendarWatchMigrationScope(
  dependencies: CalendarMigrationScopeDependencies = {},
): MindManualScopeResolver<CalendarWatchMigrationContext> {
  return async (request, runtime) => {
    if (request.method !== 'POST') {
      return { kind: 'respond', response: new Response('Method not allowed', { status: 405 }) };
    }

    const channelHeader = request.headers.get('X-Goog-Channel-Id');
    if (channelHeader) {
      const resourceState = request.headers.get('X-Goog-Resource-State');
      const resourceId = request.headers.get('X-Goog-Resource-Id');
      const channelId = channelHeader;
      const channelToken = request.headers.get('X-Goog-Channel-Token');
      if (!resourceState || !resourceId) {
        return { kind: 'respond', response: new Response('Missing required headers', { status: 400 }) };
      }
      const env = dependencies.env ?? runtime.env;
      const verified = await verifyCalendarWatchChannelToken(
        channelToken,
        channelId,
        env('CALENDAR_WATCH_WEBHOOK_SECRET'),
      );
      if (!verified) {
        return { kind: 'respond', response: new Response('Unauthorized', { status: 401 }) };
      }
      // Google's initial sync notification can arrive before channel
      // persistence. It intentionally performs no owner work.
      if (resourceState !== 'exists') {
        return { kind: 'respond', response: new Response('OK', { status: 200 }) };
      }
      const owner = await resolveWatchOwner(channelId, resourceId, runtime);
      // Unknown or expired channels are acknowledged so Google does not retry.
      if (owner.kind === 'missing') {
        return { kind: 'respond', response: new Response('OK', { status: 200 }) };
      }
      if (owner.kind !== 'resolved') return { kind: 'respond', response: unavailable() };
      return {
        kind: 'resolved',
        subjectId: owner.subjectId,
        action: 'provider_exists',
        context: Object.freeze({
          kind: 'provider',
          subjectId: owner.subjectId,
          calendarAccountId: owner.accountId,
          resourceState: 'exists',
          resourceId,
          channelId,
          messageNumber: request.headers.get('X-Goog-Message-Number'),
        }),
      };
    }

    const bearer = normalizedBearer(request);
    if (!bearer) return { kind: 'respond', response: jsonResponse('Unauthorized', 401) };
    const authenticated = bearer === runtime.serviceKey
      ? null
      : await resolveAuthenticatedUser(request, runtime);
    if (authenticated instanceof Response) return { kind: 'respond', response: authenticated };
    const requestBody = await readRequestObject(request);
    if (!requestBody) return { kind: 'respond', response: jsonResponse('Invalid request', 400) };
    if (!isCalendarWatchAction(requestBody.action)) {
      return { kind: 'respond', response: jsonResponse('Invalid action', 400) };
    }
    const account = normalizeCalendarAccountId(
      requestBody.calendarAccountId,
      requestBody.accountId,
    );
    if ('reason' in account) {
      return { kind: 'respond', response: jsonResponse(account.reason, 400) };
    }
    if (!validAccountId(account.calendarAccountId)) {
      return { kind: 'respond', response: jsonResponse('A specific calendar account is required', 400) };
    }

    if (bearer === runtime.serviceKey) {
      const owner = await resolveAccountOwner(account.calendarAccountId, runtime);
      if (owner.kind === 'missing') {
        return { kind: 'respond', response: jsonResponse('Calendar account not found', 404) };
      }
      if (owner.kind !== 'resolved') return { kind: 'respond', response: unavailable() };
      return {
        kind: 'resolved',
        subjectId: owner.subjectId,
        action: controlAction('service', requestBody.action),
        context: Object.freeze({
          kind: 'control',
          callerKind: 'service',
          subjectId: owner.subjectId,
          callerUserId: null,
          isInternalCaller: true,
          calendarAccountId: owner.accountId,
          action: requestBody.action,
          requestBody,
        }),
      };
    }

    if (!authenticated) return { kind: 'respond', response: unavailable() };
    return {
      kind: 'resolved',
      subjectId: authenticated,
      action: controlAction('user', requestBody.action),
      context: Object.freeze({
        kind: 'control',
        callerKind: 'user',
        subjectId: authenticated,
        callerUserId: authenticated,
        isInternalCaller: false,
        calendarAccountId: account.calendarAccountId,
        action: requestBody.action,
        requestBody,
      }),
    };
  };
}

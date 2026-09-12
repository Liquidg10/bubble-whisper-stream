import { describe, expect, it, vi } from 'vitest';
import {
  calendarSyncMigrationScope,
  calendarWatchMigrationScope,
} from '../../../supabase/functions/_shared/calendarMigrationScope.ts';
import {
  createCalendarWatchChannelToken,
} from '../../../supabase/functions/_shared/calendarWatchSecurity.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICE_KEY = 'service-role-key';
const ORIGIN = 'https://example.test';

function request(
  body: Record<string, unknown>,
  bearer = 'user-jwt',
  headers: Record<string, string> = {},
): Request {
  return new Request(`${ORIGIN}/functions/v1/calendar-sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function runtime(fetchImpl: ReturnType<typeof vi.fn>) {
  return {
    origin: ORIGIN,
    serviceKey: SERVICE_KEY,
    fetch: fetchImpl as typeof fetch,
    env: () => undefined,
  };
}

describe('calendar-sync mixed migration subject resolution', () => {
  it.each(['GET', 'PUT', 'PATCH', 'DELETE'])('rejects %s before Auth or owner lookup', async method => {
    const fetchImpl = vi.fn();
    const result = await calendarSyncMigrationScope()(new Request(ORIGIN, { method }), runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'sync' }, { action: 'update_event' }, { action: 'renew-all' },
    { action: null }, { action: 1 }, { calendarAccountId: 'not-a-uuid' },
    { calendarAccountId: '00000000-0000-0000-0000-000000000000' },
    { action: 'create_event' }, { action: 'create_event', eventData: [], draft: true },
    { action: 'create_event', eventData: {}, draft: 'true' },
    { action: 'delete_event', eventId: ' ' }, { action: 'delete_event', eventId: 'event', draft: true },
    { fullSync: 'true' }, { simulate410: 1 }, { boundedWindow: null },
    { timeWindow: null }, { timeWindow: { startDays: -1 } }, { timeWindow: { endDays: '90' } },
    { sendUpdates: 'everyone' },
  ])('rejects invalid operation input %j before any upstream work', async fields => {
    const fetchImpl = vi.fn();
    const result = await calendarSyncMigrationScope()(request({ calendarAccountId: ACCOUNT, ...fields }), runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'prepare_reviewed_update', version: 2 },
    { action: 'confirm_reviewed_update', version: 2 },
    { action: 'inspect_reviewed_outcome', version: 1 },
    { action: 'read_reviewed_update_receipt', version: 2 },
    { action: 'create_event', eventData: {}, draft: true },
    { action: 'delete_event', eventId: 'provider-event' },
  ])('emits an exact closed lease action for $action', async fields => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: OWNER }));
    const result = await calendarSyncMigrationScope()(request({ calendarAccountId: ACCOUNT, ...fields }), runtime(fetchImpl));
    expect(result).toMatchObject({ kind: 'resolved', action: `user_${fields.action}`, context: { operation: fields.action } });
  });

  it('bounds a chunked request by actual bytes and cancels before upstream work', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(65_537)); },
      cancel,
    }, { highWaterMark: 0 });
    const incoming = new Request(ORIGIN, {
      method: 'POST', body: stream, duplex: 'half',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json', 'Content-Length': '1' },
    } as RequestInit);
    const fetchImpl = vi.fn();
    const result = await calendarSyncMigrationScope()(incoming, runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('copies a reused stream chunk buffer immediately', async () => {
    let json = JSON.stringify({ calendarAccountId: ACCOUNT });
    if (json.length % 2) json += ' ';
    const parts = [json.slice(0, json.length / 2), json.slice(json.length / 2)];
    const reused = new Uint8Array(parts[0].length);
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index === parts.length) { controller.close(); return; }
        reused.set(new TextEncoder().encode(parts[index++]));
        controller.enqueue(reused);
      },
    }, { highWaterMark: 0 });
    const incoming = new Request(ORIGIN, {
      method: 'POST', body: stream, duplex: 'half', headers: { Authorization: 'Bearer user-token' },
    } as RequestInit);
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: OWNER }));
    const result = await calendarSyncMigrationScope()(incoming, runtime(fetchImpl));
    expect(result).toMatchObject({ kind: 'resolved', context: { calendarAccountId: ACCOUNT } });
  });

  it('rejects unbounded empty chunks without waiting for a stalled cancel', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    let reads = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { reads += 1; controller.enqueue(new Uint8Array(0)); },
      cancel,
    }, { highWaterMark: 0 });
    const incoming = new Request(ORIGIN, { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    const fetchImpl = vi.fn();
    const result = await calendarSyncMigrationScope()(incoming, runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(400);
    expect(reads).toBe(1025);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('bounds a stalled read and permanently pending cancellation with one deadline', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const stream = new ReadableStream<Uint8Array>({ pull() { return new Promise<void>(() => {}); }, cancel });
      const incoming = new Request(ORIGIN, { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
      const fetchImpl = vi.fn();
      const resultPromise = calendarSyncMigrationScope()(incoming, runtime(fetchImpl));
      await vi.advanceTimersByTimeAsync(5001);
      const result = await resultPromise;
      expect(result.kind).toBe('respond');
      if (result.kind === 'respond') expect(result.response.status).toBe(400);
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not restart the deadline for each late chunk or admit work after timeout', async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      const cancel = vi.fn();
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel });
      const incoming = new Request(ORIGIN, { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
      const fetchImpl = vi.fn();
      const resultPromise = calendarSyncMigrationScope()(incoming, runtime(fetchImpl));
      await vi.advanceTimersByTimeAsync(3000);
      controller.enqueue(encoder.encode('{"calendarAccountId":'));
      await vi.advanceTimersByTimeAsync(2001);
      const result = await resultPromise;
      expect(result.kind).toBe('respond');
      if (result.kind === 'respond') expect(result.response.status).toBe(400);
      expect(cancel).toHaveBeenCalledOnce();
      expect(() => controller.enqueue(encoder.encode(JSON.stringify(ACCOUNT) + '}'))).toThrow();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded'])('rejects %s before reading or upstream work', async contentType => {
    const fetchImpl = vi.fn();
    const incoming = request({ calendarAccountId: ACCOUNT }, 'user-token', { 'Content-Type': contentType });
    const result = await calendarSyncMigrationScope()(incoming, runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(400);
    expect(incoming.bodyUsed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the verified Auth user and ignores a body-supplied subject', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: OWNER }));
    const result = await calendarSyncMigrationScope()(
      request({ calendarAccountId: ACCOUNT, userId: OTHER }),
      runtime(fetchImpl),
    );

    expect(result).toMatchObject({
      kind: 'resolved',
      subjectId: OWNER,
      action: 'user_sync',
      context: {
        kind: 'user',
        subjectId: OWNER,
        callerUserId: OWNER,
        isInternalCaller: false,
        calendarAccountId: ACCOUNT,
      },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${ORIGIN}/auth/v1/user`);
  });

  it('maps the exact service-role child call through the account row owner', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json([{ id: ACCOUNT, user_id: OWNER }]));
    const result = await calendarSyncMigrationScope()(
      request({ calendarAccountId: ACCOUNT, userId: OTHER }, SERVICE_KEY),
      runtime(fetchImpl),
    );

    expect(result).toMatchObject({
      kind: 'resolved',
      subjectId: OWNER,
      action: 'service_sync',
      context: {
        kind: 'service',
        subjectId: OWNER,
        callerUserId: null,
        isInternalCaller: true,
        calendarAccountId: ACCOUNT,
      },
    });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/rest/v1/calendar_accounts');
    expect(url.searchParams.get('select')).toBe('id,user_id');
    expect(url.searchParams.get('id')).toBe(`eq.${ACCOUNT}`);
    expect(url.searchParams.get('limit')).toBe('2');
  });

  it('does not treat a service-key prefix as an internal caller', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const result = await calendarSyncMigrationScope()(
      request({ calendarAccountId: ACCOUNT }, `${SERVICE_KEY}-extra`),
      runtime(fetchImpl),
    );
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(401);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${ORIGIN}/auth/v1/user`);
  });

  it.each([
    { rows: [], status: 404 },
    { rows: [{ id: ACCOUNT, user_id: OWNER }, { id: ACCOUNT, user_id: OTHER }], status: 503 },
    { rows: [{ id: ACCOUNT, user_id: 'not-a-user' }], status: 503 },
  ])('fails closed for a missing or ambiguous service account mapping', async ({ rows, status }) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(rows));
    const result = await calendarSyncMigrationScope()(
      request({ calendarAccountId: ACCOUNT }, SERVICE_KEY),
      runtime(fetchImpl),
    );
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(status);
  });
});

describe('calendar-watch mixed migration subject resolution', () => {
  it('authenticates user control and emits only a closed action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: OWNER }));
    const result = await calendarWatchMigrationScope()(
      request({ action: 'renew', calendarAccountId: ACCOUNT }),
      runtime(fetchImpl),
    );
    expect(result).toMatchObject({
      kind: 'resolved',
      subjectId: OWNER,
      action: 'user_renew',
      context: {
        kind: 'control',
        callerKind: 'user',
        subjectId: OWNER,
        calendarAccountId: ACCOUNT,
        action: 'renew',
      },
    });
  });

  it('maps exact service-role control through the specific account owner', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json([{ id: ACCOUNT, user_id: OWNER }]));
    const result = await calendarWatchMigrationScope()(
      request({ action: 'renew', calendarAccountId: ACCOUNT, userId: OTHER }, SERVICE_KEY),
      runtime(fetchImpl),
    );
    expect(result).toMatchObject({
      kind: 'resolved',
      subjectId: OWNER,
      action: 'service_renew',
      context: {
        kind: 'control',
        callerKind: 'service',
        isInternalCaller: true,
        calendarAccountId: ACCOUNT,
      },
    });
  });

  it('verifies callback HMAC before lookup and resolves only an active channel/resource row', async () => {
    const secret = 'test-calendar-watch-secret';
    const channelId = 'calendar-channel';
    const resourceId = 'google-resource';
    const token = await createCalendarWatchChannelToken(channelId, secret);
    const fetchImpl = vi.fn().mockResolvedValue(Response.json([{ id: ACCOUNT, user_id: OWNER }]));
    const incoming = request({}, 'unused', {
      'X-Goog-Channel-Id': channelId,
      'X-Goog-Resource-Id': resourceId,
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Channel-Token': token,
    });
    const result = await calendarWatchMigrationScope({ env: () => secret })(incoming, runtime(fetchImpl));

    expect(result).toMatchObject({
      kind: 'resolved',
      subjectId: OWNER,
      action: 'provider_exists',
      context: {
        kind: 'provider',
        subjectId: OWNER,
        calendarAccountId: ACCOUNT,
        channelId,
        resourceId,
      },
    });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get('watch_channel_id')).toBe(`eq.${channelId}`);
    expect(url.searchParams.get('watch_resource_id')).toBe(`eq.${resourceId}`);
    expect(url.searchParams.get('watch_status')).toBe('eq.active');
    expect(url.searchParams.get('limit')).toBe('2');
  });

  it('rejects a forged callback before any account lookup', async () => {
    const fetchImpl = vi.fn();
    const incoming = request({}, 'unused', {
      'X-Goog-Channel-Id': 'calendar-channel',
      'X-Goog-Resource-Id': 'google-resource',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Channel-Token': 'forged',
    });
    const result = await calendarWatchMigrationScope({ env: () => 'secret' })(incoming, runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['sync', 'not_exists'])('acknowledges authenticated %s no-op callbacks without admission or lookup', async resourceState => {
    const secret = 'test-calendar-watch-secret';
    const channelId = 'calendar-channel';
    const token = await createCalendarWatchChannelToken(channelId, secret);
    const fetchImpl = vi.fn();
    const incoming = request({}, 'unused', {
      'X-Goog-Channel-Id': channelId,
      'X-Goog-Resource-Id': 'google-resource',
      'X-Goog-Resource-State': resourceState,
      'X-Goog-Channel-Token': token,
    });
    const result = await calendarWatchMigrationScope({ env: () => secret })(incoming, runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') {
      expect(result.response.status).toBe(200);
      await expect(result.response.text()).resolves.toBe('OK');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('acknowledges a valid callback whose active account mapping no longer exists', async () => {
    const secret = 'test-calendar-watch-secret';
    const channelId = 'calendar-channel';
    const token = await createCalendarWatchChannelToken(channelId, secret);
    const fetchImpl = vi.fn().mockResolvedValue(Response.json([]));
    const incoming = request({}, 'unused', {
      'X-Goog-Channel-Id': channelId,
      'X-Goog-Resource-Id': 'google-resource',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Channel-Token': token,
    });
    const result = await calendarWatchMigrationScope({ env: () => secret })(incoming, runtime(fetchImpl));
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') expect(result.response.status).toBe(200);
  });
});

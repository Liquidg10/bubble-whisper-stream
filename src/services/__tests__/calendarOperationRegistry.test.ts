import { describe, expect, it, vi } from 'vitest';
import {
  type CalendarOperationIdentity,
  type CalendarOperationResult,
} from '../../../supabase/functions/_shared/calendarOperationReceiptContract.ts';
import {
  type CalendarOperationRegistry,
  createCalendarOperationRegistry,
} from '../../../supabase/functions/calendar-sync/calendarOperationRegistry.ts';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER_OWNER = '20000000-0000-4000-8000-000000000002';
const CLAIM = '30000000-0000-4000-8000-000000000003';
const NIL = '00000000-0000-0000-0000-000000000000';
const UNAVAILABLE = 'Calendar operation registry unavailable';
const identity = (): CalendarOperationIdentity => ({
  operationId: '40000000-0000-4000-8000-000000000004',
  taskId: 'synthetic-task', calendarAccountId: '50000000-0000-4000-8000-000000000005',
  eventId: 'synthetic-event', googleCalendarId: 'synthetic@example.test',
  expectedEtag: '"before"', requestDigest: 'a'.repeat(64), afterDigest: 'b'.repeat(64),
});
const written = (): CalendarOperationResult => ({ outcome: 'written', etag: '"after"', cacheUpdated: true });
const methods = ['claimOperation', 'readOperation', 'finalizeOperation'] as const;

function invoke(registry: CalendarOperationRegistry, method: typeof methods[number], owner = OWNER, value = identity()) {
  return method === 'finalizeOperation'
    ? registry.finalizeOperation(owner, value, CLAIM, written())
    : registry[method](owner, value);
}

describe('Calendar operation registry RPC boundary', () => {
  it.each([
    ['claimOperation', 'calendar_operation_claim'],
    ['readOperation', 'calendar_operation_read'],
    ['finalizeOperation', 'calendar_operation_finalize'],
  ] as const)('uses only the exact %s RPC and arguments', async (method, name) => {
    const data = { unknownDatabaseShape: true };
    const rpc = vi.fn(async () => ({ data, error: null }));
    const value = identity();
    expect(await invoke(createCalendarOperationRegistry(rpc), method, OWNER, value)).toBe(data);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(name, {
      p_owner: OWNER, p_identity: value,
      ...(method === 'finalizeOperation' ? { p_claim_token: CLAIM, p_result: written() } : {}),
    });
  });

  it.each(methods)('binds %s to the explicit verified owner without retaining another caller', async method => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null }));
    const registry = createCalendarOperationRegistry(rpc);
    await invoke(registry, method);
    await invoke(registry, method, OTHER_OWNER);
    expect(rpc.mock.calls.map(([, args]) => args.p_owner)).toEqual([OWNER, OTHER_OWNER]);
  });

  it.each([null, undefined, '', NIL, 'OWNER', 'A0000000-0000-4000-8000-000000000001', `${OWNER}\n`, 42, { user_id: OWNER }])(
    'rejects invalid owner %j without an RPC', async owner => {
      const rpc = vi.fn(async () => ({ data: null, error: null }));
      const registry = createCalendarOperationRegistry(rpc);
      for (const method of methods) await expect(method === 'finalizeOperation'
        ? registry.finalizeOperation(owner as string, identity(), CLAIM, written())
        : registry[method](owner as string, identity())).rejects.toThrow(UNAVAILABLE);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['operation UUID', { operationId: 'invalid' }], ['nil operation', { operationId: NIL }],
    ['nil account', { calendarAccountId: NIL }], ['task traversal', { taskId: '../task' }],
    ['event traversal', { eventId: '../event' }], ['oversized task', { taskId: 'x'.repeat(257) }],
    ['blank Google calendar', { googleCalendarId: '' }], ['Google calendar alias', { googleCalendarId: 'primary' }],
    ['Google wildcard', { googleCalendarId: '*' }], ['Google control', { googleCalendarId: 'id\u0000' }],
    ['Google whitespace', { googleCalendarId: 'synthetic@example.test ' }],
    ['wildcard ETag', { expectedEtag: '*' }], ['weak ETag', { expectedEtag: 'W/"before"' }],
    ['malformed request digest', { requestDigest: 'A'.repeat(64) }], ['short result digest', { afterDigest: 'b' }],
    ['extra owner', { ownerUserId: OTHER_OWNER }], ['extra secret', { access_token: 'PRIVATE_VALUE' }],
  ])('rejects identity with %s before every RPC', async (_label, change) => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const registry = createCalendarOperationRegistry(rpc);
    const value = { ...identity(), ...change } as CalendarOperationIdentity;
    for (const method of methods) await expect(invoke(registry, method, OWNER, value)).rejects.toThrow(UNAVAILABLE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], Object.create(identity())])('rejects non-own or non-record identity %j', async value => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const registry = createCalendarOperationRegistry(rpc);
    for (const method of methods) await expect(method === 'finalizeOperation'
      ? registry.finalizeOperation(OWNER, value as CalendarOperationIdentity, CLAIM, written())
      : registry[method](OWNER, value as CalendarOperationIdentity)).rejects.toThrow(UNAVAILABLE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects each missing identity property', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const registry = createCalendarOperationRegistry(rpc);
    for (const key of Object.keys(identity())) {
      const value = { ...identity() } as unknown as Record<string, unknown>;
      delete value[key];
      await expect(registry.claimOperation(OWNER, value as unknown as CalendarOperationIdentity)).rejects.toThrow(UNAVAILABLE);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects identity getters without evaluating or forwarding them', async () => {
    const getter = vi.fn(() => 'PRIVATE_VALUE');
    const value = Object.defineProperty(identity(), 'eventId', { enumerable: true, get: getter });
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const registry = createCalendarOperationRegistry(rpc);
    for (const method of methods) await expect(invoke(registry, method, OWNER, value)).rejects.toThrow(UNAVAILABLE);
    expect(getter).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects symbol and non-enumerable extras instead of forwarding them', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const registry = createCalendarOperationRegistry(rpc);
    const hidden = Object.defineProperty(identity(), 'secret', { value: 'PRIVATE_VALUE' });
    const symbol = Object.assign(identity(), { [Symbol('secret')]: 'PRIVATE_VALUE' });
    for (const value of [hidden, symbol]) await expect(registry.readOperation(OWNER, value)).rejects.toThrow(UNAVAILABLE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(methods)('takes a detached identity snapshot for %s before awaiting RPC', async method => {
    let settle!: (value: { data: unknown; error: unknown }) => void;
    const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => new Promise<{ data: unknown; error: unknown }>(resolve => { settle = resolve; }));
    const value = identity(); const expected = identity();
    const pending = invoke(createCalendarOperationRegistry(rpc), method, OWNER, value);
    value.eventId = 'changed-after-dispatch'; value.requestDigest = 'c'.repeat(64);
    expect(rpc.mock.calls[0][1].p_identity).toEqual(expected);
    expect(rpc.mock.calls[0][1].p_identity).not.toBe(value);
    settle({ data: null, error: null }); await pending;
  });

  it('accepts null-prototype own data records but sends a detached plain identity', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null }));
    const value = Object.assign(Object.create(null), identity());
    await createCalendarOperationRegistry(rpc).claimOperation(OWNER, value);
    expect(rpc.mock.calls[0][1].p_identity).toEqual(identity());
    expect(Object.getPrototypeOf(rpc.mock.calls[0][1].p_identity)).toBe(Object.prototype);
  });

  it.each([null, undefined, '', NIL, 'nonce', 'A0000000-0000-4000-8000-000000000003', `${CLAIM}\n`, 42])('rejects invalid claim nonce %j', async claimToken => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(createCalendarOperationRegistry(rpc).finalizeOperation(OWNER, identity(), claimToken as string, written())).rejects.toThrow(UNAVAILABLE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { outcome: 'written', etag: '"after"', cacheUpdated: true },
    { outcome: 'not_written', code: 'provider_rejected' },
    { outcome: 'uncertain', code: 'provider_outcome_unknown' },
    { outcome: 'provider_written_cache_unknown', etag: '"after"', cacheUpdated: false },
  ] as const)('passes the exact contract result %j without changing partial outcomes', async result => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: 'unvalidated', error: null }));
    expect(await createCalendarOperationRegistry(rpc).finalizeOperation(OWNER, identity(), CLAIM, result)).toBe('unvalidated');
    expect(rpc.mock.calls[0][1].p_result).toEqual(result);
    expect(rpc.mock.calls[0][1].p_result).not.toBe(result);
  });

  it.each([
    null, undefined, [], {},
    { outcome: 'written', etag: '"before"', cacheUpdated: true },
    { outcome: 'written', etag: '*', cacheUpdated: true },
    { outcome: 'written', etag: '"after"', cacheUpdated: false },
    { outcome: 'provider_written_cache_unknown', etag: '"after"', cacheUpdated: true },
    { outcome: 'provider_written_cache_unknown', etag: '"before"', cacheUpdated: false },
    { outcome: 'uncertain', code: 'provider_rejected' },
    { outcome: 'not_written', code: 'provider_outcome_unknown' },
    { outcome: 'not_written', code: 'unknown' },
    { ...written(), rawProviderBody: 'PRIVATE_VALUE' },
    Object.create(written()),
  ])('rejects invalid or contradictory result %j before RPC', async result => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(createCalendarOperationRegistry(rpc).finalizeOperation(OWNER, identity(), CLAIM, result as CalendarOperationResult)).rejects.toThrow(UNAVAILABLE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects result getters without evaluating them', async () => {
    const getter = vi.fn(() => 'PRIVATE_VALUE');
    const result = Object.defineProperty(written(), 'etag', { enumerable: true, get: getter });
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(createCalendarOperationRegistry(rpc).finalizeOperation(OWNER, identity(), CLAIM, result)).rejects.toThrow(UNAVAILABLE);
    expect(getter).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });

  it('takes a detached result snapshot before awaiting finalization', async () => {
    let settle!: (value: { data: unknown; error: unknown }) => void;
    const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => new Promise<{ data: unknown; error: unknown }>(resolve => { settle = resolve; }));
    const result = written();
    const pending = createCalendarOperationRegistry(rpc).finalizeOperation(OWNER, identity(), CLAIM, result);
    Object.assign(result, { etag: '"changed"', rawProviderBody: 'PRIVATE_VALUE' });
    expect(rpc.mock.calls[0][1].p_result).toEqual(written());
    settle({ data: null, error: null }); await pending;
  });

  it.each(methods)('sanitizes returned RPC errors for %s without retrying or logging', async method => {
    const rpc = vi.fn(async () => ({ data: { sensitive: 'PRIVATE_VALUE' }, error: { message: 'PRIVATE_VALUE', details: 'SECRET' } }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(invoke(createCalendarOperationRegistry(rpc), method)).rejects.toEqual(new Error(UNAVAILABLE));
      expect(rpc).toHaveBeenCalledTimes(1); expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it.each(methods)('sanitizes rejected or synchronous RPC failures for %s', async method => {
    for (const rpc of [vi.fn(async () => { throw new Error('PRIVATE_VALUE'); }), vi.fn(() => { throw 'PRIVATE_VALUE'; })]) {
      await expect(invoke(createCalendarOperationRegistry(rpc), method)).rejects.toEqual(new Error(UNAVAILABLE));
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it.each([null, undefined, {}, { data: null }, { error: null }, { data: null, error: false }])('rejects malformed RPC envelope %j', async value => {
    const rpc = vi.fn(async () => value as { data: unknown; error: unknown });
    await expect(createCalendarOperationRegistry(rpc).readOperation(OWNER, identity())).rejects.toEqual(new Error(UNAVAILABLE));
  });

  it.each([null, undefined, false, 42, 'PRIVATE_DATABASE_VALUE', [], { state: 'written', forged: true }])(
    'leaves unknown successful database data %j for strict handler validation', async data => {
      const rpc = vi.fn(async () => ({ data, error: null }));
      const registry = createCalendarOperationRegistry(rpc);
      for (const method of methods) expect(await invoke(registry, method)).toBe(data);
    },
  );

  it('sanitizes hostile input reflection failures without an RPC', async () => {
    const value = new Proxy(identity(), { ownKeys: () => { throw new Error('PRIVATE_VALUE'); } });
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(createCalendarOperationRegistry(rpc).claimOperation(OWNER, value)).rejects.toEqual(new Error(UNAVAILABLE));
    expect(rpc).not.toHaveBeenCalled();
  });
});

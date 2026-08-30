import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarTaskSyncManager, calendarSyncStorageKey, type CalendarTaskMapping, type SyncConflict } from '../calendarTaskSyncManager';
import type { Task } from '@/types/task';

const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), read: vi.fn(), invoke: vi.fn(), getState: vi.fn(), addTask: vi.fn(), updateTask: vi.fn(), draft: vi.fn(), confirm: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mock.getUser }, from: mock.from, functions: { invoke: mock.invoke } } }));
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: mock.getState } }));
vi.mock('@/services/calendarWriteService', () => ({ calendarWriteService: { createEventDraft: mock.draft, confirmDraft: mock.confirm } }));

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const accountId = '33333333-3333-4333-8333-333333333333';
const otherAccountId = '44444444-4444-4444-8444-444444444444';
const eventId = 'event-a';
const interval = 15 * 60 * 1000;
type Row = Record<string, unknown>;
type Query = { table: string; filters: [string, unknown][]; single: boolean; limit?: number };
type ReadResult = { data: Row | Row[] | null; error: Error | null };
type ImportOptions = { origin: 'calendar-import'; ownerUserId: string; isCurrent: () => boolean };
const canonical = (overrides: Row = {}): Row => ({
  user_id: owner, calendar_account_id: accountId, external_event_id: eventId,
  title: 'Canonical title', start_time: '2026-09-01T10:00:00.000Z', end_time: '2026-09-01T11:00:00.000Z',
  location: 'Canonical place', description: 'Canonical description', ...overrides,
});
const mapping = (overrides: Partial<CalendarTaskMapping> = {}): CalendarTaskMapping => ({
  taskId: 'task-a', eventId, calendarAccountId: accountId, lastSyncedAt: 1,
  syncDirection: 'calendar-to-task', conflictStatus: 'none', ...overrides,
});
const conflict = (overrides: Partial<SyncConflict> = {}): SyncConflict => ({
  id: 'conflict-a', taskId: 'task-a', eventId, conflictType: 'title', taskValue: 'Local title',
  calendarValue: 'Old cached title', timestamp: 1, ...overrides,
});
function envelope(mappings: unknown[] = [], conflicts: unknown[] = [], unresolvedOperations: unknown[] = [], ownerUserId = owner) {
  return { version: 1, ownerUserId, mappings, conflicts, unresolvedOperations };
}
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-a', title: 'Canonical title', description: 'Canonical description', type: 'event', priority: 50,
    completed: false, tags: [], createdAt: 1, updatedAt: Date.now(),
    metadata: { userId: owner, calendarImport: { calendarAccountId: accountId, eventId } },
    view: { calendar: { startTime: '2026-09-01T10:00:00.000Z', durationMin: 60, location: 'Canonical place', calendarId: accountId } },
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('owner-bound Calendar task synchronization lifecycle', () => {
  let manager: CalendarTaskSyncManager;
  let managers: CalendarTaskSyncManager[];
  let tasks: Map<string, Task>;
  let tables: Record<string, Row[]>;
  let authOwner: string | null;
  const makeManager = () => {
    const service = new CalendarTaskSyncManager();
    managers.push(service);
    return service;
  };
  const readRows = (query: Query): ReadResult => {
    const rows = (tables[query.table] ?? []).filter(row => query.filters.every(([column, value]) => row[column] === value));
    return { data: query.single ? rows[0] ?? null : rows.slice(0, query.limit), error: null };
  };
  const seed = (value: unknown, id = owner) => localStorage.setItem(calendarSyncStorageKey(id), JSON.stringify(value));
  const request = () => manager.syncCalendarToTask(eventId, { calendar_account_id: accountId, title: 'Untrusted caller title', user_id: other });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T10:00:00.000Z'));
    vi.resetAllMocks();
    localStorage.clear();
    managers = [];
    tasks = new Map();
    authOwner = owner;
    tables = {
      calendar_accounts: [{ id: accountId, user_id: owner, sync_enabled: true }],
      calendar_events: [canonical()],
    };
    mock.getUser.mockImplementation(async () => ({ data: { user: authOwner ? { id: authOwner } : null }, error: null }));
    mock.read.mockImplementation(async (query: Query) => readRows(query));
    mock.from.mockImplementation((table: string) => {
      const spec: Query = { table, filters: [], single: false };
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((column: string, value: unknown) => { spec.filters.push([column, value]); return builder; }),
        single: vi.fn(() => { spec.single = true; return builder; }),
        limit: vi.fn((limit: number) => { spec.limit = limit; return builder; }),
        then: (resolve: (value: ReadResult) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(mock.read(spec)).then(resolve, reject),
      };
      return builder;
    });
    const store = { get tasks() { return [...tasks.values()]; }, getTask: (id: string) => tasks.get(id), addTask: mock.addTask, updateTask: mock.updateTask };
    mock.getState.mockReturnValue(store);
    mock.addTask.mockImplementation(async (data: Omit<Task, 'id'>, options: ImportOptions) => {
      if (!options.isCurrent()) throw new Error('stale');
      const created = { ...data, id: `generated-${mock.addTask.mock.calls.length}` };
      tasks.set(created.id, created);
      return created;
    });
    mock.updateTask.mockImplementation(async (id: string, updates: Partial<Task>, options: ImportOptions) => {
      if (!options.isCurrent()) throw new Error('stale');
      const current = tasks.get(id);
      if (!current) throw new Error('missing');
      tasks.set(id, { ...current, ...updates, id });
    });
    manager = makeManager();
  });
  afterEach(() => {
    for (const service of managers) service.stop();
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.draft).not.toHaveBeenCalled();
    expect(mock.confirm).not.toHaveBeenCalled();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('has no constructor storage, timer, auth, or provider effects', () => {
    const read = vi.spyOn(localStorage, 'getItem');
    const write = vi.spyOn(localStorage, 'setItem');
    makeManager();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts once per owner and clears even a zero-valued timer handle', () => {
    const timers = vi.spyOn(globalThis, 'setInterval').mockReturnValueOnce(0 as unknown as ReturnType<typeof setInterval>);
    const clear = vi.spyOn(globalThis, 'clearInterval');
    manager.start(owner);
    manager.start(owner);
    expect(timers).toHaveBeenCalledTimes(1);
    manager.stop();
    expect(clear).toHaveBeenCalledWith(0);
    expect(manager.getStatus()).toMatchObject({ isRunning: false, ownerUserId: null });
  });

  it.each(['', 'owner', owner.toUpperCase().replace('1', 'A'), '00000000-0000-0000-0000-000000000000'])('rejects invalid owner IDs before state reads: %s', invalid => {
    const read = vi.spyOn(localStorage, 'getItem');
    expect(() => manager.start(invalid)).toThrow(/canonical owner/);
    expect(read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts canonical nonnil UUID shapes without excluding newer UUID versions', () => {
    manager.start('12345678-1234-7234-a234-123456789abc');
    expect(manager.getStatus().isRunning).toBe(true);
  });

  it('keeps the 15-minute timer read-only and never automatically imports events', async () => {
    tasks.set('task-a', task({ metadata: { userId: owner } }));
    manager.start(owner);
    await vi.advanceTimersByTimeAsync(interval * 4);
    expect(mock.getUser).toHaveBeenCalledTimes(4);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.addTask).not.toHaveBeenCalled();
    expect(mock.updateTask).not.toHaveBeenCalled();
    expect(localStorage.getItem(calendarSyncStorageKey(owner))).toBeNull();
  });

  it('stopped or unauthenticated explicit sync cannot read or write Calendar data', async () => {
    expect((await manager.performFullSync()).errors).toHaveLength(1);
    expect((await request()).success).toBe(false);
    manager.start(owner);
    authOwner = null;
    expect((await manager.performFullSync()).errors).toHaveLength(1);
    expect((await request()).success).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.addTask).not.toHaveBeenCalled();
  });

  it('all outgoing methods and unsupported resolutions require review without partial mutations', async () => {
    manager.start(owner);
    const result = await manager.syncTaskToCalendar(task());
    expect(result).toMatchObject({ success: false, reviewRequired: true });
    expect(result.message).toMatch(/review/);
    for (const resolution of ['prefer-task', 'merge', 'manual'] as const) expect(await manager.resolveConflict('conflict-a', resolution, { title: 'ignored' })).toBe(false);
    expect(await manager.removeMapping('task-a')).toBe(false);
    expect(mock.addTask).not.toHaveBeenCalled();
    expect(mock.updateTask).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('refetches canonical owned event data and records the actual returned task ID', async () => {
    manager.start(owner);
    const result = await request();
    expect(result).toMatchObject({ success: true, written: true, taskId: 'generated-1' });
    const [data, options] = mock.addTask.mock.calls[0];
    expect(data.title).toBe('Canonical title');
    expect(data.metadata).toEqual({ userId: owner, calendarImport: { calendarAccountId: accountId, eventId } });
    expect(options).toMatchObject({ origin: 'calendar-import', ownerUserId: owner });
    expect(options.isCurrent()).toBe(true);
    expect(manager.getMappingByEventId(eventId)?.taskId).toBe('generated-1');
    expect(manager.getStatus().unresolvedOperations).toBe(0);
    for (const [spec] of mock.read.mock.calls) {
      expect(spec.filters).toContainEqual(['user_id', owner]);
      expect(spec.filters).toContainEqual([spec.table === 'calendar_accounts' ? 'id' : 'calendar_account_id', accountId]);
    }
    const stored = JSON.parse(localStorage.getItem(calendarSyncStorageKey(owner))!);
    expect(stored.unresolvedOperations).toEqual([]);
    expect(stored.mappings[0].taskId).toBe('generated-1');
  });

  it('coalesces duplicate manual imports and full syncs in one non-overlapping admission lane', async () => {
    const pending = deferred<ReadResult>();
    mock.read.mockImplementationOnce(() => pending.promise);
    manager.start(owner);
    const first = request();
    expect(request()).toBe(first);
    const full = manager.performFullSync();
    expect(manager.performFullSync()).toBe(full);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.read).toHaveBeenCalledTimes(1);
    pending.resolve({ data: tables.calendar_accounts[0], error: null });
    await Promise.all([first, full]);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
    expect(mock.updateTask).not.toHaveBeenCalled();
    expect(manager.getStatus().pendingOperations).toBe(0);
  });

  it.each(['account', 'event', 'auth'] as const)('drops late %s metadata after an owner change', async boundary => {
    const pending = deferred<ReadResult>();
    const auth = deferred<{ data: { user: { id: string } }; error: null }>();
    if (boundary === 'auth') mock.getUser.mockReturnValueOnce(auth.promise);
    else mock.read.mockImplementation((spec: Query) => spec.table === (boundary === 'account' ? 'calendar_accounts' : 'calendar_events') ? pending.promise : readRows(spec));
    manager.start(owner);
    const result = request();
    await vi.advanceTimersByTimeAsync(0);
    manager.start(other);
    authOwner = other;
    if (boundary === 'auth') auth.resolve({ data: { user: { id: owner } }, error: null });
    else pending.resolve({ data: boundary === 'account' ? tables.calendar_accounts[0] : canonical(), error: null });
    expect((await result).success).toBe(false);
    expect(mock.addTask).not.toHaveBeenCalled();
    expect(mock.updateTask).not.toHaveBeenCalled();
    expect(manager.getMappingByEventId(eventId)).toBeUndefined();
    expect(localStorage.getItem(calendarSyncStorageKey(other))).toBeNull();
  });

  it('retains an already-dispatched local write across stop/restart and never repeats its uncertain import', async () => {
    const pending = deferred<Task>();
    mock.addTask.mockReturnValueOnce(pending.promise);
    manager.start(owner);
    const first = request();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({ pendingOperations: 1, unresolvedOperations: 1 });
    const durableHold = JSON.parse(localStorage.getItem(calendarSyncStorageKey(owner))!);
    expect(durableHold.unresolvedOperations).toEqual([JSON.stringify([accountId, eventId])]);
    manager.stop();
    expect(mock.addTask.mock.calls[0][1].isCurrent()).toBe(false);
    manager.start(owner);
    const restart = request();
    const committed = task({ id: 'committed-after-stop' });
    tasks.set(committed.id, committed);
    pending.resolve(committed);
    expect((await first).success).toBe(false);
    expect((await restart).success).toBe(false);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().unresolvedOperations).toBe(1);
    const reloaded = makeManager();
    reloaded.start(owner);
    expect((await reloaded.syncCalendarToTask(eventId, { calendar_account_id: accountId })).success).toBe(false);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
  });

  it('retains uncertainty when local persistence rejects and sanitizes the returned message', async () => {
    mock.addTask.mockRejectedValueOnce(new Error('SECRET_PRIVATE_PATH'));
    manager.start(owner);
    const result = await request();
    expect(result).toMatchObject({ success: false, reviewRequired: true });
    expect(JSON.stringify(result)).not.toContain('SECRET_PRIVATE_PATH');
    manager.stop(); manager.start(owner);
    await request();
    expect(mock.addTask).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().unresolvedOperations).toBe(1);
  });

  it('requires the pre-write hold to persist before starting a local transaction', async () => {
    manager.start(owner);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect((await request()).success).toBe(false);
    expect(mock.addTask).not.toHaveBeenCalled();
    expect(manager.getStatus().unresolvedOperations).toBeGreaterThan(0);
  });

  it('keeps the durable hold if recording the verified mapping fails after the local write', async () => {
    manager.start(owner);
    const original = localStorage.setItem.bind(localStorage);
    let writes = 0;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (++writes === 2) throw new Error('mapping quota');
      return original(key, value);
    });
    expect((await request()).success).toBe(false);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(calendarSyncStorageKey(owner))!).unresolvedOperations).toHaveLength(1);
    expect(manager.getMappingByEventId(eventId)).toBeUndefined();
  });

  it('rejects foreign account/event responses even when the transport ignores query filters', async () => {
    manager.start(owner);
    mock.read.mockImplementation(async (spec: Query) => ({ data: spec.table === 'calendar_accounts' ? tables.calendar_accounts[0] : canonical({ user_id: other }), error: null }));
    expect((await request()).success).toBe(false);
    expect(mock.addTask).not.toHaveBeenCalled();
  });

  it.each([undefined, { userId: other }, { userId: owner }])('never adopts or mutates an unverified existing task: %j', metadata => {
    seed(envelope([mapping()]));
    tasks.set('task-a', task({ metadata }));
    manager.start(owner);
    return request().then(result => {
      expect(result).toMatchObject({ success: false, reviewRequired: true });
      expect(mock.addTask).not.toHaveBeenCalled();
      expect(mock.updateTask).not.toHaveBeenCalled();
    });
  });

  it('defers an existing owned import with missing association instead of creating a duplicate', async () => {
    tasks.set('task-a', task());
    manager.start(owner);
    expect((await request()).success).toBe(false);
    expect(mock.addTask).not.toHaveBeenCalled();
  });

  it('counts only verified local writes and reports outgoing/legacy work as review-required', async () => {
    tasks.set('local', task({ id: 'local', metadata: { userId: owner } }));
    tasks.set('legacy', task({ id: 'legacy', metadata: undefined }));
    tasks.set('foreign', task({ id: 'foreign', metadata: { userId: other } }));
    manager.start(owner);
    const result = await manager.performFullSync();
    expect(result).toEqual({ tasksProcessed: 0, eventsProcessed: 1, conflictsDetected: 0, reviewRequired: 2, errors: [] });
    const second = await manager.performFullSync();
    expect(second.eventsProcessed).toBe(0);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
  });

  it('does not erase saved mappings when inventory reads fail', async () => {
    seed(envelope([mapping()]));
    const before = localStorage.getItem(calendarSyncStorageKey(owner));
    manager.start(owner);
    mock.read.mockResolvedValueOnce({ data: null, error: new Error('PRIVATE_ACCOUNT') });
    const result = await manager.performFullSync();
    expect(result.errors).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ACCOUNT');
    expect(manager.getMappingByEventId(eventId)?.taskId).toBe('task-a');
    expect(localStorage.getItem(calendarSyncStorageKey(owner))).toBe(before);
  });

  it('leaves legacy unscoped keys untouched and reads only the active owner envelope', () => {
    localStorage.setItem('calendar-task-mappings', JSON.stringify({ legacy: mapping() }));
    localStorage.setItem('calendar-task-conflicts', JSON.stringify({ legacy: conflict() }));
    seed(envelope([mapping()]));
    seed(envelope([], [], [], other), other);
    manager.start(owner);
    expect(manager.getMappingByTaskId('task-a')).toBeDefined();
    manager.start(other);
    expect(manager.getMappingByTaskId('task-a')).toBeUndefined();
    expect(manager.getPendingConflicts()).toEqual([]);
    expect(localStorage.getItem('calendar-task-mappings')).toContain('legacy');
    expect(localStorage.getItem('calendar-task-conflicts')).toContain('legacy');
    manager.start(owner);
    expect(manager.getMappingByTaskId('task-a')).toBeDefined();
  });

  it.each([
    { ...envelope(), ownerUserId: other }, { ...envelope(), version: 2 }, { ...envelope(), extra: true },
    envelope([{ ...mapping(), syncDirection: ['calendar-to-task'] }]),
    envelope([{ ...mapping(), conflictStatus: ['none'] }]),
    envelope([mapping()], [{ ...conflict(), conflictType: ['title'] }]),
    envelope([mapping()], [{ ...conflict(), resolution: ['prefer-calendar'] }]),
    envelope([mapping()], [{ ...conflict(), taskValue: { private: 'payload' } }]),
    envelope([mapping(), mapping()]), envelope([], [conflict()]), envelope([], [], ['not-json']),
  ])('rejects malformed/foreign/coercible owner envelopes without overwriting them: %j', async value => {
    seed(value);
    const before = localStorage.getItem(calendarSyncStorageKey(owner));
    manager.start(owner);
    expect(manager.getMappingByTaskId('task-a')).toBeUndefined();
    expect(manager.getPendingConflicts()).toEqual([]);
    expect((await request()).success).toBe(false);
    expect(mock.addTask).not.toHaveBeenCalled();
    expect(localStorage.getItem(calendarSyncStorageKey(owner))).toBe(before);
    expect(manager.getStatus().unresolvedOperations).toBeGreaterThan(0);
  });

  it('refetches canonical data for prefer-calendar and suppresses outbound resolution paths', async () => {
    seed(envelope([mapping({ conflictStatus: 'pending' })], [conflict()]));
    tasks.set('task-a', task({ title: 'Local title' }));
    manager.start(owner);
    expect(await manager.resolveConflict('conflict-a', 'merge')).toBe(false);
    expect(mock.updateTask).not.toHaveBeenCalled();
    expect(await manager.resolveConflict('conflict-a', 'prefer-calendar')).toBe(true);
    expect(tasks.get('task-a')?.title).toBe('Canonical title');
    expect(mock.updateTask.mock.calls[0][2]).toMatchObject({ origin: 'calendar-import', ownerUserId: owner });
    expect(manager.getPendingConflicts()).toEqual([]);
    expect(manager.getMappingByTaskId('task-a')?.conflictStatus).toBe('resolved');
  });

  it('records an already-matching conflict as resolved without claiming a task write', async () => {
    seed(envelope([mapping({ conflictStatus: 'pending' })], [conflict()]));
    tasks.set('task-a', task());
    manager.start(owner);
    expect(await manager.resolveConflict('conflict-a', 'prefer-calendar')).toBe(true);
    expect(mock.updateTask).not.toHaveBeenCalled();
    expect(manager.getPendingConflicts()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(calendarSyncStorageKey(owner))!).conflicts[0].resolution).toBe('prefer-calendar');
  });

  it('does not claim conflict resolution when saving the resolution receipt fails', async () => {
    seed(envelope([mapping({ conflictStatus: 'pending' })], [conflict()]));
    tasks.set('task-a', task());
    manager.start(owner);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(await manager.resolveConflict('conflict-a', 'prefer-calendar')).toBe(false);
    expect(JSON.parse(localStorage.getItem(calendarSyncStorageKey(owner))!).conflicts[0].resolution).toBeUndefined();
  });

  it('leaves uncertainty when a local resolution transaction rejects', async () => {
    seed(envelope([mapping({ conflictStatus: 'pending' })], [conflict()]));
    tasks.set('task-a', task({ title: 'Local title' }));
    manager.start(owner);
    mock.updateTask.mockRejectedValueOnce(new Error('private transaction detail'));
    expect(await manager.resolveConflict('conflict-a', 'prefer-calendar')).toBe(false);
    expect(manager.getPendingConflicts()).toHaveLength(1);
    expect(manager.getStatus().unresolvedOperations).toBe(1);
    expect(await manager.resolveConflict('conflict-a', 'prefer-calendar')).toBe(false);
    expect(mock.updateTask).toHaveBeenCalledTimes(1);
  });

  it('keeps equal external event IDs separate across different owned accounts', async () => {
    tables.calendar_accounts.push({ id: otherAccountId, user_id: owner, sync_enabled: true });
    tables.calendar_events.push(canonical({ calendar_account_id: otherAccountId, title: 'Second calendar' }));
    manager.start(owner);
    expect((await manager.performFullSync()).eventsProcessed).toBe(2);
    expect(mock.addTask).toHaveBeenCalledTimes(2);
    expect(manager.getMappingByEventId(eventId)).toBeUndefined();
    expect(manager.getMappingByTaskId('generated-1')?.calendarAccountId).toBe(accountId);
    expect(manager.getMappingByTaskId('generated-2')?.calendarAccountId).toBe(otherAccountId);
  });

  it('does not write a conflict value that the strict state reader would reject', async () => {
    seed(envelope([mapping()]));
    const original = localStorage.getItem(calendarSyncStorageKey(owner));
    tasks.set('task-a', task({ title: 'x'.repeat(5000) }));
    manager.start(owner);
    const result = await request();
    expect(result).toMatchObject({ success: false, reviewRequired: true });
    expect(result.conflictId).toBeUndefined();
    expect(localStorage.getItem(calendarSyncStorageKey(owner))).toBe(original);
    const fresh = makeManager(); fresh.start(owner);
    expect(fresh.getStatus().unresolvedOperations).toBe(0);
    expect(fresh.getMappingByTaskId('task-a')).toBeDefined();
  });

  it('rejects oversized post-write state while preserving the smaller durable intent hold', async () => {
    const oldMapping = mapping({ taskId: 'old-task', eventId: 'old-event' });
    const conflicts = Array.from({ length: 130 }, (_, index) => conflict({
      id: `old-conflict-${index}`, taskId: 'old-task', eventId: 'old-event',
      taskValue: '', calendarValue: '', resolution: 'prefer-calendar',
    }));
    const state = envelope([oldMapping], conflicts);
    const targetBytes = 1024 * 1024 - 100;
    let remaining = targetBytes - JSON.stringify(state).length;
    for (const item of conflicts) for (const field of ['taskValue', 'calendarValue'] as const) {
      const size = Math.min(4096, remaining);
      item[field] = 'x'.repeat(size);
      remaining -= size;
    }
    expect(remaining).toBe(0);
    seed(state);
    manager.start(owner);
    expect(manager.getStatus().unresolvedOperations).toBe(0);
    expect((await request()).success).toBe(false);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
    const stored = localStorage.getItem(calendarSyncStorageKey(owner))!;
    expect(new TextEncoder().encode(stored).byteLength).toBeLessThanOrEqual(1024 * 1024);
    expect(JSON.parse(stored).unresolvedOperations).toEqual([JSON.stringify([accountId, eventId])]);
    const fresh = makeManager(); fresh.start(owner);
    expect(fresh.getStatus().unresolvedOperations).toBe(1);
    expect((await fresh.syncCalendarToTask(eventId, { calendar_account_id: accountId })).success).toBe(false);
    expect(mock.addTask).toHaveBeenCalledTimes(1);
  });
});

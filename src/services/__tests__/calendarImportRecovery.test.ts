import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarTaskSyncManager, calendarSyncStorageKey } from '../calendarTaskSyncManager';
import { taskToBubble } from '@/adapters/taskAdapter';
import type { Task } from '@/types/task';
import type { Bubble } from '@/types/bubble';

const mock = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn(), read: vi.fn(), initialize: vi.fn(), add: vi.fn(), update: vi.fn(), invoke: vi.fn(), getState: vi.fn() }));
vi.mock('@/services/storage', () => ({ storageService: { initialize: mock.initialize, readCommittedBubbles: mock.read } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mock.user }, from: mock.from, functions: { invoke: mock.invoke } } }));
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: mock.getState } }));
vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const account = '33333333-3333-4333-8333-333333333333';
const eventId = 'held-event';
const key = JSON.stringify([account, eventId]);
const savedKey = calendarSyncStorageKey(owner);
const freshEvent = () => ({ user_id: owner, calendar_account_id: account, external_event_id: eventId,
  title: 'Owned event', start_time: '2030-01-01T10:00:00.000Z', end_time: '2030-01-01T11:00:00.000Z', location: null, description: null });
function task(): Task {
  return { id: 'persisted-task', title: 'Owned event', type: 'event', completed: false, priority: 50, tags: [], createdAt: 1, updatedAt: 2,
    metadata: { userId: owner, calendarImport: { calendarAccountId: account, eventId } },
    view: { calendar: { startTime: '2030-01-01T10:00:00.000Z', durationMin: 60, calendarId: account } } };
}
const envelope = () => ({ version: 1, ownerUserId: owner, mappings: [] as Record<string, unknown>[], conflicts: [] as Record<string, unknown>[], unresolvedOperations: [key] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('reviewed committed calendar association recovery', () => {
  let manager: CalendarTaskSyncManager;
  let managers: CalendarTaskSyncManager[];
  let event: ReturnType<typeof freshEvent>;
  let bubbles: Bubble[];
  let heldLocks: Set<string>;
  const inspect = () => manager.inspectImportRecovery(account, eventId);
  const makeManager = () => { const next = new CalendarTaskSyncManager(); managers.push(next); return next; };
  beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear();
    event = freshEvent(); bubbles = [taskToBubble(task())]; managers = []; heldLocks = new Set();
    vi.stubGlobal('navigator', { locks: { request: async (name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
      if (heldLocks.has(name)) return callback(null);
      heldLocks.add(name);
      try { return await callback({ name }); } finally { heldLocks.delete(name); }
    } } });
    mock.user.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mock.initialize.mockResolvedValue(undefined);
    mock.read.mockImplementation(async () => structuredClone(bubbles));
    mock.getState.mockReturnValue({ tasks: [], getTask: () => undefined, addTask: mock.add, updateTask: mock.update });
    mock.from.mockImplementation((table: string) => {
      const filters = new Map<string, unknown>();
      const query = { select: vi.fn().mockReturnThis(), eq: vi.fn((column: string, value: unknown) => { filters.set(column, value); return query; }),
        single: vi.fn(async () => {
          expect(filters.get('user_id')).toBe(owner);
          if (table === 'calendar_accounts') {
            expect(filters.get('id')).toBe(account); expect(filters.get('sync_enabled')).toBe(true);
            return { data: { id: account, user_id: owner, sync_enabled: true }, error: null };
          }
          expect(filters.get('calendar_account_id')).toBe(account); expect(filters.get('external_event_id')).toBe(eventId);
          return { data: { ...event }, error: null };
        }) };
      return query;
    });
    localStorage.setItem(savedKey, JSON.stringify(envelope()));
    manager = makeManager(); manager.start(owner);
  });
  afterEach(() => {
    managers.forEach(item => item.stop());
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it('requires preview and then restores only the verified mapping, without writing task content', async () => {
    const before = localStorage.getItem(savedKey);
    const preview = await inspect();
    expect(preview).toMatchObject({ status: 'recoverable', taskId: 'persisted-task', taskTitle: 'Owned event' });
    expect(localStorage.getItem(savedKey)).toBe(before);
    expect(mock.getState).not.toHaveBeenCalled(); // Durable database, never the cached facade.
    const result = await manager.confirmImportRecovery(preview.reviewToken!);
    expect(result).toMatchObject({ success: true, taskId: 'persisted-task' });
    const saved = JSON.parse(localStorage.getItem(savedKey)!);
    expect(saved.unresolvedOperations).toEqual([]);
    expect(saved.mappings).toMatchObject([{ taskId: 'persisted-task', eventId, calendarAccountId: account }]);
    expect(mock.read).toHaveBeenCalledTimes(2);
    expect(mock.add).not.toHaveBeenCalled();
    expect(bubbles).toEqual([taskToBubble(task())]);
    expect((await manager.confirmImportRecovery(preview.reviewToken!)).success).toBe(false);
  });

  it.each(['absent', 'duplicate', 'changed', 'unsupported', 'foreign'] as const)('preserves the hold for %s persisted evidence', async kind => {
    if (kind === 'absent') bubbles = [];
    if (kind === 'duplicate') bubbles.push({ ...structuredClone(bubbles[0]), id: 'duplicate' });
    if (kind === 'changed') bubbles[0].content = 'Changed saved task';
    if (kind === 'unsupported') (bubbles[0].metadata!.canonicalTask as unknown as { schemaVersion: number }).schemaVersion = 2;
    if (kind === 'foreign') { bubbles[0].metadata!.userId = other; bubbles[0].metadata!.canonicalTask!.metadata!.userId = other; }
    expect((await inspect()).status).toBe('blocked');
    expect(JSON.parse(localStorage.getItem(savedKey)!).unresolvedOperations).toEqual([key]);
    expect(mock.add).not.toHaveBeenCalled();
  });

  it.each(['task', 'event', 'envelope', 'substitute'] as const)('revalidates %s after preview and refuses stale confirmation', async kind => {
    const preview = await inspect();
    expect(preview.status).toBe('recoverable');
    if (kind === 'task') bubbles[0].updatedAt = 100;
    if (kind === 'event') event.title = 'Different canonical event';
    if (kind === 'substitute') bubbles[0].id = 'different-task';
    if (kind === 'envelope') {
      const saved = envelope(); saved.unresolvedOperations.push(JSON.stringify([account, 'other-event']));
      localStorage.setItem(savedKey, JSON.stringify(saved));
    }
    expect((await manager.confirmImportRecovery(preview.reviewToken!)).success).toBe(false);
    expect(JSON.parse(localStorage.getItem(savedKey)!).unresolvedOperations).toContain(key);
  });

  it('does not infer a missing hold or adopt a legacy association', async () => {
    const saved = envelope(); saved.unresolvedOperations = []; localStorage.setItem(savedKey, JSON.stringify(saved));
    expect((await inspect()).status).toBe('blocked');
    expect(mock.read).not.toHaveBeenCalled();
  });

  it('refuses an existing different task link and never reassigns it', async () => {
    const saved = envelope(); saved.mappings.push({ taskId: 'different-task', eventId, calendarAccountId: account, lastSyncedAt: 1, syncDirection: 'calendar-to-task', conflictStatus: 'none' });
    localStorage.setItem(savedKey, JSON.stringify(saved));
    expect((await inspect()).status).toBe('blocked');
  });

  it('refuses a candidate already associated with another event', async () => {
    const saved = envelope(); saved.mappings.push({ taskId: 'persisted-task', eventId: 'other-event', calendarAccountId: account, lastSyncedAt: 1, syncDirection: 'calendar-to-task', conflictStatus: 'none' });
    localStorage.setItem(savedKey, JSON.stringify(saved));
    expect((await inspect()).status).toBe('blocked');
  });

  it('preserves pending conflict evidence when restoring the same task link', async () => {
    const saved = envelope(); saved.mappings.push({ taskId: 'persisted-task', eventId, calendarAccountId: account, lastSyncedAt: 1, syncDirection: 'calendar-to-task', conflictStatus: 'pending' });
    saved.conflicts.push({ id: 'pending-conflict', taskId: 'persisted-task', eventId, conflictType: 'title', taskValue: 'Old', calendarValue: 'Owned event', timestamp: 1 });
    localStorage.setItem(savedKey, JSON.stringify(saved));
    const preview = await inspect();
    expect((await manager.confirmImportRecovery(preview.reviewToken!)).success).toBe(true);
    expect(JSON.parse(localStorage.getItem(savedKey)!).conflicts).toEqual(saved.conflicts);
    expect(manager.getPendingConflicts()).toHaveLength(1);
  });

  it('keeps the durable hold on failed mapping save and can review again after storage recovers', async () => {
    const preview = await inspect();
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect((await manager.confirmImportRecovery(preview.reviewToken!)).success).toBe(false);
    expect(JSON.parse(localStorage.getItem(savedKey)!).unresolvedOperations).toEqual([key]);
    expect(await manager.refreshUnresolvedImports()).toMatchObject({ success: true, items: [{ calendarAccountId: account, eventId }] });
    const retry = await inspect();
    expect((await manager.confirmImportRecovery(retry.reviewToken!)).success).toBe(true);
  });

  it('does not turn read failures or malformed state into an empty successful inventory', async () => {
    localStorage.setItem(savedKey, '{malformed');
    expect(await manager.refreshUnresolvedImports()).toMatchObject({ success: false, items: [] });
    localStorage.setItem(savedKey, JSON.stringify(envelope()));
    mock.read.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAIL'));
    const result = await inspect();
    expect(result.status).toBe('blocked');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_DATABASE_DETAIL');
  });

  it('expires preview tokens without clearing holds', async () => {
    const preview = await inspect();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
    expect((await manager.confirmImportRecovery(preview.reviewToken!)).success).toBe(false);
  });

  it('also expires a confirmation whose final snapshot was delayed beyond the review lifetime', async () => {
    const preview = await inspect();
    const read = deferred<Bubble[]>(); mock.read.mockReturnValueOnce(read.promise);
    const pending = manager.confirmImportRecovery(preview.reviewToken!);
    await vi.waitFor(() => expect(mock.read).toHaveBeenCalledTimes(2));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
    read.resolve(bubbles);
    expect((await pending).success).toBe(false);
    expect(JSON.parse(localStorage.getItem(savedKey)!).unresolvedOperations).toEqual([key]);
  });

  it('hides prior-owner hold counts and discards a late inspection after account change', async () => {
    const read = deferred<Bubble[]>(); mock.read.mockReturnValueOnce(read.promise);
    const pending = inspect();
    await vi.waitFor(() => expect(mock.read).toHaveBeenCalled());
    manager.start(other);
    expect(manager.getStatus().unresolvedOperations).toBe(0);
    expect(manager.getUnresolvedImports()).toEqual([]);
    read.resolve(bubbles);
    expect((await pending).status).toBe('blocked');
  });

  it('refuses a late confirmation after stop even if its durable read finishes', async () => {
    const preview = await inspect();
    const read = deferred<Bubble[]>(); mock.read.mockReturnValueOnce(read.promise);
    const pending = manager.confirmImportRecovery(preview.reviewToken!);
    await vi.waitFor(() => expect(mock.read).toHaveBeenCalledTimes(2));
    manager.stop(); read.resolve(bubbles);
    expect((await pending).success).toBe(false);
    expect(JSON.parse(localStorage.getItem(savedKey)!).unresolvedOperations).toEqual([key]);
  });

  it('fails closed when coordination is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect((await inspect()).status).toBe('blocked');
    expect(mock.read).not.toHaveBeenCalled();
  });

  it.each(['mismatch', 'error', 'rejection'] as const)('preserves the hold when authentication reports %s', async kind => {
    if (kind === 'mismatch') mock.user.mockResolvedValue({ data: { user: { id: other } }, error: null });
    if (kind === 'error') mock.user.mockResolvedValue({ data: { user: { id: owner } }, error: new Error('PRIVATE_AUTH_DETAIL') });
    if (kind === 'rejection') mock.user.mockRejectedValue(new Error('PRIVATE_AUTH_DETAIL'));
    const result = await inspect();
    expect(result.status).toBe('blocked');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_AUTH_DETAIL');
    expect(mock.read).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(savedKey)!).unresolvedOperations).toEqual([key]);
  });

  it('rechecks authenticated ownership at confirmation, not only at preview', async () => {
    const preview = await inspect();
    mock.user.mockResolvedValue({ data: { user: { id: other } }, error: null });
    expect((await manager.confirmImportRecovery(preview.reviewToken!)).success).toBe(false);
    expect(mock.read).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(savedKey)!).unresolvedOperations).toEqual([key]);
  });

  it('holds cross-instance admission through a stopped local commit and reloads the surviving hold', async () => {
    localStorage.setItem(savedKey, JSON.stringify({ ...envelope(), unresolvedOperations: [] }));
    const commit = deferred<Task>(); mock.add.mockReturnValueOnce(commit.promise);
    const pending = manager.syncCalendarToTask(eventId, { calendar_account_id: account });
    await vi.waitFor(() => expect(mock.add).toHaveBeenCalledOnce());
    const second = makeManager(); second.start(owner);
    manager.stop();
    expect((await second.refreshUnresolvedImports()).success).toBe(false);
    commit.resolve(task()); await pending;
    expect(await second.refreshUnresolvedImports()).toMatchObject({ success: true, items: [{ calendarAccountId: account, eventId }] });
    expect((await second.syncCalendarToTask(eventId, { calendar_account_id: account })).success).toBe(false);
    expect(mock.add).toHaveBeenCalledOnce();
  });
});

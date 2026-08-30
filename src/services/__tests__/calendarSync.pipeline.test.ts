import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bubble } from '@/types/bubble';
import type { CalendarTaskSyncManager } from '../calendarTaskSyncManager';

const mock = vi.hoisted(() => ({
  bubbles: [] as import('@/types/bubble').Bubble[], add: vi.fn(), update: vi.fn(),
  from: vi.fn(), user: vi.fn(), invoke: vi.fn(), evaluate: vi.fn(),
}));
vi.mock('@/stores/bubbleStore', () => ({ useBubbleStore: {
  getState: () => ({ bubbles: mock.bubbles, addBubble: mock.add, updateBubbleStrict: mock.update }),
  subscribe: vi.fn(() => () => {}),
} }));
vi.mock('@/services/taskAwareAutoWriteService', () => ({ taskAwareAutoWriteService: { evaluateTask: mock.evaluate } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: mock.from, auth: { getUser: mock.user }, functions: { invoke: mock.invoke },
} }));
vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const OWNER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '10000000-0000-4000-8000-000000000002';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('real calendar manager and TaskStore import pipeline', () => {
  let manager: CalendarTaskSyncManager;
  let Manager: typeof CalendarTaskSyncManager;
  let store: typeof import('@/stores/taskStore')['useTaskStore'];
  let event: { user_id: string; calendar_account_id: string; external_event_id: string; title: string; start_time: string; end_time: string; location: null; description: null };
  beforeEach(async () => {
    vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers(); localStorage.clear();
    mock.bubbles = [];
    event = { user_id: OWNER, calendar_account_id: ACCOUNT, external_event_id: 'synthetic-event', title: 'Canonical event',
      start_time: '2030-01-01T10:00:00.000Z', end_time: '2030-01-01T11:30:00.000Z', location: null, description: null };
    mock.user.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
    mock.from.mockImplementation((table: string) => {
      if (!['calendar_accounts', 'calendar_events'].includes(table)) throw new Error('Unexpected table');
      const filters = new Map<string, unknown>();
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((key: string, value: unknown) => { filters.set(key, value); return query; }),
        single: vi.fn(async () => {
          // Fail the fixture if any owner/account binding is omitted.
          expect(filters.get('user_id')).toBe(OWNER);
          if (table === 'calendar_accounts') {
            expect(filters.get('id')).toBe(ACCOUNT);
            return { data: { id: ACCOUNT, user_id: OWNER, sync_enabled: true }, error: null };
          }
          expect(filters.get('calendar_account_id')).toBe(ACCOUNT);
          expect(filters.get('external_event_id')).toBe(event.external_event_id);
          return { data: { ...event }, error: null };
        }),
      };
      return query;
    });
    mock.add.mockImplementation(async (bubble: Bubble) => { mock.bubbles.push(bubble); });
    mock.update.mockImplementation(async (bubble: Bubble) => {
      mock.bubbles = mock.bubbles.map(current => current.id === bubble.id ? bubble : current);
    });
    store = (await import('@/stores/taskStore')).useTaskStore;
    Manager = (await import('../calendarTaskSyncManager')).CalendarTaskSyncManager;
    manager = new Manager(); manager.start(OWNER);
  });
  afterEach(() => {
    manager.stop();
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.evaluate).not.toHaveBeenCalled();
    vi.useRealTimers(); vi.restoreAllMocks();
  });
  const importEvent = () => manager.syncCalendarToTask('synthetic-event', { calendar_account_id: ACCOUNT, title: 'UNTRUSTED CALLER TITLE' });

  it('binds the generated persisted task ID and canonical content, then deduplicates a repeat', async () => {
    const result = await importEvent();
    expect(result).toMatchObject({ success: true, written: true });
    expect(result.taskId).toBe(mock.bubbles[0].id);
    expect(store.getState().getTask(result.taskId!)?.title).toBe('Canonical event');
    expect(manager.getMappingByTaskId(result.taskId!)?.calendarAccountId).toBe(ACCOUNT);
    await expect(importEvent()).resolves.toMatchObject({ success: true, written: false, taskId: result.taskId });
    expect(mock.add).toHaveBeenCalledTimes(1);
  });

  it('retains a stopped pending local commit as uncertain across a fresh manager instance', async () => {
    const commit = deferred();
    mock.add.mockImplementationOnce(async (bubble: Bubble) => { await commit.promise; mock.bubbles.push(bubble); });
    const pending = importEvent();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.add).toHaveBeenCalledTimes(1);
    manager.stop();
    commit.resolve();
    await expect(pending).resolves.toMatchObject({ success: false, reviewRequired: true });
    expect(mock.bubbles).toHaveLength(1); // Already dispatched persistence is not cancelled.
    manager = new Manager(); manager.start(OWNER);
    await expect(importEvent()).resolves.toMatchObject({ success: false, reviewRequired: true });
    expect(mock.add).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().unresolvedOperations).toBeGreaterThan(0);
  });

  it('changes an imported task only through explicit prefer-calendar conflict resolution without feedback writes', async () => {
    const created = await importEvent();
    event.title = 'Canonical revised title';
    const conflict = await importEvent();
    expect(conflict).toMatchObject({ success: false, reviewRequired: true });
    expect(mock.update).not.toHaveBeenCalled();
    expect(await manager.resolveConflict(conflict.conflictId!, 'prefer-task')).toBe(false);
    expect(await manager.resolveConflict(conflict.conflictId!, 'prefer-calendar')).toBe(true);
    expect(store.getState().getTask(created.taskId!)?.title).toBe(event.title);
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect(manager.getPendingConflicts()).toHaveLength(0);
  });

  it('does not turn recurring review ticks into automatic Calendar-to-task imports', async () => {
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.add).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('preserves the pre-write hold when mapping persistence fails after a local commit', async () => {
    const realSet = localStorage.setItem.bind(localStorage);
    let writes = 0;
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (++writes === 2) throw new Error('Synthetic quota failure');
      realSet(key, value);
    });
    await expect(importEvent()).resolves.toMatchObject({ success: false, reviewRequired: true });
    expect(mock.bubbles).toHaveLength(1);
    setItem.mockRestore(); manager.stop(); manager = new Manager(); manager.start(OWNER);
    await expect(importEvent()).resolves.toMatchObject({ success: false, reviewRequired: true });
    expect(mock.add).toHaveBeenCalledTimes(1);
  });
});

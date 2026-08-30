import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarTaskSyncManager, calendarSyncStorageKey } from '../calendarTaskSyncManager';
import { calendarOutboundJournalKey, parseOutboundHoldInventory, readOutboundJournal } from '../calendarOutboundJournal';
const mock = vi.hoisted(() => ({ user: vi.fn(), invoke: vi.fn(), read: vi.fn(), initialize: vi.fn(), from: vi.fn(), task: vi.fn() }));
vi.mock('@/services/storage', () => ({ storageService: { initialize: mock.initialize, readCommittedBubbles: mock.read } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mock.user }, functions: { invoke: mock.invoke }, from: mock.from } }));
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: mock.task } }));
vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const ACCOUNT = '30000000-0000-4000-8000-000000000003';
const OP = '40000000-0000-4000-8000-000000000004';
const receipt = () => ({ operationId: OP, taskId: 'missing-task', calendarAccountId: ACCOUNT, eventId: 'missing-event', createdAt: 1, outcome: 'pending' });
const journal = (receipts: unknown[] = [receipt()], owner = OWNER) => ({ version: 1, ownerUserId: owner, receipts });
const response = () => ({ version: 1, operationId: OP, calendarAccountId: ACCOUNT, eventId: 'missing-event', outcome: 'observed', observationOnly: true,
  etag: '"current"', observedAt: 1000, fields: { title: 'Current provider title', description: '', location: '',
    startTime: '2030-01-01T10:00:00.000Z', endTime: '2030-01-01T11:00:00.000Z', startTz: null, endTz: null } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe('complete owner-local outbound hold inventory and observations', () => {
  let manager: CalendarTaskSyncManager;
  let heldLocks: Set<string>;
  const saved = () => localStorage.getItem(calendarOutboundJournalKey(OWNER));
  const save = (value: unknown) => localStorage.setItem(calendarOutboundJournalKey(OWNER), JSON.stringify(value));
  beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear(); heldLocks = new Set();
    vi.stubGlobal('navigator', { locks: { request: async (name: string, _options: unknown, fn: (lock: object | null) => Promise<unknown>) => {
      if (heldLocks.has(name)) return fn(null); heldLocks.add(name); try { return await fn({ name }); } finally { heldLocks.delete(name); }
    } } });
    mock.user.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
    mock.invoke.mockResolvedValue({ data: response(), error: null });
    save(journal()); manager = new CalendarTaskSyncManager(); manager.start(OWNER);
  });
  afterEach(() => {
    manager.stop(); expect(mock.read).not.toHaveBeenCalled(); expect(mock.initialize).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.task).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  it('lists orphaned holds without requiring tasks or mappings and performs no provider I/O on refresh', async () => {
    const before = saved(); expect(await manager.refreshOutboundHolds()).toMatchObject({ success: true, items: [receipt()] });
    expect(mock.invoke).not.toHaveBeenCalled(); expect(saved()).toBe(before);
  });
  it('does not hide holds when unrelated sync state is malformed', async () => {
    localStorage.setItem(calendarSyncStorageKey(OWNER), 'malformed');
    expect(await manager.refreshOutboundHolds()).toMatchObject({ success: true, items: [receipt()] });
    expect((await manager.inspectOutboundHold(OP)).status).toBe('observed'); expect(localStorage.getItem(calendarSyncStorageKey(OWNER))).toBe('malformed');
  });
  it('returns all three hold kinds but excludes both terminal kinds and other owners', async () => {
    const kinds = ['pending', 'uncertain', 'provider_written', 'written', 'not_written'];
    save(journal(kinds.map((outcome, i) => ({ ...receipt(), operationId: `40000000-0000-4000-8000-00000000000${i + 1}`, outcome,
      ...(outcome === 'pending' ? {} : { completedAt: 2 }), ...(['written', 'provider_written'].includes(outcome) ? { etag: '"known"' } : {}) }))));
    localStorage.setItem(calendarOutboundJournalKey(OTHER), JSON.stringify(journal([{ ...receipt(), taskId: 'PRIVATE_OTHER' }], OTHER)));
    const result = await manager.refreshOutboundHolds(); expect(result.success).toBe(true); expect(result.items.map(x => x.outcome)).toEqual(kinds.slice(0, 3));
    expect(JSON.stringify(result)).not.toContain('PRIVATE_OTHER');
  });
  it.each([null, { version: 2 }, { ...journal(), ownerUserId: OTHER }, journal([receipt(), receipt()])])('reports unavailable, never zero success for malformed journal', async value => {
    save(value); expect(await manager.refreshOutboundHolds()).toMatchObject({ success: false, items: [] });
    expect((await manager.inspectOutboundHold(OP)).status).toBe('blocked'); expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('treats absent journal as scoped zero and does not create one', async () => {
    localStorage.removeItem(calendarOutboundJournalKey(OWNER)); expect(await manager.refreshOutboundHolds()).toMatchObject({ success: true, items: [] }); expect(saved()).toBeNull();
  });
  it('rejects storage access failure without empty success', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('PRIVATE_DETAIL'); });
    const result = await manager.refreshOutboundHolds(); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_DETAIL');
  });
  it('makes an explicit strict inspection only and never changes the hold even when provider fields match', async () => {
    const before = saved(); const set = vi.spyOn(localStorage, 'setItem');
    const result = await manager.inspectOutboundHold(OP); expect(result).toMatchObject({ status: 'observed', observationOnly: true, fields: response().fields });
    expect(result.message).toContain('do not prove'); expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('calendar-sync', { body: {
      version: 1, action: 'inspect_reviewed_outcome', operationId: OP, calendarAccountId: ACCOUNT, eventId: 'missing-event' } });
    expect(saved()).toBe(before); expect(set).not.toHaveBeenCalled(); expect(readOutboundJournal(OWNER).journal.receipts[0].outcome).toBe('pending');
  });
  it.each(['uncertain', 'provider_written'])('never changes existing %s hold after current observation', async outcome => {
    save(journal([{ ...receipt(), outcome, completedAt: 2, ...(outcome === 'provider_written' ? { etag: '"current"' } : {}) }]));
    const before = saved(); expect((await manager.inspectOutboundHold(OP)).status).toBe('observed'); expect(saved()).toBe(before);
  });
  it.each(['written', 'not_written', 'absent', 'invalid'])('refuses inspection for %s operation', async outcome => {
    if (outcome === 'written' || outcome === 'not_written') save(journal([{ ...receipt(), outcome, completedAt: 2, ...(outcome === 'written' ? { etag: '"known"' } : {}) }]));
    expect((await manager.inspectOutboundHold(outcome === 'invalid' ? 'bad' : outcome === 'absent' ? OTHER : OP)).status).toBe('blocked');
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it.each([{ operationId: OTHER }, { calendarAccountId: OTHER }, { eventId: 'other' }, { outcome: 'written' }, { observationOnly: false },
    { observedAt: NaN }, { fields: { title: 'missing' } }, { cacheUpdated: true }])('rejects mismatched/misleading observation %j and retains hold', async change => {
    const before = saved(); mock.invoke.mockResolvedValue({ data: { ...response(), ...change }, error: null });
    expect((await manager.inspectOutboundHold(OP)).status).toBe('blocked'); expect(saved()).toBe(before);
  });
  it('returns disabled as inspection unavailable, not a no-write outcome', async () => {
    mock.invoke.mockResolvedValue({ data: { version: 1, operationId: OP, calendarAccountId: ACCOUNT, eventId: 'missing-event', outcome: 'inspection_unavailable', code: 'disabled' }, error: null });
    expect(await manager.inspectOutboundHold(OP)).toMatchObject({ status: 'blocked', code: 'disabled' }); expect(readOutboundJournal(OWNER).journal.receipts[0].outcome).toBe('pending');
  });
  it('retains holds after transport rejection without raw provider details', async () => {
    const before = saved(); mock.invoke.mockRejectedValue(new Error('PRIVATE_DETAIL')); const result = await manager.inspectOutboundHold(OP);
    expect(result.status).toBe('blocked'); expect(JSON.stringify(result)).not.toContain('PRIVATE_DETAIL'); expect(saved()).toBe(before);
  });
  it.each(['owner', 'stop', 'journal', 'auth'])('suppresses late observation after %s change', async change => {
    const pending = deferred<{ data: ReturnType<typeof response>; error: null }>(); mock.invoke.mockReturnValue(pending.promise);
    const result = manager.inspectOutboundHold(OP); await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce());
    if (change === 'owner') manager.start(OTHER); if (change === 'stop') manager.stop();
    if (change === 'journal') save(journal([])); if (change === 'auth') mock.user.mockResolvedValue({ data: { user: { id: OTHER } }, error: null });
    pending.resolve({ data: response(), error: null }); expect((await result).status).toBe('blocked');
  });
  it('coalesces duplicate inspection calls and holds the same-origin lock until observation settles', async () => {
    const pending = deferred<{ data: ReturnType<typeof response>; error: null }>(); mock.invoke.mockReturnValue(pending.promise);
    const a = manager.inspectOutboundHold(OP); const b = manager.inspectOutboundHold(OP);
    await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce()); expect(heldLocks.size).toBe(1);
    pending.resolve({ data: response(), error: null }); expect((await a).status).toBe('observed'); expect((await b).status).toBe('observed'); expect(heldLocks.size).toBe(0);
  });
  it('does not inspect when coordination is unavailable', async () => {
    vi.stubGlobal('navigator', {}); expect((await manager.inspectOutboundHold(OP)).status).toBe('blocked'); expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('does not inventory when authenticated owner no longer matches', async () => {
    mock.user.mockResolvedValue({ data: { user: { id: OTHER } }, error: null }); expect((await manager.refreshOutboundHolds()).success).toBe(false);
  });
  it('rejects terminal or duplicate UI inventory and returns detached hold copies', () => {
    expect(parseOutboundHoldInventory([{ ...receipt(), outcome: 'not_written', completedAt: 2 }], OWNER)).toBeNull();
    expect(parseOutboundHoldInventory([receipt(), receipt()], OWNER)).toBeNull();
    const source = [receipt()]; const result = parseOutboundHoldInventory(source, OWNER)!; result[0].taskId = 'changed'; expect(source[0].taskId).toBe('missing-task');
  });
});

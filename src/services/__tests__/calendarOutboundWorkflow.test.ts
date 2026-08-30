import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarTaskSyncManager, calendarSyncStorageKey } from '../calendarTaskSyncManager';
import { calendarOutboundJournalKey, readOutboundJournal } from '../calendarOutboundJournal';
import { taskToBubble } from '@/adapters/taskAdapter';
import type { Task } from '@/types/task';
import { webcrypto } from 'node:crypto';
import { calendarOperationIdentity, calendarOperationDigests } from '../../../supabase/functions/_shared/calendarOperationReceiptContract';

const mock = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), initialize: vi.fn(), invoke: vi.fn(), from: vi.fn(), getState: vi.fn() }));
vi.mock('@/services/storage', () => ({ storageService: { initialize: mock.initialize, readCommittedBubbles: mock.read } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mock.user }, from: mock.from, functions: { invoke: mock.invoke } } }));
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: mock.getState } }));
vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const account = '33333333-3333-4333-8333-333333333333';
const eventId = 'outbound-event';
const fields = { title: 'Edited saved task', description: '', location: '', startTime: '2030-01-01T10:00:00.000Z', endTime: '2030-01-01T11:00:00.000Z', startTz: null, endTz: null };
const task = (): Task => ({ id: 'outbound-task', title: fields.title, type: 'event', completed: false, priority: 50, tags: [], createdAt: 1, updatedAt: 2,
  metadata: { userId: owner, calendarImport: { calendarAccountId: account, eventId } },
  view: { calendar: { startTime: fields.startTime, durationMin: 60, calendarId: account } } });
const mapping = { taskId: 'outbound-task', eventId, calendarAccountId: account, lastSyncedAt: 1, syncDirection: 'calendar-to-task', conflictStatus: 'pending' };
const initial = () => ({ version: 1, ownerUserId: owner, mappings: [mapping], conflicts: [{ id: 'conflict-1', taskId: mapping.taskId, eventId, conflictType: 'title', taskValue: fields.title, calendarValue: 'Provider title', timestamp: 1 }], unresolvedOperations: [] as string[] });
const before = { ...fields, title: 'Provider title' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('explicit owned outbound Calendar review and dispatch', () => {
  let manager: CalendarTaskSyncManager;
  let managers: CalendarTaskSyncManager[];
  let rows: ReturnType<typeof taskToBubble>[];
  let held: Set<string>;
  let confirmationOutcome: string;
  let receiptChange: (value: Record<string, unknown>) => unknown;
  const inspect = () => manager.inspectOutboundUpdate(mapping.taskId);
  const confirm = async () => manager.confirmOutboundUpdate((await inspect()).reviewToken!);
  const receipts = () => readOutboundJournal(owner).journal.receipts;
  const create = () => { const next = new CalendarTaskSyncManager(); managers.push(next); next.start(owner); return next; };
  beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear(); managers = []; rows = [taskToBubble(task())]; held = new Set(); confirmationOutcome = 'written'; receiptChange = value => value;
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('navigator', { locks: { request: async (name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
      if (held.has(name)) return callback(null);
      held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
    } } });
    mock.user.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mock.read.mockImplementation(async () => structuredClone(rows));
    mock.initialize.mockResolvedValue(undefined);
    mock.invoke.mockImplementation(async (_name, { body }) => {
      expect(body.version).toBe(2);
      const base = { version: 2, operationId: body.operationId, taskId: mapping.taskId, calendarAccountId: account, eventId };
      if (body.action === 'prepare_reviewed_update') return { data: { ...base, outcome: 'ready', googleCalendarId: 'synthetic@example.test', expectedEtag: '"old"', before }, error: null };
      // A durable hold MUST predate dispatch, including synchronous throws.
      expect(receipts().at(-1)).toMatchObject({ operationId: body.operationId, outcome: 'pending' });
      expect(receipts().at(-1)?.intent).toMatchObject({ version: 2, googleCalendarId: body.googleCalendarId,
        expectedEtag: body.expectedEtag, requestDigest: body.requestDigest, afterDigest: body.afterDigest });
      expect(await calendarOperationDigests(owner, body)).toEqual({ requestDigest: body.requestDigest, afterDigest: body.afterDigest });
      return { data: receiptChange(confirmationOutcome === 'written' || confirmationOutcome === 'not_written'
        ? { version: 2, ...calendarOperationIdentity(body), outcome: 'recorded', completedAt: 2,
          result: confirmationOutcome === 'written' ? { outcome: 'written', etag: '"new"', cacheUpdated: true } : { outcome: 'not_written', code: 'stale_review' } }
        : { version: 2, ...calendarOperationIdentity(body), outcome: 'held', code: confirmationOutcome === 'uncertain' ? 'outcome_unknown' : 'provider_written_cache_unknown' }), error: null };
    });
    localStorage.setItem(calendarSyncStorageKey(owner), JSON.stringify(initial())); manager = create();
  });
  afterEach(() => { managers.forEach(item => item.stop()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('requires explicit review and confirmation; saves exact dispatch and completion without editing tasks, mappings or conflicts', async () => {
    const saved = localStorage.getItem(calendarSyncStorageKey(owner));
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(await manager.refreshOutboundTasks()).toMatchObject({ success: true, items: [{ taskId: mapping.taskId, taskTitle: fields.title, held: false }] });
    expect(mock.invoke).not.toHaveBeenCalled();
    const preview = await inspect();
    expect(preview).toMatchObject({ status: 'reviewable', before, after: fields });
    expect(receipts()).toEqual([]);
    expect(await manager.confirmOutboundUpdate(preview.reviewToken!)).toMatchObject({ status: 'written', taskId: mapping.taskId });
    expect(receipts()).toMatchObject([{ outcome: 'written', etag: '"new"' }]);
    expect(localStorage.getItem(calendarSyncStorageKey(owner))).toBe(saved);
    expect(rows).toEqual([taskToBubble(task())]);
    expect(mock.getState).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled();
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('not_written');
    expect(mock.invoke).toHaveBeenCalledTimes(2);
  });

  it('detaches provider and outward review fields before asynchronous hashing and dispatch', async () => {
    const provider = { version: 2, outcome: 'ready', googleCalendarId: 'synthetic@example.test', expectedEtag: '"old"', before: { ...before } };
    mock.invoke.mockImplementationOnce(async (_name, { body }) => ({ data: { operationId: body.operationId, taskId: mapping.taskId,
      calendarAccountId: account, eventId, ...provider }, error: null }));
    const barrier = deferred<void>(); const digest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    const hashing = vi.spyOn(webcrypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => { await barrier.promise; return digest(algorithm, data); });
    const pending = inspect(); await vi.waitFor(() => expect(hashing).toHaveBeenCalled());
    provider.before.title = 'mutated provider data'; provider.googleCalendarId = 'other@example.test'; provider.expectedEtag = '"other"';
    barrier.resolve(); const preview = await pending;
    expect(preview).toMatchObject({ status: 'reviewable', googleCalendarId: 'synthetic@example.test', before });
    preview.before!.title = 'mutated returned data'; preview.after!.title = 'mutated returned task';
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('written');
    expect(mock.invoke.mock.calls[1][1].body).toMatchObject({ googleCalendarId: 'synthetic@example.test', expectedEtag: '"old"', before, after: fields });
  });

  it.each(['auth', 'owner', 'stop', 'journal', 'mapping'])('revalidates %s after asynchronous intent hashing without creating a hold', async change => {
    const barrier = deferred<void>(); const digest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    const hashing = vi.spyOn(webcrypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => { await barrier.promise; return digest(algorithm, data); });
    const pending = inspect(); await vi.waitFor(() => expect(hashing).toHaveBeenCalled());
    if (change === 'auth') mock.user.mockResolvedValue({ data: { user: { id: other } }, error: null });
    if (change === 'owner') manager.start(other); if (change === 'stop') manager.stop();
    if (change === 'journal') localStorage.setItem(calendarOutboundJournalKey(owner), JSON.stringify({ version: 1, ownerUserId: owner, receipts: [] }));
    if (change === 'mapping') localStorage.setItem(calendarSyncStorageKey(owner), JSON.stringify({ ...initial(), mappings: [] }));
    barrier.resolve(); expect((await pending).status).toBe('blocked'); expect(receipts()).toEqual([]); expect(mock.invoke).toHaveBeenCalledTimes(1);
  });

  it.each(['missing', 'legacy', 'foreign', 'duplicate', 'unsupported'])('refuses %s persisted task evidence', async kind => {
    if (kind === 'missing') rows = [];
    if (kind === 'legacy') delete rows[0].metadata!.canonicalTask;
    if (kind === 'foreign') rows[0].metadata!.userId = other;
    if (kind === 'duplicate') rows.push({ ...structuredClone(rows[0]), id: 'duplicate' });
    if (kind === 'unsupported') (rows[0].metadata!.canonicalTask as unknown as { schemaVersion: number }).schemaVersion = 2;
    expect((await inspect()).status).toBe('blocked'); expect(mock.invoke).not.toHaveBeenCalled();
  });

  it.each(['task', 'mapping', 'journal', 'expiry', 'owner', 'stop'])('rejects changed %s after review before dispatch', async kind => {
    const preview = await inspect();
    if (kind === 'task') rows[0].updatedAt = 99;
    if (kind === 'mapping') localStorage.setItem(calendarSyncStorageKey(owner), JSON.stringify({ ...initial(), mappings: [{ ...mapping, lastSyncedAt: 2 }] }));
    if (kind === 'journal') localStorage.setItem(calendarOutboundJournalKey(owner), JSON.stringify({ version: 1, ownerUserId: owner, receipts: [] }));
    if (kind === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
    if (kind === 'owner') manager.start(other);
    if (kind === 'stop') manager.stop();
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('not_written');
    expect(mock.invoke).toHaveBeenCalledTimes(1); expect(receipts()).toEqual([]);
  });

  it('rechecks expiry after asynchronous evidence reads', async () => {
    const preview = await inspect(); const read = deferred<typeof rows>(); mock.read.mockReturnValueOnce(read.promise);
    const pending = manager.confirmOutboundUpdate(preview.reviewToken!);
    await vi.waitFor(() => expect(mock.read).toHaveBeenCalledTimes(3));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000); read.resolve(rows);
    expect((await pending).status).toBe('not_written'); expect(mock.invoke).toHaveBeenCalledTimes(1);
  });

  it('fails before dispatch when the pre-write hold cannot be saved', async () => {
    const preview = await inspect(); vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('not_written'); expect(mock.invoke).toHaveBeenCalledTimes(1);
  });

  it('retains the hold if dispatch rejects and blocks repeat across manager restart and import', async () => {
    const preview = await inspect(); mock.invoke.mockRejectedValueOnce(new Error('PRIVATE_DETAIL'));
    const result = await manager.confirmOutboundUpdate(preview.reviewToken!);
    expect(result.status).toBe('uncertain'); expect(JSON.stringify(result)).not.toContain('PRIVATE_DETAIL');
    expect(receipts()[0].outcome).toBe('pending'); manager.stop(); manager = create();
    expect((await inspect()).status).toBe('blocked');
    expect(await manager.refreshOutboundTasks()).toMatchObject({ items: [{ held: true }] });
    expect((await manager.syncCalendarToTask(eventId, { calendar_account_id: account })).success).toBe(false);
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.invoke).toHaveBeenCalledTimes(2);
  });

  it.each(['operation', 'account', 'event', 'fields', 'etag', 'boolean', 'raw', 'version'])('does not accept a misleading %s receipt', async kind => {
    receiptChange = value => kind === 'operation' ? { ...value, operationId: other } : kind === 'account' ? { ...value, calendarAccountId: other }
      : kind === 'event' ? { ...value, eventId: 'other' } : kind === 'fields' ? { ...value, fields: { ...fields, title: 'Different' } }
      : kind === 'etag' ? { ...value, result: { outcome: 'written', etag: '"old"', cacheUpdated: true } } : kind === 'boolean' ? { ...value, result: { outcome: 'written', etag: '"new"', cacheUpdated: false } }
      : kind === 'version' ? { ...value, version: 1 } : { success: true };
    expect((await confirm()).status).toBe('uncertain'); expect(receipts()[0].outcome).toBe('pending');
    expect((await inspect()).status).toBe('blocked');
  });

  it.each(['uncertain', 'provider_written_cache_unknown'])('keeps pending %s unchanged without permitting another attempt', async outcome => {
    confirmationOutcome = outcome;
    expect((await confirm()).status).toBe('uncertain');
    expect(receipts()[0].outcome).toBe('pending');
    expect((await inspect()).status).toBe('blocked');
  });

  it.each(['provider_written_cache_unknown', 'outcome_unknown', 'registry_unavailable'])('decodes strict held %s from non-2xx Functions response without clearing pending', async code => {
    const preview = await inspect();
    mock.invoke.mockImplementationOnce(async (_name, { body }) => ({ data: null, error: { context: new Response(JSON.stringify({ version: 2,
      ...calendarOperationIdentity(body), outcome: 'held', code }), { status: 502 }) } }));
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('uncertain');
    expect(receipts()[0].outcome).toBe('pending');
  });

  it('records known stale rejection but requires a new review instead of replay', async () => {
    confirmationOutcome = 'not_written'; const preview = await inspect();
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('not_written'); expect(receipts()[0].outcome).toBe('not_written');
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('not_written'); expect(mock.invoke).toHaveBeenCalledTimes(2);
    expect((await inspect()).status).toBe('reviewable');
  });
  it('never releases a hold on a contradictory no-write/unknown-outcome receipt', async () => {
    confirmationOutcome = 'not_written'; receiptChange = value => ({ ...value, result: { outcome: 'not_written', code: 'provider_outcome_unknown' } });
    expect((await confirm()).status).toBe('uncertain');
    expect(receipts()[0].outcome).toBe('pending'); expect((await inspect()).status).toBe('blocked');
  });

  it('does not erase provider success when the completion journal write fails', async () => {
    const preview = await inspect(); const set = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === calendarOutboundJournalKey(owner) && value.includes('"outcome":"written"')) throw new Error('quota'); set(key, value); });
    expect((await manager.confirmOutboundUpdate(preview.reviewToken!)).status).toBe('provider_written');
    expect(receipts()[0].outcome).toBe('pending'); expect((await inspect()).status).toBe('blocked');
  });

  it('keeps the shared lock and durable hold while an admitted call settles after stop', async () => {
    const preview = await inspect(); const provider = deferred<{ data: unknown; error: null }>(); mock.invoke.mockReturnValueOnce(provider.promise);
    const pending = manager.confirmOutboundUpdate(preview.reviewToken!);
    await vi.waitFor(() => expect(receipts()).toHaveLength(1)); manager.stop();
    const replacement = create(); expect((await replacement.refreshOutboundTasks()).success).toBe(false);
    provider.resolve({ data: null, error: null }); expect((await pending).status).toBe('uncertain');
    expect((await replacement.refreshOutboundTasks()).items[0].held).toBe(true);
  });

  it.each(['disabled', 'write_permission_required'])('explains %s without creating a dispatch hold', async code => {
    mock.invoke.mockImplementationOnce(async (_name, { body }) => ({ data: { version: 2, operationId: body.operationId, taskId: mapping.taskId, calendarAccountId: account, eventId, outcome: 'unavailable', code }, error: null }));
    const result = await inspect(); expect(result.status).toBe('blocked');
    expect(result.message).toContain(code === 'disabled' ? 'not enabled' : 'no verified write permission'); expect(receipts()).toEqual([]);
  });

  it('rejects read errors, malformed journals and auth mismatch without calling the provider', async () => {
    mock.read.mockRejectedValueOnce(new Error('private')); expect((await inspect()).status).toBe('blocked');
    localStorage.setItem(calendarOutboundJournalKey(owner), '{bad'); expect((await manager.refreshOutboundTasks()).success).toBe(false);
    expect((await inspect()).status).toBe('blocked'); localStorage.removeItem(calendarOutboundJournalKey(owner));
    mock.user.mockResolvedValue({ data: { user: { id: other } }, error: null }); expect((await inspect()).status).toBe('blocked');
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it('cannot review an unresolved import or a multiply mapped task', async () => {
    localStorage.setItem(calendarSyncStorageKey(owner), JSON.stringify({ ...initial(), unresolvedOperations: [JSON.stringify([account, eventId])] }));
    expect((await inspect()).status).toBe('blocked');
    localStorage.setItem(calendarSyncStorageKey(owner), JSON.stringify({ ...initial(), mappings: [mapping, { ...mapping, eventId: 'second-event' }] }));
    expect((await inspect()).status).toBe('blocked'); expect(mock.invoke).not.toHaveBeenCalled();
  });
});

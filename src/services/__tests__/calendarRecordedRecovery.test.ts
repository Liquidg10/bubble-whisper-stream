import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarTaskSyncManager, calendarSyncStorageKey } from '../calendarTaskSyncManager';
import { calendarOutboundJournalKey, outboundOperationIdentity, readOutboundJournal } from '../calendarOutboundJournal';
const mock = vi.hoisted(() => ({ user: vi.fn(), invoke: vi.fn(), read: vi.fn(), initialize: vi.fn(), from: vi.fn(), task: vi.fn() }));
vi.mock('@/services/storage', () => ({ storageService: { initialize: mock.initialize, readCommittedBubbles: mock.read } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mock.user }, functions: { invoke: mock.invoke }, from: mock.from } }));
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: mock.task } }));
vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const ACCOUNT = '30000000-0000-4000-8000-000000000003';
const OP = '40000000-0000-4000-8000-000000000004';
const intent = () => ({ version: 2 as const, googleCalendarId: 'synthetic@example.test', expectedEtag: '"before"', requestDigest: 'a'.repeat(64), afterDigest: 'b'.repeat(64) });
const held = () => ({ operationId: OP, taskId: 'missing-task', calendarAccountId: ACCOUNT, eventId: 'missing-event', createdAt: 10_000, outcome: 'pending' as const, intent: intent() });
const legacy = () => ({ operationId: OTHER, taskId: 'legacy-task', calendarAccountId: ACCOUNT, eventId: 'missing-event', createdAt: 1, outcome: 'pending' as const });
const journal = (receipts: unknown[] = [held(), legacy()]) => ({ version: 1, ownerUserId: OWNER, receipts });
const recorded = () => ({ version: 2, ...outboundOperationIdentity(held())!, outcome: 'recorded', completedAt: 2,
  result: { outcome: 'written', etag: '"after"', cacheUpdated: true } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('explicit exact recorded outbound completion recovery', () => {
  let manager: CalendarTaskSyncManager;
  let locks: Set<string>;
  const saved = () => localStorage.getItem(calendarOutboundJournalKey(OWNER));
  const save = (value: unknown) => localStorage.setItem(calendarOutboundJournalKey(OWNER), JSON.stringify(value));
  const inspect = () => manager.inspectRecordedOutboundRecovery(OP);
  const reviewToken = async () => { const result = await inspect(); expect(result.status).toBe('reviewable'); return result.status === 'reviewable' ? result.reviewToken : ''; };
  beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear(); locks = new Set();
    vi.stubGlobal('navigator', { locks: { request: async (name: string, _options: unknown, fn: (lock: object | null) => Promise<unknown>) => {
      if (locks.has(name)) return fn(null); locks.add(name); try { return await fn({ name }); } finally { locks.delete(name); }
    } } });
    mock.user.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
    mock.invoke.mockImplementation(async (_name, { body }) => {
      expect(body).toEqual({ version: 2, action: 'read_reviewed_update_receipt', ...outboundOperationIdentity(held())! });
      return { data: recorded(), error: null };
    });
    save(journal()); localStorage.setItem(calendarSyncStorageKey(OWNER), 'separate damaged sync state');
    manager = new CalendarTaskSyncManager(); manager.start(OWNER);
  });
  afterEach(() => {
    manager.stop(); expect(mock.read).not.toHaveBeenCalled(); expect(mock.initialize).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.task).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  it('requires explicit lookup and confirmation/reread before one local terminal write; preserves legacy hold and malformed mapping state', async () => {
    const before = saved(); const writes = vi.spyOn(localStorage, 'setItem');
    expect(mock.invoke).not.toHaveBeenCalled(); const token = await reviewToken();
    expect(saved()).toBe(before); expect(writes).not.toHaveBeenCalled(); expect(mock.invoke).toHaveBeenCalledOnce();
    const result = await manager.confirmRecordedOutboundRecovery(token);
    expect(result).toMatchObject({ success: true, operationId: OP, outcome: 'written' }); expect(mock.invoke).toHaveBeenCalledTimes(2);
    const receipts = readOutboundJournal(OWNER).journal.receipts;
    expect(receipts[0]).toMatchObject({ ...held(), outcome: 'written', etag: '"after"' }); expect(receipts[1]).toEqual(legacy());
    expect(writes).toHaveBeenCalledTimes(1); expect(localStorage.getItem(calendarSyncStorageKey(OWNER))).toBe('separate damaged sync state');
    expect(await manager.refreshOutboundHolds()).toMatchObject({ success: true, items: [legacy()] });
    expect((await manager.confirmRecordedOutboundRecovery(token)).success).toBe(false); expect(mock.invoke).toHaveBeenCalledTimes(2);
  });
  it('recovers recorded not-written without inventing or retaining a provider ETag', async () => {
    mock.invoke.mockResolvedValue({ data: { ...recorded(), result: { outcome: 'not_written', code: 'stale_review' } }, error: null });
    expect(await manager.confirmRecordedOutboundRecovery(await reviewToken())).toMatchObject({ success: true, outcome: 'not_written' });
    expect(readOutboundJournal(OWNER).journal.receipts[0]).toMatchObject({ outcome: 'not_written', intent: intent() });
    expect(readOutboundJournal(OWNER).journal.receipts[0]).not.toHaveProperty('etag');
  });
  it.each(['not_written', 'changed-etag'])('rejects %s server completion contradicting prior provider-written evidence', async kind => {
    save(journal([{ ...held(), outcome: 'provider_written', completedAt: 20_000, etag: '"partial"' }]));
    const before = saved();
    mock.invoke.mockResolvedValue({ data: { ...recorded(), result: kind === 'not_written'
      ? { outcome: 'not_written', code: 'stale_review' } : { outcome: 'written', etag: '"different"', cacheUpdated: true } }, error: null });
    expect((await inspect()).status).toBe('blocked'); expect(saved()).toBe(before);
  });
  it('accepts only the same provider ETag when resolving prior provider-written evidence', async () => {
    save(journal([{ ...held(), outcome: 'provider_written', completedAt: 20_000, etag: '"after"' }]));
    expect((await manager.confirmRecordedOutboundRecovery(await reviewToken())).success).toBe(true);
    expect(readOutboundJournal(OWNER).journal.receipts[0]).toMatchObject({ outcome: 'written', etag: '"after"' });
  });
  it.each(['not_written', 'changed-etag'])('rejects confirmation reread with %s conflicting written evidence', async kind => {
    save(journal([{ ...held(), outcome: 'provider_written', completedAt: 20_000, etag: '"after"' }]));
    const token = await reviewToken(); const before = saved();
    mock.invoke.mockResolvedValue({ data: { ...recorded(), result: kind === 'not_written'
      ? { outcome: 'not_written', code: 'stale_review' } : { outcome: 'written', etag: '"different"', cacheUpdated: true } }, error: null });
    expect((await manager.confirmRecordedOutboundRecovery(token)).success).toBe(false); expect(saved()).toBe(before);
  });
  it('uses local completion time bounded by original creation despite server/client clock skew', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1);
    expect((await manager.confirmRecordedOutboundRecovery(await reviewToken())).success).toBe(true);
    expect(readOutboundJournal(OWNER).journal.receipts[0].completedAt).toBe(10_000);
  });
  it('never looks up or changes legacy holds even if a server response could exist', async () => {
    const before = saved(); expect((await manager.inspectRecordedOutboundRecovery(OTHER)).status).toBe('blocked');
    expect(mock.invoke).not.toHaveBeenCalled(); expect(saved()).toBe(before);
  });
  it.each(['written', 'not_written'])('does not rerecover already terminal %s rows', async outcome => {
    save(journal([{ ...held(), outcome, completedAt: 20_000, ...(outcome === 'written' ? { etag: '"after"' } : {}) }]));
    expect((await inspect()).status).toBe('blocked'); expect(mock.invoke).not.toHaveBeenCalled();
  });
  it.each(['operation_pending', 'operation_unknown', 'operation_conflict', 'registry_unavailable', 'outcome_unknown', 'provider_written_cache_unknown', 'disabled'])('preserves hold on %s', async code => {
    const before = saved(); mock.invoke.mockResolvedValue({ data: { version: 2, ...outboundOperationIdentity(held())!, outcome: 'held', code }, error: null });
    expect((await inspect()).status).toBe('blocked'); expect(saved()).toBe(before);
  });
  it.each([{ requestDigest: 'c'.repeat(64) }, { afterDigest: 'c'.repeat(64) }, { googleCalendarId: 'other@example.test' }, { expectedEtag: '"other"' },
    { operationId: OTHER }, { taskId: 'other-task' }, { calendarAccountId: OTHER }, { eventId: 'other-event' }, { version: 1 }, { completedAt: -1 },
    { result: { outcome: 'written', etag: '"before"', cacheUpdated: true } }, { result: { outcome: 'written', etag: '"after"', cacheUpdated: false } },
    { result: { outcome: 'uncertain', code: 'provider_outcome_unknown' } }, { result: { outcome: 'not_written', code: 'provider_outcome_unknown' } }])('rejects mismatched or unproven completion %j', async change => {
    const before = saved(); mock.invoke.mockResolvedValue({ data: { ...recorded(), ...change }, error: null });
    expect((await inspect()).status).toBe('blocked'); expect(saved()).toBe(before);
  });
  it.each(['requestDigest', 'result', 'completedAt'])('rejects inherited completion %s', async field => {
    const data = { ...recorded() } as Record<string, unknown>; const inherited = Object.create({ [field]: data[field] }); delete data[field]; Object.assign(inherited, data);
    mock.invoke.mockResolvedValue({ data: inherited, error: null }); expect((await inspect()).status).toBe('blocked');
  });
  it.each(['owner', 'stop', 'journal', 'auth'])('suppresses lookup after %s changes', async change => {
    const pending = deferred<{ data: unknown; error: null }>(); mock.invoke.mockReturnValue(pending.promise);
    const result = inspect(); await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce());
    if (change === 'owner') manager.start(OTHER); if (change === 'stop') manager.stop();
    if (change === 'journal') save(journal([legacy()])); if (change === 'auth') mock.user.mockResolvedValue({ data: { user: { id: OTHER } }, error: null });
    pending.resolve({ data: recorded(), error: null }); expect((await result).status).toBe('blocked');
  });
  it.each(['owner', 'stop', 'journal', 'expiry', 'refresh'])('blocks stale confirmation after %s without a second receipt request', async change => {
    const token = await reviewToken(); const before = saved();
    if (change === 'owner') manager.start(OTHER); if (change === 'stop') manager.stop(); if (change === 'journal') save(journal([legacy()]));
    if (change === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000); if (change === 'refresh') await manager.refreshOutboundHolds();
    expect((await manager.confirmRecordedOutboundRecovery(token)).success).toBe(false); expect(mock.invoke).toHaveBeenCalledOnce();
    if (change !== 'journal') expect(saved()).toBe(before);
  });
  it.each(['completedAt', 'etag', 'outcome', 'identity'])('requires the exact same completed receipt on confirmation: changed %s', async change => {
    const token = await reviewToken(); const before = saved();
    const data = change === 'completedAt' ? { ...recorded(), completedAt: 3 } : change === 'etag' ? { ...recorded(), result: { outcome: 'written', etag: '"another"', cacheUpdated: true } }
      : change === 'outcome' ? { ...recorded(), result: { outcome: 'not_written', code: 'stale_review' } } : { ...recorded(), requestDigest: 'f'.repeat(64) };
    mock.invoke.mockResolvedValue({ data, error: null }); expect((await manager.confirmRecordedOutboundRecovery(token)).success).toBe(false); expect(saved()).toBe(before);
  });
  it.each(['expiry', 'auth', 'journal', 'stop'])('rechecks %s after the asynchronous confirmation read', async change => {
    const token = await reviewToken(); const before = saved(); const pending = deferred<{ data: unknown; error: null }>(); mock.invoke.mockReturnValue(pending.promise);
    const result = manager.confirmRecordedOutboundRecovery(token); await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(2));
    if (change === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
    if (change === 'auth') mock.user.mockResolvedValue({ data: { user: { id: OTHER } }, error: null });
    if (change === 'journal') save(journal([legacy()])); if (change === 'stop') manager.stop();
    pending.resolve({ data: recorded(), error: null }); expect((await result).success).toBe(false); if (change !== 'journal') expect(saved()).toBe(before);
  });
  it('keeps the local hold when final persistence fails and consumes the preview', async () => {
    const token = await reviewToken(); const before = saved(); vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('PRIVATE_DETAIL'); });
    const result = await manager.confirmRecordedOutboundRecovery(token); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_DETAIL');
    expect(saved()).toBe(before); expect((await manager.confirmRecordedOutboundRecovery(token)).success).toBe(false); expect(mock.invoke).toHaveBeenCalledTimes(2);
  });
  it('keeps the hold on unreadable/malformed/failing server lookup', async () => {
    const before = saved(); mock.invoke.mockRejectedValue(new Error('PRIVATE_DETAIL')); expect((await inspect()).status).toBe('blocked'); expect(saved()).toBe(before);
    mock.invoke.mockResolvedValue({ data: null, error: { context: new Response('not-json', { status: 500 }) } }); expect((await inspect()).status).toBe('blocked'); expect(saved()).toBe(before);
  });
  it('does not let mutation of returned review data rewrite its internal confirmation proof', async () => {
    const preview = await inspect(); expect(preview.status).toBe('reviewable'); if (preview.status !== 'reviewable') return;
    preview.receipt.completedAt = 500; if (preview.receipt.result.outcome === 'written') preview.receipt.result.etag = '"tampered"';
    expect((await manager.confirmRecordedOutboundRecovery(preview.reviewToken)).success).toBe(true);
    expect(readOutboundJournal(OWNER).journal.receipts[0].etag).toBe('"after"');
  });
  it.each(['inspect', 'confirm'])('detaches strict %s server evidence before deferred owner revalidation', async phase => {
    const token = phase === 'confirm' ? await reviewToken() : null;
    const data = recorded(); mock.invoke.mockResolvedValue({ data, error: null });
    const auth = deferred<{ data: { user: { id: string } }; error: null }>();
    const calls = mock.user.mock.calls.length;
    mock.user.mockResolvedValueOnce({ data: { user: { id: OWNER } }, error: null }).mockReturnValueOnce(auth.promise);
    const pending = phase === 'inspect' ? inspect() : manager.confirmRecordedOutboundRecovery(token!);
    await vi.waitFor(() => expect(mock.user).toHaveBeenCalledTimes(calls + 2));
    data.result.cacheUpdated = false; data.result.etag = '"mutated"'; data.completedAt = -1; data.googleCalendarId = 'other@example.test';
    auth.resolve({ data: { user: { id: OWNER } }, error: null });
    const result = await pending;
    if ('status' in result) {
      expect(result.status).toBe('reviewable');
      if (result.status === 'reviewable') expect(result.receipt).toMatchObject({ googleCalendarId: 'synthetic@example.test', completedAt: 2,
        result: { outcome: 'written', cacheUpdated: true, etag: '"after"' } });
      expect(readOutboundJournal(OWNER).journal.receipts[0].outcome).toBe('pending');
    } else {
      expect(result.success).toBe(true); expect(readOutboundJournal(OWNER).journal.receipts[0]).toMatchObject({ outcome: 'written', etag: '"after"' });
    }
  });
  it('coalesces duplicate confirmation into one re-read and one journal write', async () => {
    const token = await reviewToken(); const pending = deferred<{ data: unknown; error: null }>(); mock.invoke.mockReturnValue(pending.promise);
    const writes = vi.spyOn(localStorage, 'setItem'); const a = manager.confirmRecordedOutboundRecovery(token); const b = manager.confirmRecordedOutboundRecovery(token);
    await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(2)); expect(locks.size).toBe(1);
    pending.resolve({ data: recorded(), error: null }); expect((await a).success).toBe(true); expect((await b).success).toBe(true); expect(writes).toHaveBeenCalledOnce();
  });
});

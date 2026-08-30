import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ status: vi.fn(), refresh: vi.fn(), observe: vi.fn(), inspect: vi.fn(), confirm: vi.fn(), dispatch: vi.fn(), sync: vi.fn() }));
vi.mock('@/services/calendarTaskSyncManager', () => ({ calendarTaskSyncManager: { getStatus: mock.status,
  refreshOutboundHolds: mock.refresh, inspectOutboundHold: mock.observe, inspectRecordedOutboundRecovery: mock.inspect,
  confirmRecordedOutboundRecovery: mock.confirm, confirmOutboundUpdate: mock.dispatch, performFullSync: mock.sync } }));
import { CalendarOutboundOutcomePanel } from '../CalendarOutboundOutcomePanel';
const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const ACCOUNT = '30000000-0000-4000-8000-000000000003';
const OP = '40000000-0000-4000-8000-000000000004';
const LEGACY = '50000000-0000-4000-8000-000000000005';
const TOKEN = '60000000-0000-4000-8000-000000000006';
const identity = () => ({ operationId: OP, taskId: 'missing-task', calendarAccountId: ACCOUNT, eventId: 'same-event',
  googleCalendarId: 'synthetic@example.test', expectedEtag: '"original"', requestDigest: 'a'.repeat(64), afterDigest: 'b'.repeat(64) });
const held = () => ({ operationId: OP, taskId: 'missing-task', calendarAccountId: ACCOUNT, eventId: 'same-event', createdAt: 1000,
  outcome: 'pending', intent: { version: 2, googleCalendarId: identity().googleCalendarId, expectedEtag: identity().expectedEtag,
    requestDigest: identity().requestDigest, afterDigest: identity().afterDigest } });
const legacy = () => ({ operationId: LEGACY, taskId: 'missing-legacy-task', calendarAccountId: ACCOUNT, eventId: 'same-event', createdAt: 500, completedAt: 1000, outcome: 'uncertain' });
const recorded = () => ({ version: 2, ...identity(), outcome: 'recorded', completedAt: 2000, result: { outcome: 'written', etag: '"updated"', cacheUpdated: true } });
const preview = () => ({ status: 'reviewable', reviewToken: TOKEN, receipt: recorded(), message: 'Recorded.' });
const completion = () => ({ success: true, operationId: OP, outcome: 'written', message: 'Saved.' });
const refresh = () => screen.getByRole('button', { name: 'Refresh saved update holds' });
const review = () => screen.getByRole('button', { name: 'Review saved server receipt for hold 1' });
const save = () => screen.getByRole('button', { name: 'Save verified completion' });
const load = async () => { fireEvent.click(refresh()); await waitFor(() => expect(review()).toBeEnabled()); };
const inspect = async () => { await load(); fireEvent.click(review()); await screen.findByText('Review the saved server completion'); };
function deferred() { let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; }); return { promise, resolve }; }
describe('Calendar outcome explicit recorded receipt recovery', () => {
  let owner: string | null;
  beforeEach(() => {
    vi.resetAllMocks(); owner = OWNER;
    mock.status.mockImplementation(() => ({ isRunning: owner !== null, ownerUserId: owner }));
    mock.refresh.mockResolvedValue({ success: true, items: [held(), legacy()], message: 'Loaded.' });
    mock.inspect.mockResolvedValue(preview()); mock.confirm.mockResolvedValue(completion());
  });
  afterEach(() => { cleanup(); expect(mock.observe).not.toHaveBeenCalled(); expect(mock.dispatch).not.toHaveBeenCalled(); expect(mock.sync).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
  it('has no automatic fetch and exposes receipt lookup only for intent-bound holds', async () => {
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />);
    expect(mock.refresh).not.toHaveBeenCalled(); expect(mock.inspect).not.toHaveBeenCalled(); await load();
    expect(screen.getAllByRole('button', { name: /Review saved server receipt for hold/ })).toHaveLength(1);
    expect(screen.getByText(/Legacy hold: no operation-bound intent/)).toBeInTheDocument();
    expect(mock.inspect).not.toHaveBeenCalled(); expect(mock.confirm).not.toHaveBeenCalled();
  });
  it('requires explicit review and confirmation and removes only the matching operation, not a same-event legacy hold', async () => {
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect();
    expect(mock.inspect).toHaveBeenCalledExactlyOnceWith(OP); expect(mock.confirm).not.toHaveBeenCalled();
    expect(screen.getByText('Google calendar destination: synthetic@example.test')).toBeInTheDocument();
    expect(screen.getByText(/historical execution receipt/)).toBeInTheDocument();
    expect(screen.getByText('Saved holds in this browser journal: 2')).toBeInTheDocument();
    fireEvent.click(save()); await screen.findByText(/Verified server completion saved in this browser/);
    expect(mock.confirm).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(screen.getByText('Saved holds in this browser journal: 1')).toBeInTheDocument();
    expect(screen.getByText(`Operation reference: ${LEGACY}`)).toBeInTheDocument();
    expect(screen.queryByText(`Operation reference: ${OP}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save verified completion' })).not.toBeInTheDocument();
  });
  it('renders recorded not-written distinctly and only accepts matching local completion', async () => {
    mock.inspect.mockResolvedValue({ ...preview(), receipt: { ...recorded(), result: { outcome: 'not_written', code: 'stale_review' } } });
    mock.confirm.mockResolvedValue({ ...completion(), outcome: 'not_written' });
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect();
    expect(screen.getByText('The server recorded that this exact Google update was not written.')).toBeInTheDocument();
    fireEvent.click(save()); await screen.findByText('Saved holds in this browser journal: 1');
  });
  it('cancels a displayed review without reading, writing or clearing a hold', async () => {
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel receipt review' }));
    expect(screen.queryByText('Review the saved server completion')).not.toBeInTheDocument();
    expect(screen.getByText('Saved holds in this browser journal: 2')).toBeInTheDocument();
    expect(mock.inspect).toHaveBeenCalledTimes(1); expect(mock.confirm).not.toHaveBeenCalled();
  });
  it.each(['blocked', 'held', 'raw', 'legacy', 'operation', 'task', 'account', 'event', 'googleCalendarId', 'requestDigest', 'afterDigest', 'expectedEtag', 'contradiction', 'extra', 'token', 'inherited'])('retains holds for %s lookup evidence', async kind => {
    const value = preview();
    const invalid = kind === 'blocked' ? { status: 'blocked' } : kind === 'raw' ? { success: true }
      : kind === 'held' ? { ...value, receipt: { ...identity(), version: 2, outcome: 'held', code: 'operation_pending' } }
      : kind === 'legacy' ? { ...value, receipt: { ...recorded(), version: 1 } }
      : kind === 'token' ? { ...value, reviewToken: 'not-uuid' }
      : kind === 'inherited' ? Object.create(value)
      : kind === 'contradiction' ? { ...value, receipt: { ...recorded(), result: { outcome: 'written', etag: '"updated"', cacheUpdated: false } } }
      : kind === 'extra' ? { ...value, receipt: { ...recorded(), providerFields: {} } }
      : { ...value, receipt: { ...recorded(), [kind === 'operation' ? 'operationId' : kind === 'task' ? 'taskId' : kind === 'account' ? 'calendarAccountId' : kind === 'event' ? 'eventId' : kind]: kind.includes('Digest') ? 'c'.repeat(64) : OTHER } };
    mock.inspect.mockResolvedValue(invalid); render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await load(); fireEvent.click(review());
    await screen.findByText(/No exact completed server receipt was verified/);
    expect(screen.getByText('Saved holds in this browser journal: 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save verified completion' })).not.toBeInTheDocument(); expect(mock.confirm).not.toHaveBeenCalled();
  });
  it.each(['failed', 'raw', 'operation', 'outcome', 'inherited', 'throw'])('retains the displayed hold and consumes preview after %s local confirmation', async kind => {
    if (kind === 'throw') mock.confirm.mockRejectedValue(new Error('PRIVATE'));
    else mock.confirm.mockResolvedValue(kind === 'failed' ? { success: false } : kind === 'raw' ? true
      : kind === 'inherited' ? Object.create(completion()) : { ...completion(), ...(kind === 'operation' ? { operationId: OTHER } : { outcome: 'not_written' }) });
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect(); fireEvent.click(save());
    await screen.findByText(/The completion was not confirmed locally/);
    expect(screen.getByText('Saved holds in this browser journal: 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save verified completion' })).not.toBeInTheDocument(); expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
  });
  it.each(['inspect', 'confirm'])('prevents duplicate %s clicks while evidence is pending', async kind => {
    const pending = deferred(); render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />);
    if (kind === 'inspect') { await load(); mock.inspect.mockReturnValue(pending.promise); fireEvent.click(review()); fireEvent.click(review()); }
    else { await inspect(); mock.confirm.mockReturnValue(pending.promise); const button = save(); fireEvent.click(button); fireEvent.click(button); }
    expect(kind === 'inspect' ? mock.inspect : mock.confirm).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(kind === 'inspect' ? preview() : completion()); await pending.promise; });
  });
  it.each(['inspect', 'confirm'])('suppresses stale-owner %s completion', async kind => {
    const pending = deferred(); const view = render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />);
    if (kind === 'inspect') { await load(); mock.inspect.mockReturnValue(pending.promise); fireEvent.click(review()); }
    else { await inspect(); mock.confirm.mockReturnValue(pending.promise); fireEvent.click(save()); }
    owner = OTHER; view.rerender(<CalendarOutboundOutcomePanel readyOwner={OTHER} />);
    await act(async () => { pending.resolve(kind === 'inspect' ? preview() : completion()); await pending.promise; });
    expect(screen.queryByText('Review the saved server completion')).not.toBeInTheDocument();
    expect(screen.queryByText(/Verified server completion saved/)).not.toBeInTheDocument();
    expect(screen.queryByText(`Operation reference: ${OP}`)).not.toBeInTheDocument();
  });
  it.each(['stop', 'unmount'])('suppresses review after manager %s', async kind => {
    const pending = deferred(); const view = render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await load();
    mock.inspect.mockReturnValue(pending.promise); fireEvent.click(review());
    if (kind === 'stop') owner = null; else view.unmount();
    await act(async () => { pending.resolve(preview()); await pending.promise; });
    expect(screen.queryByText('Review the saved server completion')).not.toBeInTheDocument(); expect(mock.confirm).not.toHaveBeenCalled();
  });
  it('refresh invalidates a displayed review without applying it', async () => {
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect(); fireEvent.click(refresh());
    await waitFor(() => expect(review()).toBeEnabled()); expect(screen.queryByRole('button', { name: 'Save verified completion' })).not.toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
  });
});

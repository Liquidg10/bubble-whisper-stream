import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ status: vi.fn(), refresh: vi.fn(), inspect: vi.fn(), confirm: vi.fn(), sync: vi.fn(), toast: vi.fn() }));
vi.mock('@/services/calendarTaskSyncManager', () => ({ calendarTaskSyncManager: { getStatus: mock.status,
  refreshOutboundHolds: mock.refresh, inspectOutboundHold: mock.inspect, confirmOutboundUpdate: mock.confirm, performFullSync: mock.sync } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
import { CalendarOutboundOutcomePanel } from '../CalendarOutboundOutcomePanel';
const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const ACCOUNT = '30000000-0000-4000-8000-000000000003';
const OPERATION = '40000000-0000-4000-8000-000000000004';
const receipt = () => ({ operationId: OPERATION, calendarAccountId: ACCOUNT, eventId: 'orphaned-event', taskId: 'missing-task', createdAt: 1000, outcome: 'pending' });
const inventory = () => ({ success: true, items: [receipt()], message: 'Saved holds listed.' });
const observation = () => ({ status: 'observed', observationOnly: true, operationId: OPERATION, calendarAccountId: ACCOUNT,
  eventId: 'orphaned-event', etag: '"current"', observedAt: 1000, fields: { title: 'Current provider title', description: 'Current description', location: '',
    startTime: '2030-01-01T10:00:00.000Z', endTime: '2030-01-01T11:00:00.000Z', startTz: 'UTC', endTz: null }, message: 'Observation only.' });
const refreshButton = () => screen.getByRole('button', { name: 'Refresh saved update holds' });
const inspectButton = () => screen.getByRole('button', { name: 'Inspect current Google event for saved hold 1' });
const load = async () => { fireEvent.click(refreshButton()); await waitFor(() => expect(inspectButton()).toBeEnabled()); };
const inspect = async () => { await load(); fireEvent.click(inspectButton()); await screen.findByText('Current Google event — observation only'); };
function deferred() { let resolve!: (value: unknown) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
describe('CalendarOutboundOutcomePanel explicit legacy hold inspection', () => {
  let owner: string | null;
  beforeEach(() => {
    vi.resetAllMocks(); owner = OWNER;
    mock.status.mockImplementation(() => ({ isRunning: owner !== null, ownerUserId: owner }));
    mock.refresh.mockResolvedValue(inventory()); mock.inspect.mockResolvedValue(observation());
  });
  afterEach(() => { cleanup(); expect(mock.confirm).not.toHaveBeenCalled(); expect(mock.sync).not.toHaveBeenCalled(); expect(mock.toast).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
  it('has no mount fetch and requires the matching active owner', () => {
    const view = render(<CalendarOutboundOutcomePanel readyOwner={null} />); expect(refreshButton()).toBeDisabled();
    view.rerender(<CalendarOutboundOutcomePanel readyOwner={OTHER} />); expect(refreshButton()).toBeDisabled();
    view.rerender(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); expect(refreshButton()).toBeEnabled();
    expect(mock.refresh).not.toHaveBeenCalled(); expect(mock.inspect).not.toHaveBeenCalled();
    expect(screen.getByText(/No verified hold inventory is currently shown/)).toBeInTheDocument();
    expect(screen.queryByText('Saved holds in this browser journal: 0')).not.toBeInTheDocument();
  });
  it('shows orphaned locators and read-only provider fields without removing holds or offering replay', async () => {
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect();
    expect(mock.refresh).toHaveBeenCalledExactlyOnceWith(); expect(mock.inspect).toHaveBeenCalledExactlyOnceWith(OPERATION);
    expect(screen.getByText('Saved task reference: missing-task')).toBeInTheDocument();
    expect(screen.getByText(`Calendar account reference: ${ACCOUNT}`)).toBeInTheDocument();
    expect(screen.getByText('Google event reference: orphaned-event')).toBeInTheDocument();
    expect(screen.getByLabelText('Title observed')).toHaveTextContent('Current provider title');
    expect(screen.getByLabelText('Location observed')).toHaveTextContent('(empty)');
    expect(screen.getByLabelText('End time zone observed')).toHaveTextContent('No named time zone');
    expect(screen.getByText('Saved holds in this browser journal: 1')).toBeInTheDocument();
    expect(screen.getByText(/The original update outcome is not established by these values/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm|reset|retry|clear|restore/i })).not.toBeInTheDocument();
  });
  it.each(['pending', 'uncertain', 'provider_written'])('keeps %s receipt visibly held after observation', async outcome => {
    mock.refresh.mockResolvedValue({ ...inventory(), items: [{ ...receipt(), outcome,
      ...(outcome === 'pending' ? {} : { completedAt: 2000 }), ...(outcome === 'provider_written' ? { etag: '"current"' } : {}) }] });
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect();
    expect(screen.getByText('Saved holds in this browser journal: 1')).toBeInTheDocument(); expect(inspectButton()).toBeEnabled();
  });
  it('reports scoped zero only after confirmed refresh and never as global drained state', async () => {
    mock.refresh.mockResolvedValue({ ...inventory(), items: [] }); render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />);
    fireEvent.click(refreshButton()); await screen.findByText('Saved holds in this browser journal: 0');
    expect(screen.getByText(/This is not proof that other calendar activity has stopped/)).toBeInTheDocument(); expect(mock.inspect).not.toHaveBeenCalled();
  });
  it.each([{ success: false, items: [] }, { items: [] }, { success: 'true', items: [] }, { success: true },
    { success: true, items: [receipt(), receipt()] }, { success: true, items: [{ ...receipt(), outcome: 'not_written', completedAt: 2000 }] },
    { success: true, items: [{ ...receipt(), taskId: '<invalid>' }] }])('never displays malformed or unavailable inventory as zero %j', async result => {
    mock.refresh.mockResolvedValue(result); render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); fireEvent.click(refreshButton());
    await screen.findByText(/Saved update holds could not be verified/); expect(screen.queryByText(/Saved holds in this browser journal:/)).not.toBeInTheDocument();
  });
  it('rejects inherited inventory success', async () => {
    mock.refresh.mockResolvedValue(Object.assign(Object.create({ success: true }), { items: [receipt()] }));
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); fireEvent.click(refreshButton()); await screen.findByText(/Saved update holds could not be verified/);
  });
  it('clears stale inventory after a failed explicit refresh', async () => {
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await inspect(); mock.refresh.mockRejectedValue(new Error('PRIVATE_DETAIL'));
    fireEvent.click(refreshButton()); await screen.findByText(/Saved update holds could not be verified/);
    expect(screen.queryByText('Current provider title')).not.toBeInTheDocument(); expect(screen.queryByText('Saved task reference: missing-task')).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE_DETAIL/)).not.toBeInTheDocument();
  });
  it.each([{ operationId: OTHER }, { calendarAccountId: OTHER }, { eventId: 'other' }, { status: 'written' }, { observationOnly: false },
    { observedAt: NaN }, { fields: { ...observation().fields, title: '' } }, { etag: 'invalid' }])('rejects mismatched or misleading observation %j', async change => {
    mock.inspect.mockResolvedValue({ ...observation(), ...change }); render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await load(); fireEvent.click(inspectButton());
    await screen.findByText( /Current Google event inspection is unavailable/);
    expect(screen.queryByText('Current provider title')).not.toBeInTheDocument(); expect(screen.getByText('Saved holds in this browser journal: 1')).toBeInTheDocument();
  });
  it('rejects inherited observation identity and hides raw provider errors', async () => {
    const raw = { ...observation() } as Record<string, unknown>; delete raw.operationId;
    mock.inspect.mockResolvedValue(Object.assign(Object.create({ operationId: OPERATION }), raw));
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await load(); fireEvent.click(inspectButton());
    await screen.findByText(/Current Google event inspection is unavailable/);
    mock.inspect.mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAIL')); fireEvent.click(inspectButton());
    await waitFor(() => expect(mock.inspect).toHaveBeenCalledTimes(2)); await waitFor(() => expect(inspectButton()).toBeEnabled());
    expect(screen.queryByText(/PRIVATE_PROVIDER_DETAIL/)).not.toBeInTheDocument(); expect(screen.queryByText('Current provider title')).not.toBeInTheDocument();
  });
  it('explains disabled inspection without asserting the earlier update was unwritten', async () => {
    mock.inspect.mockResolvedValue({ status: 'blocked', code: 'disabled', message: 'PRIVATE_DETAIL' });
    render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await load(); fireEvent.click(inspectButton());
    await screen.findByText(/Calendar outcome inspection is not enabled/); expect(screen.getByText('Saved holds in this browser journal: 1')).toBeInTheDocument();
    expect(screen.queryByText(/No update was sent|PRIVATE_DETAIL/)).not.toBeInTheDocument();
  });
  it.each(['refresh', 'inspect'] as const)('coalesces duplicate %s clicks while waiting', async kind => {
    const pending = deferred(); render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />);
    if (kind === 'inspect') await load(); mock[kind].mockReturnValue(pending.promise);
    const button = kind === 'refresh' ? refreshButton() : inspectButton(); fireEvent.click(button); fireEvent.click(button);
    expect(mock[kind]).toHaveBeenCalledTimes(1); expect(button).toBeDisabled();
    await act(async () => { pending.resolve(kind === 'refresh' ? inventory() : observation()); await pending.promise; });
    expect(refreshButton()).toBeEnabled();
  });
  it.each(['refresh', 'inspect'] as const)('suppresses late %s after owner switch', async kind => {
    const pending = deferred(); const view = render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />);
    if (kind === 'inspect') await load(); mock[kind].mockReturnValue(pending.promise);
    fireEvent.click(kind === 'refresh' ? refreshButton() : inspectButton()); owner = OTHER;
    view.rerender(<CalendarOutboundOutcomePanel readyOwner={OTHER} />);
    expect(screen.queryByText('Saved task reference: missing-task')).not.toBeInTheDocument();
    await act(async () => { pending.resolve(kind === 'refresh' ? inventory() : observation()); await pending.promise; });
    expect(screen.queryByText('Current provider title')).not.toBeInTheDocument(); expect(screen.queryByText('Saved task reference: missing-task')).not.toBeInTheDocument();
  });
  it('hides pending content if manager stops without parent render', async () => {
    const pending = deferred(); render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await load();
    mock.inspect.mockReturnValue(pending.promise); fireEvent.click(inspectButton()); owner = null;
    await act(async () => { pending.resolve(observation()); await pending.promise; });
    expect(screen.queryByText('Current provider title')).not.toBeInTheDocument(); expect(screen.queryByText('Saved task reference: missing-task')).not.toBeInTheDocument();
    expect(refreshButton()).toBeDisabled();
  });
  it('suppresses completion after unmount', async () => {
    const pending = deferred(); const view = render(<CalendarOutboundOutcomePanel readyOwner={OWNER} />); await load();
    mock.inspect.mockReturnValue(pending.promise); fireEvent.click(inspectButton()); view.unmount();
    await act(async () => { pending.resolve(observation()); await pending.promise; }); expect(screen.queryByText('Current provider title')).not.toBeInTheDocument();
  });
});

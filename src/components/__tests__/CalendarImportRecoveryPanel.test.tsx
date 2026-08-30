import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ status: vi.fn(), refresh: vi.fn(), inspect: vi.fn(), confirm: vi.fn(), toast: vi.fn(), fullSync: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock('@/services/calendarTaskSyncManager', () => ({ calendarTaskSyncManager: {
  getStatus: mock.status, refreshUnresolvedImports: mock.refresh, inspectImportRecovery: mock.inspect,
  confirmImportRecovery: mock.confirm, performFullSync: mock.fullSync, syncCalendarToTask: mock.create, deleteTask: mock.remove,
} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
import { CalendarImportRecoveryPanel } from '../CalendarImportRecoveryPanel';

const OWNER_A = '10000000-0000-4000-8000-000000000001';
const OWNER_B = '20000000-0000-4000-8000-000000000002';
const ENTRY = { calendarAccountId: '30000000-0000-4000-8000-000000000003', eventId: 'event-fixture' };
const list = () => ({ success: true, items: [{ ...ENTRY }], message: 'Known holds loaded.' });
const review = () => ({ status: 'recoverable' as const, message: 'An exact saved match is available for review.', reviewToken: 'opaque-single-use-token', taskId: 'saved-task-fixture', taskTitle: 'Saved planning task', eventTitle: 'Planning calendar event' });
const confirmed = () => ({ success: true, message: 'Saved link restored.', taskId: 'saved-task-fixture' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const refreshButton = () => screen.getByRole('button', { name: 'Refresh recovery list' });
const reviewButton = () => screen.getByRole('button', { name: 'Review saved task link for unresolved import 1' });
const confirmButton = () => screen.getByRole('button', { name: 'Restore saved task link' });
async function loadList() {
  fireEvent.click(refreshButton());
  await waitFor(() => expect(reviewButton()).toBeEnabled());
}
async function loadReview() {
  await loadList();
  fireEvent.click(reviewButton());
  await waitFor(() => expect(confirmButton()).toBeEnabled());
}

describe('CalendarImportRecoveryPanel explicit owner-bound saved-link recovery', () => {
  let managerOwner: string | null;
  beforeEach(() => {
    vi.resetAllMocks();
    managerOwner = OWNER_A;
    mock.status.mockImplementation(() => ({ isRunning: managerOwner !== null, ownerUserId: managerOwner, pendingOperations: 0, unresolvedOperations: 99 }));
    mock.refresh.mockResolvedValue(list());
    mock.inspect.mockResolvedValue(review());
    mock.confirm.mockResolvedValue(confirmed());
  });
  afterEach(() => {
    cleanup();
    expect(mock.fullSync).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('does not load inventory or perform inspection on mount, and disables signed-out or mismatched owners', () => {
    const view = render(<CalendarImportRecoveryPanel readyOwner={null} />);
    expect(refreshButton()).toBeDisabled();
    fireEvent.click(refreshButton());
    view.rerender(<CalendarImportRecoveryPanel readyOwner={OWNER_B} />);
    expect(refreshButton()).toBeDisabled();
    view.rerender(<CalendarImportRecoveryPanel readyOwner={OWNER_A} />);
    expect(refreshButton()).toBeEnabled();
    expect(mock.refresh).not.toHaveBeenCalled();
    expect(mock.inspect).not.toHaveBeenCalled();
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(screen.queryByText(/Known unresolved imports in this list:/)).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('requires explicit refresh, inspected labels, and confirmation before restoring the exact saved link', async () => {
    const onRecovered = vi.fn();
    render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} onRecovered={onRecovered} />);
    await loadList();
    expect(mock.refresh).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByText('Known unresolved imports in this list: 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore saved task link' })).not.toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
    fireEvent.click(reviewButton());
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(mock.inspect).toHaveBeenCalledExactlyOnceWith(ENTRY.calendarAccountId, ENTRY.eventId);
    expect(screen.getByText('Saved task: Saved planning task')).toBeInTheDocument();
    expect(screen.getByText('Calendar event: Planning calendar event')).toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(mock.confirm).toHaveBeenCalledExactlyOnceWith('opaque-single-use-token');
    expect(onRecovered).toHaveBeenCalledOnce();
    expect(screen.getByText('Known unresolved imports in this list: 0')).toBeInTheDocument();
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved task link restored', description: expect.stringContaining('No task was created, deleted, or rewritten') }));
    expect(screen.getByText(/existing task and its content were preserved/)).toBeInTheDocument();
    expect(screen.queryByText('opaque-single-use-token')).not.toBeInTheDocument();
  });

  it('bounds review labels without changing the opaque confirmation token', async () => {
    mock.inspect.mockResolvedValue({ ...review(), taskTitle: `Task ${'x'.repeat(300)}`, eventTitle: `Event\n${'y'.repeat(300)}` });
    render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} />);
    await loadReview();
    expect(screen.getByText(/^Saved task:/).textContent!.length).toBeLessThan(180);
    expect(screen.getByText(/^Calendar event:/).textContent!.length).toBeLessThan(185);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mock.confirm).toHaveBeenCalledExactlyOnceWith('opaque-single-use-token'));
  });

  it.each(['false', 'rejection', 'malformed', 'duplicate'])('does not turn an unverified inventory into an empty successful list: %s', async failure => {
    if (failure === 'false') mock.refresh.mockResolvedValue({ success: false, items: [], message: 'Recovery coordination is unavailable.' });
    if (failure === 'rejection') mock.refresh.mockRejectedValue(new Error('private-provider-payload'));
    if (failure === 'malformed') mock.refresh.mockResolvedValue({ success: true, items: [{}], message: 'bad' });
    if (failure === 'duplicate') mock.refresh.mockResolvedValue({ success: true, items: [ENTRY, ENTRY], message: 'bad' });
    render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} />);
    fireEvent.click(refreshButton());
    await waitFor(() => expect(refreshButton()).toBeEnabled());
    expect(screen.queryByText(/Known unresolved imports in this list:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No known holds were returned/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review saved task link/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private-provider-payload');
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it.each(['blocked', 'rejection', 'missing-token', 'missing-labels'])('requires a complete recoverable review, not a blind confirmation: %s', async outcome => {
    if (outcome === 'blocked') mock.inspect.mockResolvedValue({ status: 'blocked', message: 'The saved match is not unique. Review is required.' });
    if (outcome === 'rejection') mock.inspect.mockRejectedValue(new Error('private-provider-payload'));
    if (outcome === 'missing-token') mock.inspect.mockResolvedValue({ ...review(), reviewToken: undefined });
    if (outcome === 'missing-labels') mock.inspect.mockResolvedValue({ ...review(), taskTitle: undefined });
    render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} />);
    await loadList();
    fireEvent.click(reviewButton());
    await waitFor(() => expect(reviewButton()).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Restore saved task link' })).not.toBeInTheDocument();
    expect(screen.getByText('Known unresolved imports in this list: 1')).toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('private-provider-payload');
  });

  it.each(['false', 'rejection', 'mismatched-task'])('keeps the hold visible and requires a fresh review after unconfirmed restoration: %s', async outcome => {
    if (outcome === 'false') mock.confirm.mockResolvedValue({ success: false, message: 'The saved match changed. Review it again.' });
    if (outcome === 'rejection') mock.confirm.mockRejectedValue(new Error('private-provider-payload'));
    if (outcome === 'mismatched-task') mock.confirm.mockResolvedValue({ ...confirmed(), taskId: 'different-task' });
    const onRecovered = vi.fn();
    render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} onRecovered={onRecovered} />);
    await loadReview();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(reviewButton()).toBeEnabled());
    expect(screen.getByText('Known unresolved imports in this list: 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore saved task link' })).not.toBeInTheDocument();
    expect(mock.confirm).toHaveBeenCalledOnce();
    expect(mock.inspect).toHaveBeenCalledOnce();
    expect(mock.toast).not.toHaveBeenCalled();
    expect(onRecovered).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('private-provider-payload');
  });

  it('coalesces duplicate refresh, inspection, and confirmation clicks without any automatic replay', async () => {
    const inventory = deferred<ReturnType<typeof list>>();
    const inspection = deferred<ReturnType<typeof review>>();
    const confirmation = deferred<ReturnType<typeof confirmed>>();
    mock.refresh.mockReturnValue(inventory.promise);
    mock.inspect.mockReturnValue(inspection.promise);
    mock.confirm.mockReturnValue(confirmation.promise);
    render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} />);
    const refresh = refreshButton();
    fireEvent.click(refresh); fireEvent.click(refresh);
    expect(mock.refresh).toHaveBeenCalledOnce();
    await act(async () => { inventory.resolve(list()); await inventory.promise; });
    const inspect = reviewButton();
    fireEvent.click(inspect); fireEvent.click(inspect);
    expect(mock.inspect).toHaveBeenCalledOnce();
    await act(async () => { inspection.resolve(review()); await inspection.promise; });
    const confirm = confirmButton();
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(mock.confirm).toHaveBeenCalledOnce();
    await act(async () => { confirmation.resolve(confirmed()); await confirmation.promise; });
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(mock.inspect).toHaveBeenCalledOnce();
    expect(mock.confirm).toHaveBeenCalledOnce();
  });

  it.each(['refresh', 'inspection', 'confirmation'] as const)('ignores a late %s response after the owner changes', async phase => {
    const pending = deferred<ReturnType<typeof list> | ReturnType<typeof review> | ReturnType<typeof confirmed>>();
    const onRecovered = vi.fn();
    const view = render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} onRecovered={onRecovered} />);
    if (phase === 'refresh') {
      mock.refresh.mockReturnValue(pending.promise);
      fireEvent.click(refreshButton());
    } else if (phase === 'inspection') {
      await loadList();
      mock.inspect.mockReturnValue(pending.promise);
      fireEvent.click(reviewButton());
    } else {
      await loadReview();
      mock.confirm.mockReturnValue(pending.promise);
      fireEvent.click(confirmButton());
    }
    managerOwner = OWNER_B;
    view.rerender(<CalendarImportRecoveryPanel readyOwner={OWNER_B} onRecovered={onRecovered} />);
    await act(async () => { pending.resolve(phase === 'refresh' ? list() : phase === 'inspection' ? review() : confirmed()); await pending.promise; });
    expect(screen.queryByText(/Known unresolved imports in this list:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Saved task: Saved planning task')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore saved task link' })).not.toBeInTheDocument();
    expect(refreshButton()).toBeEnabled();
    expect(mock.toast).not.toHaveBeenCalled();
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it.each(['refresh', 'inspection', 'confirmation'] as const)('ignores a late %s response after unmount', async phase => {
    const pending = deferred<ReturnType<typeof list> | ReturnType<typeof review> | ReturnType<typeof confirmed>>();
    const onRecovered = vi.fn();
    const view = render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} onRecovered={onRecovered} />);
    if (phase === 'refresh') { mock.refresh.mockReturnValue(pending.promise); fireEvent.click(refreshButton()); }
    else if (phase === 'inspection') { await loadList(); mock.inspect.mockReturnValue(pending.promise); fireEvent.click(reviewButton()); }
    else { await loadReview(); mock.confirm.mockReturnValue(pending.promise); fireEvent.click(confirmButton()); }
    view.unmount();
    await act(async () => { pending.resolve(phase === 'refresh' ? list() : phase === 'inspection' ? review() : confirmed()); await pending.promise; });
    expect(mock.toast).not.toHaveBeenCalled();
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('does not mislabel an already confirmed link if refreshing the parent display throws', async () => {
    const onRecovered = vi.fn(() => { throw new Error('display failed'); });
    render(<CalendarImportRecoveryPanel readyOwner={OWNER_A} onRecovered={onRecovered} />);
    await loadReview();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(screen.getByText(/existing task and its content were preserved/)).toBeInTheDocument();
    expect(screen.queryByText(/was not confirmed/)).not.toBeInTheDocument();
    expect(screen.getByText('Known unresolved imports in this list: 0')).toBeInTheDocument();
  });
});

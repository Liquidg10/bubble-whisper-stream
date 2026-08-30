import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ status: vi.fn(), refresh: vi.fn(), inspect: vi.fn(), confirm: vi.fn(), toast: vi.fn(), fullSync: vi.fn(), import: vi.fn() }));
vi.mock('@/services/calendarTaskSyncManager', () => ({ calendarTaskSyncManager: {
  getStatus: mock.status, refreshOutboundTasks: mock.refresh, inspectOutboundUpdate: mock.inspect,
  confirmOutboundUpdate: mock.confirm, performFullSync: mock.fullSync, syncCalendarToTask: mock.import,
} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
import { CalendarOutboundReviewPanel } from '../CalendarOutboundReviewPanel';

const OWNER_A = '10000000-0000-4000-8000-000000000001';
const OWNER_B = '20000000-0000-4000-8000-000000000002';
const ACCOUNT = '30000000-0000-4000-8000-000000000003';
const EVENT = 'reviewed-event-fixture';
const TASK = { taskId: 'linked-task-fixture', taskTitle: 'Owned planning task', held: false };
const fields = () => ({ title: 'Calendar planning', description: 'An existing description', location: 'Existing location',
  startTime: '2026-09-01T10:00:00-10:00', endTime: '2026-09-01T11:00:00-10:00', startTz: 'Pacific/Honolulu', endTz: null as string | null });
const list = () => ({ success: true, items: [{ ...TASK }], message: 'Linked tasks loaded.' });
const review = () => ({ status: 'reviewable', message: 'An owned event update is available.', taskId: TASK.taskId,
  calendarAccountId: ACCOUNT, eventId: EVENT, googleCalendarId: 'synthetic@example.test',
  reviewToken: 'single-use-review-token', before: fields(), after: { ...fields(), title: 'Updated planning', description: 'Updated description', location: 'Updated location' } });
const confirmed = () => ({ status: 'written', taskId: TASK.taskId, message: 'Provider and local confirmation completed.' });
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const refreshButton = () => screen.getByRole('button', { name: 'Refresh linked tasks' });
const reviewButton = () => screen.getByRole('button', { name: 'Review calendar update for linked task 1' });
const confirmButton = () => screen.getByRole('button', { name: 'Confirm Google Calendar update' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancel review' });
async function loadList() {
  fireEvent.click(refreshButton());
  await waitFor(() => expect(reviewButton()).toBeEnabled());
}
async function loadReview() {
  await loadList();
  fireEvent.click(reviewButton());
  await waitFor(() => expect(confirmButton()).toBeEnabled());
}

describe('CalendarOutboundReviewPanel explicit owner-bound calendar updates', () => {
  let managerOwner: string | null;
  beforeEach(() => {
    vi.resetAllMocks();
    managerOwner = OWNER_A;
    mock.status.mockImplementation(() => ({ isRunning: managerOwner !== null, ownerUserId: managerOwner }));
    mock.refresh.mockResolvedValue(list());
    mock.inspect.mockResolvedValue(review());
    mock.confirm.mockResolvedValue(confirmed());
  });
  afterEach(() => {
    cleanup();
    expect(mock.fullSync).not.toHaveBeenCalled();
    expect(mock.import).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('does not fetch, inspect, or write on mount and rejects signed-out or mismatched accounts', () => {
    const view = render(<CalendarOutboundReviewPanel readyOwner={null} />);
    expect(refreshButton()).toBeDisabled();
    fireEvent.click(refreshButton());
    view.rerender(<CalendarOutboundReviewPanel readyOwner={OWNER_B} />);
    expect(refreshButton()).toBeDisabled();
    view.rerender(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    expect(refreshButton()).toBeEnabled();
    expect(mock.refresh).not.toHaveBeenCalled();
    expect(mock.inspect).not.toHaveBeenCalled();
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(screen.getByText(/separately enabled backend support and Google write permission/)).toBeInTheDocument();
    expect(screen.getByText(/Existing sync conflicts require separate refresh\/review/)).toBeInTheDocument();
  });

  it('requires refresh, exact before/after review, then one explicit confirmation with a matching receipt', async () => {
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadList();
    expect(mock.refresh).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByText('Linked tasks in this list: 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    fireEvent.click(reviewButton());
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(mock.inspect).toHaveBeenCalledExactlyOnceWith(TASK.taskId);
    expect(screen.getByText(`Calendar account reference: ${ACCOUNT}`)).toBeInTheDocument();
    expect(screen.getByText('Google calendar destination: synthetic@example.test')).toBeInTheDocument();
    expect(screen.getByText(`Google event reference: ${EVENT}`)).toBeInTheDocument();
    expect(screen.getByText(`Saved task reference: ${TASK.taskId}`)).toBeInTheDocument();
    expect(screen.getByLabelText('Title before').textContent).toBe('Calendar planning');
    expect(screen.getByLabelText('Title after').textContent).toBe('Updated planning');
    expect(screen.getByLabelText('Description after').textContent).toBe('Updated description');
    expect(screen.getByLabelText('Location after').textContent).toBe('Updated location');
    expect(screen.getByLabelText('Start time after').textContent).toBe(fields().startTime);
    expect(screen.getByLabelText('End time after').textContent).toBe(fields().endTime);
    expect(screen.getByLabelText('Start time zone after').textContent).toBe('Pacific/Honolulu');
    expect(screen.getByLabelText('End time zone after').textContent).toBe('No named time zone (use the numeric offset)');
    expect(mock.confirm).not.toHaveBeenCalled();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(mock.confirm).toHaveBeenCalledExactlyOnceWith('single-use-review-token');
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Google Calendar update confirmed' }));
    expect(screen.getByText(/Google Calendar update confirmed\. Saved task contents remain unchanged/)).toBeInTheDocument();
    expect(screen.queryByText('single-use-review-token')).not.toBeInTheDocument();
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(mock.inspect).toHaveBeenCalledOnce();
  });

  it('shows full bounded confirmation fields and whitespace without truncating, transforming, or exposing the token', async () => {
    const description = `First line\n\t${'x'.repeat(4050)}\nlast line`;
    const material = { ...review(), before: { ...fields(), description: '' }, after: { ...fields(), description } };
    mock.inspect.mockResolvedValue(material);
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadReview();
    expect(screen.getByLabelText('Description after').textContent).toBe(description);
    expect(screen.getByLabelText('Description after')).toHaveClass('whitespace-pre-wrap', 'break-words');
    expect(screen.getByLabelText('Description before').textContent).toBe('(empty)');
    expect(screen.queryByText('single-use-review-token')).not.toBeInTheDocument();
  });

  it('cancels the local review without submitting and requires a fresh inspection for another confirmation', async () => {
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadReview();
    fireEvent.click(cancelButton());
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(screen.getByText(/Review canceled/)).toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
    mock.inspect.mockResolvedValue({ ...review(), reviewToken: 'fresh-token' });
    fireEvent.click(reviewButton());
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(mock.confirm).toHaveBeenCalledExactlyOnceWith('fresh-token'));
    expect(mock.inspect).toHaveBeenCalledTimes(2);
  });

  it('never inspects or confirms held tasks and does not interpret an empty list as all calendar activity verified', async () => {
    mock.refresh.mockResolvedValue({ ...list(), items: [{ ...TASK, held: true }] });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    fireEvent.click(refreshButton());
    await waitFor(() => expect(reviewButton()).toBeDisabled());
    expect(screen.getByText('This task needs outcome review. Do not retry the update.')).toBeInTheDocument();
    fireEvent.click(reviewButton());
    expect(mock.inspect).not.toHaveBeenCalled();
    expect(mock.confirm).not.toHaveBeenCalled();
    mock.refresh.mockResolvedValue({ ...list(), items: [] });
    fireEvent.click(refreshButton());
    await waitFor(() => expect(screen.getByText(/This does not verify other calendar activity/)).toBeInTheDocument());
  });

  it.each(['false', 'null', 'rejection', 'malformed', 'duplicate', 'missing-held', 'overlong-title', 'inherited-id'])('does not present a failed inventory as an empty verified list: %s', async outcome => {
    if (outcome === 'false') mock.refresh.mockResolvedValue({ ...list(), success: false, message: 'private-server-error' });
    if (outcome === 'null') mock.refresh.mockResolvedValue(null);
    if (outcome === 'rejection') mock.refresh.mockRejectedValue(new Error('private-server-error'));
    if (outcome === 'malformed') mock.refresh.mockResolvedValue({ ...list(), items: [{}] });
    if (outcome === 'duplicate') mock.refresh.mockResolvedValue({ ...list(), items: [TASK, TASK] });
    if (outcome === 'missing-held') mock.refresh.mockResolvedValue({ ...list(), items: [{ taskId: TASK.taskId, taskTitle: TASK.taskTitle }] });
    if (outcome === 'overlong-title') mock.refresh.mockResolvedValue({ ...list(), items: [{ ...TASK, taskTitle: 'x'.repeat(4097) }] });
    if (outcome === 'inherited-id') mock.refresh.mockResolvedValue({ ...list(), items: [Object.assign(Object.create({ taskId: TASK.taskId }), { taskTitle: TASK.taskTitle, held: false })] });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    fireEvent.click(refreshButton());
    await waitFor(() => expect(refreshButton()).toBeEnabled());
    expect(screen.queryByText(/Linked tasks in this list:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No linked tasks were returned/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review calendar update for linked task/ })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private-server-error');
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it.each(['blocked', 'null', 'rejection', 'missing-token', 'missing-id', 'different-id', 'missing-field', 'overlong-field', 'invalid-zone', 'inherited-field', 'missing-message'])('blocks incomplete or mismatched reviews without exposing arbitrary errors: %s', async outcome => {
    if (outcome === 'blocked') mock.inspect.mockResolvedValue({ status: 'blocked', message: 'private-server-error' });
    if (outcome === 'null') mock.inspect.mockResolvedValue(null);
    if (outcome === 'rejection') mock.inspect.mockRejectedValue(new Error('private-server-error'));
    if (outcome === 'missing-token') mock.inspect.mockResolvedValue({ ...review(), reviewToken: undefined });
    if (outcome === 'missing-id') mock.inspect.mockResolvedValue({ ...review(), taskId: undefined });
    if (outcome === 'different-id') mock.inspect.mockResolvedValue({ ...review(), taskId: 'other-task' });
    if (outcome === 'missing-field') mock.inspect.mockResolvedValue({ ...review(), after: { ...fields(), location: undefined } });
    if (outcome === 'overlong-field') mock.inspect.mockResolvedValue({ ...review(), after: { ...fields(), description: 'x'.repeat(4097) } });
    if (outcome === 'invalid-zone') mock.inspect.mockResolvedValue({ ...review(), after: { ...fields(), startTz: 7 } });
    if (outcome === 'inherited-field') mock.inspect.mockResolvedValue({ ...review(), after: Object.create(fields()) });
    if (outcome === 'missing-message') mock.inspect.mockResolvedValue({ ...review(), message: undefined });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadList();
    fireEvent.click(reviewButton());
    await waitFor(() => expect(reviewButton()).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('private-server-error');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it.each(['uncertain', 'provider_written', 'unknown-status', 'missing-id', 'different-id', 'rejection', 'null'])('consumes review and holds the task for an incomplete or uncertain confirmation: %s', async outcome => {
    if (outcome === 'uncertain' || outcome === 'provider_written') mock.confirm.mockResolvedValue({ ...confirmed(), status: outcome });
    if (outcome === 'unknown-status') mock.confirm.mockResolvedValue({ ...confirmed(), status: 'success' });
    if (outcome === 'missing-id') mock.confirm.mockResolvedValue({ status: 'written', message: 'private-server-error' });
    if (outcome === 'different-id') mock.confirm.mockResolvedValue({ ...confirmed(), taskId: 'other-task' });
    if (outcome === 'rejection') mock.confirm.mockRejectedValue(new Error('private-server-error'));
    if (outcome === 'null') mock.confirm.mockResolvedValue(null);
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadReview();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(refreshButton()).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(reviewButton()).toBeDisabled();
    expect(screen.getByText('This task needs outcome review. Do not retry the update.')).toBeInTheDocument();
    expect(screen.getByText(outcome === 'provider_written' ? /Google Calendar was updated, but the cache/ : /outcome is unconfirmed and may have changed/)).toBeInTheDocument();
    expect(mock.toast).not.toHaveBeenCalled();
    expect(mock.confirm).toHaveBeenCalledOnce();
    expect(mock.inspect).toHaveBeenCalledOnce();
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain('private-server-error');
  });

  it.each([
    ['missing account reference', { calendarAccountId: undefined }],
    ['missing event reference', { eventId: undefined }],
    ['blank account reference', { calendarAccountId: '' }],
    ['control character in account reference', { calendarAccountId: 'account\nref' }],
    ['oversized account reference', { calendarAccountId: 'x'.repeat(257) }],
    ['non-string event reference', { eventId: 17 }],
    ['blank event reference', { eventId: '' }],
    ['oversized event reference', { eventId: 'x'.repeat(257) }],
  ])('requires the exact visible target references before confirmation: %s', async (_outcome, change) => {
    mock.inspect.mockResolvedValue({ ...review(), ...change });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadList();
    fireEvent.click(reviewButton());
    await waitFor(() => expect(reviewButton()).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Calendar account reference:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Google event reference:/)).not.toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', 'Reviewed Google updates are not enabled on this server. No update was sent.'],
    ['write_permission_required', 'This Google connection has no verified write permission. A separately approved reconnection is required; no update was sent.'],
    ['unknown-private-code', 'Calendar update review is unavailable or the saved state needs review. No update was submitted by this action.'],
  ])('shows an allowlisted static blocker for %s without exposing provider errors', async (code, reason) => {
    mock.inspect.mockResolvedValue({ status: 'blocked', code, message: 'private-server-error' });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadList();
    fireEvent.click(reviewButton());
    await waitFor(() => expect(screen.getByText(reason)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('private-server-error');
    expect(document.body.textContent).not.toContain('unknown-private-code');
  });

  it('does not count not_written as success and requires a new review instead of replaying the consumed token', async () => {
    mock.confirm.mockResolvedValue({ status: 'not_written', message: 'private-server-error', taskId: TASK.taskId });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadReview();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(reviewButton()).toBeEnabled());
    expect(screen.getByText(/No Google Calendar update was written/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(mock.toast).not.toHaveBeenCalled();
    expect(mock.confirm).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain('private-server-error');
  });

  it('guards duplicate clicks during deferred refresh, inspection, and confirmation without automatic retry', async () => {
    const inventory = deferred();
    const inspection = deferred();
    const confirmation = deferred();
    mock.refresh.mockReturnValue(inventory.promise);
    mock.inspect.mockReturnValue(inspection.promise);
    mock.confirm.mockReturnValue(confirmation.promise);
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
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
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(refreshButton()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel review' })).not.toBeInTheDocument();
    await act(async () => { confirmation.resolve(confirmed()); await confirmation.promise; });
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(mock.inspect).toHaveBeenCalledOnce();
    expect(mock.confirm).toHaveBeenCalledOnce();
  });

  it.each(['refresh', 'inspection', 'confirmation'] as const)('suppresses a stale %s result after switching accounts and returning to the prior owner', async phase => {
    const pending = deferred();
    const view = render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    if (phase === 'refresh') { mock.refresh.mockReturnValue(pending.promise); fireEvent.click(refreshButton()); }
    else if (phase === 'inspection') { await loadList(); mock.inspect.mockReturnValue(pending.promise); fireEvent.click(reviewButton()); }
    else { await loadReview(); mock.confirm.mockReturnValue(pending.promise); fireEvent.click(confirmButton()); }
    managerOwner = OWNER_B;
    view.rerender(<CalendarOutboundReviewPanel readyOwner={OWNER_B} />);
    expect(screen.queryByText(TASK.taskTitle)).not.toBeInTheDocument();
    managerOwner = OWNER_A;
    view.rerender(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await act(async () => { pending.resolve(phase === 'refresh' ? list() : phase === 'inspection' ? review() : confirmed()); await pending.promise; });
    expect(screen.queryByText(/Linked tasks in this list:/)).not.toBeInTheDocument();
    expect(screen.queryByText(TASK.taskTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(refreshButton()).toBeEnabled();
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it.each(['refresh', 'inspection', 'confirmation'] as const)('suppresses a late %s result after unmount', async phase => {
    const pending = deferred();
    const view = render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    if (phase === 'refresh') { mock.refresh.mockReturnValue(pending.promise); fireEvent.click(refreshButton()); }
    else if (phase === 'inspection') { await loadList(); mock.inspect.mockReturnValue(pending.promise); fireEvent.click(reviewButton()); }
    else { await loadReview(); mock.confirm.mockReturnValue(pending.promise); fireEvent.click(confirmButton()); }
    view.unmount();
    await act(async () => { pending.resolve(phase === 'refresh' ? list() : phase === 'inspection' ? review() : confirmed()); await pending.promise; });
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it.each(['refresh', 'inspection', 'confirmation'] as const)('hides material when the manager stops while %s is pending without a parent render', async phase => {
    const pending = deferred();
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    if (phase === 'refresh') { mock.refresh.mockReturnValue(pending.promise); fireEvent.click(refreshButton()); }
    else if (phase === 'inspection') { await loadList(); mock.inspect.mockReturnValue(pending.promise); fireEvent.click(reviewButton()); }
    else { await loadReview(); mock.confirm.mockReturnValue(pending.promise); fireEvent.click(confirmButton()); }
    managerOwner = null;
    await act(async () => { pending.resolve(phase === 'refresh' ? list() : phase === 'inspection' ? review() : confirmed()); await pending.promise; });
    expect(refreshButton()).toBeDisabled();
    expect(screen.queryByText(TASK.taskTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(mock.toast).not.toHaveBeenCalled();
  });

  it('rechecks readiness immediately before confirmation and hides a stopped account’s preview', async () => {
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadReview();
    managerOwner = null;
    fireEvent.click(confirmButton());
    expect(mock.confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirm Google Calendar update' })).not.toBeInTheDocument();
    expect(screen.queryByText(TASK.taskTitle)).not.toBeInTheDocument();
  });

  it('fails closed if manager status cannot be read', () => {
    mock.status.mockImplementation(() => { throw new Error('private-manager-error'); });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    expect(refreshButton()).toBeDisabled();
    expect(document.body.textContent).not.toContain('private-manager-error');
    expect(mock.refresh).not.toHaveBeenCalled();
  });

  it('does not demote a confirmed receipt when the toast display fails', async () => {
    mock.toast.mockImplementation(() => { throw new Error('display failed'); });
    render(<CalendarOutboundReviewPanel readyOwner={OWNER_A} />);
    await loadReview();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(refreshButton()).toBeEnabled());
    expect(screen.getByText(/Google Calendar update confirmed\. Saved task contents remain unchanged/)).toBeInTheDocument();
    expect(screen.queryByText(/outcome is unconfirmed/)).not.toBeInTheDocument();
    expect(mock.confirm).toHaveBeenCalledOnce();
  });
});

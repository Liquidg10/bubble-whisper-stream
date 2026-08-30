import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import type { Task } from '@/types/task';
import type { CalendarTaskMapping, SyncConflict } from '@/services/calendarTaskSyncManager';

const mock = vi.hoisted(() => ({ auth: vi.fn(), tasks: vi.fn(), status: vi.fn(), mappings: vi.fn(), conflicts: vi.fn(), fullSync: vi.fn(), resolveConflict: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mock.auth }));
vi.mock('@/stores/taskStore', () => ({ useTaskStore: mock.tasks }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock('@/services/calendarTaskSyncManager', () => ({ calendarTaskSyncManager: {
  getStatus: mock.status, getMappingByTaskId: mock.mappings, getPendingConflicts: mock.conflicts,
  performFullSync: mock.fullSync, resolveConflict: mock.resolveConflict,
} }));
import { CalendarSyncPanel } from '../CalendarSyncPanel';

const OWNER_A = '10000000-0000-4000-8000-000000000001';
const OWNER_B = '20000000-0000-4000-8000-000000000002';
const syncResult = (overrides = {}) => ({ tasksProcessed: 0, eventsProcessed: 0, conflictsDetected: 0, reviewRequired: 0, errors: [] as string[], ...overrides });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function task(id: string, owner: string | undefined): Task {
  return { id, title: `Title ${id}`, type: 'task', completed: false, priority: 50, tags: [], createdAt: 0, updatedAt: 0, metadata: owner ? { userId: owner } : {} };
}
const mapping = (taskId: string): CalendarTaskMapping => ({ taskId, eventId: `event-${taskId}`, calendarAccountId: 'account-fixture', lastSyncedAt: 0, syncDirection: 'calendar-to-task', conflictStatus: 'none' });
const conflict = (taskId: string): SyncConflict => ({ id: `conflict-${taskId}`, taskId, eventId: `event-${taskId}`, conflictType: 'title', taskValue: `old-${taskId}`, calendarValue: `calendar-${taskId}`, timestamp: 0 });

describe('CalendarSyncPanel owner and truthful outcome lifecycle', () => {
  let owner: string | null;
  let managerOwner: string | null;
  let loading: boolean;
  let tasks: Task[];
  beforeEach(() => {
    vi.resetAllMocks();
    owner = OWNER_A;
    managerOwner = OWNER_A;
    loading = false;
    tasks = [task('owned', OWNER_A), task('foreign', OWNER_B), task('legacy', undefined)];
    mock.auth.mockImplementation(() => ({ user: owner ? { id: owner } as User : null, session: owner ? { user: { id: owner } } as Session : null, loading }));
    mock.tasks.mockImplementation(() => ({ tasks }));
    mock.status.mockImplementation(() => ({ isRunning: managerOwner !== null, ownerUserId: managerOwner, pendingOperations: 0, unresolvedOperations: 0 }));
    mock.mappings.mockImplementation((id: string) => mapping(id));
    mock.conflicts.mockReturnValue([conflict('owned'), conflict('foreign'), conflict('legacy')]);
    mock.fullSync.mockResolvedValue(syncResult());
    mock.resolveConflict.mockResolvedValue(false);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  const switchTab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });

  it('requires matching ready auth/manager ownership and never reads mappings for foreign or unowned tasks', () => {
    const view = render(<CalendarSyncPanel />);
    expect(mock.mappings.mock.calls.map(([id]) => id)).toEqual(['owned']);
    switchTab('Mappings');
    expect(screen.getByText('Title owned')).toBeInTheDocument();
    expect(screen.queryByText('Title foreign')).not.toBeInTheDocument();
    expect(screen.queryByText('Title legacy')).not.toBeInTheDocument();
    managerOwner = OWNER_B;
    view.rerender(<CalendarSyncPanel />);
    expect(screen.getByRole('button', { name: 'Full Sync' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(screen.queryByText('Title owned')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Full Sync' }));
    expect(mock.fullSync).not.toHaveBeenCalled();
    owner = null;
    view.rerender(<CalendarSyncPanel />);
    expect(screen.getByRole('button', { name: 'Full Sync' })).toBeDisabled();
  });

  it('clears the visible owner data immediately and ignores a late completion/toast from the previous owner', async () => {
    const pending = deferred<ReturnType<typeof syncResult>>();
    mock.fullSync.mockReturnValue(pending.promise);
    const view = render(<CalendarSyncPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Full Sync' }));
    owner = OWNER_B;
    managerOwner = OWNER_B;
    view.rerender(<CalendarSyncPanel />);
    switchTab('Mappings');
    expect(screen.queryByText('Title owned')).not.toBeInTheDocument();
    expect(screen.getByText('Title foreign')).toBeInTheDocument();
    await act(async () => { pending.resolve(syncResult({ eventsProcessed: 99 })); await pending.promise; });
    expect(mock.toast).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Full Sync' })).toBeEnabled();
    switchTab('Overview');
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('coalesces rapid clicks without simulated progress and restores controls after failure', async () => {
    const pending = deferred<ReturnType<typeof syncResult>>();
    mock.fullSync.mockReturnValue(pending.promise);
    const intervals = vi.spyOn(globalThis, 'setInterval');
    render(<CalendarSyncPanel />);
    const button = screen.getByRole('button', { name: 'Full Sync' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mock.fullSync).toHaveBeenCalledOnce();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // jsdom/Radix may use a 60Hz animation shim; the panel must not invent its
    // former 500ms progress loop while provider work is still unconfirmed.
    expect(intervals.mock.calls.some(([, delay]) => delay === 500)).toBe(false);
    await act(async () => { pending.reject(new Error('private-provider-payload')); await pending.promise.catch(() => {}); });
    expect(screen.getByRole('button', { name: 'Full Sync' })).toBeEnabled();
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sync could not finish', variant: 'destructive' }));
    expect(JSON.stringify(mock.toast.mock.calls)).not.toContain('private-provider-payload');
  });

  it('renders actual confirmed counts and labels mixed errors/review as incomplete rather than Sync Complete', async () => {
    mock.fullSync.mockResolvedValue(syncResult({ eventsProcessed: 2, reviewRequired: 4, conflictsDetected: 1, errors: ['unconfirmed'] }));
    render(<CalendarSyncPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Full Sync' }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Calendar review needed', description: expect.stringContaining('0 task operations and 2 event imports confirmed'), variant: 'destructive' }));
    expect(JSON.stringify(mock.toast.mock.calls)).not.toContain('Sync Complete');
    expect(screen.getByText(/4 items require review; 1 errors/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full Sync' })).toBeEnabled();
  });

  it('review-only work is not toasted as success even when there are no errors', async () => {
    mock.fullSync.mockResolvedValue(syncResult({ reviewRequired: 3 }));
    render(<CalendarSyncPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Full Sync' }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledOnce());
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Calendar review needed', description: expect.stringContaining('No calendar changes were sent') }));
  });

  it('suppresses post-unmount results and does not leave a delayed completion timer', async () => {
    const pending = deferred<ReturnType<typeof syncResult>>();
    mock.fullSync.mockReturnValue(pending.promise);
    const view = render(<CalendarSyncPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Full Sync' }));
    view.unmount();
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    await act(async () => { pending.resolve(syncResult({ eventsProcessed: 1 })); await pending.promise; });
    expect(mock.toast).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
  });

  it('outbound conflict choices remain disabled and false local resolution never claims completion', async () => {
    render(<CalendarSyncPanel />);
    switchTab('Conflicts (1)');
    fireEvent.click(screen.getByRole('button', { name: 'Review conflict' }));
    expect(screen.getByRole('button', { name: 'Use task value in calendar — review only' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Merge — review only' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use calendar value in local task' }));
    await waitFor(() => expect(mock.resolveConflict).toHaveBeenCalledExactlyOnceWith('conflict-owned', 'prefer-calendar'));
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Conflict still needs review', variant: 'destructive' }));
    expect(screen.getByRole('button', { name: 'Use calendar value in local task' })).toBeEnabled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not publish a conflict resolution result after account change', async () => {
    const pending = deferred<boolean>();
    mock.resolveConflict.mockReturnValue(pending.promise);
    const view = render(<CalendarSyncPanel />);
    switchTab('Conflicts (1)');
    fireEvent.click(screen.getByRole('button', { name: 'Review conflict' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use calendar value in local task' }));
    owner = null;
    managerOwner = null;
    view.rerender(<CalendarSyncPanel />);
    await act(async () => { pending.resolve(true); await pending.promise; });
    expect(mock.toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full Sync' })).toBeDisabled();
  });
});

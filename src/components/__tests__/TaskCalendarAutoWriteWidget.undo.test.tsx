import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCalendarAutoWriteWidget } from '../TaskCalendarAutoWriteWidget';

const mocks = vi.hoisted(() => ({
  undoTaskCalendarWrite: vi.fn(),
  getTask: vi.fn(),
  toast: vi.fn(),
  mappings: new Map()
}));

vi.mock('@/services/taskAwareAutoWriteService', () => ({
  taskAwareAutoWriteService: {
    getAllMappings: () => mocks.mappings,
    undoTaskCalendarWrite: mocks.undoTaskCalendarWrite
  }
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({ getTask: mocks.getTask })
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: mocks.toast
}));

describe('TaskCalendarAutoWriteWidget undo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mappings.clear();
    mocks.mappings.set('task-1', {
      taskId: 'task-1',
      eventId: 'event-1',
      traceId: 'trace-1',
      createdAt: Date.now()
    });
    mocks.getTask.mockReturnValue({
      id: 'task-1',
      title: 'Plan the week',
      view: { calendar: { startTime: new Date().toISOString() } }
    });
  });

  afterEach(() => cleanup());

  it('keeps the mapping visible until calendar compensation succeeds', async () => {
    let resolveUndo!: (success: boolean) => void;
    mocks.undoTaskCalendarWrite.mockReturnValue(new Promise(resolve => {
      resolveUndo = resolve;
    }));

    render(<TaskCalendarAutoWriteWidget />);
    await screen.findByText('Plan the week');

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undoButton);
    fireEvent.click(undoButton);

    await waitFor(() => expect(mocks.undoTaskCalendarWrite).toHaveBeenCalledTimes(1));
    expect(mocks.undoTaskCalendarWrite).toHaveBeenCalledWith('task-1', 'trace-1');
    expect(screen.getByText('Plan the week')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undoing…' })).toBeDisabled();

    await act(async () => {
      resolveUndo(true);
    });

    await waitFor(() => expect(screen.queryByText('Plan the week')).not.toBeInTheDocument());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Action undone' }));
  });

  it('keeps the mapping visible when calendar compensation fails', async () => {
    mocks.undoTaskCalendarWrite.mockResolvedValue(false);

    render(<TaskCalendarAutoWriteWidget />);
    await screen.findByText('Plan the week');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Undo failed',
      variant: 'destructive'
    })));
    expect(screen.getByText('Plan the week')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });
});

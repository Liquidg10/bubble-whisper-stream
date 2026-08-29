import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanColumn } from '@/components/KanbanColumn';
import type { Task } from '@/types/task';

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/components/IntelligentTaskIntegration', () => ({
  IntelligentTaskIntegration: ({ task, onTaskUpdate }: {
    task: Task;
    onTaskUpdate?: (updatedTask: Task) => void | Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() => void onTaskUpdate?.({ ...task, description: 'AI-assisted framing' })}
    >
      Apply intelligence
    </button>
  ),
}));

// These tests exercise TaskCard's serialized write coordinator, not Radix's
// portal/focus machinery. Render the menu primitives directly so an unresolved
// persistence promise cannot hold the menu interaction open inside React act().
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

const task: Task = {
  id: 'kanban-completion-1',
  type: 'task',
  title: 'Persist this completion',
  completed: false,
  priority: 70,
  energyFit: 'medium',
  urgency: 2,
  tags: [],
  createdAt: 1_000,
  updatedAt: 2_000,
  view: {
    kanban: { boardId: 'main', columnId: 'doing', pos: 0 },
  },
};

describe('KanbanColumn completion plumbing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the complete canonical task emitted by TaskCard', async () => {
    const user = userEvent.setup();
    const onTaskUpdate = vi.fn();

    render(
      <KanbanColumn
        column={{ id: 'doing', title: 'Doing', color: '#123456' }}
        tasks={[task]}
        isDraggedOver={false}
        onTaskKeyboardMove={vi.fn()}
        onTaskUpdate={onTaskUpdate}
        onTaskSelect={vi.fn()}
        selectedTaskId={null}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Mark task complete' }));

    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: task.id,
      completed: true,
      energyFit: 'medium',
      urgency: 2,
      view: task.view,
    }));
  });

  it('serializes an in-flight title edit before one composed completion update', async () => {
    const user = userEvent.setup();
    const editWrite = deferred<void>();
    const completionWrite = deferred<void>();
    const writeGates = [editWrite, completionWrite];
    const onTaskUpdate = vi.fn(async (_updatedTask: Task) => {
      const gate = writeGates[onTaskUpdate.mock.calls.length - 1];
      await gate.promise;
    });

    render(
      <KanbanColumn
        column={{ id: 'doing', title: 'Doing', color: '#123456' }}
        tasks={[task]}
        isDraggedOver={false}
        onTaskKeyboardMove={vi.fn()}
        onTaskUpdate={onTaskUpdate}
        onTaskSelect={vi.fn()}
        selectedTaskId={null}
      />,
    );

    const card = screen.getByRole('button', { name: /Task: Persist this completion/ });
    card.focus();
    await user.keyboard('e');

    const titleInput = screen.getByDisplayValue(task.title);
    await user.clear(titleInput);
    await user.type(titleInput, 'Edited before completion');

    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    expect(onTaskUpdate.mock.calls[0][0]).toMatchObject({
      title: 'Edited before completion',
      completed: false,
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Mark task complete' });
    await user.click(checkbox);
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Drag to reorder task' })).toBeDisabled();
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(onTaskUpdate).toHaveBeenCalledTimes(1);

    editWrite.resolve();
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledTimes(2));
    expect(onTaskUpdate.mock.calls[1][0]).toMatchObject({
      title: 'Edited before completion',
      completed: true,
      energyFit: 'medium',
      urgency: 2,
    });

    completionWrite.resolve();
    await waitFor(() => expect(checkbox).toBeEnabled());
  });

  it('preserves a queued priority update when completion follows immediately', async () => {
    const priorityWrite = deferred<void>();
    const completionWrite = deferred<void>();
    const writeGates = [priorityWrite, completionWrite];
    const onTaskUpdate = vi.fn(async (_updatedTask: Task) => {
      const gate = writeGates[onTaskUpdate.mock.calls.length - 1];
      await gate.promise;
    });

    render(
      <KanbanColumn
        column={{ id: 'doing', title: 'Doing', color: '#123456' }}
        tasks={[task]}
        isDraggedOver={false}
        onTaskKeyboardMove={vi.fn()}
        onTaskUpdate={onTaskUpdate}
        onTaskSelect={vi.fn()}
        selectedTaskId={null}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Increase priority' }));
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledTimes(1));
    expect(onTaskUpdate.mock.calls[0][0]).toMatchObject({ priority: 95, completed: false });

    const checkbox = screen.getByRole('checkbox', { name: 'Mark task complete' });
    fireEvent.click(checkbox);
    expect(onTaskUpdate).toHaveBeenCalledTimes(1);

    priorityWrite.resolve();
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledTimes(2));
    expect(onTaskUpdate.mock.calls[1][0]).toMatchObject({ priority: 95, completed: true });

    completionWrite.resolve();
    await waitFor(() => expect(checkbox).toBeEnabled());
  });

  it('preserves a queued intelligence update when completion follows immediately', async () => {
    const user = userEvent.setup();
    const intelligenceWrite = deferred<void>();
    const completionWrite = deferred<void>();
    const writeGates = [intelligenceWrite, completionWrite];
    const onTaskUpdate = vi.fn(async (_updatedTask: Task) => {
      const gate = writeGates[onTaskUpdate.mock.calls.length - 1];
      await gate.promise;
    });

    render(
      <KanbanColumn
        column={{ id: 'doing', title: 'Doing', color: '#123456' }}
        tasks={[task]}
        isDraggedOver={false}
        onTaskKeyboardMove={vi.fn()}
        onTaskUpdate={onTaskUpdate}
        onTaskSelect={vi.fn()}
        selectedTaskId={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Apply intelligence' }));
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledTimes(1));
    expect(onTaskUpdate.mock.calls[0][0]).toMatchObject({
      description: 'AI-assisted framing',
      completed: false,
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Mark task complete' });
    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Apply intelligence' })).toBeDisabled();
    expect(onTaskUpdate).toHaveBeenCalledTimes(1);

    intelligenceWrite.resolve();
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledTimes(2));
    expect(onTaskUpdate.mock.calls[1][0]).toMatchObject({
      description: 'AI-assisted framing',
      completed: true,
    });

    completionWrite.resolve();
    await waitFor(() => expect(checkbox).toBeEnabled());
  });

  it('catches a rejected persistence update and tells the user completion was not saved', async () => {
    const user = userEvent.setup();
    const onTaskUpdate = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <KanbanColumn
        column={{ id: 'doing', title: 'Doing', color: '#123456' }}
        tasks={[task]}
        isDraggedOver={false}
        onTaskKeyboardMove={vi.fn()}
        onTaskUpdate={onTaskUpdate}
        onTaskSelect={vi.fn()}
        selectedTaskId={null}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Mark task complete' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Completion not saved',
        description: 'Your task is unchanged. Please try again.',
        variant: 'destructive',
      }));
    });
    expect(screen.getByRole('checkbox', { name: 'Mark task complete' })).not.toBeChecked();

    consoleError.mockRestore();
  });
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MatrixView from '@/pages/MatrixView';
import type { Task } from '@/types/task';
import type { ViewSDK } from '@/views/sdk';

const { task, taskStore } = vi.hoisted(() => {
  const task: Task = {
    id: 'matrix-completion-1',
    type: 'task',
    title: 'Keep all canonical fields',
    completed: false,
    priority: 80,
    actionability: 'actionable',
    energyFit: 'low',
    urgency: 3,
    readiness: {
      band: 'now',
      source: 'computed',
      score: 0.9,
      reason: 'Good fit right now',
    },
    domainLinks: [{
      id: 'domain-1',
      domainId: 'home',
      label: 'Home',
      userConfirmed: true,
      source: 'user',
    }],
    tags: [],
    createdAt: 1_000,
    updatedAt: 2_000,
    view: {
      bubble: { x: 10, y: 20, size: 0.8 },
      matrix: { urgency: 3, importance: 2, quadrant: 1 },
    },
  };

  return {
    task,
    taskStore: {
      tasks: [task],
      updateTask: vi.fn().mockResolvedValue(undefined),
      deleteTask: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('@/stores/taskStore', () => ({
  useTaskStoreSync: () => taskStore,
}));

vi.mock('@/config/flags', () => ({
  isFeatureEnabled: () => true,
}));

vi.mock('@/components/MatrixGrid', () => ({
  MatrixGrid: ({ viewSDK }: { viewSDK: ViewSDK }) => (
    <button
      type="button"
      onClick={() => viewSDK.actions.upsert({ ...task, completed: true })}
    >
      Complete matrix task
    </button>
  ),
}));

vi.mock('@/components/QuadrantFilters', () => ({ QuadrantFilters: () => null }));
vi.mock('@/components/MatrixQuickAdd', () => ({ MatrixQuickAdd: () => null }));
vi.mock('@/components/MatrixKeyboardHelp', () => ({ MatrixKeyboardHelp: () => null }));
vi.mock('@/components/TaskDetail', () => ({ TaskDetail: () => null }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

describe('MatrixView completion persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists completion and the normalized matrix projection as one full task', async () => {
    const user = userEvent.setup();
    render(<MatrixView />);

    await user.click(screen.getByRole('button', { name: 'Complete matrix task' }));

    await waitFor(() => {
      expect(taskStore.updateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          id: task.id,
          title: task.title,
          completed: true,
          actionability: 'actionable',
          energyFit: 'low',
          urgency: 3,
          readiness: task.readiness,
          domainLinks: task.domainLinks,
          view: {
            bubble: task.view?.bubble,
            matrix: { urgency: 3, importance: 2, quadrant: 1 },
          },
        }),
      );
    });
  });
});

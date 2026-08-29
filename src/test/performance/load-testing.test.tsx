import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AdaptiveTaskNavigator,
} from '@/experimental/iridescent/BubbleRenderer';
import {
  planBubbleVisibility,
} from '@/experimental/iridescent/bubbleCapacity';
import {
  projectAdaptiveBubbles,
} from '@/services/adaptiveBubbleContract';
import type { Task } from '@/types/task';

const LARGE_TASK_COUNT = 5_000;

function generateTaskDataset(count: number): Task[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `task-${String(index).padStart(5, '0')}`,
    type: 'task' as const,
    title: `Task ${index}`,
    completed: false,
    createdAt: index + 1,
    updatedAt: index + 1,
    urgency: 1 as const,
    priority: index % 100,
    energyFit: 'medium' as const,
    estimatedMinutes: 15,
    actionability: 'actionable' as const,
    tags: [],
  }));
}

describe('Large collection rendering boundaries', () => {
  it('bounds the first canvas frame before a viewport measurement exists', () => {
    expect(planBubbleVisibility(LARGE_TASK_COUNT, 'medium', {
      width: 0,
      height: 0,
    })).toEqual({
      densityTarget: 3_500,
      viewportCapacity: 100,
      visibleCount: 70,
      capacityLimited: true,
    });
  });

  it('does not materialize a large navigator while it is collapsed', async () => {
    const projections = projectAdaptiveBubbles(
      generateTaskDataset(LARGE_TASK_COUNT),
      { now: Date.UTC(2026, 7, 29) },
    );

    render(
      <AdaptiveTaskNavigator
        projections={projections}
        onTaskSelect={vi.fn()}
      />,
    );

    const summary = screen.getByLabelText('All tasks (5000)');
    expect(screen.queryByRole('list', {
      name: 'All tasks by current readiness',
    })).not.toBeInTheDocument();

    fireEvent.click(summary);

    const list = await screen.findByRole('list', {
      name: 'All tasks by current readiness',
    });
    expect(within(list).getAllByRole('button')).toHaveLength(100);
    expect(screen.getByRole('button', {
      name: 'Show 100 more tasks',
    })).toBeInTheDocument();
  });

  it('keeps the all-task navigator lazy and incrementally reachable', async () => {
    const projections = projectAdaptiveBubbles(
      generateTaskDataset(250),
      { now: Date.UTC(2026, 7, 29) },
    );
    const onTaskSelect = vi.fn();

    render(
      <AdaptiveTaskNavigator
        projections={projections}
        onTaskSelect={onTaskSelect}
      />,
    );

    const summary = screen.getByLabelText('All tasks (250)');
    expect(screen.queryByRole('list', {
      name: 'All tasks by current readiness',
    })).not.toBeInTheDocument();

    fireEvent.click(summary);

    const list = await screen.findByRole('list', {
      name: 'All tasks by current readiness',
    });
    expect(within(list).getAllByRole('button')).toHaveLength(100);

    fireEvent.click(screen.getByRole('button', {
      name: 'Show 100 more tasks',
    }));
    expect(within(list).getAllByRole('button')).toHaveLength(200);

    fireEvent.click(screen.getByRole('button', {
      name: 'Show 50 more tasks',
    }));
    expect(within(list).getAllByRole('button')).toHaveLength(250);
    expect(screen.queryByRole('button', {
      name: /Show .* more tasks/,
    })).not.toBeInTheDocument();

    fireEvent.click(within(list).getAllByRole('button')[249]);
    expect(onTaskSelect).toHaveBeenCalledTimes(1);
  });
});

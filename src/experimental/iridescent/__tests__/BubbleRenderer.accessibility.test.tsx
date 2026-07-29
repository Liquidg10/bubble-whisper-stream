import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { Task } from '@/types/task';
import { taskToBubble } from '@/adapters/taskAdapter';
import {
  createMockSettings,
  mockUseBubbleStore,
  resetMockBubbleStore,
  setMockBubbleState,
} from '@/test/helpers/mockBubbleStore';
import IridescentCanvas from '../BubbleRenderer';

vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule } = await import(
    '@/test/helpers/mockBubbleStore'
  );
  return makeBubbleStoreMockModule();
});

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/hooks/usePinchZoom', () => ({
  usePinchZoom: () => ({}),
}));

vi.mock('@/hooks/useLODSystem', () => ({
  useLODSystem: () => ({
    getLODConfig: () => ({ enableSpecular: true }),
  }),
}));

vi.mock('@/components/MergeConfirmPortal', () => ({
  MergeConfirmPortal: () => null,
}));

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'task-1',
    type: 'task',
    title: overrides.title ?? 'A task',
    completed: false,
    priority: 50,
    tags: [],
    createdAt: 1000,
    updatedAt: 1000,
    view: {
      bubble: {
        x: 0,
        y: 0,
        size: 0.6,
      },
    },
    ...overrides,
  };
}

function setTasks(
  tasks: Task[],
  settings: ReturnType<typeof createMockSettings> = createMockSettings(),
) {
  setMockBubbleState({
    bubbles: tasks.map(taskToBubble),
    settings,
  });
}

describe('Adaptive Bubble renderer accessibility slice', () => {
  beforeEach(() => {
    resetMockBubbleStore();
    vi.clearAllMocks();
  });

  it('uses readiness order for density while keeping every task in the reachable navigator', async () => {
    const user = userEvent.setup();
    setTasks([
      task({
        id: 'urgent-later',
        title: 'Urgent complex filing',
        energyFit: 'high',
        estimatedMinutes: 60,
        urgency: 3,
        priority: 90,
      }),
      task({
        id: 'ready-short',
        title: 'Send short reply',
        energyFit: 'low',
        estimatedMinutes: 5,
        urgency: 1,
        priority: 70,
      }),
      task({
        id: 'reference-photo',
        type: 'photo',
        title: 'Receipt photo',
        actionability: 'reference',
        urgency: 2,
      }),
    ], createMockSettings({ bubbleDensity: 'low' }));

    const { container } = render(<IridescentCanvas />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Current energy' }),
      'low',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Available time' }),
      '10',
    );

    const visibleBubbles = container.querySelectorAll('[data-adaptive-bubble]');
    expect(visibleBubbles).toHaveLength(1);
    expect(visibleBubbles[0]).toHaveAttribute('data-task-id', 'ready-short');
    expect(visibleBubbles[0]).toHaveAttribute('data-readiness-band', 'now');

    await user.click(screen.getByText('All tasks (3)'));
    const allTasks = screen.getByRole('list', {
      name: 'All tasks by current readiness',
    });
    const taskButtons = within(allTasks).getAllByRole('button');

    expect(taskButtons).toHaveLength(3);
    expect(taskButtons[0]).toHaveTextContent('Send short reply');
    expect(taskButtons.map((button) => button.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Urgent complex filing'),
        expect.stringContaining('Receipt photo'),
      ]),
    );
  });

  it('applies persisted density when settings finish hydrating', async () => {
    const tasks = [
      task({ id: 'hydrate-1', title: 'One' }),
      task({ id: 'hydrate-2', title: 'Two' }),
      task({ id: 'hydrate-3', title: 'Three' }),
      task({ id: 'hydrate-4', title: 'Four' }),
      task({ id: 'hydrate-5', title: 'Five' }),
    ];
    setTasks(tasks, createMockSettings({ bubbleDensity: 'medium' }));

    const { container, rerender } = render(<IridescentCanvas />);
    expect(container.querySelectorAll('[data-adaptive-bubble]')).toHaveLength(4);

    setTasks(tasks, createMockSettings({ bubbleDensity: 'high' }));
    rerender(<IridescentCanvas />);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-adaptive-bubble]')).toHaveLength(5);
    });
  });

  it('keeps high urgency text visible when honest readiness is later', async () => {
    const user = userEvent.setup();
    setTasks([
      task({
        id: 'urgent-later',
        title: 'Resolve the urgent complex filing',
        energyFit: 'high',
        estimatedMinutes: 60,
        urgency: 3,
        priority: 90,
      }),
    ], createMockSettings({ bubbleDensity: 'high' }));

    const { container } = render(<IridescentCanvas />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Current energy' }),
      'low',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Available time' }),
      '10',
    );

    const bubble = container.querySelector('[data-task-id="urgent-later"]');
    expect(bubble).not.toBeNull();
    expect(bubble).toHaveAttribute('data-readiness-band', 'later');
    expect(bubble).toHaveAttribute('data-urgency', 'High urgency');
    expect(bubble).toHaveAttribute('data-motion-independent', 'true');
    expect(bubble).toHaveAccessibleName(
      expect.stringContaining(
        'Readiness: Better for later. Urgency: High urgency.',
      ),
    );
    expect(within(bubble as HTMLElement).getByText('Better for later'))
      .toBeVisible();
    expect(within(bubble as HTMLElement).getByText('High urgency'))
      .toBeVisible();
  });

  it('supports keyboard activation and movement while app reduced motion is enabled', async () => {
    const user = userEvent.setup();
    const onBubbleSelect = vi.fn();
    setTasks([
      task({
        id: 'keyboard-task',
        title: 'Keyboard reachable task',
        urgency: 2,
      }),
    ], createMockSettings({
      bubbleDensity: 'high',
      reducedMotion: true,
    }));

    const { container } = render(
      <IridescentCanvas onBubbleSelect={onBubbleSelect} />,
    );
    const bubble = container.querySelector(
      '[data-task-id="keyboard-task"]',
    ) as HTMLButtonElement;

    bubble.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowRight}');

    expect(onBubbleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'keyboard-task' }),
    );
    expect(
      (mockUseBubbleStore.getState().toggleSelection as ReturnType<typeof vi.fn>),
    ).toHaveBeenCalledWith('keyboard-task');
    expect(
      (mockUseBubbleStore.getState().updateBubble as ReturnType<typeof vi.fn>),
    ).toHaveBeenCalledWith(expect.objectContaining({
      id: 'keyboard-task',
      x: 10,
      y: 0,
    }));
    expect(screen.getByTestId('keyboard-move-instructions')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Adaptive Bubble view' }))
      .toHaveAttribute('data-reduced-motion', 'true');
    expect(container.querySelector('.soap')).toHaveStyle({ animation: 'none' });
  });

  it('has no automated accessibility violations in the narrow renderer surface', async () => {
    setTasks([
      task({
        id: 'axe-task',
        title: 'Accessible task',
        urgency: 2,
      }),
    ], createMockSettings({ bubbleDensity: 'high' }));

    const { container } = render(<IridescentCanvas />);
    const result = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });

    expect(result.violations).toEqual([]);
  });

  it('also disables float motion for the operating-system preference', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    setTasks([
      task({
        id: 'system-motion-task',
        title: 'System motion preference task',
      }),
    ], createMockSettings({
      bubbleDensity: 'high',
      reducedMotion: false,
    }));

    const { container } = render(<IridescentCanvas />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Adaptive Bubble view' }))
        .toHaveAttribute('data-reduced-motion', 'true');
      expect(container.querySelector('.soap'))
        .toHaveStyle({ animation: 'none' });
    });
  });

  it('stacks mobile controls while preserving the desktop toolbar layout', () => {
    setTasks([
      task({
        id: 'mobile-controls-task',
        title: 'Mobile controls task',
      }),
    ], createMockSettings({ bubbleDensity: 'high' }));

    render(<IridescentCanvas />);

    expect(screen.getByTestId('adaptive-zoom-controls')).toHaveClass(
      'left-4',
      'top-4',
    );
    expect(screen.getByTestId('adaptive-mode-controls')).toHaveClass(
      'left-4',
      'top-[4.5rem]',
      'sm:left-auto',
      'sm:right-4',
      'sm:top-4',
    );
    expect(screen.getByRole('group', { name: 'Current readiness context' }))
      .toHaveClass('top-32', 'sm:top-16');
    expect(screen.getByRole('combobox', { name: 'Current energy' }))
      .toHaveClass('h-11', 'sm:h-8');
    expect(screen.getByRole('combobox', { name: 'Available time' }))
      .toHaveClass('h-11', 'sm:h-8');
    expect(screen.getByText('All tasks (1)'))
      .toHaveClass('min-h-11');
  });

  it('keeps the smallest rendered bubble at least 44px across zoom levels', () => {
    setTasks([
      task({
        id: 'minimum-target-task',
        title: 'Minimum touch target task',
        priority: 0,
        view: {
          bubble: {
            x: 0,
            y: 0,
            size: 0.1,
          },
        },
      }),
    ], createMockSettings({ bubbleDensity: 'high' }));

    const { container } = render(<IridescentCanvas />);
    const bubble = container.querySelector(
      '[data-task-id="minimum-target-task"]',
    );

    expect(bubble).toHaveStyle({
      width: '44px',
      height: '44px',
    });
  });
});

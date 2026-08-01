import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { Bubble } from '@/types/bubble';
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

const mobileViewport = vi.hoisted(() => ({ value: false }));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mobileViewport.value,
}));

vi.mock('@/hooks/useLODSystem', () => ({
  useLODSystem: () => ({
    getLODConfig: () => ({ enableSpecular: true }),
  }),
}));

vi.mock('@/components/MergeConfirmPortal', () => ({
  MergeConfirmPortal: ({
    isOpen,
    onMerge,
    onCancel,
  }: {
    isOpen: boolean;
    onMerge: () => void;
    onCancel: () => void;
  }) => isOpen ? (
    <div role="dialog" aria-label="Merge tasks">
      <button type="button" onClick={onMerge}>Merge</button>
      <button type="button" onClick={onCancel}>Keep separate</button>
    </div>
  ) : null,
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

function pointerEvent(
  type: string,
  options: {
    clientX: number;
    clientY: number;
    pointerId?: number;
    pointerType?: 'mouse' | 'touch';
  },
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? 'mouse' },
  });
  return event;
}

describe('Adaptive Bubble renderer accessibility slice', () => {
  beforeEach(() => {
    resetMockBubbleStore();
    mobileViewport.value = false;
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

    await user.click(screen.getByLabelText('All tasks (3)'));
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

  it('keeps the desktop canvas controls in two predictable toolbars', () => {
    setTasks([
      task({
        id: 'mobile-controls-task',
        title: 'Mobile controls task',
      }),
    ], createMockSettings({ bubbleDensity: 'high' }));
    setMockBubbleState({
      selectedBubbles: new Set(['mobile-controls-task']),
    });

    render(<IridescentCanvas />);

    const zoomControls = screen.getByTestId('adaptive-zoom-controls');
    const modeControls = screen.getByTestId('adaptive-mode-controls');

    expect(zoomControls).toHaveClass(
      'left-4',
      'top-4',
    );
    expect(screen.getByTestId('adaptive-bubble-layer')).toHaveClass(
      'absolute',
      'inset-0',
      'z-0',
    );
    expect(modeControls).toHaveClass(
      'right-4',
      'top-4',
    );
    expect(screen.getByRole('group', { name: 'Current readiness context' }))
      .toHaveClass('top-16');
    expect(screen.getByRole('combobox', { name: 'Current energy' }))
      .toHaveClass('h-11');
    expect(screen.getByRole('combobox', { name: 'Available time' }))
      .toHaveClass('h-11');
    expect(screen.getByLabelText('All tasks (1)'))
      .toHaveClass('min-h-11');
    [
      ...within(zoomControls).getAllByRole('button'),
      ...within(modeControls).getAllByRole('button'),
    ].forEach((button) => {
      expect(button).toHaveClass(
        'h-11',
        'w-11',
      );
    });
    expect(screen.getByRole('button', {
      name: 'Clear 1 selected tasks',
    })).toHaveClass('h-11', 'sm:h-6');
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

  it('collapses mobile view and readiness controls into explicit 44px summaries', async () => {
    const user = userEvent.setup();
    mobileViewport.value = true;
    setTasks([
      task({
        id: 'compact-mobile-task',
        title: 'Compact mobile task',
      }),
    ], createMockSettings({ bubbleDensity: 'high' }));

    render(<IridescentCanvas />);

    expect(screen.queryByTestId('adaptive-zoom-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('adaptive-mode-controls')).not.toBeInTheDocument();
    const viewSummary = screen.getByText('View', { selector: 'summary' });
    const readinessSummary = screen.getByText('Right now', { selector: 'summary' });
    expect(viewSummary).toHaveClass('min-h-11');
    expect(readinessSummary).toHaveClass('min-h-11');
    expect(screen.getByLabelText('All tasks (1)', { selector: 'summary' }))
      .toHaveClass('min-h-11');

    await user.click(readinessSummary);
    expect(screen.getByRole('group', { name: 'Current readiness context' }))
      .toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Current energy' }))
      .toBeVisible();

    await user.click(viewSummary);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveClass('h-11');
    expect(screen.getByRole('button', { name: 'Toggle focus mode' }))
      .toHaveClass('h-11');
  });

  it('keeps canonical coordinates while presenting an off-screen task safely on a narrow viewport', async () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    setMockBubbleState({
      bubbles: [
        taskToBubble(task({
          id: 'restored-position-task',
          title: 'Restore my visible position',
          view: {
            bubble: {
              x: 10_000,
              y: -10_000,
              size: 0.6,
            },
          },
        })),
      ],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 844,
      left: 0,
      width: 390,
      height: 844,
      toJSON: () => ({}),
    });

    const { container } = render(<IridescentCanvas />);

    await waitFor(() => expect(
      container.querySelector('[data-task-id="restored-position-task"]'),
    ).toHaveStyle({ left: '340px', top: '0px' }));
    expect(updateBubble).not.toHaveBeenCalled();
    expect(mockUseBubbleStore.getState().bubbles[0]).toEqual(
      expect.objectContaining({ x: 10_000, y: -10_000 }),
    );
    expect(screen.getByRole('button', {
      name: /^Restore my visible position/,
    })).toBeVisible();

    rectSpy.mockRestore();
  });

  it('does not persist already-valid positions during zoom or pan', async () => {
    const user = userEvent.setup();
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    setMockBubbleState({
      bubbles: [
        taskToBubble(task({
          id: 'stable-position-task',
          title: 'Keep my valid position',
          view: {
            bubble: {
              x: 0,
              y: 0,
              size: 0.6,
            },
          },
        })),
      ],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 844,
      left: 0,
      width: 390,
      height: 844,
      toJSON: () => ({}),
    });

    render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', {
      name: 'Adaptive Bubble view',
    });

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent(canvas, new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 200,
      clientY: 400,
    }));
    fireEvent(canvas, new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 220,
      clientY: 420,
    }));
    fireEvent(canvas, new MouseEvent('pointerup', { bubbles: true }));

    expect(updateBubble).not.toHaveBeenCalled();
    rectSpy.mockRestore();
  });

  it('places origin-colliding tasks distinctly without rewriting canonical coordinates', async () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    const sizes = [0.9, 0.6, 0.6];
    setMockBubbleState({
      bubbles: ['one', 'two', 'three'].map((id, index) => taskToBubble(task({
        id,
        title: id,
        view: { bubble: { x: 0, y: 0, size: sizes[index] } },
      }))),
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 844,
      left: 0,
      width: 390,
      height: 844,
      toJSON: () => ({}),
    });

    const { container } = render(<IridescentCanvas />);

    await waitFor(() => expect(
      container.querySelectorAll('[data-adaptive-bubble]'),
    ).toHaveLength(3));
    const rendered = Array.from(
      container.querySelectorAll<HTMLElement>('[data-adaptive-bubble]'),
      bubble => ({
        x: Number.parseFloat(bubble.style.left)
          + (Number.parseFloat(bubble.style.width) / 2),
        y: Number.parseFloat(bubble.style.top)
          + (Number.parseFloat(bubble.style.height) / 2),
        radius: Number.parseFloat(bubble.style.width) / 2,
      }),
    );
    const positions = rendered.map(({ x, y }) => `${x}:${y}`);
    expect(new Set(positions).size).toBe(3);
    for (let left = 0; left < rendered.length; left += 1) {
      for (let right = left + 1; right < rendered.length; right += 1) {
        const distance = Math.hypot(
          rendered[left].x - rendered[right].x,
          rendered[left].y - rendered[right].y,
        );
        const requiredDistance = rendered[left].radius
          + rendered[right].radius;
        expect(distance).toBeGreaterThanOrEqual(requiredDistance);
      }
    }
    expect(updateBubble).not.toHaveBeenCalled();
    expect(mockUseBubbleStore.getState().bubbles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 0, y: 0 }),
      ]),
    );

    rectSpy.mockRestore();
  });

  it('reflows the same auto-placement cohort when tasks arrive one at a time', async () => {
    const first = taskToBubble(task({
      id: 'sequential-one',
      title: 'Sequential one',
      view: { bubble: { x: 0, y: 0, size: 0.9 } },
    }));
    const second = taskToBubble(task({
      id: 'sequential-two',
      title: 'Sequential two',
      view: { bubble: { x: 0, y: 0, size: 0.6 } },
    }));
    const third = taskToBubble(task({
      id: 'sequential-three',
      title: 'Sequential three',
      view: { bubble: { x: 0, y: 0, size: 0.6 } },
    }));
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    setMockBubbleState({
      bubbles: [first],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 844,
      left: 0,
      width: 390,
      height: 844,
      toJSON: () => ({}),
    });
    const { container, rerender } = render(<IridescentCanvas />);

    setMockBubbleState({
      bubbles: [first, second],
      updateBubble,
    });
    rerender(<IridescentCanvas />);
    await waitFor(() => expect(
      container.querySelectorAll('[data-adaptive-bubble]'),
    ).toHaveLength(2));
    expect(new Set(Array.from(
      container.querySelectorAll<HTMLElement>('[data-adaptive-bubble]'),
      bubble => `${bubble.style.left}:${bubble.style.top}`,
    )).size).toBe(2);

    setMockBubbleState({
      bubbles: [first, second, third],
      updateBubble,
    });
    rerender(<IridescentCanvas />);
    await waitFor(() => expect(
      container.querySelectorAll('[data-adaptive-bubble]'),
    ).toHaveLength(3));

    const rendered = Array.from(
      container.querySelectorAll<HTMLElement>('[data-adaptive-bubble]'),
      bubble => ({
        x: Number.parseFloat(bubble.style.left)
          + (Number.parseFloat(bubble.style.width) / 2),
        y: Number.parseFloat(bubble.style.top)
          + (Number.parseFloat(bubble.style.height) / 2),
        radius: Number.parseFloat(bubble.style.width) / 2,
      }),
    );
    for (let left = 0; left < rendered.length; left += 1) {
      for (let right = left + 1; right < rendered.length; right += 1) {
        const distance = Math.hypot(
          rendered[left].x - rendered[right].x,
          rendered[left].y - rendered[right].y,
        );
        const requiredDistance = rendered[left].radius
          + rendered[right].radius;
        expect(distance).toBeGreaterThanOrEqual(requiredDistance);
      }
    }
    expect(updateBubble).not.toHaveBeenCalled();
    expect((mockUseBubbleStore.getState().bubbles as Bubble[]).every(
      bubble => bubble.x === 0 && bubble.y === 0,
    )).toBe(true);
    rectSpy.mockRestore();
  });

  it('presents inaccessible legacy stacks safely without silently rewriting them', async () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    const legacyPositions = [
      { id: 'right-anchor', x: 100, y: 0 },
      { id: 'left-anchor', x: -100, y: 0 },
      { id: 'right-stacked', x: 106, y: 0 },
      { id: 'left-stacked', x: -94, y: 0 },
    ];
    setMockBubbleState({
      bubbles: legacyPositions.map(({ id, x, y }) => taskToBubble(task({
        id,
        title: id,
        view: { bubble: { x, y, size: 0.6 } },
      }))),
      isLoading: false,
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 844,
      bottom: 390,
      left: 0,
      width: 844,
      height: 390,
      toJSON: () => ({}),
    });

    const { container, rerender } = render(<IridescentCanvas />);

    await waitFor(() => expect(new Set(Array.from(
      container.querySelectorAll<HTMLElement>('[data-adaptive-bubble]'),
      bubble => `${bubble.style.left}:${bubble.style.top}`,
    )).size).toBe(4));

    const rendered = Array.from(
      container.querySelectorAll<HTMLElement>('[data-adaptive-bubble]'),
      element => ({
        id: element.dataset.taskId,
        x: Number.parseFloat(element.style.left)
          + (Number.parseFloat(element.style.width) / 2),
        y: Number.parseFloat(element.style.top)
          + (Number.parseFloat(element.style.height) / 2),
        radius: Number.parseFloat(element.style.width) / 2,
      }),
    );
    for (let left = 0; left < rendered.length; left += 1) {
      for (let right = left + 1; right < rendered.length; right += 1) {
        expect(Math.hypot(
          rendered[left].x - rendered[right].x,
          rendered[left].y - rendered[right].y,
        )).toBeGreaterThanOrEqual(
          rendered[left].radius + rendered[right].radius,
        );
      }
    }

    rerender(<IridescentCanvas />);
    await Promise.resolve();
    expect(updateBubble).not.toHaveBeenCalled();
    expect((mockUseBubbleStore.getState().bubbles as Bubble[]).map(
      bubble => ({ id: bubble.id, x: bubble.x, y: bubble.y }),
    )).toEqual(legacyPositions);
    rectSpy.mockRestore();
  });

  it('keeps drag transient and persists exactly once on release', async () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    setMockBubbleState({
      bubbles: [taskToBubble(task({
        id: 'drag-once',
        title: 'Drag me once',
        view: { bubble: { x: 20, y: 0, size: 0.6 } },
      }))],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="drag-once"]',
    ) as HTMLButtonElement;

    fireEvent(bubble, new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 220,
      clientY: 200,
    }));
    fireEvent(canvas, new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 240,
      clientY: 215,
    }));
    fireEvent(canvas, new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 260,
      clientY: 230,
    }));

    expect(updateBubble).not.toHaveBeenCalled();

    fireEvent(canvas, new MouseEvent('pointerup', {
      bubbles: true,
      clientX: 260,
      clientY: 230,
    }));

    await waitFor(() => expect(updateBubble).toHaveBeenCalledTimes(1));
    expect(updateBubble).toHaveBeenCalledWith(expect.objectContaining({
      id: 'drag-once',
      x: 60,
      y: 30,
    }));
    rectSpy.mockRestore();
  });

  it('merges from the drop coordinates without racing a stale position write', () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    const mergeBubbles = vi.fn();
    setMockBubbleState({
      bubbles: [
        taskToBubble(task({
          id: 'merge-a',
          title: 'Merge A',
          view: { bubble: { x: -60, y: 0, size: 0.6 } },
        })),
        taskToBubble(task({
          id: 'merge-b',
          title: 'Merge B',
          view: { bubble: { x: 60, y: 0, size: 0.6 } },
        })),
      ],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
      mergeBubbles,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="merge-a"]',
    ) as HTMLButtonElement;

    fireEvent(bubble, pointerEvent('pointerdown', {
      clientX: 140,
      clientY: 200,
      pointerId: 31,
    }));
    fireEvent(canvas, pointerEvent('pointermove', {
      clientX: 260,
      clientY: 200,
      pointerId: 31,
    }));
    fireEvent(canvas, pointerEvent('pointerup', {
      clientX: 260,
      clientY: 200,
      pointerId: 31,
    }));

    expect(screen.getByRole('dialog', { name: 'Merge tasks' })).toBeVisible();
    expect(updateBubble).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(mergeBubbles).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'merge-a', x: 60, y: 0 }),
      expect.objectContaining({ id: 'merge-b', x: 60, y: 0 }),
    );
    expect(updateBubble).not.toHaveBeenCalled();
    rectSpy.mockRestore();
  });

  it('restores the pre-drag position after keeping an overlapping task separate', async () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    const mergeBubbles = vi.fn();
    setMockBubbleState({
      bubbles: [
        taskToBubble(task({
          id: 'separate-a',
          title: 'Separate A',
          view: { bubble: { x: -60, y: 0, size: 0.6 } },
        })),
        taskToBubble(task({
          id: 'separate-b',
          title: 'Separate B',
          view: { bubble: { x: 60, y: 0, size: 0.6 } },
        })),
      ],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
      mergeBubbles,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="separate-a"]',
    ) as HTMLButtonElement;

    fireEvent(bubble, pointerEvent('pointerdown', {
      clientX: 140,
      clientY: 200,
      pointerId: 41,
    }));
    fireEvent(canvas, pointerEvent('pointermove', {
      clientX: 260,
      clientY: 200,
      pointerId: 41,
    }));
    fireEvent(canvas, pointerEvent('pointerup', {
      clientX: 260,
      clientY: 200,
      pointerId: 41,
    }));

    expect(updateBubble).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep separate' }));
    await waitFor(() => expect(updateBubble).toHaveBeenCalledOnce());
    expect(updateBubble).toHaveBeenCalledWith(expect.objectContaining({
      id: 'separate-a',
      x: -60,
      y: 0,
    }));
    expect(mergeBubbles).not.toHaveBeenCalled();
    rectSpy.mockRestore();
  });

  it('does not pan the canvas while one-finger dragging a task bubble', async () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    setMockBubbleState({
      bubbles: [taskToBubble(task({
        id: 'touch-drag',
        title: 'Touch drag once',
        view: { bubble: { x: 20, y: 0, size: 0.6 } },
      }))],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const bubble = container.querySelector(
      '[data-task-id="touch-drag"]',
    ) as HTMLButtonElement;
    const initialLeft = Number.parseFloat(bubble.style.left);

    fireEvent(bubble, pointerEvent('pointerdown', {
      clientX: 220,
      clientY: 200,
      pointerType: 'touch',
    }));
    fireEvent.touchStart(bubble, {
      touches: [{ clientX: 220, clientY: 200 }],
    });
    fireEvent(bubble, pointerEvent('pointermove', {
      clientX: 250,
      clientY: 220,
      pointerType: 'touch',
    }));
    fireEvent.touchMove(bubble, {
      touches: [{ clientX: 250, clientY: 220 }],
    });

    expect(Number.parseFloat(bubble.style.left) - initialLeft).toBe(30);

    fireEvent(bubble, pointerEvent('pointerup', {
      clientX: 250,
      clientY: 220,
      pointerType: 'touch',
    }));
    fireEvent.touchEnd(bubble, { touches: [] });

    await waitFor(() => expect(updateBubble).toHaveBeenCalledTimes(1));
    expect(updateBubble).toHaveBeenCalledWith(expect.objectContaining({
      id: 'touch-drag',
      x: 50,
      y: 20,
    }));
    rectSpy.mockRestore();
  });

  it('keeps a bubble drag owned by the pointer that started it', async () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    setMockBubbleState({
      bubbles: [taskToBubble(task({
        id: 'owned-drag',
        title: 'Owned drag',
        view: { bubble: { x: 20, y: 0, size: 0.6 } },
      }))],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="owned-drag"]',
    ) as HTMLButtonElement;
    const initialLeft = bubble.style.left;

    fireEvent(bubble, pointerEvent('pointerdown', {
      clientX: 220,
      clientY: 200,
      pointerId: 11,
      pointerType: 'touch',
    }));
    fireEvent(canvas, pointerEvent('pointermove', {
      clientX: 300,
      clientY: 260,
      pointerId: 12,
      pointerType: 'touch',
    }));
    fireEvent(canvas, pointerEvent('pointerup', {
      clientX: 300,
      clientY: 260,
      pointerId: 12,
      pointerType: 'touch',
    }));

    expect(bubble.style.left).toBe(initialLeft);
    expect(updateBubble).not.toHaveBeenCalled();

    fireEvent(canvas, pointerEvent('pointermove', {
      clientX: 250,
      clientY: 220,
      pointerId: 11,
      pointerType: 'touch',
    }));
    fireEvent(canvas, pointerEvent('pointerup', {
      clientX: 250,
      clientY: 220,
      pointerId: 11,
      pointerType: 'touch',
    }));

    await waitFor(() => expect(updateBubble).toHaveBeenCalledOnce());
    expect(updateBubble).toHaveBeenCalledWith(expect.objectContaining({
      id: 'owned-drag',
      x: 50,
      y: 20,
    }));
    rectSpy.mockRestore();
  });

  it('does not start pinch zoom when a second finger joins a task drag', () => {
    setTasks([task({
      id: 'drag-before-pinch',
      title: 'Drag before pinch',
      view: { bubble: { x: 20, y: 0, size: 0.6 } },
    })], createMockSettings({ bubbleDensity: 'high' }));
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="drag-before-pinch"]',
    ) as HTMLButtonElement;
    const initialWidth = bubble.style.width;

    fireEvent(bubble, pointerEvent('pointerdown', {
      clientX: 220,
      clientY: 200,
      pointerId: 21,
      pointerType: 'touch',
    }));
    fireEvent.touchStart(bubble, {
      touches: [{ clientX: 220, clientY: 200 }],
    });
    fireEvent.touchStart(canvas, {
      touches: [
        { clientX: 200, clientY: 200 },
        { clientX: 240, clientY: 200 },
      ],
    });
    fireEvent.touchMove(canvas, {
      touches: [
        { clientX: 180, clientY: 200 },
        { clientX: 300, clientY: 200 },
      ],
    });

    expect(bubble.style.width).toBe(initialWidth);
    fireEvent(canvas, pointerEvent('pointercancel', {
      clientX: 220,
      clientY: 200,
      pointerId: 21,
      pointerType: 'touch',
    }));
    rectSpy.mockRestore();
  });

  it('treats sub-eight-pixel pointer jitter as a tap, not a drag', () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    const onBubbleSelect = vi.fn();
    setMockBubbleState({
      bubbles: [taskToBubble(task({
        id: 'steady-tap',
        title: 'Open without jumping',
        view: { bubble: { x: 20, y: 0, size: 0.6 } },
      }))],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(
      <IridescentCanvas onBubbleSelect={onBubbleSelect} />,
    );
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="steady-tap"]',
    ) as HTMLButtonElement;

    fireEvent(bubble, new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 220,
      clientY: 200,
    }));
    fireEvent(canvas, new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 225,
      clientY: 204,
    }));
    fireEvent(canvas, new MouseEvent('pointerup', {
      bubbles: true,
      clientX: 225,
      clientY: 204,
    }));
    fireEvent.click(bubble);

    expect(updateBubble).not.toHaveBeenCalled();
    expect(onBubbleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'steady-tap' }),
    );
    rectSpy.mockRestore();
  });

  it('discards a cancelled drag and ignores later pointer movement', () => {
    const updateBubble = vi.fn().mockResolvedValue(undefined);
    setMockBubbleState({
      bubbles: [taskToBubble(task({
        id: 'cancel-drag',
        title: 'Cancel my drag',
        view: { bubble: { x: 20, y: 0, size: 0.6 } },
      }))],
      settings: createMockSettings({ bubbleDensity: 'high' }),
      updateBubble,
    });
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="cancel-drag"]',
    ) as HTMLButtonElement;

    fireEvent(bubble, new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 220,
      clientY: 200,
    }));
    fireEvent(canvas, new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 260,
      clientY: 230,
    }));
    fireEvent(canvas, new MouseEvent('pointercancel', { bubbles: true }));
    fireEvent(canvas, new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 300,
      clientY: 260,
    }));
    fireEvent(canvas, new MouseEvent('pointerup', { bubbles: true }));

    expect(updateBubble).not.toHaveBeenCalled();
    rectSpy.mockRestore();
  });

  it('keeps content under a translated two-finger pinch', () => {
    setTasks([task({
      id: 'translated-pinch',
      title: 'Stay under my fingers',
      view: { bubble: { x: -100, y: 0, size: 0.6 } },
    })], createMockSettings({ bubbleDensity: 'high' }));
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 300,
      left: 0,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="translated-pinch"]',
    ) as HTMLButtonElement;
    const bubbleCenterX = () => (
      Number.parseFloat(bubble.style.left)
      + (Number.parseFloat(bubble.style.width) / 2)
    );
    const initialWidth = Number.parseFloat(bubble.style.width);

    expect(bubbleCenterX()).toBe(100);
    fireEvent.touchStart(canvas, {
      touches: [
        { clientX: 50, clientY: 150 },
        { clientX: 150, clientY: 150 },
      ],
    });
    fireEvent.touchMove(canvas, {
      touches: [
        { clientX: 40, clientY: 150 },
        { clientX: 240, clientY: 150 },
      ],
    });

    expect(bubbleCenterX()).toBeCloseTo(140, 5);
    expect(Number.parseFloat(bubble.style.width)).toBeCloseTo(
      initialWidth * 2,
      5,
    );
    rectSpy.mockRestore();
  });

  it('pans one-to-one after zoom and keeps wheel focus anchored', async () => {
    const user = userEvent.setup();
    setTasks([task({
      id: 'geometry-task',
      title: 'Geometry task',
      view: { bubble: { x: 20, y: 0, size: 0.6 } },
    })], createMockSettings({ bubbleDensity: 'high' }));
    const rectSpy = vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const { container } = render(<IridescentCanvas />);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = container.querySelector(
      '[data-task-id="geometry-task"]',
    ) as HTMLButtonElement;
    const bubbleCenterX = () => (
      parseFloat(bubble.style.left) + (parseFloat(bubble.style.width) / 2)
    );

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(bubbleCenterX()).toBeCloseTo(224, 5);

    fireEvent(canvas, new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    }));
    fireEvent(canvas, new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 200,
      clientY: 100,
    }));
    fireEvent(canvas, new MouseEvent('pointerup', { bubbles: true }));
    expect(bubbleCenterX()).toBeCloseTo(324, 5);

    fireEvent.wheel(canvas, {
      deltaY: -100,
      clientX: 324,
      clientY: 200,
    });
    expect(bubbleCenterX()).toBeCloseTo(324, 5);

    rectSpy.mockRestore();
  });
});

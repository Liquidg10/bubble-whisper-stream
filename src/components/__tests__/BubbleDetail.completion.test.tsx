import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taskToBubble } from '@/adapters/taskAdapter';
import { BubbleDetail } from '@/components/BubbleDetail';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTaskStore } from '@/stores/taskStore';
import type { Bubble } from '@/types/bubble';
import type { Task } from '@/types/task';

const { mockToast, mockReceiptScan } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockReceiptScan: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/taskAwareAutoWriteService', () => ({
  taskAwareAutoWriteService: {
    evaluateTask: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/tts', () => ({
  ttsService: { speak: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services/haptics', () => ({
  hapticsService: {
    success: vi.fn(),
    trigger: vi.fn(),
  },
}));

vi.mock('@/config/flags', () => ({
  isFeatureEnabled: () => false,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/slider', () => ({ Slider: () => <div /> }));
vi.mock('@/components/AccessibleConfirmDialog', () => ({ AccessibleConfirmDialog: () => null }));
vi.mock('@/components/ReceiptScanner', () => ({
  ReceiptScanner: ({ bubble, onUpdate, onBusyChange }: {
    bubble: Bubble;
    onUpdate?: (updatedBubble: Bubble) => void | Promise<void>;
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <button
      type="button"
      onClick={() => void mockReceiptScan({ bubble, onUpdate, onBusyChange })}
    >
      Scan receipt
    </button>
  ),
}));
vi.mock('@/components/TaskOutliner', () => ({ TaskOutliner: () => null }));
vi.mock('@/components/TagPicker', () => ({ TagPicker: () => null }));

const originalUpdateBubble = useBubbleStore.getState().updateBubble;
const originalUpdateBubbleStrict = useBubbleStore.getState().updateBubbleStrict;
const originalAddReminder = useBubbleStore.getState().addReminder;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const task: Task = {
  id: 'bubble-detail-completion-1',
  type: 'task',
  title: 'Finish from Adaptive detail',
  completed: false,
  priority: 60,
  actionability: 'actionable',
  energyFit: 'medium',
  urgency: 2,
  readiness: {
    band: 'possible',
    source: 'computed',
    score: 0.7,
    reason: 'A realistic next action',
  },
  tags: [],
  createdAt: 1_000,
  updatedAt: 2_000,
  view: {
    bubble: { x: 10, y: 20, size: 0.6 },
  },
};

describe('BubbleDetail canonical completion', () => {
  let bubble: Bubble;
  let updateBubble: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReceiptScan.mockReset();
    bubble = taskToBubble(task);
    updateBubble = vi.fn(async (nextBubble: Bubble) => {
      useBubbleStore.setState(state => ({
        bubbles: state.bubbles.map(existing => (
          existing.id === nextBubble.id ? nextBubble : existing
        )),
      }));
    });

    useBubbleStore.setState({
      bubbles: [bubble],
      updateBubble,
      updateBubbleStrict: updateBubble,
    });
    useTaskStore.setState({
      tasks: [task],
      selectedTaskIds: new Set(),
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    useBubbleStore.setState({
      bubbles: [],
      updateBubble: originalUpdateBubble,
      updateBubbleStrict: originalUpdateBubbleStrict,
      addReminder: originalAddReminder,
    });
    useTaskStore.setState({
      tasks: [],
      selectedTaskIds: new Set(),
      isLoading: false,
    });
  });

  it('uses TaskStore and keeps a delayed detail autosave from reverting completion', async () => {
    const user = userEvent.setup();
    render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={vi.fn()}
      />,
    );

    const content = screen.getByDisplayValue(task.title);
    await user.clear(content);
    await user.type(content, 'Edited just before completion');
    await user.click(screen.getByRole('checkbox', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Completed' })).toBeChecked();
      expect(screen.getByText('Completion status saved')).toBeInTheDocument();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1_100));
    });

    const persistedBubble = useBubbleStore.getState().bubbles[0];
    expect(persistedBubble).toMatchObject({
      content: 'Edited just before completion',
      completed: true,
      metadata: {
        canonicalTask: {
          completed: true,
          actionability: 'actionable',
          energyFit: 'medium',
          urgency: 2,
          readiness: task.readiness,
        },
      },
    });
    expect(updateBubble).toHaveBeenCalledTimes(1);
    expect(updateBubble).toHaveBeenCalledWith(expect.objectContaining({ completed: true }));
  });

  it('serializes an in-flight edit before completion and locks the editor while saving', async () => {
    const user = userEvent.setup();
    const firstWrite = deferred<void>();
    const completionWrite = deferred<void>();
    const writeGates = [firstWrite, completionWrite];
    const serializedUpdate = vi.fn(async (nextBubble: Bubble) => {
      const gate = writeGates[serializedUpdate.mock.calls.length - 1];
      await gate.promise;
      useBubbleStore.setState(state => ({
        bubbles: state.bubbles.map(existing => (
          existing.id === nextBubble.id ? nextBubble : existing
        )),
      }));
    });
    useBubbleStore.setState({
      updateBubble: serializedUpdate,
      updateBubbleStrict: serializedUpdate,
    });

    render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={vi.fn()}
      />,
    );

    const content = screen.getByDisplayValue(task.title);
    await user.clear(content);
    await user.type(content, 'Edit already being saved');

    await waitFor(() => expect(serializedUpdate).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    await user.click(screen.getByRole('checkbox', { name: 'Completed' }));

    expect(screen.getByRole('checkbox', { name: 'Completed' })).toBeDisabled();
    expect(content).toBeDisabled();
    expect(serializedUpdate).toHaveBeenCalledTimes(1);

    await act(async () => firstWrite.resolve());

    await waitFor(() => expect(serializedUpdate).toHaveBeenCalledTimes(2));
    expect(serializedUpdate.mock.calls[1][0]).toMatchObject({
      content: 'Edit already being saved',
      completed: true,
    });

    await act(async () => completionWrite.resolve());

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Completed' })).toBeChecked();
      expect(screen.getByText('Completion status saved')).toBeInTheDocument();
    });
    expect(useBubbleStore.getState().bubbles[0]).toMatchObject({
      content: 'Edit already being saved',
      completed: true,
    });
  });

  it('flushes a pending edit before Done closes the detail', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={onClose}
      />,
    );

    const content = screen.getByDisplayValue(task.title);
    await user.clear(content);
    await user.type(content, 'Saved on fast close');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateBubble).toHaveBeenCalledTimes(1);
    expect(updateBubble).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Saved on fast close',
    }));
  });

  it('retries a previously failed dirty autosave before Done closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const updateBubbleStrict = vi
      .fn()
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockImplementation(updateBubble);
    useBubbleStore.setState({ updateBubbleStrict });

    render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={onClose}
      />,
    );

    const content = screen.getByDisplayValue(task.title);
    await user.clear(content);
    await user.type(content, 'Retry this edit on close');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Changes are still here');
    }, { timeout: 2_000 });

    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateBubbleStrict).toHaveBeenCalledTimes(2);
    expect(useBubbleStore.getState().bubbles[0]).toMatchObject({
      content: 'Retry this edit on close',
    });
  });

  it('locks completion during receipt persistence and preserves both updates', async () => {
    const user = userEvent.setup();
    const scanGate = deferred<void>();
    bubble = {
      ...bubble,
      imageUri: 'data:image/png;base64,receipt',
    };
    useBubbleStore.setState({ bubbles: [bubble] });
    mockReceiptScan.mockImplementation(async ({
      bubble: staleBubble,
      onUpdate,
      onBusyChange,
    }) => {
      onBusyChange?.(true);
      await scanGate.promise;
      await onUpdate?.({
        ...staleBubble,
        metadata: {
          ...staleBubble.metadata,
          finance: {
            merchant: 'Local Market',
            total: 12.34,
            receiptProcessed: true,
          },
        },
      });
      onBusyChange?.(false);
    });

    render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Scan receipt' }));
    const checkbox = screen.getByRole('checkbox', { name: 'Completed' });
    await waitFor(() => expect(checkbox).toBeDisabled());
    expect(updateBubble).not.toHaveBeenCalled();

    await act(async () => scanGate.resolve());
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(useBubbleStore.getState().bubbles[0].metadata?.finance).toMatchObject({
      merchant: 'Local Market',
      total: 12.34,
    });

    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(useBubbleStore.getState().bubbles[0]).toMatchObject({
      completed: true,
      metadata: {
        finance: {
          merchant: 'Local Market',
          total: 12.34,
        },
      },
    });
  });

  it('locks completion while adding a reminder and preserves both updates', async () => {
    const user = userEvent.setup();
    const reminderGate = deferred<void>();
    const addReminder = vi.fn(async () => reminderGate.promise);
    useBubbleStore.setState({ addReminder });

    render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remind' }));
    const checkbox = screen.getByRole('checkbox', { name: 'Completed' });
    expect(checkbox).toBeDisabled();

    await act(async () => reminderGate.resolve());
    await waitFor(() => expect(checkbox).toBeEnabled());
    const reminderId = useBubbleStore.getState().bubbles[0].reminderId;
    expect(reminderId).toBeTruthy();

    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(useBubbleStore.getState().bubbles[0]).toMatchObject({
      completed: true,
      reminderId,
    });
  });

  it('keeps the completion error visible after other pending edits recover', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const updateBubbleStrict = vi
      .fn()
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockImplementation(updateBubble);
    useBubbleStore.setState({ updateBubbleStrict });

    const { rerender } = render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={vi.fn()}
      />,
    );

    const content = screen.getByDisplayValue(task.title);
    await user.clear(content);
    await user.type(content, 'Keep this edit after completion fails');
    await user.click(screen.getByRole('checkbox', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Completion could not be saved');
    });
    await waitFor(() => expect(updateBubbleStrict).toHaveBeenCalledTimes(2), { timeout: 2_000 });

    rerender(
      <BubbleDetail
        bubble={useBubbleStore.getState().bubbles[0]}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Completion could not be saved');
    expect(screen.getByRole('checkbox', { name: 'Completed' })).not.toBeChecked();
    expect(useBubbleStore.getState().bubbles[0]).toMatchObject({
      content: 'Keep this edit after completion fails',
      completed: false,
    });
    consoleError.mockRestore();
  });

  it('keeps completion unchanged and exposes a durable-write failure', async () => {
    const user = userEvent.setup();
    const persistenceError = new Error('IndexedDB unavailable');
    const updateBubbleStrict = vi.fn().mockRejectedValue(persistenceError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useBubbleStore.setState({ updateBubbleStrict });

    render(
      <BubbleDetail
        bubble={bubble}
        isOpen
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Completion could not be saved');
      expect(screen.getByText('Completion status was not saved')).toBeInTheDocument();
    });

    expect(screen.getByRole('checkbox', { name: 'Completed' })).not.toBeChecked();
    expect(useBubbleStore.getState().bubbles[0]).toMatchObject({ completed: false });
    expect(useTaskStore.getState().isLoading).toBe(false);
    expect(updateBubbleStrict).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Completion not saved',
      variant: 'destructive',
    }));

    consoleError.mockRestore();
  });
});

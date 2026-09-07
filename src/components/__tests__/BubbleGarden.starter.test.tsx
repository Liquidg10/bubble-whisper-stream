import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bubble } from '@/types/bubble';
import type { Task } from '@/types/task';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { STARTER_LESSONS, starterLessonKey } from '@/domain/bubbleGarden';
import { useStarterBubbles } from '@/components/BubbleGarden';
import { useBubbleStore } from '@/stores/bubbleStore';
import Index from '@/pages/Index';

const facade = vi.hoisted(() => ({
  addTask: vi.fn<(task: Omit<Task, 'id'>) => Promise<Task>>(),
  getTasks: vi.fn<() => Task[]>(),
  completeMilestone: vi.fn(),
  skipProgression: vi.fn(),
}));

vi.mock('@/stores/bubbleStore', async () => {
  const { create } = await import('zustand');
  return { useBubbleStore: create(() => ({ bubbles: [] as Bubble[], settings: { viewMode: 'bubble' }, isLoading: false })) };
});
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: () => facade } }));
vi.mock('@/providers/ProgressiveOnboardingProvider', () => ({
  useProgressiveOnboarding: () => ({
    state: { hasSkippedProgression: false, completedMilestones: [] },
    currentMilestone: { day: 1, title: 'First exploration', description: 'Try a small action.' },
    completeMilestone: facade.completeMilestone,
    skipProgression: facade.skipProgression,
  }),
}));
vi.mock('@/components/BubbleCanvas', () => ({ BubbleCanvas: () => <div data-testid="bubble-canvas">Your saved bubbles</div> }));
vi.mock('@/components/AtomicView', () => ({ AtomicView: () => <div>Atomic canvas</div> }));
vi.mock('@/components/RadialCapture', () => ({ RadialCapture: () => null }));
vi.mock('@/components/NotificationSystem', () => ({ NotificationSystem: () => null }));
vi.mock('@/components/JoyMomentumIntegration', () => ({ JoyMomentumIntegration: () => null }));
vi.mock('@/components/BubbleDetail', () => ({ BubbleDetail: () => null }));
vi.mock('@/components/SmartTaskQuickAdd', () => ({ SmartTaskQuickAdd: () => null }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function commitTask(data: Omit<Task, 'id'>): Task {
  const task = { ...data, id: `saved-${useBubbleStore.getState().bubbles.length + 1}` };
  useBubbleStore.setState(state => ({ bubbles: [...state.bubbles, taskToBubble(task)] }));
  return task;
}

beforeEach(() => {
  vi.clearAllMocks();
  useBubbleStore.setState({ bubbles: [], isLoading: false });
  facade.getTasks.mockImplementation(() => useBubbleStore.getState().bubbles.map(bubbleToTask));
  facade.addTask.mockImplementation(async data => commitTask(data));
});
afterEach(cleanup);

describe('Shared starter guide saving', () => {
  it('admits only one pack when start is called twice before the first write resolves', async () => {
    const firstWrite = deferred();
    facade.addTask.mockImplementationOnce(async data => { await firstWrite.promise; return commitTask(data); });
    const { result } = renderHook(() => useStarterBubbles());
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = result.current.start(); second = result.current.start(); });
    expect(facade.addTask).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);

    await act(async () => { firstWrite.resolve(); await Promise.all([first, second]); });
    expect(facade.getTasks().map(starterLessonKey)).toEqual(STARTER_LESSONS.map(lesson => lesson.key));
    expect(facade.addTask).toHaveBeenCalledTimes(3);
    expect(result.current.busy).toBe(false);
  });

  it('shares pending state when opening Guide during a welcome-pack save', async () => {
    const firstWrite = deferred();
    facade.addTask.mockImplementationOnce(async data => { await firstWrite.promise; return commitTask(data); });
    render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Start with 3 guide bubbles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
    const pending = screen.getByRole('button', { name: 'Saving…' });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(facade.addTask).toHaveBeenCalledTimes(1);

    await act(async () => { firstWrite.resolve(); });
    await waitFor(() => expect(facade.getTasks()).toHaveLength(3));
    expect(new Set(facade.getTasks().map(starterLessonKey)).size).toBe(3);
    expect(facade.addTask).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: /Create 3 guide bubbles|Add missing guide bubbles/ })).not.toBeInTheDocument();
  });

  it('keeps a partial failure visible on the canvas and retries only missing lessons', async () => {
    facade.addTask
      .mockImplementationOnce(async data => commitTask(data))
      .mockRejectedValueOnce(new Error('Simulated second-write failure'));
    render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Start with 3 guide bubbles' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The guide could not finish saving');
    expect(screen.getByTestId('bubble-canvas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start with 3 guide bubbles' })).not.toBeInTheDocument();
    expect(facade.getTasks().map(starterLessonKey)).toEqual(['move']);

    // A retry must retain a lesson the user has already personalized.
    act(() => useBubbleStore.setState(state => ({ bubbles: state.bubbles.map(bubble => ({ ...bubble, content: 'My own first step', caption: 'Keep these notes' })) })));
    fireEvent.click(screen.getByRole('button', { name: 'Retry guide' }));
    await waitFor(() => expect(facade.getTasks()).toHaveLength(3));
    expect(facade.getTasks()[0]).toMatchObject({ title: 'My own first step', description: 'Keep these notes' });
    expect(facade.getTasks().map(starterLessonKey)).toEqual(['move', 'connect', 'finish']);
    expect(facade.addTask.mock.calls.map(([task]) => starterLessonKey({ ...task, id: 'candidate' }))).toEqual(['move', 'connect', 'connect', 'finish']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps existing milestone actions reachable inside the optional guide section', () => {
    render(<Index />);
    fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
    fireEvent.click(screen.getByText('More guided lessons · Day 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark explored' }));
    expect(facade.completeMilestone).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Explore at my own pace' }));
    expect(facade.skipProgression).toHaveBeenCalledTimes(1);
    expect(facade.addTask).not.toHaveBeenCalled();
  });
});

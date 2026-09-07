import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bubble } from '@/types/bubble';
import type { Task } from '@/types/task';
import { createTask } from '@/types/task';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { createUserDomainLink } from '@/domain/lifeDomains';
import { suggestBubbleSprouts } from '@/domain/bubbleGarden';
import { readDismissedSproutKeys } from '@/domain/bubbleGardenState';
import { useBubbleStore } from '@/stores/bubbleStore';
import { BubbleGardenDialog } from '@/components/BubbleGarden';
import { BubbleFamily } from '@/components/BubbleFamily';

const facade = vi.hoisted(() => ({ addTask: vi.fn(), saveBubble: vi.fn(), deleteBubble: vi.fn(), getTasks: vi.fn(), updateTask: vi.fn() }));
vi.mock('@/stores/bubbleStore', async () => {
  const { create } = await import('zustand');
  return { useBubbleStore: create(() => ({ bubbles: [] as Bubble[], updateBubbleStrict: facade.saveBubble, deleteBubble: facade.deleteBubble })) };
});
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: () => facade } }));
vi.mock('@/providers/ProgressiveOnboardingProvider', () => ({ useProgressiveOnboarding: () => ({ state: { hasSkippedProgression: true, completedMilestones: [] }, currentMilestone: null }) }));
const starter = { start: vi.fn(), busy: false, error: '' };
const openTask = vi.fn();
function parent(): Task {
  return { ...createTask('Explore an idea', 'task', { domainLinks: [createUserDomainLink('Home')], metadata: { preserved: 'yes' } }), id: 'parent' };
}
function mountGarden(id = 'parent') {
  return render(<BubbleGardenDialog mode="grow" sourceTaskId={id} onClose={vi.fn()} onOpenTask={openTask} starter={starter} />);
}
function drafts() { return screen.queryAllByRole('textbox'); }
function firstCard() { return drafts()[0].closest('article')!; }
function commitTask(data: Omit<Task, 'id'>) {
  const task = { ...data, id: `child-${useBubbleStore.getState().bubbles.length}` };
  useBubbleStore.setState(state => ({ bubbles: [...state.bubbles, taskToBubble(task)] }));
  return task;
}

beforeEach(() => {
  vi.clearAllMocks();
  useBubbleStore.setState({ bubbles: [taskToBubble(parent())] });
  facade.getTasks.mockImplementation(() => useBubbleStore.getState().bubbles.map(bubbleToTask));
  facade.saveBubble.mockImplementation(async bubble => useBubbleStore.setState(state => ({ bubbles: state.bubbles.map(item => item.id === bubble.id ? bubble : item) })));
  facade.addTask.mockImplementation(async data => commitTask(data));
});
afterEach(cleanup);

describe('Garden review continuity', () => {
  it('retains dismissals after remount and restores only uncreated suggestions', async () => {
    const initial = suggestBubbleSprouts(parent(), facade.getTasks());
    const mounted = mountGarden();
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(drafts()).toHaveLength(2));
    expect(readDismissedSproutKeys(facade.getTasks()[0])).toEqual([initial[0].key]);
    mounted.unmount();
    mountGarden();
    expect(drafts()).toHaveLength(2);
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Add this bubble' }));
    await waitFor(() => expect(facade.getTasks()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Restore suggestions' }));
    await waitFor(() => expect(drafts()).toHaveLength(2));
    expect(drafts().map(item => (item as HTMLTextAreaElement).value)).toContain(initial[0].title);
    expect(drafts().map(item => (item as HTMLTextAreaElement).value)).not.toContain(initial[1].title);
    expect(screen.getByRole('button', { name: `Open grown bubble: ${initial[1].title}` })).toBeInTheDocument();
    expect(facade.updateTask).not.toHaveBeenCalled();
  });

  it('retains edited words and checked links on a failed dismissal and supports retry', async () => {
    facade.saveBubble.mockRejectedValueOnce(new Error('Storage full'));
    mountGarden();
    fireEvent.change(drafts()[0], { target: { value: 'My reviewed next step' } });
    fireEvent.click(within(firstCard()).getByRole('checkbox', { name: 'Home' }));
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be dismissed');
    expect(drafts()).toHaveLength(3);
    expect(drafts()[0]).toHaveValue('My reviewed next step');
    expect(within(firstCard()).getByRole('checkbox', { name: 'Home' })).not.toBeChecked();
    expect(readDismissedSproutKeys(facade.getTasks()[0])).toEqual([]);
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(drafts()).toHaveLength(2));
    expect(facade.saveBubble).toHaveBeenCalledTimes(2);
  });

  it('keeps failed restoration visible and allows retry without silently changing choices', async () => {
    mountGarden();
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(drafts()).toHaveLength(2));
    facade.saveBubble.mockRejectedValueOnce(new Error('Storage unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore suggestions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be restored');
    expect(drafts()).toHaveLength(2);
    expect(readDismissedSproutKeys(facade.getTasks()[0])).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Restore suggestions' }));
    await waitFor(() => expect(drafts()).toHaveLength(3));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retains a completed source and its saved children without generating new drafts', () => {
    const source = parent();
    const child = { ...createTask('A finished next step', 'task', { completed: true, metadata: { bubbleGarden: { sourceTaskId: source.id, sproutKey: 'saved' } } }), id: 'child' };
    useBubbleStore.setState({ bubbles: [taskToBubble({ ...source, completed: true }), taskToBubble(child)] });
    mountGarden();
    expect(screen.getByRole('combobox', { name: 'Bubble to grow' })).toHaveValue('parent');
    expect(drafts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Open grown bubble: A finished next step' }));
    expect(openTask).toHaveBeenCalledWith('child');
    expect(facade.addTask).not.toHaveBeenCalled();
  });

  it('joins an addition still saving after the dialog remounts', async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    facade.addTask.mockImplementationOnce(async data => { await gate; return commitTask(data); });
    const mounted = mountGarden();
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Add this bubble' }));
    await waitFor(() => expect(facade.addTask).toHaveBeenCalledTimes(1));
    mounted.unmount();
    mountGarden();
    fireEvent.click(within(firstCard()).getByRole('button', { name: 'Add this bubble' }));
    await act(async () => { finish(); });
    await waitFor(() => expect(facade.getTasks()).toHaveLength(2));
    expect(facade.addTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('list', { name: 'Steps grown from this bubble' }).children).toHaveLength(1);
  });
});

describe('Bubble family navigation', () => {
  it('uses current titles and completion state after a remount and handles a deleted parent', () => {
    const child = { ...createTask('Child title', 'task', { metadata: { bubbleGarden: { sourceTaskId: 'parent' } } }), id: 'child' };
    useBubbleStore.setState(state => ({ bubbles: [...state.bubbles, taskToBubble(child)] }));
    const mounted = render(<BubbleFamily taskId="child" onOpenTask={openTask} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open source bubble: Explore an idea' }));
    expect(openTask).toHaveBeenCalledWith('parent');
    act(() => useBubbleStore.setState(state => ({ bubbles: state.bubbles.map(item => item.id === 'parent' ? { ...item, content: 'Renamed source', completed: true } : item) })));
    expect(screen.getByRole('button', { name: 'Open source bubble: Renamed source' })).toHaveTextContent('Complete');
    mounted.unmount();
    render(<BubbleFamily taskId="child" onOpenTask={openTask} />);
    expect(screen.getByRole('button', { name: 'Open source bubble: Renamed source' })).toBeInTheDocument();
    act(() => useBubbleStore.setState(state => ({ bubbles: state.bubbles.filter(item => item.id !== 'parent') })));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/original bubble is no longer available/)).toBeInTheDocument();
    expect(facade.saveBubble).not.toHaveBeenCalled();
  });
});

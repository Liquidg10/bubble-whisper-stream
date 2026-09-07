import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, type Task } from '@/types/task';
import type { Bubble } from '@/types/bubble';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { useBubbleStore } from '@/stores/bubbleStore';
import { patchProactiveGrowthMode, getProactiveGrowthState } from '@/domain/proactiveGrowth';
import { ProactiveGrowthControls, ProactiveGrowthShelf } from '../ProactiveGrowth';

const facade = vi.hoisted(() => ({ addTask: vi.fn(), saveBubble: vi.fn(), deleteBubble: vi.fn(), getTasks: vi.fn() }));
vi.mock('@/stores/bubbleStore', async () => {
  const { create } = await import('zustand');
  return { useBubbleStore: create(() => ({ bubbles: [] as Bubble[], updateBubbleStrict: facade.saveBubble, deleteBubble: facade.deleteBubble })) };
});
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: () => facade } }));
// Unit tests cover persistence/coordinator outcomes. Browser workflows exercise
// the real Radix positioning, keyboard, focus return and accessibility behavior.
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react');
  const Context = React.createContext({ open: false, onOpenChange: (_open: boolean) => undefined });
  return {
    Popover: ({ open, onOpenChange, children }: React.PropsWithChildren<{open:boolean;onOpenChange:(open:boolean)=>void}>) => <Context.Provider value={{open,onOpenChange}}>{children}</Context.Provider>,
    PopoverTrigger: ({ children }: {children:React.ReactElement<{onClick?:()=>void}>}) => {
      const state = React.useContext(Context);
      return React.cloneElement(children, {onClick:()=>state.onOpenChange(!state.open)});
    },
    PopoverContent: ({ children, 'aria-labelledby': labelledBy }: React.PropsWithChildren<{'aria-labelledby':string}>) => {
      const state = React.useContext(Context);
      return state.open ? <div role="dialog" aria-labelledby={labelledBy}>{children}</div> : null;
    },
  };
});
const onReview = vi.fn();
const onOpen = vi.fn();
function source(): Task { return { ...createTask('Arrange my shelves', 'task', { description: '- Choose one shelf\n- Move one book' }), id: 'source' }; }
function Controls() {
  const bubbles = useBubbleStore(state => state.bubbles);
  const tasks = bubbles.map(bubbleToTask);
  return <ProactiveGrowthControls source={tasks[0]} tasks={tasks} />;
}
function mount() { return render(<React.StrictMode><ProactiveGrowthShelf onReviewSource={onReview} onOpenTask={onOpen} /><Controls /></React.StrictMode>); }
function openControls() { fireEvent.click(screen.getByText(/Automatic steps ·/)); }

beforeEach(() => {
  vi.resetAllMocks();
  useBubbleStore.setState({ bubbles: [taskToBubble(source())] });
  facade.getTasks.mockImplementation(() => useBubbleStore.getState().bubbles.map(bubbleToTask));
  facade.saveBubble.mockImplementation(async bubble => useBubbleStore.setState(state => ({ bubbles: state.bubbles.map(item => item.id === bubble.id ? bubble : item) })));
  facade.addTask.mockImplementation(async data => {
    const task = { ...data, id: `child-${useBubbleStore.getState().bubbles.length}` };
    useBubbleStore.setState(state => ({ bubbles: [...state.bubbles, taskToBubble(task)] }));
    return task;
  });
  facade.deleteBubble.mockImplementation(async id => useBubbleStore.setState(state => ({ bubbles: state.bubbles.filter(item => item.id !== id) })));
});
afterEach(cleanup);

describe('Quiet suggestions and explicit automatic notes controls', () => {
  it('offers a review entry without creating tasks or changing source preferences', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ideas from your bubbles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review ideas from Arrange my shelves' }));
    expect(onReview).toHaveBeenCalledWith('source');
    expect(screen.queryByRole('dialog', { name: 'Ideas from your bubbles' })).not.toBeInTheDocument();
    await act(async () => {});
    expect(facade.addTask).not.toHaveBeenCalled();
    expect(facade.saveBubble).not.toHaveBeenCalled();
  });

  it('waits for saved enablement, creates one notes step and does not duplicate after remount', async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    facade.saveBubble.mockImplementationOnce(async bubble => { await gate; useBubbleStore.setState({ bubbles: [bubble] }); });
    const mounted = mount(); openControls();
    fireEvent.click(screen.getByRole('button', { name: 'Enable automatic notes steps' }));
    await waitFor(() => expect(facade.saveBubble).toHaveBeenCalledTimes(1));
    expect(facade.addTask).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    await waitFor(() => expect(facade.getTasks()).toHaveLength(2));
    expect(facade.getTasks()[1].title).toBe('Choose one shelf');
    mounted.unmount(); mount();
    await act(async () => {});
    expect(facade.addTask).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed preference off, allows retry and can pause before the next child', async () => {
    facade.saveBubble.mockRejectedValueOnce(new Error('Full'));
    mount(); openControls();
    fireEvent.click(screen.getByRole('button', { name: 'Enable automatic notes steps' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('preference was not saved');
    expect(getProactiveGrowthState(facade.getTasks()[0]).enabled).toBe(false);
    expect(facade.addTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable automatic notes steps' }));
    await waitFor(() => expect(facade.getTasks()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Turn off automatic steps' }));
    await waitFor(() => expect(getProactiveGrowthState(facade.getTasks()[0]).enabled).toBe(false));
    act(() => useBubbleStore.setState(state => ({ bubbles: state.bubbles.map(bubble => bubble.id === 'child-1' ? taskToBubble({ ...bubbleToTask(bubble), completed: true, updatedAt: Date.now() + 1 }) : bubble) })));
    await act(async () => {});
    expect(facade.addTask).toHaveBeenCalledTimes(1);
  });

  it('shows a failed automatic save without looping and retries only when asked', async () => {
    useBubbleStore.setState({ bubbles: [patchProactiveGrowthMode(taskToBubble(source()), true)] });
    facade.addTask.mockRejectedValueOnce(new Error('Full'));
    mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ideas from your bubbles' })).toHaveAccessibleDescription(/automatic step could not be saved/));
    fireEvent.click(screen.getByRole('button', { name: 'Ideas from your bubbles' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('automatic step could not be saved');
    await act(async () => {});
    expect(facade.addTask).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry automatic steps' }));
    await waitFor(() => expect(facade.getTasks()).toHaveLength(2));
    expect(facade.addTask).toHaveBeenCalledTimes(2);
  });

  it('undoes the automatic child, durably pauses, and keeps that item dismissed after remount', async () => {
    const mounted = mount(); openControls();
    fireEvent.click(screen.getByRole('button', { name: 'Enable automatic notes steps' }));
    await waitFor(() => expect(facade.getTasks()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Undo automatic step' }));
    await waitFor(() => expect(facade.getTasks()).toHaveLength(1));
    expect(getProactiveGrowthState(facade.getTasks()[0]).enabled).toBe(false);
    mounted.unmount(); mount();
    await act(async () => {});
    expect(facade.addTask).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ideas from your bubbles' }));
    expect(screen.getByText('Move one book')).toBeInTheDocument();
  });
});

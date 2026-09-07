import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { AtomicRenderer } from '@/experimental/atomic/AtomicRendererUnified';
import type { Bubble } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { getHorizon, setHorizon } from '@/lib/horizon';
import { AtomicView } from '../AtomicView';

const mocks = vi.hoisted(() => ({ props: null as ComponentProps<typeof AtomicRenderer> | null }));
vi.mock('@/experimental/atomic/AtomicRendererUnified', () => ({
  AtomicRenderer: (props: ComponentProps<typeof AtomicRenderer>) => { mocks.props = props; return <div>Atomic renderer</div>; },
}));

const originalStore = useBubbleStore.getState();
const task: Bubble = { id: 'atomic-persistence', type: 'Task', content: 'Original task', createdAt: 1, updatedAt: 1, x: 21, y: -43, size: 1, tags: [{ id: 'today', name: 'today' }] };

describe('AtomicView horizon persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.props = null;
    useBubbleStore.setState({ bubbles: [task], updateBubbleStrict: vi.fn(), moveBubbleToHorizon: vi.fn() });
  });
  afterEach(() => { useBubbleStore.setState(originalStore); });

  it('awaits the strict write and uses the latest canonical task, preserving its other fields', async () => {
    let resolveWrite!: () => void;
    const strictWrite = vi.fn<(bubble: Bubble) => Promise<void>>(() => new Promise<void>(resolve => { resolveWrite = resolve; }));
    useBubbleStore.setState({ updateBubbleStrict: strictWrite });
    render(<AtomicView />);
    const move = mocks.props!.onTimeHorizonUpdate!;
    const latest = { ...task, content: 'A newer title', notes: 'Keep this context', updatedAt: 9, tags: [...task.tags, { id: 'custom', name: 'custom' }] };
    act(() => useBubbleStore.setState({ bubbles: [latest] }));
    let completed = false;
    const promise = Promise.resolve(move(task.id, 0, 1)).then(() => { completed = true; });
    const written = strictWrite.mock.calls[0][0] as Bubble;
    expect(written).toMatchObject({ content: latest.content, notes: latest.notes, x: task.x, y: task.y, size: task.size });
    expect(written.tags).toContainEqual({ id: 'custom', name: 'custom' });
    expect(getHorizon(written)).toBe('week');
    expect(written.updatedAt).toBeGreaterThan(latest.updatedAt);
    expect(completed).toBe(false);
    expect(useBubbleStore.getState().bubbles[0]).toBe(latest);
    expect(useBubbleStore.getState().moveBubbleToHorizon).not.toHaveBeenCalled();
    await act(async () => { resolveWrite(); await promise; });
    expect(completed).toBe(true);
  });

  it('propagates a storage rejection and never invokes the optimistic move action', async () => {
    const strictWrite = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
    useBubbleStore.setState({ updateBubbleStrict: strictWrite });
    render(<AtomicView />);
    await expect(mocks.props!.onTimeHorizonUpdate!(task.id, 0, 2)).rejects.toThrow('Storage unavailable');
    expect(useBubbleStore.getState().bubbles[0]).toBe(task);
    expect(useBubbleStore.getState().moveBubbleToHorizon).not.toHaveBeenCalled();
  });

  it('rejects a missing or already-moved task before writing a stale horizon', async () => {
    const strictWrite = vi.fn();
    useBubbleStore.setState({ updateBubbleStrict: strictWrite });
    render(<AtomicView />);
    const move = mocks.props!.onTimeHorizonUpdate!;
    act(() => useBubbleStore.setState({ bubbles: [setHorizon(task, 'later')] }));
    await expect(move(task.id, 0, 1)).rejects.toThrow('This task changed');
    act(() => useBubbleStore.setState({ bubbles: [] }));
    await expect(move(task.id, 0, 1)).rejects.toThrow('no longer available');
    expect(strictWrite).not.toHaveBeenCalled();
  });
});

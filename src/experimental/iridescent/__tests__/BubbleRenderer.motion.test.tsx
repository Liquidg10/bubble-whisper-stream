import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMotionEnabled, stopAnimation, toggleAnimation } from '@/lib/motion';
import { taskToBubble } from '@/adapters/taskAdapter';
import type { Task } from '@/types/task';
import {
  createMockSettings,
  mockUseBubbleStore,
  resetMockBubbleStore,
  setMockBubbleState,
} from '@/test/helpers/mockBubbleStore';
import IridescentCanvas from '../BubbleRenderer';

vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule } = await import('@/test/helpers/mockBubbleStore');
  return makeBubbleStoreMockModule();
});
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useLODSystem', () => ({
  useLODSystem: () => ({ getLODConfig: () => ({ enableSpecular: true }) }),
}));

function task(id: string, priority = 50): Task {
  return {
    id, title: id, type: 'task', completed: false, priority, tags: [],
    createdAt: 1000, updatedAt: 1000,
    view: { bubble: { x: id === 'one' ? -120 : 120, y: 0, size: 0.6 } },
  };
}

function setTasks(tasks: Task[], reducedMotion = false) {
  setMockBubbleState({
    bubbles: tasks.map(taskToBubble),
    settings: createMockSettings({ bubbleDensity: 'high', reducedMotion }),
  });
}

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: 1 }, pointerType: { value: 'mouse' },
  });
  return event;
}

function getBubble(container: HTMLElement, id = 'one') {
  return container.querySelector<HTMLButtonElement>(`[data-task-id="${id}"]`)!;
}

describe('Iridescent bubble motion controls and placement', () => {
  beforeEach(() => {
    resetMockBubbleStore();
    if (!isMotionEnabled()) toggleAnimation();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 768,
      width: 1024, height: 768, toJSON: () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    vi.restoreAllMocks();
    if (!isMotionEnabled()) toggleAnimation();
  });

  it('pauses from the shared controller and resumes without moving or saving a task', () => {
    setTasks([task('one')]);
    const { container } = render(<IridescentCanvas />);
    const bubble = getBubble(container);
    const skin = bubble.querySelector<HTMLElement>('.soap')!;
    const position = { left: bubble.style.left, top: bubble.style.top };

    expect(skin.style.animation).toContain('livingSoapFloat');
    expect(bubble.style.animation).toBe('');
    expect(bubble.style.transform).toBe('');
    act(() => stopAnimation());
    expect(skin.style.animationPlayState).toBe('paused');
    expect(screen.getByRole('button', { name: 'Resume bubble motion' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Resume bubble motion' }));
    expect(skin.style.animationPlayState).toBe('running');
    expect({ left: bubble.style.left, top: bubble.style.top }).toEqual(position);
    expect(mockUseBubbleStore.getState().updateBubble).not.toHaveBeenCalled();
  });

  it('freezes the skin while hovering, focusing, and dragging without changing its phase', () => {
    setTasks([task('one')]);
    const { container } = render(<IridescentCanvas />);
    const bubble = getBubble(container);
    const skin = bubble.querySelector<HTMLElement>('.soap')!;
    const animation = skin.style.animation;

    fireEvent.pointerEnter(bubble);
    expect(skin.style.animationPlayState).toBe('paused');
    fireEvent.pointerLeave(bubble);
    expect(skin.style.animationPlayState).toBe('running');
    fireEvent.focus(bubble);
    expect(skin.style.animationPlayState).toBe('paused');
    fireEvent.blur(bubble);
    expect(skin.style.animationPlayState).toBe('running');
    fireEvent(bubble, pointer('pointerdown', 400, 384));
    expect(skin.style.animationPlayState).toBe('paused');
    fireEvent(screen.getByRole('region', { name: 'Adaptive Bubble view' }), pointer('pointercancel', 400, 384));
    expect(skin.style.animationPlayState).toBe('running');
    expect(skin.style.animation).toBe(animation);
    expect(mockUseBubbleStore.getState().updateBubble).not.toHaveBeenCalled();
  });

  it('keeps the same motion phase when readiness ranking changes', () => {
    setTasks([task('one', 80), task('two', 20)]);
    const { container, rerender } = render(<IridescentCanvas />);
    const skin = getBubble(container).querySelector<HTMLElement>('.soap')!;
    const initialAnimation = skin.style.animation;
    setTasks([task('two', 90), task('one', 10)]);
    rerender(<IridescentCanvas />);

    expect(getBubble(container).querySelector('.soap')).toBe(skin);
    expect(skin.style.animation).toBe(initialAnimation);
  });

  it('settles only the visual wrapper after a real drag and cancels it when motion is paused', async () => {
    const cancel = vi.fn();
    const animate = vi.fn().mockReturnValue({ cancel });
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    setTasks([task('one')]);
    const { container } = render(<IridescentCanvas />);
    const bubble = getBubble(container);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });

    fireEvent(bubble, pointer('pointerdown', 400, 384));
    fireEvent(canvas, pointer('pointermove', 450, 424));
    await act(async () => {
      fireEvent(canvas, pointer('pointerup', 450, 424));
    });

    expect(mockUseBubbleStore.getState().updateBubble).toHaveBeenCalledTimes(1);
    expect(mockUseBubbleStore.getState().updateBubble).toHaveBeenCalledWith(expect.objectContaining({ x: -70, y: 40 }));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(bubble.querySelector('.soap-elastic'));
    expect(bubble.style.transform).toBe('');
    act(() => stopAnimation());
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps reduced motion authoritative while dragging remains usable', async () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    setTasks([task('one')], true);
    const { container } = render(<IridescentCanvas />);
    const bubble = getBubble(container);
    const canvas = screen.getByRole('region', { name: 'Adaptive Bubble view' });
    expect(screen.getByRole('button', { name: 'Motion reduced by accessibility settings' })).toBeDisabled();
    expect(bubble.querySelector('.soap')).toHaveStyle({ animation: 'none' });

    fireEvent(bubble, pointer('pointerdown', 400, 384));
    fireEvent(canvas, pointer('pointermove', 450, 424));
    await act(async () => {
      fireEvent(canvas, pointer('pointerup', 450, 424));
    });
    expect(mockUseBubbleStore.getState().updateBubble).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
  });
});

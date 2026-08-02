import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePinchZoom } from '../usePinchZoom';

function touchEvent(points: Array<{ x: number; y: number }>): React.TouchEvent {
  return {
    touches: points.map(({ x, y }) => ({
      clientX: x,
      clientY: y,
    })),
    preventDefault: vi.fn(),
  } as unknown as React.TouchEvent;
}

describe('usePinchZoom', () => {
  it('tracks one-finger pan from touch start', () => {
    const onZoom = vi.fn();
    const onPan = vi.fn();
    const { result } = renderHook(() => usePinchZoom({ onZoom, onPan }));

    act(() => result.current.onTouchStart(touchEvent([{ x: 50, y: 60 }])));
    act(() => result.current.onTouchMove(touchEvent([{ x: 72, y: 51 }])));

    expect(onPan).toHaveBeenCalledWith({ x: 22, y: -9 });
    expect(onZoom).not.toHaveBeenCalled();
  });

  it('reports the real continuous pinch factor instead of a fixed zoom step', () => {
    const onZoom = vi.fn();
    const onPan = vi.fn();
    const { result } = renderHook(() => usePinchZoom({ onZoom, onPan }));

    act(() => result.current.onTouchStart(touchEvent([
      { x: 50, y: 100 },
      { x: 150, y: 100 },
    ])));
    act(() => result.current.onTouchMove(touchEvent([
      { x: 49.5, y: 100 },
      { x: 150.5, y: 100 },
    ])));

    expect(onZoom).toHaveBeenCalledWith(1.01, { x: 100, y: 100 });
    expect(onPan).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it('moves a translated pinch center before applying focal zoom', () => {
    const calls: string[] = [];
    const onZoom = vi.fn(() => calls.push('zoom'));
    const onPan = vi.fn(() => calls.push('pan'));
    const { result } = renderHook(() => usePinchZoom({ onZoom, onPan }));

    act(() => result.current.onTouchStart(touchEvent([
      { x: 50, y: 100 },
      { x: 150, y: 100 },
    ])));
    act(() => result.current.onTouchMove(touchEvent([
      { x: 40, y: 100 },
      { x: 240, y: 100 },
    ])));

    expect(onPan).toHaveBeenCalledWith({ x: 40, y: 0 });
    expect(onZoom).toHaveBeenCalledWith(2, { x: 140, y: 100 });
    expect(calls).toEqual(['pan', 'zoom']);
  });

  it('clears a one-finger gesture when the browser cancels touch input', () => {
    const onZoom = vi.fn();
    const onPan = vi.fn();
    const { result } = renderHook(() => usePinchZoom({ onZoom, onPan }));

    act(() => result.current.onTouchStart(touchEvent([{ x: 50, y: 60 }])));
    act(() => result.current.onTouchCancel());
    act(() => result.current.onTouchMove(touchEvent([{ x: 72, y: 51 }])));

    expect(onPan).not.toHaveBeenCalled();
    expect(onZoom).not.toHaveBeenCalled();
  });
});

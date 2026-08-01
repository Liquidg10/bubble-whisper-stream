import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { screenToWorld, worldToScreen } from '@/lib/canvasGeometry';
import { usePanZoom } from '../usePanZoom';

const RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 400,
  bottom: 300,
  width: 400,
  height: 300,
  toJSON: () => ({}),
} as DOMRect;

function pointerEvent(
  currentTarget: {
    setPointerCapture: ReturnType<typeof vi.fn>;
    releasePointerCapture: ReturnType<typeof vi.fn>;
    hasPointerCapture: ReturnType<typeof vi.fn>;
  },
  options: { x: number; y: number; pointerId?: number },
) {
  return {
    button: 0,
    pointerType: 'mouse',
    pointerId: options.pointerId ?? 1,
    clientX: options.x,
    clientY: options.y,
    target: { closest: () => null },
    currentTarget,
  } as unknown as React.PointerEvent;
}

function wheelEvent(options: {
  deltaY: number;
  deltaMode?: number;
  x?: number;
  y?: number;
}) {
  return {
    deltaY: options.deltaY,
    deltaMode: options.deltaMode ?? 0,
    clientX: options.x ?? RECT.width / 2,
    clientY: options.y ?? RECT.height / 2,
    preventDefault: vi.fn(),
  } as unknown as React.WheelEvent;
}

function touchEvent(
  points: Array<{ x: number; y: number }>,
  target: EventTarget = document.createElement('div'),
) {
  return {
    touches: points.map(({ x, y }) => ({ clientX: x, clientY: y })),
    target,
    preventDefault: vi.fn(),
  } as unknown as React.TouchEvent;
}

describe('usePanZoom', () => {
  it('uses an eight-pixel intent threshold and pans in screen pixels at any zoom', () => {
    const captureTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
    };
    const { result } = renderHook(() => usePanZoom({
      getContainerRect: () => RECT,
    }));

    act(() => {
      result.current.setViewportTransform({ x: 0, y: 0, scale: 2 });
      result.current.onPanStart(pointerEvent(captureTarget, { x: 100, y: 100 }));
    });
    act(() => {
      result.current.onPanMove(pointerEvent(captureTarget, { x: 107, y: 100 }));
    });
    expect(result.current.state).toMatchObject({ x: 0, y: 0, isPanning: false });

    act(() => {
      result.current.onPanMove(pointerEvent(captureTarget, { x: 120, y: 105 }));
    });
    expect(result.current.state).toMatchObject({
      x: 20,
      y: 5,
      scale: 2,
      isPanning: true,
    });

    act(() => {
      result.current.onPanEnd(pointerEvent(captureTarget, { x: 120, y: 105 }));
    });
    expect(captureTarget.setPointerCapture).toHaveBeenCalledWith(1);
    expect(captureTarget.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(result.current.state).toMatchObject({
      x: 20,
      y: 5,
      isDragging: false,
      isPanning: false,
    });
  });

  it('keeps a conventional mouse-wheel notch close to the existing twenty-percent step', () => {
    const { result } = renderHook(() => usePanZoom({
      getContainerRect: () => RECT,
    }));
    const zoomInEvent = wheelEvent({ deltaY: -100 });

    act(() => result.current.onWheel(zoomInEvent));
    expect(zoomInEvent.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.state.scale).toBeCloseTo(1.2, 8);

    act(() => result.current.onWheel(wheelEvent({ deltaY: 100 })));
    expect(result.current.state.scale).toBeCloseTo(1, 8);
  });

  it('accumulates fine trackpad deltas smoothly while preserving the focal point', () => {
    const { result } = renderHook(() => usePanZoom({
      getContainerRect: () => RECT,
    }));
    const focalPoint = { x: 90, y: 80 };
    const focalWorld = screenToWorld(
      focalPoint,
      result.current.state,
      { width: RECT.width, height: RECT.height },
    );

    for (let index = 0; index < 10; index += 1) {
      act(() => result.current.onWheel(wheelEvent({
        deltaY: -1,
        x: focalPoint.x,
        y: focalPoint.y,
      })));
    }

    expect(result.current.state.scale).toBeCloseTo(1.2 ** 0.1, 8);
    const focalScreen = worldToScreen(
      focalWorld,
      result.current.state,
      { width: RECT.width, height: RECT.height },
    );
    expect(focalScreen.x).toBeCloseTo(focalPoint.x, 8);
    expect(focalScreen.y).toBeCloseTo(focalPoint.y, 8);
  });

  it('bounds unusually large wheel deltas to one zoom step per event', () => {
    const { result } = renderHook(() => usePanZoom({
      getContainerRect: () => RECT,
    }));

    act(() => result.current.onWheel(wheelEvent({ deltaY: -100_000 })));

    expect(result.current.state.scale).toBeCloseTo(1.2, 8);
  });

  it('does not claim a one-finger pan that starts on an interactive child', () => {
    const { result } = renderHook(() => usePanZoom({
      getContainerRect: () => RECT,
    }));
    const bubble = document.createElement('button');
    bubble.dataset.bubble = '';

    act(() => result.current.onTouchStart(touchEvent(
      [{ x: 80, y: 90 }],
      bubble,
    )));
    act(() => result.current.onTouchMove(touchEvent(
      [{ x: 120, y: 130 }],
      bubble,
    )));

    expect(result.current.state).toMatchObject({
      x: 0,
      y: 0,
      isDragging: false,
      isPanning: false,
    });
  });

  it('clears touch ownership when the browser cancels a canvas pan', () => {
    const { result } = renderHook(() => usePanZoom({
      getContainerRect: () => RECT,
    }));
    const canvas = document.createElement('div');

    act(() => result.current.onTouchStart(touchEvent(
      [{ x: 80, y: 90 }],
      canvas,
    )));
    act(() => result.current.onTouchMove(touchEvent(
      [{ x: 100, y: 105 }],
      canvas,
    )));
    expect(result.current.state).toMatchObject({
      x: 20,
      y: 15,
      isDragging: true,
      isPanning: true,
    });

    act(() => result.current.onTouchCancel());
    act(() => result.current.onTouchMove(touchEvent(
      [{ x: 140, y: 145 }],
      canvas,
    )));

    expect(result.current.state).toMatchObject({
      x: 20,
      y: 15,
      isDragging: false,
      isPanning: false,
    });
  });
});

/**
 * Unified pan/zoom hook for CSS-transformed world layers.
 * Translation is always measured in screen pixels; scale is focal-anchored.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampCanvasScale,
  panViewportByScreenDelta,
  zoomViewportAtPoint,
} from '@/lib/canvasGeometry';
import { devLog } from '@/devtools/devLog';

interface PanZoomState {
  x: number;
  y: number;
  scale: number;
  isDragging: boolean;
  isPanning: boolean;
}

interface UsePanZoomOptions {
  initialState?: Partial<PanZoomState>;
  minScale?: number;
  maxScale?: number;
  panThreshold?: number;
  onStateChange?: (state: PanZoomState) => void;
  getContainerRect: () => DOMRect | null;
}

type StateUpdater = Partial<PanZoomState>
  | ((state: PanZoomState) => Partial<PanZoomState>);

const WHEEL_ZOOM_BASE = 1.2;
const WHEEL_ZOOM_REFERENCE_DELTA = 100;
const MAX_WHEEL_DELTA = WHEEL_ZOOM_REFERENCE_DELTA;
const WHEEL_LINE_PIXELS = 40;

export function wheelScaleFactor(
  deltaY: number,
  deltaMode: number,
  pageHeight: number,
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;

  const deltaMultiplier = deltaMode === 1
    ? WHEEL_LINE_PIXELS
    : deltaMode === 2
      ? Math.max(WHEEL_ZOOM_REFERENCE_DELTA, pageHeight)
      : 1;
  const normalizedDelta = Math.max(
    -MAX_WHEEL_DELTA,
    Math.min(MAX_WHEEL_DELTA, deltaY * deltaMultiplier),
  );

  return WHEEL_ZOOM_BASE ** (
    -normalizedDelta / WHEEL_ZOOM_REFERENCE_DELTA
  );
}

export function usePanZoom({
  initialState = {},
  minScale = 0.5,
  maxScale = 2.5,
  panThreshold = 8,
  onStateChange,
  getContainerRect,
}: UsePanZoomOptions) {
  const [state, setState] = useState<PanZoomState>({
    x: 0,
    y: 0,
    scale: 1,
    isDragging: false,
    isPanning: false,
    ...initialState,
  });
  const stateRef = useRef(state);
  const onStateChangeRef = useRef(onStateChange);
  const panStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const hasExceededThresholdRef = useRef(false);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchRef = useRef<{
    distance: number;
    center: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onStateChangeRef.current?.(state);
  }, [state]);

  const updateState = useCallback((updater: StateUpdater) => {
    setState((previous) => {
      const updates = typeof updater === 'function'
        ? updater(previous)
        : updater;
      const next = { ...previous, ...updates };
      stateRef.current = next;
      return next;
    });
  }, []);

  const performZoomByFactor = useCallback((
    scaleFactor: number,
    source: string,
    clientFocalPoint?: { x: number; y: number },
  ) => {
    const rect = getContainerRect();
    if (!rect) return;

    const current = stateRef.current;
    const focalPoint = clientFocalPoint
      ? {
          x: clientFocalPoint.x - rect.left,
          y: clientFocalPoint.y - rect.top,
        }
      : { x: rect.width / 2, y: rect.height / 2 };
    const next = zoomViewportAtPoint(
      current,
      scaleFactor,
      focalPoint,
      { width: rect.width, height: rect.height },
      minScale,
      maxScale,
    );

    if (next === current) return;

    devLog('pan-zoom-transition', {
      source,
      fromScale: current.scale,
      toScale: next.scale,
      focal: focalPoint,
      oldOffset: { x: current.x, y: current.y },
      newOffset: { x: next.x, y: next.y },
    });
    updateState(next);
  }, [getContainerRect, maxScale, minScale, updateState]);

  const onPanStart = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (
      target.closest('[data-bubble]')
      || target.closest('[data-molecule]')
      || target.closest('[data-electron]')
      || target.closest('button')
      || target.closest('[data-panel]')
      || target.closest('.ui-overlay')
    ) {
      return;
    }

    const current = stateRef.current;
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: current.x,
      startY: current.y,
    };
    hasExceededThresholdRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateState({ isDragging: true });
    devLog('pan-start', { pointer: { x: event.clientX, y: event.clientY } });
  }, [updateState]);

  const onPanMove = useCallback((event: React.PointerEvent) => {
    const start = panStartRef.current;
    if (!start || event.pointerId !== start.pointerId) return;

    const delta = {
      x: event.clientX - start.x,
      y: event.clientY - start.y,
    };
    const distance = Math.hypot(delta.x, delta.y);

    if (!hasExceededThresholdRef.current) {
      if (distance < panThreshold) return;
      hasExceededThresholdRef.current = true;
      updateState({ isPanning: true });
      devLog('pan-threshold-exceeded', { distance, threshold: panThreshold });
    }

    updateState({
      x: start.startX + delta.x,
      y: start.startY + delta.y,
    });
  }, [panThreshold, updateState]);

  const onPanEnd = useCallback((event?: React.PointerEvent) => {
    const start = panStartRef.current;
    if (event && start && event.pointerId !== start.pointerId) return;

    if (event?.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    panStartRef.current = null;
    hasExceededThresholdRef.current = false;
    updateState({ isDragging: false, isPanning: false });
  }, [updateState]);

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const scaleFactor = wheelScaleFactor(
      event.deltaY,
      event.deltaMode,
      getContainerRect()?.height ?? 0,
    );
    if (scaleFactor === 1) return;
    performZoomByFactor(
      scaleFactor,
      'wheel',
      { x: event.clientX, y: event.clientY },
    );
  }, [getContainerRect, performZoomByFactor]);

  const zoomIn = useCallback(() => {
    performZoomByFactor(1.2, 'button');
  }, [performZoomByFactor]);

  const zoomOut = useCallback(() => {
    performZoomByFactor(1 / 1.2, 'button');
  }, [performZoomByFactor]);

  const resetZoom = useCallback(() => {
    const current = stateRef.current;
    devLog('zoom-reset', {
      fromState: { x: current.x, y: current.y, scale: current.scale },
    });
    updateState({ scale: 1, x: 0, y: 0 });
  }, [updateState]);

  /**
   * CSS world layers use top-left absolute child coordinates. Solve the
   * center-origin transform that places that absolute point at viewport center.
   */
  const centerOnPoint = useCallback((
    point: { x: number; y: number },
    options?: { scale?: number },
  ) => {
    const rect = getContainerRect();
    if (!rect) return;
    const targetScale = clampCanvasScale(
      options?.scale ?? stateRef.current.scale,
      minScale,
      maxScale,
    );
    updateState({
      scale: targetScale,
      x: targetScale * ((rect.width / 2) - point.x),
      y: targetScale * ((rect.height / 2) - point.y),
    });
  }, [getContainerRect, maxScale, minScale, updateState]);

  const setViewportTransform = useCallback((transform: {
    x: number;
    y: number;
    scale: number;
  }) => {
    updateState({
      x: transform.x,
      y: transform.y,
      scale: clampCanvasScale(transform.scale, minScale, maxScale),
    });
  }, [maxScale, minScale, updateState]);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      lastPinchRef.current = {
        distance: Math.hypot(
          first.clientX - second.clientX,
          first.clientY - second.clientY,
        ),
        center: {
          x: (first.clientX + second.clientX) / 2,
          y: (first.clientY + second.clientY) / 2,
        },
      };
      lastTouchRef.current = null;
      updateState({ isDragging: true, isPanning: true });
      return;
    }

    if (event.touches.length === 1) {
      lastTouchRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
      lastPinchRef.current = null;
      updateState({ isDragging: true });
    }
  }, [updateState]);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 2 && lastPinchRef.current) {
      event.preventDefault();
      const first = event.touches[0];
      const second = event.touches[1];
      const distance = Math.hypot(
        first.clientX - second.clientX,
        first.clientY - second.clientY,
      );
      const center = {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
      };
      const previous = lastPinchRef.current;
      const panDelta = {
        x: center.x - previous.center.x,
        y: center.y - previous.center.y,
      };
      const panned = panViewportByScreenDelta(stateRef.current, panDelta);
      updateState(panned);
      stateRef.current = { ...stateRef.current, ...panned };
      performZoomByFactor(
        distance / previous.distance,
        'pinch',
        center,
      );
      lastPinchRef.current = { distance, center };
      return;
    }

    if (event.touches.length === 1 && lastTouchRef.current) {
      event.preventDefault();
      const current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
      const next = panViewportByScreenDelta(stateRef.current, {
        x: current.x - lastTouchRef.current.x,
        y: current.y - lastTouchRef.current.y,
      });
      updateState({ ...next, isPanning: true });
      lastTouchRef.current = current;
    }
  }, [performZoomByFactor, updateState]);

  const onTouchEnd = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 1) {
      lastPinchRef.current = null;
      lastTouchRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
      updateState({ isDragging: true, isPanning: false });
      return;
    }

    lastPinchRef.current = null;
    lastTouchRef.current = null;
    updateState({ isDragging: false, isPanning: false });
  }, [updateState]);

  const cursor = state.isPanning ? 'grabbing' : 'grab';

  return {
    state,
    onPanStart,
    onPanMove,
    onPanEnd,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
    centerOnPoint,
    setViewportTransform,
    cursor,
  };
}

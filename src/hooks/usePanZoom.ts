/**
 * Unified Pan/Zoom Hook - Single source of truth for all pan/zoom logic
 * Center-anchored zoom with 8px pan threshold, no drift
 */

import { useCallback, useRef, useState, useEffect } from 'react';
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

export function usePanZoom({
  initialState = {},
  minScale = 0.5,
  maxScale = 2.5,
  panThreshold = 8,
  onStateChange,
  getContainerRect
}: UsePanZoomOptions) {
  const [state, setState] = useState<PanZoomState>({
    x: 0,
    y: 0,
    scale: 1,
    isDragging: false,
    isPanning: false,
    ...initialState
  });

  const panStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const hasExceededThresholdRef = useRef(false);

  const updateState = useCallback((updates: Partial<PanZoomState>) => {
    setState(prev => {
      const newState = { ...prev, ...updates };
      onStateChange?.(newState);
      
      // Debug logging when enabled
      if ('scale' in updates || 'x' in updates || 'y' in updates) {
        devLog('pan-zoom-state', {
          scale: newState.scale,
          x: newState.x,
          y: newState.y,
          isPanning: newState.isPanning
        });
      }
      
      return newState;
    });
  }, [onStateChange]);

  // Center-anchored zoom - zoom to center of what's currently visible
  const performZoom = useCallback((zoomDirection: number, sourceEvent?: string) => {
    const rect = getContainerRect();
    if (!rect) return;

    const zoomFactor = zoomDirection > 0 ? 1.2 : 1 / 1.2;
    const newScale = Math.max(minScale, Math.min(state.scale * zoomFactor, maxScale));
    
    if (newScale === state.scale) return; // Already at limit

    // Find the center of what's currently visible in world coordinates
    // This is the world point that appears at the center of the viewport
    const viewCenterX = rect.width / 2;
    const viewCenterY = rect.height / 2;
    
    // Convert viewport center to world coordinates (what world point is at viewport center)
    // Transformation: viewportCoord = worldCoord * scale + panOffset
    // So: worldCoord = (viewportCoord - panOffset) / scale
    const worldCenterX = (viewCenterX - state.x) / state.scale;
    const worldCenterY = (viewCenterY - state.y) / state.scale;
    
    // Calculate new pan offset to keep the same world point at viewport center
    // We want: viewCenterX = worldCenterX * newScale + newX
    // So: newX = viewCenterX - worldCenterX * newScale
    const newX = viewCenterX - worldCenterX * newScale;
    const newY = viewCenterY - worldCenterY * newScale;

    devLog('pan-zoom-transition', {
      source: sourceEvent || 'unknown',
      fromScale: state.scale,
      toScale: newScale,
      zoomDirection,
      viewportCenter: { x: viewCenterX, y: viewCenterY },
      worldCenter: { x: worldCenterX, y: worldCenterY },
      oldOffset: { x: state.x, y: state.y },
      newOffset: { x: newX, y: newY }
    });

    updateState({
      scale: newScale,
      x: newX,
      y: newY
    });
  }, [state.scale, state.x, state.y, minScale, maxScale, getContainerRect, updateState]);

  // Pointer down - start potential pan (with threshold)
  const onPanStart = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    
    // Don't start panning if clicking on bubble or UI element
    if (target.closest('[data-bubble]') || 
        target.closest('button') || 
        target.closest('[data-panel]') ||
        target.closest('.ui-overlay')) {
      return;
    }

    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: state.x,
      startY: state.y
    };
    hasExceededThresholdRef.current = false;

    updateState({ isDragging: true });
    devLog('pan-start', { pointer: { x: e.clientX, y: e.clientY } });
  }, [state.x, state.y, updateState]);

  // Pointer move - pan if threshold exceeded
  const onPanMove = useCallback((e: React.PointerEvent) => {
    if (!state.isDragging || !panStartRef.current) return;

    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Only start panning if we've exceeded the 8px threshold
    if (!hasExceededThresholdRef.current) {
      if (distance > panThreshold) {
        hasExceededThresholdRef.current = true;
        updateState({ isPanning: true });
        devLog('pan-threshold-exceeded', { distance, threshold: panThreshold });
      }
      return;
    }

    // Apply pan
    const newX = panStartRef.current.startX + deltaX / state.scale;
    const newY = panStartRef.current.startY + deltaY / state.scale;
    
    updateState({ x: newX, y: newY });
  }, [state.isDragging, state.scale, panThreshold, updateState]);

  // Pointer up - end pan
  const onPanEnd = useCallback(() => {
    if (panStartRef.current) {
      devLog('pan-end', {
        finalPosition: { x: state.x, y: state.y },
        wasPanning: hasExceededThresholdRef.current
      });
    }
    
    panStartRef.current = null;
    hasExceededThresholdRef.current = false;
    updateState({ isDragging: false, isPanning: false });
  }, [state.x, state.y, updateState]);

  // Wheel zoom - unified with other zoom sources
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDirection = e.deltaY > 0 ? -1 : 1;
    performZoom(zoomDirection, 'wheel');
  }, [performZoom]);

  // Button zoom functions
  const zoomIn = useCallback(() => {
    performZoom(1, 'button');
  }, [performZoom]);

  const zoomOut = useCallback(() => {
    performZoom(-1, 'button');
  }, [performZoom]);

  const resetZoom = useCallback(() => {
    devLog('zoom-reset', { fromState: { x: state.x, y: state.y, scale: state.scale } });
    updateState({ scale: 1, x: 0, y: 0 });
  }, [state.x, state.y, state.scale, updateState]);

  // Handle mobile pinch - unified with other zoom sources
  const handlePinchZoom = useCallback((scaleFactor: number, center: { x: number; y: number }) => {
    // Convert scale factor to zoom direction for unified logic
    const zoomDirection = scaleFactor > 1 ? 1 : -1;
    performZoom(zoomDirection, 'pinch');
  }, [performZoom]);

  // Touch handlers for mobile pinch
  const lastDistanceRef = useRef(0);
  const lastCenterRef = useRef({ x: 0, y: 0 });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const distance = Math.sqrt(
      (touch1.clientX - touch2.clientX) ** 2 + 
      (touch1.clientY - touch2.clientY) ** 2
    );
    
    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    lastDistanceRef.current = distance;
    lastCenterRef.current = { x: centerX, y: centerY };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || lastDistanceRef.current === 0) return;
    
    e.preventDefault();
    
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const distance = Math.sqrt(
      (touch1.clientX - touch2.clientX) ** 2 + 
      (touch1.clientY - touch2.clientY) ** 2
    );
    
    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    const scaleFactor = distance / lastDistanceRef.current;
    handlePinchZoom(scaleFactor, { x: centerX, y: centerY });
    
    lastDistanceRef.current = distance;
    lastCenterRef.current = { x: centerX, y: centerY };
  }, [handlePinchZoom]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastDistanceRef.current = 0;
    }
  }, []);

  // Cursor states
  const cursor = state.isPanning ? 'grabbing' : (state.isDragging ? 'grab' : 'grab');

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
    cursor
  };
}

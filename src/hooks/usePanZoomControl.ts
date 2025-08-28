// Standardized pan/zoom that never conflicts with bubble drag or overlays

import { useCallback, useRef, useState } from 'react';

interface PanZoomState {
  x: number;
  y: number;
  scale: number;
  isDragging: boolean;
  isPanning: boolean;
}

interface UsePanZoomControlOptions {
  initialState?: Partial<PanZoomState>;
  minScale?: number;
  maxScale?: number;
  panThreshold?: number; // pixels before panning starts
  onStateChange?: (state: PanZoomState) => void;
  getContainerRect: () => DOMRect | null;
}

export function usePanZoomControl({
  initialState = {},
  minScale = 0.1,
  maxScale = 3,
  panThreshold = 8,
  onStateChange,
  getContainerRect
}: UsePanZoomControlOptions) {
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
      return newState;
    });
  }, [onStateChange]);

  // Handle pointer down on canvas background (not on bubbles)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
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
  }, [state.x, state.y, updateState]);

  // Handle pointer move for panning
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!state.isDragging || !panStartRef.current) return;

    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Only start panning if we've exceeded the threshold
    if (!hasExceededThresholdRef.current) {
      if (distance > panThreshold) {
        hasExceededThresholdRef.current = true;
        updateState({ isPanning: true });
      }
      return;
    }

    // Apply pan
    const newX = panStartRef.current.startX + deltaX / state.scale;
    const newY = panStartRef.current.startY + deltaY / state.scale;
    
    updateState({ x: newX, y: newY });
  }, [state.isDragging, state.scale, panThreshold, updateState]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
    hasExceededThresholdRef.current = false;
    updateState({ isDragging: false, isPanning: false });
  }, [updateState]);

  // Handle wheel zoom - anchor to center of current view
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const rect = getContainerRect();
    if (!rect) return;

    const zoomDirection = e.deltaY > 0 ? -1 : 1;
    const zoomFactor = 1 + (zoomDirection * 0.1);
    const newScale = Math.max(minScale, Math.min(state.scale * zoomFactor, maxScale));

    // For center-anchored zoom, we don't need to change x,y at all
    // The view center should remain the same world point
    updateState({
      scale: newScale
      // x and y stay the same - this keeps the center fixed
    });
  }, [state.scale, minScale, maxScale, getContainerRect, updateState]);

  // Handle mobile pinch zoom - anchor to center of current view  
  const handlePinchZoom = useCallback((scaleFactor: number, center: { x: number; y: number }) => {
    const newScale = Math.max(minScale, Math.min(state.scale * scaleFactor, maxScale));
    
    // For center-anchored zoom, we don't need to change x,y at all
    // The view center should remain the same world point
    updateState({
      scale: newScale
      // x and y stay the same - this keeps the center fixed
    });
  }, [state.scale, minScale, maxScale, updateState]);

  // Utility functions - all zoom to view center
  const zoomIn = useCallback(() => {
    const newScale = Math.min(state.scale * 1.2, maxScale);
    // Keep current view center fixed during button zoom
    updateState({ scale: newScale });
  }, [state.scale, maxScale, updateState]);

  const zoomOut = useCallback(() => {
    const newScale = Math.max(state.scale / 1.2, minScale);
    // Keep current view center fixed during button zoom
    updateState({ scale: newScale });
  }, [state.scale, minScale, updateState]);

  const resetZoom = useCallback(() => {
    updateState({ scale: 1, x: 0, y: 0 });
  }, [updateState]);

  const centerOnPoint = useCallback((x: number, y: number, scale?: number) => {
    updateState({ 
      x: -x, 
      y: -y, 
      scale: scale ?? state.scale 
    });
  }, [state.scale, updateState]);

  return {
    state,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onWheel: handleWheel
    },
    actions: {
      zoomIn,
      zoomOut,
      resetZoom,
      centerOnPoint,
      handlePinchZoom
    },
    cursors: {
      canvas: state.isPanning ? 'grabbing' : (state.isDragging ? 'grab' : 'grab'),
      bubble: 'pointer'
    }
  };
}
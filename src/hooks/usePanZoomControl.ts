// Standardized pan/zoom that never conflicts with bubble drag or overlays

import { useCallback, useRef, useState, useEffect } from 'react';
import { viewportMemoryService } from '@/services/viewportMemoryService';

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
  viewKey?: string; // For viewport memory
  onStateChange?: (state: PanZoomState) => void;
  getContainerRect: () => DOMRect | null;
}

export function usePanZoomControl({
  initialState = {},
  minScale = 0.1,
  maxScale = 3,
  panThreshold = 8,
  viewKey,
  onStateChange,
  getContainerRect
}: UsePanZoomControlOptions) {
  // Restore viewport from memory if available
  const restoredViewport = viewKey ? viewportMemoryService.restoreViewport(viewKey) : null;
  
  const [state, setState] = useState<PanZoomState>({
    x: restoredViewport?.x ?? 0,
    y: restoredViewport?.y ?? 0,
    scale: restoredViewport?.scale ?? 1,
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
      
      // Save to viewport memory when state changes
      if (viewKey && ('x' in updates || 'y' in updates || 'scale' in updates)) {
        viewportMemoryService.saveViewport(viewKey, {
          x: newState.x,
          y: newState.y,
          scale: newState.scale
        });
      }
      
      return newState;
    });
  }, [onStateChange, viewKey]);

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

  // Unified zoom function - anchor to center of current view
  const performZoom = useCallback((zoomDirection: number) => {
    const rect = getContainerRect();
    if (!rect) return;

    const zoomFactor = zoomDirection > 0 ? 1.2 : 1 / 1.2;
    const newScale = Math.max(minScale, Math.min(state.scale * zoomFactor, maxScale));

    // Calculate center point of the viewport
    const viewCenterX = rect.width / 2;
    const viewCenterY = rect.height / 2;
    
    // Convert to world coordinates
    const worldCenterX = (viewCenterX / state.scale) - state.x;
    const worldCenterY = (viewCenterY / state.scale) - state.y;
    
    // Calculate new offset to keep the same world point at the center
    const newX = (viewCenterX / newScale) - worldCenterX;
    const newY = (viewCenterY / newScale) - worldCenterY;

    updateState({
      scale: newScale,
      x: newX,
      y: newY
    });
  }, [state.scale, state.x, state.y, minScale, maxScale, getContainerRect, updateState]);

  // Handle wheel zoom - uses unified zoom logic
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDirection = e.deltaY > 0 ? -1 : 1;
    performZoom(zoomDirection);
  }, [performZoom]);

  // Handle mobile pinch zoom - uses unified zoom logic
  const handlePinchZoom = useCallback((scaleFactor: number, center: { x: number; y: number }) => {
    // Convert scale factor to zoom direction for unified logic
    const zoomDirection = scaleFactor > 1 ? 1 : -1;
    performZoom(zoomDirection);
  }, [performZoom]);

  // Button zoom functions - use unified zoom logic
  const zoomIn = useCallback(() => {
    performZoom(1);
  }, [performZoom]);

  const zoomOut = useCallback(() => {
    performZoom(-1);
  }, [performZoom]);

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
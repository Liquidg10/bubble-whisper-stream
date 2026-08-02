// Mobile pinch-to-zoom gesture handler for canvas viewport

import { useCallback, useRef } from 'react';

interface UsePinchZoomOptions {
  onZoom: (scale: number, center: { x: number; y: number }) => void;
  onPan: (delta: { x: number; y: number }) => void;
  minScale?: number;
  maxScale?: number;
  enabled?: boolean;
}

export function usePinchZoom({
  onZoom,
  onPan,
  enabled = true
}: UsePinchZoomOptions) {
  const lastDistanceRef = useRef(0);
  const lastCenterRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;

    if (e.touches.length === 1) {
      lastTouchRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      lastDistanceRef.current = 0;
      return;
    }

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
    lastTouchRef.current = null;
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    
    if (e.touches.length === 2 && lastDistanceRef.current > 0) {
      // Pinch zoom
      e.preventDefault();
      
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      const distance = Math.sqrt(
        (touch1.clientX - touch2.clientX) ** 2 + 
        (touch1.clientY - touch2.clientY) ** 2
      );
      
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      if (lastDistanceRef.current > 0) {
        const scaleFactor = distance / lastDistanceRef.current;
        // Move the old focal point to the new gesture center first, then zoom
        // around that new center. Reversing these updates makes a translated
        // pinch drift away from the user's fingers.
        onPan({
          x: centerX - lastCenterRef.current.x,
          y: centerY - lastCenterRef.current.y,
        });
        onZoom(scaleFactor, { x: centerX, y: centerY });
      }
      
      lastDistanceRef.current = distance;
      lastCenterRef.current = { x: centerX, y: centerY };
    } else if (e.touches.length === 1 && lastTouchRef.current) {
      // Single finger pan
      const touch = e.touches[0];
      const deltaX = touch.clientX - lastTouchRef.current.x;
      const deltaY = touch.clientY - lastTouchRef.current.y;
      
      onPan({ x: deltaX, y: deltaY });
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, [enabled, onZoom, onPan]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    
    if (e.touches.length === 1) {
      lastDistanceRef.current = 0;
      lastTouchRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      return;
    }

    lastDistanceRef.current = 0;
    lastTouchRef.current = null;
  }, [enabled]);

  const handleTouchCancel = useCallback(() => {
    if (!enabled) return;
    lastDistanceRef.current = 0;
    lastCenterRef.current = { x: 0, y: 0 };
    lastTouchRef.current = null;
  }, [enabled]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}

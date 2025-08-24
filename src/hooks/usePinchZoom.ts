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
  minScale = 0.1,
  maxScale = 3,
  enabled = true
}: UsePinchZoomOptions) {
  const lastDistanceRef = useRef(0);
  const lastCenterRef = useRef({ x: 0, y: 0 });
  const lastTouchesRef = useRef<TouchList | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || e.touches.length !== 2) return;
    
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
    lastTouchesRef.current = Array.from(e.touches) as any;
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    
    if (e.touches.length === 2 && lastTouchesRef.current) {
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
        onZoom(scaleFactor, { x: centerX, y: centerY });
      }
      
      lastDistanceRef.current = distance;
      lastCenterRef.current = { x: centerX, y: centerY };
    } else if (e.touches.length === 1 && lastTouchesRef.current && lastTouchesRef.current.length === 1) {
      // Single finger pan
      const touch = e.touches[0];
      const lastTouch = lastTouchesRef.current[0];
      
      const deltaX = touch.clientX - lastTouch.clientX;
      const deltaY = touch.clientY - lastTouch.clientY;
      
      onPan({ x: deltaX, y: deltaY });
      lastTouchesRef.current = Array.from(e.touches) as any;
    }
  }, [enabled, onZoom, onPan]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    
    if (e.touches.length < 2) {
      lastDistanceRef.current = 0;
      lastTouchesRef.current = null;
    }
  }, [enabled]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd
  };
}
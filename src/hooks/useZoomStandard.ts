// Standardized zoom behavior for consistent anchor points and interactions

import { useCallback, useRef } from 'react';

interface ZoomConfig {
  minScale: number;
  maxScale: number;
  zoomSpeed: number;
  smoothZoom: boolean;
}

interface ZoomState {
  scale: number;
  centerX: number;
  centerY: number;
}

interface UseZoomStandardOptions {
  config?: Partial<ZoomConfig>;
  onZoomChange: (state: ZoomState) => void;
  getContainerRect: () => DOMRect | null;
}

const DEFAULT_CONFIG: ZoomConfig = {
  minScale: 0.1,
  maxScale: 3,
  zoomSpeed: 1.2,
  smoothZoom: true
};

export function useZoomStandard({
  config = {},
  onZoomChange,
  getContainerRect
}: UseZoomStandardOptions) {
  const zoomConfig = { ...DEFAULT_CONFIG, ...config };
  const animationRef = useRef<number>();

  // Calculate zoom center point (always use current view center for predictable zoom)
  const getZoomCenter = useCallback(() => {
    const rect = getContainerRect();
    if (!rect) return { x: 0, y: 0 };
    
    // Always return the center of the current viewport - this ensures
    // consistent zoom behavior anchored to whatever is currently centered
    return {
      x: rect.width / 2,
      y: rect.height / 2
    };
  }, [getContainerRect]);

  // Smooth zoom transition
  const smoothZoomTo = useCallback((
    currentScale: number,
    targetScale: number,
    centerX: number,
    centerY: number
  ) => {
    if (!zoomConfig.smoothZoom) {
      onZoomChange({ scale: targetScale, centerX, centerY });
      return;
    }

    const startTime = performance.now();
    const duration = 200; // ms
    const startScale = currentScale;
    const scaleChange = targetScale - startScale;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentAnimatedScale = startScale + (scaleChange * easeProgress);

      onZoomChange({
        scale: currentAnimatedScale,
        centerX,
        centerY
      });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(animate);
  }, [onZoomChange, zoomConfig.smoothZoom]);

  // Zoom in by factor
  const zoomIn = useCallback((currentScale: number) => {
    const center = getZoomCenter();
    const newScale = Math.min(currentScale * zoomConfig.zoomSpeed, zoomConfig.maxScale);
    smoothZoomTo(currentScale, newScale, center.x, center.y);
  }, [getZoomCenter, zoomConfig.zoomSpeed, zoomConfig.maxScale, smoothZoomTo]);

  // Zoom out by factor
  const zoomOut = useCallback((currentScale: number) => {
    const center = getZoomCenter();
    const newScale = Math.max(currentScale / zoomConfig.zoomSpeed, zoomConfig.minScale);
    smoothZoomTo(currentScale, newScale, center.x, center.y);
  }, [getZoomCenter, zoomConfig.zoomSpeed, zoomConfig.minScale, smoothZoomTo]);

  // Handle mouse wheel zoom - zoom to center of current view
  const handleWheelZoom = useCallback((
    event: React.WheelEvent,
    currentScale: number
  ) => {
    event.preventDefault();
    
    // Always zoom from the center of the current view for predictable behavior
    const center = getZoomCenter();
    
    const zoomDirection = event.deltaY > 0 ? -1 : 1;
    const zoomFactor = 1 + (zoomDirection * 0.1); // 10% increments
    const newScale = Math.max(
      zoomConfig.minScale,
      Math.min(currentScale * zoomFactor, zoomConfig.maxScale)
    );

    smoothZoomTo(currentScale, newScale, center.x, center.y);
  }, [getZoomCenter, zoomConfig.minScale, zoomConfig.maxScale, smoothZoomTo]);

  // Handle pinch zoom (mobile) - zoom to center of current view
  const handlePinchZoom = useCallback((
    scaleFactor: number,
    currentScale: number,
    gestureCenter?: { x: number; y: number }
  ) => {
    // Always use view center for consistent zoom behavior, ignore gesture center
    const center = getZoomCenter();
    const newScale = Math.max(
      zoomConfig.minScale,
      Math.min(currentScale * scaleFactor, zoomConfig.maxScale)
    );

    // For pinch, apply immediately without smooth animation for responsiveness
    onZoomChange({
      scale: newScale,
      centerX: center.x,
      centerY: center.y
    });
  }, [getZoomCenter, zoomConfig.minScale, zoomConfig.maxScale, onZoomChange]);

  // Zoom to fit content
  const zoomToFit = useCallback((
    contentBounds: { width: number; height: number },
    currentScale: number,
    padding = 50
  ) => {
    const rect = getContainerRect();
    if (!rect) return;

    const scaleX = (rect.width - padding * 2) / contentBounds.width;
    const scaleY = (rect.height - padding * 2) / contentBounds.height;
    const newScale = Math.max(
      zoomConfig.minScale,
      Math.min(Math.min(scaleX, scaleY), zoomConfig.maxScale)
    );

    const center = getZoomCenter();
    smoothZoomTo(currentScale, newScale, center.x, center.y);
  }, [getContainerRect, getZoomCenter, zoomConfig.minScale, zoomConfig.maxScale, smoothZoomTo]);

  // Reset zoom to 1:1
  const resetZoom = useCallback((currentScale: number) => {
    const center = getZoomCenter();
    smoothZoomTo(currentScale, 1, center.x, center.y);
  }, [getZoomCenter, smoothZoomTo]);

  // Cleanup animation on unmount
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  return {
    zoomIn,
    zoomOut,
    handleWheelZoom,
    handlePinchZoom,
    zoomToFit,
    resetZoom,
    cleanup,
    config: zoomConfig
  };
}
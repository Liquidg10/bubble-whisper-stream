// Touch gesture recognition for mobile parallax and multi-select

import { useState, useRef, useCallback, useEffect } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { hapticsService } from '@/services/haptics';
import { useTheme } from '@/hooks/use-theme';

interface TouchGestureState {
  isParallaxMode: boolean;
  isLongPressing: boolean;
  touchStartPos: { x: number; y: number } | null;
  parallaxOffset: { x: number; y: number };
  gestureStartTime: number | null;
}

interface UseTouchGesturesOptions {
  onTap?: () => void;
  onLongPress?: () => void;
  onDragStart?: () => void;
  onDrag?: (offset: { x: number; y: number }) => void;
  onDragEnd?: () => void;
  bubbleId: string;
}

const PARALLAX_DURATION = 700; // 700ms parallax hold
const LONG_PRESS_DURATION = 450; // 450ms for selection
const MOVEMENT_THRESHOLD = 8; // 8px movement cancels long-press
const MAX_PARALLAX_OFFSET = 10; // 10px max parallax movement

export function useTouchGestures({
  onTap,
  onLongPress,
  onDragStart,
  onDrag,
  onDragEnd,
  bubbleId
}: UseTouchGesturesOptions) {
  const { currentTheme } = useTheme();
  const { settings, selectedBubbles, toggleSelection } = useBubbleStore();
  
  const [gestureState, setGestureState] = useState<TouchGestureState>({
    isParallaxMode: false,
    isLongPressing: false,
    touchStartPos: null,
    parallaxOffset: { x: 0, y: 0 },
    gestureStartTime: null,
  });

  const parallaxTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDragRef = useRef(false);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (parallaxTimerRef.current) {
      clearTimeout(parallaxTimerRef.current);
      parallaxTimerRef.current = null;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    const touch = e.touches[0];
    const startPos = { x: touch.clientX, y: touch.clientY };
    const startTime = Date.now();
    
    setGestureState({
      isParallaxMode: false,
      isLongPressing: false,
      touchStartPos: startPos,
      parallaxOffset: { x: 0, y: 0 },
      gestureStartTime: startTime,
    });

    isDragRef.current = false;

    // Start parallax timer (600-800ms)
    if (!settings.reducedMotion && currentTheme.behavior.parallaxEnabled) {
      parallaxTimerRef.current = setTimeout(() => {
        setGestureState(prev => ({ ...prev, isParallaxMode: true }));
      }, PARALLAX_DURATION);
    }

    // Start long-press timer (450ms)
    longPressTimerRef.current = setTimeout(() => {
      if (!isDragRef.current) {
        setGestureState(prev => ({ ...prev, isLongPressing: true }));
        
        // Toggle selection
        toggleSelection(bubbleId);
        
        // Haptic feedback if enabled
        if (currentTheme.behavior.hapticsEnabled && hapticsService.isAvailable()) {
          hapticsService.trigger('medium');
        }
        
        onLongPress?.();
      }
    }, LONG_PRESS_DURATION);
  }, [bubbleId, settings.reducedMotion, currentTheme, toggleSelection, onLongPress]);

  // Handle touch move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!gestureState.touchStartPos) return;

    const touch = e.touches[0];
    const currentPos = { x: touch.clientX, y: touch.clientY };
    const deltaX = currentPos.x - gestureState.touchStartPos.x;
    const deltaY = currentPos.y - gestureState.touchStartPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Cancel long-press if movement exceeds threshold
    if (distance > MOVEMENT_THRESHOLD && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      setGestureState(prev => ({ ...prev, isLongPressing: false }));
    }

    // Quick drag detection - start drag immediately if significant movement
    if (distance > MOVEMENT_THRESHOLD && !isDragRef.current && !gestureState.isLongPressing) {
      isDragRef.current = true;
      clearTimers();
      setGestureState(prev => ({ 
        ...prev, 
        isParallaxMode: false,
        isLongPressing: false 
      }));
      onDragStart?.();
    }

    // Handle parallax mode (light highlight movement)
    if (gestureState.isParallaxMode && !isDragRef.current) {
      const clampedX = Math.max(-MAX_PARALLAX_OFFSET, Math.min(MAX_PARALLAX_OFFSET, deltaX * 0.3));
      const clampedY = Math.max(-MAX_PARALLAX_OFFSET, Math.min(MAX_PARALLAX_OFFSET, deltaY * 0.3));
      
      setGestureState(prev => ({
        ...prev,
        parallaxOffset: { x: clampedX, y: clampedY }
      }));
    }

    // Handle drag mode
    if (isDragRef.current) {
      onDrag?.({ x: deltaX, y: deltaY });
    }
  }, [gestureState, onDragStart, onDrag, clearTimers]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    clearTimers();

    // Handle tap (no drag, no long-press)
    if (!isDragRef.current && !gestureState.isLongPressing && gestureState.touchStartPos) {
      onTap?.();
    }

    // End drag
    if (isDragRef.current) {
      onDragEnd?.();
    }

    // Reset state
    setGestureState({
      isParallaxMode: false,
      isLongPressing: false,
      touchStartPos: null,
      parallaxOffset: { x: 0, y: 0 },
      gestureStartTime: null,
    });

    isDragRef.current = false;
  }, [gestureState, onTap, onDragEnd, clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  return {
    gestureState,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd, // Same as touch end
    },
    isSelected: selectedBubbles.has(bubbleId),
  };
}
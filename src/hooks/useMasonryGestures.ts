/**
 * Enhanced Masonry Gestures Hook
 * Combines pinch-zoom, touch gestures, and mobile performance optimizations
 */

import { useCallback, useRef, useEffect } from 'react';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { useTouchGestures } from '@/hooks/useTouchGestures';
import { useMobileCalendarPerformance } from './useMobileCalendarPerformance';
import { TaskId } from '@/types/task';

interface MasonryGestureOptions {
  onCardSelect?: (taskId: TaskId) => void;
  onCardMove?: (taskId: TaskId, direction: 'left' | 'right' | 'up' | 'down') => void;
  onCardLongPress?: (taskId: TaskId) => void;
  onZoom?: (scale: number, center: { x: number; y: number }) => void;
  onPan?: (delta: { x: number; y: number }) => void;
  minZoom?: number;
  maxZoom?: number;
}

export function useMasonryGestures({
  onCardSelect,
  onCardMove,
  onCardLongPress,
  onZoom,
  onPan,
  minZoom = 0.5,
  maxZoom = 2.0,
}: MasonryGestureOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { 
    isMobile, 
    debouncedGesture, 
    triggerHaptic, 
    adaptiveConfig,
    lodLevel 
  } = useMobileCalendarPerformance();
  
  const currentTaskId = useRef<TaskId | null>(null);
  const panThreshold = useRef(10); // px
  const longPressThreshold = useRef(500); // ms

  // Adjust thresholds based on performance
  useEffect(() => {
    if (lodLevel === 'minimal' || lodLevel === 'low') {
      panThreshold.current = 15; // More threshold for low performance
      longPressThreshold.current = 600;
    } else {
      panThreshold.current = 10;
      longPressThreshold.current = 500;
    }
  }, [lodLevel]);

  // Pinch-zoom for container
  const pinchZoom = usePinchZoom({
    enabled: isMobile,
    onZoom: (scale, center) => {
      if (adaptiveConfig.enableTransitions) {
        onZoom?.(scale, center);
      }
    },
    onPan: (delta) => {
      if (adaptiveConfig.enableTransitions) {
        onPan?.(delta);
      }
    },
    minScale: minZoom,
    maxScale: maxZoom,
  });

  // Create a ref to track the current task being touched
  const touchHandlerRef = useRef<{
    onTap: () => void;
    onLongPress: () => void;
    onDrag: (delta: { x: number; y: number }) => void;
  } | null>(null);

  // Create touch handlers for a specific task
  const createTouchHandlers = useCallback((taskId: TaskId) => {
    return {
      onTap: () => {
        debouncedGesture('card-tap', () => {
          triggerHaptic('light');
          onCardSelect?.(taskId);
        });
      },
      onLongPress: () => {
        debouncedGesture('card-long-press', () => {
          triggerHaptic('medium');
          onCardLongPress?.(taskId);
        });
      },
      onDrag: (delta: { x: number; y: number }) => {
        if (!isMobile) return;
        
        const absX = Math.abs(delta.x);
        const absY = Math.abs(delta.y);
        
        // Only trigger movement if above threshold
        if (absX > panThreshold.current || absY > panThreshold.current) {
          debouncedGesture('card-drag', () => {
            let direction: 'left' | 'right' | 'up' | 'down';
            
            if (absX > absY) {
              direction = delta.x > 0 ? 'right' : 'left';
            } else {
              direction = delta.y > 0 ? 'down' : 'up';
            }
            
            triggerHaptic('light');
            onCardMove?.(taskId, direction);
          });
        }
      },
    };
  }, [debouncedGesture, triggerHaptic, onCardSelect, onCardLongPress, onCardMove, isMobile]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!currentTaskId.current) return;

    // Respect reduced motion preferences
    const motionAllowed = !document.documentElement.classList.contains('reduce-motion');
    
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (motionAllowed) {
          triggerHaptic('light');
          onCardMove?.(currentTaskId.current, 'left');
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (motionAllowed) {
          triggerHaptic('light');
          onCardMove?.(currentTaskId.current, 'right');
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (motionAllowed) {
          triggerHaptic('light');
          onCardMove?.(currentTaskId.current, 'up');
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (motionAllowed) {
          triggerHaptic('light');
          onCardMove?.(currentTaskId.current, 'down');
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        triggerHaptic('medium');
        onCardLongPress?.(currentTaskId.current);
        break;
      case 'Escape':
        e.preventDefault();
        currentTaskId.current = null;
        break;
    }
  }, [onCardMove, onCardLongPress, triggerHaptic]);

  // Focus management for accessibility
  const setFocusedCard = useCallback((taskId: TaskId | null) => {
    currentTaskId.current = taskId;
  }, []);

  // Get gesture event handlers for container
  const getContainerProps = useCallback(() => ({
    ref: containerRef,
    onKeyDown: handleKeyDown,
    tabIndex: 0,
    role: 'application',
    'aria-label': 'Masonry task board with gesture support',
    ...pinchZoom,
  }), [handleKeyDown, pinchZoom]);

  // Get gesture event handlers for individual cards
  const getCardProps = useCallback((taskId: TaskId) => {
    const handlers = createTouchHandlers(taskId);
    
    return {
      onTouchStart: (e: React.TouchEvent) => {
        touchHandlerRef.current = handlers;
      },
      onTouchEnd: () => {
        touchHandlerRef.current?.onTap();
        touchHandlerRef.current = null;
      },
      onFocus: () => setFocusedCard(taskId),
      onBlur: () => setFocusedCard(null),
      tabIndex: 0,
      role: 'button',
      'aria-pressed': currentTaskId.current === taskId,
    };
  }, [createTouchHandlers, setFocusedCard]);

  // Accessibility helpers
  const getAccessibilityProps = useCallback(() => ({
    // Minimum target size compliance
    minTargetSize: '44px',
    touchAction: isMobile ? 'manipulation' : 'auto',
    // Reduce motion compliance
    'data-reduce-motion': !adaptiveConfig.enableTransitions,
  }), [isMobile, adaptiveConfig.enableTransitions]);

  return {
    // Gesture handlers
    getContainerProps,
    getCardProps,
    getAccessibilityProps,
    
    // State
    focusedTaskId: currentTaskId.current,
    isGestureEnabled: isMobile,
    
    // Utilities
    setFocusedCard,
    triggerHaptic,
    
    // Performance info
    performanceLevel: lodLevel,
    adaptiveConfig,
    
    // Manual gesture triggers (for testing)
    triggerZoom: (scale: number, center?: { x: number; y: number }) => {
      onZoom?.(scale, center || { x: 0, y: 0 });
    },
    triggerPan: (delta: { x: number; y: number }) => {
      onPan?.(delta);
    },
  };
}
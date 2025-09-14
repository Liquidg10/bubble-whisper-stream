/**
 * Mobile Calendar Performance Hook
 * Integrates MobilePerformanceManager with calendar views for adaptive performance
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { mobilePerformanceManager } from '@/services/mobilePerformanceManager';
import { useIsMobile } from '@/hooks/use-mobile';

interface CalendarPerformanceState {
  currentFPS: number;
  lodLevel: 'high' | 'medium' | 'low' | 'minimal';
  isLowPower: boolean;
  memoryPressure: boolean;
  gestureLatency: number;
  adaptiveConfig: {
    enableShadows: boolean;
    enableTransitions: boolean;
    useSimpleBorders: boolean;
    maxVisibleItems: number;
    useVirtualScrolling: boolean;
    enableHaptics: boolean;
  };
}

export function useMobileCalendarPerformance() {
  const isMobile = useIsMobile();
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const animationFrame = useRef<number>();
  
  const [performanceState, setPerformanceState] = useState<CalendarPerformanceState>({
    currentFPS: 60,
    lodLevel: 'high',
    isLowPower: false,
    memoryPressure: false,
    gestureLatency: 0,
    adaptiveConfig: {
      enableShadows: true,
      enableTransitions: true,
      useSimpleBorders: false,
      maxVisibleItems: 100,
      useVirtualScrolling: false,
      enableHaptics: true,
    }
  });

  // FPS measurement using requestAnimationFrame
  const measureFPS = useCallback(() => {
    const now = performance.now();
    frameCount.current++;
    
    if (now - lastTime.current >= 1000) {
      const fps = Math.round((frameCount.current * 1000) / (now - lastTime.current));
      frameCount.current = 0;
      lastTime.current = now;
      
      // Update LOD based on FPS
      let lodLevel: CalendarPerformanceState['lodLevel'] = 'high';
      if (fps < 30) lodLevel = 'minimal';
      else if (fps < 45) lodLevel = 'low';
      else if (fps < 55) lodLevel = 'medium';
      
      setPerformanceState(prev => ({
        ...prev,
        currentFPS: fps,
        lodLevel,
        adaptiveConfig: {
          ...prev.adaptiveConfig,
          enableShadows: fps >= 55,
          enableTransitions: fps >= 45,
          useSimpleBorders: fps < 55,
          maxVisibleItems: fps < 30 ? 20 : fps < 45 ? 50 : 100,
          useVirtualScrolling: fps < 45,
        }
      }));
    }
    
    animationFrame.current = requestAnimationFrame(measureFPS);
  }, []);

  // Initialize mobile performance optimizations
  useEffect(() => {
    if (isMobile) {
      // Configure mobile performance manager
      mobilePerformanceManager.updateConfig({
        gestureDebounceMs: 16,
        virtualScrollThreshold: 50,
        lowPowerMode: false,
        hapticFeedback: true,
        maxConcurrentAnimations: 3,
      });

      // Start FPS monitoring
      measureFPS();
      
      // Monitor mobile-specific performance
      const checkMobilePerformance = () => {
        const status = mobilePerformanceManager.getPerformanceStatus();
        const mobileConfig = mobilePerformanceManager.getMobileLODConfig();
        
        setPerformanceState(prev => ({
          ...prev,
          isLowPower: false, // Will be updated by mobile performance manager
          memoryPressure: status.memoryUsage > 0.8,
          gestureLatency: 0, // Will be updated by mobile performance manager
          adaptiveConfig: {
            ...prev.adaptiveConfig,
            enableHaptics: true,
            maxVisibleItems: mobileConfig.maxVisibleBubbles,
          }
        }));
      };

      const interval = setInterval(checkMobilePerformance, 2000);
      
      return () => {
        clearInterval(interval);
        if (animationFrame.current) {
          cancelAnimationFrame(animationFrame.current);
        }
      };
    }
  }, [isMobile, measureFPS]);

  // Debounced gesture handler
  const debouncedGesture = useCallback((gestureType: string, callback: () => void) => {
    if (isMobile) {
      return mobilePerformanceManager.debounceGesture(gestureType, callback);
    }
    callback();
  }, [isMobile]);

  // Trigger haptic feedback
  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'heavy' = 'light') => {
    if (isMobile && performanceState.adaptiveConfig.enableHaptics) {
      mobilePerformanceManager.triggerHapticFeedback(type);
    }
  }, [isMobile, performanceState.adaptiveConfig.enableHaptics]);

  // Check if animation can start
  const canStartAnimation = useCallback(() => {
    if (!isMobile) return true;
    return mobilePerformanceManager.canStartAnimation('calendar-animation');
  }, [isMobile]);

  // Start animation with tracking
  const startAnimation = useCallback((animationId: string) => {
    if (isMobile && canStartAnimation()) {
      mobilePerformanceManager.startAnimation(animationId);
      return true;
    }
    return false;
  }, [isMobile, canStartAnimation]);

  // End animation tracking
  const endAnimation = useCallback((animationId: string) => {
    if (isMobile) {
      mobilePerformanceManager.endAnimation(animationId);
    }
  }, [isMobile]);

  return {
    // Performance state
    ...performanceState,
    isMobile,
    
    // Helper functions
    debouncedGesture,
    triggerHaptic,
    canStartAnimation,
    startAnimation,
    endAnimation,
    
    // Get adaptive styles
    getAdaptiveStyles: () => ({
      boxShadow: performanceState.adaptiveConfig.enableShadows ? undefined : 'none',
      transition: performanceState.adaptiveConfig.enableTransitions ? undefined : 'none',
      border: performanceState.adaptiveConfig.useSimpleBorders ? '1px solid hsl(var(--border))' : undefined,
    }),
    
    // Performance status
    getPerformanceStatus: () => ({
      fps: performanceState.currentFPS,
      level: performanceState.lodLevel,
      isOptimal: performanceState.currentFPS >= 55,
      needsOptimization: performanceState.currentFPS < 45,
      recommendation: performanceState.currentFPS < 30 
        ? 'Critical: Reduce visual effects' 
        : performanceState.currentFPS < 45 
        ? 'Consider reducing animations' 
        : 'Performance is good',
    }),
  };
}
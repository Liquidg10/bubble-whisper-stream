/**
 * Performance Level of Detail (LOD) System
 * Optimizes rendering for smooth mobile interactions
 */

import { useCallback, useRef, useEffect } from 'react';
import { useTheme } from '@/themes/provider';

export interface LODConfig {
  // Visual effect toggles based on performance level
  enableSpecular: boolean;
  enableRefraction: boolean; 
  enableParallax: boolean;
  enableGlow: boolean;
  enableBlur: boolean;
  enableFloatAnimation: boolean;
  
  // Performance thresholds
  maxVisibleBubbles: number;
  useSimplifiedShadows: boolean;
  reducedMotion: boolean;
}

export type LODLevel = 'high' | 'medium' | 'low' | 'minimal';

// LOD configurations for different performance levels
const LOD_CONFIGS: Record<LODLevel, LODConfig> = {
  high: {
    enableSpecular: true,
    enableRefraction: true,
    enableParallax: true,
    enableGlow: true,
    enableBlur: true,
    enableFloatAnimation: true,
    maxVisibleBubbles: 100,
    useSimplifiedShadows: false,
    reducedMotion: false,
  },
  medium: {
    enableSpecular: true,
    enableRefraction: false,
    enableParallax: true,
    enableGlow: true,
    enableBlur: true,
    enableFloatAnimation: true,
    maxVisibleBubbles: 75,
    useSimplifiedShadows: false,
    reducedMotion: false,
  },
  low: {
    enableSpecular: false,
    enableRefraction: false,
    enableParallax: false,
    enableGlow: false,
    enableBlur: false,
    enableFloatAnimation: true,
    maxVisibleBubbles: 50,
    useSimplifiedShadows: true,
    reducedMotion: false,
  },
  minimal: {
    enableSpecular: false,
    enableRefraction: false,
    enableParallax: false,
    enableGlow: false,
    enableBlur: false,
    enableFloatAnimation: false,
    maxVisibleBubbles: 25,
    useSimplifiedShadows: true,
    reducedMotion: true,
  }
};

export interface PerformanceState {
  isDragging: boolean;
  isMultiSelecting: boolean;
  dragCount: number;
  lastFrameTime: number;
  averageFPS: number;
  isLowPerformanceDevice: boolean;
}

export function useLODSystem() {
  const { currentTheme } = useTheme();
  const performanceRef = useRef<PerformanceState>({
    isDragging: false,
    isMultiSelecting: false,
    dragCount: 0,
    lastFrameTime: performance.now(),
    averageFPS: 60,
    isLowPerformanceDevice: false,
  });

  const frameTimesRef = useRef<number[]>([]);
  const rafIdRef = useRef<number>();

  // Detect device performance capability
  const detectDevicePerformance = useCallback(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    
    if (!gl) {
      performanceRef.current.isLowPerformanceDevice = true;
      return;
    }

    // Check for mobile/low-end indicators
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const renderer = gl.getParameter(gl.RENDERER) || '';
    const isLowEndGPU = /Adreno [123]|Mali-[1-4]|PowerVR SGX/i.test(renderer);
    
    performanceRef.current.isLowPerformanceDevice = isMobile || isLowEndGPU;
  }, []);

  // FPS monitoring with RAF
  const measureFPS = useCallback(() => {
    const now = performance.now();
    const frameTime = now - performanceRef.current.lastFrameTime;
    performanceRef.current.lastFrameTime = now;

    // Maintain rolling average of last 60 frames
    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }

    // Calculate FPS
    const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
    performanceRef.current.averageFPS = 1000 / avgFrameTime;

    rafIdRef.current = requestAnimationFrame(measureFPS);
  }, []);

  // Start/stop performance monitoring
  useEffect(() => {
    detectDevicePerformance();
    measureFPS();

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [detectDevicePerformance, measureFPS]);

  // Get current LOD level based on interaction state and performance
  const getCurrentLODLevel = useCallback((): LODLevel => {
    const state = performanceRef.current;
    
    // Force minimal if low detail mode is enabled
    if (currentTheme.behavior.lowDetailMode) {
      return 'minimal';
    }

    // During interaction, reduce detail level
    if (state.isDragging) {
      if (state.isMultiSelecting || state.dragCount > 1) {
        return state.isLowPerformanceDevice ? 'minimal' : 'low';
      }
      return state.isLowPerformanceDevice ? 'low' : 'medium';
    }

    // Adaptive LOD based on FPS performance
    if (state.averageFPS < 30) {
      return 'minimal';
    } else if (state.averageFPS < 45) {
      return 'low';
    } else if (state.averageFPS < 55) {
      return 'medium';
    }

    return 'high';
  }, [currentTheme]);

  // Update interaction state
  const setDragState = useCallback((isDragging: boolean, dragCount: number = 1) => {
    performanceRef.current.isDragging = isDragging;
    performanceRef.current.dragCount = dragCount;
  }, []);

  const setMultiSelectState = useCallback((isMultiSelecting: boolean) => {
    performanceRef.current.isMultiSelecting = isMultiSelecting;
  }, []);

  // Get current LOD configuration
  const getLODConfig = useCallback((): LODConfig => {
    const level = getCurrentLODLevel();
    return {
      ...LOD_CONFIGS[level],
      // Override with theme behavior flags
      enableBlur: LOD_CONFIGS[level].enableBlur && currentTheme.behavior.enableBlur,
      enableGlow: LOD_CONFIGS[level].enableGlow && currentTheme.behavior.enableGlow,
      enableParallax: LOD_CONFIGS[level].enableParallax && currentTheme.behavior.parallaxEnabled,
      maxVisibleBubbles: Math.min(
        LOD_CONFIGS[level].maxVisibleBubbles,
        currentTheme.behavior.maxVisibleBubbles
      ),
      reducedMotion: LOD_CONFIGS[level].reducedMotion || 
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  }, [getCurrentLODLevel, currentTheme]);

  return {
    getLODConfig,
    setDragState,
    setMultiSelectState,
    getCurrentLODLevel,
    getPerformanceMetrics: () => ({ ...performanceRef.current }),
  };
}
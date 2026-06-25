// Explicit float motion control that respects Reduced Motion and user preferences

import { useCallback, useEffect, useRef, useState } from 'react';

interface FloatMotionConfig {
  amplitude: number;
  frequency: number;
  respectReducedMotion: boolean;
}

interface UseFloatMotionOptions {
  config?: Partial<FloatMotionConfig>;
  enabled?: boolean;
}

const DEFAULT_CONFIG: FloatMotionConfig = {
  amplitude: 2, // pixels
  frequency: 0.001, // very subtle movement
  respectReducedMotion: true
};

export function useFloatMotion({
  config = {},
  enabled = true
}: UseFloatMotionOptions = {}) {
  const motionConfig = { ...DEFAULT_CONFIG, ...config };
  const [isFloating, setIsFloating] = useState(enabled);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>();
  
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Calculate if motion should actually run
  const shouldFloat = isFloating && 
    (!motionConfig.respectReducedMotion || !prefersReducedMotion);

  const startFloat = useCallback(() => {
    if (!shouldFloat) return;
    
    startTimeRef.current = performance.now();
    
    const animate = (currentTime: number) => {
      if (!startTimeRef.current) return;
      
      const elapsed = currentTime - startTimeRef.current;
      const offset = Math.sin(elapsed * motionConfig.frequency) * motionConfig.amplitude;
      
      // Apply transform to elements with float-motion class
      const elements = document.querySelectorAll('.float-motion');
      elements.forEach((element) => {
        const htmlElement = element as HTMLElement;
        htmlElement.style.setProperty('--float-y', `${offset}px`);
      });
      
      if (shouldFloat) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  }, [shouldFloat, motionConfig.amplitude, motionConfig.frequency]);

  const stopFloat = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    
    // Reset transforms
    const elements = document.querySelectorAll('.float-motion');
    elements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      htmlElement.style.transform = 'translateY(0px)';
    });
  }, []);

  const toggleFloat = useCallback(() => {
    setIsFloating(prev => !prev);
  }, []);

  // Start/stop animation based on shouldFloat
  useEffect(() => {
    if (shouldFloat) {
      startFloat();
    } else {
      stopFloat();
    }
    
    return stopFloat;
  }, [shouldFloat, startFloat, stopFloat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return {
    isFloating: shouldFloat,
    toggleFloat,
    setFloating: setIsFloating,
    prefersReducedMotion
  };
}
import { useRef, useCallback } from 'react';

interface AnimationState {
  angle: number;
  phase: number;
  lastUpdate: number;
}

/**
 * Hook for maintaining stable animation states during position updates
 */
export function useAnimationStability() {
  const animationStates = useRef<Map<string, AnimationState>>(new Map());
  const updateRate = useRef<Map<string, number>>(new Map());
  
  const MAX_UPDATES_PER_SECOND = 10;
  
  const preserveAnimationState = useCallback((id: string, angle: number, phase: number) => {
    animationStates.current.set(id, {
      angle,
      phase,
      lastUpdate: Date.now()
    });
  }, []);
  
  const getStableAnimationState = useCallback((id: string, defaultAngle: number, defaultPhase: number) => {
    const existing = animationStates.current.get(id);
    
    // Rate limiting - don't update too frequently
    const now = Date.now();
    const lastRate = updateRate.current.get(id) || 0;
    
    if (now - lastRate < 1000 / MAX_UPDATES_PER_SECOND) {
      return existing || { angle: defaultAngle, phase: defaultPhase };
    }
    
    updateRate.current.set(id, now);
    
    if (existing && now - existing.lastUpdate < 5000) { // 5 second timeout
      return existing;
    }
    
    // Create new state if none exists or expired
    const newState = { angle: defaultAngle, phase: defaultPhase };
    preserveAnimationState(id, defaultAngle, defaultPhase);
    return newState;
  }, [preserveAnimationState]);
  
  const clearAnimationState = useCallback((id: string) => {
    animationStates.current.delete(id);
    updateRate.current.delete(id);
  }, []);
  
  return {
    preserveAnimationState,
    getStableAnimationState,
    clearAnimationState
  };
}
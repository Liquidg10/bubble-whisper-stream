import { useCallback, useRef } from 'react';

interface PositionUpdate {
  id: string;
  x: number;
  y: number;
  timestamp: number;
}

/**
 * Hook for stable positioning that prevents rapid position updates and oscillations
 */
export function useStablePositioning() {
  const updateQueue = useRef<Map<string, PositionUpdate>>(new Map());
  const isLocked = useRef<Set<string>>(new Set());
  const updateTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const DEBOUNCE_MS = 100;
  const POSITION_TOLERANCE = 2; // pixels

  const lockPosition = useCallback((id: string) => {
    isLocked.current.add(id);
  }, []);

  const unlockPosition = useCallback((id: string) => {
    isLocked.current.delete(id);
  }, []);

  const isPositionLocked = useCallback((id: string) => {
    return isLocked.current.has(id);
  }, []);

  const shouldUpdatePosition = useCallback((id: string, x: number, y: number) => {
    const lastUpdate = updateQueue.current.get(id);
    if (!lastUpdate) return true;

    // Check if position change is significant enough
    const dx = Math.abs(lastUpdate.x - x);
    const dy = Math.abs(lastUpdate.y - y);
    
    return dx > POSITION_TOLERANCE || dy > POSITION_TOLERANCE;
  }, []);

  const debouncedPositionUpdate = useCallback((
    id: string, 
    x: number, 
    y: number, 
    updateFn: (id: string, x: number, y: number) => Promise<void>
  ) => {
    // Don't update if position is locked or change is too small
    if (isLocked.current.has(id) || !shouldUpdatePosition(id, x, y)) {
      return;
    }

    // Clear existing timeout
    const existingTimeout = updateTimeouts.current.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      try {
        await updateFn(id, x, y);
        updateQueue.current.set(id, { id, x, y, timestamp: Date.now() });
      } catch (error) {
        console.warn(`Position update failed for ${id}:`, error);
      } finally {
        updateTimeouts.current.delete(id);
      }
    }, DEBOUNCE_MS);

    updateTimeouts.current.set(id, timeout);
  }, [shouldUpdatePosition]);

  const clearPositionHistory = useCallback((id: string) => {
    updateQueue.current.delete(id);
    const timeout = updateTimeouts.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      updateTimeouts.current.delete(id);
    }
  }, []);

  return {
    lockPosition,
    unlockPosition,
    isPositionLocked,
    debouncedPositionUpdate,
    clearPositionHistory
  };
}
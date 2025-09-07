import { useCallback } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { logger } from '@/utils/logger';
import { useStablePositioning } from './useStablePositioning';

/**
 * Hook for persisting molecule positions by updating bubble coordinates
 */
export function useMoleculePositionPersistence() {
  const { updateBubble } = useBubbleStore();
  const { debouncedPositionUpdate, lockPosition, unlockPosition, isPositionLocked } = useStablePositioning();

  const updateBubblePosition = useCallback(async (bubbleId: string, x: number, y: number) => {
    // Use debounced update to prevent rapid position changes
    debouncedPositionUpdate(bubbleId, x, y, async (id, newX, newY) => {
      try {
        const { bubbles } = useBubbleStore.getState();
        const bubble = bubbles.find(b => b.id === id);
        if (bubble) {
          await updateBubble({ ...bubble, x: newX, y: newY });
          logger.debug(`Updated bubble position`, { bubbleId: id, x: newX, y: newY });
        }
      } catch (error) {
        logger.error(`Failed to update bubble position`, { bubbleId: id, x: newX, y: newY, error });
      }
    });
  }, [updateBubble, debouncedPositionUpdate]);

  const updateDomainBubblesPosition = useCallback(async (domainBubbles: any[], x: number, y: number) => {
    try {
      // Update the representative bubble (first one) with the new position
      if (domainBubbles.length > 0) {
        const representativeBubble = domainBubbles[0];
        const originalBubble = representativeBubble.originalBubble;
        if (originalBubble) {
          await updateBubble({ ...originalBubble, x, y });
          
          // Safe tags filtering with type checking
          const tags = originalBubble.tags || [];
          const domainTag = tags.find(t => typeof t === 'string' && t.startsWith('domain:'));
          const domain = domainTag && typeof domainTag === 'string' ? domainTag.replace('domain:', '') : 'unknown';
          
          logger.debug(`Updated domain representative bubble position`, { 
            bubbleId: originalBubble.id, 
            domain,
            x, 
            y 
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to update domain bubbles position`, { x, y, error });
    }
  }, [updateBubble]);

  return {
    updateBubblePosition,
    updateDomainBubblesPosition,
    lockPosition,
    unlockPosition,
    isPositionLocked
  };
}
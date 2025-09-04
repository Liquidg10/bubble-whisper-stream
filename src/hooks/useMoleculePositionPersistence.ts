import { useCallback } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { logger } from '@/utils/logger';

/**
 * Hook for persisting molecule positions by updating bubble coordinates
 */
export function useMoleculePositionPersistence() {
  const { updateBubble } = useBubbleStore();

  const updateBubblePosition = useCallback(async (bubbleId: string, x: number, y: number) => {
    try {
      const { bubbles } = useBubbleStore.getState();
      const bubble = bubbles.find(b => b.id === bubbleId);
      if (bubble) {
        await updateBubble({ ...bubble, x, y });
        logger.debug(`Updated bubble position`, { bubbleId, x, y });
      }
    } catch (error) {
      logger.error(`Failed to update bubble position`, { bubbleId, x, y, error });
    }
  }, [updateBubble]);

  const updateDomainBubblesPosition = useCallback(async (domainBubbles: any[], x: number, y: number) => {
    try {
      // Update the representative bubble (first one) with the new position
      if (domainBubbles.length > 0) {
        const representativeBubble = domainBubbles[0];
        const originalBubble = representativeBubble.originalBubble;
        if (originalBubble) {
          await updateBubble({ ...originalBubble, x, y });
          logger.debug(`Updated domain representative bubble position`, { 
            bubbleId: originalBubble.id, 
            domain: originalBubble.tags?.find(t => t.startsWith('domain:'))?.replace('domain:', ''),
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
    updateDomainBubblesPosition
  };
}
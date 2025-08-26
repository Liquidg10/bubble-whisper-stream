import { TimeHorizon, TIME_HORIZON_ARRAY } from '@/types/atomic';
import { generateId, getTimeHorizonEmoji, ringIndexToTimeHorizon } from '@/utils/atomicHelpers';
import { getBubbleStoreState } from './store';
import { logger } from '@/utils/logger';

export function updateTimeHorizon(moleculeId: string, fromRing: number, toRing: number) {
  const { bubbles, updateBubble } = getBubbleStoreState();
  const newTimeHorizon = ringIndexToTimeHorizon(toRing);

  const bubble = bubbles.find(b => `mol-${b.id}` === moleculeId);
  if (!bubble) {
    logger.warn(`Bubble not found for molecule ID: ${moleculeId}`);
    return;
  }

  // Remove existing time horizon tags
  const updatedTags = bubble.tags?.filter(tag =>
    !TIME_HORIZON_ARRAY.includes(tag.name.toLowerCase() as TimeHorizon)
  ) || [];

  // Add new time horizon tag
  updatedTags.push({
    id: generateId(),
    name: newTimeHorizon,
    emoji: getTimeHorizonEmoji(newTimeHorizon)
  });

  updateBubble({ ...bubble, tags: updatedTags });
  logger.atomic(`Time horizon updated: ${bubble.content} moved to ${newTimeHorizon}`, {
    moleculeId,
    fromRing,
    toRing,
    newTimeHorizon
  });
}

/**
 * Canonical time horizon management for bubbles
 * Used across all views (Bubble, Atomic, Timeline, etc.)
 */

import type { Bubble } from '@/types/bubble';
import { crossViewUndoService } from '@/services/crossViewUndoService';
import { devLog } from '@/devtools/devLog';

export type Horizon = 'today' | 'week' | 'later';

/**
 * Get the time horizon from a bubble's tags
 */
export function getHorizon(bubble: Bubble): Horizon | null {
  if (!bubble.tags) return null;
  
  for (const tag of bubble.tags) {
    const tagName = tag.name.toLowerCase();
    if (tagName === 'today' || tagName === 'week' || tagName === 'later') {
      return tagName as Horizon;
    }
  }
  
  return null;
}

/**
 * Set the time horizon for a bubble by updating its tags
 */
export function setHorizon(bubble: Bubble, horizon: Horizon): Bubble {
  const existingTags = bubble.tags || [];
  
  // Remove existing horizon tags
  const filteredTags = existingTags.filter(tag => {
    const tagName = tag.name.toLowerCase();
    return tagName !== 'today' && tagName !== 'week' && tagName !== 'later';
  });
  
  // Add new horizon tag
  const newTag = {
    id: crypto.randomUUID(),
    name: horizon,
    emoji: getHorizonEmoji(horizon)
  };
  
  const updatedBubble = {
    ...bubble,
    tags: [...filteredTags, newTag],
    updatedAt: Date.now()
  };
  
  devLog('setHorizon', {
    bubbleId: bubble.id,
    horizon,
    previousHorizon: getHorizon(bubble),
    tagCount: updatedBubble.tags.length
  });
  
  return updatedBubble;
}

/**
 * Get emoji for a horizon
 */
export function getHorizonEmoji(horizon: Horizon): string {
  const emojiMap: Record<Horizon, string> = {
    today: '🔥',
    week: '📅', 
    later: '🌙'
  };
  
  return emojiMap[horizon];
}

/**
 * Get display name for a horizon
 */
export function getHorizonDisplayName(horizon: Horizon): string {
  const nameMap: Record<Horizon, string> = {
    today: 'Today',
    week: 'Week',
    later: 'Later'
  };
  
  return nameMap[horizon];
}

/**
 * Convert horizon to ring index for atomic view compatibility
 */
export function horizonToRingIndex(horizon: Horizon): number {
  const indexMap: Record<Horizon, number> = {
    today: 0,
    week: 1,
    later: 2
  };
  
  return indexMap[horizon];
}

/**
 * Convert ring index to horizon for atomic view compatibility  
 */
export function ringIndexToHorizon(ringIndex: number): Horizon {
  const horizons: Horizon[] = ['today', 'week', 'later'];
  return horizons[ringIndex] || 'today';
}

/**
 * Move a bubble to a different time horizon with undo support
 * This should be used by store implementations
 */
export function createHorizonMoveEntry(bubbleId: string, fromHorizon: Horizon | null, toHorizon: Horizon, view: 'bubble' | 'atomic') {
  const description = fromHorizon 
    ? `Moved from ${getHorizonDisplayName(fromHorizon)} to ${getHorizonDisplayName(toHorizon)}`
    : `Set horizon to ${getHorizonDisplayName(toHorizon)}`;
    
  return {
    view,
    type: 'drag' as const,
    data: {
      bubbleId,
      fromHorizon,
      toHorizon
    },
    description
  };
}

/**
 * Get all available horizons
 */
export function getAllHorizons(): Horizon[] {
  return ['today', 'week', 'later'];
}
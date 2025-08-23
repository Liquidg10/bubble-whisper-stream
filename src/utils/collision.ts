/**
 * Collision Detection Utilities for Bubble Merging
 * Calculates overlap based on theme merge thresholds
 */

import type { Bubble } from '@/types/bubble';
import type { ThemeBehaviorFlags } from '@/themes/ThemeTypes';

export interface CollisionResult {
  isOverlapping: boolean;
  distance: number;
  overlapPercentage: number;
}

/**
 * Calculate the distance between two bubble centers
 */
export function calculateDistance(
  bubble1: { x: number; y: number },
  bubble2: { x: number; y: number }
): number {
  const dx = bubble1.x - bubble2.x;
  const dy = bubble1.y - bubble2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get bubble visual radius based on size
 */
export function getBubbleRadius(bubble: Bubble): number {
  // Size is a number between 0 and 1, map to visual radius
  const normalizedSize = bubble.size || 0.5;
  return 24 + (normalizedSize * 56); // 24px to 80px range
}

/**
 * Check if two bubbles are overlapping based on merge threshold
 */
export function checkBubblesOverlapping(
  bubble1: Bubble,
  bubble2: Bubble,
  mergeThreshold: number
): CollisionResult {
  const distance = calculateDistance(bubble1, bubble2);
  const radius1 = getBubbleRadius(bubble1);
  const radius2 = getBubbleRadius(bubble2);
  
  // Calculate the threshold distance (combined radii with percentage adjustment)
  const combinedRadii = radius1 + radius2;
  const thresholdDistance = combinedRadii * (mergeThreshold / 100);
  
  const isOverlapping = distance < thresholdDistance;
  const overlapPercentage = Math.max(0, (thresholdDistance - distance) / combinedRadii * 100);
  
  return {
    isOverlapping,
    distance,
    overlapPercentage
  };
}

/**
 * Find merge candidates from a list of bubbles
 */
export function findMergeCandidates(
  bubbles: Bubble[],
  behavior: ThemeBehaviorFlags
): { bubble1: Bubble; bubble2: Bubble } | null {
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      const result = checkBubblesOverlapping(bubbles[i], bubbles[j], behavior.mergeThreshold);
      if (result.isOverlapping) {
        return { bubble1: bubbles[i], bubble2: bubbles[j] };
      }
    }
  }
  return null;
}

/**
 * Calculate the midpoint between two bubbles for popover positioning
 */
export function calculateMidpoint(
  bubble1: { x: number; y: number },
  bubble2: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: (bubble1.x + bubble2.x) / 2,
    y: (bubble1.y + bubble2.y) / 2
  };
}
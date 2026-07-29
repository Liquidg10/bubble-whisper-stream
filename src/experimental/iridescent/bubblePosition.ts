import type { Bubble } from '@/types/bubble';

export const MINIMUM_BUBBLE_RADIUS = 22;
export const MAXIMUM_BUBBLE_SIZE = 1;

interface ViewportDimensions {
  width: number;
  height: number;
}

interface RecoveredBubblePosition {
  x: number;
  y: number;
  adjusted: boolean;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function positiveFiniteOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getSafeBubbleRadius(size: number, scale = 1): number {
  const safeSize = Math.min(positiveFiniteOrZero(size), MAXIMUM_BUBBLE_SIZE);
  const safeScale = positiveFiniteOrZero(scale) || 1;
  return Math.max(MINIMUM_BUBBLE_RADIUS, safeSize * 50 * safeScale);
}

function clamp(value: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * Recover viewport-agnostic Bubble coordinates for the default centered
 * viewport. Persisted positions may outlive a resize or orientation change,
 * and older records can contain non-finite values at runtime despite the
 * TypeScript contract.
 */
export function recoverPersistedBubblePosition(
  bubble: Pick<Bubble, 'x' | 'y' | 'size'>,
  viewport: ViewportDimensions,
): RecoveredBubblePosition {
  const width = positiveFiniteOrZero(viewport.width);
  const height = positiveFiniteOrZero(viewport.height);
  const radius = getSafeBubbleRadius(bubble.size);
  const xLimit = Math.max(0, (width / 2) - radius);
  const yLimit = Math.max(0, (height / 2) - radius);
  const finiteX = finiteOrZero(bubble.x);
  const finiteY = finiteOrZero(bubble.y);
  const x = clamp(finiteX, xLimit);
  const y = clamp(finiteY, yLimit);

  return {
    x,
    y,
    adjusted: !Number.isFinite(bubble.x)
      || !Number.isFinite(bubble.y)
      || x !== bubble.x
      || y !== bubble.y,
  };
}

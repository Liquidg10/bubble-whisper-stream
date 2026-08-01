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

const DEFAULT_PLACEMENT_GAP = 12;
const COLLISION_SEARCH_ANGLES = 24;
const COLLISION_SEARCH_RINGS = 8;

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

/**
 * New canonical Tasks can arrive without view metadata and therefore share
 * the world origin. Give only those exact-origin collisions a deterministic,
 * viewport-aware first layout; existing user-arranged coordinates remain
 * untouched.
 */
export function placeOriginBubble(
  bubble: Pick<Bubble, 'size'>,
  index: number,
  count: number,
  viewport: ViewportDimensions,
  placementRadius = getSafeBubbleRadius(bubble.size),
): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };

  const radius = getSafeBubbleRadius(bubble.size);
  const cellSize = (Math.max(radius, placementRadius) * 2)
    + DEFAULT_PLACEMENT_GAP;
  const availableWidth = Math.max(cellSize, positiveFiniteOrZero(viewport.width) - (radius * 2));
  const columns = Math.max(1, Math.min(count, Math.floor(availableWidth / cellSize)));
  const rows = Math.ceil(count / columns);
  const rowGroup = Math.floor(index / columns);
  const centerRow = (rows - 1) / 2;
  const rowOrder = Array.from({ length: rows }, (_, row) => row)
    .sort((a, b) => (
      Math.abs(a - centerRow) - Math.abs(b - centerRow) || a - b
    ));
  const row = rowOrder[rowGroup];
  const column = index % columns;
  const columnsInRow = rowGroup === rows - 1 && count % columns !== 0
    ? count % columns
    : columns;
  const raw = {
    x: (column - ((columnsInRow - 1) / 2)) * cellSize,
    y: (row - ((rows - 1) / 2)) * cellSize,
  };

  return recoverPersistedBubblePosition(
    { ...bubble, ...raw },
    viewport,
  );
}

/**
 * Repair legacy stacks using either the historical center-inside-center
 * threshold or full target clearance. The renderer uses full clearance for
 * its once-per-mount presentation repair; active drag still owns the merge
 * affordance and canonical coordinates remain unchanged until user input.
 */
export function separateSeverelyOverlappingBubbles(
  bubbles: readonly Pick<Bubble, 'id' | 'x' | 'y' | 'size'>[],
  viewport: ViewportDimensions,
  options: { separateAllOverlaps?: boolean } = {},
): Map<string, { x: number; y: number }> {
  const placed: Array<{
    id: string;
    x: number;
    y: number;
    radius: number;
  }> = [];
  const repairs = new Map<string, { x: number; y: number }>();

  bubbles.forEach((bubble, bubbleIndex) => {
    const recovered = recoverPersistedBubblePosition(bubble, viewport);
    const radius = getSafeBubbleRadius(bubble.size);
    const original = {
      id: bubble.id,
      x: recovered.x,
      y: recovered.y,
      radius,
    };
    const isSeverelyStacked = placed.some((candidate) => {
      const minimumDistance = options.separateAllOverlaps
        ? radius + candidate.radius + DEFAULT_PLACEMENT_GAP
        : Math.min(radius, candidate.radius);
      return Math.hypot(
        original.x - candidate.x,
        original.y - candidate.y,
      ) < minimumDistance;
    });

    if (!isSeverelyStacked) {
      placed.push(original);
      return;
    }

    const largestPlacedRadius = Math.max(
      radius,
      ...placed.map(candidate => candidate.radius),
    );
    const ringStep = (largestPlacedRadius * 2) + DEFAULT_PLACEMENT_GAP;
    const seedAngle = bubbleIndex * Math.PI * (3 - Math.sqrt(5));
    let repaired: { x: number; y: number } | null = null;

    for (let ring = 1; ring <= COLLISION_SEARCH_RINGS && !repaired; ring += 1) {
      for (
        let angleIndex = 0;
        angleIndex < COLLISION_SEARCH_ANGLES;
        angleIndex += 1
      ) {
        const angle = seedAngle
          + ((Math.PI * 2 * angleIndex) / COLLISION_SEARCH_ANGLES);
        const distance = ringStep * ring;
        const candidate = recoverPersistedBubblePosition(
          {
            ...bubble,
            x: original.x + (Math.cos(angle) * distance),
            y: original.y + (Math.sin(angle) * distance),
          },
          viewport,
        );
        const hasCollision = placed.some(existing => (
          Math.hypot(candidate.x - existing.x, candidate.y - existing.y)
            < radius + existing.radius + DEFAULT_PLACEMENT_GAP
        ));
        if (!hasCollision) repaired = candidate;
      }
    }

    if (!repaired) {
      placed.push(original);
      return;
    }

    repairs.set(bubble.id, repaired);
    placed.push({ id: bubble.id, ...repaired, radius });
  });

  return repairs;
}

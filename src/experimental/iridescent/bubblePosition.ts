import type { Bubble } from '@/types/bubble';

export const MINIMUM_BUBBLE_RADIUS = 22;
export const MAXIMUM_BUBBLE_SIZE = 1;

interface ViewportDimensions {
  width: number;
  height: number;
}

export interface ViewportInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
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

function resolveAxisBounds(
  rawMinimum: number,
  rawMaximum: number,
): { minimum: number; maximum: number } {
  if (rawMinimum <= rawMaximum) {
    return { minimum: rawMinimum, maximum: rawMaximum };
  }

  // When the bubble plus reserved controls cannot fit, center it in the
  // impossible interval. This minimizes total overflow without pretending
  // that zero is a valid bound for an asymmetric safe area.
  const fallback = (rawMinimum + rawMaximum) / 2;
  return { minimum: fallback, maximum: fallback };
}

export function getSafeBubbleRadius(size: number, scale = 1): number {
  const safeSize = Math.min(positiveFiniteOrZero(size), MAXIMUM_BUBBLE_SIZE);
  const safeScale = positiveFiniteOrZero(scale) || 1;
  return Math.max(MINIMUM_BUBBLE_RADIUS, safeSize * 50 * safeScale);
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
  insets: ViewportInsets = {},
): RecoveredBubblePosition {
  const width = positiveFiniteOrZero(viewport.width);
  const height = positiveFiniteOrZero(viewport.height);
  const radius = getSafeBubbleRadius(bubble.size);
  const leftInset = positiveFiniteOrZero(insets.left ?? 0);
  const rightInset = positiveFiniteOrZero(insets.right ?? 0);
  const topInset = positiveFiniteOrZero(insets.top ?? 0);
  const bottomInset = positiveFiniteOrZero(insets.bottom ?? 0);
  const horizontalBounds = resolveAxisBounds(
    (-width / 2) + leftInset + radius,
    (width / 2) - rightInset - radius,
  );
  const verticalBounds = resolveAxisBounds(
    (-height / 2) + topInset + radius,
    (height / 2) - bottomInset - radius,
  );
  const finiteX = finiteOrZero(bubble.x);
  const finiteY = finiteOrZero(bubble.y);
  const x = Math.min(
    horizontalBounds.maximum,
    Math.max(horizontalBounds.minimum, finiteX),
  );
  const y = Math.min(
    verticalBounds.maximum,
    Math.max(verticalBounds.minimum, finiteY),
  );

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
  insets: ViewportInsets = {},
): { x: number; y: number } {
  const horizontalOffset = (
    positiveFiniteOrZero(insets.left ?? 0)
    - positiveFiniteOrZero(insets.right ?? 0)
  ) / 2;
  const verticalOffset = (
    positiveFiniteOrZero(insets.top ?? 0)
    - positiveFiniteOrZero(insets.bottom ?? 0)
  ) / 2;
  if (count <= 1) {
    const recovered = recoverPersistedBubblePosition(
      { ...bubble, x: horizontalOffset, y: verticalOffset },
      viewport,
      insets,
    );
    return { x: recovered.x, y: recovered.y };
  }

  const radius = getSafeBubbleRadius(bubble.size);
  const cellSize = (Math.max(radius, placementRadius) * 2)
    + DEFAULT_PLACEMENT_GAP;
  const availableWidth = Math.max(
    cellSize,
    positiveFiniteOrZero(viewport.width)
      - positiveFiniteOrZero(insets.left ?? 0)
      - positiveFiniteOrZero(insets.right ?? 0)
      - (radius * 2),
  );
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
    x: ((column - ((columnsInRow - 1) / 2)) * cellSize) + horizontalOffset,
    y: ((row - ((rows - 1) / 2)) * cellSize) + verticalOffset,
  };

  return recoverPersistedBubblePosition(
    { ...bubble, ...raw },
    viewport,
    insets,
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
  options: {
    separateAllOverlaps?: boolean;
    insets?: ViewportInsets;
  } = {},
): Map<string, { x: number; y: number }> {
  const placed: Array<{
    id: string;
    x: number;
    y: number;
    radius: number;
  }> = [];
  const repairs = new Map<string, { x: number; y: number }>();

  bubbles.forEach((bubble, bubbleIndex) => {
    const recovered = recoverPersistedBubblePosition(
      bubble,
      viewport,
      options.insets,
    );
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
      if (recovered.adjusted) {
        repairs.set(bubble.id, { x: recovered.x, y: recovered.y });
      }
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
          options.insets,
        );
        const hasCollision = placed.some(existing => (
          Math.hypot(candidate.x - existing.x, candidate.y - existing.y)
            < radius + existing.radius + DEFAULT_PLACEMENT_GAP
        ));
        if (!hasCollision) repaired = candidate;
      }
    }

    if (!repaired) {
      if (recovered.adjusted) {
        repairs.set(bubble.id, { x: recovered.x, y: recovered.y });
      }
      placed.push(original);
      return;
    }

    repairs.set(bubble.id, repaired);
    placed.push({ id: bubble.id, ...repaired, radius });
  });

  return repairs;
}

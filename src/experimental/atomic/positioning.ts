import type { Bubble } from '@/types/bubble';
import { classifyDomain } from '@/lib/classifyDomain';
import { logger } from '@/utils/logger';

const MAX_LAYOUT_RINGS = 2;
const MOLECULE_RADIUS = 200;
const MINIMUM_CENTER_SPACING = MOLECULE_RADIUS * 2;
const MAX_MOLECULES = 1 + (3 * MAX_LAYOUT_RINGS * (MAX_LAYOUT_RINGS + 1));

/**
 * Atomic layout coordinates are center-relative world units. The renderer owns
 * the screen-space center and viewport transform; this module only assigns
 * deterministic world positions.
 */
export const MOLECULE_LAYOUT_CONFIG = {
  moleculeRadius: MOLECULE_RADIUS,
  minimumCenterSpacing: MINIMUM_CENTER_SPACING,
  maxRings: MAX_LAYOUT_RINGS,
  maxMolecules: MAX_MOLECULES,
  centerBounds: {
    minX: -(MAX_LAYOUT_RINGS * MINIMUM_CENTER_SPACING),
    maxX: MAX_LAYOUT_RINGS * MINIMUM_CENTER_SPACING,
    minY: -(MAX_LAYOUT_RINGS * MINIMUM_CENTER_SPACING),
    maxY: MAX_LAYOUT_RINGS * MINIMUM_CENTER_SPACING,
  },
} as const;

export interface MoleculePosition {
  x: number;
  y: number;
  radius: number;
}

interface Point {
  x: number;
  y: number;
}

const COORDINATE_PRECISION = 6;
const SPACING_EPSILON = 0.001;

function normalizeCoordinate(value: number): number {
  if (Math.abs(value) < Number.EPSILON * 100) return 0;
  return Number(value.toFixed(COORDINATE_PRECISION));
}

function createLayoutSlots(): Point[] {
  const slots: Point[] = [{ x: 0, y: 0 }];

  for (let ring = 1; ring <= MOLECULE_LAYOUT_CONFIG.maxRings; ring += 1) {
    const slotCount = ring * 6;
    const ringRadius = ring * MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing;

    for (let index = 0; index < slotCount; index += 1) {
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / slotCount);
      slots.push({
        x: normalizeCoordinate(Math.cos(angle) * ringRadius),
        y: normalizeCoordinate(Math.sin(angle) * ringRadius),
      });
    }
  }

  return slots;
}

const LAYOUT_SLOTS = createLayoutSlots();

function createSymmetricRingSlots(count: number, radius: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / count);
    return {
      x: normalizeCoordinate(Math.cos(angle) * radius),
      y: normalizeCoordinate(Math.sin(angle) * radius),
    };
  });
}

/**
 * Keep partial domain sets visually balanced around the origin. Seven domains
 * retain the canonical center-plus-hex layout; additional experimental domains
 * use a symmetric subset of the second ring.
 */
function createSymmetricLayoutSlots(count: number): Point[] {
  if (count === 0) return [];
  if (count === 1) return [{ x: 0, y: 0 }];
  if (count <= 6) {
    return createSymmetricRingSlots(
      count,
      MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing,
    );
  }

  const innerLayout = LAYOUT_SLOTS.slice(0, 7);
  const outerCount = count - innerLayout.length;
  if (outerCount === 0) return innerLayout;

  return [
    ...innerLayout,
    ...createSymmetricRingSlots(
      outerCount,
      MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing * 2,
    ),
  ];
}

function isWithinCenterBounds(point: Point): boolean {
  const { centerBounds } = MOLECULE_LAYOUT_CONFIG;
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= centerBounds.minX
    && point.x <= centerBounds.maxX
    && point.y >= centerBounds.minY
    && point.y <= centerBounds.maxY;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function finiteBubblePositions(bubbles: Bubble[]): Point[] {
  return bubbles
    .map(({ x, y }) => ({ x, y }))
    .filter(isWithinCenterBounds);
}

function selectDeterministicSlot(target: Point, existingPositions: Point[]): Point {
  const candidates = LAYOUT_SLOTS.map((slot, index) => {
    const clearance = existingPositions.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...existingPositions.map(existing => distance(slot, existing)));

    return {
      slot,
      index,
      clearance,
      targetDistance: distance(slot, target),
    };
  });

  const available = candidates.filter(({ clearance }) => (
    clearance + SPACING_EPSILON >= MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing
  ));

  if (available.length > 0) {
    available.sort((a, b) => (
      a.targetDistance - b.targetDistance || a.index - b.index
    ));
    return available[0].slot;
  }

  // Capacity is exhausted. Stay deterministic and bounded while maximizing
  // distance from existing content instead of falling back to randomness.
  candidates.sort((a, b) => (
    b.clearance - a.clearance
      || a.targetDistance - b.targetDistance
      || a.index - b.index
  ));
  logger.warn('Atomic layout capacity exhausted; using best-clearance slot', {
    existingCount: existingPositions.length,
    maxMolecules: MOLECULE_LAYOUT_CONFIG.maxMolecules,
  });
  return candidates[0].slot;
}

export function suggestOptimalPosition(
  newBubble: Bubble,
  existingBubbles: Bubble[],
  storedPosition?: Point,
): Point {
  if (storedPosition && isWithinCenterBounds(storedPosition)) {
    logger.debug('Using stored center-relative position', storedPosition);
    return storedPosition;
  }

  const domain = classifyDomain(newBubble);
  const relatedPositions = finiteBubblePositions(
    existingBubbles.filter(bubble => classifyDomain(bubble) === domain),
  );
  const target = relatedPositions.length === 0
    ? { x: 0, y: 0 }
    : {
        x: relatedPositions.reduce((sum, point) => sum + point.x, 0) / relatedPositions.length,
        y: relatedPositions.reduce((sum, point) => sum + point.y, 0) / relatedPositions.length,
      };
  const position = selectDeterministicSlot(target, finiteBubblePositions(existingBubbles));

  logger.debug('Selected deterministic center-relative position', {
    domain,
    relatedBubblesCount: relatedPositions.length,
    totalBubbles: existingBubbles.length,
    position,
  });

  return position;
}

/**
 * Assign deterministic, non-overlapping, center-relative molecule positions.
 * The current canonical domain set uses seven slots (center plus the first
 * ring); the second ring provides bounded headroom for future domains.
 */
export function calculateMoleculePositions(domains: string[]): MoleculePosition[] {
  if (domains.length > MOLECULE_LAYOUT_CONFIG.maxMolecules) {
    throw new RangeError(
      `Atomic layout supports at most ${MOLECULE_LAYOUT_CONFIG.maxMolecules} molecules`,
    );
  }

  const layoutSlots = createSymmetricLayoutSlots(domains.length);

  return domains.map((domain, index) => {
    const slot = layoutSlots[index];
    const position = {
      ...slot,
      radius: MOLECULE_LAYOUT_CONFIG.moleculeRadius,
    };

    logger.debug(`Positioned molecule ${domain}`, position);
    return position;
  });
}

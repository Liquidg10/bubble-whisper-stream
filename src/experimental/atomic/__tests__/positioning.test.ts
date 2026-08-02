import { describe, expect, it, vi } from 'vitest';
import type { Bubble } from '@/types/bubble';
import {
  calculateMoleculePositions,
  MOLECULE_LAYOUT_CONFIG,
  suggestOptimalPosition,
} from '../positioning';

function createBubble(overrides: Partial<Bubble> = {}): Bubble {
  return {
    id: 'bubble-1',
    type: 'Task',
    content: 'Work task',
    createdAt: 1,
    updatedAt: 1,
    x: 0,
    y: 0,
    size: 0.8,
    tags: [],
    ...overrides,
  };
}

describe('calculateMoleculePositions', () => {
  it('starts at the world origin and returns center-relative positions', () => {
    const positions = calculateMoleculePositions([
      'Work',
      'Personal',
      'Health',
      'Learning',
      'Relationships',
      'Finance',
      'General',
    ]);

    expect(positions).toHaveLength(7);
    expect(positions[0]).toEqual({
      x: 0,
      y: 0,
      radius: MOLECULE_LAYOUT_CONFIG.moleculeRadius,
    });

    const ringDistances = positions.slice(1).map(({ x, y }) => Math.hypot(x, y));
    ringDistances.forEach(ringDistance => {
      expect(ringDistance).toBeCloseTo(
        MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing,
        5,
      );
    });
  });

  it('is deterministic and never consults Math.random', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const domains = ['Work', 'Health', 'Finance', 'General'];

    const first = calculateMoleculePositions(domains);
    const second = calculateMoleculePositions(domains);

    expect(second).toEqual(first);
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it.each([2, 3, 4, 5, 6])(
    'balances a partial set of %i domains around the world origin',
    (domainCount) => {
      const positions = calculateMoleculePositions(
        Array.from({ length: domainCount }, (_, index) => `Domain ${index}`),
      );
      const centroid = positions.reduce(
        (sum, position) => ({
          x: sum.x + position.x,
          y: sum.y + position.y,
        }),
        { x: 0, y: 0 },
      );

      expect(centroid.x / domainCount).toBeCloseTo(0, 5);
      expect(centroid.y / domainCount).toBeCloseTo(0, 5);
      positions.forEach(({ x, y }) => {
        expect(Math.hypot(x, y)).toBeCloseTo(
          MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing,
          5,
        );
      });
    },
  );

  it('keeps every supported center inside the explicit layout bounds', () => {
    const domains = Array.from(
      { length: MOLECULE_LAYOUT_CONFIG.maxMolecules },
      (_, index) => `Domain ${index}`,
    );
    const positions = calculateMoleculePositions(domains);
    const { centerBounds } = MOLECULE_LAYOUT_CONFIG;

    positions.forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(centerBounds.minX);
      expect(x).toBeLessThanOrEqual(centerBounds.maxX);
      expect(y).toBeGreaterThanOrEqual(centerBounds.minY);
      expect(y).toBeLessThanOrEqual(centerBounds.maxY);
    });
  });

  it('maintains the configured center-to-center spacing at full capacity', () => {
    const domains = Array.from(
      { length: MOLECULE_LAYOUT_CONFIG.maxMolecules },
      (_, index) => `Domain ${index}`,
    );
    const positions = calculateMoleculePositions(domains);

    positions.forEach((position, index) => {
      positions.slice(index + 1).forEach(other => {
        const centerDistance = Math.hypot(
          position.x - other.x,
          position.y - other.y,
        );
        expect(centerDistance).toBeGreaterThanOrEqual(
          MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing - 0.001,
        );
      });
    });
  });

  it('fails explicitly instead of creating an out-of-bounds overflow position', () => {
    const domains = Array.from(
      { length: MOLECULE_LAYOUT_CONFIG.maxMolecules + 1 },
      (_, index) => `Domain ${index}`,
    );

    expect(() => calculateMoleculePositions(domains)).toThrowError(
      `Atomic layout supports at most ${MOLECULE_LAYOUT_CONFIG.maxMolecules} molecules`,
    );
  });
});

describe('suggestOptimalPosition', () => {
  it('uses the center for the first bubble without an absolute canvas offset', () => {
    expect(suggestOptimalPosition(createBubble(), [])).toEqual({ x: 0, y: 0 });
  });

  it('preserves a valid zero-valued stored position', () => {
    expect(suggestOptimalPosition(
      createBubble(),
      [],
      { x: 0, y: 0 },
    )).toEqual({ x: 0, y: 0 });
  });

  it('selects the same bounded open slot for the same occupied layout', () => {
    const existing = [createBubble({ id: 'existing', x: 0, y: 0 })];
    const randomSpy = vi.spyOn(Math, 'random');

    const first = suggestOptimalPosition(createBubble({ id: 'new' }), existing);
    const second = suggestOptimalPosition(createBubble({ id: 'new' }), existing);

    expect(first).toEqual({
      x: 0,
      y: -MOLECULE_LAYOUT_CONFIG.minimumCenterSpacing,
    });
    expect(second).toEqual(first);
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it('ignores malformed or out-of-bounds stored coordinates', () => {
    expect(suggestOptimalPosition(
      createBubble(),
      [],
      { x: Number.POSITIVE_INFINITY, y: 0 },
    )).toEqual({ x: 0, y: 0 });

    expect(suggestOptimalPosition(
      createBubble(),
      [],
      { x: MOLECULE_LAYOUT_CONFIG.centerBounds.maxX + 1, y: 0 },
    )).toEqual({ x: 0, y: 0 });
  });
});

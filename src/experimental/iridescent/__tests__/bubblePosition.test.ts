import { describe, expect, it } from 'vitest';
import {
  placeOriginBubble,
  recoverPersistedBubblePosition,
  separateSeverelyOverlappingBubbles,
} from '../bubblePosition';

const standardBubble = {
  x: 0,
  y: 0,
  size: 0.6,
};

describe('persisted Adaptive Bubble position recovery', () => {
  it('preserves a valid saved position', () => {
    expect(recoverPersistedBubblePosition(
      { ...standardBubble, x: 100, y: -120 },
      { width: 390, height: 844 },
    )).toEqual({
      x: 100,
      y: -120,
      adjusted: false,
    });
  });

  it('clamps stale positive and negative coordinates into a 390px viewport', () => {
    expect(recoverPersistedBubblePosition(
      { ...standardBubble, x: 10_000, y: -10_000 },
      { width: 390, height: 844 },
    )).toEqual({
      x: 165,
      y: -392,
      adjusted: true,
    });
  });

  it('recovers malformed non-finite coordinates to the viewport center', () => {
    expect(recoverPersistedBubblePosition(
      { ...standardBubble, x: Number.NaN, y: Number.POSITIVE_INFINITY },
      { width: 390, height: 844 },
    )).toEqual({
      x: 0,
      y: 0,
      adjusted: true,
    });
  });

  it('revalidates a desktop position when the viewport narrows', () => {
    const savedPosition = { ...standardBubble, x: 300, y: 250 };

    expect(recoverPersistedBubblePosition(
      savedPosition,
      { width: 800, height: 600 },
    )).toEqual({
      x: 300,
      y: 250,
      adjusted: false,
    });
    expect(recoverPersistedBubblePosition(
      savedPosition,
      { width: 390, height: 844 },
    )).toEqual({
      x: 165,
      y: 250,
      adjusted: true,
    });
  });

  it('revalidates both axes after an orientation change', () => {
    const savedPosition = { ...standardBubble, x: 300, y: 300 };

    expect(recoverPersistedBubblePosition(
      savedPosition,
      { width: 390, height: 844 },
    )).toEqual({
      x: 165,
      y: 300,
      adjusted: true,
    });
    expect(recoverPersistedBubblePosition(
      savedPosition,
      { width: 844, height: 390 },
    )).toEqual({
      x: 300,
      y: 165,
      adjusted: true,
    });
  });

  it('bounds an oversized persisted bubble to the supported size contract', () => {
    expect(recoverPersistedBubblePosition(
      { x: 500, y: -500, size: 10 },
      { width: 390, height: 320 },
    )).toEqual({
      x: 145,
      y: -110,
      adjusted: true,
    });
  });

  it('uses the minimum operable radius for malformed persisted sizes', () => {
    expect(recoverPersistedBubblePosition(
      { x: 500, y: -500, size: Number.NaN },
      { width: 390, height: 844 },
    )).toEqual({
      x: 173,
      y: -400,
      adjusted: true,
    });
    expect(recoverPersistedBubblePosition(
      { x: -500, y: 500, size: -1 },
      { width: 390, height: 844 },
    )).toEqual({
      x: -173,
      y: 400,
      adjusted: true,
    });
  });
});

describe('default Adaptive Bubble placement', () => {
  it('keeps a single origin bubble centered', () => {
    expect(placeOriginBubble(
      standardBubble,
      0,
      1,
      { width: 390, height: 844 },
    )).toEqual({ x: 0, y: 0 });
  });

  it('gives origin-colliding tasks distinct deterministic positions', () => {
    const positions = Array.from({ length: 5 }, (_, index) => (
      placeOriginBubble(
        standardBubble,
        index,
        5,
        { width: 390, height: 844 },
      )
    ));

    expect(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(5);
    expect(positions).toEqual(Array.from({ length: 5 }, (_, index) => (
      placeOriginBubble(
        standardBubble,
        index,
        5,
        { width: 390, height: 844 },
      )
    )));
  });

  it('keeps every placement visible in a narrow viewport', () => {
    const viewport = { width: 320, height: 480 };

    Array.from({ length: 8 }, (_, index) => (
      placeOriginBubble(standardBubble, index, 8, viewport)
    )).forEach(({ x, y }) => {
      expect(Math.abs(x)).toBeLessThanOrEqual((viewport.width / 2) - 30);
      expect(Math.abs(y)).toBeLessThanOrEqual((viewport.height / 2) - 30);
    });
  });

  it('keeps the first capacity-limited row separated and vertically centered', () => {
    const viewport = { width: 320, height: 256 };
    const placementRadius = 38;
    const first = placeOriginBubble(
      standardBubble,
      0,
      5,
      viewport,
      placementRadius,
    );
    const second = placeOriginBubble(
      standardBubble,
      1,
      5,
      viewport,
      placementRadius,
    );

    expect(first.y).toBe(0);
    expect(second.y).toBe(0);
    expect(Math.abs(second.x - first.x)).toBeGreaterThanOrEqual(
      (placementRadius * 2) + 12,
    );
  });
});

describe('legacy Adaptive Bubble stack recovery', () => {
  it('separates inaccessible near-duplicate centers without moving stable tasks', () => {
    const bubbles = [
      { id: 'right-anchor', x: 100, y: 0, size: 0.6 },
      { id: 'left-anchor', x: -100, y: 0, size: 0.6 },
      { id: 'right-stacked', x: 106, y: 0, size: 0.6 },
      { id: 'left-stacked', x: -94, y: 0, size: 0.6 },
    ];
    const repairs = separateSeverelyOverlappingBubbles(
      bubbles,
      { width: 844, height: 390 },
    );

    expect(Array.from(repairs.keys())).toEqual([
      'right-stacked',
      'left-stacked',
    ]);
    expect(repairs.has('right-anchor')).toBe(false);
    expect(repairs.has('left-anchor')).toBe(false);

    const finalPositions = bubbles.map(bubble => ({
      ...bubble,
      ...(repairs.get(bubble.id) ?? {}),
    }));
    for (let left = 0; left < finalPositions.length; left += 1) {
      for (let right = left + 1; right < finalPositions.length; right += 1) {
        expect(Math.hypot(
          finalPositions[left].x - finalPositions[right].x,
          finalPositions[left].y - finalPositions[right].y,
        )).toBeGreaterThanOrEqual(72);
      }
    }
  });

  it('preserves mild overlap used by the merge affordance', () => {
    const repairs = separateSeverelyOverlappingBubbles(
      [
        { id: 'one', x: 0, y: 0, size: 0.6 },
        { id: 'two', x: 50, y: 0, size: 0.6 },
      ],
      { width: 390, height: 844 },
    );

    expect(repairs.size).toBe(0);
  });

  it('separates every overlap when compact targets need extra clearance', () => {
    const repairs = separateSeverelyOverlappingBubbles(
      [
        { id: 'one', x: 0, y: 0, size: 0.6 },
        { id: 'two', x: 50, y: 0, size: 0.6 },
      ],
      { width: 390, height: 844 },
      { separateAllOverlaps: true },
    );

    expect(repairs.has('one')).toBe(false);
    expect(repairs.has('two')).toBe(true);
  });
});

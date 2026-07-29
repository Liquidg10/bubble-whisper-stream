import { describe, expect, it } from 'vitest';
import { recoverPersistedBubblePosition } from '../bubblePosition';

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

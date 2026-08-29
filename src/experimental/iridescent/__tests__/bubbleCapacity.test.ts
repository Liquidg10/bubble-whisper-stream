import { describe, expect, it } from 'vitest';
import {
  getViewportBubbleCapacity,
  planBubbleVisibility,
} from '../bubbleCapacity';

describe('Adaptive Bubble viewport capacity', () => {
  it('caps a 40-task compact canvas without changing density semantics', () => {
    const viewport = { width: 390, height: 562 };

    expect(getViewportBubbleCapacity(viewport)).toBe(2);
    expect(planBubbleVisibility(40, 'low', viewport)).toMatchObject({
      densityTarget: 12,
      viewportCapacity: 2,
      visibleCount: 1,
      capacityLimited: true,
    });
    expect(planBubbleVisibility(40, 'medium', viewport)).toMatchObject({
      densityTarget: 28,
      viewportCapacity: 2,
      visibleCount: 2,
      capacityLimited: true,
    });
    expect(planBubbleVisibility(40, 'high', viewport)).toMatchObject({
      densityTarget: 40,
      viewportCapacity: 2,
      visibleCount: 2,
      capacityLimited: true,
    });
  });

  it('retains the readiness-ordered percentage for a bounded pre-measurement set', () => {
    expect(planBubbleVisibility(40, 'medium', {
      width: 0,
      height: 0,
    })).toEqual({
      densityTarget: 28,
      viewportCapacity: 40,
      visibleCount: 28,
      capacityLimited: false,
    });
  });

  it('bounds the first unmeasured frame for very large task collections', () => {
    expect(planBubbleVisibility(5_000, 'medium', {
      width: 0,
      height: 0,
    })).toEqual({
      densityTarget: 3_500,
      viewportCapacity: 100,
      visibleCount: 70,
      capacityLimited: true,
    });
  });

  it('does not unnecessarily cap a representative desktop canvas', () => {
    expect(planBubbleVisibility(40, 'medium', {
      width: 1280,
      height: 720,
    })).toMatchObject({
      densityTarget: 28,
      viewportCapacity: 40,
      visibleCount: 28,
      capacityLimited: false,
    });
  });

  it('keeps at least one top readiness projection on a tiny measured canvas', () => {
    expect(planBubbleVisibility(8, 'low', {
      width: 160,
      height: 180,
    })).toMatchObject({
      viewportCapacity: 1,
      visibleCount: 1,
      capacityLimited: true,
    });
  });

  it('returns an empty plan for invalid or empty totals', () => {
    expect(planBubbleVisibility(Number.NaN, 'high', {
      width: 390,
      height: 562,
    })).toEqual({
      densityTarget: 0,
      viewportCapacity: 0,
      visibleCount: 0,
      capacityLimited: false,
    });
  });
});

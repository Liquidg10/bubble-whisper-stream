import { describe, expect, it } from 'vitest';
import { interpolateOrbit, nearestFreeOrbitSlot } from '../orbitalMechanics';

describe('orbital settling geometry', () => {
  it('takes an arc between opposite slots without passing through the nucleus', () => {
    const start = { x: 64, y: 0 };
    const target = { x: -168, y: 0 };
    for (let step = 0; step <= 20; step += 1) {
      const point = interpolateOrbit(start, target, step / 20);
      expect(Math.hypot(point.x, point.y)).toBeGreaterThanOrEqual(64);
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(168);
    }
    expect(interpolateOrbit(start, target, 0)).toEqual(start);
    expect(interpolateOrbit(start, target, 1)).toEqual(target);
  });

  it('takes the short path across the angle wrap', () => {
    const start = { x: -64, y: 2 };
    const target = { x: -116, y: -2 };
    expect(interpolateOrbit(start, target, 0.5).x).toBeLessThan(-64);
  });

  it('chooses the closest unoccupied slot including the accumulated orbital phase', () => {
    expect(nearestFreeOrbitSlot(Math.PI / 2, 8, new Set(), Math.PI / 2)).toBe(0);
    expect(nearestFreeOrbitSlot(-0.1, 8, new Set([0]))).toBe(7);
    expect(nearestFreeOrbitSlot(0, 2, new Set([0, 1]))).toBeNull();
  });
});

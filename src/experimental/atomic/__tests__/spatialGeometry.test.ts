import { describe, expect, it } from 'vitest';
import {
  addSpatialPoints, closestSpatialOrbit, createSpatialDragPlane, fitSpatialCamera,
  intersectSpatialPlane, isSpatialPoint, moveOnSpatialDragPlane, normalizeSpatialAngle,
  orbitSpatialCamera, spatialOrbitPoint, SPATIAL_SHELL_RADII, subtractSpatialPoints,
  zoomSpatialCamera, type SpatialCamera, type SpatialPoint,
} from '../spatialGeometry';

const distance = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('3D shell geometry and camera-facing drag coordinates', () => {
  it.each([0, 1, 2] as const)('places shell %s at its actual radius in three dimensions and round-trips angle', shell => {
    for (const angle of [0, 0.5, Math.PI / 2, Math.PI, 5.2]) {
      const position = spatialOrbitPoint(shell, angle);
      expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(SPATIAL_SHELL_RADII[shell], 8);
      const selected = closestSpatialOrbit(position);
      expect(selected.shell).toBe(shell); expect(selected.angle).toBeCloseTo(normalizeSpatialAngle(angle), 8);
    }
    expect(spatialOrbitPoint(shell, Math.PI / 2).z).not.toBe(0);
  });

  it('keeps a finite angle when a drop is exactly at the nucleus', () => {
    const selected = closestSpatialOrbit({ x: 0, y: 0, z: 0 }, 1.2);
    expect(selected.shell).toBe(0); expect(selected.angle).toBeCloseTo(1.2);
    expect(Math.hypot(selected.position.x, selected.position.y, selected.position.z)).toBeCloseTo(64);
  });

  it('retains a noncentral grab offset without jumping on the initial event', () => {
    const center = { x: 40, y: -30, z: 80 };
    const ray = { origin: { x: 47, y: -25, z: 500 }, direction: { x: 0, y: 0, z: -1 } };
    const drag = createSpatialDragPlane(ray, center, { x: 0, y: 0, z: -1 })!;
    expect(drag.grabOffset).toEqual({ x: 7, y: 5, z: 0 });
    expect(moveOnSpatialDragPlane(ray, drag)).toEqual(center);
    expect(moveOnSpatialDragPlane({ ...ray, origin: { x: 87, y: 0, z: 500 } }, drag)).toEqual({ x: 80, y: -5, z: 80 });
  });

  it('preserves grab offset after camera rotation, changing depth as well as x/y', () => {
    const center = { x: 40, y: -30, z: 80 };
    const direction = { x: -0.6, y: 0, z: -0.8 };
    const ray = { origin: { x: 340, y: -22, z: 480 }, direction };
    const drag = createSpatialDragPlane(ray, center, direction)!;
    expect(distance(moveOnSpatialDragPlane(ray, drag)!, center)).toBeLessThan(0.00001);
    const moved = moveOnSpatialDragPlane({ ...ray, origin: addSpatialPoints(ray.origin, { x: 40, y: 20, z: -30 }) }, drag)!;
    expect(moved.x).toBeCloseTo(center.x + 40); expect(moved.y).toBeCloseTo(center.y + 20); expect(moved.z).toBeCloseTo(center.z - 30);
  });

  it('rejects parallel or behind-camera intersections and zero camera direction', () => {
    const origin = { x: 0, y: 0, z: 10 }; const point = { x: 0, y: 0, z: 0 }; const normal = { x: 0, y: 0, z: 1 };
    expect(intersectSpatialPlane({ origin, direction: { x: 1, y: 0, z: 0 } }, point, normal)).toBeUndefined();
    expect(intersectSpatialPlane({ origin, direction: normal }, point, normal)).toBeUndefined();
    expect(createSpatialDragPlane({ origin, direction: normal }, point, point)).toBeUndefined();
  });

  it('rejects invalid positions without accepting NaN or unbounded coordinates', () => {
    expect(isSpatialPoint({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(isSpatialPoint({ x: NaN, y: 0, z: 0 })).toBe(false);
    expect(isSpatialPoint({ x: 0, y: Infinity, z: 0 })).toBe(false);
    expect(isSpatialPoint({ x: 0, y: 0, z: 1_000_001 })).toBe(false);
  });
});

describe('explicit spatial camera controls', () => {
  it('fits all xyz positions, preserving the app y-down coordinate contract', () => {
    const camera = fitSpatialCamera([{ position: { x: -300, y: -100, z: -80 } }, { position: { x: 500, y: 300, z: 240 } }]);
    expect(camera.target).toEqual({ x: 100, y: 100, z: 80 });
    expect(camera.position.y).toBeLessThan(camera.target.y); expect(camera.position.z).toBeGreaterThan(camera.target.z);
    expect(distance(camera.position, camera.target)).toBeGreaterThan(1000);
  });

  it('backs away farther to fit a narrow portrait viewport', () => {
    const molecules = [{ position: { x: 0, y: 0, z: 0 } }];
    const wide = fitSpatialCamera(molecules, 2); const narrow = fitSpatialCamera(molecules, 0.45);
    expect(distance(narrow.position, narrow.target)).toBeGreaterThan(distance(wide.position, wide.target));
  });

  it('provides a finite empty-scene view', () => {
    const camera = fitSpatialCamera([]);
    expect(isSpatialPoint(camera.position)).toBe(true); expect(camera.target).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('orbits without changing target/distance and keeps poles finite', () => {
    const camera = fitSpatialCamera([]);
    const turned = orbitSpatialCamera(camera, 0.2, 0.15);
    expect(turned.target).toEqual(camera.target); expect(turned.position).not.toEqual(camera.position);
    expect(distance(turned.position, turned.target)).toBeCloseTo(distance(camera.position, camera.target), 6);
    expect(isSpatialPoint(orbitSpatialCamera(camera, 0, 1000).position)).toBe(true);
    expect(isSpatialPoint(orbitSpatialCamera(camera, 0, -1000).position)).toBe(true);
  });

  it('zooms toward the same target without crossing it and rejects invalid factors', () => {
    const camera: SpatialCamera = { target: { x: 20, y: 30, z: 40 }, position: { x: 20, y: 30, z: 1040 } };
    expect(zoomSpatialCamera(camera, 0.5).position).toEqual({ x: 20, y: 30, z: 540 });
    const closest = zoomSpatialCamera(camera, 0.0001);
    expect(distance(closest.position, closest.target)).toBe(120);
    expect(subtractSpatialPoints(closest.position, closest.target).z).toBeGreaterThan(0);
    expect(zoomSpatialCamera(camera, -1)).toBe(camera); expect(zoomSpatialCamera(camera, NaN)).toBe(camera);
  });
});

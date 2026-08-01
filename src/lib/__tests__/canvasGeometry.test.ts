import { describe, expect, it } from 'vitest';
import {
  fitViewportToWorldBounds,
  panViewportByScreenDelta,
  screenToWorld,
  worldToScreen,
  zoomViewportAtPoint,
} from '../canvasGeometry';

const dimensions = { width: 1000, height: 600 };

describe('center-origin canvas geometry', () => {
  it('round-trips world and screen coordinates after pan and zoom', () => {
    const viewport = { x: 137, y: -42, scale: 1.75 };
    const world = { x: -80, y: 125 };

    expect(screenToWorld(
      worldToScreen(world, viewport, dimensions),
      viewport,
      dimensions,
    )).toEqual(world);
  });

  it('applies pan in screen pixels at every scale', () => {
    const viewport = { x: 20, y: -10, scale: 2.5 };
    const world = { x: 30, y: 40 };
    const before = worldToScreen(world, viewport, dimensions);
    const after = worldToScreen(
      world,
      panViewportByScreenDelta(viewport, { x: 100, y: -35 }),
      dimensions,
    );

    expect(after.x - before.x).toBe(100);
    expect(after.y - before.y).toBe(-35);
  });

  it('keeps a focal world point fixed after panning and zooming', () => {
    const viewport = { x: -160, y: 85, scale: 1.4 };
    const focalPoint = { x: 240, y: 410 };
    const focalWorld = screenToWorld(focalPoint, viewport, dimensions);
    const zoomed = zoomViewportAtPoint(
      viewport,
      1.3,
      focalPoint,
      dimensions,
      0.5,
      3,
    );

    expect(worldToScreen(focalWorld, zoomed, dimensions).x).toBeCloseTo(focalPoint.x, 10);
    expect(worldToScreen(focalWorld, zoomed, dimensions).y).toBeCloseTo(focalPoint.y, 10);
  });

  it('does not drift when a scale limit has already been reached', () => {
    const viewport = { x: 90, y: -70, scale: 3 };

    expect(zoomViewportAtPoint(
      viewport,
      1.2,
      { x: 100, y: 100 },
      dimensions,
      0.5,
      3,
    )).toBe(viewport);
  });

  it('fits and centers world bounds inside the available viewport', () => {
    const bounds = { minX: -500, maxX: 500, minY: -300, maxY: 300 };
    const viewport = fitViewportToWorldBounds(bounds, dimensions, {
      padding: 50,
      minScale: 0.1,
      maxScale: 2,
    });
    const topLeft = worldToScreen(
      { x: bounds.minX, y: bounds.minY },
      viewport,
      dimensions,
    );
    const bottomRight = worldToScreen(
      { x: bounds.maxX, y: bounds.maxY },
      viewport,
      dimensions,
    );

    expect(topLeft.x).toBeGreaterThanOrEqual(50);
    expect(topLeft.y).toBeGreaterThanOrEqual(50);
    expect(bottomRight.x).toBeLessThanOrEqual(950);
    expect(bottomRight.y).toBeLessThanOrEqual(550);
  });
});

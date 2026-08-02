export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasDimensions {
  width: number;
  height: number;
}

/**
 * Center-origin viewport contract used by every spatial task lens.
 *
 * World positions are center-relative. x/y are screen-pixel translations and
 * are never divided by scale while panning.
 */
export interface CanvasViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasWorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function clampCanvasScale(
  scale: number,
  minScale: number,
  maxScale: number,
): number {
  const safeMin = positiveFinite(minScale, 0.1);
  const safeMax = Math.max(safeMin, positiveFinite(maxScale, safeMin));
  const safeScale = positiveFinite(scale, safeMin);
  return Math.min(safeMax, Math.max(safeMin, safeScale));
}

export function worldToScreen(
  point: CanvasPoint,
  viewport: CanvasViewportTransform,
  dimensions: CanvasDimensions,
): CanvasPoint {
  return {
    x: (dimensions.width / 2) + viewport.x + (point.x * viewport.scale),
    y: (dimensions.height / 2) + viewport.y + (point.y * viewport.scale),
  };
}

export function screenToWorld(
  point: CanvasPoint,
  viewport: CanvasViewportTransform,
  dimensions: CanvasDimensions,
): CanvasPoint {
  const scale = positiveFinite(viewport.scale, 1);
  return {
    x: (point.x - (dimensions.width / 2) - viewport.x) / scale,
    y: (point.y - (dimensions.height / 2) - viewport.y) / scale,
  };
}

export function panViewportByScreenDelta(
  viewport: CanvasViewportTransform,
  delta: CanvasPoint,
): CanvasViewportTransform {
  return {
    ...viewport,
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
  };
}

/** Keep the world point under a canvas-local focal point fixed while scaling. */
export function zoomViewportAtPoint(
  viewport: CanvasViewportTransform,
  scaleFactor: number,
  focalPoint: CanvasPoint,
  dimensions: CanvasDimensions,
  minScale = 0.1,
  maxScale = 3,
): CanvasViewportTransform {
  const oldScale = positiveFinite(viewport.scale, 1);
  const nextScale = clampCanvasScale(
    oldScale * positiveFinite(scaleFactor, 1),
    minScale,
    maxScale,
  );

  if (nextScale === oldScale) return viewport;

  const ratio = nextScale / oldScale;
  const focalFromCenter = {
    x: focalPoint.x - (dimensions.width / 2),
    y: focalPoint.y - (dimensions.height / 2),
  };

  return {
    scale: nextScale,
    x: (viewport.x * ratio) + (focalFromCenter.x * (1 - ratio)),
    y: (viewport.y * ratio) + (focalFromCenter.y * (1 - ratio)),
  };
}

export function centerViewportOnWorldPoint(
  viewport: CanvasViewportTransform,
  point: CanvasPoint,
  scale = viewport.scale,
  minScale = 0.1,
  maxScale = 3,
): CanvasViewportTransform {
  const nextScale = clampCanvasScale(scale, minScale, maxScale);
  return {
    scale: nextScale,
    x: -(point.x * nextScale),
    y: -(point.y * nextScale),
  };
}

export function fitViewportToWorldBounds(
  bounds: CanvasWorldBounds,
  dimensions: CanvasDimensions,
  options: { padding?: number; minScale?: number; maxScale?: number } = {},
): CanvasViewportTransform {
  const padding = Math.max(0, options.padding ?? 24);
  const availableWidth = Math.max(1, dimensions.width - (padding * 2));
  const availableHeight = Math.max(1, dimensions.height - (padding * 2));
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = clampCanvasScale(
    Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
    options.minScale ?? 0.1,
    options.maxScale ?? 3,
  );
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  return centerViewportOnWorldPoint(
    { x: 0, y: 0, scale },
    center,
    scale,
    options.minScale,
    options.maxScale,
  );
}

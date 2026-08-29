export type BubbleDensity = 'low' | 'medium' | 'high';

interface BubbleViewport {
  width: number;
  height: number;
}

export interface BubbleVisibilityPlan {
  densityTarget: number;
  viewportCapacity: number;
  visibleCount: number;
  capacityLimited: boolean;
}

const DENSITY_RATIOS: Record<BubbleDensity, number> = {
  low: 0.3,
  medium: 0.7,
  high: 1,
};

/**
 * React renders once before the canvas can report a real layout box. Keep that
 * unmeasured frame bounded so a large task collection cannot materialize
 * thousands of bubble components while `useLayoutEffect` is still waiting to
 * record the viewport. A measured viewport replaces this fallback immediately.
 */
export const UNMEASURED_VIEWPORT_CAPACITY = 100;

function positiveFinite(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Estimate how many complete bubble affordances fit without treating the
 * viewport as an empty rectangle. Compact canvases reserve the upper controls
 * and the lower quick-capture/navigation zone, and use a larger cell for the
 * visible readiness and urgency labels.
 */
export function getViewportBubbleCapacity(
  viewport: BubbleViewport,
): number | null {
  const width = positiveFinite(viewport.width);
  const height = positiveFinite(viewport.height);
  if (width === 0 || height === 0) return null;

  const compact = width < 640;
  const horizontalReserve = compact ? 32 : 48;
  const topReserve = compact ? Math.min(244, height * 0.42) : 96;
  const bottomReserve = compact ? 104 : 80;
  const cellWidth = compact ? 136 : 116;
  const cellHeight = compact ? 120 : 116;
  const usableWidth = Math.max(0, width - horizontalReserve);
  const usableHeight = Math.max(0, height - topReserve - bottomReserve);
  const columns = Math.max(1, Math.floor(usableWidth / cellWidth));
  const rows = Math.max(1, Math.floor(usableHeight / cellHeight));

  return columns * rows;
}

/**
 * Preserve density as a user-controlled expression while preventing a
 * percentage-only choice from overfilling a small canvas. The plan changes
 * only how many readiness-ordered projections are drawn; every canonical task
 * remains available to the navigator.
 */
export function planBubbleVisibility(
  total: number,
  density: BubbleDensity,
  viewport: BubbleViewport,
): BubbleVisibilityPlan {
  const safeTotal = Math.max(0, Math.floor(positiveFinite(total)));
  if (safeTotal === 0) {
    return {
      densityTarget: 0,
      viewportCapacity: 0,
      visibleCount: 0,
      capacityLimited: false,
    };
  }

  const ratio = DENSITY_RATIOS[density];
  const densityTarget = Math.ceil(safeTotal * ratio);
  const measuredCapacity = getViewportBubbleCapacity(viewport);
  const viewportCapacity = measuredCapacity
    ?? Math.min(safeTotal, UNMEASURED_VIEWPORT_CAPACITY);
  const densityCapacity = Math.max(1, Math.ceil(viewportCapacity * ratio));
  const visibleCount = Math.min(
    safeTotal,
    densityTarget,
    densityCapacity,
  );

  return {
    densityTarget,
    viewportCapacity,
    visibleCount,
    capacityLimited: visibleCount < densityTarget,
  };
}

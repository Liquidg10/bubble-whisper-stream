/**
 * Unified Coordinate System for Atomic Renderer
 * Provides consistent world-to-screen and screen-to-world transformations
 */

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Centralized coordinate transformation system
 */
export class CoordinateSystem {
  private viewport: ViewportState;

  constructor(viewport: ViewportState) {
    this.viewport = viewport;
  }

  /**
   * Update viewport state
   */
  updateViewport(viewport: ViewportState) {
    this.viewport = viewport;
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldPoint: WorldPoint): ScreenPoint {
    const centerX = this.viewport.width / 2;
    const centerY = this.viewport.height / 2;
    
    return {
      x: (worldPoint.x + this.viewport.x) * this.viewport.scale + centerX,
      y: (worldPoint.y + this.viewport.y) * this.viewport.scale + centerY
    };
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenPoint: ScreenPoint): WorldPoint {
    const centerX = this.viewport.width / 2;
    const centerY = this.viewport.height / 2;
    
    return {
      x: (screenPoint.x - centerX) / this.viewport.scale - this.viewport.x,
      y: (screenPoint.y - centerY) / this.viewport.scale - this.viewport.y
    };
  }

  /**
   * Calculate electron position in world space (stable orbits)
   */
  calculateElectronWorldPosition(
    moleculeWorld: WorldPoint,
    shell: number,
    angle: number,
    shellRadius: number
  ): WorldPoint {
    return {
      x: moleculeWorld.x + Math.cos(angle) * shellRadius,
      y: moleculeWorld.y + Math.sin(angle) * shellRadius
    };
  }

  /**
   * Calculate distance between two points in world space
   */
  worldDistance(point1: WorldPoint, point2: WorldPoint): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get viewport center in world coordinates
   */
  getWorldCenter(): WorldPoint {
    return this.screenToWorld({ x: this.viewport.width / 2, y: this.viewport.height / 2 });
  }

  /**
   * Check if world point is visible in current viewport
   */
  isWorldPointVisible(worldPoint: WorldPoint, margin = 100): boolean {
    const screenPoint = this.worldToScreen(worldPoint);
    return (
      screenPoint.x >= -margin &&
      screenPoint.x <= this.viewport.width + margin &&
      screenPoint.y >= -margin &&
      screenPoint.y <= this.viewport.height + margin
    );
  }
}
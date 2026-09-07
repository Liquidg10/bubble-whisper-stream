import type { CanvasPoint } from '@/lib/canvasGeometry';

export const ORBIT_SETTLE_DURATION = 360;

/** Travel around the nucleus, rather than taking a chord through its center. */
export function interpolateOrbit(from: CanvasPoint, to: CanvasPoint, progress: number): CanvasPoint {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return from;
  if (t === 1) return to;
  const eased = 1 - ((1 - t) ** 3);
  const fromAngle = Math.atan2(from.y, from.x);
  const toAngle = Math.atan2(to.y, to.x);
  const angleDelta = Math.atan2(Math.sin(toAngle - fromAngle), Math.cos(toAngle - fromAngle));
  const radius = Math.hypot(from.x, from.y)
    + (Math.hypot(to.x, to.y) - Math.hypot(from.x, from.y)) * eased;
  const angle = fromAngle + angleDelta * eased;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** Keep the drop near the hand while retaining the ring's collision-free slots. */
export function nearestFreeOrbitSlot(
  angle: number,
  slotCount: number,
  occupied: ReadonlySet<number>,
  phase = 0,
): number | null {
  let nearest: number | null = null;
  let shortest = Number.POSITIVE_INFINITY;
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (occupied.has(slot)) continue;
    const delta = ((Math.PI * 2 * slot) / slotCount) + phase - angle;
    const distance = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    if (distance < shortest) {
      shortest = distance;
      nearest = slot;
    }
  }
  return nearest;
}

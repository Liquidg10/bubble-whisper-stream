/** Public scene coordinates match the flat app: x right, y down, z toward you. */
export interface SpatialPoint { x: number; y: number; z: number }
export interface SpatialCamera { position: SpatialPoint; target: SpatialPoint }
export interface SpatialRay { origin: SpatialPoint; direction: SpatialPoint }
export interface SpatialDragPlane { point: SpatialPoint; normal: SpatialPoint; grabOffset: SpatialPoint }
export type SpatialShell = 0 | 1 | 2;
export interface SpatialElectron {
  id: string;
  taskId: string;
  label: string;
  shell: SpatialShell;
  angle: number;
  flavor?: 'electron' | 'proton' | 'neutron';
  completed?: boolean;
  pending?: boolean;
  highlighted?: boolean;
}
export interface SpatialMolecule {
  id: string;
  label: string;
  position: SpatialPoint;
  color?: string;
  selected?: boolean;
  electrons: readonly SpatialElectron[];
}
export interface SpatialBond {
  id: string;
  fromMoleculeId: string;
  toMoleculeId: string;
  fromElectronId?: string;
  toElectronId?: string;
  kind?: 'shared' | 'supports' | 'depends-on' | 'tradeoff';
  highlighted?: boolean;
}
export interface SpatialElectronMove {
  moleculeId: string;
  electronId: string;
  taskId: string;
  fromShell: SpatialShell;
  shell: SpatialShell;
  angle: number;
}

export const SPATIAL_SHELL_RADII = [64, 116, 168] as const;
export const SPATIAL_SHELL_CAPACITY = [8, 14, 21] as const;
export const SPATIAL_PARTICLE_LIMIT = 320;
export const SPATIAL_FIELD_OF_VIEW = 42;
const TAU = Math.PI * 2;

export function isSpatialPoint(value: SpatialPoint | undefined): value is SpatialPoint {
  return !!value && [value.x, value.y, value.z].every(number => Number.isFinite(number) && Math.abs(number) <= 1_000_000);
}
/** The cap bounds GPU work; the ordinary task navigator remains authoritative. */
export function visibleSpatialElectrons(molecules: readonly SpatialMolecule[]): { molecule: SpatialMolecule; electron: SpatialElectron }[] {
  const visible: { molecule: SpatialMolecule; electron: SpatialElectron }[] = [];
  for (const molecule of molecules) {
    if (!isSpatialPoint(molecule.position)) continue;
    const counts = [0, 0, 0]; const seen = new Set<string>();
    for (const electron of molecule.electrons) {
      if (visible.length >= SPATIAL_PARTICLE_LIMIT) return visible;
      if (seen.has(electron.id) || ![0, 1, 2].includes(electron.shell) || !Number.isFinite(electron.angle) ||
        counts[electron.shell] >= SPATIAL_SHELL_CAPACITY[electron.shell]) continue;
      seen.add(electron.id); counts[electron.shell] += 1;
      visible.push({ molecule, electron });
    }
  }
  return visible;
}
export const addSpatialPoints = (a: SpatialPoint, b: SpatialPoint): SpatialPoint => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subtractSpatialPoints = (a: SpatialPoint, b: SpatialPoint): SpatialPoint => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: SpatialPoint, factor: number): SpatialPoint => ({ x: a.x * factor, y: a.y * factor, z: a.z * factor });
const dot = (a: SpatialPoint, b: SpatialPoint) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: SpatialPoint) => Math.hypot(a.x, a.y, a.z);
export const normalizeSpatialAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** Each shell has a genuine, fixed plane in the 3D scene. */
function shellBasis(shell: SpatialShell): [SpatialPoint, SpatialPoint] {
  const tilt = [0.2, -0.5, 0.72][shell];
  const yaw = [-0.18, 0.35, -0.3][shell];
  return [
    { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
    { x: Math.sin(yaw) * Math.sin(tilt), y: Math.cos(tilt), z: Math.cos(yaw) * Math.sin(tilt) },
  ];
}

export function spatialOrbitPoint(shell: SpatialShell, angle: number): SpatialPoint {
  const [u, v] = shellBasis(shell);
  return addSpatialPoints(scale(u, SPATIAL_SHELL_RADII[shell] * Math.cos(angle)), scale(v, SPATIAL_SHELL_RADII[shell] * Math.sin(angle)));
}

/** Closest point on the three actual shell curves, not distance from screen center. */
export function closestSpatialOrbit(point: SpatialPoint, fallbackAngle = 0): { shell: SpatialShell; angle: number; position: SpatialPoint } {
  let best: { shell: SpatialShell; angle: number; position: SpatialPoint; distance: number } | undefined;
  for (const shell of [0, 1, 2] as const) {
    const [u, v] = shellBasis(shell);
    const x = dot(point, u); const y = dot(point, v);
    const angle = normalizeSpatialAngle(Math.hypot(x, y) < 0.0001 ? fallbackAngle : Math.atan2(y, x));
    const position = spatialOrbitPoint(shell, angle);
    const distance = length(subtractSpatialPoints(point, position));
    if (!best || distance < best.distance) best = { shell, angle, position, distance };
  }
  return { shell: best!.shell, angle: best!.angle, position: best!.position };
}

export function intersectSpatialPlane(ray: SpatialRay, point: SpatialPoint, normal: SpatialPoint): SpatialPoint | undefined {
  const denominator = dot(ray.direction, normal);
  if (Math.abs(denominator) < 0.000001) return undefined;
  const distance = dot(subtractSpatialPoints(point, ray.origin), normal) / denominator;
  if (distance < 0 || !Number.isFinite(distance)) return undefined;
  return addSpatialPoints(ray.origin, scale(ray.direction, distance));
}

/** The plane passes through the picked center; preserve the original grab offset. */
export function createSpatialDragPlane(ray: SpatialRay, center: SpatialPoint, cameraDirection: SpatialPoint): SpatialDragPlane | undefined {
  const magnitude = length(cameraDirection);
  if (magnitude < 0.000001) return undefined;
  const normal = scale(cameraDirection, 1 / magnitude);
  const hit = intersectSpatialPlane(ray, center, normal);
  return hit ? { point: { ...center }, normal, grabOffset: subtractSpatialPoints(hit, center) } : undefined;
}

export function moveOnSpatialDragPlane(ray: SpatialRay, drag: SpatialDragPlane): SpatialPoint | undefined {
  const hit = intersectSpatialPlane(ray, drag.point, drag.normal);
  return hit ? subtractSpatialPoints(hit, drag.grabOffset) : undefined;
}

/** Fit once or on an explicit Fit action. Position commits must not reset the camera. */
export function fitSpatialCamera(molecules: readonly { position: SpatialPoint }[], aspect = 1): SpatialCamera {
  const positions = molecules.map(molecule => molecule.position).filter(isSpatialPoint);
  const min = { x: Infinity, y: Infinity, z: Infinity }; const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const position of positions) for (const axis of ['x', 'y', 'z'] as const) {
    min[axis] = Math.min(min[axis], position[axis]); max[axis] = Math.max(max[axis], position[axis]);
  }
  const target = positions.length ? scale(addSpatialPoints(min, max), 0.5) : { x: 0, y: 0, z: 0 };
  const radius = positions.length ? Math.max(...positions.map(position => length(subtractSpatialPoints(position, target)))) + 205 : 240;
  const vertical = SPATIAL_FIELD_OF_VIEW * Math.PI / 360;
  const halfAngle = Math.atan(Math.tan(vertical) * Math.min(1, Math.max(0.1, Number.isFinite(aspect) ? aspect : 1)));
  const distance = Math.max(450, radius / Math.sin(halfAngle) * 1.12);
  return { target, position: addSpatialPoints(target, scale({ x: 0.2357, y: -0.2357, z: 0.9428 }, distance)) };
}

/** Positive azimuth turns right; positive polar angle lowers the camera. Radians. */
export function orbitSpatialCamera(camera: SpatialCamera, azimuthDelta: number, polarDelta: number): SpatialCamera {
  const offset = subtractSpatialPoints(camera.position, camera.target); const radius = Math.max(120, length(offset));
  const theta = Math.atan2(offset.x, offset.z) + azimuthDelta;
  const phi = Math.max(0.06, Math.min(Math.PI - 0.06, Math.acos(Math.max(-1, Math.min(1, -offset.y / radius))) + polarDelta));
  return { target: { ...camera.target }, position: addSpatialPoints(camera.target, { x: radius * Math.sin(phi) * Math.sin(theta), y: -radius * Math.cos(phi), z: radius * Math.sin(phi) * Math.cos(theta) }) };
}

/** factor < 1 zooms in; factor > 1 zooms out. Never crosses the camera target. */
export function zoomSpatialCamera(camera: SpatialCamera, factor: number): SpatialCamera {
  const offset = subtractSpatialPoints(camera.position, camera.target); const distance = length(offset);
  if (!Number.isFinite(factor) || factor <= 0 || distance < 0.000001) return camera;
  const next = Math.max(120, Math.min(250_000, distance * factor));
  return { target: { ...camera.target }, position: addSpatialPoints(camera.target, scale(offset, next / distance)) };
}

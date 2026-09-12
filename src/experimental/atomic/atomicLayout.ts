import type { TimeHorizon } from '@/types/task';

export const ATOMIC_LAYOUT_VERSION = 1 as const;
export const ATOMIC_LAYOUT_LIMITS = {
  coordinate: 100_000,
  molecules: 256,
  orbits: 5_000,
  identifierLength: 512,
  serializedLength: 2_000_000,
} as const;

export interface AtomicMoleculePose { x: number; y: number; z: number }
export interface AtomicOrbitPlacement {
  domainId: string;
  taskId: string;
  /** This guards the angle; canonical Task horizon always remains authoritative. */
  shell: TimeHorizon;
  angle: number;
}
export interface AtomicLayoutSnapshot {
  version: typeof ATOMIC_LAYOUT_VERSION;
  molecules: Record<string, AtomicMoleculePose>;
  orbits: Record<string, AtomicOrbitPlacement>;
}
export type AtomicLayoutScope = { kind: 'account'; ownerId: string } | { kind: 'guest' };
export interface AtomicLayoutIdentity {
  ownerId: string | null;
  sessionOwnerId: string | null;
  authLoading: boolean;
}
export interface AtomicLayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ZERO_OWNER = '00000000-0000-0000-0000-000000000000';
const TAU = Math.PI * 2;
const SHELLS: ReadonlySet<string> = new Set(['today', 'week', 'later']);
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isIdentifier = (value: unknown): value is string => typeof value === 'string' && value.length <= ATOMIC_LAYOUT_LIMITS.identifierLength
  && value.trim().length > 0 && Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  && Math.abs(value) <= ATOMIC_LAYOUT_LIMITS.coordinate;

/** Match AuthProvider's accepted account identity; uncertain auth is not a guest. */
export function resolveAtomicLayoutScope(identity: AtomicLayoutIdentity): AtomicLayoutScope | null {
  if (identity.authLoading) return null;
  if (identity.ownerId === null && identity.sessionOwnerId === null) return { kind: 'guest' };
  if (typeof identity.ownerId === 'string' && identity.ownerId === identity.sessionOwnerId
    && OWNER_ID.test(identity.ownerId) && identity.ownerId !== ZERO_OWNER) return { kind: 'account', ownerId: identity.ownerId };
  return null;
}

export function atomicLayoutScopeId(scope: AtomicLayoutScope): string {
  return scope.kind === 'guest' ? 'guest' : `account:${scope.ownerId}`;
}

export function atomicLayoutStorageKey(scope: AtomicLayoutScope): string {
  return `mind-manual:atomic-layout:v1:${atomicLayoutScopeId(scope)}`;
}

export function atomicOrbitKey(domainId: string, taskId: string): string {
  return JSON.stringify([domainId, taskId]);
}

export function emptyAtomicLayout(): AtomicLayoutSnapshot {
  return { version: ATOMIC_LAYOUT_VERSION, molecules: Object.create(null), orbits: Object.create(null) };
}

/** Copy only the understood layout schema; reject corrupt geometry as a whole. */
export function validateAtomicLayout(value: unknown): AtomicLayoutSnapshot {
  if (!isRecord(value) || value.version !== ATOMIC_LAYOUT_VERSION || !isRecord(value.molecules) || !isRecord(value.orbits)) {
    throw new Error('The saved layout format needs review. Retry loading it or reset this layout.');
  }
  const moleculeEntries = Object.entries(value.molecules);
  const orbitEntries = Object.entries(value.orbits);
  if (moleculeEntries.length > ATOMIC_LAYOUT_LIMITS.molecules || orbitEntries.length > ATOMIC_LAYOUT_LIMITS.orbits) {
    throw new Error('This layout has more saved positions than this view supports.');
  }
  const result = emptyAtomicLayout();
  for (const [domainId, pose] of moleculeEntries) {
    if (!isIdentifier(domainId) || !isRecord(pose) || !isCoordinate(pose.x) || !isCoordinate(pose.y) || !isCoordinate(pose.z)) {
      throw new Error('A saved molecule position is invalid. Retry loading or reset this layout.');
    }
    result.molecules[domainId] = { x: pose.x, y: pose.y, z: pose.z };
  }
  for (const [key, orbit] of orbitEntries) {
    if (!isRecord(orbit) || !isIdentifier(orbit.domainId) || !isIdentifier(orbit.taskId)
      || key !== atomicOrbitKey(orbit.domainId, orbit.taskId) || typeof orbit.shell !== 'string' || !SHELLS.has(orbit.shell)
      || typeof orbit.angle !== 'number' || !Number.isFinite(orbit.angle) || orbit.angle < 0 || orbit.angle >= TAU) {
      throw new Error('A saved orbit position is invalid. Retry loading or reset this layout.');
    }
    result.orbits[key] = { domainId: orbit.domainId, taskId: orbit.taskId, shell: orbit.shell as TimeHorizon, angle: orbit.angle };
  }
  return result;
}

export function getMoleculePose(layout: AtomicLayoutSnapshot, domainId: string): AtomicMoleculePose | undefined {
  return owns(layout.molecules, domainId) ? layout.molecules[domainId] : undefined;
}

export function getOrbitPlacement(layout: AtomicLayoutSnapshot, domainId: string, taskId: string): AtomicOrbitPlacement | undefined {
  const key = atomicOrbitKey(domainId, taskId);
  return owns(layout.orbits, key) ? layout.orbits[key] : undefined;
}

export function atomicLayoutsEqual(left: AtomicLayoutSnapshot, right: AtomicLayoutSnapshot): boolean {
  const compareId = ([a]: [string, unknown], [b]: [string, unknown]) => a < b ? -1 : a > b ? 1 : 0;
  const stable = (layout: AtomicLayoutSnapshot) => JSON.stringify([
    Object.entries(layout.molecules).sort(compareId).map(([id, pose]) => [id, pose.x, pose.y, pose.z]),
    Object.entries(layout.orbits).sort(compareId).map(([id, orbit]) => [id, orbit.domainId, orbit.taskId, orbit.shell, orbit.angle]),
  ]);
  return left.version === right.version && stable(left) === stable(right);
}

export function withMoleculePose(layout: AtomicLayoutSnapshot, domainId: string, pose: AtomicMoleculePose): AtomicLayoutSnapshot {
  return validateAtomicLayout({ ...layout, molecules: { ...layout.molecules, [domainId]: pose } });
}

export function withOrbitPlacement(layout: AtomicLayoutSnapshot, domainId: string, taskId: string,
  placement: Pick<AtomicOrbitPlacement, 'shell' | 'angle'>): AtomicLayoutSnapshot {
  if (!Number.isFinite(placement.angle) || Math.abs(placement.angle) > TAU * 10_000) throw new Error('This orbit angle is outside the supported range.');
  const angle = ((placement.angle % TAU) + TAU) % TAU;
  return validateAtomicLayout({ ...layout, orbits: { ...layout.orbits,
    [atomicOrbitKey(domainId, taskId)]: { domainId, taskId, shell: placement.shell, angle },
  } });
}

export interface AtomicLayoutRead {
  layout: AtomicLayoutSnapshot;
  exists: boolean;
}

export class AtomicLayoutConflictError extends Error {
  constructor() {
    super('The saved layout changed in another view. Retry loads the latest saved positions; then try your move again.');
    this.name = 'AtomicLayoutConflictError';
  }
}

/** Corruption and unavailable storage throw; neither is treated as an empty save. */
export function readAtomicLayout(storage: AtomicLayoutStorage, scope: AtomicLayoutScope): AtomicLayoutRead {
  const raw = storage.getItem(atomicLayoutStorageKey(scope));
  if (raw === null) return { layout: emptyAtomicLayout(), exists: false };
  if (raw.length > ATOMIC_LAYOUT_LIMITS.serializedLength) throw new Error('The saved layout is too large to load safely.');
  let envelope: unknown;
  try { envelope = JSON.parse(raw); } catch { throw new Error('The saved layout could not be read. Retry loading or reset this layout.'); }
  if (!isRecord(envelope) || envelope.scope !== atomicLayoutScopeId(scope)
    || typeof envelope.updatedAt !== 'number' || !Number.isFinite(envelope.updatedAt) || envelope.updatedAt < 0) {
    throw new Error('The saved layout does not match this local profile. Retry loading or reset this layout.');
  }
  return { layout: validateAtomicLayout(envelope), exists: true };
}

/** A success receipt requires the exact written value to be readable afterward. */
export function writeAtomicLayout(storage: AtomicLayoutStorage, scope: AtomicLayoutScope,
  layout: AtomicLayoutSnapshot, now: number = Date.now(), expected?: AtomicLayoutSnapshot): AtomicLayoutSnapshot {
  const current = readAtomicLayout(storage, scope).layout;
  const validated = validateAtomicLayout(layout);
  if (expected && !atomicLayoutsEqual(current, expected) && !atomicLayoutsEqual(current, validated)) throw new AtomicLayoutConflictError();
  if (!Number.isFinite(now) || now < 0) throw new Error('The layout save time is invalid.');
  const raw = JSON.stringify({ ...validated, scope: atomicLayoutScopeId(scope), updatedAt: now });
  if (raw.length > ATOMIC_LAYOUT_LIMITS.serializedLength) throw new Error('This layout is too large to save.');
  const key = atomicLayoutStorageKey(scope);
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('The layout save could not be verified.');
  return validated;
}

/** Reset is explicit and removes only the active local profile's layout. */
export function resetAtomicLayout(storage: AtomicLayoutStorage, scope: AtomicLayoutScope): AtomicLayoutSnapshot {
  const key = atomicLayoutStorageKey(scope);
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw new Error('The layout reset could not be verified.');
  return emptyAtomicLayout();
}

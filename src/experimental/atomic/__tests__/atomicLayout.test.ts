import { describe, expect, it, vi } from 'vitest';
import {
  ATOMIC_LAYOUT_LIMITS, atomicLayoutStorageKey, atomicOrbitKey, emptyAtomicLayout, getMoleculePose, getOrbitPlacement,
  readAtomicLayout, resetAtomicLayout, resolveAtomicLayoutScope, validateAtomicLayout, withMoleculePose,
  withOrbitPlacement, writeAtomicLayout, type AtomicLayoutScope, type AtomicLayoutSnapshot, type AtomicLayoutStorage,
} from '../atomicLayout';

const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const account: AtomicLayoutScope = { kind: 'account', ownerId: owner };
const guest: AtomicLayoutScope = { kind: 'guest' };
function memoryStorage(): AtomicLayoutStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }) };
}

describe('Atomic layout scope and schema', () => {
  it('admits only settled matching accounts or an explicitly settled guest', () => {
    expect(resolveAtomicLayoutScope({ ownerId: owner, sessionOwnerId: owner, authLoading: false })).toEqual(account);
    expect(resolveAtomicLayoutScope({ ownerId: null, sessionOwnerId: null, authLoading: false })).toEqual(guest);
    for (const identity of [
      { ownerId: owner, sessionOwnerId: owner, authLoading: true },
      { ownerId: owner, sessionOwnerId: otherOwner, authLoading: false },
      { ownerId: null, sessionOwnerId: owner, authLoading: false },
      { ownerId: owner, sessionOwnerId: null, authLoading: false },
      { ownerId: 'guest', sessionOwnerId: 'guest', authLoading: false },
      { ownerId: '00000000-0000-0000-0000-000000000000', sessionOwnerId: '00000000-0000-0000-0000-000000000000', authLoading: false },
    ]) expect(resolveAtomicLayoutScope(identity)).toBeNull();
  });

  it('roundtrips separate xyz molecule poses and per-task orbit positions without modifying the input', () => {
    const empty = emptyAtomicLayout();
    const moved = withMoleculePose(empty, 'custom_work', { x: -230, y: 145, z: 80 });
    const placed = withOrbitPlacement(moved, 'custom_work', 'task/one', { shell: 'week', angle: -Math.PI / 2 });
    const storage = memoryStorage();
    writeAtomicLayout(storage, account, placed, 10);
    const restored = readAtomicLayout(storage, account);
    expect(restored.exists).toBe(true);
    expect(restored.layout).toEqual(placed);
    expect(getMoleculePose(restored.layout, 'custom_work')).toEqual({ x: -230, y: 145, z: 80 });
    expect(getOrbitPlacement(restored.layout, 'custom_work', 'task/one')).toEqual({ domainId: 'custom_work', taskId: 'task/one', shell: 'week', angle: Math.PI * 1.5 });
    expect(empty.molecules).toEqual({});
    expect(moved.orbits).toEqual({});
    expect(JSON.parse(storage.values.get(atomicLayoutStorageKey(account))!)).toMatchObject({ version: 1, scope: `account:${owner}`, updatedAt: 10 });
  });

  it('uses collision-free orbit keys and handles prototype-like domain IDs as ordinary own keys', () => {
    expect(atomicOrbitKey('a:b', 'c')).not.toBe(atomicOrbitKey('a', 'b:c'));
    let layout = emptyAtomicLayout();
    expect(getMoleculePose(layout, '__proto__')).toBeUndefined();
    layout = withMoleculePose(layout, '__proto__', { x: 1, y: 2, z: 3 });
    expect(getMoleculePose(layout, '__proto__')).toEqual({ x: 1, y: 2, z: 3 });
    expect(Object.getPrototypeOf(layout.molecules)).toBeNull();
    expect(getMoleculePose(layout, 'constructor')).toBeUndefined();
  });

  it.each([NaN, Infinity, -Infinity, ATOMIC_LAYOUT_LIMITS.coordinate + 1])('rejects invalid pose coordinate %s', x => {
    expect(() => withMoleculePose(emptyAtomicLayout(), 'career', { x, y: 0, z: 0 })).toThrow('position is invalid');
  });

  it('rejects invalid identifiers, shell/angle data, and capacity overflow', () => {
    for (const id of ['', ' ', 'line\nbreak', 'a'.repeat(ATOMIC_LAYOUT_LIMITS.identifierLength + 1)]) {
      expect(() => withMoleculePose(emptyAtomicLayout(), id, { x: 1, y: 2, z: 3 })).toThrow();
    }
    expect(() => withOrbitPlacement(emptyAtomicLayout(), 'career', 'task', { shell: 'future' as 'week', angle: 0 })).toThrow();
    expect(() => withOrbitPlacement(emptyAtomicLayout(), 'career', 'task', { shell: 'week', angle: Infinity })).toThrow();
    const layout = emptyAtomicLayout();
    layout.molecules = Object.fromEntries(Array.from({ length: ATOMIC_LAYOUT_LIMITS.molecules + 1 }, (_, i) => [`area-${i}`, { x: i, y: 0, z: 0 }]));
    expect(() => validateAtomicLayout(layout)).toThrow('more saved positions');
    const badKey = emptyAtomicLayout();
    badKey.orbits.wrong = { domainId: 'career', taskId: 'task', shell: 'week', angle: 0 };
    expect(() => validateAtomicLayout(badKey)).toThrow('orbit position is invalid');
  });

  it('does not let an orbit angle become authoritative over a canonical horizon', () => {
    const layout = withOrbitPlacement(emptyAtomicLayout(), 'career', 'task', { shell: 'week', angle: Math.PI });
    expect(getOrbitPlacement(layout, 'career', 'task')?.shell).toBe('week');
    expect(Object.keys(layout)).toEqual(['version', 'molecules', 'orbits']);
    expect(layout).not.toHaveProperty('bubbles');
    expect(layout).not.toHaveProperty('tasks');
  });
});

describe('Atomic layout persistence receipts', () => {
  it('isolates two accounts and guest data, with no migration or copy', () => {
    const storage = memoryStorage();
    const accountLayout = withMoleculePose(emptyAtomicLayout(), 'career', { x: 1, y: 2, z: 3 });
    writeAtomicLayout(storage, account, accountLayout);
    expect(readAtomicLayout(storage, guest)).toMatchObject({ exists: false, layout: emptyAtomicLayout() });
    expect(readAtomicLayout(storage, { kind: 'account', ownerId: otherOwner }).exists).toBe(false);
    expect(storage.values.size).toBe(1);
  });

  it.each(['broken-json', 'version', 'wrong-owner', 'geometry', 'oversized'])('preserves %s state rather than silently overwriting it', scenario => {
    const storage = memoryStorage();
    const key = atomicLayoutStorageKey(account);
    const raw = scenario === 'broken-json' ? '{'
      : scenario === 'oversized' ? ' '.repeat(ATOMIC_LAYOUT_LIMITS.serializedLength + 1)
        : JSON.stringify({ ...emptyAtomicLayout(), scope: scenario === 'wrong-owner' ? `account:${otherOwner}` : `account:${owner}`,
          updatedAt: 1, version: scenario === 'version' ? 2 : 1,
          molecules: scenario === 'geometry' ? { career: { x: null, y: 0, z: 0 } } : {} });
    storage.values.set(key, raw);
    expect(() => readAtomicLayout(storage, account)).toThrow();
    expect(() => writeAtomicLayout(storage, account, emptyAtomicLayout())).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(key)).toBe(raw);
  });

  it('does not report success when setItem throws or exact read-back differs', () => {
    const storage = memoryStorage();
    const layout = withMoleculePose(emptyAtomicLayout(), 'career', { x: 1, y: 2, z: 3 });
    vi.mocked(storage.setItem).mockImplementationOnce(() => { throw new Error('quota'); });
    expect(() => writeAtomicLayout(storage, account, layout)).toThrow('quota');
    vi.mocked(storage.setItem).mockImplementationOnce(() => {});
    expect(() => writeAtomicLayout(storage, account, layout)).toThrow('could not be verified');
  });

  it('reset removes only the active key and permits recovery from corrupt local layout state', () => {
    const storage = memoryStorage();
    storage.values.set(atomicLayoutStorageKey(account), '{bad');
    storage.values.set(atomicLayoutStorageKey(guest), 'keep guest');
    storage.values.set('unrelated-task-key', 'keep tasks');
    expect(resetAtomicLayout(storage, account)).toEqual(emptyAtomicLayout());
    expect(storage.values.get(atomicLayoutStorageKey(guest))).toBe('keep guest');
    expect(storage.values.get('unrelated-task-key')).toBe('keep tasks');
    expect(readAtomicLayout(storage, account).exists).toBe(false);
  });

  it('verifies reset removal and restores a validated snapshot for Undo', () => {
    const storage = memoryStorage();
    const before = withMoleculePose(emptyAtomicLayout(), 'career', { x: 1, y: 2, z: 3 });
    writeAtomicLayout(storage, account, before);
    vi.mocked(storage.removeItem).mockImplementationOnce(() => {});
    expect(() => resetAtomicLayout(storage, account)).toThrow('could not be verified');
    resetAtomicLayout(storage, account);
    writeAtomicLayout(storage, account, before);
    expect(readAtomicLayout(storage, account).layout).toEqual(before);
    expect(() => writeAtomicLayout(storage, account, { ...before, version: 2 } as unknown as AtomicLayoutSnapshot)).toThrow('format needs review');
  });
});

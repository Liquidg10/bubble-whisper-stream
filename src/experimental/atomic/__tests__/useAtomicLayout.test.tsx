import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtomicLayout } from '../useAtomicLayout';
import {
  atomicLayoutStorageKey, emptyAtomicLayout, getMoleculePose, readAtomicLayout, withMoleculePose, writeAtomicLayout,
  type AtomicLayoutIdentity, type AtomicLayoutScope,
} from '../atomicLayout';

const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const guestIdentity: AtomicLayoutIdentity = { ownerId: null, sessionOwnerId: null, authLoading: false };
const signedIn = (id = owner): AtomicLayoutIdentity => ({ ownerId: id, sessionOwnerId: id, authLoading: false });
const guest: AtomicLayoutScope = { kind: 'guest' };
const account: AtomicLayoutScope = { kind: 'account', ownerId: owner };
const pose = { x: 120, y: -180, z: 35 };

describe('useAtomicLayout persistence and identity lifecycle', () => {
  beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it('saves guest positions only in the current tab and restores them after remount', () => {
    const first = renderHook(() => useAtomicLayout(guestIdentity));
    expect(first.result.current.status).toBe('guest');
    expect(first.result.current.message).toContain('this tab');
    act(() => expect(first.result.current.saveMoleculePose('career', pose)).toBe(true));
    expect(window.sessionStorage.getItem(atomicLayoutStorageKey(guest))).not.toBeNull();
    expect(window.localStorage.length).toBe(0);
    first.unmount();
    const second = renderHook(() => useAtomicLayout(guestIdentity));
    expect(getMoleculePose(second.result.current.layout, 'career')).toEqual(pose);
    expect(second.result.current.scopeKey).toBe('guest');
  });

  it('uses account-local storage with no guest copying and restores the correct scope on return', () => {
    const view = renderHook((identity: AtomicLayoutIdentity) => useAtomicLayout(identity), { initialProps: guestIdentity });
    act(() => view.result.current.saveMoleculePose('guest-area', pose));
    view.rerender(signedIn());
    expect(view.result.current.status).toBe('saved');
    expect(view.result.current.layout.molecules).toEqual({});
    act(() => view.result.current.saveMoleculePose('private-area', { x: 9, y: 8, z: 7 }));
    view.rerender(signedIn(otherOwner));
    expect(view.result.current.layout.molecules).toEqual({});
    view.rerender(guestIdentity);
    expect(view.result.current.layout.molecules).toEqual({ 'guest-area': pose });
    view.rerender(signedIn());
    expect(view.result.current.layout.molecules).toEqual({ 'private-area': { x: 9, y: 8, z: 7 } });
    expect(window.sessionStorage.getItem(atomicLayoutStorageKey(guest))).not.toContain('private-area');
  });

  it('exposes no previous-owner geometry even during the first render of an auth transition', () => {
    const observed: Array<{ scope: string | null; keys: string[] }> = [];
    const view = renderHook((identity: AtomicLayoutIdentity) => {
      const layout = useAtomicLayout(identity);
      observed.push({ scope: layout.scopeKey, keys: Object.keys(layout.layout.molecules) });
      return layout;
    }, { initialProps: signedIn() });
    act(() => view.result.current.saveMoleculePose('private-area', pose));
    observed.length = 0;
    view.rerender(signedIn(otherOwner));
    expect(observed.every(item => !item.keys.includes('private-area'))).toBe(true);
    expect(observed.every(item => item.scope === `account:${otherOwner}`)).toBe(true);
  });

  it('keeps loading geometry stable across renders and blocks uncertain identity writes', () => {
    const identity = { ...signedIn(), authLoading: true };
    const view = renderHook((input: AtomicLayoutIdentity) => useAtomicLayout(input), { initialProps: identity });
    const empty = view.result.current.layout;
    view.rerender({ ...identity });
    expect(view.result.current.layout).toBe(empty);
    expect(view.result.current.status).toBe('loading');
    act(() => expect(view.result.current.saveMoleculePose('career', pose)).toBe(false));
    view.rerender({ ownerId: owner, sessionOwnerId: otherOwner, authLoading: false });
    expect(view.result.current.status).toBe('error');
    act(() => expect(view.result.current.resetLayout()).toBe(false));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('blocks callbacks captured before a scope switch, including a switch away and back', () => {
    const view = renderHook((identity: AtomicLayoutIdentity) => useAtomicLayout(identity), { initialProps: signedIn() });
    const staleSave = view.result.current.saveMoleculePose;
    const staleReset = view.result.current.resetLayout;
    view.rerender(guestIdentity);
    act(() => expect(staleSave('private-area', pose)).toBe(false));
    view.rerender(signedIn());
    act(() => expect(staleSave('private-area', pose)).toBe(false));
    act(() => expect(staleReset()).toBe(false));
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps failed saves unverified, retries only their active-scope candidate, and abandons it on owner change', () => {
    const view = renderHook((identity: AtomicLayoutIdentity) => useAtomicLayout(identity), { initialProps: signedIn() });
    const set = vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    act(() => expect(view.result.current.saveMoleculePose('career', pose)).toBe(false));
    expect(view.result.current.status).toBe('error');
    expect(view.result.current.layout.molecules).toEqual({});
    act(() => expect(view.result.current.retry()).toBe(true));
    expect(getMoleculePose(view.result.current.layout, 'career')).toEqual(pose);
    set.mockImplementationOnce(() => { throw new Error('quota'); });
    act(() => expect(view.result.current.saveMoleculePose('unsaved-private', pose)).toBe(false));
    const staleRetry = view.result.current.retry;
    view.rerender(signedIn(otherOwner));
    act(() => expect(staleRetry()).toBe(false));
    act(() => expect(view.result.current.retry()).toBe(true));
    expect(view.result.current.layout.molecules).toEqual({});
    expect(window.localStorage.getItem(atomicLayoutStorageKey({ kind: 'account', ownerId: otherOwner }))).toBeNull();
  });

  it('does not overwrite corrupt data on movement, but explicit reset repairs only that layout and Undo restores a snapshot', () => {
    const key = atomicLayoutStorageKey(guest);
    window.sessionStorage.setItem(key, '{broken');
    window.sessionStorage.setItem('other-data', 'keep');
    const view = renderHook(() => useAtomicLayout(guestIdentity));
    expect(view.result.current.status).toBe('error');
    act(() => expect(view.result.current.saveMoleculePose('career', pose)).toBe(false));
    expect(window.sessionStorage.getItem(key)).toBe('{broken');
    act(() => expect(view.result.current.resetLayout()).toBe(true));
    expect(view.result.current.status).toBe('guest');
    act(() => view.result.current.saveMoleculePose('career', pose));
    const before = view.result.current.layout;
    act(() => expect(view.result.current.resetLayout()).toBe(true));
    expect(window.sessionStorage.getItem(key)).toBeNull();
    act(() => expect(view.result.current.restoreLayout(before, emptyAtomicLayout())).toBe(true));
    expect(getMoleculePose(view.result.current.layout, 'career')).toEqual(pose);
    expect(window.sessionStorage.getItem('other-data')).toBe('keep');
  });

  it('retains a failed reset for explicit retry without claiming positions were cleared', () => {
    const view = renderHook(() => useAtomicLayout(guestIdentity));
    act(() => view.result.current.saveMoleculePose('career', pose));
    const remove = vi.spyOn(window.sessionStorage, 'removeItem').mockImplementationOnce(() => { throw new Error('denied'); });
    act(() => expect(view.result.current.resetLayout()).toBe(false));
    expect(getMoleculePose(view.result.current.layout, 'career')).toEqual(pose);
    expect(view.result.current.status).toBe('error');
    act(() => expect(view.result.current.retry()).toBe(true));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(view.result.current.layout.molecules).toEqual({});
  });

  it('merges focused moves with freshly saved positions from another view', () => {
    const view = renderHook(() => useAtomicLayout(signedIn()));
    const external = withMoleculePose(emptyAtomicLayout(), 'other-area', { x: 5, y: 6, z: 7 });
    writeAtomicLayout(window.localStorage, account, external);
    act(() => expect(view.result.current.saveMoleculePose('career', pose)).toBe(true));
    expect(view.result.current.layout.molecules).toEqual({ 'other-area': { x: 5, y: 6, z: 7 }, career: pose });
  });

  it('refuses a stale batched restore and Retry loads the latest layout without overwriting it', () => {
    const view = renderHook(() => useAtomicLayout(signedIn()));
    const expected = view.result.current.layout;
    const desired = withMoleculePose(expected, 'career', pose);
    const external = withMoleculePose(emptyAtomicLayout(), 'other-area', { x: 5, y: 6, z: 7 });
    writeAtomicLayout(window.localStorage, account, external);
    act(() => expect(view.result.current.restoreLayout(desired, expected)).toBe(false));
    expect(view.result.current.message).toContain('changed in another view');
    expect(readAtomicLayout(window.localStorage, account).layout).toEqual(external);
    act(() => expect(view.result.current.retry()).toBe(true));
    expect(view.result.current.layout).toEqual(external);
  });

  it('recognizes an already-persisted requested snapshot after uncertain read-back', () => {
    const view = renderHook(() => useAtomicLayout(signedIn()));
    const expected = view.result.current.layout;
    const desired = withMoleculePose(expected, 'career', pose);
    writeAtomicLayout(window.localStorage, account, desired);
    act(() => expect(view.result.current.restoreLayout(desired, expected)).toBe(true));
    expect(view.result.current.layout).toEqual(desired);
  });

  it('keeps an actual read-back failure unverified and retries the already-written snapshot safely', () => {
    const view = renderHook(() => useAtomicLayout(signedIn()));
    const before = view.result.current.layout;
    const desired = withMoleculePose(before, 'career', pose);
    const originalGet = window.localStorage.getItem.bind(window.localStorage);
    let failReadBack = true;
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(key => {
      const raw = originalGet(key);
      if (raw && failReadBack) { failReadBack = false; throw new Error('Read-back unavailable'); }
      return raw;
    });
    act(() => expect(view.result.current.restoreLayout(desired, before)).toBe(false));
    expect(view.result.current.status).toBe('error');
    expect(view.result.current.layout).toEqual(before);
    expect(originalGet(atomicLayoutStorageKey(account))).not.toBeNull();
    act(() => expect(view.result.current.retry()).toBe(true));
    expect(view.result.current.layout).toEqual(desired);
  });

  it('reports blocked storage reads and recovers only after an explicit retry', () => {
    const get = vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    const view = renderHook(() => useAtomicLayout(guestIdentity));
    expect(view.result.current.status).toBe('error');
    expect(view.result.current.message).toContain('Storage blocked');
    expect(view.result.current.layout).toEqual(emptyAtomicLayout());
    get.mockRestore();
    act(() => expect(view.result.current.retry()).toBe(true));
    expect(view.result.current.status).toBe('guest');
  });

  it('persists orbit placement separately from molecule positions and keeps the canonical shell as a guard', () => {
    const view = renderHook(() => useAtomicLayout(guestIdentity));
    act(() => expect(view.result.current.saveOrbitPlacement('career', 'task', { shell: 'week', angle: -Math.PI })).toBe(true));
    expect(Object.values(view.result.current.layout.orbits)).toEqual([{ domainId: 'career', taskId: 'task', shell: 'week', angle: Math.PI }]);
    expect(view.result.current.layout.molecules).toEqual({});
    const saved = view.result.current.layout;
    view.unmount();
    const restored = renderHook(() => useAtomicLayout(guestIdentity));
    expect(restored.result.current.layout).toEqual(saved);
  });

  it('reloads only the active scope on storage events and never writes after unmount', () => {
    const view = renderHook(() => useAtomicLayout(signedIn()));
    const external = withMoleculePose(emptyAtomicLayout(), 'career', pose);
    writeAtomicLayout(window.localStorage, account, external);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-key' })));
    expect(view.result.current.layout.molecules).toEqual({});
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: atomicLayoutStorageKey(account) })));
    expect(view.result.current.layout).toEqual(external);
    const save = view.result.current.saveMoleculePose;
    view.unmount();
    expect(save('after-unmount', pose)).toBe(false);
    expect(readAtomicLayout(window.localStorage, account).layout).toEqual(external);
  });
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  atomicLayoutScopeId, atomicLayoutStorageKey, atomicLayoutsEqual, emptyAtomicLayout, readAtomicLayout, resetAtomicLayout,
  AtomicLayoutConflictError,
  resolveAtomicLayoutScope, validateAtomicLayout, withMoleculePose, withOrbitPlacement, writeAtomicLayout,
  type AtomicLayoutIdentity, type AtomicLayoutScope, type AtomicLayoutSnapshot, type AtomicLayoutStorage,
  type AtomicMoleculePose, type AtomicOrbitPlacement,
} from './atomicLayout';

export type AtomicLayoutStatus = 'loading' | 'guest' | 'saved' | 'error';
interface LayoutState {
  scopeId: string | null;
  layout: AtomicLayoutSnapshot;
  status: AtomicLayoutStatus;
  message: string;
}
type LayoutOperation = { type: 'pose'; domainId: string; pose: AtomicMoleculePose }
  | { type: 'orbit'; domainId: string; taskId: string; placement: Pick<AtomicOrbitPlacement, 'shell' | 'angle'> }
  | { type: 'restore'; snapshot: AtomicLayoutSnapshot; expected?: AtomicLayoutSnapshot }
  | { type: 'reset' };

function storageFor(scope: AtomicLayoutScope): AtomicLayoutStorage {
  if (typeof window === 'undefined') throw new Error('Local layout storage is unavailable.');
  return scope.kind === 'guest' ? window.sessionStorage : window.localStorage;
}

const scopeMessage = (scope: AtomicLayoutScope) => scope.kind === 'guest'
  ? 'Guest layout is saved in this tab for reloads and view changes. Closing the tab clears it.'
  : 'Your layout is saved for this account in this browser. It does not sync to other devices.';

function unavailableState(identity: AtomicLayoutIdentity): LayoutState {
  return { scopeId: null, layout: emptyAtomicLayout(), status: identity.authLoading ? 'loading' : 'error',
    message: identity.authLoading ? 'Checking which local layout to load.' : 'Your account could not be verified. Layout saving is unavailable.' };
}

function loadScope(scope: AtomicLayoutScope): LayoutState {
  try {
    return { scopeId: atomicLayoutScopeId(scope), layout: readAtomicLayout(storageFor(scope), scope).layout,
      status: scope.kind === 'guest' ? 'guest' : 'saved', message: scopeMessage(scope) };
  } catch (error) {
    return { scopeId: atomicLayoutScopeId(scope), layout: emptyAtomicLayout(), status: 'error',
      message: error instanceof Error ? error.message : 'The local layout could not be loaded. Retry or reset this layout.' };
  }
}

/** User-committed local geometry only. No canonical task fields or cloud writes. */
export function useAtomicLayout(identity: AtomicLayoutIdentity) {
  const scope = resolveAtomicLayoutScope(identity);
  const scopeId = scope ? atomicLayoutScopeId(scope) : null;
  const previousScope = useRef(scopeId);
  const generation = useRef(0);
  if (previousScope.current !== scopeId) {
    previousScope.current = scopeId;
    generation.current += 1;
  }
  const scopeGeneration = generation.current;
  const loadedGeneration = useRef(scopeGeneration);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const mounted = useRef(false);
  const pending = useRef<{ scopeId: string; operation: LayoutOperation } | null>(null);
  const [state, setState] = useState<LayoutState>(() => scope ? loadScope(scope) : unavailableState(identity));
  const stateRef = useRef(state);
  const publish = useCallback((next: LayoutState) => {
    loadedGeneration.current = generation.current;
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current = null; };
  }, []);

  useEffect(() => {
    pending.current = null;
    const current = scopeRef.current;
    publish(current ? loadScope(current) : unavailableState(identityRef.current));
  }, [scopeId, scopeGeneration, identity.authLoading, publish]);

  useEffect(() => {
    if (!scopeId) return;
    const onStorage = (event: StorageEvent) => {
      const current = scopeRef.current;
      if (!current || generation.current !== scopeGeneration || atomicLayoutScopeId(current) !== scopeId
        || (event.key !== atomicLayoutStorageKey(current) && event.key !== null)) return;
      // Preserve a visible failed save for explicit retry; never silently replace it.
      if (!pending.current) publish(loadScope(current));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [scopeId, scopeGeneration, publish]);

  const run = useCallback((operation: LayoutOperation): boolean => {
    const current = scopeRef.current;
    if (!mounted.current || !current || generation.current !== scopeGeneration || loadedGeneration.current !== scopeGeneration
      || atomicLayoutScopeId(current) !== scopeId || stateRef.current.scopeId !== scopeId) return false;
    pending.current = { scopeId, operation };
    try {
      const storage = storageFor(current);
      let layout: AtomicLayoutSnapshot;
      if (operation.type === 'reset') layout = resetAtomicLayout(storage, current);
      else {
        // Re-read before each write so a move retains unrelated positions saved by another tab.
        const existing = readAtomicLayout(storage, current).layout;
        const next = operation.type === 'pose' ? withMoleculePose(existing, operation.domainId, operation.pose)
          : operation.type === 'orbit' ? withOrbitPlacement(existing, operation.domainId, operation.taskId, operation.placement)
            : validateAtomicLayout(operation.snapshot);
        if (operation.type === 'restore' && operation.expected && !atomicLayoutsEqual(existing, operation.expected)
          && !atomicLayoutsEqual(existing, next)) {
          throw new AtomicLayoutConflictError();
        }
        layout = writeAtomicLayout(storage, current, next, Date.now(), existing);
      }
      pending.current = null;
      publish({ scopeId, layout, status: current.kind === 'guest' ? 'guest' : 'saved', message: scopeMessage(current) });
      return true;
    } catch (error) {
      if (error instanceof AtomicLayoutConflictError) pending.current = null;
      publish({ ...stateRef.current, scopeId, status: 'error', message: `${error instanceof Error ? error.message : 'Layout saving is unavailable.'} Your layout change was not verified. Retry when storage is available.` });
      return false;
    }
  }, [scopeId, scopeGeneration, publish]);

  const saveMoleculePose = useCallback((domainId: string, pose: AtomicMoleculePose) => run({ type: 'pose', domainId, pose: { ...pose } }), [run]);
  const saveOrbitPlacement = useCallback((domainId: string, taskId: string, placement: Pick<AtomicOrbitPlacement, 'shell' | 'angle'>) =>
    run({ type: 'orbit', domainId, taskId, placement: { ...placement } }), [run]);
  const resetLayout = useCallback(() => run({ type: 'reset' }), [run]);
  const restoreLayout = useCallback((snapshot: AtomicLayoutSnapshot, expected?: AtomicLayoutSnapshot) => {
    try { return run({ type: 'restore', snapshot: validateAtomicLayout(snapshot),
      ...(expected ? { expected: validateAtomicLayout(expected) } : {}) }); }
    catch (error) {
      const current = scopeRef.current;
      if (mounted.current && current && generation.current === scopeGeneration && loadedGeneration.current === scopeGeneration
        && atomicLayoutScopeId(current) === scopeId && stateRef.current.scopeId === scopeId) {
        pending.current = null;
        publish({ ...stateRef.current, status: 'error', message: error instanceof Error ? error.message : 'This layout cannot be restored.' });
      }
      return false;
    }
  }, [run, scopeId, scopeGeneration, publish]);
  const retry = useCallback((): boolean => {
    const current = scopeRef.current;
    if (!mounted.current || !current || generation.current !== scopeGeneration || atomicLayoutScopeId(current) !== scopeId) return false;
    if (pending.current?.scopeId === scopeId) return run(pending.current.operation);
    const next = loadScope(current);
    publish(next);
    return next.status !== 'error';
  }, [scopeId, scopeGeneration, run, publish]);

  // Account changes cannot expose one render of the previous owner's positions.
  const visible = useMemo(() => !scopeRef.current
    ? unavailableState({ ...identityRef.current, authLoading: identity.authLoading })
    : state.scopeId === scopeId && loadedGeneration.current === scopeGeneration ? state
      : { scopeId, layout: emptyAtomicLayout(), status: 'loading' as const, message: 'Loading this local layout.' },
  [state, scopeId, scopeGeneration, identity.authLoading]);
  return { layout: visible.layout, scopeKey: scopeId, status: visible.status, message: visible.message,
    saveMoleculePose, saveOrbitPlacement, resetLayout, restoreLayout, retry };
}

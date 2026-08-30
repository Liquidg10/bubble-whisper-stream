import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';

const mock = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn(),
  signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), start: vi.fn(), stop: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: mock.getSession, onAuthStateChange: mock.onAuthStateChange, signOut: mock.signOut,
  signInWithPassword: mock.signInWithPassword, signUp: mock.signUp, signInWithOAuth: mock.signInWithOAuth,
} } }));
vi.mock('@/services/calendarTaskSyncManager', () => ({ calendarTaskSyncManager: { start: mock.start, stop: mock.stop } }));
vi.mock('sonner', () => ({ toast: { success: mock.toast } }));
import { AuthProvider } from '../AuthProvider';

const OWNER_A = '10000000-0000-4000-8000-000000000001';
const OWNER_B = '20000000-0000-4000-8000-000000000002';
const session = (id: string) => ({ user: { id } } as Session);
type SessionResult = { data: { session: Session | null }; error: Error | null };
const result = (value: Session | null, error: Error | null = null): SessionResult => ({ data: { session: value }, error });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function Consumer() {
  const auth = useAuth();
  return <><p data-testid="owner">{auth.user?.id ?? 'signed-out'}</p><p data-testid="loading">{String(auth.loading)}</p>
    <button onClick={() => { void auth.signOut(); }}>Sign out now</button>
    <button onClick={() => { void auth.signIn('fixture@example.test', 'fixture-not-a-real-password'); }}>Sign in now</button></>;
}

describe('AuthProvider calendar manager ownership', () => {
  const listeners: Array<{ callback: (event: AuthChangeEvent, value: Session | null) => void; unsubscribe: ReturnType<typeof vi.fn> }> = [];
  beforeEach(() => {
    vi.resetAllMocks();
    listeners.length = 0;
    mock.getSession.mockResolvedValue(result(null));
    mock.signOut.mockResolvedValue({ error: null });
    mock.onAuthStateChange.mockImplementation((callback) => {
      const listener = { callback, unsubscribe: vi.fn() };
      listeners.push(listener);
      return { data: { subscription: { unsubscribe: listener.unsubscribe } } };
    });
  });
  afterEach(() => cleanup());
  const emit = (event: AuthChangeEvent, value: Session | null) => act(() => { listeners.at(-1)!.callback(event, value); });

  it('starts only the current owner and does not restart on same-owner token refresh', async () => {
    mock.getSession.mockResolvedValue(result(session(OWNER_A)));
    const view = render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(mock.start).toHaveBeenCalledExactlyOnceWith(OWNER_A));
    const stopsBeforeRefresh = mock.stop.mock.calls.length;
    emit('TOKEN_REFRESHED', session(OWNER_A));
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(mock.stop).toHaveBeenCalledTimes(stopsBeforeRefresh);
    emit('SIGNED_IN', session(OWNER_B));
    expect(mock.start.mock.calls.map(([owner]) => owner)).toEqual([OWNER_A, OWNER_B]);
    expect(mock.stop.mock.invocationCallOrder.at(-1)).toBeLessThan(mock.start.mock.invocationCallOrder.at(-1)!);
    expect(screen.getByTestId('owner')).toHaveTextContent(OWNER_B);
    view.unmount();
    expect(listeners[0].unsubscribe).toHaveBeenCalledOnce();
    expect(mock.stop.mock.invocationCallOrder.at(-1)).toBeGreaterThan(mock.start.mock.invocationCallOrder.at(-1)!);
  });

  it('a sign-out auth event invalidates the older pending initial session', async () => {
    const pending = deferred<SessionResult>();
    mock.getSession.mockReturnValue(pending.promise);
    render(<AuthProvider><Consumer /></AuthProvider>);
    emit('SIGNED_OUT', null);
    await act(async () => { pending.resolve(result(session(OWNER_A))); await pending.promise; });
    expect(mock.start).not.toHaveBeenCalled();
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('a newer account event wins over an older bootstrap result', async () => {
    const pending = deferred<SessionResult>();
    mock.getSession.mockReturnValue(pending.promise);
    render(<AuthProvider><Consumer /></AuthProvider>);
    emit('SIGNED_IN', session(OWNER_B));
    await act(async () => { pending.resolve(result(session(OWNER_A))); await pending.promise; });
    expect(mock.start).toHaveBeenCalledExactlyOnceWith(OWNER_B);
    expect(screen.getByTestId('owner')).toHaveTextContent(OWNER_B);
  });

  it('stops synchronously before signOut awaits and ignores refresh while its outcome is pending', async () => {
    mock.getSession.mockResolvedValue(result(session(OWNER_A)));
    const signOut = deferred<{ error: Error | null }>();
    mock.signOut.mockReturnValue(signOut.promise);
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(mock.start).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    expect(mock.stop.mock.invocationCallOrder.at(-1)).toBeLessThan(mock.signOut.mock.invocationCallOrder[0]);
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
    emit('TOKEN_REFRESHED', session(OWNER_A));
    await act(async () => { signOut.resolve({ error: new Error('sign-out unavailable') }); await signOut.promise; });
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
  });

  it.each(['error-result', 'rejection'])('keeps the manager stopped after initial auth uncertainty: %s', async failure => {
    if (failure === 'error-result') mock.getSession.mockResolvedValue(result(session(OWNER_A), new Error('uncertain')));
    else mock.getSession.mockRejectedValue(new Error('uncertain'));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(mock.start).not.toHaveBeenCalled();
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
  });

  it.each(['TOKEN_REFRESHED', 'SIGNED_IN'] as const)('ignores old %s during sign-in and uses the awaited verified session rather than its callback', async event => {
    mock.getSession.mockResolvedValue(result(session(OWNER_A)));
    const signIn = deferred<SessionResult>();
    mock.signInWithPassword.mockReturnValue(signIn.promise);
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(mock.start).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in now' }));
    emit(event, session(OWNER_A));
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    emit('SIGNED_IN', session(OWNER_B));
    expect(mock.start).toHaveBeenCalledTimes(1);
    await act(async () => { signIn.resolve(result(session(OWNER_B))); await signIn.promise; });
    expect(mock.start.mock.calls.map(([owner]) => owner)).toEqual([OWNER_A, OWNER_B]);
    expect(screen.getByTestId('owner')).toHaveTextContent(OWNER_B);
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('uses an awaited sign-in session even when the SDK callback arrives after its result', async () => {
    mock.getSession.mockResolvedValue(result(null));
    mock.signInWithPassword.mockResolvedValue(result(session(OWNER_B)));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in now' }));
    await waitFor(() => expect(mock.start).toHaveBeenCalledExactlyOnceWith(OWNER_B));
    emit('SIGNED_IN', session(OWNER_B));
    expect(mock.start).toHaveBeenCalledExactlyOnceWith(OWNER_B);
  });

  it('an old overlapping action callback and result cannot replace the newer completed account', async () => {
    const old = deferred<SessionResult>();
    const current = deferred<SessionResult>();
    mock.signInWithPassword.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in now' }));
    await act(async () => { current.resolve(result(session(OWNER_B))); await current.promise; });
    expect(mock.start).toHaveBeenCalledExactlyOnceWith(OWNER_B);
    emit('SIGNED_IN', session(OWNER_A));
    await act(async () => { old.resolve(result(session(OWNER_A))); await old.promise; });
    expect(mock.start).toHaveBeenCalledExactlyOnceWith(OWNER_B);
    expect(screen.getByTestId('owner')).toHaveTextContent(OWNER_B);
    expect(mock.stop.mock.invocationCallOrder.at(-1)).toBeGreaterThan(mock.start.mock.invocationCallOrder[0]);
  });

  it('a genuine sign-out while sign-in is pending invalidates the returned session', async () => {
    const signIn = deferred<SessionResult>();
    mock.signInWithPassword.mockReturnValue(signIn.promise);
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in now' }));
    emit('SIGNED_OUT', null);
    await act(async () => { signIn.resolve(result(session(OWNER_B))); await signIn.promise; });
    expect(mock.start).not.toHaveBeenCalled();
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
  });

  it('an earlier signOut finally cannot clear a later uncertain action gate', async () => {
    mock.getSession.mockResolvedValue(result(session(OWNER_A)));
    const first = deferred<{ error: Error | null }>();
    const second = deferred<{ error: Error | null }>();
    mock.signOut.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(mock.start).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    await act(async () => { first.resolve({ error: null }); await first.promise; });
    emit('TOKEN_REFRESHED', session(OWNER_A));
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    await act(async () => { second.resolve({ error: null }); await second.promise; });
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
  });

  it('StrictMode cleanup and stale subscription/session results cannot restart an unmounted owner', async () => {
    const old = deferred<SessionResult>();
    const current = deferred<SessionResult>();
    mock.getSession.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const view = render(<StrictMode><AuthProvider><Consumer /></AuthProvider></StrictMode>);
    expect(listeners).toHaveLength(2);
    expect(listeners[0].unsubscribe).toHaveBeenCalledOnce();
    await act(async () => { old.resolve(result(session(OWNER_A))); await old.promise; });
    expect(mock.start).not.toHaveBeenCalled();
    emit('SIGNED_IN', session(OWNER_B));
    expect(mock.start).toHaveBeenCalledExactlyOnceWith(OWNER_B);
    view.unmount();
    await act(async () => {
      listeners[0].callback('SIGNED_IN', session(OWNER_A));
      listeners[1].callback('SIGNED_IN', session(OWNER_A));
      current.resolve(result(session(OWNER_A)));
      await current.promise;
    });
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(listeners[1].unsubscribe).toHaveBeenCalledOnce();
  });

  it('null refresh or malformed session owner fails closed', async () => {
    mock.getSession.mockResolvedValue(result(session(OWNER_A)));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(mock.start).toHaveBeenCalledOnce());
    emit('TOKEN_REFRESHED', null);
    emit('SIGNED_IN', session('not-an-owner'));
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('owner')).toHaveTextContent('signed-out');
  });
});

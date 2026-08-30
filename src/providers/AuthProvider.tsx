import React, { useState, useEffect, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext, AuthContextType } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { calendarTaskSyncManager } from '@/services/calendarTaskSyncManager';

const CANONICAL_OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function sessionOwner(next: Session | null): string | null {
  const id = next?.user?.id;
  return typeof id === 'string' && CANONICAL_OWNER.test(id)
    && id !== '00000000-0000-0000-0000-000000000000' ? id : null;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const authRevision = useRef(0);
  const managerOwner = useRef<string | null>(null);
  const actionSerial = useRef(0);
  const pendingAuthAction = useRef<{ id: number; kind: 'sign-in' | 'sign-up' | 'google' | 'sign-out'; sessionAllowed: boolean } | null>(null);
  const outstandingAuthActions = useRef(new Set<number>());
  const applySessionRef = useRef<(next: Session | null) => void>(() => {});

  useEffect(() => {
    let active = true;
    const outstanding = outstandingAuthActions.current;
    mounted.current = true;
    // The provider is the sole lifecycle owner. A mount starts with no trusted
    // identity; StrictMode cleanup and remount must not leave admitted timers.
    calendarTaskSyncManager.stop();
    managerOwner.current = null;
    const initialRevision = ++authRevision.current;
    const applySession = (next: Session | null) => {
      if (!active) return;
      const owner = sessionOwner(next);
      if (managerOwner.current !== owner || owner === null) {
        calendarTaskSyncManager.stop();
        managerOwner.current = null;
        if (owner) {
          try {
            calendarTaskSyncManager.start(owner);
            managerOwner.current = owner;
          } catch {
            calendarTaskSyncManager.stop();
          }
        }
      }
      setSession(owner ? next : null);
      setUser(owner ? next!.user : null);
      setLoading(false);
    };
    applySessionRef.current = applySession;

    // Subscribe before reading the initial session. Every subsequent auth event
    // invalidates that read, including sign-out and a null/uncertain session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, next) => {
        if (!active) return;
        ++authRevision.current;
        const pending = pendingAuthAction.current;
        if (pending) {
          // auth-js also emits SIGNED_IN when refocusing an existing session.
          // Only this action's awaited session result can complete its gate.
          if (event === 'SIGNED_OUT') pending.sessionAllowed = false;
          applySession(null);
          setLoading(true);
          return;
        }
        if (outstandingAuthActions.current.size > 0) {
          // An older overlapping request can emit before its promise settles;
          // its callback must not replace a newer completed action's owner.
          calendarTaskSyncManager.stop();
          managerOwner.current = null;
          if (event === 'SIGNED_OUT') applySession(null);
          return;
        }
        applySession(event === 'SIGNED_OUT' ? null : next);
        if (event === 'SIGNED_IN' && sessionOwner(next)) {
          toast.success('Successfully signed in!');
        } else if (event === 'SIGNED_OUT') {
          toast.success('Successfully signed out!');
        }
      }
    );

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authRevision.current !== initialRevision || pendingAuthAction.current) return;
      applySession(error ? null : data.session);
    }).catch(() => {
      if (active && authRevision.current === initialRevision) applySession(null);
    });

    return () => {
      active = false;
      mounted.current = false;
      pendingAuthAction.current = null;
      outstanding.clear();
      applySessionRef.current = () => {};
      managerOwner.current = null;
      calendarTaskSyncManager.stop();
      subscription.unsubscribe();
    };
  }, []);

  const beginAuthAction = (kind: 'sign-in' | 'sign-up' | 'google' | 'sign-out') => {
    ++authRevision.current;
    const action = ++actionSerial.current;
    pendingAuthAction.current = { id: action, kind, sessionAllowed: true };
    outstandingAuthActions.current.add(action);
    calendarTaskSyncManager.stop();
    managerOwner.current = null;
    setSession(null);
    setUser(null);
    setLoading(true);
    return action;
  };
  const finishAuthAction = (action: number, verifiedSession?: Session | null) => {
    outstandingAuthActions.current.delete(action);
    const pending = pendingAuthAction.current;
    if (pending?.id !== action) return;
    pendingAuthAction.current = null;
    if (!mounted.current) return;
    if (verifiedSession !== undefined) {
      applySessionRef.current(pending.sessionAllowed ? verifiedSession : null);
    } else {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const revision = beginAuthAction('sign-in');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      finishAuthAction(revision, data?.session ?? null);
      
      return { error: null };
    } catch (error: unknown) {
      return { error };
    } finally {
      finishAuthAction(revision);
    }
  };

  const signUp = async (email: string, password: string) => {
    const revision = beginAuthAction('sign-up');
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });
      
      if (error) throw error;
      finishAuthAction(revision, data?.session ?? null);
      
      return { error: null };
    } catch (error: unknown) {
      return { error };
    } finally {
      finishAuthAction(revision);
    }
  };

  const signInWithGoogle = async () => {
    const revision = beginAuthAction('google');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });
      
      if (error) throw error;
      
      return { error: null };
    } catch (error: unknown) {
      return { error };
    } finally {
      finishAuthAction(revision);
    }
  };

  const signOut = async () => {
    const revision = beginAuthAction('sign-out');
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      return { error: null };
    } catch (error: unknown) {
      return { error };
    } finally {
      finishAuthAction(revision);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

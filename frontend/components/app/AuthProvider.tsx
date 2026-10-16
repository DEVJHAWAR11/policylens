'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { AUTH_EXPIRED_EVENT, fetchApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { isPersonalEmailAllowed, PERSONAL_EMAIL_ERROR } from '@/lib/personalEmail';

interface AuthState {
  resolving: boolean; // an OAuth callback is being exchanged for a backend token
  userName: string;
  authError: string;
  setAuthError: (msg: string) => void;
  completeLogin: (name: string) => void; // email/password login or signup succeeded
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const NAME_KEY = 'pl_name';

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

export const hasSessionToken = () => typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('token'));

function oauthInFlight() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  return hash.includes('access_token=') || hash.includes('refresh_token=') || localStorage.getItem('oauth_redirect_intent') === 'google';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [resolving, setResolving] = useState(false);
  const [userName, setUserName] = useState('');
  const [authError, setAuthError] = useState('');
  const lastSyncKey = useRef('');
  const inFlight = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  const rememberName = useCallback((name: string) => {
    setUserName(name);
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- read browser-only state once on mount */
    setUserName(localStorage.getItem(NAME_KEY) || '');
    if (oauthInFlight()) setResolving(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    const clearLocal = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('oauth_redirect_intent');
      lastSyncKey.current = '';
      inFlight.current = null;
    };

    const syncSession = async (session: Session | null, event = 'INITIAL_SESSION') => {
      const email = session?.user?.email;
      if (!session || !email) {
        // Clear stale OAuth intent when auth did not complete (cancel/error/blocked).
        localStorage.removeItem('oauth_redirect_intent');
        if (event === 'SIGNED_OUT') { lastSyncKey.current = ''; inFlight.current = null; }
        return;
      }

      if (!isPersonalEmailAllowed(email)) {
        await supabase.auth.signOut();
        clearLocal();
        rememberName('');
        setAuthError(PERSONAL_EMAIL_ERROR);
        router.replace('/login/');
        return;
      }

      const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || email.split('@')[0];
      try {
        const key = `${session.user.id}:${session.access_token || ''}`;
        if (lastSyncKey.current !== key) {
          // Supabase fires several auth events at once; share one in-flight exchange.
          // The backend verifies this Supabase access token itself.
          if (inFlight.current?.key !== key) {
            const promise = fetchApi<{ token?: string }>('/auth/google', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.access_token}` },
            }).then((data) => {
              if (!data?.token) throw new Error('No backend auth token received from OAuth login.');
              localStorage.setItem('token', data.token);
              lastSyncKey.current = key;
            });
            inFlight.current = { key, promise };
            promise.catch(() => { inFlight.current = null; });
          }
          await inFlight.current!.promise;
        }
      } catch (err) {
        console.error('OAuth session sync failed:', err);
        clearLocal();
        await supabase.auth.signOut();
        rememberName('');
        setAuthError(`Google sign-in failed on server sync: ${(err as Error).message || 'Please try again.'}`);
        router.replace('/login/');
        return;
      }

      rememberName(name);
      setAuthError('');
      const cameFromOAuth = oauthInFlight();
      if (cameFromOAuth || pathRef.current?.startsWith('/login')) {
        localStorage.removeItem('oauth_redirect_intent');
        router.replace('/app/');
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      void syncSession(session, event).finally(() => setResolving(false));
    });
    void supabase.auth.getSession().then(({ data }) => syncSession(data.session)).finally(() => setResolving(false));

    // Backend rejected our session token → sign out and go back to login.
    const onExpired = async () => {
      clearLocal();
      rememberName('');
      setAuthError('Your session expired. Please sign in again.');
      try { await supabase.auth.signOut(); } catch { /* already signed out */ }
      router.replace('/login/');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, [rememberName, router]);

  const completeLogin = useCallback((name: string) => {
    setAuthError('');
    rememberName(name);
    router.push('/app/');
  }, [rememberName, router]);

  const signOut = useCallback(async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('oauth_redirect_intent');
    lastSyncKey.current = '';
    inFlight.current = null;
    setAuthError('');
    rememberName('');
    try { await supabase.auth.signOut(); } catch (err) { console.error('Sign out error:', err); }
    router.push('/');
  }, [rememberName, router]);

  return (
    <AuthContext.Provider value={{ resolving, userName, authError, setAuthError, completeLogin, signOut }}>
      {children}
      {resolving && (
        <div role="status" className="fixed inset-0 z-[70] grid place-items-center bg-bg/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-px w-40 overflow-hidden bg-line"><div className="h-full w-1/2 shimmer" /></div>
            <p className="font-display text-2xl text-cream">Completing sign-in…</p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { isApiError } from '@/api/errors';
import type { User } from '@/api/schemas';
import { useApi } from '@/api/ApiProvider';
import { setMonitoringUser } from '@/monitoring/monitoring';

import { session } from './session';
import { tokenStorage } from './tokenStorage';

export type SignOutReason = 'user' | 'expired';

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signedOut'; reason?: SignOutReason }
  | { status: 'signedIn'; user: User };

export interface AuthContextValue {
  state: AuthState;
  user: User | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(reason?: SignOutReason): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  /** Clean up per-user state (query cache, outbox) when the session ends. */
  onSignedOut?: () => Promise<void> | void;
}

export function AuthProvider({ children, onSignedOut }: AuthProviderProps) {
  const api = useApi();
  const [state, setState] = useState<AuthState>({ status: 'restoring' });
  const onSignedOutRef = useRef(onSignedOut);
  useEffect(() => {
    onSignedOutRef.current = onSignedOut;
  }, [onSignedOut]);

  const signOut = useCallback(async (reason: SignOutReason = 'user') => {
    session.setToken(null);
    setMonitoringUser(null);
    setState({ status: 'signedOut', reason });
    await Promise.allSettled([tokenStorage.clear(), Promise.resolve(onSignedOutRef.current?.())]);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await api.me();
      setState((current) => (current.status === 'signedIn' ? { status: 'signedIn', user } : current));
      setMonitoringUser(user);
      await tokenStorage.saveUser(user);
    } catch (error) {
      // 401 is handled by the unauthorized listener below; offline keeps the cached user.
      if (!isApiError(error) || error.kind !== 'unauthorized') return;
    }
  }, [api]);

  // Restore the persisted session, then revalidate it in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await tokenStorage.load().catch(() => null);
      if (cancelled) return;
      if (!stored) {
        setState({ status: 'signedOut' });
        return;
      }
      session.setToken(stored.token);
      setMonitoringUser(stored.user);
      setState({ status: 'signedIn', user: stored.user });
      void refreshUser();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  // Automatic logout: any 401 from the API ends the session.
  useEffect(() => session.onUnauthorized(() => void signOut('expired')), [signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { token, user } = await api.login(email.trim(), password);
      session.setToken(token);
      await tokenStorage.save({ token, user });
      setMonitoringUser(user);
      setState({ status: 'signedIn', user });
    },
    [api],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state.status === 'signedIn' ? state.user : null, signIn, signOut, refreshUser }),
    [state, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

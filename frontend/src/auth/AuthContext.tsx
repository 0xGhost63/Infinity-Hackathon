import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/api';
import { onUnauthorized } from '@/api/errors';
import type { User } from '@/api/types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** True after an explicit sign-out, so the next person starts on their own home page. */
  signedOut: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, signedOut: false });

  useEffect(() => {
    let active = true;
    api.auth.me().then(
      (user) => {
        if (!active) return;
        setState(user ? { status: 'authenticated', user, signedOut: false } : { status: 'anonymous', user: null, signedOut: false });
      },
      () => {
        if (active) setState({ status: 'anonymous', user: null, signedOut: false });
      },
    );
    const unsubscribe = onUnauthorized(() => setState({ status: 'anonymous', user: null, signedOut: false }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await api.auth.login(email, password);
    setState({ status: 'authenticated', user, signedOut: false });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* The local session is cleared either way. */
    } finally {
      setState({ status: 'anonymous', user: null, signedOut: true });
    }
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** For components rendered inside authenticated routes only. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser must be used inside an authenticated route.');
  return user;
}

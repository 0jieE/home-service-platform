import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getMe, logout as apiLogout, obtainToken } from '@/api/auth';
import { qk } from '@/api/keys';
import { refreshAccessToken, setAuthFailureHandler } from '@/lib/api';
import type { User } from '@/types/api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';
import { tokenStorage } from './tokenStorage';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStorage.getRefresh() ? 'loading' : 'anonymous',
  );

  const signOutLocally = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setStatus('anonymous');
    qc.clear();
  }, [qc]);

  // Refresh failure anywhere in the app → back to anonymous.
  useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null);
      setStatus('anonymous');
      qc.clear();
    });
    return () => setAuthFailureHandler(null);
  }, [qc]);

  // Restore the session from the persisted refresh token.
  useEffect(() => {
    if (!tokenStorage.getRefresh()) return;
    let cancelled = false;
    refreshAccessToken()
      .then(() => getMe())
      .then((me) => {
        if (cancelled) return;
        qc.setQueryData(qk.me, me);
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        tokenStorage.clear();
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await obtainToken(email, password);
      tokenStorage.setTokens(res.access, res.refresh);
      qc.clear();
      const me = res.user ?? (await getMe());
      qc.setQueryData(qk.me, me);
      setUser(me);
      setStatus('authenticated');
      return me;
    },
    [qc],
  );

  const logout = useCallback(async () => {
    const refresh = tokenStorage.getRefresh();
    try {
      if (refresh) await apiLogout(refresh);
    } catch {
      /* best effort: token blacklist */
    }
    signOutLocally();
  }, [signOutLocally]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await getMe();
      qc.setQueryData(qk.me, me);
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, [qc]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, refreshUser }),
    [status, user, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

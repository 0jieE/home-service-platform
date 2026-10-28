import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { FullPageSpinner } from '@/components/ui/Spinner';
import type { Role } from '@/types/api';
import { homePathFor, useAuth } from './useAuth';

/** Guards a route subtree: anonymous → /login (with return path); wrong role → that role's home. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Restoring your session…" />;
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (user.role !== role) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

/** For public auth pages: signed-in users are sent to their home. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageSpinner label="Loading…" />;
  if (status === 'authenticated' && user) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

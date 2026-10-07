import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, type Location } from 'react-router-dom';
import type { Role } from '@/api/types';
import { ForbiddenView, PageLoader } from '@/components/feedback/StatusViews';
import { useAuth } from './AuthContext';

interface RedirectState {
  from?: Location;
}

/*
 * These guards only shape the interface. The backend enforces the same rules on every
 * request, so hiding a route here is never the access control itself.
 */

export function RequireAuth() {
  const { status, signedOut } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader label="Loading your workspace" fullScreen />;
  if (status === 'anonymous') {
    const state: RedirectState | undefined = signedOut ? undefined : { from: location };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader label="Loading" fullScreen />;
  if (status === 'authenticated') {
    const from = (location.state as RedirectState | null)?.from;
    const target = from && from.pathname !== '/login' ? `${from.pathname}${from.search}${from.hash}` : '/';
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}

interface RequireRoleProps {
  roles: Role[];
  title: string;
  description: string;
}

export function RequireRole({ roles, title, description }: RequireRoleProps) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <ForbiddenView title={title} description={description} />;
  return <Outlet />;
}

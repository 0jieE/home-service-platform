import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { RedirectIfAuthenticated, RequireRole } from '@/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { PublicLayout } from '@/features/public/PublicLayout';
import { RouteError } from '@/features/public/RouteError';
import { NotFoundPage } from '@/features/public/NotFoundPage';
import type { Role } from '@/types/api';

/** Code-split each screen; named exports are mapped to default. */
function page<T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) {
  const C = lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <C />
    </Suspense>
  );
}

function roleShell(role: Role): ReactNode {
  return (
    <RequireRole role={role}>
      <AppShell role={role} />
    </RequireRole>
  );
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: page(() => import('@/features/public/LandingPage'), 'LandingPage') },
          {
            element: (
              <RedirectIfAuthenticated>
                <Outlet />
              </RedirectIfAuthenticated>
            ),
            children: [
              { path: '/login', element: page(() => import('@/features/auth/LoginPage'), 'LoginPage') },
              {
                path: '/register',
                element: page(() => import('@/features/auth/RegisterPage'), 'RegisterPage'),
              },
              {
                path: '/activate',
                element: page(() => import('@/features/auth/ActivatePage'), 'ActivatePage'),
              },
            ],
          },
        ],
      },
      {
        path: '/c',
        element: roleShell('customer'),
        children: [
          { index: true, element: <Navigate to="find" replace /> },
          { path: 'find', element: page(() => import('@/features/customer/FindPage'), 'FindPage') },
          {
            path: 'technicians',
            element: page(() => import('@/features/customer/TechniciansPage'), 'TechniciansPage'),
          },
          {
            path: 'technicians/:id',
            element: page(() => import('@/features/customer/TechnicianDetailPage'), 'TechnicianDetailPage'),
          },
          {
            path: 'book/:technicianId',
            element: page(() => import('@/features/customer/BookPage'), 'BookPage'),
          },
          {
            path: 'bookings',
            element: page(() => import('@/features/customer/BookingsPage'), 'BookingsPage'),
          },
          {
            path: 'bookings/:id',
            element: page(() => import('@/features/shared/BookingDetailPage'), 'BookingDetailPage'),
          },
          {
            path: 'profile',
            element: page(() => import('@/features/customer/ProfilePage'), 'CustomerProfilePage'),
          },
        ],
      },
      {
        path: '/t',
        element: roleShell('technician'),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          {
            path: 'dashboard',
            element: page(() => import('@/features/technician/DashboardPage'), 'TechnicianDashboardPage'),
          },
          {
            path: 'requests',
            element: page(() => import('@/features/technician/RequestsPage'), 'RequestsPage'),
          },
          { path: 'jobs', element: page(() => import('@/features/technician/JobsPage'), 'JobsPage') },
          {
            path: 'jobs/:id',
            element: page(() => import('@/features/shared/BookingDetailPage'), 'BookingDetailPage'),
          },
          {
            path: 'availability',
            element: page(() => import('@/features/technician/AvailabilityPage'), 'AvailabilityPage'),
          },
          {
            path: 'profile',
            element: page(() => import('@/features/technician/ProfilePage'), 'TechnicianProfilePage'),
          },
        ],
      },
      {
        path: '/a',
        element: roleShell('admin'),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          {
            path: 'dashboard',
            element: page(() => import('@/features/admin/DashboardPage'), 'AdminDashboardPage'),
          },
          {
            path: 'applications',
            element: page(() => import('@/features/admin/ApplicationsPage'), 'ApplicationsPage'),
          },
          {
            path: 'applications/:id',
            element: page(() => import('@/features/admin/ApplicationDetailPage'), 'ApplicationDetailPage'),
          },
          { path: 'users', element: page(() => import('@/features/admin/UsersPage'), 'UsersPage') },
          {
            path: 'categories',
            element: page(() => import('@/features/admin/CategoriesPage'), 'CategoriesPage'),
          },
          { path: 'disputes', element: page(() => import('@/features/admin/DisputesPage'), 'DisputesPage') },
          {
            path: 'bookings/:id',
            element: page(() => import('@/features/shared/BookingDetailPage'), 'BookingDetailPage'),
          },
          { path: 'settings', element: page(() => import('@/features/admin/SettingsPage'), 'SettingsPage') },
          { path: 'coverage', element: page(() => import('@/features/admin/CoveragePage'), 'CoveragePage') },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

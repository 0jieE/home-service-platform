import { Link, Outlet } from 'react-router';
import { Brand } from '@/components/layout/AppShell';
import { buttonClasses } from '@/components/ui/Button';
import { homePathFor, useAuth } from '@/auth/useAuth';

export function PublicLayout() {
  const { status, user } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Brand />
          <nav className="ml-auto flex items-center gap-2" aria-label="Account">
            {status === 'authenticated' && user ? (
              <Link to={homePathFor(user.role)} className={buttonClasses('primary', 'sm')}>
                Go to my dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonClasses('ghost', 'sm')}>
                  Log in
                </Link>
                <Link to="/register" className={buttonClasses('primary', 'sm')}>
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        Location-Aware Decision Support Platform for Home Service Technician Matching and Booking · Kidapawan
        City
      </footer>
    </div>
  );
}

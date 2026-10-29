import { Link, Outlet, useLocation } from 'react-router';
import { Brand } from '@/components/layout/AppShell';
import { buttonClasses } from '@/components/ui/Button';
import { homePathFor, useAuth } from '@/auth/useAuth';

export function PublicLayout() {
  const { status, user } = useAuth();
  const { pathname } = useLocation();
  // The landing hero continues the pine header; other public pages sit on the canvas.
  const onLanding = pathname === '/';
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-pine-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Brand tone="dark" />
          <nav className="ml-auto flex shrink-0 items-center gap-2" aria-label="Account">
            {status === 'authenticated' && user ? (
              <Link to={homePathFor(user.role)} className={buttonClasses('sun', 'sm')}>
                Go to my dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonClasses('onDark', 'sm')}>
                  Log in
                </Link>
                <Link to="/register" className={buttonClasses('sun', 'sm')}>
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
        {!onLanding && <div className="h-px bg-white/10" />}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-pine-950 py-8 text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 text-sm sm:flex-row sm:justify-between sm:px-6">
          <p className="font-display font-semibold text-white/85">Kidapawan Home Service</p>
          <p>Location-aware technician matching and booking for Kidapawan City</p>
        </div>
      </footer>
    </div>
  );
}

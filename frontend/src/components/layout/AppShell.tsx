import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Download, LogOut, MapPin, MoreHorizontal, X } from 'lucide-react';
import { useAdminStats } from '@/api/admin';
import { useBookings } from '@/api/bookings';
import { useAuth } from '@/auth/useAuth';
import { useBookingSocket } from '@/features/shared/useBookingSocket';
import { cn } from '@/lib/cn';
import { useSocketConnected } from '@/lib/ws';
import { formatDate, initials } from '@/lib/format';
import type { Role } from '@/types/api';
import { InstallAppButton } from '@/pwa/InstallAppButton';
import { NAV, ROLE_LABEL, type NavItem } from './nav';

function useBadges(role: Role) {
  const pending = useBookings({ status: ['pending'], page_size: 1 }, role === 'technician');
  const stats = useAdminStats(role === 'admin');
  return {
    pendingRequests: pending.data?.count ?? 0,
    openDisputes: stats.data?.totals.open_disputes ?? 0,
  };
}

/** Wordmark. `tone="dark"` is for pine surfaces (sidebar, public header, footer). */
export function Brand({ to = '/', tone = 'light' }: { to?: string; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2.5 rounded-lg">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[10px]',
          dark ? 'bg-sun-400 text-pine-900' : 'bg-pine-900 text-sun-400',
        )}
      >
        <MapPin className="size-5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className="min-w-0 leading-none">
        <span
          className={cn(
            'block truncate font-display text-[1.15rem] font-bold tracking-tight',
            dark ? 'text-white' : 'text-slate-900',
          )}
        >
          Kidapawan
        </span>
        <span className={cn('mt-1 block text-xs', dark ? 'text-white/65' : 'text-slate-500')}>
          Home Service
        </span>
      </span>
    </Link>
  );
}

function NavBadge({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-sun-400 px-1.5 text-center text-xs leading-6 font-bold text-pine-900">
      {value > 99 ? '99+' : value}
    </span>
  );
}

function SideNavLink({ item, badge, onClick }: { item: NavItem; badge: number; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium transition-colors',
          'focus-visible:outline-sun-400',
          isActive
            ? 'bg-white/10 text-white before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-sun-400'
            : 'text-white/70 hover:bg-white/5 hover:text-white',
        )
      }
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {item.label}
      <NavBadge value={badge} />
    </NavLink>
  );
}

function LiveIndicator({ compact, tone = 'dark' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  const live = useSocketConnected();
  const light = tone === 'light';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-xs font-medium',
        light
          ? live
            ? 'rounded-full bg-brand-50 px-3 py-1.5 text-brand-800 ring-1 ring-brand-200'
            : 'rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 ring-1 ring-slate-200'
          : live
            ? 'text-brand-200'
            : 'text-white/60',
      )}
      title={live ? 'Live updates on' : 'Live updates offline — refreshing every 30 seconds'}
    >
      <span className="relative flex size-2.5">
        {live && (
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-300 opacity-60 motion-reduce:hidden" />
        )}
        <span
          className={cn(
            'relative size-2.5 rounded-full',
            live ? (light ? 'bg-brand-500' : 'bg-brand-300') : light ? 'bg-slate-400' : 'bg-white/40',
          )}
        />
      </span>
      <span className={cn(compact && 'sr-only')}>
        {live ? 'Live updates on' : 'Offline — refreshing every 30 s'}
      </span>
    </span>
  );
}

function UserBlock({ name, role, tone = 'dark' }: { name: string; role: Role; tone?: 'light' | 'dark' }) {
  const light = tone === 'light';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sun-400 font-display text-sm font-bold text-pine-900">
        {initials(name || '?')}
      </span>
      <span className="min-w-0 leading-tight">
        <span className={cn('block truncate text-sm font-semibold', light ? 'text-slate-900' : 'text-white')}>
          {name}
        </span>
        <span className={cn('block text-xs', light ? 'text-slate-500' : 'text-white/60')}>
          {ROLE_LABEL[role]}
        </span>
      </span>
    </div>
  );
}

export function AppShell({ role }: { role: Role }) {
  useBookingSocket();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const items = NAV[role];
  const badges = useBadges(role);
  const primary = items.filter((i) => i.primary).slice(0, 5);
  const overflow = items.filter((i) => !primary.includes(i));
  const hasMore = overflow.length > 0;
  const onOverflowPage = overflow.some((i) => location.pathname.startsWith(i.to));
  const name = user?.full_name || user?.email || '';

  // Close the drawer on navigation (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    if (drawer) setDrawer(false);
  }

  // Escape closes the "More" sheet.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navList = (onClick?: () => void) =>
    items.map((item) => (
      <SideNavLink
        key={item.to}
        item={item}
        badge={item.badgeKey ? badges[item.badgeKey] : 0}
        onClick={onClick}
      />
    ));

  const logoutButton = (
    <button
      type="button"
      onClick={onLogout}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-sun-400"
    >
      <LogOut className="size-5" aria-hidden="true" />
      <span className="max-lg:sr-only">Log out</span>
    </button>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-pine-900 lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-5">
          <Brand to={items[0]!.to} tone="dark" />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
          {navList()}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Desktop top bar: date, live status, install, account */}
        <header className="sticky top-0 z-30 hidden border-b border-slate-200/80 bg-canvas/85 backdrop-blur-md lg:block">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-10">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{formatDate(new Date(), 'EEEE')}</span>,{' '}
              {formatDate(new Date(), 'MMMM d')}
            </p>
            <div className="ml-auto flex items-center gap-3">
              <LiveIndicator tone="light" />
              <InstallAppButton className="inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50" />
              <span className="h-8 w-px bg-slate-200" aria-hidden="true" />
              <UserBlock name={name} role={role} tone="light" />
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
              >
                <LogOut className="size-5" aria-hidden="true" />
                Log out
              </button>
            </div>
          </div>
        </header>
        {/* Mobile / tablet top bar (navigation lives in the bottom bar; “More” opens the drawer) */}
        <header className="sticky top-0 z-30 bg-pine-900 pt-[env(safe-area-inset-top)] lg:hidden">
          <div className="flex h-16 items-center gap-2 pr-2 pl-4 sm:px-6">
            <Brand to={items[0]!.to} tone="dark" />
            <div className="ml-auto flex items-center gap-1">
              <LiveIndicator compact />
              <InstallAppButton
                title="Install app"
                className="inline-flex size-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-sun-400"
              >
                <Download className="size-5" aria-hidden="true" />
              </InstallAppButton>
              {logoutButton}
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg px-1">
          {primary.map((item) => {
            const Icon = item.icon;
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                      isActive ? 'text-brand-800' : 'text-slate-500',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                          isActive && 'bg-brand-100',
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      {item.label}
                      {badge > 0 && (
                        <span className="absolute top-1.5 right-1/2 translate-x-6 rounded-full bg-red-600 px-1.5 text-[10px] leading-4 font-bold text-white">
                          {badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
          {hasMore && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                aria-haspopup="dialog"
                aria-expanded={drawer}
                className={cn(
                  'flex min-h-16 w-full flex-col items-center justify-center gap-1 text-xs font-medium',
                  onOverflowPage || drawer ? 'text-brand-800' : 'text-slate-500',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    (onOverflowPage || drawer) && 'bg-brand-100',
                  )}
                >
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                </span>
                More
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* Mobile "More" sheet: the pages that don't fit in the bottom bar */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More pages">
          <div
            className="absolute inset-0 animate-fade-in bg-pine-950/50"
            onClick={() => setDrawer(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] animate-sheet-up overflow-y-auto rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-12px_40px_-12px_rgb(11_29_21/0.35)]">
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
              <div className="min-w-0">
                <h2 className="text-xl font-bold">More</h2>
                <p className="truncate text-sm text-slate-500">
                  {name} ({ROLE_LABEL[role]})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                aria-label="Close"
                autoFocus
              >
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="More pages" className="px-4 pt-2">
              <ul className="grid grid-cols-2 gap-2.5">
                {overflow.map((item) => {
                  const Icon = item.icon;
                  const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={() => setDrawer(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-3 text-[0.95rem] font-semibold transition-colors',
                            isActive
                              ? 'border-brand-300 bg-brand-50 text-brand-900'
                              : 'border-slate-200 text-slate-800 hover:border-brand-300 hover:bg-brand-50/60',
                          )
                        }
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
                        {badge > 0 && (
                          <span className="rounded-full bg-red-600 px-1.5 text-xs leading-5 font-bold text-white">
                            {badge}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

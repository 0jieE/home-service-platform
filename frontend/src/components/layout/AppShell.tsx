import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { LogOut, MapPin, Menu, MoreHorizontal, Wifi, WifiOff, X } from 'lucide-react';
import { useAdminStats } from '@/api/admin';
import { useBookings } from '@/api/bookings';
import { useAuth } from '@/auth/useAuth';
import { useBookingSocket } from '@/features/shared/useBookingSocket';
import { cn } from '@/lib/cn';
import { useSocketConnected } from '@/lib/ws';
import { initials } from '@/lib/format';
import type { Role } from '@/types/api';
import { NAV, ROLE_LABEL, type NavItem } from './nav';

function useBadges(role: Role) {
  const pending = useBookings({ status: ['pending'], page_size: 1 }, role === 'technician');
  const stats = useAdminStats(role === 'admin');
  return {
    pendingRequests: pending.data?.count ?? 0,
    openDisputes: stats.data?.totals.open_disputes ?? 0,
  };
}

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-lg font-semibold text-slate-900">
      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-700 text-white">
        <MapPin className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm">
          <span className="sm:hidden">Kidapawan Service</span>
          <span className="hidden sm:inline">Kidapawan Home Service</span>
        </span>
        <span className="hidden text-xs font-normal text-slate-500 sm:block">
          Technician finder & booking
        </span>
      </span>
    </Link>
  );
}

function NavBadge({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs leading-5 font-semibold text-white">
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
          'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {item.label}
      <NavBadge value={badge} />
    </NavLink>
  );
}

function LiveIndicator() {
  const live = useSocketConnected();
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', live ? 'text-emerald-700' : 'text-slate-500')}
      title={live ? 'Live updates on' : 'Live updates offline — refreshing every 30 seconds'}
    >
      {live ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
      <span className="hidden sm:inline">{live ? 'Live' : 'Offline · auto-refresh'}</span>
    </span>
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
  const hasMore = items.length > primary.length;

  // Close the drawer on navigation (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    if (drawer) setDrawer(false);
  }

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <Menu className="size-6" />
          </button>
          <Brand to={items[0]!.to} />
          <div className="ml-auto flex items-center gap-3">
            <LiveIndicator />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex size-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                {initials(user?.full_name || user?.email || '?')}
              </span>
              <span className="text-sm leading-tight">
                <span className="block font-medium">{user?.full_name || user?.email}</span>
                <span className="block text-xs text-slate-500">{ROLE_LABEL[role]}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="size-5" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto py-6 lg:block">
          <nav aria-label="Main" className="space-y-1">
            {items.map((item) => (
              <SideNavLink key={item.to} item={item} badge={item.badgeKey ? badges[item.badgeKey] : 0} />
            ))}
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1 pt-6 pb-28 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {primary.map((item) => {
            const Icon = item.icon;
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                      isActive ? 'text-brand-700' : 'text-slate-500',
                    )
                  }
                >
                  <Icon className="size-6" aria-hidden="true" />
                  {item.label}
                  {badge > 0 && (
                    <span className="absolute top-2 right-1/2 translate-x-5 rounded-full bg-red-600 px-1.5 text-[10px] leading-4 font-semibold text-white">
                      {badge}
                    </span>
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
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-xs font-medium text-slate-500"
              >
                <MoreHorizontal className="size-6" aria-hidden="true" />
                More
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawer(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <span className="text-sm font-semibold">
                {user?.full_name || user?.email}
                <span className="block text-xs font-normal text-slate-500">{ROLE_LABEL[role]}</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="size-6" />
              </button>
            </div>
            <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
              {items.map((item) => (
                <SideNavLink
                  key={item.to}
                  item={item}
                  badge={item.badgeKey ? badges[item.badgeKey] : 0}
                  onClick={() => setDrawer(false)}
                />
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

import {
  Briefcase,
  CalendarCheck,
  CalendarClock,
  FileCheck2,
  Inbox,
  LayoutDashboard,
  Map,
  Scale,
  Search,
  SlidersHorizontal,
  Tags,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  primary?: boolean;
  badgeKey?: 'pendingRequests' | 'openDisputes';
}

export const NAV: Record<Role, NavItem[]> = {
  customer: [
    { to: '/c/find', label: 'Find', icon: Search, primary: true },
    { to: '/c/technicians', label: 'Technicians', icon: Users, primary: true },
    { to: '/c/bookings', label: 'Bookings', icon: CalendarCheck, primary: true },
    { to: '/c/profile', label: 'Profile', icon: UserRound, primary: true },
  ],
  technician: [
    { to: '/t/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
    { to: '/t/requests', label: 'Requests', icon: Inbox, primary: true, badgeKey: 'pendingRequests' },
    { to: '/t/jobs', label: 'Jobs', icon: Briefcase, primary: true },
    { to: '/t/availability', label: 'Availability', icon: CalendarClock, primary: true },
    { to: '/t/profile', label: 'Profile', icon: UserRound, primary: true },
  ],
  admin: [
    { to: '/a/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
    { to: '/a/applications', label: 'Applications', icon: FileCheck2, primary: true },
    { to: '/a/users', label: 'Users', icon: Users },
    { to: '/a/categories', label: 'Categories', icon: Tags },
    { to: '/a/disputes', label: 'Disputes', icon: Scale, primary: true, badgeKey: 'openDisputes' },
    { to: '/a/settings', label: 'Settings', icon: SlidersHorizontal },
    { to: '/a/coverage', label: 'Coverage', icon: Map },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  customer: 'Customer',
  technician: 'Technician',
  admin: 'Administrator',
};

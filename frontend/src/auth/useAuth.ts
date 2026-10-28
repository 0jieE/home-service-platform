import { useContext } from 'react';
import { AuthContext } from './AuthContext';
import type { Role } from '@/types/api';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function homePathFor(role: Role | undefined | null): string {
  switch (role) {
    case 'customer':
      return '/c/find';
    case 'technician':
      return '/t/dashboard';
    case 'admin':
      return '/a/dashboard';
    default:
      return '/';
  }
}

import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { homePathFor, useAuth } from '@/auth/useAuth';

export function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-display text-7xl font-extrabold tracking-tight text-brand-700">404</p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-slate-600">The page you are looking for doesn’t exist or was moved.</p>
      <Link to={homePathFor(user?.role)} className={buttonClasses('primary')}>
        {user ? 'Back to my dashboard' : 'Back to home'}
      </Link>
    </div>
  );
}

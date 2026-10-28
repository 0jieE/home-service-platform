import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unexpected error';
  // A failed lazy chunk after a redeploy: a reload fixes it.
  const chunk = /dynamically imported module|Failed to fetch/i.test(message);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-sm text-slate-600">{chunk ? 'A new version may be available. Reload the page.' : message}</p>
      <div className="flex gap-2">
        <button type="button" className={buttonClasses('primary')} onClick={() => window.location.reload()}>
          Reload
        </button>
        <Link to="/" className={buttonClasses('outline')}>
          Home
        </Link>
      </div>
    </div>
  );
}

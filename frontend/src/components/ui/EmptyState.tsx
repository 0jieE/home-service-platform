import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-6 text-red-600" />}
      title="Something went wrong"
      description={message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

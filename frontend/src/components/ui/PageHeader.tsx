import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {back && <div className="mb-2">{back}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Role-appropriate instructions shown at the top of key screens. */
export function Instructions({
  title = 'How this works',
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex gap-3 rounded-xl border border-brand-100 bg-brand-50/70 p-4 text-sm text-slate-700', className)}>
      <Info className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
      <div>
        <p className="font-semibold text-brand-900">{title}</p>
        <div className="mt-1 space-y-1">{children}</div>
      </div>
    </div>
  );
}

export function Alert({
  tone = 'amber',
  title,
  children,
  icon,
  className,
}: {
  tone?: 'amber' | 'red' | 'blue' | 'green';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    blue: 'border-sky-200 bg-sky-50 text-sky-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div role="status" className={cn('flex gap-3 rounded-xl border p-4 text-sm', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-1')}>{children}</div>}
      </div>
    </div>
  );
}

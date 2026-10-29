import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  label = 'Sections',
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next]!.value);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-slate-200',
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors sm:px-4',
              active
                ? 'border-brand-600 font-semibold text-brand-900'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  active ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

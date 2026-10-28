import {
  AirVent,
  Cable,
  Hammer,
  Home,
  Laptop,
  Refrigerator,
  Wrench,
  Zap,
  Droplets,
  Flame,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Category } from '@/types/api';

const ICONS: Record<string, LucideIcon> = {
  snowflake: AirVent,
  aircon: AirVent,
  'aircon-repair': AirVent,
  zap: Zap,
  bolt: Zap,
  electrical: Zap,
  droplet: Droplets,
  droplets: Droplets,
  plumbing: Droplets,
  wrench: Wrench,
  'appliance-repair': Refrigerator,
  refrigerator: Refrigerator,
  hammer: Hammer,
  carpentry: Hammer,
  laptop: Laptop,
  smartphone: Laptop,
  'computer-phone-repair': Laptop,
  home: Home,
  roofing: Home,
  flame: Flame,
  welding: Flame,
  cable: Cable,
};

export function categoryIcon(c: Pick<Category, 'icon' | 'slug'>): LucideIcon {
  return ICONS[c.icon?.toLowerCase()] ?? ICONS[c.slug] ?? Wrench;
}

/** Large tap-target chips for choosing a service category. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  error,
  loading,
}: {
  categories: Category[];
  value: number | undefined;
  onChange: (id: number) => void;
  error?: string;
  loading?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-800">
        Service needed <span className="text-red-600">*</span>
      </legend>
      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
          {categories.map((c) => {
            const Icon = categoryIcon(c);
            const active = c.id === value;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(c.id)}
                className={cn(
                  'flex min-h-14 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium transition',
                  active
                    ? 'border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-600/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <Icon
                  className={cn('size-5 shrink-0', active ? 'text-brand-700' : 'text-slate-400')}
                  aria-hidden="true"
                />
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

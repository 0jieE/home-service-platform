import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Read-only stars, supports fractional averages. */
export function RatingStars({ value, size = 'sm', className }: { value: number; size?: 'sm' | 'md'; className?: string }) {
  const dim = size === 'md' ? 'size-5' : 'size-4';
  return (
    <span className={cn('inline-flex items-center', className)} aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className={cn('relative inline-block', dim)}>
            <Star className={cn('absolute inset-0 text-slate-300', dim)} aria-hidden="true" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={cn('fill-amber-400 text-amber-400', dim)} aria-hidden="true" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** 1–5 star input (radio group semantics, keyboard accessible). */
export function RatingInput({
  value,
  onChange,
  error,
  label = 'Rating',
}: {
  value: number;
  onChange: (v: number) => void;
  error?: string;
  label?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-slate-800">
        {label} <span className="text-red-600">*</span>
      </legend>
      <div className="flex items-center gap-1" role="radiogroup" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i > 1 ? 's' : ''} – ${LABELS[i]}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                onChange(Math.min(5, (value || 0) + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                onChange(Math.max(1, (value || 2) - 1));
              }
            }}
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-amber-50"
          >
            <Star className={cn('size-8', i <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
          </button>
        ))}
        <span className="ml-2 text-sm text-slate-600">{shown ? LABELS[shown] : 'Tap a star'}</span>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

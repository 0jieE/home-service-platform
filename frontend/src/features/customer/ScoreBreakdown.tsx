import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatKm, formatScore, formatWeight } from '@/lib/format';

export interface ScoreParts {
  proximity_score: number;
  rating_score: number;
  score: number;
}

export interface Weights {
  w_p: number;
  w_r: number;
}

/** "Proximity 0.500 × 0.50 + Rating 0.750 × 0.50 = 0.625" — rounding is for display only. */
export function scoreBreakdownText(parts: ScoreParts, weights: Weights): string {
  return (
    `Proximity ${formatScore(parts.proximity_score)} × ${formatWeight(weights.w_p)} + ` +
    `Rating ${formatScore(parts.rating_score)} × ${formatWeight(weights.w_r)} = ${formatScore(parts.score)}`
  );
}

export function ScoreBreakdown({
  parts,
  weights,
  distanceKm,
  d0Km = 1,
  hasRatings,
  noRatingQ = 0.5,
  ratingAvg,
  defaultOpen = false,
}: {
  parts: ScoreParts;
  weights: Weights;
  distanceKm?: number;
  d0Km?: number;
  hasRatings?: boolean;
  noRatingQ?: number;
  ratingAvg?: number | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-sm"
      >
        <span>
          <span className="text-slate-500">Score </span>
          <span className="font-semibold text-slate-900 tabular-nums" data-testid="score-value">
            {formatScore(parts.score)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
          {open ? 'Hide' : 'Why this score?'}
          <ChevronDown
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>
      {open && (
        <div id={id} className="space-y-1.5 pt-1 pb-1 text-xs text-slate-600">
          <p className="font-mono text-[13px] text-slate-800 tabular-nums" data-testid="score-breakdown">
            {scoreBreakdownText(parts, weights)}
          </p>
          {distanceKm !== undefined && (
            <p>
              Proximity = 1 / (1 + {formatKm(distanceKm).replace(' km', '')} km ÷ {d0Km} km) ={' '}
              {formatScore(parts.proximity_score)} (straight-line distance)
            </p>
          )}
          <p>
            {hasRatings === false
              ? `Rating = ${formatScore(noRatingQ)} (neutral value — no ratings yet)`
              : ratingAvg !== undefined && ratingAvg !== null
                ? `Rating = (${ratingAvg.toFixed(2)} − 1) ÷ 4 = ${formatScore(parts.rating_score)}`
                : `Rating = ${formatScore(parts.rating_score)}`}
          </p>
          <p className="text-slate-500">
            Credential verification is shown separately and does not affect the score.
          </p>
        </div>
      )}
    </div>
  );
}

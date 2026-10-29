import { Link } from 'react-router';
import { CalendarCheck2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { distanceLabel, formatTimeRange } from '@/lib/format';
import type { RecSettings, RecommendationResult, VerificationSummaryItem } from '@/types/api';
import { CredentialsBadge, RatingLine, Specializations } from '@/features/shared/TechBits';
import { ScoreBreakdown } from './ScoreBreakdown';

export function ResultCard({
  result,
  settings,
  categoryId,
  verification,
  verificationLoading,
  selected,
  compareChecked,
  compareDisabled,
  onToggleCompare,
  onBook,
  onFocus,
}: {
  result: RecommendationResult;
  settings: RecSettings;
  categoryId: number;
  verification?: VerificationSummaryItem[];
  verificationLoading?: boolean;
  selected?: boolean;
  compareChecked: boolean;
  compareDisabled: boolean;
  onToggleCompare: () => void;
  onBook: () => void;
  onFocus?: () => void;
}) {
  const t = result.technician;
  return (
    <article
      id={`result-${t.id}`}
      aria-label={`Rank ${result.rank}: ${t.full_name}`}
      onMouseEnter={onFocus}
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm transition',
        selected ? 'border-sun-400 ring-2 ring-sun-200' : 'border-slate-200/80',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pine-900 font-display text-base font-bold text-sun-400"
          aria-label={`Rank ${result.rank}`}
        >
          {result.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-lg leading-snug font-semibold">
              <Link to={`/c/technicians/${t.id}`} className="hover:underline">
                {t.full_name}
              </Link>
            </h3>
            <CredentialsBadge items={verification} loading={verificationLoading} />
          </div>
          <Specializations items={t.specializations} highlightId={categoryId} className="mt-1.5" />
        </div>
      </div>

      <dl className="mt-3 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <dt className="sr-only">Distance</dt>
          <dd>{distanceLabel(result.distance_km)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Rating</dt>
          <dd>
            <RatingLine
              avg={result.has_ratings ? t.rating_avg : null}
              count={result.has_ratings ? t.rating_count : 0}
            />
          </dd>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <CalendarCheck2 className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <dt className="sr-only">Availability</dt>
          <dd>
            Available {formatTimeRange(result.availability.start, result.availability.end)}
            {t.years_experience ? ` · ${t.years_experience} yrs experience` : ''}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <ScoreBreakdown
          parts={result}
          weights={settings}
          distanceKm={result.distance_km}
          d0Km={settings.d0_km}
          hasRatings={result.has_ratings}
          noRatingQ={settings.no_rating_q}
          ratingAvg={t.rating_avg}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label
          className={cn(
            'inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm',
            compareDisabled && !compareChecked && 'cursor-not-allowed opacity-50',
          )}
        >
          <input
            type="checkbox"
            className="size-5 accent-brand-700"
            checked={compareChecked}
            disabled={compareDisabled && !compareChecked}
            onChange={onToggleCompare}
          />
          Compare
        </label>
        <div className="flex gap-2">
          <Link
            to={`/c/technicians/${t.id}`}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Profile
          </Link>
          <Button onClick={onBook}>Book</Button>
        </div>
      </div>
    </article>
  );
}

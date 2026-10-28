import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, BadgeCheck, Briefcase, CalendarPlus, MapPin, Phone, ShieldAlert } from 'lucide-react';
import { useTechnician, useTechnicianAvailability, useTechnicianReviews } from '@/api/technicians';
import { PointMap } from '@/components/map/TechnicianMap';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { RatingStars } from '@/components/ui/RatingStars';
import { FullPageSpinner, SkeletonList } from '@/components/ui/Spinner';
import { errorMessage } from '@/lib/errors';
import { formatDate, initials, manilaDateString, titleCase } from '@/lib/format';
import { RatingLine, Specializations } from '@/features/shared/TechBits';
import { AvailabilityStrip } from '@/features/shared/AvailabilityStrip';
import type { VerificationOutcome } from '@/types/api';

const OUTCOME_TONE: Record<VerificationOutcome, 'green' | 'red' | 'amber'> = {
  verified: 'green',
  not_verified: 'red',
  inconclusive: 'amber',
};

export function TechnicianDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const tech = useTechnician(id);
  const from = manilaDateString(0);
  const to = manilaDateString(13);
  const availability = useTechnicianAvailability(id, from, to);
  const [reviewPage, setReviewPage] = useState(1);
  const reviews = useTechnicianReviews(id, reviewPage);

  if (tech.isLoading) return <FullPageSpinner label="Loading technician…" />;
  if (tech.isError || !tech.data)
    return <ErrorState message={errorMessage(tech.error)} onRetry={() => tech.refetch()} />;
  const t = tech.data;
  const reviewList = reviews.data?.results ?? t.recent_reviews ?? [];

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-800">
            {initials(t.full_name)}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{t.full_name}</h1>
            <RatingLine avg={t.rating_avg} count={t.rating_count} />
            <Specializations items={t.specializations} />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
              {t.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-slate-400" /> {t.address}
                </span>
              )}
              {t.years_experience !== null && t.years_experience !== undefined && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="size-4 text-slate-400" /> {t.years_experience} years experience
                </span>
              )}
              {t.phone && (
                <a
                  href={`tel:${t.phone}`}
                  className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"
                >
                  <Phone className="size-4" /> {t.phone}
                </a>
              )}
            </div>
            {t.bio && <p className="pt-1 text-sm whitespace-pre-line text-slate-700">{t.bio}</p>}
          </div>
          <Button
            size="lg"
            icon={<CalendarPlus className="size-5" />}
            onClick={() => navigate(`/c/book/${t.id}`)}
          >
            Book
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Credential verification"
            description="Recorded by the administrator. Shown for your information — it does not affect the recommendation score."
          />
          <CardBody>
            {t.verification_summary?.length ? (
              <ul className="space-y-2">
                {t.verification_summary.map((v, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      {v.outcome === 'verified' ? (
                        <BadgeCheck className="size-4 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="size-4 text-amber-600" />
                      )}
                      {v.credential_type}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      <Badge tone={OUTCOME_TONE[v.outcome]}>{titleCase(v.outcome)}</Badge>
                      checked {formatDate(v.checked_on)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No credential verification on record.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Operating location"
            description="Approximate base. Distances in results are straight-line."
          />
          <CardBody>
            {t.location ? (
              <PointMap point={t.location} title={t.full_name} />
            ) : (
              <p className="text-sm text-slate-500">No location set.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Availability — next 14 days"
          description="Green days have free time. Tap a day to book it. Accepted jobs are shown as booked."
        />
        <CardBody>
          {availability.isLoading ? (
            <SkeletonList rows={1} />
          ) : availability.isError ? (
            <ErrorState message={errorMessage(availability.error)} onRetry={() => availability.refetch()} />
          ) : (
            <AvailabilityStrip
              slots={availability.data?.slots ?? []}
              reserved={availability.data?.reserved ?? []}
              onPickDay={(d) => navigate(`/c/book/${t.id}?date=${d}`)}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Reviews (${t.rating_count})`} />
        <CardBody>
          {reviews.isLoading && !reviewList.length ? (
            <SkeletonList rows={2} />
          ) : reviewList.length === 0 ? (
            <EmptyState title="No ratings yet" description="This technician hasn’t been reviewed yet." />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {reviewList.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <RatingStars value={r.rating} />
                      <span className="text-sm font-medium">{r.customer_name}</span>
                      <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span>
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-slate-700">{r.comment}</p>}
                  </li>
                ))}
              </ul>
              {reviews.data && (
                <Pagination
                  page={reviewPage}
                  count={reviews.data.count}
                  hasNext={!!reviews.data.next}
                  onChange={setReviewPage}
                />
              )}
            </>
          )}
        </CardBody>
      </Card>
      <p className="text-center text-sm">
        <Link to="/c/find" className="font-medium text-brand-700 underline">
          Compare with other technicians for a specific time →
        </Link>
      </p>
    </div>
  );
}

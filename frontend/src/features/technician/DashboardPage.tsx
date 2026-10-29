import { Link } from 'react-router';
import { AlertTriangle, CalendarClock, Inbox, Star } from 'lucide-react';
import { useBookings } from '@/api/bookings';
import { useTechMe } from '@/api/technicians';
import { BookingCard } from '@/components/booking/BookingCard';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Alert, Instructions, PageHeader } from '@/components/ui/PageHeader';
import { RatingStars } from '@/components/ui/RatingStars';
import { SkeletonList } from '@/components/ui/Spinner';
import { errorMessage } from '@/lib/errors';
import { manilaDateOf, manilaDateString, titleCase } from '@/lib/format';

const FIELD_LABEL: Record<string, string> = {
  location: 'operating location (map pin)',
  services: 'at least one specialization',
  service_categories: 'at least one specialization',
  service_category_ids: 'at least one specialization',
  specializations: 'at least one specialization',
  phone: 'phone number',
  address: 'address',
  bio: 'short bio',
  years_experience: 'years of experience',
  availability: 'availability schedule',
};

export function TechnicianDashboardPage() {
  const me = useTechMe();
  const pending = useBookings({ status: ['pending'], page_size: 5 });
  const upcoming = useBookings({ status: ['accepted', 'in_progress'], page_size: 50 });

  const today = manilaDateString();
  const todays = (upcoming.data?.results ?? [])
    .filter((b) => manilaDateOf(b.start) === today || b.status === 'in_progress')
    .sort((a, b) => a.start.localeCompare(b.start));
  const missing = me.data?.missing_fields ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Hello${me.data ? `, ${me.data.full_name.split(' ')[0]}` : ''}`}
        description="Your requests, today’s jobs and ratings at a glance."
      />
      <Instructions title="Your job as a technician">
        <p>
          Keep your availability up to date so customers can find you. Accept or decline requests quickly.
          When a job is done, request completion confirmation from the customer.
        </p>
      </Instructions>

      {me.isError && <ErrorState message={errorMessage(me.error)} onRetry={() => me.refetch()} />}
      {me.data && (missing.length > 0 || me.data.is_profile_complete === false) && (
        <Alert
          tone="amber"
          icon={<AlertTriangle className="size-5" />}
          title="Your profile is incomplete — you won’t appear in recommendations yet"
        >
          <p>
            Missing:{' '}
            {missing.length
              ? missing.map((f) => FIELD_LABEL[f] ?? titleCase(f)).join(', ')
              : 'required details'}
            .
          </p>
          <Link to="/t/profile" className="mt-2 inline-block font-semibold underline">
            Complete my profile →
          </Link>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-sun-200 text-pine-900">
              <Inbox className="size-6" />
            </span>
            <div>
              <p className="font-display text-[1.75rem] leading-none font-bold">
                {pending.data?.count ?? '—'}
              </p>
              <p className="text-sm text-slate-500">Pending requests</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
              <CalendarClock className="size-6" />
            </span>
            <div>
              <p className="font-display text-[1.75rem] leading-none font-bold">
                {upcoming.data ? todays.length : '—'}
              </p>
              <p className="text-sm text-slate-500">Jobs today</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-pine-900 text-sun-400">
              <Star className="size-6" />
            </span>
            <div>
              {me.data?.rating_count ? (
                <>
                  <p className="flex items-center gap-2 font-display text-[1.75rem] leading-none font-bold">
                    {(me.data.rating_avg ?? 0).toFixed(1)} <RatingStars value={me.data.rating_avg ?? 0} />
                  </p>
                  <p className="text-sm text-slate-500">{me.data.rating_count} reviews</p>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-semibold">No ratings yet</p>
                  <p className="text-sm text-slate-500">Complete jobs to get reviews</p>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Today’s jobs"
            action={
              <ButtonLink to="/t/jobs" variant="ghost" size="sm">
                All jobs
              </ButtonLink>
            }
          />
          <CardBody>
            {upcoming.isLoading ? (
              <SkeletonList rows={2} />
            ) : todays.length ? (
              <ul className="space-y-3">
                {todays.map((b) => (
                  <li key={b.id}>
                    <BookingCard booking={b} viewer="technician" />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No jobs today" description="Accepted jobs for today will appear here." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Newest requests"
            action={
              <ButtonLink to="/t/requests" variant="ghost" size="sm">
                All requests
              </ButtonLink>
            }
          />
          <CardBody>
            {pending.isLoading ? (
              <SkeletonList rows={2} />
            ) : pending.data?.results.length ? (
              <ul className="space-y-3">
                {pending.data.results.map((b) => (
                  <li key={b.id}>
                    <BookingCard booking={b} viewer="technician" highlight={b.conflicts_with_reserved} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No pending requests"
                description="Make sure your availability covers the times customers need."
                action={
                  <ButtonLink to="/t/availability" variant="outline">
                    Manage availability
                  </ButtonLink>
                }
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

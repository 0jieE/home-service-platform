import type { ReactNode } from 'react';
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
import { cn } from '@/lib/cn';
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

/** Compact on phones (icon above the number) so all three tiles fit one row. */
function StatTile({
  icon,
  iconClassName,
  value,
  label,
  hint,
}: {
  icon: ReactNode;
  iconClassName: string;
  value: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-6 sm:py-5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11',
          iconClassName,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-display text-2xl leading-none font-bold sm:text-[1.75rem]">
          {value}
        </p>
        <p className="mt-1 text-xs leading-tight text-slate-600 sm:text-sm">{label}</p>
        {hint && <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">{hint}</p>}
      </div>
    </Card>
  );
}

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

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatTile
          icon={<Inbox className="size-5 sm:size-6" />}
          iconClassName="bg-sun-200 text-pine-900"
          value={pending.data?.count ?? '—'}
          label="Pending requests"
        />
        <StatTile
          icon={<CalendarClock className="size-5 sm:size-6" />}
          iconClassName="bg-brand-100 text-brand-800"
          value={upcoming.data ? todays.length : '—'}
          label="Jobs today"
        />
        {me.data?.rating_count ? (
          <StatTile
            icon={<Star className="size-5 sm:size-6" />}
            iconClassName="bg-pine-900 text-sun-400"
            value={
              <>
                {(me.data.rating_avg ?? 0).toFixed(1)}
                <span className="hidden md:inline-flex">
                  <RatingStars value={me.data.rating_avg ?? 0} />
                </span>
              </>
            }
            label={`${me.data.rating_count} ${me.data.rating_count === 1 ? 'review' : 'reviews'}`}
          />
        ) : (
          <StatTile
            icon={<Star className="size-5 sm:size-6" />}
            iconClassName="bg-pine-900 text-sun-400"
            value="—"
            label="No ratings yet"
            hint="Complete jobs to get reviews"
          />
        )}
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

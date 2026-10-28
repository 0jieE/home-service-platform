import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CalendarClock, Inbox, MapPin, Ruler, StickyNote, UserRound } from 'lucide-react';
import { useBookings } from '@/api/bookings';
import { ActionBar } from '@/components/booking/ActionBar';
import { BookingStatusBadges } from '@/components/booking/StatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { distanceLabel, formatDateTime, formatRange } from '@/lib/format';

export function RequestsPage() {
  const [page, setPage] = useState(1);
  const q = useBookings({ status: ['pending'], page });

  return (
    <div>
      <PageHeader title="Booking requests" description="Customers waiting for your answer." />
      <Instructions title="Accept or decline">
        <p>
          Accepting reserves the time. Availability and conflicts are checked again when you accept. Requests marked{' '}
          <strong className="text-red-700">Time conflict</strong> overlap a job you already accepted and cannot be accepted — decline them so the customer can book someone else.
        </p>
      </Instructions>
      {q.isLoading ? (
        <SkeletonList rows={3} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.results.length ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title="No pending requests"
          description="New requests appear here instantly. Keep your availability up to date."
          action={<ButtonLink to="/t/availability" variant="outline">Manage availability</ButtonLink>}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {q.data.results.map((b) => (
              <li
                key={b.id}
                className={cn(
                  'rounded-xl border bg-white p-4 shadow-sm',
                  b.conflicts_with_reserved ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      Request #{b.id} · received {formatDateTime(b.created_at)}
                    </p>
                    <h2 className="text-base font-semibold">
                      <Link to={`/t/jobs/${b.id}`} className="hover:underline">
                        {b.category.name} for {b.customer.full_name}
                      </Link>
                    </h2>
                  </div>
                  <BookingStatusBadges booking={b} />
                </div>
                {b.conflicts_with_reserved && (
                  <p className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertTriangle className="size-4" /> Overlaps a job you already accepted.
                  </p>
                )}
                <dl className="mt-3 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
                  <Item icon={<CalendarClock className="size-4" />} label="When" value={formatRange(b.start, b.end)} />
                  <Item icon={<UserRound className="size-4" />} label="Customer" value={`${b.customer.full_name}${b.customer.phone ? ` · ${b.customer.phone}` : ''}`} />
                  <Item icon={<MapPin className="size-4" />} label="Address" value={b.address} />
                  {b.distance_km !== null && <Item icon={<Ruler className="size-4" />} label="Distance" value={distanceLabel(b.distance_km)} />}
                  {b.notes && <Item icon={<StickyNote className="size-4" />} label="Notes" value={b.notes} className="sm:col-span-2" />}
                </dl>
                <ActionBar booking={b} className="mt-4" />
              </li>
            ))}
          </ul>
          <Pagination page={page} count={q.data.count} hasNext={!!q.data.next} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function Item({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

import { useSearchParams } from 'react-router';
import { CalendarX } from 'lucide-react';
import { useBookings } from '@/api/bookings';
import { BookingCard } from '@/components/booking/BookingCard';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { errorMessage } from '@/lib/errors';
import { ACTIVE_STATUSES, PAST_STATUSES } from '@/types/api';

type Tab = 'active' | 'past';

export function BookingsPage() {
  const [sp, setSp] = useSearchParams();
  const tab: Tab = sp.get('tab') === 'past' ? 'past' : 'active';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const active = useBookings({ status: ACTIVE_STATUSES, page: tab === 'active' ? page : 1 });
  const past = useBookings({ status: PAST_STATUSES, page: tab === 'past' ? page : 1 });
  const q = tab === 'active' ? active : past;

  return (
    <div>
      <PageHeader title="My bookings" description="Track your requests and jobs." />
      <Instructions title="Booking steps">
        <p>
          <strong>Pending</strong>: waiting for the technician. <strong>Accepted</strong>: the time is reserved.{' '}
          <strong>In progress</strong>: work started — when the technician asks, confirm completion (or report a problem).
          After completion you can leave a review.
        </p>
      </Instructions>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setSp({ tab: v })}
        items={[
          { value: 'active', label: 'Active', count: active.data?.count },
          { value: 'past', label: 'Past', count: past.data?.count },
        ]}
      />
      {q.isLoading ? (
        <SkeletonList rows={3} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.results.length ? (
        <EmptyState
          icon={<CalendarX className="size-6" />}
          title={tab === 'active' ? 'No active bookings' : 'No past bookings yet'}
          description={tab === 'active' ? 'Find a technician and send a booking request.' : 'Completed, declined and cancelled bookings appear here.'}
          action={<ButtonLink to="/c/find">Find a technician</ButtonLink>}
        />
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {q.data.results.map((b) => (
              <li key={b.id}>
                <BookingCard booking={b} viewer="customer" />
              </li>
            ))}
          </ul>
          <Pagination page={page} count={q.data.count} hasNext={!!q.data.next} onChange={(p) => setSp({ tab, page: String(p) })} />
        </>
      )}
    </div>
  );
}

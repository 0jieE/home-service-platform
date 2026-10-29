import { useSearchParams } from 'react-router';
import { CalendarX } from 'lucide-react';
import { useBookings, type BookingListParams } from '@/api/bookings';
import { BookingCard } from '@/components/booking/BookingCard';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonList } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { errorMessage } from '@/lib/errors';
import { ACTIVE_STATUSES, type BookingStatus } from '@/types/api';

type Tab = 'all' | 'active' | 'completed' | 'closed';
type Ordering = NonNullable<BookingListParams['ordering']>;

const TAB_STATUSES: Record<Tab, BookingStatus[] | undefined> = {
  all: undefined,
  active: ACTIVE_STATUSES,
  completed: ['completed'],
  closed: ['declined', 'cancelled'],
};

const EMPTY: Record<Tab, string> = {
  all: 'No bookings yet. They appear here as soon as a customer sends a request.',
  active: 'No pending, accepted or in-progress bookings right now.',
  completed: 'No completed bookings yet.',
  closed: 'No declined or cancelled bookings.',
};

const ORDERINGS: { value: Ordering; label: string }[] = [
  { value: '-created_at', label: 'Newest requests first' },
  { value: 'start', label: 'Appointment: earliest first' },
  { value: '-start', label: 'Appointment: latest first' },
];

function isTab(v: string | null): v is Tab {
  return v === 'all' || v === 'active' || v === 'completed' || v === 'closed';
}

export function AdminBookingsPage() {
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'all';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const orderingParam = sp.get('ordering');
  const ordering: Ordering = ORDERINGS.some((o) => o.value === orderingParam)
    ? (orderingParam as Ordering)
    : '-created_at';

  const list = useBookings({ status: TAB_STATUSES[tab], ordering, page });
  // Tab counts only (one row each).
  const counts = {
    all: useBookings({ page_size: 1 }),
    active: useBookings({ status: TAB_STATUSES.active, page_size: 1 }),
    completed: useBookings({ status: TAB_STATUSES.completed, page_size: 1 }),
    closed: useBookings({ status: TAB_STATUSES.closed, page_size: 1 }),
  };

  const update = (next: { tab?: Tab; ordering?: Ordering; page?: number }) => {
    const p = new URLSearchParams();
    const t = next.tab ?? tab;
    const o = next.ordering ?? ordering;
    if (t !== 'all') p.set('tab', t);
    if (o !== '-created_at') p.set('ordering', o);
    if (next.page && next.page > 1) p.set('page', String(next.page));
    setSp(p);
  };

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Every booking on the platform. Open one to see its details and status history. Customers and technicians act on their own bookings; you decide disputes."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          className="min-w-0 sm:flex-1"
          label="Booking status"
          value={tab}
          onChange={(v) => update({ tab: v })}
          items={[
            { value: 'all', label: 'All', count: counts.all.data?.count },
            { value: 'active', label: 'Active', count: counts.active.data?.count },
            { value: 'completed', label: 'Completed', count: counts.completed.data?.count },
            { value: 'closed', label: 'Declined & cancelled', count: counts.closed.data?.count },
          ]}
        />
        <Select
          wrapperClassName="sm:w-60"
          label="Sort by"
          value={ordering}
          options={ORDERINGS}
          onChange={(e) => update({ ordering: e.target.value as Ordering })}
        />
      </div>

      {list.isLoading ? (
        <SkeletonList rows={4} />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data?.results.length ? (
        <EmptyState
          icon={<CalendarX className="size-6" />}
          title="No bookings here"
          description={EMPTY[tab]}
        />
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {list.data.results.map((b) => (
              <li key={b.id}>
                <BookingCard booking={b} viewer="admin" />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            count={list.data.count}
            hasNext={!!list.data.next}
            onChange={(p) => update({ page: p })}
          />
        </>
      )}
    </div>
  );
}

import { useSearchParams } from 'react-router';
import { Briefcase } from 'lucide-react';
import { useBookings } from '@/api/bookings';
import { BookingCard } from '@/components/booking/BookingCard';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { errorMessage } from '@/lib/errors';
import { PAST_STATUSES, type BookingStatus } from '@/types/api';

type Tab = 'accepted' | 'in_progress' | 'past';
const TAB_STATUS: Record<Tab, BookingStatus[]> = {
  accepted: ['accepted'],
  in_progress: ['in_progress'],
  past: PAST_STATUSES,
};

export function JobsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (['accepted', 'in_progress', 'past'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'accepted') as Tab;
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const accepted = useBookings({ status: TAB_STATUS.accepted, page: tab === 'accepted' ? page : 1 });
  const inProgress = useBookings({ status: TAB_STATUS.in_progress, page: tab === 'in_progress' ? page : 1 });
  const past = useBookings({ status: TAB_STATUS.past, page: tab === 'past' ? page : 1 });
  const q = tab === 'accepted' ? accepted : tab === 'in_progress' ? inProgress : past;
  const list = tab === 'accepted' ? [...(q.data?.results ?? [])].sort((a, b) => a.start.localeCompare(b.start)) : (q.data?.results ?? []);

  return (
    <div>
      <PageHeader title="My jobs" description="Accepted, in-progress and past jobs." />
      <Instructions title="Job steps">
        <p>
          Open a job to <strong>start work</strong> (from 60 minutes before the start), then <strong>request completion confirmation</strong> when you finish. The customer confirms — or opens a dispute that an administrator resolves.
        </p>
      </Instructions>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setSp({ tab: v })}
        items={[
          { value: 'accepted', label: 'Upcoming', count: accepted.data?.count },
          { value: 'in_progress', label: 'In progress', count: inProgress.data?.count },
          { value: 'past', label: 'Past', count: past.data?.count },
        ]}
      />
      {q.isLoading ? (
        <SkeletonList rows={3} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title={tab === 'past' ? 'No past jobs yet' : tab === 'in_progress' ? 'No jobs in progress' : 'No upcoming jobs'}
          description="Accept requests to fill your schedule."
          action={<ButtonLink to="/t/requests" variant="outline">View requests</ButtonLink>}
        />
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((b) => (
              <li key={b.id}>
                <BookingCard booking={b} viewer="technician" />
              </li>
            ))}
          </ul>
          <Pagination page={page} count={q.data?.count ?? 0} hasNext={!!q.data?.next} onChange={(p) => setSp({ tab, page: String(p) })} />
        </>
      )}
    </div>
  );
}

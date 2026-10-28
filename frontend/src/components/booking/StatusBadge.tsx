import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { Booking, BookingStatus } from '@/types/api';

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  in_progress: 'In progress',
  completed: 'Completed',
};

const STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  pending: 'amber',
  accepted: 'blue',
  declined: 'gray',
  cancelled: 'gray',
  in_progress: 'violet',
  completed: 'green',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** Status plus sub-states that the contract keeps inside `in_progress` (completion requested, dispute). */
export function BookingStatusBadges({ booking }: { booking: Booking }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <StatusBadge status={booking.status} />
      {booking.status === 'in_progress' && booking.completion_requested_at && !booking.dispute && (
        <Badge tone="brand">Completion requested</Badge>
      )}
      {booking.dispute && (
        <Badge tone={booking.dispute.status === 'open' ? 'red' : 'gray'}>
          {booking.dispute.status === 'open' ? 'Dispute open' : 'Dispute resolved'}
        </Badge>
      )}
      {booking.status === 'pending' && booking.conflicts_with_reserved && (
        <Badge tone="red">Time conflict</Badge>
      )}
    </span>
  );
}

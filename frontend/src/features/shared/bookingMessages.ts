import { formatShortDateTime } from '@/lib/format';
import type { Booking, BookingEvent, Role } from '@/types/api';

/**
 * Plain-language toast copy for a booking event, e.g.
 * "Ben Santos accepted your Plumbing request for Nov 3, 9:00 AM".
 */
export function bookingEventMessage(event: BookingEvent, booking: Booking, viewer: Role): string {
  const tech = booking.technician.full_name;
  const cust = booking.customer.full_name;
  const service = booking.category.name;
  const when = formatShortDateTime(booking.start);
  const yourReq = viewer === 'customer' ? `your ${service} request` : `the ${service} request`;
  const yourJob = viewer === 'technician' ? `your ${service} job` : `the ${service} job`;

  switch (event) {
    case 'created':
      return viewer === 'technician'
        ? `New request: ${cust} asked for ${service} on ${when}`
        : `Booking request for ${service} on ${when} was sent`;
    case 'accepted':
      return `${tech} accepted ${yourReq} for ${when}`;
    case 'declined':
      return `${tech} declined ${yourReq} for ${when}`;
    case 'cancelled': {
      const by = booking.cancelled_by_role;
      const who = by === 'customer' ? cust : by === 'technician' ? tech : by === 'admin' ? 'An administrator' : 'The system';
      const reason = booking.cancellation_reason === 'expired' ? ' (it expired before being accepted)' : '';
      return `${who} cancelled the ${service} booking for ${when}${reason}`;
    }
    case 'started':
      return `${tech} started ${viewer === 'customer' ? `your ${service} job` : `the ${service} job`} (${when})`;
    case 'completion_requested':
      return viewer === 'customer'
        ? `${tech} says your ${service} job is done — please confirm completion`
        : `Completion requested for the ${service} job (${when})`;
    case 'completed':
      return viewer === 'technician'
        ? `${cust} confirmed ${yourJob} as completed`
        : `The ${service} job for ${when} is completed`;
    case 'disputed':
      return `${cust} opened a dispute on the ${service} job (${when})`;
    case 'dispute_resolved':
      return `The administrator resolved the dispute on the ${service} job (${when})`;
    case 'reviewed':
      return viewer === 'technician' ? `${cust} left a review for ${yourJob}` : `Review posted for the ${service} job`;
    default:
      return `Booking #${booking.id} was updated`;
  }
}

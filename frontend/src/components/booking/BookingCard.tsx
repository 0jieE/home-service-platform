import { Link } from 'react-router';
import { CalendarClock, ChevronRight, MapPin, UserRound } from 'lucide-react';
import { formatRange } from '@/lib/format';
import type { Booking, Role } from '@/types/api';
import { BookingStatusBadges } from './StatusBadge';

export function bookingPath(role: Role, id: number) {
  return role === 'customer' ? `/c/bookings/${id}` : role === 'technician' ? `/t/jobs/${id}` : `/a/bookings/${id}`;
}

export function BookingCard({ booking, viewer, highlight }: { booking: Booking; viewer: Role; highlight?: boolean }) {
  const other = viewer === 'customer' ? booking.technician : booking.customer;
  const otherLabel = viewer === 'customer' ? 'Technician' : 'Customer';
  return (
    <Link
      to={bookingPath(viewer, booking.id)}
      className={
        'group block rounded-xl border bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow ' +
        (highlight ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">Booking #{booking.id}</p>
          <h3 className="mt-0.5 font-semibold text-slate-900">{booking.category.name}</h3>
        </div>
        <BookingStatusBadges booking={booking} />
      </div>
      <dl className="mt-3 grid gap-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <dt className="sr-only">When</dt>
          <dd>{formatRange(booking.start, booking.end)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <UserRound className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <dt className="sr-only">{otherLabel}</dt>
          <dd>
            {otherLabel}: <span className="font-medium text-slate-800">{other.full_name}</span>
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <dt className="sr-only">Address</dt>
          <dd className="line-clamp-1">{booking.address || '—'}</dd>
        </div>
      </dl>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 group-hover:underline">
        View details <ChevronRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

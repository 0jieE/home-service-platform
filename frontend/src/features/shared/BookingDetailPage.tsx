import { Link, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ClipboardCheck,
  MapPin,
  Phone,
  Ruler,
  Scale,
  StickyNote,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useBooking } from '@/api/bookings';
import { ActionBar } from '@/components/booking/ActionBar';
import { BookingStatusBadges } from '@/components/booking/StatusBadge';
import { StatusTimeline } from '@/components/booking/StatusTimeline';
import { PointMap } from '@/components/map/TechnicianMap';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/PageHeader';
import { RatingStars } from '@/components/ui/RatingStars';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/useAuth';
import { errorMessage } from '@/lib/errors';
import { distanceLabel, formatDate, formatDateTime, formatRange, titleCase } from '@/lib/format';
import type { Booking, Role } from '@/types/api';

const BACK: Record<Role, { to: string; label: string }> = {
  customer: { to: '/c/bookings', label: 'My bookings' },
  technician: { to: '/t/jobs', label: 'My jobs' },
  admin: { to: '/a/disputes', label: 'Disputes' },
};

function StatusGuidance({ booking, role }: { booking: Booking; role: Role }) {
  const b = booking;
  if (role === 'customer') {
    if (b.status === 'pending')
      return (
        <Alert tone="blue" title="Waiting for the technician">
          The technician will accept or decline. You’ll get a notification. You can cancel any time before the
          start.
        </Alert>
      );
    if (b.status === 'accepted')
      return (
        <Alert tone="green" title="Accepted — your time is reserved">
          {b.technician.full_name} will arrive for the appointment. If you must cancel, a reason is required.
        </Alert>
      );
    if (b.status === 'in_progress' && b.dispute?.status === 'open')
      return (
        <Alert tone="red" title="Dispute open">
          An administrator is reviewing this job and will record a decision.
        </Alert>
      );
    if (b.status === 'in_progress' && b.completion_requested_at)
      return (
        <Alert tone="amber" icon={<ClipboardCheck className="size-5" />} title="Please confirm completion">
          {b.technician.full_name} says the work is done ({formatDateTime(b.completion_requested_at)}).
          Confirm if it is finished, or report a problem.
        </Alert>
      );
    if (b.status === 'in_progress')
      return (
        <Alert tone="blue" title="Work in progress">
          The technician will ask you to confirm when finished.
        </Alert>
      );
    if (b.status === 'completed' && !b.review)
      return (
        <Alert tone="green" title="Completed">
          How did it go? Leave a review to help other customers.
        </Alert>
      );
  }
  if (role === 'technician') {
    if (b.status === 'pending' && b.conflicts_with_reserved)
      return (
        <Alert tone="red" icon={<AlertTriangle className="size-5" />} title="Time conflict">
          This request overlaps a job you already accepted, so it can’t be accepted. Decline it so the
          customer can book someone else.
        </Alert>
      );
    if (b.status === 'pending')
      return (
        <Alert tone="blue" title="New request">
          Accepting reserves this time for the customer. Availability is checked again when you accept.
        </Alert>
      );
    if (b.status === 'accepted')
      return (
        <Alert tone="blue" title="Upcoming job">
          You can start the job up to 60 minutes before the start time.
        </Alert>
      );
    if (b.status === 'in_progress' && b.dispute?.status === 'open')
      return (
        <Alert tone="red" title="Dispute open">
          The customer reported a problem. An administrator will decide.
        </Alert>
      );
    if (b.status === 'in_progress' && b.completion_requested_at)
      return (
        <Alert tone="amber" title="Waiting for customer confirmation">
          You requested completion on {formatDateTime(b.completion_requested_at)}.
        </Alert>
      );
    if (b.status === 'in_progress')
      return (
        <Alert tone="blue" title="In progress">
          When the work is done, request completion confirmation from the customer.
        </Alert>
      );
  }
  return null;
}

export function BookingDetailPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const q = useBooking(id);

  if (q.isLoading) return <FullPageSpinner label="Loading booking…" />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const b = q.data;
  const back = BACK[role];

  return (
    <div className="space-y-5">
      <Link
        to={back.to}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> {back.label}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Booking #{b.id}</p>
          <h1 className="text-[1.75rem] leading-tight font-bold sm:text-[2.25rem]">{b.category.name}</h1>
          <p className="text-sm text-slate-600">{formatRange(b.start, b.end)}</p>
        </div>
        <BookingStatusBadges booking={b} />
      </div>

      <StatusGuidance booking={b} role={role} />

      {b.allowed_actions?.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="sr-only">Actions</h2>
            <ActionBar booking={b} />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Row icon={<Wrench className="size-4" />} label="Service" value={b.category.name} />
              <Row
                icon={<CalendarClock className="size-4" />}
                label="When"
                value={formatRange(b.start, b.end)}
              />
              {role !== 'technician' && (
                <Party icon={<UserRound className="size-4" />} label="Technician" party={b.technician} />
              )}
              {role !== 'customer' && (
                <Party icon={<UserRound className="size-4" />} label="Customer" party={b.customer} />
              )}
              <Row icon={<MapPin className="size-4" />} label="Address" value={b.address || '—'} />
              {b.distance_km !== null && b.distance_km !== undefined && (
                <Row
                  icon={<Ruler className="size-4" />}
                  label="Distance at booking"
                  value={distanceLabel(b.distance_km)}
                />
              )}
              {b.notes && <Row icon={<StickyNote className="size-4" />} label="Notes" value={b.notes} />}
              {b.started_at && (
                <Row
                  icon={<CalendarClock className="size-4" />}
                  label="Work started"
                  value={formatDateTime(b.started_at)}
                />
              )}
              {b.completion_notes && (
                <Row
                  icon={<ClipboardCheck className="size-4" />}
                  label="Technician’s completion notes"
                  value={b.completion_notes}
                />
              )}
              {b.decline_reason && (
                <Row
                  icon={<StickyNote className="size-4" />}
                  label="Decline reason"
                  value={b.decline_reason}
                />
              )}
              {b.cancellation_reason && (
                <Row
                  icon={<StickyNote className="size-4" />}
                  label={`Cancelled by ${b.cancelled_by_role ? titleCase(b.cancelled_by_role) : '—'}`}
                  value={b.cancellation_reason}
                />
              )}
              {b.completed_at && (
                <Row
                  icon={<ClipboardCheck className="size-4" />}
                  label="Completed"
                  value={`${formatDateTime(b.completed_at)}${b.confirmed_by ? ` · confirmed by ${b.confirmed_by}` : ''}`}
                />
              )}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Service location" />
          <CardBody>
            <PointMap point={b.location} title={b.address || 'Service location'} className="h-64" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${b.location?.lat},${b.location?.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-brand-700 underline"
            >
              Open in Google Maps
            </a>
          </CardBody>
        </Card>
      </div>

      {b.dispute && (
        <Card>
          <CardHeader
            title="Dispute"
            description={`Opened ${formatDateTime(b.dispute.created_at)}`}
            action={<Scale className="size-5 text-slate-400" />}
          />
          <CardBody className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Reason:</span> {b.dispute.reason}
            </p>
            {b.dispute.status === 'resolved' ? (
              <>
                <p>
                  <span className="font-medium">Decision:</span> {titleCase(b.dispute.decision ?? '—')}
                  {b.dispute.resolved_at && ` (${formatDateTime(b.dispute.resolved_at)})`}
                </p>
                {b.dispute.admin_notes && (
                  <p>
                    <span className="font-medium">Administrator notes:</span> {b.dispute.admin_notes}
                  </p>
                )}
              </>
            ) : (
              <p className="text-slate-500">Waiting for the administrator’s decision.</p>
            )}
            {role === 'admin' && b.dispute.status === 'open' && (
              <Link to="/a/disputes" className="inline-block font-medium text-brand-700 underline">
                Resolve in Disputes
              </Link>
            )}
          </CardBody>
        </Card>
      )}

      {b.review && (
        <Card>
          <CardHeader title="Review" />
          <CardBody>
            <div className="flex items-center gap-2">
              <RatingStars value={b.review.rating} size="md" />
              <span className="text-sm text-slate-500">{formatDate(b.review.created_at)}</span>
            </div>
            {b.review.comment && <p className="mt-2 text-sm text-slate-700">{b.review.comment}</p>}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Status history" description="Every change is recorded and never deleted." />
        <CardBody>
          <StatusTimeline history={b.status_history} />
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="font-medium break-words whitespace-pre-line text-slate-800">{value}</dd>
      </div>
    </div>
  );
}

function Party({
  icon,
  label,
  party,
}: {
  icon: React.ReactNode;
  label: string;
  party: { full_name: string; phone: string };
}) {
  return (
    <Row
      icon={icon}
      label={label}
      value={
        <span className="flex flex-wrap items-center gap-x-3">
          {party.full_name}
          {party.phone && (
            <a
              href={`tel:${party.phone}`}
              className="inline-flex items-center gap-1 font-normal text-brand-700 hover:underline"
            >
              <Phone className="size-3.5" /> {party.phone}
            </a>
          )}
        </span>
      }
    />
  );
}

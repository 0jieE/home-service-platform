import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarClock, MapPin, Ruler, UserRound, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateBooking } from '@/api/bookings';
import { Button } from '@/components/ui/Button';
import { FormError, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { errorCode, errorMessage } from '@/lib/errors';
import { distanceLabel, formatRange } from '@/lib/format';
import { bookingNotesSchema } from '@/types/schemas';
import type { CategoryRef, Point } from '@/types/api';

export interface BookingDraft {
  technicianId: number;
  technicianName: string;
  category: CategoryRef;
  location: Point;
  address: string;
  start: string;
  end: string;
  distanceKm?: number;
}

export function BookingConfirmModal({ draft, onClose }: { draft: BookingDraft | null; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateBooking();
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!draft) return null;

  const submit = async () => {
    const parsed = bookingNotesSchema.safeParse({ notes });
    if (!parsed.success) {
      setNotesError(parsed.error.issues[0]?.message ?? 'Invalid notes');
      return;
    }
    setError(null);
    try {
      const booking = await create.mutateAsync({
        technician_id: draft.technicianId,
        category_id: draft.category.id,
        location: draft.location,
        address: draft.address,
        start: draft.start,
        end: draft.end,
        notes: parsed.data.notes,
      });
      toast.success(`Request sent to ${draft.technicianName}. You'll be notified when they respond.`);
      navigate(`/c/bookings/${booking.id}`);
    } catch (err) {
      const code = errorCode(err);
      setError(
        code === 'technician_unavailable'
          ? `${errorMessage(err)} Close this and refresh the results to see who is still free.`
          : errorMessage(err),
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm booking request"
      description="The technician will accept or decline. The time is reserved only after they accept."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Back
          </Button>
          <Button onClick={() => void submit()} loading={create.isPending}>
            Send booking request
          </Button>
        </>
      }
    >
      <dl className="space-y-3 text-sm">
        <Row icon={<UserRound className="size-4" />} label="Technician" value={draft.technicianName} />
        <Row icon={<Wrench className="size-4" />} label="Service" value={draft.category.name} />
        <Row
          icon={<CalendarClock className="size-4" />}
          label="When"
          value={formatRange(draft.start, draft.end)}
        />
        <Row
          icon={<MapPin className="size-4" />}
          label="Where"
          value={draft.address || `${draft.location.lat.toFixed(5)}, ${draft.location.lng.toFixed(5)}`}
        />
        {draft.distanceKm !== undefined && (
          <Row icon={<Ruler className="size-4" />} label="Distance" value={distanceLabel(draft.distanceKm)} />
        )}
      </dl>
      <Textarea
        wrapperClassName="mt-4"
        label="Notes for the technician (optional)"
        placeholder="Describe the problem, e.g. Leaking pipe under the kitchen sink"
        value={notes}
        error={notesError ?? undefined}
        onChange={(e) => {
          setNotes(e.target.value);
          setNotesError(null);
        }}
      />
      <div className="mt-3">
        <FormError message={error} />
      </div>
    </Modal>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="font-medium text-slate-800">{value}</dd>
      </div>
    </div>
  );
}

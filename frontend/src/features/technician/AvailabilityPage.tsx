import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Lock, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBookings } from '@/api/bookings';
import { useCreateSlot, useDeleteSlot, useGenerateSchedule, useMyAvailability, useUpdateSlot } from '@/api/technicians';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/EmptyState';
import { Checkbox, FormError, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import {
  formatDate,
  formatTimeRange,
  manilaDateOf,
  manilaDateString,
  manilaIso,
  manilaTimeOf,
  manilaWeekday,
  shiftDate,
  timeOptions,
} from '@/lib/format';
import { generateScheduleSchema, slotSchema, type GenerateScheduleValues, type SlotValues } from '@/types/schemas';
import type { AvailabilitySlot } from '@/types/api';

/** Contract weekdays: 0 = Monday … 6 = Sunday (Python's date.weekday()). */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function mondayOf(date: string) {
  return shiftDate(date, -manilaWeekday(`${date}T12:00:00+08:00`));
}

export function AvailabilityPage() {
  const today = manilaDateString();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const weekEnd = shiftDate(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));

  const slots = useMyAvailability(weekStart, weekEnd);
  const reserved = useBookings({ status: ['accepted', 'in_progress'], page_size: 100 });

  const [editing, setEditing] = useState<{ slot?: AvailabilitySlot; date: string } | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const slotsByDay = useMemo(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    for (const s of slots.data ?? []) {
      const d = manilaDateOf(s.start);
      (map[d] ??= []).push(s);
    }
    Object.values(map).forEach((l) => l.sort((a, b) => a.start.localeCompare(b.start)));
    return map;
  }, [slots.data]);

  const reservedByDay = useMemo(() => {
    const map: Record<string, { id: number; start: string; end: string; label: string }[]> = {};
    for (const b of reserved.data?.results ?? []) {
      const d = manilaDateOf(b.start);
      (map[d] ??= []).push({ id: b.id, start: b.start, end: b.end, label: `${b.category.name} · ${b.customer.full_name}` });
    }
    return map;
  }, [reserved.data]);

  return (
    <div>
      <PageHeader
        title="Availability"
        description="When customers can book you."
        actions={
          <>
            <Button variant="outline" icon={<Wand2 className="size-4" />} onClick={() => setShowGenerate(true)}>
              Generate weekly schedule
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ date: today >= weekStart && today <= weekEnd ? today : weekStart })}>
              Add slot
            </Button>
          </>
        }
      />
      <Instructions title="How availability works">
        <p>
          Customers can only book a time that fits completely inside one of your <strong>available</strong> slots. Mark
          time as <strong>unavailable</strong> to block it. Accepted jobs are shown with a lock and can’t be removed from
          here — a slot containing an accepted job can’t be deleted or shortened.
        </p>
      </Instructions>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => setWeekStart(shiftDate(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(today))}>
            This week
          </Button>
          <Button variant="outline" size="sm" aria-label="Next week" onClick={() => setWeekStart(shiftDate(weekStart, 7))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="text-sm font-medium text-slate-700">
          {formatDate(`${weekStart}T12:00:00+08:00`, 'MMM d')} – {formatDate(`${weekEnd}T12:00:00+08:00`, 'MMM d, yyyy')}
        </p>
      </div>

      {slots.isError ? (
        <ErrorState message={errorMessage(slots.error)} onRetry={() => slots.refetch()} />
      ) : (
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((d, i) => {
            const past = d < today;
            const daySlots = slotsByDay[d] ?? [];
            const dayReserved = reservedByDay[d] ?? [];
            return (
              <section
                key={d}
                aria-label={formatDate(`${d}T12:00:00+08:00`, 'EEEE, MMMM d')}
                className={cn(
                  'flex min-h-40 flex-col rounded-xl border bg-white p-2',
                  d === today ? 'border-brand-400 ring-1 ring-brand-200' : 'border-slate-200',
                  past && 'opacity-60',
                )}
              >
                <header className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-sm font-semibold">{WEEKDAYS[i]}</span>
                  <span className="text-xs text-slate-500">{formatDate(`${d}T12:00:00+08:00`, 'MMM d')}</span>
                </header>
                <div className="flex-1 space-y-1.5">
                  {slots.isLoading ? (
                    <Skeleton className="h-10" />
                  ) : (
                    daySlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setEditing({ slot: s, date: d })}
                        className={cn(
                          'block min-h-11 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium',
                          s.state === 'available'
                            ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200',
                        )}
                      >
                        {formatTimeRange(s.start, s.end)}
                        <span className="block font-normal">{s.state === 'available' ? 'Available' : 'Unavailable'}</span>
                      </button>
                    ))
                  )}
                  {dayReserved.map((r) => (
                    <div key={r.id} className="rounded-lg bg-sky-50 px-2 py-1.5 text-xs text-sky-900 ring-1 ring-sky-200">
                      <span className="flex items-center gap-1 font-medium">
                        <Lock className="size-3" /> {formatTimeRange(r.start, r.end)}
                      </span>
                      <span className="block truncate">{r.label}</span>
                    </div>
                  ))}
                  {!slots.isLoading && !daySlots.length && !dayReserved.length && (
                    <p className="px-1 text-xs text-slate-400">No slots</p>
                  )}
                </div>
                {!past && (
                  <button
                    type="button"
                    onClick={() => setEditing({ date: d })}
                    className="mt-2 inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700"
                  >
                    <Plus className="size-3.5" /> Add
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing && <SlotModal key={editing.slot?.id ?? editing.date} slot={editing.slot} date={editing.date} onClose={() => setEditing(null)} />}
      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} />}
    </div>
  );
}

function SlotModal({ slot, date, onClose }: { slot?: AvailabilitySlot; date: string; onClose: () => void }) {
  const create = useCreateSlot();
  const update = useUpdateSlot();
  const del = useDeleteSlot();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const opts = timeOptions(30, 0, 24).concat([{ value: '23:59', label: '11:59 PM' }]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SlotValues>({
    resolver: zodResolver(slotSchema),
    defaultValues: slot
      ? { date: manilaDateOf(slot.start), start_time: manilaTimeOf(slot.start), end_time: manilaTimeOf(slot.end), state: slot.state }
      : { date, start_time: '08:00', end_time: '17:00', state: 'available' },
  });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = { start: manilaIso(v.date, v.start_time), end: manilaIso(v.date, v.end_time), state: v.state };
    try {
      if (slot) await update.mutateAsync({ id: slot.id, body });
      else await create.mutateAsync(body);
      toast.success(slot ? 'Slot updated.' : 'Slot added.');
      onClose();
    } catch (err) {
      setFormError(applyApiErrors(err, setError, ['date', 'start_time', 'end_time', 'state'], { start: 'start_time', end: 'end_time' }));
    }
  });

  const onDelete = async () => {
    if (!slot) return;
    try {
      await del.mutateAsync(slot.id);
      toast.success('Slot deleted.');
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setFormError(errorMessage(err));
    }
  };

  return (
    <>
      <Modal
        open={!confirmDelete}
        onClose={onClose}
        title={slot ? 'Edit slot' : 'Add availability slot'}
        footer={
          <>
            {slot && (
              <Button variant="ghost" className="text-red-700 sm:mr-auto" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="slot-form" loading={isSubmitting}>
              Save
            </Button>
          </>
        }
      >
        <form id="slot-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input label="Date" type="date" required min={manilaDateString()} error={errors.date?.message} {...register('date')} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="From" required options={opts} error={errors.start_time?.message} {...register('start_time')} />
            <Select label="To" required options={opts} error={errors.end_time?.message} {...register('end_time')} />
          </div>
          <Select
            label="State"
            options={[
              { value: 'available', label: 'Available — customers can book' },
              { value: 'unavailable', label: 'Unavailable — block this time' },
            ]}
            error={errors.state?.message}
            {...register('state')}
          />
          <FormError message={formError} />
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this slot?"
        description="Customers will no longer be able to book this time. Slots containing accepted jobs can’t be deleted."
        confirmLabel="Delete slot"
        tone="danger"
        loading={del.isPending}
        onConfirm={() => void onDelete()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

function GenerateModal({ onClose }: { onClose: () => void }) {
  const generate = useGenerateSchedule();
  const [formError, setFormError] = useState<string | null>(null);
  const opts = timeOptions(30, 5, 23);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GenerateScheduleValues>({
    resolver: zodResolver(generateScheduleSchema),
    defaultValues: {
      weekdays: [0, 1, 2, 3, 4, 5],
      start_time: '08:00',
      end_time: '17:00',
      from: manilaDateString(),
      to: manilaDateString(27),
    },
  });


  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const res = await generate.mutateAsync(v);
      toast.success(res.created ? `Created ${res.created} slot${res.created === 1 ? '' : 's'}. Overlapping days were skipped.` : 'No new slots — those days already have overlapping slots.');
      onClose();
    } catch (err) {
      setFormError(applyApiErrors(err, setError, ['weekdays', 'start_time', 'end_time', 'from', 'to']));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Generate weekly schedule"
      description="Creates one available slot per chosen weekday in the date range. Days that already have overlapping slots are skipped."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="gen-form" loading={isSubmitting}>
            Generate
          </Button>
        </>
      }
    >
      <form id="gen-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Controller
          control={control}
          name="weekdays"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-800">Weekdays</legend>
              <div className="grid grid-cols-4 gap-x-2 sm:grid-cols-7">
                {WEEKDAYS.map((w, i) => (
                  <Checkbox
                    key={w}
                    label={w}
                    checked={field.value.includes(i)}
                    onChange={(e) =>
                      field.onChange(e.target.checked ? [...field.value, i].sort() : field.value.filter((x) => x !== i))
                    }
                  />
                ))}
              </div>
              {errors.weekdays && <p className="text-sm text-red-600">{errors.weekdays.message}</p>}
            </fieldset>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Daily start" options={opts} error={errors.start_time?.message} {...register('start_time')} />
          <Select label="Daily end" options={opts} error={errors.end_time?.message} {...register('end_time')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="From date" type="date" min={manilaDateString()} error={errors.from?.message} {...register('from')} />
          <Input label="To date" type="date" min={manilaDateString()} error={errors.to?.message} {...register('to')} />
        </div>
        <FormError message={formError} />
      </form>
    </Modal>
  );
}

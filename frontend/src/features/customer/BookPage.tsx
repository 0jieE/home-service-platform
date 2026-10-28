import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomerMe } from '@/api/auth';
import { useCreateBooking } from '@/api/bookings';
import { useConfigValues } from '@/api/config';
import { useTechnician, useTechnicianAvailability } from '@/api/technicians';
import {
  LocationPicker,
  OUTSIDE_COVERAGE_MESSAGE,
  type CoverageStatus,
} from '@/components/map/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { FormError, Select, Textarea } from '@/components/ui/Field';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { addMinutesIso, formatTimeRange, manilaDateOf, manilaDateString, manilaIso } from '@/lib/format';
import { bookingFormSchema, type BookingFormValues } from '@/types/schemas';
import { DateTimeFields } from './DateTimeFields';

const FIELDS = ['category_id', 'date', 'time', 'location', 'address', 'notes'] as const;

/** Direct booking from a technician's profile (outside the ranked Find flow). */
export function BookPage() {
  const technicianId = Number(useParams().technicianId);
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const tech = useTechnician(technicianId);
  const availability = useTechnicianAvailability(technicianId, manilaDateString(0), manilaDateString(20));
  const profile = useCustomerMe();
  const create = useCreateBooking();
  const { blockMinutes } = useConfigValues();
  const [coverage, setCoverage] = useState<CoverageStatus>('none');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<
    BookingFormValues,
    unknown,
    {
      category_id: number;
      date: string;
      time: string;
      location: { lat: number; lng: number } | null;
      address: string;
      notes: string;
    }
  >({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      category_id: undefined,
      date: sp.get('date') ?? manilaDateString(1),
      time: '09:00',
      location: null,
      address: '',
      notes: '',
    },
  });

  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !profile.data) return;
    prefilled.current = true;
    if (!getValues('location') && profile.data.default_location) {
      setValue('location', profile.data.default_location);
      setValue('address', profile.data.default_address ?? '');
    }
  }, [profile.data, getValues, setValue]);

  useEffect(() => {
    const specs = tech.data?.specializations;
    if (specs?.length === 1 && !getValues('category_id')) setValue('category_id', specs[0]!.id);
  }, [tech.data, getValues, setValue]);

  const date = watch('date');
  const daySlots = useMemo(
    () =>
      (availability.data?.slots ?? []).filter(
        (s) => s.state === 'available' && manilaDateOf(s.start) === date,
      ),
    [availability.data, date],
  );
  const dayReserved = useMemo(
    () => (availability.data?.reserved ?? []).filter((s) => manilaDateOf(s.start) === date),
    [availability.data, date],
  );

  if (tech.isLoading) return <FullPageSpinner />;
  if (tech.isError || !tech.data)
    return <ErrorState message={errorMessage(tech.error)} onRetry={() => tech.refetch()} />;
  const t = tech.data;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    if (coverage === 'outside') {
      setFormError(`${OUTSIDE_COVERAGE_MESSAGE}.`);
      return;
    }
    const start = manilaIso(v.date, v.time);
    try {
      const booking = await create.mutateAsync({
        technician_id: t.id,
        category_id: v.category_id,
        location: v.location!,
        address: v.address,
        start,
        end: addMinutesIso(start, blockMinutes),
        notes: v.notes,
      });
      toast.success(`Request sent to ${t.full_name}. You'll be notified when they respond.`);
      navigate(`/c/bookings/${booking.id}`);
    } catch (err) {
      setFormError(
        applyApiErrors(err, setError, FIELDS, {
          start: 'time',
          end: 'time',
          category: 'category_id',
          technician_id: 'category_id',
        }),
      );
    }
  });

  const location = watch('location');
  const address = watch('address');

  return (
    <div>
      <PageHeader
        title={`Book ${t.full_name}`}
        back={
          <Link
            to={`/c/technicians/${t.id}`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" /> Back to profile
          </Link>
        }
      />
      <Instructions title="Before you book">
        <p>
          Pick a time inside one of the technician’s free periods. The request is reserved only after the
          technician accepts.
        </p>
      </Instructions>
      <Card>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select
                  label="Service"
                  required
                  placeholder="Choose a service"
                  value={field.value ?? ''}
                  error={errors.category_id?.message}
                  options={t.specializations.map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                />
              )}
            />

            <div>
              <Controller
                control={control}
                name="date"
                render={({ field: df }) => (
                  <Controller
                    control={control}
                    name="time"
                    render={({ field: tf }) => (
                      <DateTimeFields
                        date={df.value}
                        time={tf.value}
                        onDate={df.onChange}
                        onTime={tf.onChange}
                        dateError={errors.date?.message}
                        timeError={errors.time?.message}
                      />
                    )}
                  />
                )}
              />
              <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                {availability.isLoading ? (
                  'Loading availability…'
                ) : daySlots.length ? (
                  <>
                    <span className="font-medium text-emerald-800">Free on this day: </span>
                    {daySlots.map((s) => formatTimeRange(s.start, s.end)).join(', ')}
                    {dayReserved.length > 0 && (
                      <span className="text-slate-500">
                        {' '}
                        · already booked: {dayReserved.map((s) => formatTimeRange(s.start, s.end)).join(', ')}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-amber-800">
                    No free time recorded for this day. Choose another date.
                  </span>
                )}
              </div>
            </div>

            <LocationPicker
              required
              value={location ? { ...location, address: address ?? '' } : null}
              onChange={(v) => {
                setValue('location', v ? { lat: v.lat, lng: v.lng } : null, {
                  shouldValidate: !!errors.location,
                });
                setValue('address', v?.address ?? '', { shouldValidate: !!errors.address });
              }}
              onCoverageChange={setCoverage}
              error={errors.location?.message}
              addressError={errors.address?.message}
            />

            <Textarea
              label="Notes for the technician (optional)"
              placeholder="Describe the problem"
              error={errors.notes?.message}
              {...register('notes')}
            />
            <FormError message={formError} />
            <Button type="submit" size="lg" loading={isSubmitting} disabled={coverage === 'outside'}>
              Send booking request
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

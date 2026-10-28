import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { CalendarSearch, Columns3, RefreshCw, SearchX } from 'lucide-react';
import { useCustomerMe } from '@/api/auth';
import { useCategories } from '@/api/categories';
import { useConfigValues } from '@/api/config';
import { qk } from '@/api/keys';
import { useRecommendations } from '@/api/recommendations';
import { getTechnician } from '@/api/technicians';
import { LocationPicker, OUTSIDE_COVERAGE_MESSAGE, type CoverageStatus } from '@/components/map/LocationPicker';
import { TechnicianMap } from '@/components/map/TechnicianMap';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { FormError } from '@/components/ui/Field';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { errorMessage } from '@/lib/errors';
import {
  addMinutesIso,
  formatRange,
  manilaDateOf,
  manilaDateString,
  manilaIso,
  manilaTimeOf,
  shiftDate,
} from '@/lib/format';
import { findSchema, type FindValues } from '@/types/schemas';
import type { RecommendationResult, VerificationSummaryItem } from '@/types/api';
import { BookingConfirmModal, type BookingDraft } from './BookingConfirmModal';
import { CategoryPicker } from './CategoryPicker';
import { CompareModal } from './CompareModal';
import { DateTimeFields } from './DateTimeFields';
import { ResultCard } from './ResultCard';

const MAX_COMPARE = 3;

function readParams(sp: URLSearchParams) {
  const category = Number(sp.get('category'));
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  const date = sp.get('date') ?? '';
  const time = sp.get('time') ?? '';
  const address = sp.get('address') ?? '';
  const complete = category > 0 && Number.isFinite(lat) && Number.isFinite(lng) && sp.has('lat') && !!date && !!time;
  return { category, lat, lng, date, time, address, complete };
}

export function FindPage() {
  const [sp, setSp] = useSearchParams();
  const url = readParams(sp);
  const categories = useCategories();
  const profile = useCustomerMe();
  const { blockMinutes } = useConfigValues();
  const qc = useQueryClient();
  const [coverage, setCoverage] = useState<CoverageStatus>('none');
  const [formError, setFormError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FindValues>({
    resolver: zodResolver(findSchema),
    defaultValues: {
      category_id: url.category || undefined,
      location: url.complete ? { lat: url.lat, lng: url.lng } : null,
      address: url.address,
      date: url.date || manilaDateString(1),
      time: url.time || '09:00',
    },
  });

  // Prefill the location from the customer's default address once.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !profile.data) return;
    prefilled.current = true;
    if (!getValues('location') && profile.data.default_location) {
      setValue('location', profile.data.default_location);
      setValue('address', profile.data.default_address ?? '');
    }
  }, [profile.data, getValues, setValue]);

  const params = useMemo(() => {
    if (!url.complete) return null;
    return { category: url.category, lat: url.lat, lng: url.lng, start: manilaIso(url.date, url.time) };
  }, [url.complete, url.category, url.lat, url.lng, url.date, url.time]);

  const recs = useRecommendations(params);
  const data = recs.data;
  const results = useMemo(() => data?.results ?? [], [data]);

  // Credential summaries (shown separately from the score).
  const details = useQueries({
    queries: results.map((r) => ({
      queryKey: qk.technician(r.technician.id),
      queryFn: () => getTechnician(r.technician.id),
      staleTime: 5 * 60_000,
    })),
  });
  const verification: Record<number, VerificationSummaryItem[] | undefined> = {};
  results.forEach((r, i) => {
    verification[r.technician.id] = details[i]?.data?.verification_summary ?? (details[i]?.isError ? [] : undefined);
  });

  const [selected, setSelected] = useState<number | null>(null);
  const [compare, setCompare] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [draft, setDraft] = useState<BookingDraft | null>(null);

  // reset compare selection when a new search runs
  const searchKey = sp.toString();
  useEffect(() => {
    setCompare([]);
    setSelected(null);
  }, [searchKey]);

  const runSearch = (values: { category_id: number; lat: number; lng: number; address: string; date: string; time: string }) => {
    const next = new URLSearchParams({
      category: String(values.category_id),
      lat: values.lat.toFixed(6),
      lng: values.lng.toFixed(6),
      address: values.address,
      date: values.date,
      time: values.time,
    });
    setSp(next);
    qc.invalidateQueries({ queryKey: ['recommendations'] });
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const onSubmit = handleSubmit((v) => {
    setFormError(null);
    if (coverage === 'outside') {
      setFormError(`${OUTSIDE_COVERAGE_MESSAGE}. Choose a location inside the city.`);
      return;
    }
    const loc = v.location!;
    runSearch({ category_id: v.category_id, lat: loc.lat, lng: loc.lng, address: v.address, date: v.date, time: v.time });
  });

  const shiftSearch = (minutes: number) => {
    if (!url.complete) return;
    const start = addMinutesIso(manilaIso(url.date, url.time), minutes);
    const date = manilaDateOf(start);
    const time = manilaTimeOf(start);
    setValue('date', date);
    setValue('time', time);
    runSearch({ category_id: url.category, lat: url.lat, lng: url.lng, address: url.address, date, time });
  };

  const focusCategory = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formRef.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus();
  };

  const location = watch('location');
  const address = watch('address');
  const category = categories.data?.find((c) => c.id === url.category) ?? data?.query.category;

  const book = (r: RecommendationResult) => {
    if (!data || !category) return;
    setShowCompare(false);
    setDraft({
      technicianId: r.technician.id,
      technicianName: r.technician.full_name,
      category,
      location: data.query.location ?? { lat: url.lat, lng: url.lng },
      address: url.address,
      start: data.query.start,
      end: data.query.end ?? addMinutesIso(data.query.start, blockMinutes),
      distanceKm: r.distance_km,
    });
  };

  const toggleCompare = (id: number) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_COMPARE ? c : [...c, id]));

  return (
    <div>
      <PageHeader title="Find a technician" description="Get a ranked list of nearby technicians who are free when you need them." />
      <Instructions title="How to search">
        <p>1. Choose the service. 2. Set where the work will be done (inside Kidapawan City). 3. Pick a date and start time.</p>
        <p>
          Results are ranked by an overall score that combines closeness and customer ratings. Open “Why this score?” on
          any card to see the calculation. Booking sends a request — the technician still has to accept.
        </p>
      </Instructions>

      <Card className="mb-6">
        <CardBody>
          <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <CategoryPicker
                  categories={categories.data ?? []}
                  loading={categories.isLoading}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.category_id?.message}
                />
              )}
            />
            {categories.isError && <FormError message={`Could not load services: ${errorMessage(categories.error)}`} />}

            <LocationPicker
              required
              value={location ? { ...location, address: address ?? '' } : null}
              onChange={(v) => {
                setValue('location', v ? { lat: v.lat, lng: v.lng } : null, { shouldValidate: !!errors.location });
                setValue('address', v?.address ?? '');
              }}
              onCoverageChange={setCoverage}
              error={errors.location?.message}
              hint={profile.data?.default_location ? 'Prefilled from your profile’s default address.' : undefined}
            />

            <Controller
              control={control}
              name="date"
              render={({ field: dateField }) => (
                <Controller
                  control={control}
                  name="time"
                  render={({ field: timeField }) => (
                    <DateTimeFields
                      date={dateField.value}
                      time={timeField.value}
                      onDate={dateField.onChange}
                      onTime={timeField.onChange}
                      dateError={errors.date?.message}
                      timeError={errors.time?.message}
                    />
                  )}
                />
              )}
            />

            <FormError message={formError} />
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={coverage === 'outside' || coverage === 'checking'}
              loading={recs.isFetching}
              icon={<CalendarSearch className="size-5" />}
            >
              Show recommended technicians
            </Button>
          </form>
        </CardBody>
      </Card>

      <div ref={resultsRef} className="scroll-mt-20">
        {params && (
          <section aria-labelledby="results-heading" aria-live="polite">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="results-heading" className="text-lg font-semibold">
                  {category ? `${category.name} technicians` : 'Recommended technicians'}
                </h2>
                {data && (
                  <p className="text-sm text-slate-600">
                    {formatRange(data.query.start, data.query.end)} · {results.length} available · settings v
                    {data.settings.version}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => recs.refetch()}
                icon={<RefreshCw className="size-4" />}
                disabled={recs.isFetching}
              >
                Refresh
              </Button>
            </div>

            {recs.isLoading ? (
              <SkeletonList rows={3} />
            ) : recs.isError ? (
              <ErrorState message={errorMessage(recs.error)} onRetry={() => recs.refetch()} />
            ) : data && results.length === 0 ? (
              <EmptyState
                icon={<SearchX className="size-6" />}
                title="No technician is available"
                description={data.empty_reason?.message ?? 'No eligible technician for this service and time.'}
                action={
                  <>
                    <Button variant="outline" onClick={() => shiftSearch(120)}>
                      Try 2 hours later
                    </Button>
                    <Button variant="outline" onClick={() => shiftSearch(24 * 60)}>
                      Same time tomorrow
                    </Button>
                    <Button variant="outline" onClick={() => {
                      const d = shiftDate(url.date, 1);
                      setValue('date', d);
                      setValue('time', '08:00');
                      runSearch({ category_id: url.category, lat: url.lat, lng: url.lng, address: url.address, date: d, time: '08:00' });
                    }}>
                      Tomorrow 8:00 AM
                    </Button>
                    <Button variant="secondary" onClick={focusCategory}>
                      Change service
                    </Button>
                  </>
                }
              />
            ) : data ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="order-2 space-y-3 lg:order-1">
                  {results.map((r, i) => (
                    <ResultCard
                      key={r.technician.id}
                      result={r}
                      settings={data.settings}
                      categoryId={url.category}
                      verification={verification[r.technician.id]}
                      verificationLoading={details[i]?.isLoading}
                      selected={selected === r.technician.id}
                      compareChecked={compare.includes(r.technician.id)}
                      compareDisabled={compare.length >= MAX_COMPARE}
                      onToggleCompare={() => toggleCompare(r.technician.id)}
                      onBook={() => book(r)}
                      onFocus={() => setSelected(r.technician.id)}
                    />
                  ))}
                </div>
                <div className="order-1 lg:order-2">
                  <div className="lg:sticky lg:top-20">
                    <TechnicianMap
                      customer={data.query.location ?? { lat: url.lat, lng: url.lng }}
                      selectedId={selected}
                      onSelect={(id) => {
                        setSelected(id);
                        document.getElementById(`result-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      markers={results.map((r) => ({
                        id: r.technician.id,
                        rank: r.rank,
                        name: r.technician.full_name,
                        point: r.technician.location,
                      }))}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Dark pin = your location. Numbers = rank. Distances are straight-line, not road distance.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>

      {compare.length > 0 && data && (
        <div className="fixed inset-x-0 bottom-20 z-20 flex justify-center px-4 lg:bottom-6">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-2 pr-2 pl-4 shadow-lg">
            <span className="text-sm text-slate-700">
              {compare.length} selected {compare.length < 2 && '· pick at least 2'}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setCompare([])}>
              Clear
            </Button>
            <Button size="sm" disabled={compare.length < 2} onClick={() => setShowCompare(true)} icon={<Columns3 className="size-4" />}>
              Compare
            </Button>
          </div>
        </div>
      )}

      {showCompare && data && (
        <CompareModal
          results={results.filter((r) => compare.includes(r.technician.id))}
          settings={data.settings}
          verification={verification}
          onClose={() => setShowCompare(false)}
          onBook={book}
        />
      )}

      <BookingConfirmModal draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

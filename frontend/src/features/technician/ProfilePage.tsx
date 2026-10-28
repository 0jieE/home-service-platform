import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCategories } from '@/api/categories';
import { useTechMe, useUpdateTechMe } from '@/api/technicians';
import { LocationPicker, OUTSIDE_COVERAGE_MESSAGE, type CoverageStatus } from '@/components/map/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { Checkbox, FormError, Input, Textarea } from '@/components/ui/Field';
import { Alert, Instructions, PageHeader } from '@/components/ui/PageHeader';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/useAuth';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { titleCase } from '@/lib/format';
import { technicianProfileSchema, type TechnicianProfileValues } from '@/types/schemas';
import { ChangePasswordCard } from '@/features/shared/ChangePasswordCard';

const FIELDS = ['bio', 'phone', 'years_experience', 'address', 'location', 'service_category_ids'] as const;

type Out = {
  bio: string;
  phone: string;
  years_experience: number;
  address: string;
  location: { lat: number; lng: number } | null;
  service_category_ids: number[];
};

export function TechnicianProfilePage() {
  const me = useTechMe();
  const categories = useCategories();
  const update = useUpdateTechMe();
  const { refreshUser } = useAuth();
  const [coverage, setCoverage] = useState<CoverageStatus>('none');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TechnicianProfileValues, unknown, Out>({
    resolver: zodResolver(technicianProfileSchema),
    defaultValues: { bio: '', phone: '', years_experience: 0, address: '', location: null, service_category_ids: [] },
  });

  useEffect(() => {
    if (!me.data) return;
    reset({
      bio: me.data.bio ?? '',
      phone: me.data.phone ?? '',
      years_experience: me.data.years_experience ?? 0,
      address: me.data.address ?? '',
      location: me.data.location,
      service_category_ids: me.data.specializations.map((s) => s.id),
    });
  }, [me.data, reset]);

  if (me.isLoading) return <FullPageSpinner />;
  if (me.isError || !me.data) return <ErrorState message={errorMessage(me.error)} onRetry={() => me.refetch()} />;
  const missing = me.data.missing_fields ?? [];

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    if (coverage === 'outside') {
      setFormError(`${OUTSIDE_COVERAGE_MESSAGE}. Your operating location must be inside the city.`);
      return;
    }
    try {
      await update.mutateAsync({ ...v, location: v.location ?? undefined });
      await refreshUser();
      toast.success('Profile saved.');
    } catch (err) {
      setFormError(applyApiErrors(err, setError, FIELDS, { specializations: 'service_category_ids', services: 'service_category_ids' }));
    }
  });

  const loc = watch('location');
  const addr = watch('address');
  // Categories offered by the technician that were deactivated stay visible so they can be removed.
  const options = [
    ...(categories.data ?? []),
    ...me.data.specializations.filter((s) => !(categories.data ?? []).some((c) => c.id === s.id)),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="My technician profile" description="What customers see, and where you operate from." />
      <Instructions title="Profile rules">
        <p>
          You can edit your bio, phone, experience, specializations and operating location. Your name and credentials
          are managed by the administrator. Your operating location must be inside Kidapawan City — distances to
          customers are measured from it (straight-line).
        </p>
      </Instructions>
      {missing.length > 0 ? (
        <Alert tone="amber" icon={<AlertTriangle className="size-5" />} title="Incomplete — you don’t appear in recommendations yet">
          Missing: {missing.map(titleCase).join(', ')}.
        </Alert>
      ) : (
        <Alert tone="green" icon={<CheckCircle2 className="size-5" />} title="Profile complete">
          Customers can find you when you have available time.
        </Alert>
      )}

      <Card>
        <CardHeader title={me.data.full_name} description="Name changes go through the administrator." />
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Mobile number" type="tel" required error={errors.phone?.message} {...register('phone')} />
              <Input
                label="Years of experience"
                type="number"
                min={0}
                max={60}
                inputMode="numeric"
                required
                error={errors.years_experience?.message}
                {...register('years_experience', { valueAsNumber: true })}
              />
            </div>
            <Textarea
              label="Short bio"
              rows={4}
              placeholder="e.g. TESDA-certified electrician, 8 years in residential wiring."
              error={errors.bio?.message}
              {...register('bio')}
            />

            <Controller
              control={control}
              name="service_category_ids"
              render={({ field }) => (
                <fieldset>
                  <legend className="mb-1 text-sm font-medium text-slate-800">
                    Specializations <span className="text-red-600">*</span>
                  </legend>
                  <p className="mb-2 text-xs text-slate-500">Only active service categories can be chosen.</p>
                  <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                    {options.map((c) => (
                      <Checkbox
                        key={c.id}
                        label={c.name}
                        description={c.is_active === false ? 'Inactive — not shown in new searches' : undefined}
                        checked={field.value.includes(c.id)}
                        onChange={(e) =>
                          field.onChange(e.target.checked ? [...field.value, c.id] : field.value.filter((x) => x !== c.id))
                        }
                      />
                    ))}
                  </div>
                  {errors.service_category_ids && (
                    <p role="alert" className="text-sm text-red-600">
                      {errors.service_category_ids.message}
                    </p>
                  )}
                </fieldset>
              )}
            />

            <LocationPicker
              label="Operating location"
              required
              value={loc ? { ...loc, address: addr } : null}
              onChange={(v) => {
                setValue('location', v ? { lat: v.lat, lng: v.lng } : null, { shouldDirty: true, shouldValidate: !!errors.location });
                setValue('address', v?.address ?? '', { shouldDirty: true, shouldValidate: !!errors.address });
              }}
              onCoverageChange={setCoverage}
              error={errors.location?.message}
              addressError={errors.address?.message}
            />

            <FormError message={formError} />
            <Button type="submit" loading={isSubmitting} disabled={!isDirty || coverage === 'outside'}>
              Save profile
            </Button>
          </form>
        </CardBody>
      </Card>
      <ChangePasswordCard />
    </div>
  );
}

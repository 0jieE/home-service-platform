import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import { useCustomerMe, useUpdateCustomerMe, useUpdateMe } from '@/api/auth';
import {
  LocationPicker,
  OUTSIDE_COVERAGE_MESSAGE,
  type CoverageStatus,
} from '@/components/map/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { FormError, Input } from '@/components/ui/Field';
import { Alert, PageHeader } from '@/components/ui/PageHeader';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/useAuth';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { customerProfileSchema, type CustomerProfileValues } from '@/types/schemas';
import { ChangePasswordCard } from '@/features/shared/ChangePasswordCard';

const FIELDS = ['first_name', 'last_name', 'phone', 'default_address', 'default_location'] as const;

export function CustomerProfilePage() {
  const { user, refreshUser } = useAuth();
  const profile = useCustomerMe();
  const updateMe = useUpdateMe();
  const updateProfile = useUpdateCustomerMe();
  const welcome = (useLocation().state as { welcome?: boolean } | null)?.welcome;
  const [coverage, setCoverage] = useState<CoverageStatus>('none');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CustomerProfileValues>({
    resolver: zodResolver(customerProfileSchema),
    defaultValues: { first_name: '', last_name: '', phone: '', default_address: '', default_location: null },
  });

  useEffect(() => {
    if (!profile.data || !user) return;
    reset({
      first_name: user.first_name,
      last_name: user.last_name,
      phone: profile.data.phone || user.phone || '',
      default_address: profile.data.default_address ?? '',
      default_location: profile.data.default_location,
    });
  }, [profile.data, user, reset]);

  if (profile.isLoading) return <FullPageSpinner />;
  if (profile.isError)
    return <ErrorState message={errorMessage(profile.error)} onRetry={() => profile.refetch()} />;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    if (v.default_location && coverage === 'outside') {
      setFormError(`${OUTSIDE_COVERAGE_MESSAGE}. Your default location must be inside the city.`);
      return;
    }
    try {
      await updateMe.mutateAsync({ first_name: v.first_name, last_name: v.last_name, phone: v.phone });
      await updateProfile.mutateAsync({
        phone: v.phone,
        default_address: v.default_address,
        default_location: v.default_location,
      });
      await refreshUser();
      toast.success('Profile saved.');
    } catch (err) {
      setFormError(applyApiErrors(err, setError, FIELDS, { location: 'default_location' }));
    }
  });

  const loc = watch('default_location');
  const addr = watch('default_address');

  return (
    <div className="space-y-5">
      <PageHeader title="My profile" description="Your contact details and default service address." />
      {welcome && (
        <Alert tone="green" title="Welcome!">
          Set your default address now so searches start from your home. You can change it any time.
        </Alert>
      )}
      <Card>
        <CardHeader title="Contact & default address" description={user?.email} />
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="First name"
                required
                error={errors.first_name?.message}
                {...register('first_name')}
              />
              <Input
                label="Last name"
                required
                error={errors.last_name?.message}
                {...register('last_name')}
              />
              <Input
                label="Mobile number"
                type="tel"
                required
                error={errors.phone?.message}
                {...register('phone')}
              />
            </div>
            <LocationPicker
              label="Default service location"
              hint="Used to prefill the location when you search. Must be inside Kidapawan City."
              value={loc ? { ...loc, address: addr } : null}
              onChange={(v) => {
                setValue('default_location', v ? { lat: v.lat, lng: v.lng } : null, { shouldDirty: true });
                setValue('default_address', v?.address ?? '', { shouldDirty: true });
              }}
              onCoverageChange={setCoverage}
              error={errors.default_location?.message}
              addressError={errors.default_address?.message}
            />
            <FormError message={formError} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={!isDirty || (!!loc && coverage === 'outside')}
              >
                Save profile
              </Button>
              {loc && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setValue('default_location', null, { shouldDirty: true });
                    setValue('default_address', '', { shouldDirty: true });
                  }}
                >
                  Clear default location
                </Button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>
      <ChangePasswordCard />
    </div>
  );
}

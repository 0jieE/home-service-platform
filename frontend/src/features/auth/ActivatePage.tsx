import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useActivate } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Field';
import { applyApiErrors } from '@/lib/errors';
import { activateSchema, type ActivateValues } from '@/types/schemas';
import { AuthCard } from './AuthCard';

const FIELDS = ['email', 'activation_code', 'password', 'confirm_password'] as const;

export function ActivatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const activate = useActivate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ActivateValues, unknown, { email: string; activation_code: string; password: string; confirm_password: string }>({
    resolver: zodResolver(activateSchema),
    defaultValues: {
      email: params.get('email') ?? '',
      activation_code: params.get('code') ?? '',
      password: '',
      confirm_password: '',
    },
  });

  const onSubmit = handleSubmit(async ({ confirm_password: _c, ...body }) => {
    setFormError(null);
    try {
      await activate.mutateAsync(body);
      navigate('/login', {
        replace: true,
        state: { notice: 'Your technician account is active. Log in with your email and new password.' },
      });
    } catch (err) {
      setFormError(applyApiErrors(err, setError, FIELDS, { code: 'activation_code' }));
    }
  });

  return (
    <AuthCard
      title="Activate your technician account"
      subtitle="After your application is approved, the administrator gives you a one-time activation code. Use it here to set your own password."
      footer={
        <>
          Already activated?{' '}
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-2">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Email (as given to the administrator)"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Activation code"
          autoComplete="one-time-code"
          placeholder="e.g. K7P2-9QXM"
          className="font-mono tracking-widest uppercase"
          required
          hint="Codes expire after 7 days. Ask the administrator for a new one if yours expired."
          error={errors.activation_code?.message}
          {...register('activation_code')}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, not only numbers."
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Activate account
        </Button>
      </form>
    </AuthCard>
  );
}

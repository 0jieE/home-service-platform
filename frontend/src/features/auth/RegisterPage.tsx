import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useRegister } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Field';
import { useAuth } from '@/auth/useAuth';
import { applyApiErrors } from '@/lib/errors';
import { registerSchema, type RegisterValues } from '@/types/schemas';
import { AuthCard } from './AuthCard';

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'password', 'confirm_password'] as const;

export function RegisterPage() {
  const registerMutation = useRegister();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { first_name: '', last_name: '', email: '', phone: '', password: '', confirm_password: '' },
  });

  const onSubmit = handleSubmit(async ({ confirm_password: _c, ...body }) => {
    setFormError(null);
    try {
      await registerMutation.mutateAsync(body);
    } catch (err) {
      setFormError(applyApiErrors(err, setError, FIELDS));
      return;
    }
    try {
      await login(body.email, body.password);
      toast.success('Welcome! Your customer account is ready.');
      navigate('/c/profile', { replace: true, state: { welcome: true } });
    } catch {
      navigate('/login', { replace: true, state: { notice: 'Account created. Please log in.' } });
    }
  });

  return (
    <AuthCard
      title="Create a customer account"
      subtitle="For households in Kidapawan City looking for a home service technician. Technicians are registered by the administrator."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-2">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" autoComplete="given-name" required error={errors.first_name?.message} {...register('first_name')} />
          <Input label="Last name" autoComplete="family-name" required error={errors.last_name?.message} {...register('last_name')} />
        </div>
        <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
        <Input
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="09171234567"
          required
          hint="Technicians use this to contact you about a booking."
          error={errors.phone?.message}
          {...register('phone')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, not only numbers, not too common."
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

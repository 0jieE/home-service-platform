import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Field';
import { homePathFor, useAuth } from '@/auth/useAuth';
import { parseApiError } from '@/lib/errors';
import { loginSchema, type LoginValues } from '@/types/schemas';
import type { Role } from '@/types/api';
import { AuthCard } from './AuthCard';

const PREFIX: Record<Role, string> = { customer: '/c', technician: '/t', admin: '/a' };

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      const user = await login(email, password);
      const target = from && from.startsWith(PREFIX[user.role]) ? from : homePathFor(user.role);
      navigate(target, { replace: true });
    } catch (err) {
      const info = parseApiError(err);
      setFormError(
        info.status === 401 || info.status === 400
          ? (info.fieldErrors.non_field_errors ?? info.message ?? 'Incorrect email or password.')
          : info.message,
      );
    }
  });

  return (
    <AuthCard
      title="Log in"
      subtitle="Customers, technicians and administrators all sign in here."
      footer={
        <>
          New customer?{' '}
          <Link to="/register" className="font-medium text-brand-700 underline underline-offset-2">
            Create an account
          </Link>
          <span className="mx-2 text-slate-300">·</span>
          Technician with a code?{' '}
          <Link to="/activate" className="font-medium text-brand-700 underline underline-offset-2">
            Activate
          </Link>
        </>
      }
    >
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...register('password')}
        />
        <FormError message={formError} />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Log in
        </Button>
      </form>
    </AuthCard>
  );
}

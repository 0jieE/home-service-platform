import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useChangePassword } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { FormError, Input } from '@/components/ui/Field';
import { applyApiErrors } from '@/lib/errors';
import { changePasswordSchema, type ChangePasswordValues } from '@/types/schemas';

export function ChangePasswordCard() {
  const mutation = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });
  const onSubmit = handleSubmit(async ({ old_password, new_password }) => {
    setFormError(null);
    try {
      await mutation.mutateAsync({ old_password, new_password });
      toast.success('Password changed.');
      reset();
    } catch (err) {
      setFormError(applyApiErrors(err, setError, ['old_password', 'new_password']));
    }
  });
  return (
    <Card>
      <CardHeader title="Change password" />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3" noValidate>
          <Input label="Current password" type="password" autoComplete="current-password" error={errors.old_password?.message} {...register('old_password')} />
          <Input label="New password" type="password" autoComplete="new-password" error={errors.new_password?.message} {...register('new_password')} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register('confirm_password')} />
          <div className="sm:col-span-3">
            <FormError message={formError} />
            <Button type="submit" variant="outline" loading={isSubmitting} className="mt-2">
              Update password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

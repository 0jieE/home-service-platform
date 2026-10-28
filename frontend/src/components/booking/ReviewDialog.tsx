import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useCreateReview } from '@/api/bookings';
import { Button } from '@/components/ui/Button';
import { FormError, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { RatingInput } from '@/components/ui/RatingStars';
import { applyApiErrors } from '@/lib/errors';
import { reviewSchema, type ReviewValues } from '@/types/schemas';
import type { Booking } from '@/types/api';

export function ReviewDialog({ booking, open, onClose }: { booking: Booking; open: boolean; onClose: () => void }) {
  const mutation = useCreateReview();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ReviewValues>({ resolver: zodResolver(reviewSchema), defaultValues: { rating: 0, comment: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutation.mutateAsync({ id: booking.id, body: values });
      toast.success(`Thanks! Your review for ${booking.technician.full_name} was posted.`);
      onClose();
    } catch (err) {
      setFormError(applyApiErrors(err, setError, ['rating', 'comment']));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Review ${booking.technician.full_name}`}
      description={`${booking.category.name} job. You can review each completed booking once.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="review-form" loading={mutation.isPending}>
            Post review
          </Button>
        </>
      }
    >
      <form id="review-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <RatingInput value={field.value} onChange={field.onChange} error={errors.rating?.message} />
          )}
        />
        <Textarea
          label="Comment (optional)"
          rows={4}
          placeholder="What went well? Was the technician on time?"
          error={errors.comment?.message}
          {...register('comment')}
        />
        <FormError message={formError} />
      </form>
    </Modal>
  );
}

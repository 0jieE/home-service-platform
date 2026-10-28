import { useState } from 'react';
import {
  AlertOctagon,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Play,
  Star,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBookingAction } from '@/api/bookings';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatRange } from '@/lib/format';
import { requiredReasonSchema } from '@/types/schemas';
import type { Booking, BookingAction } from '@/types/api';
import { ReviewDialog } from './ReviewDialog';

interface ActionConfig {
  label: string;
  icon: LucideIcon;
  variant: ButtonVariant;
  title: string;
  description: (b: Booking) => string;
  confirmLabel: string;
  success: string;
  /** reason textarea; `required` may depend on the booking state. */
  reason?: {
    label: string;
    required: (b: Booking) => boolean;
    bodyKey: 'reason' | 'notes';
    placeholder?: string;
  };
}

const validateRequired = (v: string) => {
  const r = requiredReasonSchema.safeParse({ reason: v });
  return r.success ? null : (r.error.issues[0]?.message ?? 'Please give a reason');
};

export const ACTION_CONFIG: Record<BookingAction, ActionConfig> = {
  accept: {
    label: 'Accept request',
    icon: CheckCircle2,
    variant: 'primary',
    title: 'Accept this request?',
    description: (b) =>
      `You commit to ${b.category.name} for ${b.customer.full_name} on ${formatRange(b.start, b.end)}. The time will be reserved and other overlapping requests can no longer be accepted.`,
    confirmLabel: 'Accept',
    success: 'Request accepted. The customer has been notified.',
  },
  decline: {
    label: 'Decline',
    icon: XCircle,
    variant: 'outline',
    title: 'Decline this request?',
    description: (b) =>
      `${b.customer.full_name} will be told you can't take this job and can book someone else.`,
    confirmLabel: 'Decline request',
    success: 'Request declined.',
    reason: {
      label: 'Reason (optional)',
      required: () => false,
      bodyKey: 'reason',
      placeholder: 'e.g. Fully booked that day',
    },
  },
  cancel: {
    label: 'Cancel booking',
    icon: XCircle,
    variant: 'outline',
    title: 'Cancel this booking?',
    description: (b) =>
      b.status === 'accepted'
        ? 'This booking was already accepted, so a reason is required. The other party will be notified.'
        : 'The request will be withdrawn. The technician will be notified.',
    confirmLabel: 'Cancel booking',
    success: 'Booking cancelled.',
    reason: {
      label: 'Reason',
      required: (b) => b.status === 'accepted',
      bodyKey: 'reason',
      placeholder: 'Let the other party know why',
    },
  },
  start: {
    label: 'Start work',
    icon: Play,
    variant: 'primary',
    title: 'Start this job now?',
    description: (b) => `Marks the ${b.category.name} job for ${b.customer.full_name} as in progress.`,
    confirmLabel: 'Start work',
    success: 'Job started.',
  },
  request_completion: {
    label: 'Request completion confirmation',
    icon: ClipboardCheck,
    variant: 'primary',
    title: 'Ask the customer to confirm completion?',
    description: (b) => `${b.customer.full_name} will be asked to confirm that the work is done.`,
    confirmLabel: 'Send request',
    success: 'Completion confirmation requested from the customer.',
    reason: {
      label: 'Notes for the customer (optional)',
      required: () => false,
      bodyKey: 'notes',
      placeholder: 'e.g. Replaced the faucet washer',
    },
  },
  confirm_completion: {
    label: 'Confirm job completed',
    icon: CheckCheck,
    variant: 'primary',
    title: 'Confirm the job is completed?',
    description: (b) =>
      `Confirm only if ${b.technician.full_name} finished the work. You can then leave a review.`,
    confirmLabel: 'Yes, it is completed',
    success: 'Thanks! The job is marked completed. You can now leave a review.',
  },
  dispute: {
    label: 'Report a problem',
    icon: AlertOctagon,
    variant: 'danger',
    title: 'Open a dispute?',
    description: () =>
      'Use this if the work is not finished or there is a problem. An administrator will review it and record a decision.',
    confirmLabel: 'Open dispute',
    success: 'Dispute opened. An administrator will review it.',
    reason: {
      label: 'What is the problem?',
      required: () => true,
      bodyKey: 'reason',
      placeholder: 'Describe what is wrong',
    },
  },
  review: {
    label: 'Write a review',
    icon: Star,
    variant: 'secondary',
    title: 'Review',
    description: () => '',
    confirmLabel: 'Post review',
    success: 'Review posted.',
  },
};

/** Stable display order: positive actions first. */
const ORDER: BookingAction[] = [
  'accept',
  'start',
  'request_completion',
  'confirm_completion',
  'review',
  'decline',
  'dispute',
  'cancel',
];

/** Renders ONLY the actions present in `booking.allowed_actions`. */
export function ActionBar({ booking, className }: { booking: Booking; className?: string }) {
  const [current, setCurrent] = useState<BookingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useBookingAction();
  const allowed = new Set(booking.allowed_actions ?? []);
  const actions = ORDER.filter((a) => allowed.has(a));

  if (!actions.length) return null;

  const close = () => {
    setCurrent(null);
    setError(null);
  };

  const run = async (action: Exclude<BookingAction, 'review'>, text: string) => {
    const cfg = ACTION_CONFIG[action];
    setError(null);
    try {
      const body = cfg.reason ? (text ? { [cfg.reason.bodyKey]: text } : {}) : {};
      await mutation.mutateAsync({ id: booking.id, action, body });
      toast.success(cfg.success);
      close();
    } catch (err) {
      if (errorCode(err) === 'invalid_transition') {
        toast.error(errorMessage(err));
        close();
        return;
      }
      setError(errorMessage(err));
    }
  };

  const cfg = current ? ACTION_CONFIG[current] : null;

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid="action-bar">
        {actions.map((a) => {
          const c = ACTION_CONFIG[a];
          const Icon = c.icon;
          return (
            <Button
              key={a}
              variant={c.variant}
              icon={<Icon className="size-4" />}
              onClick={() => {
                setError(null);
                setCurrent(a);
              }}
              data-action={a}
            >
              {c.label}
            </Button>
          );
        })}
      </div>

      {current === 'review' ? (
        <ReviewDialog booking={booking} open onClose={close} />
      ) : (
        cfg &&
        current && (
          <ConfirmDialog
            open
            title={cfg.title}
            description={cfg.description(booking)}
            confirmLabel={cfg.confirmLabel}
            tone={
              cfg.variant === 'danger' || current === 'cancel' || current === 'decline' ? 'danger' : 'primary'
            }
            loading={mutation.isPending}
            error={error}
            reason={
              cfg.reason
                ? {
                    label: cfg.reason.label,
                    required: cfg.reason.required(booking),
                    placeholder: cfg.reason.placeholder,
                    validate: cfg.reason.required(booking) ? validateRequired : undefined,
                  }
                : undefined
            }
            onClose={close}
            onConfirm={(text) => void run(current, text)}
          />
        )
      )}
    </div>
  );
}

import { useId, useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { FormError, Textarea } from './Field';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ButtonVariant;
  /** Show a reason/notes textarea. */
  reason?: {
    label: string;
    required?: boolean;
    placeholder?: string;
    hint?: string;
    /** Validates the trimmed value; returns an error message or null. */
    validate?: (value: string) => string | null;
  };
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  children?: ReactNode;
}

/** Mounted only while open, so the reason field resets every time it opens. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogInner {...props} />;
}

function ConfirmDialogInner({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  tone = 'primary',
  reason,
  loading,
  error,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formId = useId();

  const submit = () => {
    const trimmed = value.trim();
    if (reason) {
      const err = reason.validate
        ? reason.validate(trimmed)
        : reason.required && !trimmed
          ? `${reason.label} is required`
          : null;
      if (err) {
        setFieldError(err);
        return;
      }
    }
    onConfirm(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} type="submit" form={formId} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {children}
        {reason && (
          <Textarea
            label={reason.label}
            required={reason.required}
            placeholder={reason.placeholder}
            hint={reason.hint}
            value={value}
            error={fieldError ?? undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (fieldError) setFieldError(null);
            }}
          />
        )}
        <FormError message={error} />
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Plus,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAddVerification,
  useApplication,
  useApproveApplication,
  useCreateTechnicianAccount,
  useRejectApplication,
  useUpdateApplication,
} from '@/api/admin';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/EmptyState';
import { FormError, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Alert, PageHeader } from '@/components/ui/PageHeader';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, manilaDateString } from '@/lib/format';
import { requiredReasonSchema, verificationSchema, type VerificationValues } from '@/types/schemas';
import type { CreateAccountResponse } from '@/types/api';
import { AppStatusBadge, METHOD_LABEL, OUTCOME_LABEL, OutcomeBadge } from './shared';

export function ApplicationDetailPage() {
  const id = Number(useParams().id);
  const q = useApplication(id);
  const approve = useApproveApplication();
  const reject = useRejectApplication();
  const update = useUpdateApplication();
  const createAccount = useCreateTechnicianAccount();
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'account' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [account, setAccount] = useState<CreateAccountResponse | null>(null);

  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data;
  const open = a.status === 'submitted' || a.status === 'under_review';
  const anyVerified = a.verifications.some((v) => v.outcome === 'verified');

  const close = () => {
    setDialog(null);
    setDialogError(null);
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setDialogError(null);
    try {
      await fn();
      toast.success(success);
      close();
    } catch (err) {
      setDialogError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <Link
        to="/a/applications"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Applications
      </Link>
      <PageHeader
        title={`${a.first_name} ${a.last_name}`}
        description={`Application #${a.id} · submitted ${formatDateTime(a.submitted_at)}`}
        actions={<AppStatusBadge status={a.status} />}
      />

      {a.status === 'rejected' && (
        <Alert tone="red" title="Rejected">
          {a.rejection_reason || 'No reason recorded.'} {a.decided_by_name && `— ${a.decided_by_name}`}
          {a.decided_at && `, ${formatDate(a.decided_at)}`}
        </Alert>
      )}
      {a.status === 'approved' && !a.account_created && (
        <Alert tone="green" title="Approved — create the technician account">
          Creating the account generates a one-time activation code for the applicant.
        </Alert>
      )}
      {a.account_created && (
        <Alert tone="green" icon={<CheckCircle2 className="size-5" />} title="Technician account created">
          The technician activates it at <strong>/activate</strong> with their code.
        </Alert>
      )}

      <Card>
        <CardBody>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {a.status === 'submitted' && (
              <Button
                variant="outline"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: a.id, body: { status: 'under_review' } },
                    {
                      onSuccess: () => toast.success('Marked as under review.'),
                      onError: (e) => toast.error(errorMessage(e)),
                    },
                  )
                }
              >
                Mark under review
              </Button>
            )}
            {open && (
              <>
                <Button icon={<Check className="size-4" />} onClick={() => setDialog('approve')}>
                  Approve
                </Button>
                <Button
                  variant="danger"
                  icon={<XCircle className="size-4" />}
                  onClick={() => setDialog('reject')}
                >
                  Reject
                </Button>
              </>
            )}
            {a.status === 'approved' && !a.account_created && (
              <Button icon={<KeyRound className="size-4" />} onClick={() => setDialog('account')}>
                Create technician account
              </Button>
            )}
            {a.status !== 'rejected' && (
              <Button
                variant="secondary"
                icon={<Plus className="size-4" />}
                onClick={() => setShowVerify(true)}
              >
                Add verification record
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contact information" />
          <CardBody className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="size-4 text-slate-400" /> {a.email}
            </p>
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-slate-400" /> {a.phone || '—'}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="size-4 text-slate-400" /> {a.address || '—'}
            </p>
            <p className="pt-2">
              <span className="font-medium">Requested categories:</span>{' '}
              {a.requested_categories.map((c) => c.name).join(', ') || '—'}
            </p>
            {a.notes && (
              <p className="whitespace-pre-line">
                <span className="font-medium">Notes:</span> {a.notes}
              </p>
            )}
            {a.decided_at && (
              <p className="text-slate-500">
                Decided {formatDateTime(a.decided_at)} {a.decided_by_name && `by ${a.decided_by_name}`}
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Credential verification records"
            description="Shown to customers separately; never affects the score."
          />
          <CardBody>
            {a.verifications.length ? (
              <ul className="space-y-3">
                {a.verifications.map((v) => (
                  <li key={v.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{v.credential_type}</span>
                      <OutcomeBadge outcome={v.outcome} />
                    </div>
                    <p className="mt-1 text-slate-600">{METHOD_LABEL[v.method]}</p>
                    <p className="text-xs text-slate-500">
                      Checked {formatDate(v.checked_on)} {v.checked_by_name && `by ${v.checked_by_name}`}
                    </p>
                    {v.notes && <p className="mt-1 text-slate-700">{v.notes}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-2 text-sm text-slate-500">
                <ClipboardList className="size-5" />
                No verification records yet. Check the applicant’s credentials before approving.
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog === 'approve'}
        title="Approve this application?"
        description={
          anyVerified
            ? 'The applicant becomes eligible for a technician account.'
            : 'No credential has been recorded as verified yet. You can still approve, but consider adding a verification record first.'
        }
        confirmLabel="Approve"
        loading={approve.isPending}
        error={dialogError}
        onClose={close}
        onConfirm={() => void run(() => approve.mutateAsync(a.id), 'Application approved.')}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        title="Reject this application?"
        confirmLabel="Reject"
        tone="danger"
        reason={{
          label: 'Reason for rejection',
          required: true,
          validate: (v) => {
            const r = requiredReasonSchema.safeParse({ reason: v });
            return r.success ? null : (r.error.issues[0]?.message ?? 'Required');
          },
        }}
        loading={reject.isPending}
        error={dialogError}
        onClose={close}
        onConfirm={(reason) =>
          void run(() => reject.mutateAsync({ id: a.id, reason }), 'Application rejected.')
        }
      />
      <ConfirmDialog
        open={dialog === 'account'}
        title="Create the technician account?"
        description={`An account for ${a.email} will be created with a one-time activation code valid for 7 days. The code is shown only once.`}
        confirmLabel="Create account"
        loading={createAccount.isPending}
        error={dialogError}
        onClose={close}
        onConfirm={() =>
          void run(async () => {
            const res = await createAccount.mutateAsync(a.id);
            setAccount(res);
          }, 'Technician account created.')
        }
      />
      {showVerify && <VerificationModal applicationId={a.id} onClose={() => setShowVerify(false)} />}
      {account && <ActivationCodeModal account={account} onClose={() => setAccount(null)} />}
    </div>
  );
}

const VFIELDS = ['credential_type', 'method', 'outcome', 'checked_on', 'notes'] as const;

function VerificationModal({ applicationId, onClose }: { applicationId: number; onClose: () => void }) {
  const add = useAddVerification();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VerificationValues>({
    resolver: zodResolver(verificationSchema),
    defaultValues: {
      credential_type: '',
      method: undefined,
      outcome: undefined,
      checked_on: manilaDateString(),
      notes: '',
    },
  });
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await add.mutateAsync({ id: applicationId, body: v });
      toast.success('Verification record added.');
      onClose();
    } catch (err) {
      setFormError(applyApiErrors(err, setError, VFIELDS));
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Add verification record"
      description="Record how a credential was checked and the result."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="verify-form" loading={isSubmitting}>
            Save record
          </Button>
        </>
      }
    >
      <form id="verify-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Credential type"
          required
          placeholder="e.g. TESDA NC II – Electrical Installation"
          error={errors.credential_type?.message}
          {...register('credential_type')}
        />
        <Select
          label="Verification method"
          required
          placeholder="Choose a method"
          options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))}
          error={errors.method?.message}
          {...register('method')}
        />
        <Select
          label="Outcome"
          required
          placeholder="Choose an outcome"
          options={Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ value, label }))}
          error={errors.outcome?.message}
          {...register('outcome')}
        />
        <Input
          label="Date checked"
          type="date"
          required
          max={manilaDateString()}
          error={errors.checked_on?.message}
          {...register('checked_on')}
        />
        <Textarea
          label="Notes"
          placeholder="Certificate number, who confirmed, etc."
          error={errors.notes?.message}
          {...register('notes')}
        />
        <FormError message={formError} />
      </form>
    </Modal>
  );
}

function ActivationCodeModal({ account, onClose }: { account: CreateAccountResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.activation_code);
      setCopied(true);
      toast.success('Code copied.');
    } catch {
      toast.error('Could not copy. Select the code and copy it manually.');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={false}
      title="Activation code — shown only once"
      description="Write it down or copy it now and give it to the technician privately. It cannot be displayed again."
      footer={<Button onClick={onClose}>I have given the code to the technician</Button>}
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 p-5">
          <code
            className="font-mono text-3xl font-bold tracking-[0.2em] text-brand-900 select-all"
            aria-label="Activation code"
          >
            {account.activation_code}
          </code>
          <Button
            variant="outline"
            size="sm"
            icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </div>
        <dl className="text-sm">
          <div className="flex justify-between gap-3 py-1">
            <dt className="text-slate-500">Login email</dt>
            <dd className="font-medium">{account.user.email}</dd>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <dt className="text-slate-500">Expires</dt>
            <dd className="font-medium">{formatDateTime(account.expires_at)}</dd>
          </div>
        </dl>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">Instructions for the technician</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>
              Open the platform and go to <strong>Activate</strong> ({window.location.origin}/activate).
            </li>
            <li>Enter the email above and this activation code.</li>
            <li>Choose a password, then log in.</li>
            <li>
              Complete the profile (location, specializations) and add availability to appear in
              recommendations.
            </li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}

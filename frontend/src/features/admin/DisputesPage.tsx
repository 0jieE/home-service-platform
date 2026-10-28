import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';
import { useDisputes, useResolveDispute } from '@/api/admin';
import { BookingStatusBadges } from '@/components/booking/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { FormError, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { formatDateTime, formatRange, titleCase } from '@/lib/format';
import { resolveDisputeSchema, type ResolveDisputeValues } from '@/types/schemas';
import type { AdminDispute, DisputeStatus } from '@/types/api';

const DECISION_LABEL = {
  completed: 'Mark booking completed',
  cancelled: 'Cancel the booking',
  return_in_progress: 'Return to in progress (technician continues)',
} as const;

export function DisputesPage() {
  const [sp, setSp] = useSearchParams();
  const status: DisputeStatus = sp.get('status') === 'resolved' ? 'resolved' : 'open';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const q = useDisputes({ status, page });
  const [resolving, setResolving] = useState<AdminDispute | null>(null);

  return (
    <div>
      <PageHeader title="Disputes" description="Customers open a dispute instead of confirming completion." />
      <Instructions title="Resolving a dispute">
        <p>Review the booking history and contact both parties. Then record a decision and notes — the decision and your notes are kept with the booking’s history.</p>
      </Instructions>
      <Tabs
        className="mb-4"
        value={status}
        onChange={(v) => setSp({ status: v })}
        items={[
          { value: 'open', label: 'Open' },
          { value: 'resolved', label: 'Resolved' },
        ]}
      />
      {q.isLoading ? (
        <SkeletonList rows={2} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.results.length ? (
        <EmptyState icon={<Scale className="size-6" />} title={status === 'open' ? 'No open disputes' : 'No resolved disputes'} />
      ) : (
        <>
          <ul className="space-y-3">
            {q.data.results.map((d) => (
              <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      Dispute #{d.id} · opened {formatDateTime(d.created_at)} by {d.opened_by_name}
                    </p>
                    <h2 className="font-semibold">
                      {d.booking.category.name}: {d.booking.customer.full_name} vs. {d.booking.technician.full_name}
                    </h2>
                    <p className="text-sm text-slate-600">{formatRange(d.booking.start, d.booking.end)}</p>
                  </div>
                  <BookingStatusBadges booking={d.booking} />
                </div>
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                  <span className="font-medium">Customer’s reason:</span> {d.reason}
                </p>
                {d.status === 'resolved' && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <p>
                      <span className="font-medium">Decision:</span>{' '}
                      <Badge tone="gray">{d.decision ? DECISION_LABEL[d.decision] : '—'}</Badge>{' '}
                      {d.resolved_at && <span className="text-slate-500">({formatDateTime(d.resolved_at)})</span>}
                    </p>
                    {d.admin_notes && <p className="mt-1">{d.admin_notes}</p>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/a/bookings/${d.booking.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-700 hover:bg-brand-50">
                    View booking #{d.booking.id}
                  </Link>
                  {d.status === 'open' && <Button onClick={() => setResolving(d)}>Resolve</Button>}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} count={q.data.count} hasNext={!!q.data.next} onChange={(p) => setSp({ status, page: String(p) })} />
        </>
      )}
      {resolving && <ResolveModal dispute={resolving} onClose={() => setResolving(null)} />}
    </div>
  );
}

function ResolveModal({ dispute, onClose }: { dispute: AdminDispute; onClose: () => void }) {
  const resolve = useResolveDispute();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResolveDisputeValues>({ resolver: zodResolver(resolveDisputeSchema), defaultValues: { decision: undefined, admin_notes: '' } });
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await resolve.mutateAsync({ id: dispute.id, body: v });
      toast.success(`Dispute resolved: ${titleCase(v.decision)}.`);
      onClose();
    } catch (err) {
      setFormError(applyApiErrors(err, setError, ['decision', 'admin_notes']));
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Resolve dispute #${dispute.id}`}
      description={`Booking #${dispute.booking.id} · ${dispute.booking.category.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="resolve-form" loading={isSubmitting}>
            Record decision
          </Button>
        </>
      }
    >
      <form id="resolve-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium">Reason:</span> {dispute.reason}
        </p>
        <Select
          label="Decision"
          required
          placeholder="Choose a decision"
          options={Object.entries(DECISION_LABEL).map(([value, label]) => ({ value, label }))}
          error={errors.decision?.message}
          {...register('decision')}
        />
        <Textarea label="Administrator notes" required rows={4} placeholder="What you found and why you decided this" error={errors.admin_notes?.message} {...register('admin_notes')} />
        <FormError message={formError} />
      </form>
    </Modal>
  );
}

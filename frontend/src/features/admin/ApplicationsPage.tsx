import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FileCheck2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useApplications, useCreateApplication } from '@/api/admin';
import { useCategories } from '@/api/categories';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Checkbox, FormError, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { applicationSchema, type ApplicationValues } from '@/types/schemas';
import type { ApplicationStatus } from '@/types/api';
import { APP_STATUS_LABEL, AppStatusBadge } from './shared';

export function ApplicationsPage() {
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') || undefined) as ApplicationStatus | undefined;
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const [creating, setCreating] = useState(false);
  const q = useApplications({ status, search: sp.get('search') || undefined, page });

  useEffect(() => {
    const h = setTimeout(() => {
      if ((sp.get('search') ?? '') === search.trim()) return;
      const next = new URLSearchParams(sp);
      if (search.trim()) next.set('search', search.trim());
      else next.delete('search');
      next.delete('page');
      setSp(next, { replace: true });
    }, 350);
    return () => clearTimeout(h);
  }, [search, sp, setSp]);

  return (
    <div>
      <PageHeader
        title="Technician applications"
        description="Applicants submit documents in person; record them here."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Record application
          </Button>
        }
      />
      <Instructions title="Approval steps">
        <p>
          1. Record the application. 2. Check each credential and add a verification record (method + outcome). 3. Approve
          or reject. 4. For approved applicants, create the technician account and give them the one-time activation code.
        </p>
      </Instructions>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input label="Search" type="search" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          label="Status"
          value={status ?? ''}
          placeholder="All statuses"
          options={Object.entries(APP_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(e) => {
            const next = new URLSearchParams(sp);
            if (e.target.value) next.set('status', e.target.value);
            else next.delete('status');
            next.delete('page');
            setSp(next);
          }}
        />
      </div>
      {q.isLoading ? (
        <SkeletonList rows={3} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.results.length ? (
        <EmptyState
          icon={<FileCheck2 className="size-6" />}
          title="No applications"
          description="Record an application when a technician applies in person."
          action={<Button onClick={() => setCreating(true)}>Record application</Button>}
        />
      ) : (
        <>
          <Table caption="Applications">
            <THead>
              <tr>
                <Th>Applicant</Th>
                <Th className="hidden md:table-cell">Categories</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Submitted</Th>
                <Th className="hidden sm:table-cell">Account</Th>
              </tr>
            </THead>
            <TBody>
              {q.data.results.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link to={`/a/applications/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.first_name} {a.last_name}
                    </Link>
                    <span className="block text-xs text-slate-500">{a.email}</span>
                  </Td>
                  <Td className="hidden md:table-cell">{a.requested_categories.map((c) => c.name).join(', ') || '—'}</Td>
                  <Td>
                    <AppStatusBadge status={a.status} />
                  </Td>
                  <Td className="hidden sm:table-cell">{formatDate(a.submitted_at)}</Td>
                  <Td className="hidden sm:table-cell">{a.account_created ? 'Created' : '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={page}
            count={q.data.count}
            hasNext={!!q.data.next}
            onChange={(p) => {
              const next = new URLSearchParams(sp);
              next.set('page', String(p));
              setSp(next);
            }}
          />
        </>
      )}
      {creating && <CreateApplicationModal onClose={() => setCreating(false)} />}
    </div>
  );
}

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'address', 'requested_category_ids', 'notes'] as const;

function CreateApplicationModal({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const create = useCreateApplication();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { first_name: '', last_name: '', email: '', phone: '', address: '', requested_category_ids: [], notes: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const app = await create.mutateAsync(v);
      toast.success('Application recorded.');
      navigate(`/a/applications/${app.id}`);
    } catch (err) {
      setFormError(applyApiErrors(err, setError, FIELDS, { requested_categories: 'requested_category_ids' }));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Record a technician application"
      description="Enter the applicant’s details as submitted in person."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="app-form" loading={isSubmitting}>
            Save application
          </Button>
        </>
      }
    >
      <form id="app-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" required error={errors.first_name?.message} {...register('first_name')} />
          <Input label="Last name" required error={errors.last_name?.message} {...register('last_name')} />
          <Input label="Email" type="email" required hint="Becomes the technician’s login." error={errors.email?.message} {...register('email')} />
          <Input label="Mobile number" type="tel" required error={errors.phone?.message} {...register('phone')} />
        </div>
        <Input label="Address" required error={errors.address?.message} {...register('address')} />
        <Controller
          control={control}
          name="requested_category_ids"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-800">
                Requested categories <span className="text-red-600">*</span>
              </legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {(categories.data ?? []).map((c) => (
                  <Checkbox
                    key={c.id}
                    label={c.name}
                    checked={field.value.includes(c.id)}
                    onChange={(e) => field.onChange(e.target.checked ? [...field.value, c.id] : field.value.filter((x) => x !== c.id))}
                  />
                ))}
              </div>
              {errors.requested_category_ids && <p className="text-sm text-red-600">{errors.requested_category_ids.message}</p>}
            </fieldset>
          )}
        />
        <Textarea label="Notes" placeholder="Documents submitted, remarks…" error={errors.notes?.message} {...register('notes')} />
        <FormError message={formError} />
      </form>
    </Modal>
  );
}

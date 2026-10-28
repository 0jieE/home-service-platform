import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { useSetUserActive, useUsers } from '@/api/admin';
import { useAuth } from '@/auth/useAuth';
import { ROLE_LABEL } from '@/components/layout/nav';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import type { Role, User } from '@/types/api';

export function UsersPage() {
  const { user: me } = useAuth();
  const [sp, setSp] = useSearchParams();
  const role = (sp.get('role') || undefined) as Role | undefined;
  const active = sp.get('is_active');
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const [target, setTarget] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setActive = useSetUserActive();
  const q = useUsers({
    role,
    search: sp.get('search') || undefined,
    is_active: active === null || active === '' ? undefined : active === 'true',
    page,
  });

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

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setSp(next);
  };

  const confirm = async () => {
    if (!target) return;
    setError(null);
    try {
      await setActive.mutateAsync({ id: target.id, is_active: !target.is_active });
      toast.success(`${target.full_name || target.email} ${target.is_active ? 'deactivated' : 'activated'}.`);
      setTarget(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader title="Users" description="Customers, technicians and administrators. Deactivated users cannot log in and technicians stop appearing in recommendations." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_180px]">
        <Input label="Search" type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          label="Role"
          value={role ?? ''}
          placeholder="All roles"
          options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          onChange={(e) => setParam('role', e.target.value)}
        />
        <Select
          label="Status"
          value={active ?? ''}
          placeholder="Any status"
          options={[
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
          onChange={(e) => setParam('is_active', e.target.value)}
        />
      </div>
      {q.isLoading ? (
        <SkeletonList rows={4} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.results.length ? (
        <EmptyState icon={<Users className="size-6" />} title="No users found" description="Try another filter." />
      ) : (
        <>
          <Table caption="Users">
            <THead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th className="hidden md:table-cell">Phone</Th>
                <Th className="hidden md:table-cell">Joined</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </THead>
            <TBody>
              {q.data.results.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <span className="font-medium text-slate-900">{u.full_name || '—'}</span>
                    <span className="block text-xs text-slate-500">{u.email}</span>
                  </Td>
                  <Td>{ROLE_LABEL[u.role]}</Td>
                  <Td className="hidden md:table-cell">{u.phone || '—'}</Td>
                  <Td className="hidden md:table-cell">{u.date_joined ? formatDate(u.date_joined) : '—'}</Td>
                  <Td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</Td>
                  <Td className="text-right">
                    {u.id === me?.id ? (
                      <span className="text-xs text-slate-400">You</span>
                    ) : (
                      <Button size="sm" variant={u.is_active ? 'outline' : 'secondary'} onClick={() => setTarget(u)}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} count={q.data.count} hasNext={!!q.data.next} onChange={(p) => setParam('page', String(p))} />
        </>
      )}
      <ConfirmDialog
        open={!!target}
        title={target?.is_active ? `Deactivate ${target?.full_name || target?.email}?` : `Activate ${target?.full_name || target?.email}?`}
        description={
          target?.is_active
            ? 'They will not be able to log in. A deactivated technician is excluded from recommendations.'
            : 'They will be able to log in again.'
        }
        confirmLabel={target?.is_active ? 'Deactivate' : 'Activate'}
        tone={target?.is_active ? 'danger' : 'primary'}
        loading={setActive.isPending}
        error={error}
        onClose={() => {
          setTarget(null);
          setError(null);
        }}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}

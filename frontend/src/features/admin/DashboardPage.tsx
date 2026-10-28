import { Link } from 'react-router';
import {
  CalendarCheck,
  FileClock,
  Scale,
  Star,
  UserCheck,
  Users,
  Wrench,
  ClipboardCheck,
} from 'lucide-react';
import { useAdminStats, useRecSettings } from '@/api/admin';
import { STATUS_LABEL } from '@/components/booking/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Spinner';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { BarCard, HBarCard, LineCard } from './charts';
import { CoverageWarningBadge } from './CoverageWarning';

function Kpi({
  icon,
  label,
  value,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  to?: string;
}) {
  const body = (
    <CardBody className="flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="truncate text-sm text-slate-500">{label}</p>
      </div>
    </CardBody>
  );
  return (
    <Card>
      {to ? (
        <Link to={to} className="block rounded-xl hover:bg-slate-50">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

export function AdminDashboardPage() {
  const stats = useAdminStats();
  const settings = useRecSettings();
  const s = stats.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Administrator dashboard"
        description="Platform activity in Kidapawan City."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CoverageWarningBadge />
            {settings.data && (
              <Link to="/a/settings">
                <Badge tone={settings.data.is_frozen ? 'green' : 'amber'}>
                  Rec. settings v{settings.data.version} · {settings.data.is_frozen ? 'frozen' : 'not frozen'}
                </Badge>
              </Link>
            )}
          </div>
        }
      />
      {stats.isError && <ErrorState message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.isLoading || !s ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <Kpi
              icon={<Users className="size-6" />}
              label="Customers"
              value={s.totals.customers}
              to="/a/users?role=customer"
            />
            <Kpi
              icon={<Wrench className="size-6" />}
              label="Technicians"
              value={s.totals.technicians}
              to="/a/users?role=technician"
            />
            <Kpi
              icon={<UserCheck className="size-6" />}
              label="Active technicians"
              value={s.totals.active_technicians}
            />
            <Kpi
              icon={<FileClock className="size-6" />}
              label="Pending applications"
              value={s.totals.pending_applications}
              to="/a/applications"
            />
            <Kpi icon={<CalendarCheck className="size-6" />} label="Bookings" value={s.totals.bookings} />
            <Kpi
              icon={<ClipboardCheck className="size-6" />}
              label="Completed bookings"
              value={s.totals.completed_bookings}
            />
            <Kpi
              icon={<Scale className="size-6" />}
              label="Open disputes"
              value={s.totals.open_disputes}
              to="/a/disputes"
            />
            <Kpi
              icon={<Star className="size-6" />}
              label="Average rating"
              value={
                s.totals.avg_rating !== null && s.totals.avg_rating !== undefined
                  ? s.totals.avg_rating.toFixed(2)
                  : '—'
              }
            />
          </>
        )}
      </div>

      {s && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <BarCard
              title="Bookings by status"
              data={s.bookings_by_status.map((d) => ({
                label: STATUS_LABEL[d.status] ?? d.status,
                value: d.count,
              }))}
            />
            <LineCard
              title="Bookings per week"
              description="Last 12 weeks (week starting)"
              data={s.bookings_per_week.map((d) => ({
                label: formatDate(`${d.week_start.slice(0, 10)}T12:00:00+08:00`, 'MMM d'),
                value: d.count,
              }))}
            />
          </div>
          <HBarCard
            title="Bookings by category"
            data={[...s.bookings_by_category]
              .sort((a, b) => b.count - a.count)
              .map((d) => ({ label: d.category, value: d.count }))}
          />
          <Card>
            <CardHeader title="Top technicians" description="By rating and completed jobs." />
            <CardBody>
              {s.top_technicians.length ? (
                <Table caption="Top technicians">
                  <THead>
                    <tr>
                      <Th>#</Th>
                      <Th>Technician</Th>
                      <Th className="text-right">Avg rating</Th>
                      <Th className="text-right">Reviews</Th>
                      <Th className="text-right">Completed</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {s.top_technicians.map((t, i) => (
                      <Tr key={t.id}>
                        <Td>{i + 1}</Td>
                        <Td className="font-medium text-slate-900">{t.full_name}</Td>
                        <Td className="text-right tabular-nums">
                          {t.rating_count ? (t.rating_avg ?? 0).toFixed(2) : 'No ratings yet'}
                        </Td>
                        <Td className="text-right tabular-nums">{t.rating_count}</Td>
                        <Td className="text-right tabular-nums">{t.completed}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="text-sm text-slate-500">No technicians yet.</p>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

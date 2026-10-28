import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { useAdminCoverage } from '@/api/admin';
import { BaseMap } from '@/components/map/BaseMap';
import { CoverageOverlay } from '@/components/map/CoverageOverlay';
import { FitBounds } from '@/components/map/mapUtils';
import { geometryToPaths } from '@/api/coverage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { Alert, PageHeader } from '@/components/ui/PageHeader';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { errorMessage } from '@/lib/errors';

export function CoveragePage() {
  const q = useAdminCoverage();
  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const c = q.data;
  const points = geometryToPaths(c.geometry).flat();

  return (
    <div className="space-y-5">
      <PageHeader title="Coverage area" description="Customers and technicians must be inside this boundary." />
      {c.is_placeholder || !c.verified ? (
        <Alert tone="amber" icon={<TriangleAlert className="size-5" />} title={c.is_placeholder ? 'Development placeholder boundary' : 'Boundary not verified'}>
          Replace it with the official Kidapawan City boundary (e.g. PSA/NAMRIA admin level 3 from HDX) using the backend
          <code className="mx-1 rounded bg-amber-100 px-1">load_coverage … --verified</code> command before formal testing.
        </Alert>
      ) : (
        <Alert tone="green" icon={<CheckCircle2 className="size-5" />} title="Verified official boundary" />
      )}
      <Card>
        <CardHeader title={c.name} />
        <CardBody className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Source</dt>
              <dd className="font-medium">{c.source || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Version</dt>
              <dd className="font-medium">{String(c.version ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Verified</dt>
              <dd className="font-medium">{c.verified ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Geometry</dt>
              <dd className="font-medium">
                {c.geometry?.type ?? '—'} · {points.length} points
              </dd>
            </div>
          </dl>
          <BaseMap className="h-[28rem]" showCoverage={false} zoom={11} ariaLabel="Coverage boundary map">
            <CoverageOverlay coverage={c} />
            <FitBounds points={points} padding={24} maxZoom={14} />
          </BaseMap>
        </CardBody>
      </Card>
    </div>
  );
}

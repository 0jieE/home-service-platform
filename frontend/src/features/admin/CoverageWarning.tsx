import { Link } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import { useAdminCoverage } from '@/api/admin';
import { Badge } from '@/components/ui/Badge';

/** Small warning badge when the active coverage boundary is an unverified placeholder. */
export function CoverageWarningBadge() {
  const { data } = useAdminCoverage();
  if (!data || (data.verified && !data.is_placeholder)) return null;
  return (
    <Link to="/a/coverage" title={`${data.name} · ${data.source}`}>
      <Badge tone="amber" icon={<TriangleAlert className="size-3.5" />}>
        {data.is_placeholder
          ? 'Placeholder city boundary — not for formal testing'
          : 'City boundary not verified'}
      </Badge>
    </Link>
  );
}

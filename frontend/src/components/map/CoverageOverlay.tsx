import { useMemo } from 'react';
import { Polygon } from '@vis.gl/react-google-maps';
import { geometryToPaths, useCoverage } from '@/api/coverage';
import type { Coverage } from '@/types/api';

/** Outline of the Kidapawan City coverage polygon. Must be rendered inside a <Map>. */
export function CoverageOverlay({ coverage }: { coverage?: Coverage }) {
  const query = useCoverage();
  const geometry = (coverage ?? query.data)?.geometry;
  const paths = useMemo(() => geometryToPaths(geometry), [geometry]);
  if (!paths.length) return null;
  return (
    <Polygon
      paths={paths}
      strokeColor="#1a6646"
      strokeOpacity={0.9}
      strokeWeight={2}
      fillColor="#46a074"
      fillOpacity={0.04}
      clickable={false}
    />
  );
}

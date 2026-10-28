import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Coverage, Point } from '@/types/api';
import { qk } from './keys';

export async function getCoverage(): Promise<Coverage> {
  const { data } = await api.get<Coverage>('/coverage/');
  return data;
}

export function useCoverage() {
  return useQuery({ queryKey: qk.coverage, queryFn: getCoverage, staleTime: 30 * 60_000 });
}

export async function checkCoverage(point: Point): Promise<{ inside: boolean }> {
  const { data } = await api.post<{ inside: boolean }>('/coverage/check/', point);
  return data;
}

export function useCheckCoverage() {
  return useMutation({ mutationFn: checkCoverage });
}

/** GeoJSON (lng, lat) rings → Google Maps paths (outer rings only are needed for an outline, but holes are kept). */
export function geometryToPaths(geometry: Coverage['geometry'] | undefined): google.maps.LatLngLiteral[][] {
  if (!geometry) return [];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((rings) =>
    rings.map((ring) => ring.map(([lng, lat]) => ({ lat: lat!, lng: lng! }))),
  );
}

/** Bounding box of the coverage geometry, used to restrict address autocomplete. */
export function geometryBounds(
  geometry: Coverage['geometry'] | undefined,
): google.maps.LatLngBoundsLiteral | null {
  const paths = geometryToPaths(geometry);
  if (!paths.length) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of paths.flat()) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  return { north, south, east, west };
}

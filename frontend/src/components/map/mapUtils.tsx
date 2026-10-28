import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { Point } from '@/types/api';

/** Pans the map when `target` changes (by value). */
export function PanTo({ target, zoom }: { target: Point | null | undefined; zoom?: number }) {
  const map = useMap();
  const lat = target?.lat;
  const lng = target?.lng;
  useEffect(() => {
    if (!map || lat === undefined || lng === undefined) return;
    map.panTo({ lat, lng });
    if (zoom && (map.getZoom() ?? 0) < zoom) map.setZoom(zoom);
  }, [map, lat, lng, zoom]);
  return null;
}

/** Fits the viewport to the given points whenever their set changes. */
export function FitBounds({ points, padding = 48, maxZoom = 15 }: { points: Point[]; padding?: number; maxZoom?: number }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  const lastKey = useRef('');
  useEffect(() => {
    if (!map || !points.length || key === lastKey.current) return;
    lastKey.current = key;
    if (points.length === 1) {
      map.setCenter(points[0]!);
      map.setZoom(maxZoom);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, padding);
    const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > maxZoom) map.setZoom(maxZoom);
    });
    return () => listener.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, padding, maxZoom]);
  return null;
}

export function isValidPoint(p: Point | null | undefined): p is Point {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

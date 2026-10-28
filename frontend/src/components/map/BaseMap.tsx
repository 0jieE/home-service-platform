import type { ReactNode } from 'react';
import { Map, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { useConfigValues } from '@/api/config';
import { env } from '@/lib/env';
import { cn } from '@/lib/cn';
import type { Point } from '@/types/api';
import { CoverageOverlay } from './CoverageOverlay';
import { MapsGate } from './MapsProvider';

export interface BaseMapProps {
  className?: string;
  center?: Point;
  zoom?: number;
  showCoverage?: boolean;
  onClick?: (p: Point) => void;
  children?: ReactNode;
  ariaLabel?: string;
}

/** Google map with the app's Map ID (AdvancedMarker), cooperative gestures and the coverage outline. */
export function BaseMap({
  className,
  center,
  zoom = 13,
  showCoverage = true,
  onClick,
  children,
  ariaLabel,
}: BaseMapProps) {
  const { cityCenter } = useConfigValues();
  const heightClass = className ?? 'h-72';
  return (
    <MapsGate className={heightClass}>
      <div
        className={cn('overflow-hidden rounded-xl border border-slate-200', heightClass)}
        role="region"
        aria-label={ariaLabel ?? 'Map'}
      >
        <Map
          mapId={env.googleMapsMapId}
          defaultCenter={center ?? cityCenter}
          defaultZoom={zoom}
          gestureHandling="cooperative"
          clickableIcons={false}
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl
          style={{ width: '100%', height: '100%' }}
          onClick={(e: MapMouseEvent) => {
            const ll = e.detail.latLng;
            if (ll && onClick) onClick({ lat: ll.lat, lng: ll.lng });
          }}
        >
          {showCoverage && <CoverageOverlay />}
          {children}
        </Map>
      </div>
    </MapsGate>
  );
}

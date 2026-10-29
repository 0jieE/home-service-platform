import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { cn } from '@/lib/cn';
import type { Point } from '@/types/api';
import { BaseMap } from './BaseMap';
import { FitBounds, isValidPoint } from './mapUtils';

export interface RankedMarker {
  id: number;
  rank: number;
  name: string;
  point: Point | null;
}

/** Results map: numbered rank markers + the customer's pin. */
export function TechnicianMap({
  customer,
  markers,
  selectedId,
  onSelect,
  className = 'h-80 lg:h-[32rem]',
}: {
  customer: Point | null;
  markers: RankedMarker[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  className?: string;
}) {
  const valid = markers.filter((m) => isValidPoint(m.point));
  const points = [...(customer && isValidPoint(customer) ? [customer] : []), ...valid.map((m) => m.point!)];
  return (
    <BaseMap className={className} center={customer ?? undefined} ariaLabel="Map of recommended technicians">
      {customer && isValidPoint(customer) && (
        <AdvancedMarker position={customer} title="Your service location" zIndex={1000}>
          <Pin background="#1a6646" borderColor="#0c2a1f" glyphColor="#ffffff" />
        </AdvancedMarker>
      )}
      {valid.map((m) => (
        <AdvancedMarker
          key={m.id}
          position={m.point!}
          title={`#${m.rank} ${m.name}`}
          zIndex={selectedId === m.id ? 999 : 500 - m.rank}
          onClick={() => onSelect?.(m.id)}
        >
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-full border-2 border-white font-display text-sm font-bold shadow-md',
              selectedId === m.id ? 'scale-110 bg-sun-400 text-pine-950' : 'bg-pine-900 text-sun-400',
            )}
          >
            {m.rank}
          </span>
        </AdvancedMarker>
      ))}
      <FitBounds points={points} />
    </BaseMap>
  );
}

/** Single location (booking detail, technician detail). */
export function PointMap({
  point,
  title,
  className = 'h-56',
}: {
  point: Point | null;
  title: string;
  className?: string;
}) {
  if (!point || !isValidPoint(point)) return null;
  return (
    <BaseMap className={className} center={point} zoom={15} ariaLabel={`Map: ${title}`}>
      <AdvancedMarker position={point} title={title}>
        <Pin background="#143426" borderColor="#0d241a" glyphColor="#f0b429" />
      </AdvancedMarker>
    </BaseMap>
  );
}

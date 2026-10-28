import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AdvancedMarker, Pin, useMapsLibrary } from '@vis.gl/react-google-maps';
import { AlertTriangle, CheckCircle2, Crosshair, Loader2 } from 'lucide-react';
import { checkCoverage } from '@/api/coverage';
import { useConfigValues } from '@/api/config';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import type { Point } from '@/types/api';
import { BaseMap } from './BaseMap';
import { isValidPoint, PanTo } from './mapUtils';
import { MapsGate, useMapsEnabled } from './MapsProvider';
import { PlaceSearch } from './PlaceSearch';

export interface PickedLocation {
  lat: number;
  lng: number;
  address: string;
}

/** `error` = coverage check could not be performed (server validates anyway, so it does not block). */
export type CoverageStatus = 'none' | 'checking' | 'inside' | 'outside' | 'error';

export const OUTSIDE_COVERAGE_MESSAGE = 'This location is outside Kidapawan City coverage';

export interface LocationPickerProps {
  value: PickedLocation | null;
  onChange: (value: PickedLocation | null) => void;
  /** Reports the coverage check result so parents can block submit when `outside`. */
  onCoverageChange?: (status: CoverageStatus) => void;
  label?: string;
  required?: boolean;
  error?: string;
  addressError?: string;
  mapClassName?: string;
  hint?: string;
}

function geolocationMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission was denied. Allow location access for this site in your browser settings, or search / drop a pin instead.';
    case err.TIMEOUT:
      return 'Getting your location took too long. Try again, or search / drop a pin instead.';
    default:
      return 'Your location is unavailable right now. Search for the address or drop a pin instead.';
  }
}

/** Reverse geocoding helper bound to the Geocoding API (only rendered when Maps is available). */
function useReverseGeocode() {
  const geocoding = useMapsLibrary('geocoding');
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  return useCallback(
    async (p: Point): Promise<string | null> => {
      if (!geocoding) return null;
      geocoder.current ??= new geocoding.Geocoder();
      try {
        const { results } = await geocoder.current.geocode({ location: p });
        return results[0]?.formatted_address ?? null;
      } catch {
        return null;
      }
    },
    [geocoding],
  );
}

function MapPickerSurface({
  value,
  onPoint,
  onSearchSelect,
  geoTarget,
  className,
}: {
  value: PickedLocation | null;
  onPoint: (p: Point, reverse: (p: Point) => Promise<string | null>) => void;
  onSearchSelect: (p: Point, address: string) => void;
  geoTarget: Point | null;
  className?: string;
}) {
  const reverse = useReverseGeocode();
  const { cityCenter } = useConfigValues();
  const point = isValidPoint(value) ? { lat: value.lat, lng: value.lng } : null;
  return (
    <div className="space-y-3">
      <PlaceSearch onSelect={(r) => onSearchSelect(r.point, r.address)} />
      <BaseMap
        className={className}
        center={point ?? cityCenter}
        zoom={point ? 15 : 13}
        onClick={(p) => onPoint(p, reverse)}
        ariaLabel="Location picker map. Click to place the pin."
      >
        {point && (
          <AdvancedMarker
            position={point}
            draggable
            title="Service location (drag to adjust)"
            onDragEnd={(e) => {
              const ll = e.latLng;
              if (ll) onPoint({ lat: ll.lat(), lng: ll.lng() }, reverse);
            }}
          >
            <Pin background="#0f766e" borderColor="#134e4a" glyphColor="#ffffff" />
          </AdvancedMarker>
        )}
        <PanTo target={geoTarget} zoom={15} />
      </BaseMap>
      <p className="text-xs text-slate-500">
        Tip: click the map to place the pin, or drag the pin to adjust it.
      </p>
    </div>
  );
}

/**
 * Reusable location picker: Places (New) search, "Use my location", click-to-place,
 * draggable pin with reverse geocoding, editable address and the coverage outline.
 * Validates with POST /coverage/check/.
 */
export function LocationPicker({
  value,
  onChange,
  onCoverageChange,
  label = 'Service location',
  required,
  error,
  addressError,
  mapClassName = 'h-72 sm:h-80',
  hint,
}: LocationPickerProps) {
  const mapsEnabled = useMapsEnabled();
  const [checked, setChecked] = useState<{ key: string; status: CoverageStatus } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoTarget, setGeoTarget] = useState<Point | null>(value && isValidPoint(value) ? value : null);
  const [resolving, setResolving] = useState(false);
  const checkSeq = useRef(0);
  const valueRef = useRef(value);
  const labelId = useId();
  const onCoverageRef = useRef(onCoverageChange);
  useEffect(() => {
    valueRef.current = value;
    onCoverageRef.current = onCoverageChange;
  }, [value, onCoverageChange]);

  // Coverage check whenever the point changes; status is derived from the last result for this point.
  const lat = value?.lat;
  const lng = value?.lng;
  const hasPoint = lat !== undefined && lng !== undefined && isValidPoint({ lat, lng });
  const pointKey = hasPoint ? `${lat},${lng}` : '';
  const coverage: CoverageStatus = !hasPoint
    ? 'none'
    : checked?.key === pointKey
      ? checked.status
      : 'checking';

  useEffect(() => {
    if (!pointKey) return;
    const [la, ln] = pointKey.split(',').map(Number) as [number, number];
    const seq = ++checkSeq.current;
    const handle = setTimeout(() => {
      checkCoverage({ lat: la, lng: ln })
        .then(
          (r) =>
            seq === checkSeq.current &&
            setChecked({ key: pointKey, status: r.inside ? 'inside' : 'outside' }),
        )
        .catch(() => seq === checkSeq.current && setChecked({ key: pointKey, status: 'error' }));
    }, 250);
    return () => clearTimeout(handle);
  }, [pointKey]);

  // Tell the parent (forms block submit when outside).
  useEffect(() => {
    onCoverageRef.current?.(coverage);
  }, [coverage]);

  const setPoint = useCallback(
    async (p: Point, reverse?: (p: Point) => Promise<string | null>, address?: string) => {
      const keepAddress = valueRef.current?.address ?? '';
      onChange({ lat: p.lat, lng: p.lng, address: address ?? keepAddress });
      if (address === undefined && reverse) {
        setResolving(true);
        const resolved = await reverse(p);
        setResolving(false);
        const current = valueRef.current;
        if (resolved && current && current.lat === p.lat && current.lng === p.lng) {
          onChange({ ...current, address: resolved });
        }
      }
    },
    [onChange],
  );

  const reverseRef = useRef<((p: Point) => Promise<string | null>) | null>(null);

  const useMyLocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Your browser does not support location. Search or drop a pin instead.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoTarget(p);
        void setPoint(p, reverseRef.current ?? undefined);
      },
      (err) => {
        setGeoBusy(false);
        setGeoError(geolocationMessage(err));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  return (
    <fieldset className="space-y-3" aria-labelledby={labelId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend id={labelId} className="text-sm font-medium text-slate-800">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </legend>
        <Button
          variant="outline"
          size="sm"
          onClick={useMyLocation}
          loading={geoBusy}
          icon={<Crosshair className="size-4" />}
        >
          Use my location
        </Button>
      </div>
      {hint && <p className="-mt-1 text-xs text-slate-500">{hint}</p>}

      {mapsEnabled ? (
        <MapsGate className={mapClassName} fallback={<ManualCoordinates value={value} onChange={onChange} />}>
          <ReverseBridge onReady={(fn) => (reverseRef.current = fn)} />
          <MapPickerSurface
            value={value}
            geoTarget={geoTarget}
            className={mapClassName}
            onPoint={(p, reverse) => void setPoint(p, reverse)}
            onSearchSelect={(p, address) => {
              setGeoTarget(p);
              void setPoint(p, undefined, address);
            }}
          />
        </MapsGate>
      ) : (
        <ManualCoordinates value={value} onChange={onChange} />
      )}

      {geoError && (
        <p role="alert" className="text-sm text-amber-700">
          {geoError}
        </p>
      )}

      <Textarea
        label="Address / directions"
        rows={2}
        required={required}
        value={value?.address ?? ''}
        disabled={!value}
        placeholder={value ? 'e.g. Purok 3, Brgy. Lanao, near the chapel' : 'Choose a location first'}
        hint={resolving ? 'Looking up the address…' : 'You can edit this to add landmarks or directions.'}
        error={addressError}
        onChange={(e) => value && onChange({ ...value, address: e.target.value })}
      />

      <CoverageNotice status={coverage} />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Exposes the reverse geocoder to the "Use my location" handler (hooks must live under APIProvider). */
function ReverseBridge({ onReady }: { onReady: (fn: (p: Point) => Promise<string | null>) => void }) {
  const reverse = useReverseGeocode();
  useEffect(() => {
    onReady(reverse);
  }, [reverse, onReady]);
  return null;
}

export function CoverageNotice({ status }: { status: CoverageStatus }) {
  if (status === 'none') return null;
  const map = {
    checking: {
      icon: <Loader2 className="size-4 animate-spin" />,
      text: 'Checking Kidapawan City coverage…',
      cls: 'text-slate-600 bg-slate-50 border-slate-200',
    },
    inside: {
      icon: <CheckCircle2 className="size-4" />,
      text: 'Inside Kidapawan City coverage',
      cls: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    },
    outside: {
      icon: <AlertTriangle className="size-4" />,
      text: `${OUTSIDE_COVERAGE_MESSAGE}. Choose a location inside the city.`,
      cls: 'text-red-700 bg-red-50 border-red-200',
    },
    error: {
      icon: <AlertTriangle className="size-4" />,
      text: 'Could not check coverage right now. It will be checked again when you submit.',
      cls: 'text-amber-800 bg-amber-50 border-amber-200',
    },
  }[status];
  return (
    <p
      role={status === 'outside' ? 'alert' : 'status'}
      className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', map.cls)}
    >
      {map.icon}
      {map.text}
    </p>
  );
}

/** Fallback when Google Maps is unavailable: enter coordinates directly. */
function ManualCoordinates({
  value,
  onChange,
}: {
  value: PickedLocation | null;
  onChange: (v: PickedLocation | null) => void;
}) {
  const { cityCenter } = useConfigValues();
  const [lat, setLat] = useState(value ? String(value.lat) : '');
  const [lng, setLng] = useState(value ? String(value.lng) : '');
  const apply = (la: string, ln: string) => {
    const a = Number(la);
    const b = Number(ln);
    if (la !== '' && ln !== '' && isValidPoint({ lat: a, lng: b })) {
      onChange({ lat: a, lng: b, address: value?.address ?? '' });
    }
  };
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="mb-3 text-sm text-slate-600">
        The map is unavailable. Enter the coordinates manually (Kidapawan City center is {cityCenter.lat},{' '}
        {cityCenter.lng}).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Latitude"
          inputMode="decimal"
          value={lat}
          onChange={(e) => {
            setLat(e.target.value);
            apply(e.target.value, lng);
          }}
        />
        <Input
          label="Longitude"
          inputMode="decimal"
          value={lng}
          onChange={(e) => {
            setLng(e.target.value);
            apply(lat, e.target.value);
          }}
        />
      </div>
    </div>
  );
}

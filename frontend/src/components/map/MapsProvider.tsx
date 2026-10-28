import { createContext, useContext, type ReactNode } from 'react';
import { APIProvider, APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { MapPinOff } from 'lucide-react';
import { env } from '@/lib/env';
import { cn } from '@/lib/cn';

const MapsEnabledContext = createContext(false);

const LIBRARIES = ['places', 'geocoding', 'marker'];

/** Wraps the app once. Without a key, children render and map components show an inline message. */
export function MapsProvider({ children }: { children: ReactNode }) {
  if (!env.googleMapsApiKey) {
    return <MapsEnabledContext.Provider value={false}>{children}</MapsEnabledContext.Provider>;
  }
  return (
    <APIProvider apiKey={env.googleMapsApiKey} libraries={LIBRARIES} region="PH" language="en">
      <MapsEnabledContext.Provider value={true}>{children}</MapsEnabledContext.Provider>
    </APIProvider>
  );
}

export function useMapsEnabled() {
  return useContext(MapsEnabledContext);
}

function StatusGate({ children, fallback, className }: { children: ReactNode; fallback?: ReactNode; className?: string }) {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <>
        {fallback ?? (
          <MapUnavailable
            className={className}
            message={
              status === APILoadingStatus.AUTH_FAILURE
                ? 'Google Maps rejected the API key (check that Maps JavaScript API is enabled and the key allows this site).'
                : 'Google Maps failed to load. Check your internet connection and reload the page.'
            }
          />
        )}
      </>
    );
  }
  return <>{children}</>;
}

/** Renders children only when maps can be used; otherwise a clear inline message (or `fallback`). */
export function MapsGate({ children, fallback, className }: { children: ReactNode; fallback?: ReactNode; className?: string }) {
  const enabled = useMapsEnabled();
  if (!enabled) {
    return (
      <>
        {fallback ?? (
          <MapUnavailable
            className={className}
            message="Map unavailable: no Google Maps API key is configured (VITE_GOOGLE_MAPS_API_KEY in frontend/.env.local)."
          />
        )}
      </>
    );
  }
  return (
    <StatusGate fallback={fallback} className={className}>
      {children}
    </StatusGate>
  );
}

export function MapUnavailable({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-100 p-6 text-center text-sm text-slate-600',
        className,
      )}
    >
      <MapPinOff className="size-6 text-slate-400" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

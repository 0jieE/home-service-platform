import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search } from 'lucide-react';
import { geometryBounds, useCoverage } from '@/api/coverage';
import { useConfigValues } from '@/api/config';
import { cn } from '@/lib/cn';
import type { Point } from '@/types/api';

export interface PlaceResult {
  point: Point;
  address: string;
}

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * Address search with Places API (New): AutocompleteSuggestion + session token,
 * custom Tailwind dropdown, restricted to the Philippines around Kidapawan.
 */
export function PlaceSearch({
  onSelect,
  disabled,
}: {
  onSelect: (r: PlaceResult) => void;
  disabled?: boolean;
}) {
  const places = useMapsLibrary('places');
  const { cityCenter } = useConfigValues();
  const coverage = useCoverage();
  const bounds = useMemo(() => geometryBounds(coverage.data?.geometry), [coverage.data]);

  const [input, setInput] = useState('');
  const [fetched, setSuggestions] = useState<Suggestion[]>([]);
  const suggestions = input.trim().length >= 3 ? fetched : [];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestSeq = useRef(0);
  const listId = useId();
  const inputId = useId();

  useEffect(() => {
    const q = input.trim();
    if (!places || q.length < 3) return;
    const seq = ++requestSeq.current;
    const handle = setTimeout(async () => {
      if (!sessionToken.current) sessionToken.current = new places.AutocompleteSessionToken();
      setLoading(true);
      setError(null);
      try {
        const request: google.maps.places.AutocompleteRequest = {
          input: q,
          sessionToken: sessionToken.current,
          includedRegionCodes: ['ph'],
          origin: cityCenter,
        };
        if (bounds) request.locationRestriction = bounds;
        else request.locationBias = { center: cityCenter, radius: 15000 };
        const { suggestions: raw } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (seq !== requestSeq.current) return;
        const list: Suggestion[] = [];
        for (const s of raw) {
          const p = s.placePrediction;
          if (!p) continue;
          list.push({
            id: p.placeId,
            main: p.mainText?.toString() ?? p.text.toString(),
            secondary: p.secondaryText?.toString() ?? '',
            prediction: p,
          });
        }
        setSuggestions(list);
        setActive(list.length ? 0 : -1);
        setOpen(true);
      } catch {
        if (seq === requestSeq.current) {
          setSuggestions([]);
          setError('Address search is unavailable right now. Drop a pin on the map instead.');
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [input, places, bounds, cityCenter]);

  const choose = async (s: Suggestion) => {
    setOpen(false);
    setInput(s.main);
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
      const loc = place.location;
      if (!loc) throw new Error('No location');
      onSelect({
        point: { lat: loc.lat(), lng: loc.lng() },
        address: place.formattedAddress ?? [s.main, s.secondary].filter(Boolean).join(', '),
      });
    } catch {
      setError('Could not load that place. Try another result or drop a pin.');
    } finally {
      // A session ends with the place details call; start a new one next time.
      sessionToken.current = null;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = suggestions[active];
      if (s) void choose(s);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        Search for an address or place
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && open ? `${listId}-${active}` : undefined}
          autoComplete="off"
          disabled={disabled || !places}
          placeholder={
            places ? 'Search address, barangay or landmark in Kidapawan' : 'Loading address search…'
          }
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-10 text-base shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 focus:outline-none sm:text-sm"
        />
        {loading && (
          <span className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-400 border-r-transparent" />
        )}
      </div>
      {open && input.trim().length >= 3 && !loading && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matching places inside the coverage area.</li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                  i === active ? 'bg-brand-50' : 'hover:bg-slate-50',
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span>
                  <span className="block font-medium text-slate-800">{s.main}</span>
                  {s.secondary && <span className="block text-xs text-slate-500">{s.secondary}</span>}
                </span>
              </li>
            ))
          )}
          <li className="px-3 pt-1 pb-1 text-right text-[10px] text-slate-400">Powered by Google</li>
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-amber-700">{error}</p>}
    </div>
  );
}

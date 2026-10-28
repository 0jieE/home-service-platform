import { cn } from '@/lib/cn';
import { formatDate, formatTimeRange, manilaDateOf, manilaDateString } from '@/lib/format';
import type { AvailabilitySlot, TimeRange } from '@/types/api';

/** 14-day read-only availability view: free slots per day, with reserved (accepted) times shown. */
export function AvailabilityStrip({
  slots,
  reserved,
  days = 14,
  onPickDay,
}: {
  slots: AvailabilitySlot[];
  reserved: TimeRange[];
  days?: number;
  onPickDay?: (date: string) => void;
}) {
  const dates = Array.from({ length: days }, (_, i) => manilaDateString(i));
  const byDay = (list: TimeRange[] | AvailabilitySlot[], d: string) =>
    (list as TimeRange[])
      .filter((s) => manilaDateOf(s.start) === d)
      .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {dates.map((d) => {
        const free = byDay(
          slots.filter((s) => s.state === 'available'),
          d,
        );
        const busy = byDay(reserved, d);
        const has = free.length > 0;
        const Tag = onPickDay && has ? 'button' : 'div';
        return (
          <li key={d}>
            <Tag
              {...(Tag === 'button' ? { type: 'button' as const, onClick: () => onPickDay?.(d) } : {})}
              className={cn(
                'block h-full w-full rounded-lg border p-2 text-left text-xs',
                has ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50 text-slate-400',
                Tag === 'button' && 'hover:border-emerald-400 focus-visible:outline-2',
              )}
            >
              <span className="block font-semibold text-slate-700">
                {formatDate(`${d}T12:00:00+08:00`, 'EEE, MMM d')}
              </span>
              {has ? (
                free.map((s, i) => (
                  <span key={i} className="mt-1 block text-emerald-800">
                    {formatTimeRange(s.start, s.end)}
                  </span>
                ))
              ) : (
                <span className="mt-1 block">Not available</span>
              )}
              {busy.map((s, i) => (
                <span key={`r${i}`} className="mt-1 block text-slate-500 line-through decoration-slate-400">
                  Booked {formatTimeRange(s.start, s.end)}
                </span>
              ))}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

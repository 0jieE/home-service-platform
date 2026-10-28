import { addMinutes, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TIMEZONE } from './env';

type DateInput = string | Date;
const toDate = (d: DateInput) => (typeof d === 'string' ? parseISO(d) : d);

/** "1.0 km" — one decimal. */
export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || Number.isNaN(km)) return '—';
  return `${km.toFixed(1)} km`;
}

/** "≈ 1.0 km away (straight-line)" — distances are never road distance. */
export function distanceLabel(km: number | null | undefined): string {
  if (km === null || km === undefined || Number.isNaN(km)) return 'Distance unavailable';
  return `≈ ${formatKm(km)} away (straight-line)`;
}

/** Display-only rounding of an unrounded score (default 3 decimals). */
export function formatScore(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

/** Weights are shown with 2 decimals, e.g. 0.50. */
export function formatWeight(value: number): string {
  return value.toFixed(2);
}

export function ratingDisplay(avg: number | null | undefined, count: number | null | undefined): string {
  if (!count) return 'No ratings yet';
  return `${(avg ?? 0).toFixed(1)} ★ · ${count} review${count === 1 ? '' : 's'}`;
}

/** All dates are rendered in Asia/Manila regardless of the browser's zone. */
export function formatDate(d: DateInput, pattern = 'MMM d, yyyy'): string {
  return formatInTimeZone(toDate(d), TIMEZONE, pattern);
}

export function formatTime(d: DateInput): string {
  return formatInTimeZone(toDate(d), TIMEZONE, 'h:mm a');
}

export function formatDateTime(d: DateInput): string {
  return formatInTimeZone(toDate(d), TIMEZONE, 'MMM d, yyyy, h:mm a');
}

/** "Nov 3, 9:00 AM" */
export function formatShortDateTime(d: DateInput): string {
  return formatInTimeZone(toDate(d), TIMEZONE, 'MMM d, h:mm a');
}

/** "9:00–11:00 AM" (meridiem shown once when both ends share it). */
export function formatTimeRange(start: DateInput, end: DateInput): string {
  const s = toDate(start);
  const e = toDate(end);
  const samePeriod = formatInTimeZone(s, TIMEZONE, 'a') === formatInTimeZone(e, TIMEZONE, 'a');
  return `${formatInTimeZone(s, TIMEZONE, samePeriod ? 'h:mm' : 'h:mm a')}–${formatInTimeZone(e, TIMEZONE, 'h:mm a')}`;
}

/** "Tue, Nov 3 · 9:00–11:00 AM" (same day) or a full range across days. */
export function formatRange(start: DateInput, end: DateInput): string {
  const s = toDate(start);
  const e = toDate(end);
  if (manilaDateOf(s) !== manilaDateOf(e)) return `${formatShortDateTime(s)} – ${formatShortDateTime(e)}`;
  return `${formatInTimeZone(s, TIMEZONE, 'EEE, MMM d')} · ${formatTimeRange(s, e)}`;
}

/** Combine a Manila calendar date (yyyy-MM-dd) and time (HH:mm) into ISO 8601 with offset. */
export function manilaIso(date: string, time: string): string {
  const instant = fromZonedTime(`${date}T${time}:00`, TIMEZONE);
  return toManilaIso(instant);
}

/** ISO 8601 with the Manila offset for any instant, e.g. 2026-11-03T09:00:00+08:00. */
export function toManilaIso(d: DateInput): string {
  return formatInTimeZone(toDate(d), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export function addMinutesIso(iso: string, minutes: number): string {
  return toManilaIso(addMinutes(parseISO(iso), minutes));
}

/** yyyy-MM-dd of "now" in Manila, optionally shifted by whole days. */
export function manilaDateString(offsetDays = 0, now: Date = new Date()): string {
  return formatInTimeZone(addMinutes(now, offsetDays * 24 * 60), TIMEZONE, 'yyyy-MM-dd');
}

/** Calendar date (yyyy-MM-dd) of an instant in Manila. */
export function manilaDateOf(d: DateInput): string {
  return formatInTimeZone(toDate(d), TIMEZONE, 'yyyy-MM-dd');
}

/** HH:mm of an instant in Manila. */
export function manilaTimeOf(d: DateInput): string {
  return formatInTimeZone(toDate(d), TIMEZONE, 'HH:mm');
}

/** Monday-based weekday index (0 = Monday … 6 = Sunday) of an instant in Manila. */
export function manilaWeekday(d: DateInput): number {
  return Number(formatInTimeZone(toDate(d), TIMEZONE, 'i')) - 1;
}

/** Shift a yyyy-MM-dd calendar date by whole days (timezone-independent). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/** "HH:mm" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
}

/** Time options "HH:mm" stepping by `step` minutes from `fromHour` to `toHour` (exclusive). */
export function timeOptions(step = 30, fromHour = 6, toHour = 22): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let m = fromHour * 60; m < toHour * 60; m += step) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const value = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ value, label: `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` });
  }
  return out;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

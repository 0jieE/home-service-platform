import { describe, expect, it } from 'vitest';
import {
  addMinutesIso,
  distanceLabel,
  formatDateTime,
  formatKm,
  formatRange,
  formatScore,
  formatShortDateTime,
  formatTimeRange,
  manilaDateOf,
  manilaDateString,
  manilaIso,
  manilaTimeOf,
  manilaWeekday,
  ratingDisplay,
  shiftDate,
  timeOptions,
} from './format';

describe('distance formatting', () => {
  it('formats km with one decimal', () => {
    expect(formatKm(1)).toBe('1.0 km');
    expect(formatKm(2.4149)).toBe('2.4 km');
    expect(formatKm(0.05)).toBe('0.1 km');
    expect(formatKm(null)).toBe('—');
  });

  it('labels distances as straight-line', () => {
    expect(distanceLabel(1)).toBe('≈ 1.0 km away (straight-line)');
    expect(distanceLabel(undefined)).toBe('Distance unavailable');
  });
});

describe('score display rounding', () => {
  it('rounds for display only, 3 decimals by default', () => {
    expect(formatScore(0.625)).toBe('0.625');
    expect(formatScore(0.5833333333)).toBe('0.583');
    expect(formatScore(2 / 3)).toBe('0.667');
    expect(formatScore(0.5, 2)).toBe('0.50');
    expect(formatScore(undefined)).toBe('—');
  });

  it('does not mutate the underlying value', () => {
    const s = 0.5833333333;
    formatScore(s);
    expect(s).toBe(0.5833333333);
  });

  it('shows ratings or "No ratings yet"', () => {
    expect(ratingDisplay(4.5, 12)).toBe('4.5 ★ · 12 reviews');
    expect(ratingDisplay(5, 1)).toBe('5.0 ★ · 1 review');
    expect(ratingDisplay(null, 0)).toBe('No ratings yet');
  });
});

describe('Asia/Manila time', () => {
  it('renders instants in Manila regardless of offset', () => {
    // 01:00Z = 09:00 Manila
    expect(formatDateTime('2026-11-03T01:00:00Z')).toBe('Nov 3, 2026, 9:00 AM');
    expect(formatShortDateTime('2026-11-03T09:00:00+08:00')).toBe('Nov 3, 9:00 AM');
    expect(manilaTimeOf('2026-11-02T23:30:00Z')).toBe('07:30');
    expect(manilaDateOf('2026-11-02T23:30:00Z')).toBe('2026-11-03');
  });

  it('builds ISO 8601 strings with the +08:00 offset', () => {
    expect(manilaIso('2026-11-03', '09:00')).toBe('2026-11-03T09:00:00+08:00');
    expect(addMinutesIso('2026-11-03T09:00:00+08:00', 120)).toBe('2026-11-03T11:00:00+08:00');
    expect(addMinutesIso('2026-11-03T23:00:00+08:00', 120)).toBe('2026-11-04T01:00:00+08:00');
  });

  it('formats ranges', () => {
    expect(formatTimeRange('2026-11-03T09:00:00+08:00', '2026-11-03T11:00:00+08:00')).toBe('9:00–11:00 AM');
    expect(formatTimeRange('2026-11-03T11:00:00+08:00', '2026-11-03T13:00:00+08:00')).toBe('11:00 AM–1:00 PM');
    expect(formatRange('2026-11-03T09:00:00+08:00', '2026-11-03T11:00:00+08:00')).toBe('Tue, Nov 3 · 9:00–11:00 AM');
  });

  it('computes Manila calendar dates', () => {
    // 2026-11-02T17:00Z is already Nov 3 in Manila
    expect(manilaDateString(0, new Date('2026-11-02T17:00:00Z'))).toBe('2026-11-03');
    expect(manilaDateString(1, new Date('2026-11-02T17:00:00Z'))).toBe('2026-11-04');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(manilaWeekday('2026-11-02T12:00:00+08:00')).toBe(0); // Monday
    expect(manilaWeekday('2026-11-08T12:00:00+08:00')).toBe(6); // Sunday
  });

  it('generates 30-minute start times', () => {
    const opts = timeOptions(30, 8, 10);
    expect(opts.map((o) => o.value)).toEqual(['08:00', '08:30', '09:00', '09:30']);
    expect(opts[2]!.label).toBe('9:00 AM');
    expect(timeOptions(30, 12, 13)[0]!.label).toBe('12:00 PM');
  });
});

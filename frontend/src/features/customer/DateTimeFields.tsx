import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useConfigValues } from '@/api/config';
import { Input, Select } from '@/components/ui/Field';
import {
  addMinutesIso,
  formatTime,
  manilaDateString,
  manilaIso,
  timeOptions,
  timeToMinutes,
} from '@/lib/format';
import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE } from '@/lib/env';

/** Date + start time (30-minute steps from /config/), with the end time derived from the booking block. */
export function DateTimeFields({
  date,
  time,
  onDate,
  onTime,
  dateError,
  timeError,
}: {
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  dateError?: string;
  timeError?: string;
}) {
  const { stepMinutes, blockMinutes } = useConfigValues();
  const today = manilaDateString();
  const options = useMemo(() => {
    const all = timeOptions(stepMinutes, 0, 24);
    if (date !== today) return all;
    const nowMin = timeToMinutes(formatInTimeZone(new Date(), TIMEZONE, 'HH:mm'));
    return all.map((o) => ({ ...o, disabled: timeToMinutes(o.value) <= nowMin }));
  }, [stepMinutes, date, today]);

  const end = date && time ? formatTime(addMinutesIso(manilaIso(date, time), blockMinutes)) : null;
  const hours =
    blockMinutes % 60 === 0
      ? `${blockMinutes / 60} hour${blockMinutes === 60 ? '' : 's'}`
      : `${blockMinutes} minutes`;

  return (
    <div className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Date"
          type="date"
          required
          min={today}
          max={manilaDateString(60)}
          value={date}
          error={dateError}
          onChange={(e) => onDate(e.target.value)}
        />
        <Select
          label="Start time"
          required
          value={time}
          error={timeError}
          placeholder="Choose a time"
          options={options}
          onChange={(e) => onTime(e.target.value)}
        />
      </div>
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Clock className="size-4 text-slate-400" aria-hidden="true" />
        {end ? (
          <span>
            Appointment block: {hours} — ends at <strong className="text-slate-800">{end}</strong> (Philippine
            time)
          </span>
        ) : (
          <span>Each appointment is a {hours} block.</span>
        )}
      </p>
    </div>
  );
}

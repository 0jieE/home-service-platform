import { cn } from '@/lib/cn';
import { formatDateTime, titleCase } from '@/lib/format';
import type { StatusHistoryEntry } from '@/types/api';
import { STATUS_LABEL } from './StatusBadge';

const DOT: Record<string, string> = {
  pending: 'bg-amber-500',
  accepted: 'bg-sky-600',
  in_progress: 'bg-violet-600',
  completed: 'bg-emerald-600',
  declined: 'bg-slate-400',
  cancelled: 'bg-slate-400',
};

/** Vertical timeline from `status_history` (oldest first). History is never deleted. */
export function StatusTimeline({ history }: { history: StatusHistoryEntry[] | undefined }) {
  if (!history?.length) return <p className="text-sm text-slate-500">No status history yet.</p>;
  const sorted = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <ol className="relative space-y-5 border-l-2 border-slate-200 pl-6">
      {sorted.map((h, i) => {
        const same = h.from_status === h.to_status;
        const title = same
          ? h.reason && /complet/i.test(h.reason)
            ? 'Completion requested'
            : `${STATUS_LABEL[h.to_status]} (update)`
          : h.from_status
            ? `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}`
            : `${STATUS_LABEL[h.to_status]}`;
        const actor = h.actor_role === 'system' || !h.actor_name ? titleCase(h.actor_role) : `${h.actor_name} (${h.actor_role})`;
        return (
          <li key={`${h.created_at}-${i}`} className="relative">
            <span
              className={cn(
                'absolute top-1 -left-[31px] size-4 rounded-full border-2 border-white ring-2 ring-slate-200',
                DOT[h.to_status] ?? 'bg-slate-400',
              )}
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            <p className="text-xs text-slate-500">
              {formatDateTime(h.created_at)} · by {actor}
            </p>
            {h.reason && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{h.reason}”</p>}
          </li>
        );
      })}
    </ol>
  );
}

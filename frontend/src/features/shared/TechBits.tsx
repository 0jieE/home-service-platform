import { BadgeCheck, ShieldQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { RatingStars } from '@/components/ui/RatingStars';
import { cn } from '@/lib/cn';
import { ratingDisplay } from '@/lib/format';
import type { CategoryRef, VerificationSummaryItem } from '@/types/api';

export function Specializations({
  items,
  highlightId,
  className,
}: {
  items: CategoryRef[];
  highlightId?: number;
  className?: string;
}) {
  if (!items?.length) return <span className="text-sm text-slate-500">No specializations listed</span>;
  return (
    <span className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((c) => (
        <Badge key={c.id} tone={c.id === highlightId ? 'brand' : 'gray'}>
          {c.name}
        </Badge>
      ))}
    </span>
  );
}

export function RatingLine({
  avg,
  count,
  className,
}: {
  avg: number | null;
  count: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      {count > 0 ? (
        <>
          <RatingStars value={avg ?? 0} />
          <span className="font-medium text-slate-800">{ratingDisplay(avg, count)}</span>
        </>
      ) : (
        <span className="text-slate-500">No ratings yet</span>
      )}
    </span>
  );
}

/** Separate from the score: shows whether the admin verified credentials. */
export function CredentialsBadge({
  items,
  loading,
}: {
  items: VerificationSummaryItem[] | undefined;
  loading?: boolean;
}) {
  if (loading || !items) return null;
  const verified = items.filter((v) => v.outcome === 'verified');
  if (verified.length) {
    return (
      <span title={`Verified: ${verified.map((v) => v.credential_type).join(', ')} — not part of the score`}>
        <Badge tone="green" icon={<BadgeCheck className="size-3.5" />}>
          Credentials verified
        </Badge>
      </span>
    );
  }
  return (
    <span title="No verified credential on record — not part of the score">
      <Badge tone="gray" icon={<ShieldQuestion className="size-3.5" />}>
        No verified credential on record
      </Badge>
    </span>
  );
}

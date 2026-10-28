import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({
  page,
  pageSize = 20,
  count,
  hasNext,
  onChange,
}: {
  page: number;
  pageSize?: number;
  count: number;
  hasNext?: boolean;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const canNext = hasNext ?? page < totalPages;
  if (count <= pageSize && page === 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        icon={<ChevronLeft className="size-4" />}
      >
        Previous
      </Button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages} · {count} total
      </span>
      <Button variant="outline" size="sm" onClick={() => onChange(page + 1)} disabled={!canNext}>
        Next <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

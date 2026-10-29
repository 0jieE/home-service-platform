import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MapPin, Search, Users } from 'lucide-react';
import { useCategories } from '@/api/categories';
import { useTechnicians } from '@/api/technicians';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Instructions, PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { errorMessage } from '@/lib/errors';
import { initials } from '@/lib/format';
import { RatingLine, Specializations } from '@/features/shared/TechBits';

const PAGE_SIZE = 12;

export function TechniciansPage() {
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const category = Number(sp.get('category')) || undefined;
  const ordering = sp.get('ordering') ?? '-rating_avg';
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const categories = useCategories();

  // debounce search → URL
  useEffect(() => {
    const h = setTimeout(() => {
      const next = new URLSearchParams(sp);
      if (search.trim()) next.set('search', search.trim());
      else next.delete('search');
      if ((sp.get('search') ?? '') !== search.trim()) {
        next.delete('page');
        setSp(next, { replace: true });
      }
    }, 350);
    return () => clearTimeout(h);
  }, [search, sp, setSp]);

  const query = useTechnicians({
    category,
    search: sp.get('search') ?? undefined,
    ordering,
    page,
    page_size: PAGE_SIZE,
  });

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSp(next);
  };

  return (
    <div>
      <PageHeader title="Browse technicians" description="All approved technicians with complete profiles." />
      <Instructions title="Tip">
        <p>
          Browsing shows everyone. To see who is <strong>free at a specific time near you</strong>, ranked by
          distance and rating, use{' '}
          <Link to="/c/find" className="font-medium text-brand-700 underline">
            Find
          </Link>
          .
        </p>
      </Instructions>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_180px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-[38px] left-3 size-5 text-slate-400"
            aria-hidden="true"
          />
          <Input
            label="Search"
            type="search"
            placeholder="Name, barangay or skill"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          label="Service"
          value={category ?? ''}
          placeholder="All services"
          options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          onChange={(e) => setParam('category', e.target.value || undefined)}
        />
        <Select
          label="Sort by"
          value={ordering}
          options={[
            { value: '-rating_avg', label: 'Highest rated' },
            { value: '-rating_count', label: 'Most reviewed' },
            { value: '-years_experience', label: 'Most experienced' },
          ]}
          onChange={(e) => setParam('ordering', e.target.value)}
        />
      </div>

      {query.isLoading ? (
        <SkeletonList rows={4} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : !query.data?.results.length ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No technicians match"
          description="Try a different search or service."
          action={
            <ButtonLink to="/c/technicians" variant="outline">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {query.data.results.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/c/technicians/${t.id}`}
                  className="flex h-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800">
                    {initials(t.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{t.full_name}</span>
                    <RatingLine avg={t.rating_avg} count={t.rating_count} className="mt-0.5" />
                    <Specializations items={t.specializations} highlightId={category} className="mt-2" />
                    <span className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin className="size-4 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-1">{t.address || 'Kidapawan City'}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            count={query.data.count}
            hasNext={!!query.data.next}
            onChange={(p) => setParam('page', String(p))}
          />
        </>
      )}
    </div>
  );
}

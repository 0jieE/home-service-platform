import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useRecSettings, useUpdateRecSettings } from '@/api/admin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { Checkbox, FormError, Input } from '@/components/ui/Field';
import { Alert, PageHeader } from '@/components/ui/PageHeader';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { formatDateTime, formatScore } from '@/lib/format';
import { recSettingsSchema, type RecSettingsValues } from '@/types/schemas';
import { scoreBreakdownText } from '@/features/customer/ScoreBreakdown';

export function SettingsPage() {
  const q = useRecSettings();
  const update = useUpdateRecSettings();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RecSettingsValues>({
    resolver: zodResolver(recSettingsSchema),
    defaultValues: { w_p: 0.5, w_r: 0.5, d0_km: 1, no_rating_q: 0.5, is_frozen: false },
  });

  useEffect(() => {
    if (q.data)
      reset({
        w_p: q.data.w_p,
        w_r: q.data.w_r,
        d0_km: q.data.d0_km,
        no_rating_q: q.data.no_rating_q,
        is_frozen: !!q.data.is_frozen,
      });
  }, [q.data, reset]);

  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const s = q.data;
  const frozen = !!s.is_frozen;

  const [wp, wr, d0, nq, freezeNext] = watch(['w_p', 'w_r', 'd0_km', 'no_rating_q', 'is_frozen']);
  const sum = (Number(wp) || 0) + (Number(wr) || 0);
  const sumOk = Math.abs(sum - 1) < 1e-6;
  const unfreezing = frozen && !freezeNext;
  const editable = !frozen || unfreezing;

  // Preview with the Table 3.3 examples.
  const preview = (dKm: number, rating: number | null) => {
    const P = 1 / (1 + dKm / (Number(d0) || 1));
    const Q = rating === null ? Number(nq) || 0 : (rating - 1) / 4;
    return { proximity_score: P, rating_score: Q, score: (Number(wp) || 0) * P + (Number(wr) || 0) * Q };
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const body = frozen && !v.is_frozen ? { is_frozen: false } : v;
      const res = await update.mutateAsync(body);
      toast.success(
        res.is_frozen
          ? `Settings saved and frozen (version ${res.version}).`
          : `Settings saved (version ${res.version}).`,
      );
    } catch (err) {
      setFormError(applyApiErrors(err, setError, ['w_p', 'w_r', 'd0_km', 'no_rating_q', 'is_frozen']));
    }
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recommendation settings"
        description="Weights and constants of the scoring formula. Changes bump the version."
        actions={
          <Badge tone={frozen ? 'green' : 'amber'} icon={frozen ? <Lock className="size-3.5" /> : undefined}>
            Version {s.version} · {frozen ? 'Frozen' : 'Not frozen'}
          </Badge>
        }
      />
      <Alert tone="amber" icon={<TriangleAlert className="size-5" />} title="Freeze before formal evaluation">
        Settings may be tuned during pilot testing only. Freeze them before the formal evaluation so every
        result uses the same version. While frozen, changes are rejected unless you unfreeze first.
      </Alert>
      <Card>
        <CardHeader
          title="Score formula"
          description={
            <span className="font-mono">S = w_p × P + w_r × Q, P = 1 / (1 + d / d0), Q = (r̄ − 1) / 4</span>
          }
        />
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <fieldset disabled={!editable} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
              <Input
                label="Proximity weight (w_p)"
                type="number"
                step="0.01"
                min={0}
                max={1}
                error={errors.w_p?.message}
                {...register('w_p', { valueAsNumber: true })}
              />
              <Input
                label="Rating weight (w_r)"
                type="number"
                step="0.01"
                min={0}
                max={1}
                error={errors.w_r?.message}
                {...register('w_r', { valueAsNumber: true })}
              />
              <p
                className={cn(
                  'text-sm sm:col-span-2',
                  sumOk ? 'text-emerald-700' : 'font-medium text-red-600',
                )}
                aria-live="polite"
              >
                w_p + w_r = {sum.toFixed(2)} {sumOk ? '✓' : '— must equal 1.00'}
              </p>
              <Input
                label="Reference distance d0 (km)"
                type="number"
                step="0.1"
                min={0.1}
                hint="Distance at which proximity = 0.50"
                error={errors.d0_km?.message}
                {...register('d0_km', { valueAsNumber: true })}
              />
              <Input
                label="Rating score when no reviews (Q)"
                type="number"
                step="0.01"
                min={0}
                max={1}
                hint="Neutral default 0.50"
                error={errors.no_rating_q?.message}
                {...register('no_rating_q', { valueAsNumber: true })}
              />
            </fieldset>
            <Checkbox
              label="Frozen"
              description={
                frozen
                  ? 'Uncheck to unfreeze (saving will only unfreeze; then edit and save again).'
                  : 'Check to lock these values for formal evaluation.'
              }
              {...register('is_frozen')}
            />
            <FormError message={formError} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty || (editable && !sumOk)}>
                {unfreezing ? 'Unfreeze' : 'Save settings'}
              </Button>
              {s.updated_at && (
                <span className="text-xs text-slate-500">Last updated {formatDateTime(s.updated_at)}</span>
              )}
            </div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Preview (Table 3.3 examples)"
          description="How the current form values score the paper’s example technicians."
        />
        <CardBody>
          <ul className="space-y-1.5 font-mono text-xs text-slate-700">
            {(
              [
                ['A · 1.00 km · 4.0★', 1, 4],
                ['B · 3.00 km · 5.0★', 3, 5],
                ['C · 0.50 km · no ratings', 0.5, null],
              ] as const
            ).map(([label, d, r]) => {
              const p = preview(d, r);
              return (
                <li key={label}>
                  <span className="font-sans font-medium text-slate-900">{label}:</span>{' '}
                  {scoreBreakdownText(p, { w_p: Number(wp) || 0, w_r: Number(wr) || 0 })}{' '}
                  <span className="sr-only">score {formatScore(p.score)}</span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

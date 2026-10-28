import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { distanceLabel, formatScore, formatTimeRange, ratingDisplay } from '@/lib/format';
import type { RecSettings, RecommendationResult, VerificationSummaryItem } from '@/types/api';
import { CredentialsBadge } from '@/features/shared/TechBits';
import { scoreBreakdownText } from './ScoreBreakdown';

export function CompareModal({
  results,
  settings,
  verification,
  onClose,
  onBook,
}: {
  results: RecommendationResult[];
  settings: RecSettings;
  verification: Record<number, VerificationSummaryItem[] | undefined>;
  onClose: () => void;
  onBook: (r: RecommendationResult) => void;
}) {
  const rows: { label: string; render: (r: RecommendationResult) => React.ReactNode }[] = [
    { label: 'Rank', render: (r) => <span className="text-lg font-bold">#{r.rank}</span> },
    {
      label: 'Overall score',
      render: (r) => <span className="font-semibold tabular-nums">{formatScore(r.score)}</span>,
    },
    { label: 'Distance', render: (r) => distanceLabel(r.distance_km) },
    {
      label: 'Rating',
      render: (r) =>
        r.has_ratings ? ratingDisplay(r.technician.rating_avg, r.technician.rating_count) : 'No ratings yet',
    },
    { label: 'Proximity score', render: (r) => formatScore(r.proximity_score) },
    { label: 'Rating score', render: (r) => formatScore(r.rating_score) },
    {
      label: 'Breakdown',
      render: (r) => <span className="font-mono text-xs">{scoreBreakdownText(r, settings)}</span>,
    },
    { label: 'Specializations', render: (r) => r.technician.specializations.map((s) => s.name).join(', ') },
    {
      label: 'Experience',
      render: (r) => (r.technician.years_experience ? `${r.technician.years_experience} years` : '—'),
    },
    { label: 'Available', render: (r) => formatTimeRange(r.availability.start, r.availability.end) },
    {
      label: 'Credentials (not scored)',
      render: (r) => <CredentialsBadge items={verification[r.technician.id]} />,
    },
    {
      label: '',
      render: (r) => (
        <Button size="sm" onClick={() => onBook(r)}>
          Book {r.technician.full_name.split(' ')[0]}
        </Button>
      ),
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title="Compare technicians"
      description="Side by side. Higher score ranks first; ties go to the nearer technician."
      size="xl"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Comparison of selected technicians</caption>
          <thead>
            <tr>
              <th scope="col" className="w-36 p-2 text-left text-xs font-semibold text-slate-500 uppercase">
                <span className="sr-only">Attribute</span>
              </th>
              {results.map((r) => (
                <th key={r.technician.id} scope="col" className="p-2 text-left text-base font-semibold">
                  {r.technician.full_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i}>
                <th scope="row" className="p-2 text-left align-top text-xs font-medium text-slate-500">
                  {row.label}
                </th>
                {results.map((r) => (
                  <td key={r.technician.id} className="p-2 align-top text-slate-800">
                    {row.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

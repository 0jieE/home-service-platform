import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ScoreBreakdown, scoreBreakdownText } from './ScoreBreakdown';

/** Paper Table 3.3 (d0 = 1 km, w_p = w_r = 0.50), using unrounded inputs as the backend sends them. */
const d0 = 1;
const weights = { w_p: 0.5, w_r: 0.5 };
const P = (d: number) => 1 / (1 + d / d0);
const Q = (r: number | null) => (r === null ? 0.5 : (r - 1) / 4);
const S = (d: number, r: number | null) => weights.w_p * P(d) + weights.w_r * Q(r);

const TABLE = [
  { tech: 'A', d: 1.0, r: 4.0, text: 'Proximity 0.500 × 0.50 + Rating 0.750 × 0.50 = 0.625', score: '0.625' },
  { tech: 'B', d: 3.0, r: 5.0, text: 'Proximity 0.250 × 0.50 + Rating 1.000 × 0.50 = 0.625', score: '0.625' },
  { tech: 'C', d: 0.5, r: null, text: 'Proximity 0.667 × 0.50 + Rating 0.500 × 0.50 = 0.583', score: '0.583' },
] as const;

describe('ScoreBreakdown reproduces Table 3.3', () => {
  it.each(TABLE)('technician $tech', ({ d, r, text }) => {
    const parts = { proximity_score: P(d), rating_score: Q(r), score: S(d, r) };
    expect(scoreBreakdownText(parts, weights)).toBe(text);
  });

  it.each(TABLE)('renders technician $tech score and expandable breakdown', async ({ d, r, text, score }) => {
    const parts = { proximity_score: P(d), rating_score: Q(r), score: S(d, r) };
    render(<ScoreBreakdown parts={parts} weights={weights} distanceKm={d} hasRatings={r !== null} ratingAvg={r} />);
    expect(screen.getByTestId('score-value')).toHaveTextContent(score);
    expect(screen.queryByTestId('score-breakdown')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /why this score/i }));
    expect(screen.getByTestId('score-breakdown')).toHaveTextContent(text);
    if (r === null) expect(screen.getByText(/no ratings yet/i)).toBeInTheDocument();
  });

  it('keeps A and B tied at 0.625 before rounding (tie broken by distance on the server)', () => {
    expect(S(1, 4)).toBeCloseTo(0.625, 12);
    expect(S(3, 5)).toBeCloseTo(0.625, 12);
    expect(S(0.5, null)).toBeCloseTo(0.583333, 5);
  });
});

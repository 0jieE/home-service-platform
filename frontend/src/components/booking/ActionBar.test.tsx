import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '@/lib/queryClient';
import type { Booking, BookingAction } from '@/types/api';
import { ActionBar } from './ActionBar';

function booking(allowed: BookingAction[], status: Booking['status'] = 'pending'): Booking {
  return {
    id: 20,
    status,
    customer: { id: 3, full_name: 'Ana Cruz', phone: '09171234567' },
    technician: { id: 7, full_name: 'Ben Santos', phone: '09181234567' },
    category: {
      id: 3,
      name: 'Plumbing',
      slug: 'plumbing',
      description: '',
      icon: 'droplet',
      is_active: true,
    },
    address: 'Purok 3, Brgy. Lanao',
    location: { lat: 7.0, lng: 125.1 },
    start: '2026-11-03T09:00:00+08:00',
    end: '2026-11-03T11:00:00+08:00',
    notes: '',
    distance_km: 2.41,
    completion_requested_at: null,
    completed_at: null,
    confirmed_by: null,
    cancellation_reason: null,
    cancelled_by_role: null,
    decline_reason: null,
    conflicts_with_reserved: false,
    dispute: null,
    review: null,
    allowed_actions: allowed,
    created_at: '2026-11-01T08:00:00+08:00',
    updated_at: '2026-11-01T08:00:00+08:00',
  };
}

function renderBar(b: Booking) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ActionBar booking={b} />
    </QueryClientProvider>,
  );
}

const actionsShown = () =>
  Array.from(document.querySelectorAll('[data-action]')).map((el) => el.getAttribute('data-action'));

describe('ActionBar', () => {
  it('renders only the allowed actions', () => {
    renderBar(booking(['accept', 'decline']));
    expect(actionsShown().sort()).toEqual(['accept', 'decline']);
    expect(screen.queryByRole('button', { name: /start work/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel booking/i })).not.toBeInTheDocument();
  });

  it('renders nothing when no actions are allowed', () => {
    const { container } = renderBar(booking([]));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows every allowed action and nothing else', () => {
    const all: BookingAction[] = ['cancel', 'confirm_completion', 'dispute', 'review'];
    renderBar(booking(all, 'in_progress'));
    expect(actionsShown().sort()).toEqual([...all].sort());
  });

  it('ignores unknown action strings', () => {
    renderBar(booking(['start', 'teleport' as BookingAction], 'accepted'));
    expect(actionsShown()).toEqual(['start']);
  });

  it('requires a reason to cancel an accepted booking', async () => {
    renderBar(booking(['cancel'], 'accepted'));
    await userEvent.click(screen.getByRole('button', { name: /cancel booking/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^cancel booking$/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/reason/i);
  });

  it('opens a confirm dialog for each action', async () => {
    renderBar(booking(['start'], 'accepted'));
    await userEvent.click(screen.getByRole('button', { name: /start work/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/start this job now/i);
  });
});

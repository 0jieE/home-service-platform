import { expect, test } from '@playwright/test';
import {
  API,
  apiGet,
  apiToken,
  login,
  manila,
  newLoggedInPage,
  search,
  SEED,
  technicianEmail,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('customer finds Plumbing for tomorrow 9:00, books, technician accepts → live toast, then customer cancels', async ({
  page,
  browser,
  request,
}) => {
  const adminToken = await apiToken(request, SEED.admin.email, SEED.admin.password);
  await login(page, SEED.customer.email, SEED.customer.password);
  const tomorrow = manila(24 * 60).date;

  await search(page, 'Plumbing', tomorrow, '09:00');
  const first = page.locator('article[aria-label^="Rank 1:"]');
  await expect(first).toBeVisible();
  await expect(first).toContainText('(straight-line)');
  await first.getByRole('button', { name: /why this score/i }).click();
  await expect(first.getByTestId('score-breakdown')).toContainText(
    /Proximity \d\.\d{3} × 0\.50 \+ Rating \d\.\d{3} × 0\.50 = \d\.\d{3}/,
  );
  const techName = (await first.getAttribute('aria-label'))!.replace(/^Rank 1: /, '');

  await first.getByRole('button', { name: 'Book' }).click();
  await page.getByLabel('Notes for the technician (optional)').fill('E2E: leaking pipe');
  await page.getByRole('button', { name: 'Send booking request' }).click();
  await expect(page).toHaveURL(/\/c\/bookings\/\d+$/);
  const bookingId = Number(page.url().split('/').pop());
  await expect(page.getByText('Waiting for the technician')).toBeVisible();

  // Technician accepts in a separate browser session.
  const techPage = await newLoggedInPage(
    browser,
    await technicianEmail(request, adminToken, techName),
    'Tech123!',
  );
  await techPage.goto(`/t/jobs/${bookingId}`);
  await techPage.getByRole('button', { name: 'Accept request' }).click();
  await techPage.getByRole('dialog').getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(techPage.getByText('Upcoming job')).toBeVisible();

  // Customer sees the realtime toast and the new status without reloading.
  await expect(page.getByText(new RegExp(`${techName} accepted your Plumbing request`))).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Accepted — your time is reserved')).toBeVisible();

  // Clean up: cancelling an accepted booking requires a reason.
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/reason/i);
  await dialog.getByLabel('Reason').fill('E2E cleanup — schedule changed');
  await dialog.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText('Cancelled').first()).toBeVisible();
  await techPage.context().close();
});

test('full lifecycle: book → accept → start → request completion → confirm → review → rating updates', async ({
  page,
  browser,
  request,
}) => {
  // Start is allowed only ≤ 60 min before the appointment, so book the next 30-minute step from now.
  const techToken = await apiToken(request, SEED.tech1.email, SEED.tech1.password);
  const me = await apiGet<{ full_name: string; specializations: { name: string }[]; rating_count: number }>(
    request,
    techToken,
    '/technicians/me/',
  );
  const category = me.specializations[0]!.name;
  const now = Date.now();
  const step = 30 * 60_000;
  const startMs = Math.ceil((now + 5 * 60_000) / step) * step;
  const slotStart = new Date(Math.floor(now / step) * step);
  const slotEnd = new Date(startMs + 4 * 60 * 60_000);
  // Ensure an available slot covers the appointment (409/400 when one already overlaps is fine).
  await request.post(`${API}/technicians/me/availability/`, {
    headers: { Authorization: `Bearer ${techToken}` },
    data: { start: slotStart.toISOString(), end: slotEnd.toISOString(), state: 'available' },
  });
  const { date, time } = manila((startMs - now) / 60_000);

  // Clear leftovers of earlier runs that would reserve this time (accepted / in progress with tech1).
  const custToken = await apiToken(request, SEED.customer.email, SEED.customer.password);
  const active = await apiGet<{
    results: { id: number; technician: { full_name: string }; allowed_actions: string[] }[];
  }>(request, custToken, '/bookings/?status=accepted&status=in_progress&status=pending&page_size=100');
  for (const b of active.results.filter((x) => x.technician.full_name === me.full_name)) {
    const action = b.allowed_actions.includes('confirm_completion')
      ? 'confirm-completion'
      : b.allowed_actions.includes('cancel')
        ? 'cancel'
        : null;
    if (action)
      await request.post(`${API}/bookings/${b.id}/${action}/`, {
        headers: { Authorization: `Bearer ${custToken}` },
        data: { reason: 'E2E cleanup of an earlier run' },
      });
  }

  await login(page, SEED.customer.email, SEED.customer.password);
  await search(page, category, date, time);
  const card = page.locator(`article[aria-label$=": ${me.full_name}"]`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Book' }).click();
  await page.getByRole('button', { name: 'Send booking request' }).click();
  await expect(page).toHaveURL(/\/c\/bookings\/\d+$/);
  const bookingId = Number(page.url().split('/').pop());

  const techPage = await newLoggedInPage(browser, SEED.tech1.email, SEED.tech1.password);
  await techPage.goto('/t/requests');
  const req = techPage.locator('li', { hasText: `Request #${bookingId}` });
  await req.getByRole('button', { name: 'Accept request' }).click();
  await techPage.getByRole('dialog').getByRole('button', { name: 'Accept', exact: true }).click();
  await techPage.goto(`/t/jobs/${bookingId}`);
  await techPage.getByRole('button', { name: 'Start work' }).click();
  await techPage.getByRole('dialog').getByRole('button', { name: 'Start work' }).click();
  await expect(techPage.getByText('When the work is done, request completion confirmation')).toBeVisible();
  await techPage.getByRole('button', { name: 'Request completion confirmation' }).click();
  await techPage
    .getByRole('dialog')
    .getByLabel(/Notes for the customer/)
    .fill('Cleaned filters, re-gassed');
  await techPage.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
  await expect(techPage.getByText('Waiting for customer confirmation')).toBeVisible();

  // Customer: live update → confirm → review
  await expect(page.getByText('Please confirm completion', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Confirm job completed' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, it is completed' }).click();
  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Write a review' }).click();
  const review = page.getByRole('dialog');
  await review.getByRole('button', { name: 'Post review' }).click();
  await expect(review.getByRole('alert').first()).toContainText(/rating/i);
  await review.getByRole('radio', { name: /^5 stars/ }).click();
  await review.getByLabel('Comment (optional)').fill('E2E: quick and tidy');
  await review.getByRole('button', { name: 'Post review' }).click();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  await expect(page.getByText('E2E: quick and tidy')).toBeVisible();

  const after = await apiGet<{ rating_count: number }>(request, techToken, '/technicians/me/');
  expect(after.rating_count).toBe(me.rating_count + 1);
  await techPage.context().close();
});

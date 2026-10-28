import { expect, test } from '@playwright/test';
import { login, manila, SEED } from './helpers';

test('admin records application → verification → approve → account; technician activates and logs in', async ({
  page,
  browser,
}) => {
  const email = `e2e.tech.${Date.now()}@demo.local`;
  await login(page, SEED.admin.email, SEED.admin.password);
  await page.goto('/a/applications');
  await page.getByRole('button', { name: 'Record application' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel('First name').fill('Eddie');
  await form.getByLabel('Last name').fill('Tester');
  await form.getByLabel(/^Email/).fill(email);
  await form.getByLabel('Mobile number').fill('09171112222');
  await form.getByLabel('Address').fill('Brgy. Poblacion, Kidapawan City');
  await form.getByLabel('Plumbing').check();
  await form.getByRole('button', { name: 'Save application' }).click();
  await expect(page).toHaveURL(/\/a\/applications\/\d+$/);

  await page.getByRole('button', { name: 'Add verification record' }).click();
  const v = page.getByRole('dialog');
  await v.getByLabel('Credential type').fill('TESDA Plumbing NC II');
  await v.getByLabel('Verification method').selectOption('official_portal');
  await v.getByLabel('Outcome').selectOption('verified');
  await v.getByLabel('Date checked').fill(manila().date);
  await v.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByText('TESDA Plumbing NC II')).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved — create the technician account')).toBeVisible();

  await page.getByRole('button', { name: 'Create technician account' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create account' }).click();
  const code = (await page.getByRole('dialog').getByLabel('Activation code').textContent())!.trim();
  expect(code.length).toBeGreaterThan(4);
  await page.getByRole('button', { name: 'I have given the code to the technician' }).click();
  await expect(page.getByText('Technician account created', { exact: true })).toBeVisible();

  // Technician activates in a fresh session.
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const tech = await ctx.newPage();
  await tech.goto('/activate');
  await tech.getByLabel(/^Email/).fill(email);
  await tech.getByLabel('Activation code').fill(code);
  await tech.getByLabel(/^New password/).fill('NewTech123!');
  await tech.getByLabel('Confirm new password').fill('NewTech123!');
  await tech.getByRole('button', { name: 'Activate account' }).click();
  await expect(tech.getByText('Your technician account is active')).toBeVisible();
  await tech.getByLabel(/^Email/).fill(email);
  await tech.getByLabel(/^Password/).fill('NewTech123!');
  await tech.getByRole('button', { name: 'Log in' }).click();
  await expect(tech).toHaveURL(/\/t\/dashboard$/);
  await expect(tech.getByText(/profile is incomplete/i)).toBeVisible();
  await ctx.close();
});

test('admin resolves an open dispute and the dashboard charts render', async ({ page }) => {
  await login(page, SEED.admin.email, SEED.admin.password);
  await page.goto('/a/dashboard');
  await expect(page.locator('.recharts-surface')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Top technicians' })).toBeVisible();

  await page.goto('/a/disputes');
  await expect(
    page.getByRole('button', { name: 'Resolve' }).first().or(page.getByText('No open disputes')),
  ).toBeVisible();
  const resolve = page.getByRole('button', { name: 'Resolve' }).first();
  test.skip((await resolve.count()) === 0, 'No open dispute left (seed already resolved) — re-run seed_demo');
  const before = await page.getByRole('button', { name: 'Resolve' }).count();
  await resolve.click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Decision').selectOption('completed');
  await d.getByLabel('Administrator notes').fill('E2E: photos confirm the leak was fixed.');
  await d.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText(/Dispute resolved/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resolve' })).toHaveCount(before - 1);
});

import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api';

export const SEED = {
  admin: { email: 'admin@demo.local', password: 'Admin123!' },
  customer: { email: 'customer@demo.local', password: 'Customer123!' },
  tech1: { email: 'tech1@demo.local', password: 'Tech123!' },
};

/** yyyy-MM-dd / HH:mm in Asia/Manila, offset by minutes from now. */
export function manila(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date, time };
}

export async function apiToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/auth/token/`, { data: { email, password } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return (await res.json()).access;
}

export async function apiGet<T = unknown>(
  request: APIRequestContext,
  token: string,
  path: string,
): Promise<T> {
  const res = await request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok(), `GET ${path} → ${res.status()}`).toBeTruthy();
  return res.json();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function newLoggedInPage(browser: Browser, email: string, password: string) {
  const ctx = await browser.newContext({
    baseURL: 'http://localhost:5173',
    timezoneId: 'Asia/Manila',
    geolocation: { latitude: 7.0083, longitude: 125.0894 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await login(page, email, password);
  return page;
}

/** Looks up a technician's login email by name (admin API). */
export async function technicianEmail(request: APIRequestContext, adminToken: string, fullName: string) {
  const data = await apiGet<{ results: { email: string; full_name: string }[] }>(
    request,
    adminToken,
    `/admin/users/?role=technician&search=${encodeURIComponent(fullName.split(' ')[0]!)}`,
  );
  const hit = data.results.find((u) => u.full_name === fullName);
  expect(hit, `technician ${fullName}`).toBeTruthy();
  return hit!.email;
}

/** Customer: run a search on /c/find. */
export async function search(page: Page, category: string, date: string, time: string) {
  await page.goto('/c/find');
  await page.getByRole('radio', { name: category }).click();
  // location is prefilled from the customer's profile default
  await expect(page.getByText('Inside Kidapawan City coverage')).toBeVisible();
  await page.getByLabel('Date').fill(date);
  await page.getByLabel('Start time').selectOption(time);
  await page.getByRole('button', { name: 'Show recommended technicians' }).click();
}

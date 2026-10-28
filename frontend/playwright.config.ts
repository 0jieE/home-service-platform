import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests. They need the backend running and seeded
 * (`docker compose up -d` + `python manage.py seed_demo`); the dev server is started automatically.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    geolocation: { latitude: 7.0083, longitude: 125.0894 },
    permissions: ['geolocation'],
    timezoneId: 'Asia/Manila',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

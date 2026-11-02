import { defineConfig, devices } from '@playwright/test';

const isolated = !!process.env['E2E_API_TARGET'];
const port = process.env['E2E_PORT'] || (isolated ? '4201' : '4200');
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: isolated
      ? `npm exec ng -- serve --host localhost --port ${port} --proxy-config src/proxy.e2e.cjs`
      : 'npm run start',
    url: baseURL,
    reuseExistingServer: !process.env['CI'] && !isolated,
    timeout: 120_000,
  },
});

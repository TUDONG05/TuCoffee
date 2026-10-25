import { expect, test } from '@playwright/test';

test('real backend and database respond through the Angular proxy', async ({ page }) => {
  await page.goto('/dev/status');
  await expect(page.getByRole('heading', { name: 'Kết nối thành công' })).toBeVisible({ timeout: 15_000 });
  const health = await page.request.get('/api/v1/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'UP' });
});

test('an unavailable backend shows a recoverable failure', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'DOWN' }),
  }));
  await page.goto('/dev/status');
  await expect(page.getByRole('heading', { name: 'Hệ thống chưa sẵn sàng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kiểm tra lại' })).toBeEnabled();
});

test('home remains usable on a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Một tách cà phê.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Dành cho phát triển · Kiểm tra kết nối' }).click();
  await expect(page).toHaveURL(/\/dev\/status$/);
});

import { expect, test } from '@playwright/test';

test('customer claims a promotion and sees it in their wallet', async ({ page }) => {
  const voucher = {
    id: 7, code: 'TUCOFFEE10', title: 'Giảm 10% cho khách', description: '',
    kind: 'PERCENT', amount: 10, minSubtotal: 0, maxDiscount: null,
    startsAt: '2020-01-01T00:00:00Z', endsAt: '2090-01-01T00:00:00Z',
    enabled: true, remaining: 1, selfClaim: true,
  };
  let claimed = false;
  await page.route('**/api/v1/auth/**', route => route.fulfill({ json: route.request().url().endsWith('/refresh') ? {
    accessToken: 'test-token', expiresIn: 900,
    user: { id: 2, name: 'Khách thử', email: 'buyer@example.test', role: 'USER', active: true },
  } : {} }));
  await page.route('**/api/v1/promotions', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/users/me/promotions', route => route.fulfill({ json: [voucher] }));
  await page.route('**/api/v1/users/me/vouchers', route => route.fulfill({ json: claimed ? [voucher] : [] }));
  await page.route('**/api/v1/users/me/vouchers/7/claim', route => {
    expect(route.request().method()).toBe('POST');
    claimed = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/khuyen-mai');
  await expect(page.getByRole('link', { name: 'Xem voucher của tôi' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Nhận voucher' }).click();
  await expect(page.getByRole('button', { name: 'Đã nhận' })).toBeDisabled();
  await page.goto('/voucher-cua-toi');
  await expect(page.getByText('TUCOFFEE10', { exact: true })).toBeVisible();
});

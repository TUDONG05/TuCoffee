import { expect, test } from '@playwright/test';

for (const width of [360, 1280]) {
  test(`guest uses the chat widget at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    let attempts = 0;
    let csrfCalls = 0;
    await page.route('**/api/v1/auth/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/csrf')) csrfCalls++;
      await route.fulfill({ status: path.endsWith('/refresh') ? 401 : 200, json: {} });
    });
    await page.route('**/api/v1/chat/config', route => route.fulfill({ json: { enabled: true } }));
    await page.route('**/api/v1/chat/messages', async route => {
      const request = route.request();
      expect(request.headers()['authorization']).toBeUndefined();
      expect(request.postDataJSON()).toEqual({ question: 'Gợi ý cà phê sữa', context: [] });
      expect(csrfCalls).toBeGreaterThan(0);
      if (++attempts === 1) {
        await route.fulfill({ status: 503, json: { code: 'CHAT_UNAVAILABLE' } });
        return;
      }
      await route.fulfill({ json: {
        answer: 'Bạn có thể thử cà phê sữa. <b>Thẻ được hiển thị dạng văn bản</b>',
        citations: [{ documentId: 7, title: 'Hướng dẫn chọn món', page: 2, section: 'Cà phê' }],
        products: [{ id: 11, name: 'Cà phê sữa', priceVnd: 35_000, imageUrl: null }],
        insufficientData: false,
      } });
    });
    await page.goto('/');
    const launch = page.getByRole('button', { name: 'Mở tư vấn TuCoffee' });
    await launch.click();
    const dialog = page.getByRole('dialog', { name: 'Tư vấn TuCoffee' });
    const question = dialog.getByRole('textbox', { name: 'Câu hỏi của bạn' });
    await expect(question).toBeFocused();
    await question.fill('Gợi ý cà phê sữa');
    await question.press('Enter');
    await expect(dialog.getByRole('alert')).toContainText('Bạn có thể thử gửi lại câu hỏi');
    await expect(question).toHaveValue('Gợi ý cà phê sữa');
    await dialog.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(dialog.getByText('Hướng dẫn chọn món · trang 2 · Cà phê')).toBeVisible();
    await expect(dialog.getByText(/<b>Thẻ được hiển thị dạng văn bản<\/b>/)).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Cà phê sữa/ })).toHaveAttribute('href', '/products/11');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await question.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(launch).toBeFocused();
    await launch.click();
    await expect(dialog.getByText(/Hướng dẫn chọn món/)).toBeVisible();
    await dialog.getByRole('link', { name: /Cà phê sữa/ }).click();
    await expect(page).toHaveURL(/\/products\/11$/);
  });
}

test('admin always sees no customer chatbot and a disabled flag hides it on public pages', async ({ page }) => {
  let configRequests = 0;
  await page.route('**/api/v1/auth/**', async route => {
    await route.fulfill({ json: route.request().url().endsWith('/refresh') ? {
      accessToken: 'test-token',
      expiresIn: 900,
      user: { id: 1, name: 'Quản trị', email: 'admin@example.test', role: 'ADMIN', active: true },
    } : {} });
  });
  await page.route('**/api/v1/chat/config', async route => {
    configRequests++;
    await route.fulfill({ json: { enabled: false } });
  });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('link', { name: 'Tài liệu tri thức' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở tư vấn TuCoffee' })).toHaveCount(0);
  expect(configRequests).toBe(0);
  const config = page.waitForResponse('**/api/v1/chat/config');
  await page.goto('/');
  await config;
  await expect(page.getByRole('button', { name: 'Mở tư vấn TuCoffee' })).toHaveCount(0);
});

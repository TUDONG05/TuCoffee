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
    await expect(dialog.getByText(/<b>Thẻ được hiển thị dạng văn bản<\/b>/)).toBeVisible();
    await expect(dialog.getByText('Nguồn tham khảo', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Hướng dẫn chọn món', { exact: false })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: /Cà phê sữa/ })).toHaveAttribute('href', '/products/11');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await question.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(launch).toBeFocused();
    await launch.click();
    await expect(dialog.getByText(/<b>Thẻ được hiển thị dạng văn bản<\/b>/)).toBeVisible();
    await dialog.getByRole('link', { name: /Cà phê sữa/ }).click();
    await expect(page).toHaveURL(/\/products\/11$/);
  });
}

test('customer confirms cart and places an order from chat', async ({ page }) => {
  const product = { id: 11, name: 'Cà phê sữa', priceVnd: 35_000, imageUrl: null };
  const orderKeys: string[] = [];
  await page.route('**/api/v1/auth/**', route => route.fulfill({ json: route.request().url().endsWith('/refresh') ? {
    accessToken: 'test-token', expiresIn: 900,
    user: { id: 1, name: 'Khách thử', email: 'buyer@example.test', role: 'CUSTOMER', active: true },
  } : {} }));
  await page.route('**/api/v1/chat/config', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/v1/chat/messages', route => route.fulfill({ json: {
    answer: 'Bạn muốn thêm hai ly cà phê sữa.', citations: [], products: [product],
    insufficientData: false, cartProposal: { productId: 11, quantity: 2 },
  } }));
  await page.route('**/api/v1/products/11', route => route.fulfill({ json: product }));
  await page.route('**/api/v1/users/me/vouchers', route => route.fulfill({ json: [{
    id: 7, code: 'SAVE10', title: 'Giảm 10.000 ₫', enabled: true, remaining: 1,
    startsAt: '2020-01-01T00:00:00Z', endsAt: '2090-01-01T00:00:00Z',
  }] }));
  await page.route('**/api/v1/users/me/vouchers/quote', async route => {
    expect(route.request().postDataJSON()).toEqual({
      voucherId: 7, items: [{ productId: 11, quantity: 2, expectedPriceVnd: 35_000 }],
    });
    await route.fulfill({ json: { voucherId: 7, code: 'SAVE10', subtotalVnd: 70_000, discountVnd: 10_000, totalVnd: 60_000 } });
  });
  await page.route('**/api/v1/orders', async route => {
    orderKeys.push(route.request().headers()['idempotency-key']);
    expect(route.request().postDataJSON()).toMatchObject({
      items: [{ productId: 11, quantity: 2, expectedPriceVnd: 35_000 }],
      customerPhone: '0912345678', customerAddress: '123 Đường thử', paymentMethod: 'QR_TRANSFER',
      voucherId: 7, expectedTotalVnd: 60_000,
    });
    await route.fulfill(orderKeys.length === 1
      ? { status: 503, json: { detail: 'Vui lòng thử lại.' } }
      : { status: 201, json: { id: 456, publicCode: 'TC456', payment: { method: 'QR_TRANSFER' } } });
  });
  await page.route('**/api/v1/orders/456/payment-instructions', route => route.fulfill({ json: {
    method: 'QR_TRANSFER', status: 'UNPAID', amountVnd: 60_000, transferContent: 'TC456', qrUrl: '/logo.png',
  } }));
  await page.route('**/api/v1/orders/456', route => route.fulfill({ json: {
    id: 456, publicCode: 'TC456', status: 'CONFIRMED', payment: { method: 'QR_TRANSFER', status: 'PAID' },
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Mở tư vấn TuCoffee' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tư vấn TuCoffee' });
  const question = dialog.getByRole('textbox', { name: 'Câu hỏi của bạn' });
  await question.fill('Thêm 2 cà phê sữa');
  await question.press('Enter');
  const add = dialog.getByRole('button', { name: 'Thêm 2 × Cà phê sữa vào giỏ' });
  await expect(dialog.getByRole('button', { name: /Đặt đơn/ })).toHaveCount(0);
  await add.click();
  await expect(add).toBeDisabled();
  await dialog.getByRole('button', { name: 'Đặt đơn · 2 món' }).click();
  expect(orderKeys).toHaveLength(0);
  await dialog.getByLabel(/Họ và tên người nhận/).fill('Khách thử');
  await dialog.getByLabel(/Số điện thoại liên hệ/).fill('0912345678');
  await dialog.getByLabel(/Địa chỉ giao hàng/).fill('123 Đường thử');
  await dialog.getByLabel('Chọn voucher').selectOption('7');
  await expect(dialog.getByText('Giảm voucher', { exact: true })).toBeVisible();
  const confirm = dialog.getByRole('button', { name: /Xác nhận đặt đơn/ });
  await confirm.click();
  await expect(dialog.getByText('Vui lòng thử lại.')).toBeVisible();
  await confirm.click();
  await expect(dialog.getByRole('img', { name: 'Mã VietQR thanh toán đơn hàng' })).toBeVisible();
  await expect(dialog.getByText('Chờ thanh toán', { exact: true })).toBeVisible();
  await expect(dialog.getByText('✓ Thanh toán thành công', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Mã VietQR thanh toán đơn hàng' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Xem chi tiết đơn' })).toHaveAttribute('href', '/orders/456');
  await expect(page).toHaveURL(/\/$/);
  expect(orderKeys).toHaveLength(2);
  expect(orderKeys[0]).toBeTruthy();
  expect(orderKeys[1]).toBe(orderKeys[0]);
});

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

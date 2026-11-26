import { expect, test } from '@playwright/test';

test('a guest asks Gemini about a published document and a current catalog product', async ({ page, browser, baseURL }) => {
  const adminEmail = process.env['E2E_ADMIN_EMAIL'];
  const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
  test.skip(process.env['E2E_CHAT_LIVE'] !== 'true' || !adminEmail || !adminPassword,
    'Requires an isolated admin fixture and a configured Gemini provider.');
  test.setTimeout(100_000);

  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(adminEmail!);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(adminPassword!);
  await page.locator('main').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto('/admin/knowledge');
  await page.getByRole('button', { name: 'Tải lên', exact: true }).click();
  const upload = page.getByRole('dialog');
  const filename = 'chinh-sach-giao-hang-demo.txt';
  await upload.getByLabel(/^Tệp TXT/).setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from('Chính sách giao hàng demo của TuCoffee. Phí giao hàng khu vực Đồi Mây là 17.000 đồng mỗi đơn.'),
  });
  await upload.getByRole('button', { name: 'Tải lên', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: filename });
  await expect(row.getByText('Sẵn sàng', { exact: true })).toBeVisible({ timeout: 25_000 });
  await row.getByRole('button', { name: 'Bật nguồn', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bật nguồn', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Tắt nguồn', exact: true })).toBeVisible();

  const guest = await browser.newPage({ baseURL });
  try {
    const response = await guest.request.get('/api/v1/products?size=1');
    expect(response.ok()).toBeTruthy();
    const { items: [product] } = await response.json();
    await guest.goto('/');
    await guest.getByRole('button', { name: 'Mở tư vấn TuCoffee' }).click();
    const dialog = guest.getByRole('dialog', { name: 'Tư vấn TuCoffee' });
    const input = dialog.getByRole('textbox', { name: 'Câu hỏi của bạn' });
    await input.fill('Theo chính sách giao hàng demo của TuCoffee, phí giao hàng khu vực Đồi Mây là bao nhiêu?');
    await dialog.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(dialog.getByText(filename, { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('log').getByText(/17[., ]?000/)).toBeVisible();
    await input.fill(`Tư vấn món ${product.name}. Món này giá bao nhiêu?`);
    await dialog.getByRole('button', { name: 'Gửi', exact: true }).click();
    const card = dialog.getByRole('link', { name: new RegExp(product.name, 'i') });
    await expect(card).toHaveAttribute('href', `/products/${product.id}`, { timeout: 30_000 });
  } finally {
    await guest.close();
  }
});

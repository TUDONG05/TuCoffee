import { expect, test } from '@playwright/test';

test('admin uploads and deletes a document through the real backend', async ({ page }) => {
  const email = process.env['E2E_ADMIN_EMAIL'];
  const password = process.env['E2E_ADMIN_PASSWORD'];
  test.skip(process.env['E2E_RAG_LIVE'] !== 'true' || !email || !password,
    'Requires a dedicated backend and admin test fixture.');

  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email!);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(password!);
  await page.locator('main').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto('/admin/knowledge');

  const filename = 'menu-' + Date.now() + '.txt';
  await page.getByRole('button', { name: 'Tải lên', exact: true }).click();
  const uploadDialog = page.getByRole('dialog');
  await uploadDialog.getByLabel(/^Tệp TXT/).setInputFiles({
    name: filename, mimeType: 'text/plain', buffer: Buffer.from('Cà phê sữa'),
  });
  await uploadDialog.getByRole('button', { name: 'Tải lên', exact: true }).click();
  await expect(page.getByText('Đã tải lên và xếp hàng xử lý tài liệu.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: filename });
  await expect(row.getByText('Sẵn sàng', { exact: true })).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Cà phê sữa')).toBeVisible();
  await page.keyboard.press('Escape');
  await row.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page.getByText('Đã xóa tài liệu.')).toBeVisible();
});

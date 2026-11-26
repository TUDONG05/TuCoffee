import { expect, test } from '@playwright/test';

const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.test`;
const password = 'E2e-strong-password-2026';

test('register, login, edit profile, restore session and logout with real backend', async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await page.goto('/register');
  await page.getByLabel('Họ và tên').fill('Khách Kiểm Tra');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(password);
  await page.locator('main').getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
  await expect(
    page.getByText('Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.'),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(password);
  await page.locator('main').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel('Họ và tên').fill('Khách Đã Cập Nhật');
  await page.getByLabel('Số điện thoại').fill('0912345678');
  await page.getByLabel('Địa chỉ').fill('25 Nguyễn Huệ, TP. Hồ Chí Minh');
  await page.getByRole('button', { name: 'Lưu thông tin' }).click();
  await expect(page.getByText('Đã lưu thông tin cá nhân.')).toBeVisible();
  const secondTab = await context.newPage();
  await Promise.all([page.reload(), secondTab.goto('/profile')]);
  await expect(page.getByLabel('Họ và tên')).toHaveValue('Khách Đã Cập Nhật');
  await expect(secondTab.getByLabel('Họ và tên')).toHaveValue('Khách Đã Cập Nhật');
  expect(
    await page.evaluate(
      () => Object.keys(localStorage).length + Object.keys(sessionStorage).length,
    ),
  ).toBe(0);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/profile\?denied=1/);
  await expect(page.getByText('Bạn không có quyền truy cập trang quản trị.')).toBeVisible();
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(secondTab.getByRole('link', { name: 'Đăng nhập lại', exact: true })).toBeVisible();
  await secondTab.close();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fprofile/);
});

test('anonymous guard preserves a safe local return path', async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fadmin%2Fusers/);
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
});

test('password change keeps current session and accepts the new password', async ({ page }) => {
  const email = uniqueEmail();
  await page.goto('/register');
  await page.getByLabel('Họ và tên').fill('Khách Bảo Mật');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(password);
  await page.locator('main').getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(password);
  await page.locator('main').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel('Mật khẩu hiện tại').fill(password);
  await page.getByLabel(/^Mật khẩu mới\s*\*?$/).fill(`${password}-new`);
  await page.getByLabel('Xác nhận mật khẩu mới').fill(`${password}-new`);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(
    page.getByText('Đã đổi mật khẩu. Các phiên đăng nhập khác đã kết thúc.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Thông tin cá nhân', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(`${password}-new`);
  await page.locator('main').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
});

test('admin can search, lock and unlock an isolated test customer', async ({ page }) => {
  const adminEmail = process.env['E2E_ADMIN_EMAIL'];
  const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
  test.skip(
    !adminEmail || !adminPassword,
    'Requires an explicitly bootstrapped test admin fixture.',
  );
  const email = uniqueEmail();
  await page.goto('/register');
  await page.getByLabel('Họ và tên').fill('Khách Quản Trị');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(password);
  await page.locator('main').getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(adminEmail!);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(adminPassword!);
  await page.locator('main').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
  await page.getByRole('link', { name: 'Quản trị', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.locator('.admin-sidebar').getByRole('link', { name: 'Quản lý tài khoản', exact: true }).click();
  await page.getByLabel('Tên hoặc email').fill(email);
  await page.getByRole('button', { name: 'Tìm kiếm' }).click();
  await expect(page.getByText('1 tài khoản', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Khóa ${email}`, exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  const customer = page.getByRole('row').filter({ hasText: email });
  await expect(customer).toContainText('Đã khóa');
  await page.getByRole('button', { name: `Mở khóa ${email}`, exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(customer).toContainText('Hoạt động');
});

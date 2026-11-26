import { expect, test } from '@playwright/test';

// UI behavior with mocked auth responses; never creates accounts in the local database.
for (const width of [1280, 360]) {
  test(`authentication stays over the current page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route('**/api/v1/auth/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/refresh')) return route.fulfill({ status: 401, json: {} });
      if (path.endsWith('/turnstile/config'))
        return route.fulfill({ json: { enabled: false, siteKey: null } });
      if (path.endsWith('/google/config')) return route.fulfill({ json: { enabled: false } });
      if (path.endsWith('/login'))
        return route.fulfill({
          json: {
            accessToken: 'test-token',
            expiresIn: 900,
            user: {
              id: 1,
              name: 'Khách thử',
              email: 'modal@example.test',
              role: 'USER',
              active: true,
              phone: null,
              address: null,
            },
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto('/');
    const url = page.url();
    const trigger = page.getByRole('button', { name: 'Đăng nhập', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(url);
    await dialog.getByRole('tab', { name: 'Đăng ký', exact: true }).click();
    await expect(dialog.getByLabel('Họ và tên')).toBeVisible();
    await dialog.getByRole('tab', { name: 'Đăng nhập', exact: true }).click();
    await expect(dialog.getByLabel('Họ và tên')).toHaveCount(0);
    await expect(page).toHaveURL(url);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(dialog.getByLabel('Họ và tên')).toBeVisible();
    await dialog.getByLabel('Họ và tên').fill('Khách thử');
    await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('modal@example.test');
    await dialog.getByLabel(/^Mật khẩu\s*\*?$/).fill('Modal-password-2026');
    await dialog.getByRole('button', { name: /Tạo tài khoản/ }).click();
    await expect(
      dialog.getByText('Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.'),
    ).toBeVisible();
    await expect(page).toHaveURL(url);
    await expect(dialog.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('modal@example.test');
    await dialog.getByLabel(/^Mật khẩu\s*\*?$/).fill('Modal-password-2026');
    await dialog.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(url);
    const account = page.getByRole('button', { name: 'Mở menu tài khoản', exact: true });
    await expect(account).toBeVisible();
    await account.click();
    await expect(page.getByRole('link', { name: 'Tài khoản', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Tài khoản', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });
}

test('Turnstile gates email login, sends its token and resets after an attempt', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const target = window as unknown as {
      turnstile: unknown;
      solve: () => void;
      expire: () => void;
      resetCount: number;
    };
    target.resetCount = 0;
    target.turnstile = {
      render: (host: HTMLElement, options: Record<string, Function>) => {
        host.textContent = 'Xác minh kiểm thử';
        target.solve = () => options['callback']('verification-token');
        target.expire = () => options['expired-callback']();
        return 'widget';
      },
      reset: () => {
        target.resetCount++;
      },
      remove: () => {},
    };
  });
  let sentToken = '';
  await page.route('**/api/v1/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/turnstile/config'))
      return route.fulfill({ json: { enabled: true, siteKey: 'public-key' } });
    if (path.endsWith('/google/config')) return route.fulfill({ json: { enabled: false } });
    if (path.endsWith('/login')) {
      sentToken = route.request().headers()['x-turnstile-token'];
      return route.fulfill({ status: 401, json: { code: 'INVALID_CREDENTIALS' } });
    }
    return route.fulfill({ status: path.endsWith('/refresh') ? 401 : 200, json: {} });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: 'Đăng nhập', exact: true });
  await dialog.getByText('Xác minh kiểm thử').waitFor();
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('check@example.test');
  await dialog.getByLabel(/^Mật khẩu\s*\*?$/).fill('Valid-password-2026');
  await expect(submit).toBeDisabled();
  await page.evaluate(() => (window as unknown as { solve: () => void }).solve());
  await expect(submit).toBeEnabled();
  await page.evaluate(() => (window as unknown as { expire: () => void }).expire());
  await expect(submit).toBeDisabled();
  await page.evaluate(() => (window as unknown as { solve: () => void }).solve());
  await submit.click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(sentToken).toBe('verification-token');
  await expect(submit).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { resetCount: number }).resetCount)).toBe(
    1,
  );
});

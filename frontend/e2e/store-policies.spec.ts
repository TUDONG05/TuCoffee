import { expect, test } from '@playwright/test';

test('admin publishes and hides a policy that customers can read as text', async ({ page }) => {
  let policy: { id: number; slug: string; title: string; content: string; published: boolean; version: number; imageUrl?: string } | undefined;
  await page.route('**/api/v1/auth/**', route => route.fulfill({ json: route.request().url().endsWith('/refresh') ? {
    accessToken: 'test-token', expiresIn: 900,
    user: { id: 1, name: 'Quản trị', email: 'admin@example.test', role: 'ADMIN', active: true },
  } : {} }));
  await page.route('**/api/v1/admin/policies**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: policy ? [policy] : [] });
      return;
    }
    const body = request.postDataJSON();
    if (request.method() === 'POST') {
      policy = { ...body, id: 1, published: false, version: 0 };
    } else {
      expect(body.version).toBe(policy?.version);
      policy = { ...policy, ...body.policy, id: 1, published: body.published, version: body.version + 1 };
    }
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/admin/policies/1/image?*', async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    if (!policy) throw new Error('Expected a saved policy');
    policy = { ...policy, version: policy.version + 1, imageUrl: '/logo.png' };
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/policies**', route => {
    if (route.request().url().endsWith('/policies')) {
      return route.fulfill({ json: policy?.published ? [{ slug: policy.slug, title: policy.title, imageUrl: policy.imageUrl }] : [] });
    }
    return route.fulfill(policy?.published ? { json: policy } : { status: 404, json: {} });
  });

  await page.goto('/admin/policies');
  await page.getByRole('button', { name: 'Tạo chính sách' }).click();
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Chính sách thử nghiệm');
  await page.getByLabel('Đường dẫn').fill('chinh-sach-thu');
  await page.getByRole('textbox', { name: 'Nội dung', exact: true }).fill('<b>Nội dung chính sách</b>');
  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await expect(page.getByRole('table').getByText('Bản nháp', { exact: true })).toBeVisible();
  await page.goto('/chinh-sach');
  await expect(page.getByText('Chưa có chính sách được công bố.')).toBeVisible();

  await page.goto('/admin/policies');
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles('public/logo.png');
  await expect(page.getByRole('img', { name: 'Ảnh bìa hiện tại' })).toHaveAttribute('src', '/logo.png');
  await page.getByRole('button', { name: 'Đăng chính sách' }).click();
  await expect(page.getByRole('table').getByText('Đang công khai', { exact: true })).toBeVisible();
  await page.goto('/chinh-sach');
  await expect(page.getByRole('link', { name: 'Chính sách thử nghiệm' }).locator('img')).toHaveAttribute('src', '/logo.png');
  await page.getByRole('link', { name: 'Chính sách thử nghiệm' }).click();
  await expect(page.getByText('<b>Nội dung chính sách</b>', { exact: true })).toBeVisible();

  await page.goto('/admin/policies');
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.getByRole('button', { name: 'Ẩn chính sách' }).click();
  await expect(page.getByRole('table').getByText('Bản nháp', { exact: true })).toBeVisible();
  await page.goto('/chinh-sach/chinh-sach-thu');
  await expect(page.getByText('Không tìm thấy chính sách.')).toBeVisible();
});

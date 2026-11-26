import { expect, test } from '@playwright/test';

test('admin uploads multiple documents and previews one after indexing', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route('**/api/v1/auth/**', async route => {
    if (route.request().url().endsWith('/refresh')) {
      await route.fulfill({ json: {
        accessToken: 'test-token',
        expiresIn: 900,
        user: { id: 1, name: 'Quản trị', email: 'admin@example.test', role: 'ADMIN', active: true },
      } });
      return;
    }
    await route.fulfill({ json: {} });
  });

  const api = '/api/v1/admin/knowledge/documents';
  let uploaded = false;
  let enabled = false;
  const uploadedFiles: string[] = [];
  let listReads = 0;
  await page.route(`**${api}**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === api && request.method() === 'POST') {
      expect(request.headers()['content-type']).toContain('multipart/form-data');
      const body = request.postData() ?? '';
      uploadedFiles.push(body.match(/filename="([^"]+)"/)?.[1] ?? '');
      expect(body).not.toContain('name="title"');
      expect(body).toContain('Cà phê sữa');
      uploaded = true;
      await route.fulfill({ status: 202, json: { documentId: 7, versionId: 8, jobId: 9 } });
      return;
    }
    if (path === `${api}/7/preview`) {
      await route.fulfill({ json: { excerpts: ['Cà phê sữa'], truncated: false } });
      return;
    }
    if (path === `${api}/7/enabled` && request.method() === 'PATCH') {
      expect(request.postDataJSON()).toEqual({ enabled: true, version: 1 });
      enabled = true;
      await route.fulfill({ status: 204 });
      return;
    }
    const ready = uploaded && ++listReads > 1;
    const latestVersion = { id: 8, revision: 1, status: ready ? 'READY' : 'UPLOADED',
      originalFilename: 'menu.txt', errorCode: null };
    const doc = { id: 7, title: 'menu.txt', version: ready ? 1 : 0, enabled, chunkCount: ready ? 3 : 0,
      activeVersionId: ready ? 8 : null, latestVersion,
      createdAt: '2026-11-23T12:00:00Z', updatedAt: '2026-11-25T12:00:00Z' };
    await route.fulfill({ json: path === api
      ? { items: uploaded && url.searchParams.get('format') !== 'pdf' ? [doc] : [],
          page: Number(url.searchParams.get('page')), size: 20,
          total: !uploaded || url.searchParams.get('format') === 'pdf' ? 0 : 25 }
      : { ...doc, versions: [latestVersion] } });
  });

  await page.goto('/admin/knowledge');
  await expect(page.getByRole('heading', { name: 'Tài liệu tri thức', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tải lên', exact: true }).click();
  const uploadDialog = page.getByRole('dialog');
  await uploadDialog.getByLabel(/^Tệp TXT/).setInputFiles(
    ['menu.txt', 'bad.csv'].map(name => ({
      name, mimeType: 'text/plain', buffer: Buffer.from('Cà phê sữa'),
    })),
  );
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['Cà phê sữa'], 'policy.md', { type: 'text/markdown' }));
    return transfer;
  });
  await uploadDialog.locator('.upload-dropzone').dispatchEvent('drop', { dataTransfer });
  await expect(uploadDialog.getByText('policy.md', { exact: true })).toBeVisible();
  await uploadDialog.getByRole('button', { name: 'Tải lên', exact: true }).click();
  await expect(page.getByText('Đã tải lên và xếp hàng xử lý 2/3 tệp.')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('bad.csv');
  expect(uploadedFiles).toEqual(['menu.txt', 'policy.md']);
  await expect(page.getByText('Sẵn sàng', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('row').filter({ hasText: 'menu.txt' }).getByRole('cell', { name: '3', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'menu.txt' }).getByRole('cell', { name: /^23\/11\/2026/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeDisabled();
  await page.getByRole('button', { name: 'Xem trước' }).click();
  await expect(page.getByRole('dialog').getByText('Cà phê sữa')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bật nguồn', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bật nguồn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tắt nguồn', exact: true })).toBeVisible();
  const secondPage = page.waitForRequest(request => new URL(request.url()).searchParams.get('page') === '1');
  await page.getByRole('navigation', { name: 'Phân trang tài liệu' }).getByText('2', { exact: true }).click();
  await secondPage;
  const filtered = page.waitForRequest(request => {
    const params = new URL(request.url()).searchParams;
    return params.get('format') === 'pdf' && params.get('page') === '0';
  });
  await page.getByLabel('Định dạng').selectOption('pdf');
  await filtered;
  await expect(page.getByText('Không tìm thấy tài liệu.')).toBeVisible();
});
